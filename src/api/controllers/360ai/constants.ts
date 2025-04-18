/**
 * 360NAMI API 常量定义
 */

// 模型名称
export const MODEL_NAME = "deepseek-chat";

// 最大重试次数
export const MAX_RETRY_COUNT = 3;

// 重试延迟 (毫秒)
export const RETRY_DELAY = 5000;

// user-agent
export const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:138.0) Gecko/20100101 Firefox/138.0";

// 伪装headers
export const FAKE_HEADERS = {
  "Host": "bot.n.cn",
  "user-agent": USER_AGENT,
  "accept": "text/event-stream",
  "accept-language": "zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2",
  "referer": "https://bot.n.cn/chat/nyuqYEQU4qoDpsN3lCuLB",
  "device-platform": "Web",
  "zm-ver": "1.2",
  "func-ver": "1",
  "content-type": "application/json",
  "mid": "",
  "origin": "https://bot.n.cn",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "priority": "u=4",
  "te": "trailers",
};

// API 路径
export const API_ENDPOINTS = {
  CHAT: "/api/assistant/chat",
  REMOVE_CONVERSATION: "/api/batch/remove/conversation"
};


// 默认设置（仅保留超时和角色，认证信息通过authManager动态获取）
export const DEFAULT_SETTINGS = {
  TIMEOUT: 120000, // 120秒超时
  ROLE: "a0c817f8d3f097b5263048b29bfb5737"
};

// 思考模式配置 
export const THINKING_MODE = {
  FOLD_TOKEN: {
    START: "\n<details><summary>思考过程</summary>\n\n",
    END: "\n\n</details>\n"
  },
  NORMAL_TOKEN: {
    START: "\n\n[思考开始]\n",
    END: "\n\n[思考结束]\n"
  }
};