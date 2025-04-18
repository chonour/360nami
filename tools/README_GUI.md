# CURL解析工具 GUI版

这是一个用于解析CURL命令并提取特定信息的GUI工具。

## 功能

此工具可以从curl命令字符串中提取以下信息：

- COOKIE值（仅Q和T键值对）
- ACCESS_TOKEN
- AUTH_TOKEN

并以JSON格式显示结果。

## 安装依赖

在使用前，请先安装必要的依赖：

```bash
pip install pyperclip
```

如果使用的是系统Python，可能需要使用特定的pip命令：

```bash
# 对于macOS/Linux使用Python3
python3 -m pip install pyperclip

# 对于特定Python版本
/usr/local/bin/python3 -m pip install pyperclip
```

注意：如果未安装pyperclip，程序仍然可以运行，但"复制到剪贴板"功能将不可用。

## 使用方法

运行GUI应用程序：

```bash
python curl_gui.py
```

或者指定Python版本：

```bash
python3 curl_gui.py
/usr/local/bin/python3 curl_gui.py
```

## 功能说明

1. **从文件加载**：可以从文本文件中加载保存的curl命令
2. **解析**：对输入的curl命令进行解析，提取关键信息
3. **清空**：清空输入区域
4. **复制结果**：将解析结果复制到剪贴板（需要安装pyperclip）

## 错误处理

- 程序会自动检测是否安装了pyperclip，如果未安装会禁用复制功能
- 文件读取错误、解析错误等都会显示友好的错误提示
- 操作状态会在状态栏显示

## 注意事项

1. 确保输入的是完整的curl命令
2. 支持从文件读取长命令，解决终端输入长字符串的问题
3. 解析结果可以直接复制使用（需安装pyperclip） 