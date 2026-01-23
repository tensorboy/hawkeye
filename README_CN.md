<div align="center">

<img src="./logo.png" alt="Hawkeye Logo" width="120" height="120" />

# Hawkeye

### 🦅 首个主动感知型桌面 AI 助手

**敏锐如鹰，贴心如友，10 倍效率提升**

[![GitHub Stars](https://img.shields.io/github/stars/anthropics/hawkeye?style=for-the-badge&logo=github&color=yellow)](https://github.com/anthropics/hawkeye)
[![License](https://img.shields.io/github/license/anthropics/hawkeye?style=for-the-badge&color=blue)](LICENSE)
[![Build](https://img.shields.io/github/actions/workflow/status/anthropics/hawkeye/ci.yml?style=for-the-badge&label=build)](https://github.com/anthropics/hawkeye/actions)

[🌐 官网](https://hawkiyi.com) · [📖 文档](https://hawkiyi.com/docs) · [🐛 报告Bug](https://github.com/anthropics/hawkeye/issues) · [💡 功能建议](https://github.com/anthropics/hawkeye/issues)

<br/>

![macOS](https://img.shields.io/badge/macOS-000000?style=flat&logo=apple&logoColor=white)
![Windows](https://img.shields.io/badge/Windows-0078D6?style=flat&logo=windows&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat&logo=linux&logoColor=black)

[English](./README.md) | **中文**

</div>

<br/>

<p align="center">
  <img src="./docs/demo.gif" alt="Hawkeye Demo" width="800"/>
</p>

---

## 🎯 Hawkeye 是什么？

> **传统 AI 等你发号施令，Hawkeye 主动观察并提供帮助。**

Hawkeye 是一款 **AI 驱动的桌面助手**，它观察你的工作环境——屏幕、剪贴板、文件——并主动提供智能建议。无需输入任何指令。

| 特性 | Copilot / Cursor / Claude Code | **Hawkeye** |
|------|-------------------------------|-------------|
| **模式** | 被动（你问它答） | **主动**（它观察你） |
| **范围** | 仅限代码 | 全场景：编程、浏览、办公 |
| **隐私** | 云端处理 | **本地优先**，数据不出设备 |
| **控制** | AI 直接执行 | **你来决定** 是否执行 |

<br/>

## ✨ 核心特性

<table>
<tr>
<td width="50%">

### 🔍 零 Prompt 智能
- 自动理解你的工作上下文
- 无需解释你在做什么
- 在你开口前就给出建议

</td>
<td width="50%">

### 🏠 隐私优先架构
- 所有感知 **100% 本地运行**
- 数据不离开你的设备
- 支持本地 LLM 完全离线

</td>
</tr>
<tr>
<td width="50%">

### 🎯 智能任务追踪
- 识别你的主要任务目标
- 生成可执行的下一步建议
- 学习你的工作习惯

</td>
<td width="50%">

### 🔗 多端协同
- 桌面 ↔ 浏览器无缝同步
- VS Code 扩展深度集成
- 跨应用工作流自动化

</td>
</tr>
</table>

<br/>

## 🚀 快速开始

### 下载安装

<table>
<tr>
<th>平台</th>
<th>下载</th>
</tr>
<tr>
<td><img src="https://img.shields.io/badge/-macOS-000000?style=flat&logo=apple&logoColor=white" /></td>
<td>

[Apple Silicon (.dmg)](https://github.com/anthropics/hawkeye/releases/latest) · [Intel (.dmg)](https://github.com/anthropics/hawkeye/releases/latest)

</td>
</tr>
<tr>
<td><img src="https://img.shields.io/badge/-Windows-0078D6?style=flat&logo=windows&logoColor=white" /></td>
<td>

[安装程序 (.exe)](https://github.com/anthropics/hawkeye/releases/latest)

</td>
</tr>
<tr>
<td><img src="https://img.shields.io/badge/-Linux-FCC624?style=flat&logo=linux&logoColor=black" /></td>
<td>

[Debian/Ubuntu (.deb)](https://github.com/anthropics/hawkeye/releases/latest) · [AppImage](https://github.com/anthropics/hawkeye/releases/latest)

</td>
</tr>
</table>

<details>
<summary><b>⚠️ macOS: 提示"应用已损坏"的解决方法</b></summary>

```bash
# 移除隔离属性
xattr -cr /Applications/Hawkeye.app
```

</details>

### 60 秒快速启动

```bash
# 1. 克隆
git clone https://github.com/anthropics/hawkeye.git && cd hawkeye

# 2. 安装
pnpm install

# 3. 运行
pnpm dev
```

### 配置 AI 提供商

<details>
<summary><b>方式一：Claude API（推荐）</b></summary>

在 设置 → API 配置 中输入你的 Anthropic API Key。

</details>

<details>
<summary><b>方式二：本地 LLM + Ollama（100% 离线）</b></summary>

```bash
# 安装 Ollama
brew install ollama  # macOS
# Windows/Linux: https://ollama.com/download

# 下载模型
ollama pull qwen3:8b        # 文本模型（需要 8GB+ 内存）
ollama pull qwen2.5vl:7b    # 视觉模型

# 在 Hawkeye 设置中选择 "Ollama"
```

</details>

<br/>

## 🏗️ 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                      HAWKEYE 引擎                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   感知层    │───▶│   推理层    │───▶│   执行层    │         │
│  │ PERCEPTION  │    │  REASONING  │    │  EXECUTION  │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│        │                  │                  │                  │
│   • 屏幕 OCR        • Claude/Ollama    • Shell 命令            │
│   • 剪贴板          • 任务分析          • 文件操作              │
│   • 文件监控        • 意图识别          • 应用控制              │
│   • 窗口追踪        • 建议生成          • 浏览器自动化          │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                          接口层                                  │
├───────────────┬───────────────┬───────────────┬─────────────────┤
│   🖥️ 桌面应用  │  🧩 VS Code   │  🌐 Chrome    │    📦 Core     │
│   (Electron)  │    扩展       │    扩展       │   (npm 包)      │
└───────────────┴───────────────┴───────────────┴─────────────────┘
```

<br/>

## 📦 项目结构

```
hawkeye/
├── packages/
│   ├── core/                 # 🧠 核心引擎（本地处理）
│   │   ├── perception/       #    屏幕、剪贴板、文件监控
│   │   ├── ai/               #    AI 提供商（Claude、Ollama 等）
│   │   ├── execution/        #    Action 执行系统
│   │   └── storage/          #    本地数据库（SQLite）
│   │
│   ├── desktop/              # 🖥️  Electron 桌面应用
│   ├── vscode-extension/     # 🧩 VS Code 扩展
│   └── chrome-extension/     # 🌐 Chrome 浏览器扩展
│
├── docs/                     # 📖 文档
└── website/                  # 🌐 官网
```

<br/>

## 🔒 隐私与安全

| 方面 | 我们如何保护你 |
|------|---------------|
| **屏幕截图** | ✅ 本地分析，绝不上传 |
| **剪贴板** | ✅ 仅在设备上处理 |
| **文件** | ✅ 本地监控，路径不外传 |
| **AI 调用** | ✅ 仅发送最少必要文本（或使用本地 LLM） |
| **危险操作** | ✅ 必须经过你的确认 |

> 📁 所有数据存储在 `~/.hawkeye/` — 你的数据由你掌控。

<br/>

## 📖 使用示例

### 作为库使用

```typescript
import { HawkeyeEngine } from '@hawkeye/core';

const engine = new HawkeyeEngine({
  provider: 'ollama',
  model: 'qwen3:8b'
});

// 基于当前上下文获取 AI 建议
const suggestions = await engine.observe();

// 经用户确认后执行建议
await engine.execute(suggestions[0].id);
```

### 文件监控

```typescript
import { FileWatcher } from '@hawkeye/core';

const watcher = new FileWatcher({
  paths: ['~/Downloads', '~/Documents'],
  events: ['create', 'move']
});

watcher.on('change', (event) => {
  console.log(`${event.type}: ${event.path}`);
});
```

<br/>

## 🗺️ 路线图

- [x] 核心感知引擎
- [x] 桌面应用 (Electron)
- [x] VS Code 扩展
- [x] Chrome 扩展
- [x] 本地 LLM 支持 (Ollama)
- [ ] 桌面 ↔ 扩展实时同步
- [ ] 插件系统
- [ ] 自定义工作流构建器
- [ ] 移动端伴侣应用

<br/>

## 🤝 参与贡献

贡献是开源社区如此美好的原因！我们非常感谢你的任何贡献。

1. Fork 本项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

详细指南请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。

<br/>

## ⭐ Star 历史

<a href="https://star-history.com/#anthropics/hawkeye&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=anthropics/hawkeye&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=anthropics/hawkeye&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=anthropics/hawkeye&type=Date" />
 </picture>
</a>

<br/>

## 📄 开源协议

基于 MIT 协议开源。详见 [LICENSE](LICENSE)。

<br/>

---

<div align="center">

**[🌐 官网](https://hawkiyi.com)** · **[📖 文档](https://hawkiyi.com/docs)** · **[🐦 Twitter](https://twitter.com/hawkeyeai)** · **[💬 Discord](https://discord.gg/hawkeye)**

<sub>由 Hawkeye 团队用 ❤️ 打造</sub>

<br/>

**如果 Hawkeye 对你有帮助，请给我们一个 ⭐**

</div>
