import { PassThrough } from "stream";
import axios, { AxiosResponse } from "axios";
import _ from "lodash";
import { createParser } from "eventsource-parser";

import APIException from "@/lib/exceptions/APIException.ts";
import EX from "@/api/consts/exceptions.ts";
import logger from "@/lib/logger.ts";
import util from "@/lib/util.ts";

import { MODEL_NAME, MAX_RETRY_COUNT, RETRY_DELAY, FAKE_HEADERS, API_ENDPOINTS, DEFAULT_SETTINGS } from "./constants.js";
import { generateAuthHeaders } from "./auth.js";
import { getNextAuth } from "./authManager.js";
import { messagesPrepare, createOpenAIResponseFormat } from "./messageUtils.js";
import { receiveStream, createTransStream, createPingStream } from "./streamHandlers.js";

/**
 * 获取模型角色ID
 * 
 * 根据输入的模型名称字符串，提取有效的模型ID作为角色标识
 * 如果模型名称符合特定格式(xxx-xxx-xxx)且第一部分是32位哈希值，则使用该哈希值作为模型ID
 * 否则使用默认的角色ID
 * 
 * @param model 模型名称字符串，可能包含模型ID
 * @param role 默认角色ID，当无法从model中提取有效ID时使用
 * @returns {string} 处理后的模型角色ID
 */
function get_role(model: string, defaultRole: string): string {
  /**
   * 检查是否为有效的32位模型ID
   * @param str 待检查的字符串
   * @returns {boolean} 是否为有效的32位模型ID
   */
  const isValidModelId = (str: string): boolean => /^[a-f0-9]{32}$/i.test(str.trim());

  // 如果模型名称不包含连字符，直接返回默认角色
  if (!model.includes('-')) return defaultRole;

  // 提取模型名称第一部分并检查是否为有效ID
  const [potentialModelId] = model.split('-');
  return isValidModelId(potentialModelId) ? potentialModelId.trim() : defaultRole;
}

/**
 * 检查请求结果
 *
 * @param result 结果
 * @param refreshToken 用于刷新access_token的refresh_token
 * @returns {Object|null} 处理后的结果
 */
function checkResult(result: AxiosResponse, refreshToken: string) {
  if (!result.data) return null;
  const { code, data, msg } = result.data;
  if (!_.isFinite(code)) return result.data;
  if (code === 0) return data;
  throw new APIException(EX.API_REQUEST_FAILED, `[请求360nami失败]: ${msg}`);
}

/**
 * 删除对话
 * 
 * 调用360NAMI API删除指定的对话
 * 
 * @param conversationId 对话ID
 * @returns {Promise<boolean>} 删除是否成功
 */
async function removeConversation(conversationId: string, auth: any): Promise<boolean> {
  if (!conversationId) {
    logger.warn('无法删除对话：对话ID为空');
    return false;
  }

  try {
    logger.info(`删除对话: ${conversationId}`);

    // 准备请求头部信息
    const authHeaders = await generateAuthHeaders(
      auth.ACCESS_TOKEN,
      auth,
      API_ENDPOINTS.REMOVE_CONVERSATION
    );

    // 调用删除对话API
    const result = await axios.post(
      "https://bot.n.cn" + API_ENDPOINTS.REMOVE_CONVERSATION,
      `cid=${conversationId}`,
      {
        headers: {
          ...FAKE_HEADERS,
          "Cookie": auth.COOKIE,
          ...authHeaders,
          "sid": auth.ACCESS_TOKEN,
          "auth-token": auth.AUTH_TOKEN,
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8"
        },
        validateStatus: () => true,
      }
    );

    if (result.status === 200) {
      logger.success(`对话删除成功: ${conversationId}`);
      return true;
    } else {
      logger.error(`对话删除失败: ${conversationId}, 状态码: ${result.status}`);
      logger.error(result.data);
      return false;
    }
  } catch (err) {
    logger.error(`删除对话出错: ${err.message}`);
    return false;
  }
}

/**
 * 同步对话补全
 *
 * @param model 模型名称
 * @param messages 参考gpt系列消息格式，多轮对话请完整提供上下文
 * @param refreshToken 用于刷新access_token的refresh_token
 * @param auth 认证信息
 * @param retryCount 重试次数
 * @returns {Promise<Object>} 对话补全结果
 */
