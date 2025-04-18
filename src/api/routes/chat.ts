import _ from 'lodash';

import Request from '@/lib/request/Request.ts';
import Response from '@/lib/response/Response.ts';
import chat from '@/api/controllers/chat.ts';
import process from "process";
import { getNextAuth } from '@/api/controllers/360ai/authManager.ts';

export default {

    prefix: '/v1/chat',

    post: {

        '/completions': async (request: Request) => {
            request
                .validate('body.conversation_id', v => _.isUndefined(v) || _.isString(v))
                .validate('body.messages', _.isArray)
                .validate('headers.authorization', _.isString)


            // 获取全局轮询的认证信息
            const auth = getNextAuth();
            let { model, conversation_id: convId, messages, stream } = request.body;
            model = model.toLowerCase();
            if (stream) {
                const stream = await chat.createCompletionStream(model, messages, auth, convId);
                return new Response(stream, {
                    type: "text/event-stream"
                });
            }
            else
                return await chat.createCompletion(model, messages, auth, convId);
        }

    }

}