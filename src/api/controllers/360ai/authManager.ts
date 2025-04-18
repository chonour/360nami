/**
 * 认证信息管理模块：从环境变量读取多组认证信息，并提供轮询分配接口
 * 环境变量格式示例：
 *   NAMI_AUTH_LIST=[{"COOKIE":"xxx","ACCESS_TOKEN":"xxx","AUTH_TOKEN":"xxx"},...]
 * 或
 *   NAMI_AUTH_LIST=COOKIE=xxx1;ACCESS_TOKEN=xxx1;AUTH_TOKEN=xxx1|COOKIE=xxx2;ACCESS_TOKEN=xxx2;AUTH_TOKEN=xxx2
 */

import logger from "@/lib/logger.ts";

interface AuthInfo {
  COOKIE: string;
  ACCESS_TOKEN: string;
  AUTH_TOKEN: string;
  CHAT_TOKEN_JS: string; // CHAT_TOKEN算法js代码，用于计算CHAT_TOKEN，如果首次请求没有CHAT_TOKEN_JS，会自动通过请求远程服务器得到并填充
}

let authList: AuthInfo[] = [];
let currentIndex = 0;

function parseEnvAuthList(): AuthInfo[] {
  const env = process.env.NAMI_AUTH_LIST;
  if (!env) throw new Error("请通过环境变量 NAMI_AUTH_LIST 配置认证信息");
  try {
    // 优先尝试JSON格式
    const arr = JSON.parse(env);
    if (Array.isArray(arr)) {
      return arr.filter(item => item.COOKIE && item.ACCESS_TOKEN && item.AUTH_TOKEN);
    }
  } catch {
    // 尝试分隔符格式：每组用|分隔，组内用;分隔
    return env.split('|').map(group => {
      const obj: any = {};
      group.split(';').forEach(pair => {
        const [k, v] = pair.split('=');
        if (k && v) obj[k.trim()] = v.trim();
      });
      return obj;
    }).filter(item => item.COOKIE && item.ACCESS_TOKEN && item.AUTH_TOKEN);
  }
  throw new Error("NAMI_AUTH_LIST 格式错误，请参考文档");
}

function getAuthList(): AuthInfo[] {
  if (authList.length === 0) {
    authList = parseEnvAuthList();
    if (authList.length === 0) throw new Error("未检测到有效的认证信息");
  }
  return authList;
}

export function getNextAuth(): AuthInfo {
  const list = getAuthList();
  const auth = list[currentIndex];
  logger.success(`使用第${currentIndex + 1}组认证信息：${auth.ACCESS_TOKEN}`);
  currentIndex = (currentIndex + 1) % list.length;
  return auth;
}

// 可选：重置轮询索引
export function resetAuthIndex() {
  currentIndex = 0;
}