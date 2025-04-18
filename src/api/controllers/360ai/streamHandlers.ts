import { PassThrough } from "stream";
import _ from "lodash";
import { createParser } from "eventsource-parser";
import logger from "@/lib/logger.ts";
import util from "@/lib/util.ts";
import { THINKING_MODE } from "./constants.js";
import { createOpenAIResponseFormat } from "./messageUtils.js";

/**
 * 从流接收完整的消息内容
 * 
 * 该函数处理从360NAMI服务器接收的事件流，将其转换为标准格式的完整消息。
 * 它处理不同类型的事件，包括会话ID、消息ID、思考内容和普通内容等。
 *
 * @param model 模型名称 - 用于确定如何处理特定模型的输出（如思考模式、搜索模式等）
 * @param stream 原始消息流 - 从上游服务器接收的事件流
 * @param refSessionId 引用会话ID - 可选，用于关联消息
 * @returns {Promise<Object>} 完整的消息内容对象 - 处理完毕的完整响应
 */
export async function receiveStream(model: string, stream: any, refSessionId?: string): Promise<any> {
  // 初始化各种模式标志
  let thinking = false;
  const isSearchModel = model.includes('search');
  const isThinkingModel = model.includes('think') || model.includes('r1');
  const isSilentModel = model.includes('silent');
  const isFoldModel = model.includes('fold');

  // 记录模型信息和各种模式
  logger.info(`模型: ${model}, 是否思考: ${isThinkingModel} 是否联网搜索: ${isSearchModel}, 是否静默思考: ${isSilentModel}, 是否折叠思考: ${isFoldModel}`);

  // 初始化内容存储变量
  let refContent = '';
  let conversationId = '';
  let messageId = '';

  return new Promise((resolve, reject) => {
    // 初始化消息结构 - 符合OpenAI Chat Completion API格式
    const data = {
      id: "",
      model,
      object: "chat.completion",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "", reasoning_content: "" },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2,
        prompt_tokens_details: {
          cached_tokens: 0
        },
        completion_tokens_details: {
          reasoning_tokens: 0
        },
        prompt_cache_hit_tokens: 0,
        prompt_cache_miss_tokens: 1
      },
      created: util.unixTimestamp(),
      system_fingerprint: `fp_${Math.random().toString(36).substring(2, 10)}_prod${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
      conversation_id: "" // 添加会话ID字段
    };

    // 创建事件解析器 - 处理SSE流
    const parser = createParser((event) => {
      try {
        // 忽略非事件类型数据
        if (event.type !== "event") return;

        // 处理会话ID事件 (事件类型 100)
        if (event.event === "100") {
          const match = event.data.match(/CONVERSATIONID####(.*)/);
          if (match && match[1]) {
            conversationId = match[1];
            logger.info(`会话ID: ${conversationId}`);
            data.conversation_id = conversationId; // 保存会话ID到响应中
          }
          return;
        }

        // 处理消息ID事件 (事件类型 101)
        if (event.event === "101") {
          const match = event.data.match(/MESSAGEID####(.*)/);
          if (match && match[1]) {
            messageId = match[1];
            logger.info(`消息ID: ${messageId}`);
            data.id = messageId;
          }
          return;
        }

        // 处理普通内容事件 (事件类型 200)
        if (event.event === "200") {
          try {
            // 忽略空数据
            if (!event.data || event.data.trim() === "") {
              return;
            }

            // 尝试解析JSON数据，但首先检查数据是否符合JSON格式
            if (event.data.trim().startsWith('{') && event.data.trim().endsWith('}')) {
              try {
                const thoughtData = JSON.parse(event.data);

                // 处理推理文本
                if (thoughtData.type === "reasoning_text") {
                  // 始终将思考内容添加到reasoning_content字段
                  data.choices[0].message.reasoning_content += thoughtData.message;
                  // logger.info(`收到思考内容: ${thoughtData.message.substring(0, 50)}...`);

                  // 在思考模式下，将思考内容作为正常内容流式输出
                  if (isThinkingModel && !isSilentModel) {
                    // 首次思考内容，添加思考开始标记
                    if (!thinking) {
                      thinking = true;
                      // 根据模式选择不同的思考标记
                      data.choices[0].message.content += isFoldModel ?
                        THINKING_MODE.FOLD_TOKEN.START :
                        THINKING_MODE.NORMAL_TOKEN.START;
                    }
                    // 添加思考内容
                    data.choices[0].message.content += thoughtData.message;
                  }
                }
                // 处理推理时长信息 - 用于标记思考结束
                else if (thoughtData.type === "reasoning_duration") {
                  // 如果正在思考且处于思考模式，添加思考结束标记
                  if (thinking && isThinkingModel && !isSilentModel) {
                    thinking = false;
                    data.choices[0].message.content += isFoldModel ?
                      THINKING_MODE.FOLD_TOKEN.END :
                      THINKING_MODE.NORMAL_TOKEN.END;
                  }
                }
              } catch (err) {
                // JSON解析失败，将其作为普通文本处理
                data.choices[0].message.content += event.data;
              }
            } else {
              // 直接作为普通文本处理
              data.choices[0].message.content += event.data;
            }
          } catch (err) {
            logger.error(`处理事件200数据失败: ${err.message}`);
          }
          return;
        }

        // 处理思考内容事件 (事件类型 102)
        if (event.event === "102") {
          try {
            // 忽略空数据
            if (!event.data || event.data.trim() === "") {
              return;
            }
            
            // 解析思考内容
            const thoughtData = JSON.parse(event.data);
            
            // 处理思考文本
            if (thoughtData.type === "reasoning_text") {
              // logger.info(`流模式收到思考内容: ${thoughtData.message.substring(0, 30)}...`);
              
              // 发送思考内容到reasoning_content字段
              data.choices[0].message.reasoning_content += thoughtData.message;
            } 
            // 处理思考结束事件
            else if (thoughtData.type === "reasoning_duration") {
              // 思考结束，标记状态
              thinking = false;
            }
          } catch (err) {
            logger.error(`解析深度思考数据失败: ${err.message}`);
          }
          return;
        }

        // 忽略结束标记
        if (event.data.trim() == "[DONE]") return;

        // 忽略空数据
        if (!event.data || event.data.trim() === "") {
          return;
        }

        // 尝试解析JSON数据
        const result = _.attempt(() => JSON.parse(event.data));
        if (_.isError(result)) {
          logger.warn(`无法解析的事件数据: ${event.data}`);
          return;
        }

        // 验证数据格式是否符合预期
        if (!result.choices || !result.choices[0] || !result.choices[0].delta)
          return;

        // 设置消息ID（如果尚未设置）
        if (!data.id && result.message_id)
          data.id = `${refSessionId}@${result.message_id}`;

        // 处理搜索结果
        if (result.choices[0].delta.type === "search_result" && !isSilentModel) {
          const searchResults = result.choices[0]?.delta?.search_results || [];
          // 收集搜索结果引用
          refContent += searchResults.map(item => `${item.title} - ${item.url}`).join('\n');
          return;
        }

        // 处理思考模式下的折叠状态
        if (isFoldModel && result.choices[0].delta.type === "thinking") {
          // 开始思考
          if (!thinking && isThinkingModel && !isSilentModel) {
            thinking = true;
            data.choices[0].message.content += THINKING_MODE.FOLD_TOKEN.START;
          }
          // 静默模式下不显示思考内容
          if (isSilentModel)
            return;
        }
        // 结束思考
        else if (isFoldModel && thinking && isThinkingModel && !isSilentModel) {
          thinking = false;
          data.choices[0].message.content += THINKING_MODE.FOLD_TOKEN.END;
        }

        // 处理内容增量
        if (result.choices[0].delta.content) {
          // 处理思考内容
          if (result.choices[0].delta.type === "thinking") {
            // 添加思考内容并移除引用标记
            data.choices[0].message.reasoning_content += result.choices[0].delta.content.replace(/\[citation:\d+\]/g, '');
            // 更新思考token计数
            data.usage.completion_tokens_details.reasoning_tokens += result.choices[0].delta.content.length / 4;

            // 只有非折叠模式且非静默模式才添加到正文
            if (!isFoldModel && !isSilentModel) {
              data.choices[0].message.content += result.choices[0].delta.content.replace(/\[citation:\d+\]/g, '');
            }
          } else {
            // 处理普通内容 - 保留换行符，只移除引用标记
            data.choices[0].message.content += result.choices[0].delta.content.replace(/\[citation:\d+\]/g, '');
          }
        }

        // 处理完成标记 - 流结束
        if (result.choices && result.choices[0] && result.choices[0].finish_reason === "stop") {
          // 清理内容，移除引用标记，保留换行符
          data.choices[0].message.content = data.choices[0].message.content
            .replace(/^\n+/, '') // 仅移除开头的换行符
            .replace(/\[citation:\d+\]/g, '') + 
            (refContent ? `\n\n搜索结果来自：\n${refContent}` : '');
          
          // 确保思考内容被保留，但删除日志输出
          // if (data.choices[0].message.reasoning_content) {
          //   logger.info(`包含思考内容，长度: ${data.choices[0].message.reasoning_content.length}`);
          // }
          
          // 返回完整结果
          resolve(data);
        }
      } catch (err) {
        logger.error(err);
        reject(err);
      }
    });

    // 数据流处理
    stream.on("data", (buffer) => parser.feed(buffer.toString()));
    stream.once("error", (err) => reject(err));
    stream.once("close", () => {
      // 流关闭时，如果有内容则返回结果
      if (data.choices[0].message.content) {
        // 清理最终内容，移除引用标记，保留换行符
        data.choices[0].message.content = data.choices[0].message.content
          .replace(/\[citation:\d+\]/g, '') + 
          (refContent ? `\n\n搜索结果来自：\n${refContent}` : '');
        
        // 确保思考内容被保留，但删除日志输出
        // if (data.choices[0].message.reasoning_content) {
        //   logger.info(`流关闭时包含思考内容，长度: ${data.choices[0].message.reasoning_content.length}`);
        // }
        
        resolve(data);
      } else {
        // 如果没有内容，使用默认响应而不是抛出错误
        logger.warn("流关闭但无内容，返回默认响应");
        data.choices[0].message.content = "我是360NAMI AI助手，有什么可以帮助您的？";
        resolve(data);
      }
    });
  });
}

/**
 * 创建转换流
 *
 * 将360NAMI原始流格式转换为OpenAI兼容的流格式，以便客户端能正确处理响应。
 * 转换过程保留原始内容的格式，包括换行符，同时添加必要的元数据。
 *
 * @param model 模型名称 - 用于确定如何处理特定模型的输出
 * @param stream 原始消息流 - 从上游服务器接收的事件流
 * @param refSessionId 引用会话ID - 用于关联消息
 * @param endCallback 传输结束回调 - 可选，在流结束时调用
 * @returns {PassThrough} 转换后的流 - 符合OpenAI格式的事件流
 */
export function createTransStream(model: string, stream: any, refSessionId: string, endCallback?: Function) {
  // 初始化模式标志
  const isSearchModel = model.includes('search');
  const isThinkingModel = model.includes('think') || model.includes('r1');
  const isSilentModel = model.includes('silent');
  const isFoldModel = model.includes('fold');

  // 记录模型信息
  logger.info(`模型: ${model}, 是否思考: ${isThinkingModel}, 是否联网搜索: ${isSearchModel}, 是否静默思考: ${isSilentModel}, 是否折叠思考: ${isFoldModel}`);

  // 创建元数据
  const created = util.unixTimestamp();
  const system_fingerprint = `fp_${Math.random().toString(36).substring(2, 10)}_prod${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

  // 创建转换流
  const transStream = new PassThrough();

  // 初始化状态变量
  let conversationId = '';
  let messageId = '';
  let thinking = false;

  // 发送第一条消息，只包含role字段 - 符合OpenAI流式响应格式
  !transStream.closed &&
    transStream.write(
      `data: ${JSON.stringify({
        id: "",
        model,
        object: "chat.completion.chunk",
        created,
        system_fingerprint,
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              content: null,
              reasoning_content: ""
            },
            logprobs: null,
            finish_reason: null,
          },
        ],
      })}\n\n`
    );

  // 创建事件解析器 - 处理SSE流
  const parser = createParser((event) => {
    try {
      // 忽略非事件类型数据
      if (event.type !== "event") return;

      // 处理会话ID事件 (事件类型 100)
      if (event.event === "100") {
        const match = event.data.match(/CONVERSATIONID####(.*)/);
        if (match && match[1]) {
          conversationId = match[1];
          logger.info(`会话ID: ${conversationId}`);
        }
        return;
      }

      // 处理消息ID事件 (事件类型 101)
      if (event.event === "101") {
        const match = event.data.match(/MESSAGEID####(.*)/);
        if (match && match[1]) {
          messageId = match[1];
          logger.info(`消息ID: ${messageId}`);
        }
        return;
      }

      // 处理普通内容事件 (事件类型 200)
      if (event.event === "200") {
        // 直接传递非空内容，保留原始格式包括换行符
        if (event.data !== "") {
          // 转发内容到客户端，格式符合OpenAI流式响应
          transStream.write(`data: ${JSON.stringify({
            id: messageId || "",
            model: model,
            object: "chat.completion.chunk",
            created,
            system_fingerprint,
            choices: [
              {
                index: 0,
                delta: {
                  content: event.data, // 直接使用原始内容，不做修改
                  reasoning_content: null
                },
                logprobs: null,
                finish_reason: null,
              },
            ],
          })}\n\n`);
        }

        return;
      }

      // 处理思考内容事件 (事件类型 102)
      if (event.event === "102") {
        try {
          // 忽略空数据
          if (!event.data || event.data.trim() === "") {
            return;
          }
          
          // 解析思考内容
          const thoughtData = JSON.parse(event.data);
          
          // 处理思考文本
          if (thoughtData.type === "reasoning_text") {
            //logger.info(`流模式收到思考内容: ${thoughtData.message.substring(0, 30)}...`);
            
            // 发送思考内容到reasoning_content字段
            transStream.write(`data: ${JSON.stringify({
              id: messageId || "",
              model: model,
              object: "chat.completion.chunk",
              created,
              system_fingerprint,
              choices: [
                {
                  index: 0,
                  delta: { 
                    content: isThinkingModel && !isSilentModel ? thoughtData.message : null, // 在思考模式下也直接显示
                    reasoning_content: thoughtData.message // 放入推理内容字段
                  },
                  logprobs: null,
                  finish_reason: null,
                },
              ],
            })}\n\n`);
          } 
          // 处理思考结束事件
          else if (thoughtData.type === "reasoning_duration") {
            // 思考结束，标记状态
            thinking = false;
          }
        } catch (err) {
          logger.error(`解析深度思考数据失败: ${err.message}`);
        }
        return;
      }

      // 忽略结束标记
      if (event.data.trim() == "[DONE]") return;

      // 忽略空数据
      if (!event.data || event.data.trim() === "") {
        return;
      }

      // 解析JSON数据
      const result = _.attempt(() => JSON.parse(event.data));
      if (_.isError(result)) {
        logger.warn(`无法解析的事件数据: ${event.data}`);
        return;
      }

      // 验证数据格式是否符合预期
      if (!result.choices || !result.choices[0] || !result.choices[0].delta)
        return;

      // 设置模型名称
      result.model = model;

      // 处理搜索结果
      if (result.choices[0].delta.type === "search_result" && !isSilentModel) {
        const searchResults = result.choices[0]?.delta?.search_results || [];
        if (searchResults.length > 0) {
          // 格式化搜索结果并发送
          const refContent = searchResults.map(item => `检索 ${item.title} - ${item.url}`).join('\n') + '\n\n';
          transStream.write(`data: ${JSON.stringify({
            id: messageId || `${refSessionId}@${result.message_id}`,
            model: result.model,
            object: "chat.completion.chunk",
            created,
            system_fingerprint,
            choices: [
              {
                index: 0,
                delta: {
                  content: refContent,
                  reasoning_content: null
                },
                logprobs: null,
                finish_reason: null,
              },
            ],
          })}\n\n`);
        }
        return;
      }

      // 忽略没有内容的增量
      if (!result.choices[0].delta.content)
        return;

      // 处理内容增量 - 移除引用标记
      let deltaContent = result.choices[0].delta.content.replace(/\[citation:\d+\]/g, '');

      // 处理不同类型的内容
      if (result.choices[0].delta.type === "thinking") {
        // 思考内容只发送到reasoning_content字段
        transStream.write(`data: ${JSON.stringify({
          id: messageId || `${refSessionId}@${result.message_id}`,
          model: result.model,
          object: "chat.completion.chunk",
          created,
          system_fingerprint,
          choices: [
            {
              index: 0,
              delta: {
                content: null,
                reasoning_content: deltaContent
              },
              logprobs: null,
              finish_reason: null,
            },
          ],
        })}\n\n`);
      } else {
        // 普通内容发送到content字段 - 保留换行符
        transStream.write(`data: ${JSON.stringify({
          id: messageId || `${refSessionId}@${result.message_id}`,
          model: result.model,
          object: "chat.completion.chunk",
          created,
          system_fingerprint,
          choices: [
            {
              index: 0,
              delta: {
                content: deltaContent,
                reasoning_content: null
              },
              logprobs: null,
              finish_reason: null,
            },
          ],
        })}\n\n`);
      }

      // 处理流结束事件
      if (result.choices && result.choices[0] && result.choices[0].finish_reason === "stop") {
        // 发送结束标记
        transStream.write(`data: ${JSON.stringify({
          id: messageId || `${refSessionId}@${result.message_id}`,
          model: result.model,
          object: "chat.completion.chunk",
          created,
          system_fingerprint,
          choices: [
            {
              index: 0,
              delta: {},
              logprobs: null,
              finish_reason: "stop"
            },
          ],
        })}\n\n`);
        // 结束流并调用回调
        !transStream.closed && transStream.end("data: [DONE]\n\n");
        endCallback && endCallback();
      }
    } catch (err) {
      logger.error(err);
      // 错误情况下结束流
      !transStream.closed && transStream.end("data: [DONE]\n\n");
    }
  });

  // 数据流处理
  stream.on("data", (buffer) => parser.feed(buffer.toString()));
  stream.once(
    "error",
    () => !transStream.closed && transStream.end("data: [DONE]\n\n")
  );
  stream.once(
    "close",
    () => {
      // 流关闭时发送结束事件
      if (!transStream.closed) {
        // 发送结束标记
        transStream.write(`data: ${JSON.stringify({
          id: messageId || "",
          model: model,
          object: "chat.completion.chunk",
          created,
          system_fingerprint,
          choices: [
            {
              index: 0,
              delta: {},
              logprobs: null,
              finish_reason: "stop"
            },
          ],
        })}\n\n`);
        // 结束流
        transStream.end("data: [DONE]\n\n");
      }
      // 调用回调
      endCallback && endCallback();
    }
  );

  return transStream;
}

/**
 * 创建流式Ping响应
 * 
 * 用于心跳检测响应，返回简单的pong消息流。
 * 遵循与正常响应相同的格式，但内容简化为pong。
 * 
 * @param model 模型名称 - 用于响应中的模型标识
 * @returns {PassThrough} Ping响应流 - 格式化的事件流
 */
export function createPingStream(model: string): PassThrough {
  // 创建转换流
  const transStream = new PassThrough();
  const created = util.unixTimestamp();
  const responseId = `ping-${util.timestamp()}`;

  // 1. 发送角色信息
  transStream.write(
    `data: ${JSON.stringify({
      id: responseId,
      model,
      object: "chat.completion.chunk",
      choices: [
        {
          index: 0,
          delta: { role: "assistant" },
          finish_reason: null,
        },
      ],
      created,
    })}\n\n`
  );

  // 2. 发送内容
  transStream.write(
    `data: ${JSON.stringify({
      id: responseId,
      model,
      object: "chat.completion.chunk",
      choices: [
        {
          index: 0,
          delta: { content: "pong" },
          finish_reason: null,
        },
      ],
      created,
    })}\n\n`
  );

  // 3. 发送结束信息
  transStream.write(
    `data: ${JSON.stringify({
      id: responseId,
      model,
      object: "chat.completion.chunk",
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: "stop",
        },
      ],
      created,
    })}\n\n`
  );

  // 4. 发送[DONE]标记结束流
  transStream.end("data: [DONE]\n\n");
  return transStream;
}