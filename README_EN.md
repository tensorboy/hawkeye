# Hawkeye 🦅

English | [中文](./README.md)

[![npm version](https://img.shields.io/npm/v/@hawkeye/core?color=blue&label=npm)](https://www.npmjs.com/package/@hawkeye/core)
[![Build Status](https://img.shields.io/github/actions/workflow/status/tensorboy/hawkeye/ci.yml?branch=main&label=build)](https://github.com/tensorboy/hawkeye/actions)
[![License](https://img.shields.io/github/license/tensorboy/hawkeye?color=green)](https://github.com/tensorboy/hawkeye/blob/main/LICENSE)

[![macOS](https://img.shields.io/badge/macOS-supported-brightgreen?logo=apple&logoColor=white)](https://github.com/tensorboy/hawkeye)
[![Windows](https://img.shields.io/badge/Windows-supported-brightgreen?logo=windows&logoColor=white)](https://github.com/tensorboy/hawkeye)
[![Linux](https://img.shields.io/badge/Linux-supported-brightgreen?logo=linux&logoColor=white)](https://github.com/tensorboy/hawkeye)

**Intelligent Task Perception & Execution Assistant** - Observes your work environment, understands your intent, and proactively offers help.

> "Watch keenly like a hawk, execute thoughtfully like an assistant."

---

## 💭 Why This Project

After using these powerful AI tools, I kept thinking: How can we make AI tools **benefit everyone**?

**I believe AI can empower everyone to achieve 10x productivity.**

Technology should be accessible to all. When AI becomes powerful enough, cheap enough, and easy enough to use, everyone will have a tireless intelligent assistant—whether you're a programmer, designer, student, or office worker. This is the vision behind Hawkeye: **Let AI be everyone's hawk eye, helping you see opportunities, seize them, and 10x your productivity.**

---

## ✨ Features

### 🚫 Zero Prompt Experience
- **No prompts required**: Hawkeye automatically observes your screen, clipboard, and files, proactively offering suggestions
- **No more "what should I ask?"**: Traditional AI needs you to formulate questions first; Hawkeye discovers problems for you
- **Manual input also supported**: If you have specific needs, you can always tell it directly

### 🏠 Local-First Architecture
- **All core functions run entirely locally**: screen perception, file monitoring, task execution
- **Your data never leaves your device**: screenshots, clipboard, file operations are all processed locally
- **Only cloud call**: AI analysis via Claude API (can be replaced with local models)
- **Fully offline support**: 100% offline operation with local LLM (like Ollama)

### 🔗 Multi-Platform Sync
- **Desktop App** ↔ **Chrome Extension** real-time sync
- Tasks discovered in browser can be executed on desktop
- Cross-application workflow automation

### 📋 Main Task Tracking
- Automatically identify your current main task goal
- Generate actionable next-step suggestions
- Directly help you complete simple operations

## 📦 Project Structure

```
hawkeye/
├── packages/
│   ├── core/                 # Core engine (runs locally)
│   │   ├── perception/       # Perception: screen, window, clipboard, file monitoring
│   │   ├── reasoning/        # Reasoning: AI analysis (supports local/cloud models)
│   │   ├── execution/        # Execution: Shell, file, automation operations
│   │   └── storage/          # Storage: local JSON/SQLite
│   │
│   ├── vscode-extension/     # VS Code Extension
│   ├── chrome-extension/     # Chrome Browser Extension
│   └── desktop/              # Electron Desktop App
│
└── docs/                     # Documentation
```

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/tensorboy/hawkeye.git
cd hawkeye

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Configure API Key

Hawkeye uses Claude API for intelligent analysis by default. You can:

1. **Use Claude API** (Recommended)
   ```
   Enter your Anthropic API Key in settings
   ```

2. **Use Local Model** (Fully Offline)
   ```bash
   # Install Ollama
   brew install ollama

   # Download model
   ollama pull llama3.2

   # Select "Local Model" in Hawkeye settings
   ```

### Run

```bash
# Desktop App
cd packages/desktop
pnpm dev

# VS Code Extension (Press F5 to debug)
cd packages/vscode-extension
code .

# Chrome Extension
cd packages/chrome-extension
pnpm build
# Load dist directory in Chrome
```

## 🎯 Core Features

### 1. Intelligent Perception
- **Screenshot Analysis**: Understand what you're viewing
- **Active Window Tracking**: Know which app you're working in
- **Clipboard Monitoring**: Understand the intent of copied content
- **File Change Monitoring**: Track important file movements and changes

### 2. Task Reasoning
- **Intent Understanding**: Infer what you want to do from context
- **Main Task Identification**: Identify your current primary work goal
- **Suggestion Generation**: Provide 1-5 actionable next-step suggestions
- **Confidence Assessment**: Each suggestion has a confidence score

### 3. Auto Execution
- **Shell Commands**: Run terminal commands
- **File Operations**: Create, edit, move files
- **App Control**: Open apps, URLs, send notifications
- **Browser Automation**: Page interaction, data extraction

## 🔒 Privacy & Security

### Data Localization
- ✅ Screenshots are only analyzed locally, never uploaded
- ✅ Clipboard content stays local
- ✅ File operation logs are stored locally only
- ✅ History and suggestions stored in `~/.hawkeye/`

### AI Calls
- Default uses Claude API (requires network)
- Supports switching to local models (fully offline)
- Only necessary context text is sent to AI

### Permission Control
- Shell commands have whitelist/blacklist
- Dangerous operations require user confirmation
- Sensitive files are automatically excluded

## 🛠️ Development

### Tech Stack
- **Core**: TypeScript, Node.js
- **Desktop**: Electron, React
- **VS Code**: VS Code Extension API
- **Chrome**: Manifest V3

### Local Development

```bash
# Development mode (watch for file changes)
pnpm dev

# Run tests
pnpm test

# Code linting
pnpm lint
```

## 📖 API Documentation

### Core Engine

```typescript
import { HawkeyeEngine } from '@hawkeye/core';

const engine = new HawkeyeEngine({
  anthropicApiKey: 'sk-ant-...',
  // Or use local model
  // localModel: { provider: 'ollama', model: 'llama3.2' }
});

// Observe and get suggestions
const suggestions = await engine.observe();

// Execute suggestion
const result = await engine.execute(suggestions[0].id);
```

### File Watcher

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

### How is Hawkeye different from Claude Code / Cursor / Copilot?

| Feature | Hawkeye | Claude Code / Cursor / Copilot |
|---------|---------|--------------------------------|
| **Interaction Mode** | 🦅 **Proactive Perception** - Automatically observes your work and finds opportunities to help | Reactive - Waits for your commands or questions |
| **Trigger** | Runs continuously, analyzing screen, clipboard, file changes | Requires manual invocation or prompt input |
| **Decision Power** | ✅ **You Decide** - Gives suggestions, you choose whether to execute | AI directly executes or generates code |
| **Use Cases** | All scenarios: coding, browsing, office work, learning | Primarily for code writing |
| **Target Users** | Everyone: developers, designers, students, office workers | Mainly developers |

**Core difference in one sentence**:

> Claude Code / Cursor is a **"you ask, it answers"** tool;
> Hawkeye is an **"it watches you work, helps you discover opportunities"** assistant.

### Why do we need "proactive perception"?

Often, you don't even know you need help. For example:
- You're reading a great article in your browser - Hawkeye can suggest saving it to your notes
- You copied an error message - Hawkeye can automatically analyze and suggest solutions
- You downloaded a file - Hawkeye can suggest organizing it to the right folder
- You're doing repetitive work - Hawkeye can detect patterns and suggest automation

**Traditional AI tools require you to think of the problem first, then ask; Hawkeye helps you discover problems, then you decide whether to solve them.**

### Will Hawkeye automatically execute dangerous operations?

No. Hawkeye's core philosophy is **"suggestions first, humans decide"**:
- All operations require your confirmation before execution
- Dangerous commands (like file deletion, system operations) have additional safety confirmations
- You can configure whitelists/blacklists to control which operations are allowed

## 🗺️ Roadmap

- [x] Core Perception Engine
- [x] VS Code Extension
- [x] Chrome Extension
- [x] Electron Desktop App
- [ ] File Monitoring Integration
- [ ] Desktop-Extension Real-time Sync
- [ ] Local LLM Support (Ollama)
- [ ] Main Task Tracking Dashboard
- [ ] Custom Workflows
- [ ] Plugin System

## 🔗 Links

- 🌐 **Website**: [hawkiyi.com](https://hawkiyi.com)
- 📦 **NPM**: `@hawkeye/core` (coming soon)

## 🤝 Contributing

Issues and Pull Requests are welcome!

## 📄 License

MIT © [tensorboy](https://github.com/tensorboy)
