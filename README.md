<div align="center">

<img src="./logo.png" alt="Hawkeye Logo" width="120" height="120" />

# Hawkeye

### 🦅 The First Proactive AI Assistant for Desktop

**Watch keenly. Act thoughtfully. 10x your productivity.**

[![GitHub Stars](https://img.shields.io/github/stars/anthropics/hawkeye?style=for-the-badge&logo=github&color=yellow)](https://github.com/anthropics/hawkeye)
[![License](https://img.shields.io/github/license/anthropics/hawkeye?style=for-the-badge&color=blue)](LICENSE)
[![Build](https://img.shields.io/github/actions/workflow/status/anthropics/hawkeye/ci.yml?style=for-the-badge&label=build)](https://github.com/anthropics/hawkeye/actions)

[🌐 Website](https://hawkiyi.com) · [📖 Documentation](https://hawkiyi.com/docs) · [🐛 Report Bug](https://github.com/anthropics/hawkeye/issues) · [💡 Request Feature](https://github.com/anthropics/hawkeye/issues)

<br/>

![macOS](https://img.shields.io/badge/macOS-000000?style=flat&logo=apple&logoColor=white)
![Windows](https://img.shields.io/badge/Windows-0078D6?style=flat&logo=windows&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat&logo=linux&logoColor=black)

</div>

<br/>

<p align="center">
  <img src="./docs/demo.gif" alt="Hawkeye Demo" width="800"/>
</p>

---

## 🎯 What is Hawkeye?

> **Traditional AI waits for your commands. Hawkeye watches and helps proactively.**

Hawkeye is an **AI-powered desktop assistant** that observes your work environment—screen, clipboard, files—and proactively offers intelligent suggestions. No prompts needed.

| Feature | Copilot / Cursor / Claude Code | **Hawkeye** |
|---------|-------------------------------|-------------|
| **Mode** | Reactive (you ask) | **Proactive** (it watches) |
| **Scope** | Code only | Everything: coding, browsing, writing |
| **Privacy** | Cloud-based | **Local-first**, your data stays local |
| **Control** | AI executes | **You decide** what to execute |

<br/>

## ✨ Key Features

<table>
<tr>
<td width="50%">

### 🔍 Zero-Prompt Intelligence
- Automatically understands your context
- No need to explain what you're doing
- Suggests actions before you ask

</td>
<td width="50%">

### 🏠 Privacy-First Architecture
- All perception runs **100% locally**
- Data never leaves your device
- Works offline with local LLMs

</td>
</tr>
<tr>
<td width="50%">

### 🎯 Smart Task Tracking
- Identifies your main task goal
- Generates actionable next steps
- Learns from your workflow

</td>
<td width="50%">

### 🔗 Multi-Platform Sync
- Desktop ↔ Browser seamless sync
- VS Code extension integration
- Cross-app workflow automation

</td>
</tr>
</table>

<br/>

## 🚀 Quick Start

### Download

<table>
<tr>
<th>Platform</th>
<th>Download</th>
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

[Installer (.exe)](https://github.com/anthropics/hawkeye/releases/latest)

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
<summary><b>⚠️ macOS: "App is damaged" fix</b></summary>

```bash
# Remove quarantine attribute
xattr -cr /Applications/Hawkeye.app
```

</details>

### Setup in 60 Seconds

```bash
# 1. Clone
git clone https://github.com/anthropics/hawkeye.git && cd hawkeye

# 2. Install
pnpm install

# 3. Run
pnpm dev
```

### Configure AI Provider

<details>
<summary><b>Option 1: Claude API (Recommended)</b></summary>

Enter your Anthropic API key in Settings → API Configuration.

</details>

<details>
<summary><b>Option 2: Local LLM with Ollama (100% Offline)</b></summary>

```bash
# Install Ollama
brew install ollama  # macOS
# Windows/Linux: https://ollama.com/download

# Download models
ollama pull qwen3:8b        # Text (8GB+ RAM)
ollama pull qwen2.5vl:7b    # Vision

# Select "Ollama" in Hawkeye settings
```

</details>

<br/>

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        HAWKEYE ENGINE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  PERCEPTION │───▶│  REASONING  │───▶│  EXECUTION  │         │
│  │   Engine    │    │   Engine    │    │   Engine    │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│        │                  │                  │                  │
│   • Screen OCR      • Claude/Ollama     • Shell Commands       │
│   • Clipboard       • Task Analysis     • File Operations      │
│   • File Watch      • Intent Detect     • App Control          │
│   • Window Track    • Suggestions       • Browser Auto         │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                         INTERFACES                              │
├───────────────┬───────────────┬───────────────┬─────────────────┤
│   🖥️ Desktop   │  🧩 VS Code    │  🌐 Chrome     │    📦 Core      │
│   (Electron)  │  Extension    │  Extension    │    (npm pkg)    │
└───────────────┴───────────────┴───────────────┴─────────────────┘
```

<br/>

## 📦 Project Structure

```
hawkeye/
├── packages/
│   ├── core/                 # 🧠 Core engine (local processing)
│   │   ├── perception/       #    Screen, clipboard, file monitoring
│   │   ├── ai/               #    AI providers (Claude, Ollama, etc.)
│   │   ├── execution/        #    Action execution system
│   │   └── storage/          #    Local database (SQLite)
│   │
│   ├── desktop/              # 🖥️  Electron desktop app
│   ├── vscode-extension/     # 🧩 VS Code extension
│   └── chrome-extension/     # 🌐 Chrome browser extension
│
├── docs/                     # 📖 Documentation
└── website/                  # 🌐 Marketing site
```

<br/>

## 🔒 Privacy & Security

| Aspect | How We Protect You |
|--------|-------------------|
| **Screenshots** | ✅ Analyzed locally, never uploaded |
| **Clipboard** | ✅ Processed on-device only |
| **Files** | ✅ Monitored locally, paths never sent |
| **AI Calls** | ✅ Only minimal context text sent (or use local LLM) |
| **Dangerous Ops** | ✅ Always requires your confirmation |

> 📁 All data stored in `~/.hawkeye/` — you own your data.

<br/>

## 📖 Usage Examples

### As a Library

```typescript
import { HawkeyeEngine } from '@hawkeye/core';

const engine = new HawkeyeEngine({
  provider: 'ollama',
  model: 'qwen3:8b'
});

// Get AI-powered suggestions based on current context
const suggestions = await engine.observe();

// Execute a suggestion with user confirmation
await engine.execute(suggestions[0].id);
```

### File Watcher

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

## 🗺️ Roadmap

- [x] Core perception engine
- [x] Desktop app (Electron)
- [x] VS Code extension
- [x] Chrome extension
- [x] Local LLM support (Ollama)
- [ ] Desktop ↔ Extension real-time sync
- [ ] Plugin system
- [ ] Custom workflow builder
- [ ] Mobile companion app

<br/>

## 🤝 Contributing

Contributions are what make the open source community amazing! Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

<br/>

## ⭐ Star History

<a href="https://star-history.com/#anthropics/hawkeye&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=anthropics/hawkeye&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=anthropics/hawkeye&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=anthropics/hawkeye&type=Date" />
 </picture>
</a>

<br/>

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

<br/>

---

<div align="center">

**[🌐 Website](https://hawkiyi.com)** · **[📖 Docs](https://hawkiyi.com/docs)** · **[🐦 Twitter](https://twitter.com/hawkeyeai)** · **[💬 Discord](https://discord.gg/hawkeye)**

<sub>Built with ❤️ by the Hawkeye Team</sub>

<br/>

**If Hawkeye helps you, please consider giving it a ⭐**

</div>
