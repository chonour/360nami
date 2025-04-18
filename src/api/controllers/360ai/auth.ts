import { createHash, createHmac } from 'crypto';
import logger from '@/lib/logger.ts';
import { USER_AGENT } from "./constants.js";
import { fetchChatTokenJs } from './chatTokenFetcher.js';

/**
 * 生成请求ID函数
 * @returns {string} 生成的请求ID
 */
export function generateRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Base64编码函数
 * @param {string} str 需要编码的字符串
 * @returns {string} Base64编码后的字符串
 */
export function aiso_base64(str: string): string {
  return Buffer.from(str).toString('base64');
}

/**
 * MD5哈希函数
 * @param {string} str 需要哈希的字符串
 * @returns {string} MD5哈希后的字符串
 */
export function aiso_md5(str: string): string {
  return createHash('md5').update(str).digest('hex');
}

/**
 * SHA1哈希函数
 * @param {string} str 需要哈希的字符串
 * @returns {string} SHA1哈希后的字符串
 */
export function aiso_sha1(str: string): string {
  return createHash('sha1').update(str).digest('hex');
}

/**
 * HMAC-SHA256哈希函数
 * @param {string} str 需要哈希的字符串
 * @param {string} secret 密钥
 * @returns {string} HMAC-SHA256哈希后的字符串
 */
export function aiso_h256(str: string, secret: string): string {
  return createHmac('sha256', secret).update(str).digest('hex');
}

/**
 * AES加密函数
 * @param {string} str 需要加密的字符串
 * @param {string} secret 密钥
 * @returns {string} AES加密后的Base64字符串
 */
export function aiso_aes(str: string, secret: string): string {
  const crypto = require('crypto');
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = Buffer.alloc(16, 0); // 使用全零IV，需根据实际安全需求调整
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(str, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return encrypted;
}

/**
 * 生成ChatToken
 * @param {string} uri API路径
 * @param {string} prompt 请求内容
 * @param {string} accessToken 访问令牌
 * @param {string} date 请求日期，可选
 * @returns {string} 生成的ChatToken
 */
export function createChatToken(uri: string, auth: any, accessToken: string, date?: string): string {
  const method = "POST";
  const httpVersion = "HTTP/1.1";

  logger.debug("URI:", uri);
  logger.debug("AccessToken:", accessToken);
  logger.debug("Date:", date);

  // 如果auth中没有CHAT_TOKEN_JS，则请求远程服务器获取
  if (!auth.CHAT_TOKEN_JS) {
    throw new Error("CHAT_TOKEN_JS不存在，请先调用异步方法fetchChatTokenJs获取");
  }
  
  if (typeof auth.CHAT_TOKEN_JS !== 'string') {
    throw new Error(`CHAT_TOKEN_JS类型错误: ${typeof auth.CHAT_TOKEN_JS}`);
  }
  
  // logger.debug("CHAT_TOKEN_JS信息:", auth.CHAT_TOKEN_JS);

  // 运行js代码，获得chat_token结果
  const chatTokenResult = eval(auth.CHAT_TOKEN_JS)({
    method: method,
    uri: uri,
    access_token: accessToken,
    http_version: httpVersion,
    date: date
  })
  const chat_token = chatTokenResult.token;
  logger.debug("计算出的结果:", chat_token);

  // // 使用提供的日期或生成当前日期
  // if (!date) {
  //   date = new Date().toUTCString();
  // }

  // // 构造初始token字符串
  // let token = `${method} ${uri} ${httpVersion} date: ${date}`;

  // // 按照分析的流程生成token
  // token = aiso_md5(token);

  // // 三次SHA1哈希
  // token = aiso_sha1(token);
  // token = aiso_sha1(token);
  // token = aiso_sha1(token);

  // // Base64编码
  // token = aiso_base64(token);

  // // SHA1哈希
  // token = aiso_sha1(token);

  // // Base64编码
  // token = aiso_base64(token);

  // // 三次SHA1哈希
  // token = aiso_sha1(token);
  // token = aiso_sha1(token);
  // token = aiso_sha1(token);

  // // 打印生成的token
  // logger.debug("Generated Token:", token);

  // // 添加固定后缀
  // const suffix = "D1ZO6aDo4et7tToBONNmu4=/-ttrj02Dv6uzFB8G6WuzrMSaOFu6b5pzb0jSmqLHcFpHrWzpls8J0ACroyjLjKWSS0SuJtZaAYjyJyImcxaM3k2fUjM3SYwM9S6iIzA+hRlfFQ=";
  // token = token + suffix

  // // 打印最终生成的token
  // logger.debug("最终Token:", token);

  return chat_token;
}

/**
 * 生成请求所需的认证头信息
 * @param {string} accessToken 访问令牌
 * @param {string} prompt 请求内容
 * @param {string} uri API路径
 * @returns {Object} 包含所有认证信息的头部对象
 */
export async function generateAuthHeaders(accessToken: string, auth: any, uri: string) {
  // 生成chat-date，格式为RFC标准日期
  const chatDate = new Date().toUTCString();
  // 打印chat-date
  logger.debug("chat-date:", chatDate); // 打印chat-date，格式为RFC标准日期，如：Fri, 17 Jan 2024 09:30:42 GMT

  // 生成时间戳，格式为自定义时间格式
  const timestamp = new Date().toISOString()
    .replace(/\.\d+Z$/, '+08:00');  // 移除毫秒并替换时区
  logger.debug("timestamp:", timestamp);

  // 生成用户代理MD5
  // 需要先导入cconstants
  const zmUa = createHash('md5').update(USER_AGENT).digest('hex');
  logger.debug("zmUa:", zmUa);

  // 生成token
  const zmToken = createHash('md5').update('Web' + timestamp + '1.2' + accessToken + zmUa).digest('hex');
  logger.debug("zmToken:", zmToken);

  // 如果auth中没有CHAT_TOKEN_JS，则请求远程服务器获取
  if (!auth.CHAT_TOKEN_JS) {
    try {
      logger.debug("开始获取CHAT_TOKEN_JS");
      auth.CHAT_TOKEN_JS = await fetchChatTokenJs(auth);
    } catch (error) {
      throw new Error(`获取CHAT_TOKEN_JS失败: ${error.message}`);
    }
  }

  // 确保 CHAT_TOKEN_JS 是字符串类型
  if (typeof auth.CHAT_TOKEN_JS !== 'string') {
    auth.CHAT_TOKEN_JS = await auth.CHAT_TOKEN_JS;
  }

  // 生成chat-token
  const chatToken = createChatToken(uri, auth, accessToken, chatDate);
  // logger.debug("chatToken:", chatToken);

  return {
    "chat-date": chatDate,
    "chat-token": chatToken,
    "timestamp": timestamp,
    "access-token": accessToken,
    "zm-token": zmToken,
    "zm-ua": zmUa,
    "request-id": generateRequestId(),
  };
}

