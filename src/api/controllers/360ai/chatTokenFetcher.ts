import axios from 'axios';
import logger from '@/lib/logger.ts';

/**
 * 从远程服务器获取CHAT_TOKEN_JS
 * @returns {Promise<string>} CHAT_TOKEN_JS内容
 */
export async function fetchChatTokenJs(auth: any): Promise<string> {
  try {
    const response = await axios.get('https://bot.n.cn/js/chatsdk-1.0.js', {
      headers: {
        'Host': 'bot.n.cn',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:138.0) Gecko/20100101 Firefox/138.0',
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
        'Connection': 'keep-alive',
        'Referer': 'https://bot.n.cn/',
        'Sec-Fetch-Dest': 'script',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'same-origin',
        'Cookie': auth.COOKIE
      }
    });

    if (response.status === 200 && response.data) {
      // logger.debug('成功获取CHAT_TOKEN_JS：',response.data);
      
      // 执行JavaScript代码以提取数组内容
      const scriptContent = response.data;

      // 使用正则表达式提取数组
      const arrays = scriptContent.match(/\[(.*?)\]/g);
      const array_str = arrays[3];
      //logger.debug("array_str:",array_str);

      const array = eval(array_str);
      //logger.debug("array:",array);
            
      const decodedStr = array.map(r => String.fromCharCode(r)).join('');
      // logger.debug("decodedStr:",decodedStr);
      
      // Base64解码
      const CHAT_TOKEN_JS = Buffer.from(decodedStr, 'base64').toString('utf-8');
      // logger.debug("finalToken:",CHAT_TOKEN_JS);
      
      return CHAT_TOKEN_JS;
    }

    throw new Error(`获取CHAT_TOKEN_JS失败: HTTP ${response.status}`);
  } catch (error) {
    logger.error('获取CHAT_TOKEN_JS出错:', error);
    throw error;
  }
}