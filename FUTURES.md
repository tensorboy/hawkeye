# Shadow FUTURES - Mobile AI Agent Expansion Roadmap

> "像鹰眼一样敏锐地观察，像助手一样体贴地执行 — 现在，无处不在。"
>
> *Watch keenly like a hawk, execute thoughtfully like an assistant — now, everywhere.*

---

## Vision: Shadow Mobile

将 Shadow 的**主动感知范式**从桌面扩展到移动端，让 AI 成为用户在任何设备上的智能助手。不同于传统的自动化测试工具（依赖控件 ID、xpath），Shadow Mobile 将采用**视觉理解 + 多模态 AI** 的方式，像人类一样"看屏幕"来操作手机。

### Core Principles (继承桌面端)

- **🔒 隐私优先**: 本地处理为主，数据不出设备
- **🦅 主动感知**: AI 主动观察、主动建议，而非被动响应
- **🎯 用户确认**: 所有操作需用户确认后执行
- **🔌 多 AI 支持**: Ollama 本地模型 / Claude / Gemini / OpenAI-compatible

---

## Industry Landscape: AI-Powered Mobile Automation

### 开源先驱项目

| 项目 | 来源 | 特点 | GitHub |
|------|------|------|--------|
| **MobiAgent** | IPADS Lab | 三模块架构 (Planner/Decider/Grounder)，AgentRR 加速框架 | [MobiAgent](https://github.com/IPADS-SAI/MobiAgent) |
| **Mobile-Agent** | 阿里巴巴 | 多模态视觉理解，跨 APP 操作，自我修正机制 | [MobileAgent](https://github.com/X-PLUG/MobileAgent) |
| **Droidrun** | Droidrun | Android/iOS 通用框架，6.2K Stars | [droidrun](https://github.com/droidrun/droidrun) |
| **AppAgent** | 腾讯 | 学习型 Agent，自主探索生成知识库 | [AppAgent](https://github.com/TencentQQGYLab/AppAgent) |
| **mobile-use** | Minitap AI | Python 库，集成 Maestro 测试框架 | [mobile-use](https://github.com/minitap-ai/mobile-use) |

### 技术共性

1. **视觉感知**: 通过截图 + 多模态 AI 理解屏幕内容
2. **ADB/XCUITest**: 底层通过调试桥执行点击、滑动、输入
3. **任务分解**: 将复杂任务拆解为单步操作
4. **自我修正**: 执行后截图验证，失败则回退重试

---

## Architecture: Shadow Mobile

### Phase 1: 远程控制模式 (Remote Control)

```
┌─────────────────────────────────────────────────────────────────┐
│                     Shadow Desktop (现有)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Perception │→ │  Reasoning  │→ │  Execution  │              │
│  │   Engine    │  │   Engine    │  │   Engine    │              │
│  └─────────────┘  └─────────────┘  └──────┬──────┘              │
│                                           │                      │
│                                    ┌──────▼──────┐              │
│                                    │   Mobile    │              │
│                                    │  Executor   │              │
│                                    └──────┬──────┘              │
└───────────────────────────────────────────┼─────────────────────┘
                                            │ ADB/USB/WiFi
                                    ┌───────▼───────┐
                                    │  Android/iOS  │
                                    │    Device     │
                                    └───────────────┘
```

**特点**:
- 复用现有桌面端推理引擎
- 通过 ADB (Android) / Instruments (iOS) 控制手机
- 低成本快速验证

### Phase 2: 原生 APP 模式 (Native App)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Shadow Mobile App                            │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Perception Layer                          ││
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   ││
│  │  │  Screen   │ │ Clipboard │ │   App     │ │Notification│   ││
│  │  │  Capture  │ │  Monitor  │ │  State    │ │  Listener │   ││
│  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘   ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
│  ┌───────────────────────────▼─────────────────────────────────┐│
│  │                    Reasoning Layer                           ││
│  │  ┌───────────────────────────────────────────────────────┐  ││
│  │  │              On-Device LLM (Ollama/MLX)               │  ││
│  │  │         or Cloud API (Claude/Gemini/OpenAI)           │  ││
│  │  └───────────────────────────────────────────────────────┘  ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
│  ┌───────────────────────────▼─────────────────────────────────┐│
│  │                    Execution Layer                           ││
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   ││
│  │  │Accessibility│ │   App    │ │  Share   │ │  Intent   │   ││
│  │  │  Service  │ │ Launcher │ │ Extension │ │  Sender   │   ││
│  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**技术选型**:

| 方案 | 平台 | 优势 | 劣势 |
|------|------|------|------|
| **React Native** | iOS + Android | 代码复用率高，生态成熟 | 性能受限，原生能力调用复杂 |
| **Flutter** | iOS + Android | 性能好，UI 一致性强 | 需要学习 Dart，包体积大 |
| **Swift + Kotlin** | 各平台原生 | 性能最优，系统 API 完整 | 开发成本翻倍 |
| **Tauri Mobile** | iOS + Android | Rust 核心，体积小 | 生态较新，移动端不成熟 |

**推荐**: **React Native** (快速迭代) → **原生 Swift/Kotlin** (深度集成)

---

## Feature Roadmap

### Milestone 1: Mobile Executor (v0.3.0)

> 远程控制 Android 设备

**目标**: 在桌面端添加移动设备执行能力

**功能**:
- [ ] ADB 连接管理 (USB/WiFi)
- [ ] 屏幕镜像与截图
- [ ] 基础操作: 点击、滑动、输入、返回
- [ ] 坐标定位器 (结合 OCR/视觉模型)
- [ ] 任务录制与回放

**技术依赖**:
```typescript
// packages/core/src/execution/mobile/
├── adb-client.ts      // ADB 协议实现
├── screen-mirror.ts   // scrcpy 集成
├── touch-executor.ts  // 触控操作
├── ocr-locator.ts     // 基于 OCR 的元素定位
└── task-recorder.ts   // 操作录制
```

### Milestone 2: Visual Understanding (v0.4.0)

> 多模态视觉理解能力

**目标**: AI 能"看懂"手机屏幕

**功能**:
- [ ] 屏幕元素识别 (按钮、输入框、列表)
- [ ] 图标语义理解 (即使没有文字)
- [ ] 上下文感知 (当前在哪个 APP、页面)
- [ ] 操作意图推断

**AI 模型选型**:
| 模型 | 类型 | 特点 |
|------|------|------|
| **Qwen2.5-VL** | 本地 | Ollama 支持，中文优化 |
| **LLaVA-NeXT** | 本地 | 开源，效果好 |
| **Claude Vision** | 云端 | 推理能力强 |
| **GPT-4o** | 云端 | 多模态标杆 |

### Milestone 3: Task Decomposition Engine (v0.5.0)

> 复杂任务自动拆解

**目标**: 一句话指令 → 多步骤执行计划

**示例**:
```
用户输入: "帮我在小红书找推荐的牛仔裤，然后在淘宝搜这款"

AI 分解:
1. 打开小红书
2. 点击搜索框
3. 输入 "推荐牛仔裤"
4. 滑动浏览结果
5. 记录第一条推荐的品牌和名称
6. 打开淘宝
7. 搜索记录的品牌和名称
8. 返回搜索结果
```

**架构** (参考 MobiAgent):
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Planner   │ ──▶ │   Decider   │ ──▶ │  Grounder   │
│  (制定计划)  │     │ (决定操作)   │     │ (精确定位)   │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Milestone 4: Cross-App Workflow (v0.6.0)

> 跨应用工作流

**目标**: 在多个 APP 之间自动完成任务

**示例场景**:
- 📸 **小红书 → 淘宝**: 看到喜欢的商品，自动去淘宝比价
- 📍 **高德 → 滴滴**: 规划路线后自动叫车
- 📧 **邮件 → 日历**: 识别会议邀请自动添加日程
- 💬 **微信 → 备忘录**: 保存重要聊天记录

**技术挑战**:
- 应用间状态传递
- 深度链接 (Deep Link) 调用
- 剪贴板数据桥接
- 失败回滚机制

### Milestone 5: Native Mobile App (v0.7.0)

> 原生移动应用

**目标**: 独立运行的 Shadow Mobile App

**Android 功能**:
- [ ] Accessibility Service (无障碍服务) — 核心执行能力
- [ ] Foreground Service — 后台感知
- [ ] Screen Capture API — 截屏分析
- [ ] Intent 系统 — 跨 APP 操作
- [ ] On-device LLM (Ollama/llama.cpp)

**iOS 功能**:
- [ ] Shortcuts 集成 — 系统级自动化
- [ ] Screen Time API — APP 使用分析
- [ ] Share Extension — 跨 APP 分享
- [ ] Core ML — 本地 AI 推理
- [ ] Siri Intents — 语音触发

### Milestone 6: Learning & Memory (v0.8.0)

> 学习与记忆系统

**目标**: AI 学习用户习惯，积累操作知识库

**功能** (参考 AppAgent):
- [ ] **自主探索**: 新 APP 自动学习 UI 结构
- [ ] **操作记忆**: 记录常用操作序列
- [ ] **知识库**: 生成 APP 使用文档
- [ ] **习惯学习**: 学习用户偏好和习惯

**数据结构**:
```typescript
interface AppKnowledge {
  appId: string;
  screens: Map<string, ScreenKnowledge>;
  commonFlows: WorkflowTemplate[];
  userPreferences: Preference[];
}

interface ScreenKnowledge {
  elements: UIElement[];
  transitions: Transition[];
  lastUpdated: Date;
}
```

---

## Technical Deep Dive

### 1. 屏幕理解 Pipeline

```
Screenshot → Preprocessing → OCR + Vision → UI Tree → Action Planning
    ↓            ↓              ↓            ↓            ↓
 Raw Image   Resize/Crop   Text+Icons    Elements    Next Step
```

**OCR 引擎选择**:
| 引擎 | 优势 | 适用场景 |
|------|------|----------|
| PaddleOCR | 中文最佳，开源 | 中文 APP |
| Tesseract | 多语言，轻量 | 英文 APP |
| Vision API | iOS 原生，快速 | iOS 设备 |
| ML Kit | Android 原生 | Android 设备 |

### 2. 执行层实现

**Android (ADB 方式)**:
```typescript
class ADBExecutor {
  async tap(x: number, y: number): Promise<void> {
    await this.execute(`input tap ${x} ${y}`);
  }

  async swipe(x1: number, y1: number, x2: number, y2: number): Promise<void> {
    await this.execute(`input swipe ${x1} ${y1} ${x2} ${y2} 300`);
  }

  async type(text: string): Promise<void> {
    await this.execute(`input text "${text}"`);
  }
}
```

**Android (Accessibility Service 方式)**:
```kotlin
class ShadowAccessibilityService : AccessibilityService() {
    fun performClick(nodeInfo: AccessibilityNodeInfo) {
        nodeInfo.performAction(AccessibilityNodeInfo.ACTION_CLICK)
    }

    fun performInput(nodeInfo: AccessibilityNodeInfo, text: String) {
        val bundle = Bundle()
        bundle.putCharSequence(
            AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
            text
        )
        nodeInfo.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, bundle)
    }
}
```

### 3. 安全与隐私

**权限最小化原则**:
```
┌─────────────────────────────────────────────────────┐
│                   Permission Model                   │
├─────────────────────────────────────────────────────┤
│  Level 1: 基础感知 (无需特殊权限)                      │
│  - 剪贴板监听                                         │
│  - 前台 APP 识别                                      │
├─────────────────────────────────────────────────────┤
│  Level 2: 深度感知 (需用户授权)                        │
│  - 屏幕截图                                           │
│  - 通知读取                                           │
├─────────────────────────────────────────────────────┤
│  Level 3: 主动执行 (需明确确认)                        │
│  - Accessibility Service                             │
│  - 自动化操作                                         │
└─────────────────────────────────────────────────────┘
```

**数据处理原则**:
- ✅ 截图仅在本地处理，处理后立即删除
- ✅ 敏感信息 (密码、支付) 自动模糊/跳过
- ✅ 所有操作需用户确认 (可配置信任列表)
- ✅ 审计日志可选择性开启

---

## Integration with Existing Ecosystem

### Desktop ↔ Mobile 同步

```
┌─────────────┐                    ┌─────────────┐
│   Desktop   │◄──── Sync ────────►│   Mobile    │
│   Shadow   │     Protocol       │   Shadow   │
└─────────────┘                    └─────────────┘
      │                                   │
      └───────────┬───────────────────────┘
                  ▼
          ┌─────────────┐
          │  Shared     │
          │  Memory &   │
          │  Workflows  │
          └─────────────┘
```

**同步内容**:
- 用户偏好设置
- 学习到的工作流
- 跨设备任务接力
- 统一的知识库

### 与现有开源项目的整合可能

| 项目 | 整合方式 | 价值 |
|------|----------|------|
| **Droidrun** | 作为 Android 执行后端 | 成熟的设备控制能力 |
| **mobile-use** | Python 库集成 | Maestro 测试框架 |
| **AppAgent** | 学习机制参考 | 知识库生成方法 |
| **MobiAgent** | 架构参考 | 三模块设计模式 |

---

## Success Metrics

### 技术指标

| 指标 | 目标 | 说明 |
|------|------|------|
| **任务成功率** | > 85% | 单步操作准确执行 |
| **端到端成功率** | > 70% | 完整任务流程完成 |
| **响应延迟** | < 3s | 从指令到首次操作 |
| **本地推理占比** | > 80% | 保护隐私 |

### 用户体验指标

| 指标 | 目标 | 说明 |
|------|------|------|
| **零配置启动** | 首次打开即可用 | 沿袭桌面端理念 |
| **学习曲线** | < 5分钟上手 | 无需技术背景 |
| **电池影响** | < 5% 日耗电 | 后台服务优化 |
| **存储占用** | < 200MB | 模型量化 + 按需下载 |

---

## Development Phases

```
2025 Q1          2025 Q2          2025 Q3          2025 Q4
    │                │                │                │
    ▼                ▼                ▼                ▼
┌────────┐     ┌────────┐      ┌────────┐      ┌────────┐
│ v0.3.0 │     │ v0.5.0 │      │ v0.7.0 │      │ v1.0.0 │
│ Mobile │────►│ Task   │─────►│ Native │─────►│ Full   │
│Executor│     │Decomp. │      │  App   │      │Platform│
└────────┘     └────────┘      └────────┘      └────────┘
    │                │                │                │
    │                │                │                │
ADB Control   Visual AI      iOS + Android      Learning
+ Screen      + Cross-App    + On-device        + Sync
  Mirror      Workflow          LLM             + Habits
```

---

## Call to Action

### 对开发者

Shadow Mobile 是一个充满挑战和机遇的项目。我们正在寻找：

- 🤖 **AI/ML 工程师**: 多模态模型微调、端侧推理优化
- 📱 **移动开发者**: Android/iOS 原生开发、Accessibility Service
- 🔧 **自动化专家**: ADB/Instruments、UI 自动化测试
- 🎨 **UX 设计师**: 移动端交互设计、无障碍设计

### 对用户

关注项目进展，成为早期测试者：

- ⭐ Star 本项目
- 🐛 提交 Issue 反馈需求
- 💬 加入讨论组分享使用场景

---

## References

### 学术论文

- [Mobile-Agent: Autonomous Multi-Modal Mobile Device Agent](https://arxiv.org/abs/2401.16158)
- [AppAgent: Multimodal Agents as Smartphone Users](https://arxiv.org/abs/2312.13771)
- [MobiAgent: An Efficient Mobile Agent Framework](https://arxiv.org/abs/2502.XXXXX)

### 开源项目

- [IPADS-SAI/MobiAgent](https://github.com/IPADS-SAI/MobiAgent)
- [X-PLUG/MobileAgent](https://github.com/X-PLUG/MobileAgent)
- [droidrun/droidrun](https://github.com/droidrun/droidrun)
- [TencentQQGYLab/AppAgent](https://github.com/TencentQQGYLab/AppAgent)
- [minitap-ai/mobile-use](https://github.com/minitap-ai/mobile-use)

### 技术资源

- [Android Accessibility Service](https://developer.android.com/guide/topics/ui/accessibility/service)
- [iOS Shortcuts](https://support.apple.com/guide/shortcuts/welcome/ios)
- [Ollama on Mobile](https://github.com/ollama/ollama/issues/mobile)

---

*Last Updated: 2025-01-22*

*This document is a living roadmap. Features and timelines may evolve based on community feedback and technical feasibility.*
