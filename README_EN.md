# 360Nami API Service

<span>[ <a href="README.md">中文</a> | English ]</span>

## Project Introduction

This project is a 360Nami API service that provides interaction capabilities with the 360Nami large language model. It supports high-speed streaming output, multi-turn conversation, internet search, deep thinking mode, and automatically deletes conversation history to protect user privacy.

Fully compatible with the ChatGPT interface, it can be seamlessly integrated into existing applications based on the OpenAI API.

## Features

- **Streaming Response**: Supports high-speed streaming output, returning model-generated content in real-time
- **Multi-turn Conversation**: Supports complete multi-turn conversation capabilities
- **Deep Thinking**: Supports R1 deep thinking and silent deep thinking modes
- **Internet Search**: Supports internet search to obtain the latest information
- **Reasoning Content**: Can obtain the model's reasoning process (reasoning_content)
- **Auto Cleanup**: Automatically deletes conversation history after each conversation ends
- **OpenAI Compatible**: Fully compatible with ChatGPT API format

## Preparation

Please ensure you are in mainland China or have personal computing equipment in mainland China, otherwise, the deployment may not work due to the inability to access 360Nami.

Get authentication parameters from [360Nami](https://bot.n.cn/):

Start a conversation on 360Nami, then open the developer tools with F12, and find any request with headers containing "Access-Token", "Auth-Token", "Cookie" values. Right-click and select "Copy as cURL". Use the Python tool in the tools directory to get the authentication parameters and fill them in the docker-compose.yml file. (Manual copying and concatenation is possible but error-prone and not recommended)

![Get Authentication Parameters](./doc/example-0.png)

### Multi-account Access

Currently, the same account can only have *one* output stream at a time. You can provide authentication parameters for multiple accounts using `,` concatenation:

```json
NAMI_AUTH_LIST=[
          {
            "COOKIE": "",
            "ACCESS_TOKEN": "",
            "AUTH_TOKEN": ""
          },
          {
            "COOKIE": "",
            "ACCESS_TOKEN": "",
            "AUTH_TOKEN": ""
          },
          {
            "COOKIE": "",
            "ACCESS_TOKEN": "",
            "AUTH_TOKEN": ""
          }
        ]
```

The service will select one from the list for each request.

### Environment Variables

| Environment Variable | Required | Description                               |
|------|------|----------------------------------|
| NAMI_AUTH_LIST | Yes | 360Nami authentication information, can be for multiple accounts |

## Deployment Methods

### Docker Deployment

Pull the image and start the service.

```shell
# Configuration must be in environment variables
docker run -it -d --init --name 360nami-api -p 8000:8000 -e TZ=Asia/Shanghai -e NAMI_AUTH_LIST=xxx your-docker-image:latest
```

### Native Deployment

Please install the Node.js environment and configure the environment variables to ensure the node command is available.

Install dependencies:

```shell
npm i
```

Build the project:

```shell
npm run build
```

Start the service:

```shell
npm start
```

## API Documentation

### Chat Completion

Chat completion interface, compatible with OpenAI's [chat-completions-api](https://platform.openai.com/docs/guides/text-generation/chat-completions-api).

**POST /v1/chat/completions**

The header needs to set the Authorization header:

```
Authorization: Bearer [any value]
```

Request data:
```json
{
    // model name
    // default: deepseek
    // deep thinking: deepseek-think or deepseek-r1
    // internet search: deepseek-search
    // deep thinking + internet search: deepseek-r1-search or deepseek-think-search
    // silent mode (no output of thinking process or internet search results): deepseek-think-silent or deepseek-r1-silent or deepseek-search-silent
    // deep thinking but the thinking process is wrapped with <details> collapsible tags (requires page support for display): deepseek-think-fold or deepseek-r1-fold
    "model": "deepseek",
    "messages": [
        {
            "role": "user",
            "content": "Who are you?"
        }
    ],
    // if using streaming response, set to true, default is false
    "stream": false
}
```

Response data:
```json
{
    "id": "50207e56-747e-4800-9068-c6fd618374ee@2",
    "model": "deepseek",
    "object": "chat.completion",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "I am DeepSeek Chat, an intelligent assistant developed by DeepSeek, designed to provide information retrieval, conversation, and answer questions through natural language processing and machine learning technologies.",
                "reasoning_content": "This is the reasoning content in thinking mode" // Only returned in thinking mode
            },
            "finish_reason": "stop"
        }
    ],
    "usage": {
        "prompt_tokens": 1,
        "completion_tokens": 1,
        "total_tokens": 2
    },
    "created": 1715061432,
    "conversation_id": "50207e56-747e-4800-9068-c6fd618374ee" // Conversation ID
}
```

### Special Function Parameters

#### Deep Thinking Mode

Use `deepseek-think` or `deepseek-r1` as the model parameter to enable deep thinking mode. In this mode, the model will think first and then provide an answer. The thinking content will be included in the `reasoning_content` field.

```json
{
    "model": "deepseek-think",
    "messages": [
        {
            "role": "user",
            "content": "Solve this problem using mathematical methods: A store has three types of fruits: apples, bananas, and oranges. If I buy 2 apples, 3 bananas, and 1 orange, I spend a total of 12 yuan; if I buy 3 apples, 2 bananas, and 2 oranges, I spend a total of 15 yuan; if I buy 1 apple, 1 banana, and 3 oranges, I spend a total of 12 yuan. What is the price of each fruit?"
        }
    ]
}
```

#### Internet Search

Use `deepseek-search` as the model parameter to enable internet search functionality.

```json
{
    "model": "deepseek-search",
    "messages": [
        {
            "role": "user",
            "content": "What's the latest on the Olympics?"
        }
    ]
}
```

#### Model List

Request /models to get a list of all supported models, currently there are **47 types**. Fill in the 32-bit model ID you want to use in the [model ID] field below in the following format to use the specified model.

```json
{
    "model": "[model-id]-chat",
    "messages": [
        {
            "role": "user",
            "content": "What's the latest on the Olympics?"
        }
    ]
}
```

## Notes

### Nginx Reverse Proxy Optimization

If you are using Nginx to reverse proxy this project, please add the following configuration items to optimize the streaming output:

```nginx
# Disable proxy buffering
proxy_buffering off;
# Enable chunked transfer encoding
chunked_transfer_encoding on;
# Enable TCP_NOPUSH
tcp_nopush on;
# Enable TCP_NODELAY
tcp_nodelay on;
# Set keep-alive timeout
keepalive_timeout 120;
```

### Disclaimer

This project is for learning and research purposes only. Please do not use it for commercial purposes. When using this project, please comply with relevant laws, regulations, and terms of service.