async function createCompletion(
  model = MODEL_NAME,
  messages: any[],
  auth: any,
  refConvId?: string,
  retryCount = 0
) {
  return (async () => {
    // 特殊处理：ping-pong 模式
    if (messages.length === 1 &&
      messages[0].role === 'user' &&
      (messages[0].content === 'ping' || messages[0].content?.trim().toLowerCase() === 'ping')) {
      logger.info('收到ping请求，直接返回pong');
      // 构造标准OpenAI API格式的响应
      return {
        id: `ping-${util.timestamp()}`,
        model,
        object: "chat.completion",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "pong"
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        created: util.unixTimestamp(),
      };
    }

    logger.info(messages);

    // 如果引用对话ID不正确则重置引用
    if (!/[0-9a-z\-]{36}@[0-9]+/.test(refConvId))
      refConvId = null;

    // 消息预处理
    const prompt = messagesPrepare(messages);

    // 解析引用对话ID
    const [refSessionId, refParentMsgId] = refConvId?.split('@') || [];

    const isSearchModel = model.includes('search') || prompt.includes('联网搜索');
    // 修正思考模式设置 - 1表示不思考，0表示思考
    const isThinkingModel = (model.includes('think') || model.includes('r1') || prompt.includes('深度思考'));
    const role_mode = isThinkingModel ? 0 : 1; // 0:思考模式 1:非思考模式

    // 准备请求头部信息
    const authHeaders = await generateAuthHeaders(
      auth.ACCESS_TOKEN,
      auth,
      API_ENDPOINTS.CHAT
    );

    const headers = {
      ...FAKE_HEADERS,
      "Cookie": auth.COOKIE,
      ...authHeaders,
      "sid": auth.ACCESS_TOKEN,
      "auth-token": auth.AUTH_TOKEN
    };

    const result = await axios.post(
      "https://bot.n.cn" + API_ENDPOINTS.CHAT,
      {
        role: get_role(model, DEFAULT_SETTINGS.ROLE),
        prompt: prompt,
        re_answer: 0,
        retry: false,
        last_id: 0,
        compare_parent_id: "",
        role_biz: "",
        firm_id: "",
        rewrite_type: "",
        annex_msg_id: "",
        kwargs: {
          think_stream: true
        },
        is_so: isSearchModel,
        role_mode: role_mode
      },
      {
        headers,
        // 超时设置
        timeout: DEFAULT_SETTINGS.TIMEOUT,
        validateStatus: () => true,
        responseType: "stream",
      }
    );

    if (result.headers["content-type"].indexOf("text/event-stream") == -1) {
      result.data.on("data", buffer => logger.error(buffer.toString()));
      throw new APIException(
        EX.API_REQUEST_FAILED,
        `Stream response Content-Type invalid: ${result.headers["content-type"]}`
      );
    }

    const streamStartTime = util.timestamp();
    // 接收流为输出文本
    const answer = await receiveStream(model, result.data, refSessionId);
    logger.success(
      `Stream has completed transfer ${util.timestamp() - streamStartTime}ms`
    );

    // 获取对话ID并删除对话
    if (answer && answer.conversation_id) {
      removeConversation(answer.conversation_id, auth).catch(err => {
        logger.error(`删除对话出错: ${err.message}`);
      });
    }

    return answer;
  })().catch((err) => {
    if (retryCount < MAX_RETRY_COUNT) {
      logger.error(`Stream response error: ${err.stack}`);
      logger.warn(`将在${RETRY_DELAY / 1000}秒后重试...`);
      return (async () => {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        return createCompletion(
          model,
          messages,
          auth,
          refConvId,
          retryCount + 1
        );
      })();
    }
    throw err;
  });
}

/**
 * 流式对话补全
 *
 * @param model 模型名称
 * @param messages 参考gpt系列消息格式，多轮对话请完整提供上下文
 * @param auth 认证信息
 * @param refConvId 引用对话ID
 * @param retryCount 重试次数
 * @returns {Promise<PassThrough>} 流式对话补全结果
 */
