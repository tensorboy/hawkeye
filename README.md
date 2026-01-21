# Hawkeye 🦅

[English](./README_EN.md) | 中文

[![GitHub stars](https://img.shields.io/github/stars/tensorboy/hawkeye?style=social)](https://github.com/tensorboy/hawkeye)
[![npm version](https://img.shields.io/npm/v/@hawkeye/core?color=blue&label=npm)](https://www.npmjs.com/package/@hawkeye/core)
[![Build Status](https://img.shields.io/github/actions/workflow/status/tensorboy/hawkeye/ci.yml?branch=main&label=build)](https://github.com/tensorboy/hawkeye/actions)
[![License](https://img.shields.io/github/license/tensorboy/hawkeye?color=green)](https://github.com/tensorboy/hawkeye/blob/main/LICENSE)

[![macOS](https://img.shields.io/badge/macOS-supported-brightgreen?logo=apple&logoColor=white)](https://github.com/tensorboy/hawkeye)
[![Windows](https://img.shields.io/badge/Windows-supported-brightgreen?logo=windows&logoColor=white)](https://github.com/tensorboy/hawkeye)
[![Linux](https://img.shields.io/badge/Linux-supported-brightgreen?logo=linux&logoColor=white)](https://github.com/tensorboy/hawkeye)

**智能任务感知与执行助手** - 观察你的工作环境，理解你的意图，主动提供帮助。

> "像鹰眼一样敏锐地观察，像助手一样贴心地执行。"

---

## 💭 为什么做这个项目

在使用了这些强大的 AI 工具之后，我一直在想：如何让这些 AI 工具 **benefit 每一个人**？

**我相信 AI 可以赋能每一个人，实现 10 倍工作效率。**

技术应该是普惠的。当 AI 足够强大、足够便宜、足够易用，每个人都将拥有一个不知疲倦的智能助手——无论你是程序员、设计师、学生还是普通上班族。这就是 Hawkeye 的初衷：**让 AI 成为每个人的鹰眼，帮你看见机会，抓住机会，10x 你的工作效率。**

---

## ✨ 特点

### 🚫 零 Prompt 体验
- **无需输入任何指令**：Hawkeye 自动观察你的屏幕、剪贴板、文件，主动给出建议
- **告别"不知道问什么"**：传统 AI 需要你想好问题再问，Hawkeye 帮你发现问题
- **当然也支持手动输入**：如果你有明确需求，随时可以告诉它

### 🏠 本地优先架构
- **所有核心功能完全在本地运行**：屏幕感知、文件监控、任务执行
- **数据不离开你的设备**：截图、剪贴板、文件操作均在本地处理
- **唯一的云端调用**：仅 AI 分析时调用 Claude API（可选择使用本地模型替代）
- **支持完全离线**：配合本地 LLM（如 Ollama）可实现 100% 离线运行

### 🔗 多端联动
- **桌面应用** ↔ **Chrome 扩展** 实时同步
- 在浏览器中发现的任务可以在桌面上执行
- 跨应用的工作流自动化

### 📋 主线任务追踪
- 自动识别你当前的主要任务目标
- 生成可执行的下一步建议
- 直接帮你完成简单操作

## 📦 项目结构

```
hawkeye/
├── packages/
│   ├── core/                 # 核心引擎（本地运行）
│   │   ├── perception/       # 感知层：屏幕、窗口、剪贴板、文件监控
│   │   ├── reasoning/        # 推理层：AI 分析（支持本地/云端模型）
│   │   ├── execution/        # 执行层：Shell、文件、自动化操作
│   │   └── storage/          # 存储层：本地 JSON/SQLite
│   │
│   ├── vscode-extension/     # VS Code 扩展
│   ├── chrome-extension/     # Chrome 浏览器扩展
│   └── desktop/              # Electron 桌面应用
│
└── docs/                     # 文档
```

## 🚀 快速开始

### 安装

```bash
# 克隆仓库
git clone https://github.com/tensorboy/hawkeye.git
cd hawkeye

# 安装依赖
pnpm install

# 构建所有包
pnpm build
```

### 配置 API Key

Hawkeye 默认使用 Claude API 进行智能分析。你可以：

1. **使用 Claude API**（推荐）
   ```
   在设置中输入你的 Anthropic API Key
   ```

2. **使用本地模型**（完全离线）
   ```bash
   # 安装 Ollama
   brew install ollama

   # 下载模型
   ollama pull llama3.2

   # 在 Hawkeye 配置中选择 "本地模型"
   ```

### 运行

```bash
# 桌面应用
cd packages/desktop
pnpm dev

# VS Code 扩展（按 F5 调试）
cd packages/vscode-extension
code .

# Chrome 扩展
cd packages/chrome-extension
pnpm build
# 在 Chrome 中加载 dist 目录
```

## 🎯 核心功能

### 1. 智能感知
- **屏幕截图分析**：理解你正在查看的内容
- **活动窗口追踪**：知道你在哪个应用中工作
- **剪贴板监控**：理解你复制的内容意图
- **文件变动监控**：追踪重要文件的移动和变化

### 2. 任务推理
- **意图理解**：从上下文推断你想要做什么
- **主线任务识别**：识别你当前的主要工作目标
- **建议生成**：给出 1-5 个可执行的下一步建议
- **置信度评估**：每个建议都有可信度评分

### 3. 自动执行
- **Shell 命令**：运行终端命令
- **文件操作**：创建、编辑、移动文件
- **应用控制**：打开应用、URL、发送通知
- **浏览器自动化**：页面交互、数据提取

## 🔒 隐私与安全

### 数据本地化
- ✅ 屏幕截图只在本地分析，不上传
- ✅ 剪贴板内容不离开本地
- ✅ 文件操作记录仅存本地
- ✅ 历史建议存储在 `~/.hawkeye/`

### AI 调用
- 默认使用 Claude API（需要网络）
- 支持切换到本地模型（完全离线）
- 发送给 AI 的只有必要的上下文文本

### 权限控制
- Shell 命令有白名单/黑名单
- 危险操作需要用户确认
- 敏感文件自动排除

## 🛠️ 开发

### 技术栈
- **核心**：TypeScript, Node.js
- **桌面**：Electron, React
- **VS Code**：VS Code Extension API
- **Chrome**：Manifest V3

### 本地开发

```bash
# 开发模式（监听文件变化）
pnpm dev

# 运行测试
pnpm test

# 代码检查
pnpm lint
```

## 📖 API 文档

### Core Engine

```typescript
import { HawkeyeEngine } from '@hawkeye/core';

const engine = new HawkeyeEngine({
  anthropicApiKey: 'sk-ant-...',
  // 或使用本地模型
  // localModel: { provider: 'ollama', model: 'llama3.2' }
});

// 观察并获取建议
const suggestions = await engine.observe();

// 执行建议
const result = await engine.execute(suggestions[0].id);
```

### 文件监控

```typescript
import { FileWatcher } from '@hawkeye/core';

const watcher = new FileWatcher({
  paths: ['~/Documents', '~/Downloads'],
  events: ['create', 'move', 'delete']
});

watcher.on('change', (event) => {
  console.log(`File ${event.type}: ${event.path}`);
});
```

## ❓ FAQ

### Hawkeye 和 Claude Code / Cursor / Copilot 有什么区别？

| 特性 | Hawkeye | Claude Code / Cursor / Copilot |
|------|---------|--------------------------------|
| **交互模式** | 🦅 **主动感知** - 自动观察你的工作，主动发现可以帮助你的点 | 被动响应 - 等待你输入指令或问题 |
| **触发方式** | 持续运行，自动分析屏幕、剪贴板、文件变化 | 需要你主动调用或输入 prompt |
| **决策权** | ✅ **你来决定** - 给你建议，你选择是否执行 | AI 直接执行或生成代码 |
| **适用场景** | 全场景：编程、浏览、办公、学习 | 主要用于代码编写 |
| **目标用户** | 所有人：程序员、设计师、学生、上班族 | 主要面向开发者 |

**核心区别一句话总结**：

> Claude Code / Cursor 是 **"你问它答"** 的工具；
> Hawkeye 是 **"它看你做，帮你发现机会"** 的助手。

### 为什么需要"主动感知"？

很多时候，你并不知道自己需要帮助。比如：
- 你在浏览器里看到一篇好文章，Hawkeye 可以建议你保存到笔记
- 你复制了一段报错信息，Hawkeye 可以自动分析并给出解决方案
- 你下载了一个文件，Hawkeye 可以建议你整理到合适的文件夹
- 你在做重复性工作，Hawkeye 可以发现规律并建议自动化

**传统 AI 工具需要你先想到问题，再去问它；Hawkeye 帮你发现问题，然后你决定要不要解决。**

### Hawkeye 会不会自动执行危险操作？

不会。Hawkeye 的核心理念是 **"建议优先，人类决定"**：
- 所有操作都需要你确认后才会执行
- 危险命令（如删除文件、系统操作）有额外的安全确认
- 你可以配置白名单/黑名单控制哪些操作可以执行

## 🗺️ Roadmap

- [x] 核心感知引擎
- [x] VS Code 扩展
- [x] Chrome 扩展
- [x] Electron 桌面应用
- [ ] 文件监控联动
- [ ] 桌面-扩展实时同步
- [ ] 本地 LLM 支持（Ollama）
- [ ] 主线任务追踪 Dashboard
- [ ] 自定义工作流
- [ ] 插件系统

## 🔗 相关链接

- 🌐 **官网**: [hawkiyi.com](https://hawkiyi.com)
- 📦 **NPM**: `@hawkeye/core` (即将发布)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 License

MIT © [tensorboy](https://github.com/tensorboy)
