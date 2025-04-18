import APIException from "@/lib/exceptions/APIException.ts";
import EX from "@/api/consts/exceptions.ts";
import logger from "@/lib/logger.ts";
import util from "@/lib/util.ts";

// 导入重构后的360NAMI API模块
import { createCompletion as dsCreateCompletion, createCompletionStream as dsCreateCompletionStream, removeConversation as dsRemoveConversation } from "./360ai/completions.js";
import { MODEL_NAME } from "./360ai/constants.js";

/**
 * 同步对话补全
 *
 * @param model 模型名称
 * @param messages 参考gpt系列消息格式，多轮对话请完整提供上下文
 * @param auth 认证信息
 * @param refConvId 引用对话ID
 * @param retryCount 重试次数
 */
async function createCompletion(
  model = MODEL_NAME,
  messages: any[],
  auth: any,
  refConvId?: string,
  retryCount = 0
) {
  return dsCreateCompletion(
    model,
    messages,
    auth,
    refConvId,
    retryCount
  );
}

/**
 * 流式对话补全
 *
 * @param model 模型名称
 * @param messages 参考gpt系列消息格式，多轮对话请完整提供上下文
 * @param auth 认证信息
 * @param refConvId 引用对话ID
 * @param retryCount 重试次数
 */
async function createCompletionStream(
  model = MODEL_NAME,
  messages: any[],
  auth: any,
  refConvId?: string,
  retryCount = 0
) {
  return dsCreateCompletionStream(
    model,
    messages,
    auth,
    refConvId,
    retryCount
  );
}


/**
 * 删除对话
 * 
 * @param conversationId 对话ID
 * @returns {Promise<boolean>} 删除是否成功
 */
async function removeConversation(conversationId: string, auth: any): Promise<boolean> {
  return dsRemoveConversation(conversationId, auth);
}

export default {
  createCompletion,
  createCompletionStream,
  removeConversation
};
