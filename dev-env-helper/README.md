# OpenClaw 一键安装器

OpenClaw 一键安装工具，自动部署 Node.js 和 OpenClaw 开发环境。

## 下载

从 [GitHub Releases](../../releases) 下载对应平台的安装包：

- **macOS**: `OpenClaw安装器_*.dmg`
- **Windows**: `OpenClaw安装器_*_x64-setup.exe`
- **Linux**: `openclaw-installer_*.AppImage`

## macOS 安装说明

由于应用未进行 Apple 开发者签名，首次打开时会提示安全警告。

### 解决方法

**方法 1：右键打开（推荐）**
1. 右键点击应用图标
2. 选择「打开」
3. 在弹出的对话框中点击「打开」

**方法 2：终端命令**
```bash
xattr -rd com.apple.quarantine /Applications/OpenClaw\ 安装器.app
```

**方法 3：系统设置**
1. 打开「系统设置」→「隐私与安全性」
2. 在「安全性」部分找到「已阻止使用 OpenClaw 安装器」
3. 点击「仍要打开」

## Windows 安装说明

由于应用未进行代码签名，Windows Defender 可能会提示「Windows 已保护你的电脑」。

### 解决方法

**方法 1：点击「更多信息」**
1. 在弹出的提示框中点击「更多信息」
2. 点击「仍要运行」

**方法 2：Windows 安全中心**
1. 打开「Windows 安全中心」→「病毒和威胁防护」
2. 点击「排除项」→「添加或删除排除项」
3. 添加安装器文件或安装目录到排除项

**方法 3：SmartScreen（安装时）**
1. 安装程序被拦截时，点击「更多信息」
2. 选择「仍要运行」

> **注意**：这些警告是因为应用未购买代码签名证书，并非恶意软件。你可以查看源代码确认安全性。

## 使用步骤

1. 运行安装器
2. 点击「开始安装」一键部署环境
3. 在 API Key 配置区域选择模型提供商（DeepSeek、Kimi、OpenAI 等）
4. 输入 API Key 并点击「保存并重启」
5. 自动打开 Dashboard 开始使用

## 支持的模型

- **DeepSeek**: deepseek-chat, deepseek-coder, deepseek-reasoner
- **Kimi (月之暗面)**: kimi-k2.5, kimi-k2-0905-preview
- **OpenAI**: gpt-4o, gpt-4o-mini, gpt-4-turbo
- **Anthropic**: claude-opus, claude-sonnet
- **智谱 GLM**: glm-4, glm-4-flash
- **阿里通义千问**: qwen-plus, qwen-turbo, qwen-max
- **百度文心一言**: ernie-4.0, ernie-3.5
- **MiniMax**: MiniMax-Text-01
- **Groq, Gemini, Ollama, SiliconFlow, Cloudflare** 等

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run tauri dev

# 构建发行版
npm run tauri build
```

## 许可证

MIT