async function createCompletionStream(
  model = MODEL_NAME,
  messages: any[],
  auth: any,
  refConvId?: string,
  retryCount = 0
) {
  return (async () => {
    // 特殊处理：ping-pong 模式
    if (messages.length === 1 &&
      messages[0].role === 'user' &&
      (messages[0].content === 'ping' || messages[0].content?.trim().toLowerCase() === 'ping')) {
      logger.info('收到ping流请求，直接返回pong');
      return createPingStream(model);
    }

    logger.info(messages);

    // 如果引用对话ID不正确则重置引用
    if (!/[0-9a-z\-]{36}@[0-9]+/.test(refConvId))
      refConvId = null;

    // 消息预处理
    const prompt = messagesPrepare(messages);

    // 解析引用对话ID
    const [refSessionId, refParentMsgId] = refConvId?.split('@') || [];

    const isSearchModel = model.includes('search') || prompt.includes('联网搜索');
    // 修正思考模式设置 - 1表示不思考，0表示思考
    const isThinkingModel = (model.includes('think') || model.includes('r1') || prompt.includes('深度思考'));
    const role_mode = isThinkingModel ? 0 : 1; // 0:思考模式 1:非思考模式

    // 准备请求头部信息
    const authHeaders = await generateAuthHeaders(
      auth.ACCESS_TOKEN,
      auth,
      API_ENDPOINTS.CHAT
    );

    const headers = {
      ...FAKE_HEADERS,
      "Cookie": auth.COOKIE,
      ...authHeaders,
      "sid": auth.ACCESS_TOKEN,
      "auth-token": auth.AUTH_TOKEN
    };

    const result = await axios.post(
      "https://bot.n.cn" + API_ENDPOINTS.CHAT,
      {
        role: get_role(model, DEFAULT_SETTINGS.ROLE),
        prompt: prompt,
        re_answer: 0,
        retry: false,
        last_id: 0,
        compare_parent_id: "",
        role_biz: "",
        firm_id: "",
        rewrite_type: "",
        annex_msg_id: "",
        kwargs: {
          think_stream: true
        },
        is_so: isSearchModel,
        role_mode: role_mode
      },
      {
        headers,
        // 超时设置
        timeout: DEFAULT_SETTINGS.TIMEOUT,
        validateStatus: () => true,
        responseType: "stream",
      }
    );

    if (result.headers["content-type"].indexOf("text/event-stream") == -1) {
      logger.error(
        `Invalid response Content-Type:`,
        result.headers["content-type"]
      );
      throw new APIException(
        EX.API_REQUEST_FAILED,
        `Stream response Content-Type invalid: ${result.headers["content-type"]}`
      );
    }

    // 保存可能的对话ID
    let conversationId: string | null = null;

    // 创建回调函数，在流结束时删除对话
    const endCallback = () => {
      if (conversationId) {
        removeConversation(conversationId, auth).catch(err => {
          logger.error(`删除对话出错: ${err.message}`);
        });
      }
    };

    // 监听事件流中的会话ID
    const parser = createParser((event) => {
      try {
        if (event.type !== "event") return;

        // 处理会话ID事件
        if (event.event === "100") {
          const match = event.data.match(/CONVERSATIONID####(.*)/);
          if (match && match[1]) {
            conversationId = match[1];
            logger.info(`流式响应会话ID: ${conversationId}`);
          }
        }
      } catch (error) {
        logger.error(`解析会话ID时出错: ${error.message}`);
      }
    });

    // 复制数据流以解析会话ID
    const dupStream = new PassThrough();
    result.data.pipe(dupStream);
    dupStream.on("data", (buffer) => parser.feed(buffer.toString()));

    // 创建用于客户端的转换流
    return createTransStream(model, result.data, refSessionId, endCallback);
  })().catch((err) => {
    if (retryCount < MAX_RETRY_COUNT) {
      logger.warn(`Stream response error: ${err.message}`);
      logger.warn(`将在${RETRY_DELAY / 1000}秒后重试...`);
      return (async () => {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        return createCompletionStream(
          model,
          messages,
          auth,
          refConvId,
          retryCount + 1
        );
      })();
    }
    throw err;
  });
}

// 导出函数
export { createCompletion, createCompletionStream, removeConversation };