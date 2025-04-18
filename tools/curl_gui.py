import re
import json
import sys
import tkinter as tk
from tkinter import filedialog, scrolledtext, messagebox

# 尝试导入pyperclip，如果失败则提供备用方案
try:
    import pyperclip
    has_pyperclip = True
except ImportError:
    has_pyperclip = False
    print("警告: 未安装pyperclip模块，复制到剪贴板功能将不可用")
    print("请运行: pip install pyperclip 来安装")

def extract_tokens_from_curl(curl_string):
    # 提取ACCESS_TOKEN
    access_token_match = re.search(r"access-token:\s*([^\s'\"]+)", curl_string)
    access_token = access_token_match.group(1) if access_token_match else ""
    
    # 提取AUTH_TOKEN
    auth_token_match = re.search(r"Auth-Token:\s*([^\s'\"]+)", curl_string)
    auth_token = auth_token_match.group(1) if auth_token_match else ""
    
    # 提取Cookie
    cookie_match = re.search(r"Cookie:\s*([^'\"]*)", curl_string)
    cookie_str = cookie_match.group(1) if cookie_match else ""
    
    # 从Cookie字符串中提取Q和T
    q_match = re.search(r"(Q=[^;]+)", cookie_str)
    t_match = re.search(r"(T=[^;]+)", cookie_str)
    
    cookie_parts = []
    if q_match:
        cookie_parts.append(q_match.group(1))
    if t_match:
        cookie_parts.append(t_match.group(1))
    
    cookie = "; ".join(cookie_parts)
    
    result = {
        "COOKIE": cookie,
        "ACCESS_TOKEN": access_token,
        "AUTH_TOKEN": auth_token
    }
    
    return result

class CurlParserGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("CURL解析工具")
        self.root.geometry("800x600")
        self.root.resizable(True, True)
        
        # 创建主框架
        main_frame = tk.Frame(root)
        main_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # 输入区域标签
        input_label = tk.Label(main_frame, text="输入CURL命令:", font=("Arial", 12))
        input_label.pack(anchor="w", pady=(0, 5))
        
        # 输入区域
        self.input_text = scrolledtext.ScrolledText(main_frame, height=10, wrap=tk.WORD)
        self.input_text.pack(fill=tk.BOTH, expand=True, pady=(0, 10))
        
        # 按钮区域
        button_frame = tk.Frame(main_frame)
        button_frame.pack(fill=tk.X, pady=5)
        
        # 从文件载入按钮
        load_button = tk.Button(button_frame, text="从文件加载", command=self.load_from_file, width=15)
        load_button.pack(side=tk.LEFT, padx=5)
        
        # 解析按钮
        parse_button = tk.Button(button_frame, text="解析", command=self.parse_curl, width=15)
        parse_button.pack(side=tk.LEFT, padx=5)
        
        # 清空按钮
        clear_button = tk.Button(button_frame, text="清空", command=self.clear_input, width=15)
        clear_button.pack(side=tk.LEFT, padx=5)
        
        # 结果区域标签
        result_label = tk.Label(main_frame, text="解析结果:", font=("Arial", 12))
        result_label.pack(anchor="w", pady=(10, 5))
        
        # 结果显示区域
        self.result_text = scrolledtext.ScrolledText(main_frame, height=10, wrap=tk.WORD, bg="#f0f0f0")
        self.result_text.pack(fill=tk.BOTH, expand=True, pady=(0, 5))
        
        # 复制按钮
        copy_button = tk.Button(main_frame, text="复制结果到剪贴板", command=self.copy_result, width=20)
        copy_button.pack(side=tk.RIGHT, pady=5)
        
        # 如果pyperclip不可用，禁用复制按钮
        if not has_pyperclip:
            copy_button.config(state=tk.DISABLED)
            copy_button.config(text="复制功能不可用")
        
        # 状态栏
        self.status_var = tk.StringVar()
        self.status_var.set("就绪")
        status_bar = tk.Label(root, textvariable=self.status_var, relief=tk.SUNKEN, anchor=tk.W)
        status_bar.pack(side=tk.BOTTOM, fill=tk.X)
        
    def load_from_file(self):
        file_path = filedialog.askopenfilename(
            title="选择保存CURL命令的文件",
            filetypes=[("文本文件", "*.txt"), ("所有文件", "*.*")]
        )
        
        if file_path:
            try:
                with open(file_path, 'r', encoding='utf-8') as file:
                    curl_string = file.read()
                    self.input_text.delete(1.0, tk.END)
                    self.input_text.insert(tk.END, curl_string)
                self.status_var.set(f"已从文件 {file_path} 加载命令")
            except Exception as e:
                messagebox.showerror("错误", f"读取文件时出错: {e}")
                self.status_var.set("读取文件失败")
    
    def parse_curl(self):
        curl_string = self.input_text.get(1.0, tk.END).strip()
        
        if not curl_string:
            messagebox.showwarning("警告", "请先输入CURL命令")
            return
        
        try:
            result = extract_tokens_from_curl(curl_string)
            formatted_json = json.dumps(result, indent=2, ensure_ascii=False)
            
            self.result_text.delete(1.0, tk.END)
            self.result_text.insert(tk.END, formatted_json)
            self.status_var.set("解析成功")
        except Exception as e:
            messagebox.showerror("错误", f"解析CURL命令时出错: {e}")
            self.status_var.set("解析失败")
    
    def clear_input(self):
        self.input_text.delete(1.0, tk.END)
        self.status_var.set("输入已清空")
    
    def copy_result(self):
        if not has_pyperclip:
            messagebox.showwarning("警告", "未安装pyperclip模块，无法复制到剪贴板")
            return
            
        result_text = self.result_text.get(1.0, tk.END).strip()
        
        if not result_text:
            messagebox.showwarning("警告", "没有可复制的结果")
            return
        
        try:
            pyperclip.copy(result_text)
            self.status_var.set("结果已复制到剪贴板")
        except Exception as e:
            messagebox.showerror("错误", f"复制到剪贴板时出错: {e}")
            self.status_var.set("复制失败")

def main():
    try:
        root = tk.Tk()
        app = CurlParserGUI(root)
        root.mainloop()
    except Exception as e:
        print(f"程序启动出错: {e}")
        if 'root' in locals():
            root.destroy()

if __name__ == "__main__":
    main() 