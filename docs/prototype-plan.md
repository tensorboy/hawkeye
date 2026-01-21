# Hawkeye 原型搭建计划 (1个月全端覆盖)

**目标**: 在1个月内完成 Desktop + Chrome Extension + VS Code Extension 三端原型
**开始时间**: 2026-01-20

---

## 组件选型

| 端 | 选用项目 | Stars | 技术栈 | 理由 |
|---|---------|-------|--------|------|
| **Desktop** | [Jan](https://github.com/janhq/jan) | 40K | Tauri + TypeScript + Rust | 最成熟、三平台支持、本地优先 |
| **Chrome** | [Page-Assist](https://github.com/n4ze3m/page-assist) | 3K+ | React + IndexedDB | 本地存储、侧边栏UI、支持Ollama |
| **VS Code** | [Continue](https://github.com/continuedev/continue) | 20K+ | TypeScript | 1.6M安装、支持Claude/Ollama |
| **核心引擎** | Hawkeye Core (现有) | - | TypeScript | 感知+推理+执行 |

---

## 时间线

```
Week 1 (1/20 - 1/26):  基础环境 + Desktop 原型
Week 2 (1/27 - 2/02):  Chrome 扩展集成
Week 3 (2/03 - 2/09):  VS Code 扩展集成
Week 4 (2/10 - 2/16):  三端联动 + 核心功能
Buffer (2/17 - 2/20):  测试 + 修复 + 演示准备
```

---

## Week 1: Desktop 原型 (1/20 - 1/26)

### Day 1-2: 环境搭建

```bash
# 1. Fork Jan 项目
git clone https://github.com/janhq/jan.git packages/desktop-jan
cd packages/desktop-jan

# 2. 安装依赖 (Jan 使用 Tauri)
# 需要 Rust 环境
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
npm install

# 3. 运行开发模式
npm run dev
```

**交付物**:
- [ ] Jan 本地跑起来 (Mac/Windows/Linux)
- [ ] 理解 Jan 的代码结构

### Day 3-4: 品牌替换

修改以下内容：
- [ ] App 名称: Jan → Hawkeye
- [ ] Logo 和 Icon
- [ ] 主题色调整
- [ ] 关于页面信息

**关键文件**:
```
jan/
├── electron/         # Electron 配置 (如果有)
├── web/              # Web UI
├── core/             # 核心逻辑
├── models/           # 模型管理
└── package.json      # 名称和版本
```

### Day 5-6: 集成 Hawkeye 感知层

将 Hawkeye 的感知功能移植到 Jan：

```typescript
// 添加屏幕感知
import { ScreenPerception } from '@hawkeye/core/perception';

// 添加剪贴板监控
import { ClipboardMonitor } from '@hawkeye/core/perception';

// 添加窗口追踪
import { WindowTracker } from '@hawkeye/core/perception';
```

**集成点**:
- [ ] 主进程中启动感知服务
- [ ] 渲染进程中显示感知结果
- [ ] 添加设置页面控制感知开关

### Day 7: 测试 + Buffer

- [ ] 三平台打包测试 (Mac/Windows/Linux)
- [ ] 基础功能验证
- [ ] 记录问题和下周计划

**Week 1 交付物**:
- ✅ Hawkeye Desktop App v0.1 (基于 Jan)
- ✅ 支持 Windows/Mac/Linux
- ✅ 包含基础感知功能

---

## Week 2: Chrome 扩展 (1/27 - 2/02)

### Day 1-2: Fork 并理解 Page-Assist

```bash
# 1. Fork Page-Assist
git clone https://github.com/n4ze3m/page-assist.git packages/chrome-extension

# 2. 安装依赖
cd packages/chrome-extension
npm install

# 3. 构建扩展
npm run build

# 4. 在 Chrome 中加载 (chrome://extensions)
```

**理解结构**:
```
page-assist/
├── src/
│   ├── components/    # React 组件
│   ├── hooks/         # React Hooks
│   ├── db/            # IndexedDB 存储
│   └── sidepanel/     # 侧边栏 UI
├── manifest.json      # 扩展配置
└── package.json
```

### Day 3-4: 品牌替换 + UI 调整

- [ ] 扩展名称: Page Assist → Hawkeye
- [ ] 图标和 Logo
- [ ] 主题色
- [ ] 移除不需要的功能

### Day 5-6: 添加 Hawkeye 功能

```typescript
// 1. 添加页面内容感知
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    // 感知当前页面
    analyzePageContent(tab);
  }
});

// 2. 添加选中文本分析
chrome.contextMenus.create({
  id: 'hawkeye-analyze',
  title: 'Hawkeye: 分析选中内容',
  contexts: ['selection']
});

// 3. 添加与 Desktop 通信
// 通过 Native Messaging 或 localhost API
```

### Day 7: 测试 + 与 Desktop 联调

- [ ] 扩展功能测试
- [ ] 与 Desktop 建立通信
- [ ] 记录问题

**Week 2 交付物**:
- ✅ Hawkeye Chrome Extension v0.1
- ✅ 侧边栏 AI 对话
- ✅ 页面内容分析
- ✅ 与 Desktop 基础通信

---

## Week 3: VS Code 扩展 (2/03 - 2/09)

### Day 1-2: Fork 并理解 Continue

```bash
# 1. Fork Continue
git clone https://github.com/continuedev/continue.git packages/vscode-extension

# 2. 进入扩展目录
cd packages/vscode-extension/extensions/vscode

# 3. 安装依赖
npm install

# 4. 调试运行 (F5)
```

**结构理解**:
```
continue/
├── core/                  # 核心逻辑
├── extensions/
│   └── vscode/            # VS Code 扩展
│       ├── src/
│       │   ├── extension.ts
│       │   └── ...
│       └── package.json
└── gui/                   # GUI 组件
```

### Day 3-4: 品牌替换 + 精简功能

- [ ] 扩展名称: Continue → Hawkeye
- [ ] 图标和 Logo
- [ ] 移除不需要的 Provider (保留 Claude + Ollama)
- [ ] 简化 UI

### Day 5-6: 添加 Hawkeye 功能

```typescript
// 1. 监听文件变化
vscode.workspace.onDidSaveTextDocument((document) => {
  // 分析保存的文件，生成建议
  analyzeFileChange(document);
});

// 2. 监听错误诊断
vscode.languages.onDidChangeDiagnostics((event) => {
  // 检测到错误时，主动提供帮助
  handleDiagnostics(event);
});

// 3. 与 Desktop 通信
// 通过 localhost API
```

### Day 7: 测试 + 三端联调

- [ ] VS Code 扩展功能测试
- [ ] 三端通信验证
- [ ] 记录问题

**Week 3 交付物**:
- ✅ Hawkeye VS Code Extension v0.1
- ✅ 代码辅助功能
- ✅ 错误自动分析
- ✅ 与 Desktop 通信

---

## Week 4: 三端联动 + 核心功能 (2/10 - 2/16)

### Day 1-2: 统一通信协议

```typescript
// 定义统一的消息格式
interface HawkeyeMessage {
  type: 'context' | 'suggestion' | 'execution' | 'sync';
  source: 'desktop' | 'chrome' | 'vscode';
  payload: {
    context?: PerceptionContext;
    suggestion?: TaskSuggestion;
    execution?: ExecutionRequest;
  };
  timestamp: number;
}

// 通信方式
// Desktop <-> Chrome: WebSocket (localhost:31337)
// Desktop <-> VS Code: HTTP API (localhost:31338)
```

### Day 3-4: 统一存储格式

```typescript
// 使用 SQLite 作为统一存储
// Desktop: better-sqlite3
// Chrome: sql.js (WASM)
// VS Code: better-sqlite3

interface HawkeyeStorage {
  // 建议历史
  suggestions: TaskSuggestion[];

  // 执行历史
  executions: ExecutionResult[];

  // 用户偏好
  preferences: UserPreferences;

  // 会话数据
  sessions: Session[];
}
```

### Day 5-6: Human-in-the-Loop 流程

实现核心的"计划 → 确认 → 执行"流程：

```typescript
// 1. 感知触发
onPerception(context) {
  // 2. 生成计划
  const plan = await reasoning.generatePlan(context);

  // 3. 显示给用户 (带优缺点分析)
  const approved = await ui.showPlanConfirmation(plan);

  // 4. 用户确认后执行
  if (approved) {
    const result = await execution.execute(plan);
    ui.showResult(result);
  }
}
```

### Day 7: 集成测试

- [ ] 完整流程测试
- [ ] 跨端同步测试
- [ ] 性能测试
- [ ] Bug 修复

**Week 4 交付物**:
- ✅ 三端统一通信
- ✅ 统一存储格式
- ✅ Human-in-the-Loop 完整流程
- ✅ 基础同步功能

---

## Buffer Days (2/17 - 2/20): 打磨 + 演示

### 任务

1. **Bug 修复**
   - [ ] 收集并修复所有已知问题
   - [ ] 边界情况处理

2. **UI 打磨**
   - [ ] 统一三端视觉风格
   - [ ] 添加 Loading 状态
   - [ ] 错误提示优化

3. **文档**
   - [ ] 更新 README
   - [ ] 录制演示视频
   - [ ] 准备发布说明

4. **打包发布**
   - [ ] Desktop: Mac DMG, Windows EXE, Linux AppImage
   - [ ] Chrome: CRX 包
   - [ ] VS Code: VSIX 包

---

## 技术栈总结

| 层 | 技术 | 来源 |
|---|------|------|
| **Desktop 框架** | Tauri | Jan |
| **Desktop UI** | React + TypeScript | Jan |
| **Chrome 框架** | Manifest V3 | Page-Assist |
| **Chrome UI** | React + IndexedDB | Page-Assist |
| **VS Code 框架** | VS Code Extension API | Continue |
| **核心引擎** | TypeScript | Hawkeye |
| **AI 集成** | Claude API + Ollama | 混合 |
| **存储** | SQLite | 统一 |
| **通信** | WebSocket + HTTP | 自建 |

---

## 风险与缓解

| 风险 | 概率 | 缓解措施 |
|------|------|---------|
| Jan 代码复杂度高 | 中 | 先理解核心，逐步修改 |
| 三端通信不稳定 | 中 | 先实现 Desktop↔Chrome，再加 VS Code |
| 时间不够 | 中 | 优先保证 Desktop + Chrome |
| 兼容性问题 | 低 | 先 Mac，再 Windows，最后 Linux |

---

## 成功标准

### MVP 必须有

- [ ] Desktop App 可以启动并显示 AI 对话
- [ ] Desktop 可以截屏并发送给 AI 分析
- [ ] Chrome 扩展可以分析当前网页
- [ ] VS Code 扩展可以分析代码错误
- [ ] Desktop 可以显示来自 Chrome/VS Code 的上下文
- [ ] 用户可以确认/拒绝建议

### Nice to Have

- [ ] 三端实时同步
- [ ] 习惯学习（基础版）
- [ ] 自动化工作流
- [ ] 多语言支持

---

## 立即开始

```bash
# 今天就开始 Week 1, Day 1

# 1. 创建工作目录
mkdir -p ~/hawkeye-prototype
cd ~/hawkeye-prototype

# 2. Fork Jan
git clone https://github.com/janhq/jan.git desktop

# 3. 安装 Rust (Jan 需要)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 4. 进入 Jan 目录
cd desktop
npm install

# 5. 运行
npm run dev
```

---

**准备好了就开始吧！** 🚀
