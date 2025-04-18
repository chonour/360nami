import APIException from "@/lib/exceptions/APIException.ts";
import EX from "@/api/consts/exceptions.ts";

/**
 * 消息预处理
 *
 * 将多条消息以对话形式合并为一条，实现多轮对话效果
 * 完全符合 OpenAI API 规范的消息格式处理
 *
 * @param messages 参考gpt系列消息格式，多轮对话请完整提供上下文
 * @returns {string} 处理后的消息文本
 */
export function messagesPrepare(messages: any[]): string {
  if (!Array.isArray(messages) || messages.length === 0) return '';

  // 处理消息内容
  const processedMessages = messages.map(message => {
    // 验证消息格式
    if (!message || typeof message !== 'object') {
      throw new APIException(EX.API_REQUEST_FAILED, "Invalid message format");
    }
    
    if (!message.role || !['user', 'assistant', 'system'].includes(message.role)) {
      throw new APIException(EX.API_REQUEST_FAILED, "Invalid message role");
    }

    let text: string;
    // 处理 OpenAI API 规范中的各种内容格式
    if (Array.isArray(message.content)) {
      // 处理多模态内容数组
      const texts = message.content
        .filter((item: any) => {
          // 支持文本和图像内容
          return (item.type === "text") || 
                 (item.type === "image" && typeof item.image_url === "object" && item.image_url.url);
        })
        .map((item: any) => {
          if (item.type === "text") return item.text;
          if (item.type === "image") return `![image](${item.image_url.url})`;
          return "";
        });
      text = texts.join('\n');
    } else if (typeof message.content === 'string') {
      // 处理普通文本内容
      text = message.content;
    } else if (message.content === null || message.content === undefined) {
      // 处理空内容
      text = "";
    } else {
      // 处理其他情况
      text = String(message.content);
    }

    // 处理可选字段
    const name = message.name ? `[${message.name}] ` : '';
    
    return { 
      role: message.role, 
      text: name + text,
      function_call: message.function_call
    };
  });

  // 构建对话序列
  let result = '';
  
  // 处理所有消息，按顺序构建对话流
  for (let i = 0; i < processedMessages.length; i++) {
    const message = processedMessages[i];
    
    if (message.role === 'assistant') {
      // 助手消息添加特殊标记
      if (message.function_call) {
        result += `\n<｜Assistant｜>\nFunction call: ${JSON.stringify(message.function_call)}\n<｜end▁of▁sentence｜>`;
      } else {
        result += `\n<｜Assistant｜>\n${message.text}\n<｜end▁of▁sentence｜>`;
      }
    } else {
      // 用户和系统消息直接添加，确保有换行分隔
      if (result && !result.endsWith('\n')) {
        result += '\n';
      }
      result += message.text;
    }
  }

  // 清理格式并规范化空白
  return result
    .replace(/\!\[.+\]\(.+\)/g, "") // 移除图片标记
    .replace(/\n{3,}/g, "\n\n")     // 规范化连续换行
    .replace(/\s+$/gm, "")          // 移除行尾空白
    .trim();
}

/**
 * 生成完全符合OpenAI响应格式的结构
 * @param messageId 消息ID
 * @param modelName 模型名称
 * @param content 内容
 * @param reasoningContent 思考内容
 * @returns {Object} OpenAI格式的响应对象
 */
export function createOpenAIResponseFormat(messageId: string, modelName: string, content: string, reasoningContent: string = "") {
  return {
    id: messageId || `chatcmpl-${Date.now()}`,
    model: modelName,
    object: "chat.completion",
    choices: [
      {
        index: 0,
        message: { 
          role: "assistant", 
          content: content || "", 
          reasoning_content: reasoningContent || "" 
        },
        finish_reason: "stop",
      },
    ],
    usage: { 
      prompt_tokens: Math.ceil((content.length || 1) / 4), 
      completion_tokens: Math.ceil((content.length || 1) / 4), 
      total_tokens: Math.ceil((content.length || 1) / 2),
      prompt_tokens_details: {
        cached_tokens: 0
      },
      completion_tokens_details: {
        reasoning_tokens: Math.ceil((reasoningContent.length || 0) / 4)
      },
      prompt_cache_hit_tokens: 0,
      prompt_cache_miss_tokens: Math.ceil((content.length || 1) / 4)
    },
    created: Math.floor(Date.now() / 1000),
    system_fingerprint: `fp_${Math.random().toString(36).substring(2, 10)}_prod${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`
  };
} 