# Hawkeye 产品需求文档 (PRD)

**版本**: 2.5
**最后更新**: 2026-01-20
**作者**: Hawkeye Team
**状态**: Draft

---

## 目录

1. [执行摘要](#1-执行摘要)
2. [愿景与目标](#2-愿景与目标)
3. [用户研究与场景](#3-用户研究与场景)
4. [核心功能规格](#4-核心功能规格)
5. [本地存储架构 (MemOS 集成)](#5-本地存储架构-memos-集成)
6. [用户行为追踪与习惯识别](#6-用户行为追踪与习惯识别)
7. [上下文感知与意图检测](#7-上下文感知与意图检测)
8. [智能计划生成与分析](#8-智能计划生成与分析)
9. [执行引擎与认证系统](#9-执行引擎与认证系统)
10. [技术架构](#10-技术架构)
11. [API 设计与集成点](#11-api-设计与集成点)
12. [隐私、安全与合规](#12-隐私安全与合规)
13. [竞品分析](#13-竞品分析)
14. [实施路线图](#14-实施路线图)
15. [成功指标与 KPI](#15-成功指标与-kpi)
16. [市场痛点与解决方案](#16-市场痛点与解决方案)
17. [零输入傻瓜式体验设计](#17-零输入傻瓜式体验设计)
18. [附录](#18-附录)
    - [18.1 术语表](#181-术语表)
    - [18.2 参考资料](#182-参考资料)
    - [18.3 相关文档](#183-相关文档)
    - [18.4 版本历史](#184-版本历史)

---

## 1. 执行摘要

### 1.1 产品定位

**Hawkeye** 是一款 **AI 驱动的智能任务感知与执行助手**，通过持续观察用户的工作环境（屏幕、窗口、剪贴板、文件系统），主动理解用户意图，生成可执行的任务建议，并在用户确认后自动执行。

**核心理念**: "像鹰眼一样敏锐地观察，像助手一样贴心地执行"

### 1.2 核心价值主张

| 价值点 | 描述 |
|--------|------|
| **主动感知** | 不等用户提问，主动发现可以帮助的点 |
| **本地优先** | 所有数据处理在本地，保护隐私 |
| **人类决策** | 建议优先，人类决定是否执行 |
| **10x 效率** | 让 AI 成为每个人的鹰眼，帮你发现并抓住机会 |

### 1.3 目标用户

- **程序员**: 代码错误分析、自动化工作流
- **设计师**: 素材管理、设计资源整理
- **学生**: 学习资料整理、研究笔记管理
- **上班族**: 文档处理、会议准备、邮件管理
- **内容创作者**: 素材收集、发布流程自动化

### 1.4 核心差异化

| 特性 | Hawkeye | Claude Code/Cursor | Eigent | 传统自动化工具 |
|------|---------|-------------------|--------|---------------|
| 交互模式 | 主动感知 | 被动响应 | 主动+被动 | 被动触发 |
| 触发方式 | 持续观察 | 用户调用 | 任务驱动 | 规则触发 |
| 适用场景 | 全场景 | 编程为主 | 工作流 | 特定场景 |
| 数据位置 | 本地优先 | 云端 | 可选 | 视工具而定 |
| 学习能力 | 习惯学习 | 会话内 | 工作流学习 | 无 |

---

## 2. 愿景与目标

### 2.1 产品愿景

**让 AI 成为每个人的鹰眼，实现 10 倍工作效率。**

我们相信：
- AI 应该是普惠的，不仅限于技术人员
- 智能助手应该主动发现机会，而不只是被动响应
- 用户数据应该留在本地，隐私至上
- 最终决策权永远在人类手中

### 2.2 产品目标

#### 短期目标 (0-6 个月)
1. 完成核心感知-推理-执行引擎
2. 发布 Desktop、VS Code、Chrome 三端应用
3. 实现基础的用户行为追踪
4. 支持 Claude API 和本地 LLM (Ollama)
5. 月活用户达到 10,000

#### 中期目标 (6-12 个月)
1. 集成 MemOS 实现高级记忆管理
2. 实现智能习惯识别和个性化建议
3. 支持自定义工作流和插件系统
4. 跨设备同步（端到端加密）
5. 月活用户达到 100,000

#### 长期目标 (12-24 个月)
1. 实现多代理协作 (Multi-Agent)
2. 企业版本 (SSO、审计日志)
3. 移动端应用 (iOS/Android)
4. 打造 Hawkeye 插件生态
5. 成为个人生产力的标准工具

### 2.3 设计原则

1. **Privacy by Design**: 隐私保护内置于每个功能设计中
2. **Human in the Loop**: 所有执行都需要人类确认
3. **Progressive Disclosure**: 渐进式功能展示，不让新用户感到困惑
4. **Offline First**: 核心功能离线可用
5. **Open Source**: 代码透明，社区驱动

---

## 3. 用户研究与场景

### 3.1 用户画像

#### 画像 A: 全栈开发者小明
- **年龄**: 28 岁
- **工作**: 初创公司全栈工程师
- **痛点**:
  - 经常需要在多个项目间切换，容易忘记上下文
  - 遇到报错需要手动复制到搜索引擎
  - 文件下载后经常忘记整理
- **期望**:
  - 自动识别报错并给出解决方案
  - 智能管理下载文件
  - 记住项目上下文

#### 画像 B: 产品经理小红
- **年龄**: 32 岁
- **工作**: 互联网公司产品经理
- **痛点**:
  - 每天处理大量文档和邮件
  - 会议记录整理耗时
  - 竞品分析需要收集大量资料
- **期望**:
  - 自动整理会议笔记
  - 智能分类邮件
  - 帮助收集和整理研究资料

#### 画像 C: 大学生小华
- **年龄**: 22 岁
- **身份**: 计算机专业大学生
- **痛点**:
  - 学习资料散落各处
  - 作业代码经常出错不知道如何调试
  - 论文写作需要大量参考资料
- **期望**:
  - 自动整理学习笔记
  - 帮助分析代码错误
  - 智能管理参考文献

### 3.2 核心使用场景

#### 场景 1: 错误诊断与修复
```
[触发] 用户复制了一段错误信息到剪贴板
[感知] Hawkeye 检测到剪贴板内容是错误日志
[分析] AI 分析错误原因，搜索相关解决方案
[建议] 显示 3 个可能的解决方案
[执行] 用户选择方案后，Hawkeye 自动执行修复命令
```

#### 场景 2: 文件智能整理
```
[触发] 用户下载了一个设计稿 .sketch 文件
[感知] Hawkeye 检测到新文件下载
[分析] 识别文件类型，分析用户的文件组织习惯
[建议] 建议移动到 ~/Design/Projects/ProjectName/
[执行] 用户确认后，自动移动并重命名文件
```

#### 场景 3: 工作上下文恢复
```
[触发] 用户打开 VS Code 开始工作
[感知] Hawkeye 检测到用户进入开发环境
[分析] 根据历史记录，识别用户正在处理的项目
[建议] "您昨天在处理 API 认证模块，需要我打开相关文件吗？"
[执行] 用户确认后，打开相关文件和终端
```

#### 场景 4: 重复任务自动化发现
```
[触发] 用户连续 3 天在相同时间执行相同操作
[感知] Hawkeye 识别出重复模式
[分析] 分析操作序列，判断是否可以自动化
[建议] "我发现您每天早上都会执行这些操作，需要我帮您创建自动化工作流吗？"
[执行] 用户确认后，创建定时自动化任务
```

#### 场景 5: 智能研究助手
```
[触发] 用户在浏览器中阅读技术文章
[感知] Hawkeye 通过 Chrome 扩展检测到页面内容
[分析] 识别出用户正在研究某个技术主题
[建议] "需要我将这篇文章保存到您的 'AI Research' 文件夹，并提取关键要点吗？"
[执行] 用户确认后，保存文章、生成摘要、添加到知识库
```

---

## 4. 核心功能规格

### 4.1 功能架构总览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Hawkeye 功能架构                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │  感知层      │───▶│  推理层      │───▶│  执行层      │              │
│  │ Perception   │    │  Reasoning   │    │  Execution   │              │
│  └──────────────┘    └──────────────┘    └──────────────┘              │
│         │                   │                   │                       │
│         ▼                   ▼                   ▼                       │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │ · 屏幕截图   │    │ · 意图理解   │    │ · Shell命令  │              │
│  │ · 窗口追踪   │    │ · 上下文关联 │    │ · 文件操作   │              │
│  │ · 剪贴板     │    │ · 计划生成   │    │ · 应用控制   │              │
│  │ · 文件监控   │    │ · 优劣分析   │    │ · 浏览器自动化│              │
│  │ · 键盘活动   │    │ · 置信度评估 │    │ · API调用    │              │
│  └──────────────┘    └──────────────┘    └──────────────┘              │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                       存储与记忆层 (MemOS)                       │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │    │
│  │  │ 短期记忆 │  │ 长期记忆 │  │ 习惯模型 │  │ 知识图谱 │        │    │
│  │  │ Session  │  │ Persistent│  │ Behavior │  │ Knowledge│        │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                        用户界面层                                │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │    │
│  │  │ Desktop │  │ VS Code │  │ Chrome  │  │ Web (Future)│        │    │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 感知层 (Perception Layer)

#### 4.2.1 屏幕感知
| 功能 | 描述 | 优先级 |
|------|------|--------|
| 全屏截图 | 定时或触发式全屏截图 | P0 |
| 活动窗口截图 | 仅截取当前活动窗口 | P0 |
| 区域截图 | 用户指定区域截图 | P1 |
| OCR 识别 | 从截图中提取文本 | P0 |
| UI 元素识别 | 识别按钮、输入框等 | P2 |
| 变化检测 | 检测屏幕内容变化 | P1 |

**配置参数**:
```typescript
interface ScreenPerceptionConfig {
  captureInterval: number;        // 截图间隔 (ms), 默认 5000
  captureMode: 'fullscreen' | 'activeWindow' | 'region';
  enableOCR: boolean;             // 是否启用 OCR
  ocrLanguages: string[];         // OCR 语言, 默认 ['en', 'zh']
  qualityLevel: 'low' | 'medium' | 'high';  // 图片质量
  maxStorageSize: number;         // 最大存储大小 (MB)
}
```

#### 4.2.2 窗口追踪
| 功能 | 描述 | 优先级 |
|------|------|--------|
| 活动窗口检测 | 检测当前活动窗口 | P0 |
| 应用识别 | 识别窗口所属应用 | P0 |
| 窗口标题提取 | 提取窗口标题文本 | P0 |
| 窗口切换历史 | 记录窗口切换序列 | P1 |
| 应用使用时长 | 统计各应用使用时间 | P1 |

#### 4.2.3 剪贴板监控
| 功能 | 描述 | 优先级 |
|------|------|--------|
| 文本监控 | 监控复制的文本内容 | P0 |
| 图片监控 | 监控复制的图片 | P1 |
| 文件路径监控 | 监控复制的文件路径 | P1 |
| 内容分类 | 自动识别内容类型 | P0 |
| 历史记录 | 保存剪贴板历史 | P1 |

**内容分类类型**:
```typescript
enum ClipboardContentType {
  CODE_ERROR = 'code_error',       // 代码错误信息
  CODE_SNIPPET = 'code_snippet',   // 代码片段
  URL = 'url',                     // 网址
  FILE_PATH = 'file_path',         // 文件路径
  PLAIN_TEXT = 'plain_text',       // 普通文本
  JSON_DATA = 'json_data',         // JSON 数据
  EMAIL = 'email',                 // 邮件内容
  COMMAND = 'command',             // 命令
  IMAGE = 'image',                 // 图片
  UNKNOWN = 'unknown'              // 未知
}
```

#### 4.2.4 文件系统监控
| 功能 | 描述 | 优先级 |
|------|------|--------|
| 文件创建监控 | 检测新文件创建 | P0 |
| 文件修改监控 | 检测文件内容变化 | P1 |
| 文件移动监控 | 检测文件移动/重命名 | P1 |
| 文件删除监控 | 检测文件删除 | P2 |
| 目录变化监控 | 监控指定目录变化 | P0 |

**监控配置**:
```typescript
interface FileWatcherConfig {
  watchPaths: string[];           // 监控路径
  ignorePatterns: string[];       // 忽略模式
  debounceMs: number;             // 防抖时间
  maxDepth: number;               // 最大递归深度
  events: ('create' | 'modify' | 'move' | 'delete')[];
}
```

### 4.3 推理层 (Reasoning Layer)

#### 4.3.1 意图理解引擎
```typescript
interface IntentAnalysis {
  // 主要意图
  primaryIntent: {
    type: IntentType;
    confidence: number;           // 0-1
    description: string;
  };

  // 次要意图 (可能的其他意图)
  secondaryIntents: Array<{
    type: IntentType;
    confidence: number;
    description: string;
  }>;

  // 上下文信息
  context: {
    currentActivity: string;      // 当前活动描述
    recentHistory: string[];      // 近期历史
    relatedTasks: string[];       // 相关任务
  };

  // 情感/状态分析
  sentiment: {
    frustration: number;          // 沮丧程度 0-1
    urgency: number;              // 紧急程度 0-1
    complexity: number;           // 复杂程度 0-1
  };
}

enum IntentType {
  DEBUG = 'debug',                // 调试/排错
  ORGANIZE = 'organize',          // 整理/组织
  RESEARCH = 'research',          // 研究/学习
  CREATE = 'create',              // 创建/编写
  COMMUNICATE = 'communicate',    // 沟通/协作
  AUTOMATE = 'automate',          // 自动化
  NAVIGATE = 'navigate',          // 导航/查找
  REVIEW = 'review',              // 审核/检查
  UNKNOWN = 'unknown'             // 未知
}
```

#### 4.3.2 计划生成引擎
```typescript
interface TaskPlan {
  id: string;
  title: string;
  description: string;

  // 计划步骤
  steps: PlanStep[];

  // 预估信息
  estimates: {
    duration: number;             // 预估时长 (秒)
    complexity: 'low' | 'medium' | 'high';
    riskLevel: 'safe' | 'moderate' | 'risky';
  };

  // 优缺点分析
  analysis: {
    pros: string[];               // 优点
    cons: string[];               // 缺点
    alternatives: TaskPlan[];     // 替代方案
    risks: string[];              // 潜在风险
    mitigations: string[];        // 风险缓解措施
  };

  // 依赖和前置条件
  dependencies: {
    requiredPermissions: string[];
    requiredTools: string[];
    prerequisites: string[];
  };

  confidence: number;             // 计划置信度 0-1
  createdAt: Date;
  expiresAt: Date;                // 计划过期时间
}

interface PlanStep {
  id: string;
  order: number;
  action: TaskAction;
  description: string;

  // 条件执行
  condition?: {
    type: 'if' | 'unless';
    expression: string;
  };

  // 错误处理
  onError?: {
    strategy: 'retry' | 'skip' | 'abort' | 'fallback';
    fallbackAction?: TaskAction;
    maxRetries?: number;
  };

  // 用户确认
  requiresConfirmation: boolean;
  confirmationPrompt?: string;
}
```

### 4.4 执行层 (Execution Layer)

#### 4.4.1 执行器类型
| 执行器 | 功能 | 安全级别 |
|--------|------|---------|
| ShellExecutor | 执行 Shell 命令 | High |
| FileExecutor | 文件操作 | Medium |
| AppExecutor | 应用控制 | Medium |
| BrowserExecutor | 浏览器自动化 | Medium |
| APIExecutor | 调用外部 API | High |
| NotificationExecutor | 系统通知 | Low |

#### 4.4.2 执行安全模型
```typescript
interface ExecutionSecurity {
  // 权限级别
  permissionLevel: 'system' | 'user' | 'sandbox';

  // 命令白名单/黑名单
  commandAllowlist: string[];
  commandBlocklist: string[];

  // 文件访问控制
  fileAccessRules: {
    allowedPaths: string[];
    blockedPaths: string[];
    readOnly: string[];
  };

  // 执行限制
  executionLimits: {
    maxConcurrent: number;        // 最大并发执行数
    maxDuration: number;          // 最大执行时长 (秒)
    maxRetries: number;           // 最大重试次数
    cooldownMs: number;           // 执行冷却时间
  };

  // 确认策略
  confirmationPolicy: {
    alwaysConfirm: boolean;
    confirmDestructive: boolean;
    confirmNetwork: boolean;
    autoApprovePatterns: string[];
  };
}
```

#### 4.4.3 执行结果处理
```typescript
interface ExecutionResult {
  id: string;
  planId: string;
  stepId: string;

  status: 'success' | 'failed' | 'cancelled' | 'timeout';

  // 执行详情
  details: {
    startTime: Date;
    endTime: Date;
    duration: number;
    output?: string;
    error?: {
      code: string;
      message: string;
      stack?: string;
    };
  };

  // 影响分析
  impact: {
    filesModified: string[];
    filesCreated: string[];
    filesDeleted: string[];
    commandsRun: string[];
  };

  // 回滚信息
  rollback?: {
    canRollback: boolean;
    rollbackSteps: RollbackStep[];
  };
}
```

---

## 5. 本地存储架构 (MemOS 集成)

### 5.1 存储架构概述

Hawkeye 采用 **MemOS** 作为核心记忆管理系统，实现多维度的本地数据存储和智能检索。

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Hawkeye 存储架构                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                      MemOS Memory Layer                         │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │    │
│  │  │ Episodic │  │ Semantic │  │Procedural│  │ Working  │        │    │
│  │  │  Memory  │  │  Memory  │  │  Memory  │  │  Memory  │        │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │    │
│  │       │             │             │             │                │    │
│  │       ▼             ▼             ▼             ▼                │    │
│  │  [事件记录]    [知识图谱]    [行为模式]    [当前上下文]         │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                              │                                          │
│  ┌───────────────────────────┼───────────────────────────────────┐    │
│  │                    Storage Backend                              │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │    │
│  │  │  SQLite  │  │ LevelDB  │  │  Vector  │  │   File   │        │    │
│  │  │(Metadata)│  │(KV Store)│  │  Store   │  │ System   │        │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  存储位置: ~/.hawkeye/                                                  │
│  ├── db/                   # SQLite 数据库                              │
│  ├── memory/               # MemOS 记忆存储                             │
│  ├── vectors/              # 向量索引                                    │
│  ├── cache/                # 临时缓存                                    │
│  ├── logs/                 # 日志文件                                    │
│  └── config/               # 配置文件                                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 记忆类型定义

#### 5.2.1 情节记忆 (Episodic Memory)
记录用户的具体行为事件和上下文。

```typescript
interface EpisodicMemory {
  id: string;
  timestamp: Date;

  // 事件信息
  event: {
    type: EventType;
    source: 'screen' | 'clipboard' | 'file' | 'window' | 'keyboard';
    data: Record<string, any>;
  };

  // 上下文快照
  context: {
    activeWindow: WindowInfo;
    recentClipboard: string;
    openFiles: string[];
    runningApps: string[];
  };

  // 元数据
  metadata: {
    importance: number;           // 重要性 0-1
    emotionalValence: number;     // 情感倾向 -1 到 1
    tags: string[];
  };

  // 关联
  associations: {
    relatedMemories: string[];    // 相关记忆 ID
    causalLinks: string[];        // 因果关联
  };

  // 衰减信息
  decay: {
    lastAccessed: Date;
    accessCount: number;
    retentionScore: number;       // 保留分数，低于阈值可清理
  };
}

enum EventType {
  SCREEN_CAPTURE = 'screen_capture',
  CLIPBOARD_COPY = 'clipboard_copy',
  FILE_CREATED = 'file_created',
  FILE_MODIFIED = 'file_modified',
  FILE_MOVED = 'file_moved',
  WINDOW_SWITCH = 'window_switch',
  APP_LAUNCH = 'app_launch',
  APP_CLOSE = 'app_close',
  SUGGESTION_SHOWN = 'suggestion_shown',
  SUGGESTION_ACCEPTED = 'suggestion_accepted',
  SUGGESTION_REJECTED = 'suggestion_rejected',
  TASK_STARTED = 'task_started',
  TASK_COMPLETED = 'task_completed',
  ERROR_DETECTED = 'error_detected'
}
```

#### 5.2.2 语义记忆 (Semantic Memory)
存储结构化的知识和概念关系。

```typescript
interface SemanticMemory {
  id: string;

  // 知识节点
  node: {
    type: 'concept' | 'entity' | 'relation' | 'fact';
    name: string;
    description: string;
    properties: Record<string, any>;
  };

  // 关系
  relations: Array<{
    type: RelationType;
    targetId: string;
    weight: number;               // 关系强度 0-1
    bidirectional: boolean;
  }>;

  // 来源
  provenance: {
    source: 'user_input' | 'inferred' | 'external';
    confidence: number;
    evidence: string[];
  };

  // 向量嵌入 (用于语义搜索)
  embedding?: number[];
}

enum RelationType {
  IS_A = 'is_a',                  // 是一个
  PART_OF = 'part_of',            // 属于
  RELATED_TO = 'related_to',      // 相关
  CAUSES = 'causes',              // 导致
  DEPENDS_ON = 'depends_on',      // 依赖
  SIMILAR_TO = 'similar_to',      // 相似
  OPPOSITE_OF = 'opposite_of',    // 相反
  USED_FOR = 'used_for',          // 用于
  LOCATED_IN = 'located_in',      // 位于
  CREATED_BY = 'created_by'       // 由...创建
}
```

#### 5.2.3 程序性记忆 (Procedural Memory)
存储用户的行为模式和工作流程。

```typescript
interface ProceduralMemory {
  id: string;

  // 模式定义
  pattern: {
    name: string;
    description: string;
    triggerConditions: TriggerCondition[];
    actionSequence: RecordedAction[];
  };

  // 统计信息
  statistics: {
    occurrenceCount: number;      // 出现次数
    successRate: number;          // 成功率
    averageDuration: number;      // 平均时长
    lastOccurrence: Date;
    firstOccurrence: Date;
  };

  // 变体
  variants: Array<{
    actionSequence: RecordedAction[];
    frequency: number;
  }>;

  // 自动化状态
  automation: {
    isAutomated: boolean;
    automationConfig?: WorkflowConfig;
    lastAutoRun?: Date;
  };
}

interface RecordedAction {
  type: string;
  target: string;
  parameters: Record<string, any>;
  timestamp: Date;
  duration: number;
}

interface TriggerCondition {
  type: 'time' | 'event' | 'context' | 'sequence';
  condition: Record<string, any>;
}
```

#### 5.2.4 工作记忆 (Working Memory)
当前会话的短期记忆。

```typescript
interface WorkingMemory {
  sessionId: string;
  startTime: Date;

  // 当前上下文
  currentContext: {
    activeTask: string;
    focusedWindow: WindowInfo;
    recentActions: RecentAction[];
    pendingSuggestions: TaskSuggestion[];
  };

  // 注意力焦点
  attentionFocus: {
    primaryFocus: string;         // 主要关注点
    secondaryFoci: string[];      // 次要关注点
    distractions: string[];       // 干扰项
  };

  // 临时状态
  temporaryState: {
    flags: Record<string, boolean>;
    counters: Record<string, number>;
    buffers: Record<string, any>;
  };

  // 容量限制
  capacity: {
    maxItems: number;             // 最大项目数
    currentItems: number;
    oldestItemAge: number;        // 最老项目年龄 (秒)
  };
}
```

### 5.3 MemOS 集成配置

```typescript
interface MemOSConfig {
  // 基础配置
  storagePath: string;            // 存储路径
  encryptionEnabled: boolean;     // 是否加密
  encryptionKey?: string;         // 加密密钥

  // 记忆配置
  memory: {
    // 情节记忆
    episodic: {
      maxItems: number;           // 最大记录数
      retentionDays: number;      // 保留天数
      importanceThreshold: number;// 重要性阈值
      autoConsolidate: boolean;   // 自动整合
    };

    // 语义记忆
    semantic: {
      embeddingModel: string;     // 嵌入模型
      embeddingDimensions: number;
      maxNodes: number;
      autoInference: boolean;     // 自动推理
    };

    // 程序性记忆
    procedural: {
      patternDetectionEnabled: boolean;
      minOccurrences: number;     // 最小出现次数才记录
      patternSimilarityThreshold: number;
    };

    // 工作记忆
    working: {
      maxItems: number;
      expirationMinutes: number;
    };
  };

  // 检索配置
  retrieval: {
    maxResults: number;
    similarityThreshold: number;
    enableSemanticSearch: boolean;
    enableTemporalDecay: boolean;
  };

  // 维护配置
  maintenance: {
    autoCleanup: boolean;
    cleanupIntervalHours: number;
    backupEnabled: boolean;
    backupIntervalDays: number;
    maxBackups: number;
  };
}
```

### 5.4 数据同步机制

```typescript
interface SyncConfig {
  // 同步目标
  targets: Array<{
    type: 'desktop' | 'vscode' | 'chrome' | 'mobile';
    enabled: boolean;
    priority: number;
  }>;

  // 同步策略
  strategy: {
    mode: 'realtime' | 'periodic' | 'manual';
    intervalMs?: number;          // 周期模式的间隔
    conflictResolution: 'newest' | 'oldest' | 'merge' | 'ask';
  };

  // 同步范围
  scope: {
    syncEpisodic: boolean;
    syncSemantic: boolean;
    syncProcedural: boolean;
    syncWorking: boolean;
    syncSuggestionHistory: boolean;
    syncExecutionHistory: boolean;
  };

  // 安全
  security: {
    encryptInTransit: boolean;
    verifyIntegrity: boolean;
  };
}
```

---

## 6. 用户行为追踪与习惯识别

### 6.1 行为追踪框架

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       用户行为追踪系统                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │   数据收集   │───▶│   特征提取   │───▶│   模式识别   │              │
│  │  Collection  │    │  Extraction  │    │  Recognition │              │
│  └──────────────┘    └──────────────┘    └──────────────┘              │
│         │                   │                   │                       │
│         ▼                   ▼                   ▼                       │
│  · 窗口切换事件      · 时间特征          · 时序模式                     │
│  · 应用使用时长      · 频率特征          · 周期模式                     │
│  · 文件操作序列      · 序列特征          · 关联规则                     │
│  · 剪贴板历史        · 上下文特征        · 聚类分析                     │
│  · 执行反馈          · 交互特征          · 异常检测                     │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                        习惯模型层                                  │  │
│  │                                                                   │  │
│  │  ┌────────────┐    ┌────────────┐    ┌────────────┐              │  │
│  │  │  工作习惯  │    │  应用偏好  │    │  时间规律  │              │  │
│  │  │  Workflow  │    │ App Prefs  │    │  Temporal  │              │  │
│  │  └────────────┘    └────────────┘    └────────────┘              │  │
│  │                                                                   │  │
│  │  ┌────────────┐    ┌────────────┐    ┌────────────┐              │  │
│  │  │  文件组织  │    │  通信模式  │    │  学习进度  │              │  │
│  │  │ File Org.  │    │ Comm. Pat. │    │  Learning  │              │  │
│  │  └────────────┘    └────────────┘    └────────────┘              │  │
│  │                                                                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 行为数据模型

```typescript
// 用户行为事件
interface BehaviorEvent {
  id: string;
  timestamp: Date;

  // 事件类型
  eventType: BehaviorEventType;

  // 事件数据
  data: {
    action: string;               // 具体动作
    target: string;               // 操作目标
    context: Record<string, any>; // 上下文信息
    duration?: number;            // 持续时间
    result?: 'success' | 'failure' | 'cancelled';
  };

  // 环境信息
  environment: {
    platform: string;
    activeApp: string;
    windowTitle: string;
    screenResolution: string;
  };

  // 用户反馈
  feedback?: {
    type: 'accept' | 'reject' | 'modify' | 'ignore';
    reason?: string;
    modifiedAction?: string;
  };
}

enum BehaviorEventType {
  // 应用相关
  APP_LAUNCH = 'app_launch',
  APP_CLOSE = 'app_close',
  APP_SWITCH = 'app_switch',

  // 窗口相关
  WINDOW_FOCUS = 'window_focus',
  WINDOW_RESIZE = 'window_resize',
  WINDOW_MOVE = 'window_move',

  // 文件相关
  FILE_OPEN = 'file_open',
  FILE_SAVE = 'file_save',
  FILE_CREATE = 'file_create',
  FILE_DELETE = 'file_delete',
  FILE_MOVE = 'file_move',

  // 剪贴板相关
  CLIPBOARD_COPY = 'clipboard_copy',
  CLIPBOARD_PASTE = 'clipboard_paste',

  // Hawkeye 交互
  SUGGESTION_VIEW = 'suggestion_view',
  SUGGESTION_ACCEPT = 'suggestion_accept',
  SUGGESTION_REJECT = 'suggestion_reject',
  SUGGESTION_MODIFY = 'suggestion_modify',
  EXECUTION_START = 'execution_start',
  EXECUTION_COMPLETE = 'execution_complete',

  // 浏览器相关
  BROWSER_NAVIGATE = 'browser_navigate',
  BROWSER_SEARCH = 'browser_search',
  BROWSER_BOOKMARK = 'browser_bookmark',

  // 输入相关
  KEYBOARD_SHORTCUT = 'keyboard_shortcut',
  COMMAND_EXECUTE = 'command_execute'
}
```

### 6.3 习惯识别算法

#### 6.3.1 时序模式识别
```typescript
interface TemporalPattern {
  id: string;
  name: string;

  // 模式类型
  type: 'daily' | 'weekly' | 'monthly' | 'event_triggered';

  // 时间规则
  temporal: {
    // 对于周期性模式
    schedule?: {
      hour?: number;
      minute?: number;
      dayOfWeek?: number[];        // 0-6, 周日到周六
      dayOfMonth?: number[];
    };

    // 对于事件触发模式
    trigger?: {
      event: BehaviorEventType;
      condition?: Record<string, any>;
    };

    // 时间容差
    toleranceMinutes: number;
  };

  // 动作序列
  actionSequence: Array<{
    action: string;
    expectedDuration?: number;
    optional: boolean;
  }>;

  // 统计
  statistics: {
    confidence: number;           // 模式置信度
    frequency: number;            // 发生频率
    lastOccurrence: Date;
    occurrenceHistory: Date[];
    variability: number;          // 时间变异性
  };
}
```

#### 6.3.2 应用使用习惯
```typescript
interface AppUsageHabit {
  appId: string;
  appName: string;

  // 使用统计
  usage: {
    totalDuration: number;        // 总使用时长 (秒)
    averageSessionDuration: number;
    sessionCount: number;
    lastUsed: Date;

    // 按时间段分布
    hourlyDistribution: number[]; // 24 小时分布
    weeklyDistribution: number[]; // 7 天分布
  };

  // 使用上下文
  context: {
    // 常见搭配应用
    frequentCompanions: Array<{
      appName: string;
      coOccurrenceRate: number;
    }>;

    // 常见工作流
    commonWorkflows: Array<{
      sequence: string[];
      frequency: number;
    }>;

    // 常用文件类型
    fileTypeAssociations: Array<{
      fileType: string;
      frequency: number;
    }>;
  };

  // 偏好设置
  preferences: {
    preferredWindowSize?: { width: number; height: number };
    preferredPosition?: { x: number; y: number };
    commonKeyboardShortcuts: string[];
  };
}
```

#### 6.3.3 文件组织习惯
```typescript
interface FileOrganizationHabit {
  // 目录偏好
  directoryPreferences: Array<{
    fileType: string;             // 文件类型
    preferredPath: string;        // 偏好路径
    namingPattern?: string;       // 命名模式
    confidence: number;
    exampleFiles: string[];
  }>;

  // 整理模式
  organizationPatterns: Array<{
    trigger: 'download' | 'create' | 'receive' | 'periodic';
    sourcePattern: string;        // 源位置模式
    targetPattern: string;        // 目标位置模式
    frequency: number;
  }>;

  // 命名习惯
  namingConventions: Array<{
    context: string;              // 适用上下文
    pattern: string;              // 命名模式
    examples: string[];
  }>;

  // 清理习惯
  cleanupHabits: {
    downloadsCleanupFrequency?: 'daily' | 'weekly' | 'monthly' | 'never';
    trashEmptyFrequency?: 'daily' | 'weekly' | 'monthly' | 'never';
    tempFileRetention?: number;   // 临时文件保留天数
  };
}
```

### 6.4 习惯学习配置

```typescript
interface HabitLearningConfig {
  // 学习参数
  learning: {
    minDataPoints: number;        // 最小数据点数
    learningRate: number;         // 学习率
    forgetRate: number;           // 遗忘率
    confidenceThreshold: number;  // 置信度阈值
  };

  // 模式检测
  patternDetection: {
    enabled: boolean;
    minOccurrences: number;       // 最小出现次数
    timeWindowDays: number;       // 时间窗口
    similarityThreshold: number;  // 相似度阈值
  };

  // 自动化建议
  automationSuggestion: {
    enabled: boolean;
    minConfidence: number;        // 最小置信度
    minFrequency: number;         // 最小频率
    cooldownHours: number;        // 建议冷却时间
  };

  // 隐私保护
  privacy: {
    excludedApps: string[];       // 排除的应用
    excludedPaths: string[];      // 排除的路径
    anonymizeData: boolean;       // 匿名化数据
    dataRetentionDays: number;    // 数据保留天数
  };
}
```

---

## 7. 上下文感知与意图检测

### 7.1 上下文模型

```typescript
interface ContextModel {
  // 即时上下文 (当前时刻)
  immediate: {
    timestamp: Date;

    // 视觉上下文
    visual: {
      screenContent?: string;     // 屏幕内容 (OCR)
      activeElements?: UIElement[];
      colorScheme?: 'light' | 'dark';
    };

    // 应用上下文
    application: {
      activeApp: string;
      windowTitle: string;
      windowState: 'normal' | 'maximized' | 'minimized';
      documentPath?: string;
    };

    // 输入上下文
    input: {
      recentClipboard: string;
      recentCommands: string[];
      pendingInput?: string;
    };
  };

  // 会话上下文 (当前会话)
  session: {
    sessionStart: Date;
    sessionGoal?: string;         // 推断的会话目标

    // 活动历史
    activityHistory: Array<{
      timestamp: Date;
      activity: string;
      duration: number;
    }>;

    // 任务进度
    taskProgress: Array<{
      taskId: string;
      taskName: string;
      progress: number;           // 0-100
      status: 'active' | 'paused' | 'completed';
    }>;

    // 情感状态
    emotionalState: {
      frustration: number;
      engagement: number;
      fatigue: number;
    };
  };

  // 历史上下文 (长期)
  historical: {
    // 用户画像
    userProfile: {
      role: string;               // 用户角色
      expertise: string[];        // 专业领域
      preferences: Record<string, any>;
    };

    // 项目上下文
    projects: Array<{
      id: string;
      name: string;
      lastActive: Date;
      relatedFiles: string[];
      relatedApps: string[];
    }>;

    // 知识库
    knowledgeBase: {
      learnedConcepts: string[];
      commonQuestions: string[];
      solvedProblems: string[];
    };
  };
}
```

### 7.2 意图检测引擎

```typescript
interface IntentDetectionEngine {
  // 检测配置
  config: {
    confidenceThreshold: number;
    maxIntents: number;
    useHistoricalContext: boolean;
    useSemanticAnalysis: boolean;
  };

  // 检测方法
  detect(context: ContextModel): Promise<IntentResult>;

  // 意图类别
  intentCategories: IntentCategory[];

  // 检测规则
  detectionRules: IntentRule[];
}

interface IntentResult {
  // 主要意图
  primary: {
    intent: IntentCategory;
    confidence: number;
    reasoning: string;            // 推理过程
    evidence: string[];           // 支持证据
  };

  // 候选意图
  candidates: Array<{
    intent: IntentCategory;
    confidence: number;
  }>;

  // 上下文丰富
  enrichedContext: {
    inferredGoal: string;
    suggestedActions: string[];
    relatedKnowledge: string[];
  };

  // 不确定性
  uncertainty: {
    level: 'low' | 'medium' | 'high';
    reasons: string[];
    clarifyingQuestions?: string[];
  };
}

interface IntentCategory {
  id: string;
  name: string;
  description: string;

  // 子类别
  subcategories?: IntentCategory[];

  // 典型触发器
  triggers: {
    keywords: string[];
    patterns: string[];
    contexts: string[];
  };

  // 关联动作
  associatedActions: string[];
}

interface IntentRule {
  id: string;
  name: string;

  // 条件
  conditions: Array<{
    type: 'contains' | 'matches' | 'equals' | 'context';
    field: string;
    value: any;
    weight: number;
  }>;

  // 输出
  output: {
    intent: string;
    confidenceBoost: number;
  };
}
```

### 7.3 多模态上下文融合

```typescript
interface MultimodalContextFusion {
  // 融合策略
  fusionStrategy: 'early' | 'late' | 'hybrid';

  // 模态权重
  modalityWeights: {
    visual: number;               // 视觉信息权重
    textual: number;              // 文本信息权重
    behavioral: number;           // 行为信息权重
    temporal: number;             // 时间信息权重
  };

  // 融合方法
  fuse(inputs: ModalityInputs): FusedContext;

  // 冲突解决
  resolveConflicts(contexts: ContextModel[]): ContextModel;
}

interface ModalityInputs {
  visual?: {
    screenshot: Buffer;
    ocrText?: string;
    uiElements?: UIElement[];
  };

  textual?: {
    clipboardContent: string;
    windowTitle: string;
    documentContent?: string;
  };

  behavioral?: {
    recentActions: BehaviorEvent[];
    currentWorkflow?: string;
  };

  temporal?: {
    timeOfDay: number;
    dayOfWeek: number;
    sessionDuration: number;
  };
}

interface FusedContext {
  unified: ContextModel;
  modalityContributions: Record<string, number>;
  confidenceByModality: Record<string, number>;
  conflicts: Array<{
    field: string;
    values: any[];
    resolution: any;
  }>;
}
```

---

## 8. 智能计划生成与分析

### 8.1 计划生成流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        计划生成流程                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│  │  意图    │───▶│  目标    │───▶│  方案    │───▶│  计划    │          │
│  │  理解    │    │  分解    │    │  生成    │    │  优化    │          │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘          │
│       │              │              │              │                    │
│       ▼              ▼              ▼              ▼                    │
│  "用户想做X"    "X分解为A,B,C"  "生成3种方案"   "选择最优方案"          │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      计划分析与展示                               │   │
│  │                                                                   │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │   │
│  │  │  优点   │  │  缺点   │  │  风险   │  │  替代   │            │   │
│  │  │  Pros   │  │  Cons   │  │  Risks  │  │  Alts   │            │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │   │
│  │                                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      用户决策界面                                 │   │
│  │                                                                   │   │
│  │  [执行此计划]  [查看替代方案]  [修改计划]  [稍后再说]            │   │
│  │                                                                   │   │
│  │  如需额外权限: [授权访问] [跳过此步骤]                           │   │
│  │                                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 计划数据结构

```typescript
interface ExecutionPlan {
  id: string;
  version: number;
  createdAt: Date;
  expiresAt: Date;

  // 计划元信息
  metadata: {
    title: string;
    description: string;
    triggerContext: string;       // 触发此计划的上下文
    userIntent: string;           // 用户意图描述
  };

  // 执行步骤
  steps: ExecutionStep[];

  // 计划分析
  analysis: PlanAnalysis;

  // 替代方案
  alternatives: AlternativePlan[];

  // 依赖和前置条件
  requirements: {
    permissions: PermissionRequirement[];
    tools: ToolRequirement[];
    prerequisites: string[];
  };

  // 计划状态
  status: PlanStatus;

  // 估算
  estimates: {
    totalDuration: number;        // 总时长估算 (秒)
    complexityScore: number;      // 复杂度 1-10
    successProbability: number;   // 成功概率 0-1
  };
}

interface ExecutionStep {
  id: string;
  order: number;

  // 步骤信息
  info: {
    name: string;
    description: string;
    rationale: string;            // 为什么需要这个步骤
  };

  // 动作
  action: {
    type: ActionType;
    command?: string;
    parameters: Record<string, any>;
  };

  // 条件
  conditions?: {
    preConditions: Condition[];   // 执行前条件
    postConditions: Condition[];  // 执行后验证
  };

  // 错误处理
  errorHandling: {
    retryPolicy: RetryPolicy;
    fallbackAction?: ExecutionStep;
    onError: 'continue' | 'abort' | 'ask';
  };

  // 用户交互
  userInteraction: {
    requiresConfirmation: boolean;
    confirmationMessage?: string;
    inputRequired?: UserInputSpec;
  };

  // 依赖
  dependencies: string[];         // 依赖的步骤 ID

  // 估算
  estimatedDuration: number;
  riskLevel: 'low' | 'medium' | 'high';
}

enum ActionType {
  SHELL_COMMAND = 'shell_command',
  FILE_READ = 'file_read',
  FILE_WRITE = 'file_write',
  FILE_MOVE = 'file_move',
  FILE_DELETE = 'file_delete',
  APP_LAUNCH = 'app_launch',
  APP_ACTION = 'app_action',
  BROWSER_NAVIGATE = 'browser_navigate',
  BROWSER_ACTION = 'browser_action',
  API_CALL = 'api_call',
  NOTIFICATION = 'notification',
  WAIT = 'wait',
  CONDITIONAL = 'conditional',
  LOOP = 'loop',
  USER_INPUT = 'user_input'
}
```

### 8.3 计划分析

```typescript
interface PlanAnalysis {
  // 优点
  pros: Array<{
    point: string;
    importance: 'high' | 'medium' | 'low';
    explanation: string;
  }>;

  // 缺点
  cons: Array<{
    point: string;
    severity: 'high' | 'medium' | 'low';
    explanation: string;
    mitigation?: string;          // 缓解措施
  }>;

  // 风险评估
  risks: Array<{
    risk: string;
    probability: number;          // 发生概率 0-1
    impact: 'high' | 'medium' | 'low';
    mitigation: string;
  }>;

  // 影响范围
  impactScope: {
    filesAffected: string[];
    appsAffected: string[];
    systemChanges: string[];
    dataChanges: string[];
    reversibility: 'fully' | 'partially' | 'irreversible';
  };

  // 与用户习惯的匹配度
  habitAlignment: {
    score: number;                // 0-1
    alignedHabits: string[];
    conflictingHabits: string[];
  };

  // 效率评估
  efficiencyMetrics: {
    automationLevel: number;      // 自动化程度 0-1
    userInteractionCount: number; // 需要用户交互次数
    timeComparedToManual: number; // 与手动操作相比节省的时间百分比
  };
}

interface AlternativePlan {
  id: string;
  title: string;
  description: string;

  // 与主方案的对比
  comparison: {
    differenceFromMain: string[];
    advantages: string[];
    disadvantages: string[];
  };

  // 适用场景
  bestFor: string[];

  // 简化的步骤概览
  stepsOverview: string[];

  // 估算
  estimates: {
    duration: number;
    complexity: number;
    successProbability: number;
  };
}
```

### 8.4 计划展示界面规格

```typescript
interface PlanUISpec {
  // 展示模式
  displayMode: 'compact' | 'detailed' | 'wizard';

  // 紧凑模式
  compact: {
    showTitle: boolean;
    showStepCount: boolean;
    showEstimates: boolean;
    maxVisibleSteps: number;
  };

  // 详细模式
  detailed: {
    showAllSteps: boolean;
    showAnalysis: boolean;
    showAlternatives: boolean;
    showCode: boolean;            // 显示将执行的代码/命令
  };

  // 向导模式
  wizard: {
    stepsPerPage: number;
    allowSkip: boolean;
    showProgress: boolean;
  };

  // 交互元素
  interactions: {
    primaryAction: {
      label: string;              // "执行此计划"
      style: 'primary';
    };
    secondaryActions: Array<{
      label: string;
      action: 'viewAlternatives' | 'modify' | 'postpone' | 'reject';
    }>;
    permissionActions?: Array<{
      permission: string;
      label: string;
    }>;
  };
}
```

---

## 9. 执行引擎与认证系统

### 9.1 执行引擎架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          执行引擎架构                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                      执行调度器 (Scheduler)                      │    │
│  │                                                                   │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │    │
│  │  │ 队列管理 │  │ 优先级   │  │ 并发控制 │  │ 超时管理 │        │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                              │                                          │
│                              ▼                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                      执行器池 (Executor Pool)                    │    │
│  │                                                                   │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │    │
│  │  │  Shell  │ │  File   │ │  App    │ │ Browser │ │  API    │   │    │
│  │  │Executor │ │Executor │ │Executor │ │Executor │ │Executor │   │    │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                              │                                          │
│                              ▼                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                      安全层 (Security Layer)                     │    │
│  │                                                                   │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │    │
│  │  │ 权限检查 │  │ 沙箱执行 │  │ 审计日志 │  │ 回滚能力 │        │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 9.2 执行器定义

```typescript
// 基础执行器接口
interface Executor {
  type: ActionType;
  name: string;

  // 执行方法
  execute(action: ExecutionStep): Promise<ExecutionResult>;

  // 验证方法
  validate(action: ExecutionStep): ValidationResult;

  // 回滚方法
  rollback(executionId: string): Promise<RollbackResult>;

  // 能力声明
  capabilities: ExecutorCapabilities;
}

interface ExecutorCapabilities {
  supportedActions: ActionType[];
  maxConcurrent: number;
  supportsTimeout: boolean;
  supportsRollback: boolean;
  requiredPermissions: string[];
}

// Shell 执行器
interface ShellExecutor extends Executor {
  config: {
    defaultShell: string;         // 默认 Shell
    timeout: number;              // 默认超时
    environment: Record<string, string>;
    workingDirectory: string;

    // 安全配置
    security: {
      allowedCommands: string[];
      blockedCommands: string[];
      blockedPatterns: RegExp[];
      maxOutputSize: number;
      sandboxMode: boolean;
    };
  };
}

// 文件执行器
interface FileExecutor extends Executor {
  config: {
    // 访问控制
    access: {
      allowedPaths: string[];
      blockedPaths: string[];
      readOnlyPaths: string[];
    };

    // 操作限制
    limits: {
      maxFileSize: number;        // 最大文件大小
      maxFilesPerOperation: number;
      allowedExtensions: string[];
      blockedExtensions: string[];
    };

    // 备份配置
    backup: {
      enabled: boolean;
      backupPath: string;
      retentionDays: number;
    };
  };
}

// 浏览器执行器
interface BrowserExecutor extends Executor {
  config: {
    browserType: 'chromium' | 'firefox' | 'webkit';
    headless: boolean;

    // 安全配置
    security: {
      allowedDomains: string[];
      blockedDomains: string[];
      maxNavigations: number;
      blockDownloads: boolean;
      blockPopups: boolean;
    };

    // 自动化配置
    automation: {
      defaultTimeout: number;
      retryOnFailure: boolean;
      screenshotOnError: boolean;
    };
  };
}
```

### 9.3 认证与授权系统

```typescript
interface AuthenticationSystem {
  // 用户认证
  authentication: {
    // 本地认证
    local: {
      enabled: boolean;
      passwordPolicy: PasswordPolicy;
      biometricEnabled: boolean;
    };

    // OAuth (未来)
    oauth?: {
      providers: string[];
      tokenStorage: 'keychain' | 'encrypted_file';
    };
  };

  // 权限管理
  authorization: {
    // 权限定义
    permissions: Permission[];

    // 角色定义
    roles: Role[];

    // 默认权限
    defaultPermissions: string[];

    // 权限请求流程
    requestFlow: PermissionRequestFlow;
  };

  // 会话管理
  sessionManagement: {
    sessionTimeout: number;
    autoLockEnabled: boolean;
    autoLockTimeout: number;
    requireAuthOnSensitive: boolean;
  };
}

interface Permission {
  id: string;
  name: string;
  description: string;
  category: 'file' | 'shell' | 'app' | 'browser' | 'network' | 'system';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';

  // 范围定义
  scope?: {
    paths?: string[];
    commands?: string[];
    domains?: string[];
    apps?: string[];
  };
}

interface PermissionRequestFlow {
  // 请求 UI
  ui: {
    showReason: boolean;
    showScope: boolean;
    showRiskLevel: boolean;
    allowRemember: boolean;
    rememberDuration: 'session' | 'day' | 'week' | 'forever';
  };

  // 审批策略
  approvalPolicy: {
    autoApproveBelow: 'low' | 'medium' | 'none';
    requireExplicitForHigh: boolean;
    requireReasonForCritical: boolean;
  };

  // 紧急覆盖
  emergencyOverride: {
    enabled: boolean;
    requirePassword: boolean;
    auditLog: boolean;
  };
}
```

### 9.4 执行确认界面

```typescript
interface ConfirmationUISpec {
  // 基本信息
  header: {
    title: string;                // "Hawkeye 想要执行以下操作"
    icon: 'info' | 'warning' | 'danger';
  };

  // 操作详情
  details: {
    action: string;               // 操作描述
    target: string;               // 操作目标
    reason: string;               // 为什么需要这个操作
    impact: string;               // 影响范围
  };

  // 代码/命令预览
  preview?: {
    type: 'code' | 'command' | 'diff';
    content: string;
    language?: string;
  };

  // 风险警告
  warnings?: Array<{
    level: 'info' | 'warning' | 'danger';
    message: string;
  }>;

  // 操作按钮
  actions: {
    approve: {
      label: string;              // "执行"
      style: 'primary' | 'danger';
    };
    reject: {
      label: string;              // "取消"
    };
    options?: Array<{
      label: string;
      action: 'modify' | 'skipStep' | 'viewCode';
    }>;
  };

  // 记住选择
  remember?: {
    enabled: boolean;
    label: string;                // "记住此选择"
    options: Array<{
      label: string;
      duration: 'session' | 'day' | 'week' | 'forever';
    }>;
  };
}
```

---

## 10. 技术架构

### 10.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Hawkeye 系统架构                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │                          客户端层 (Client Layer)                          │  │
│   │                                                                           │  │
│   │   ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐        │  │
│   │   │  Desktop  │   │  VS Code  │   │  Chrome   │   │  Mobile   │        │  │
│   │   │  Electron │   │ Extension │   │ Extension │   │ (Future)  │        │  │
│   │   │  React    │   │           │   │ Manifest  │   │           │        │  │
│   │   │  Vite     │   │           │   │    V3     │   │           │        │  │
│   │   └─────┬─────┘   └─────┬─────┘   └─────┬─────┘   └─────┬─────┘        │  │
│   │         │               │               │               │               │  │
│   │         └───────────────┼───────────────┼───────────────┘               │  │
│   │                         │               │                                │  │
│   └─────────────────────────┼───────────────┼────────────────────────────────┘  │
│                             │               │                                    │
│   ┌─────────────────────────┼───────────────┼────────────────────────────────┐  │
│   │                   同步层 (Sync Layer)    │                                │  │
│   │                         │               │                                │  │
│   │   ┌─────────────────────┴───────────────┴─────────────────────────────┐ │  │
│   │   │              WebSocket / IPC / HTTP                                │ │  │
│   │   │              (端到端加密, 消息队列)                                  │ │  │
│   │   └─────────────────────────────────────────────────────────────────┬─┘ │  │
│   │                                                                     │   │  │
│   └─────────────────────────────────────────────────────────────────────┼───┘  │
│                                                                         │       │
│   ┌─────────────────────────────────────────────────────────────────────┼───┐  │
│   │                       核心引擎 (Core Engine)                          │   │  │
│   │                                                                      │   │  │
│   │   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐            │   │  │
│   │   │  Perception  │──▶│  Reasoning   │──▶│  Execution   │            │   │  │
│   │   │    Engine    │   │    Engine    │   │    Engine    │            │   │  │
│   │   │              │   │              │   │              │            │   │  │
│   │   │ · 屏幕感知   │   │ · AI 分析    │   │ · 执行器    │            │   │  │
│   │   │ · 窗口追踪   │   │ · 意图理解   │   │ · 安全层    │            │   │  │
│   │   │ · 剪贴板    │   │ · 计划生成   │   │ · 审计      │            │   │  │
│   │   │ · 文件监控   │   │ · 优劣分析   │   │ · 回滚      │            │   │  │
│   │   └──────────────┘   └──────────────┘   └──────────────┘            │   │  │
│   │          │                  │                  │                    │   │  │
│   │          └──────────────────┼──────────────────┘                    │   │  │
│   │                             ▼                                       │   │  │
│   │   ┌─────────────────────────────────────────────────────────────┐  │   │  │
│   │   │                   MemOS 记忆层                               │  │   │  │
│   │   │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │  │   │  │
│   │   │  │Episodic│ │Semantic│ │Procedur│ │Working │ │ Vector │    │  │   │  │
│   │   │  │ Memory │ │ Memory │ │ Memory │ │ Memory │ │ Store  │    │  │   │  │
│   │   │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘    │  │   │  │
│   │   └─────────────────────────────────────────────────────────────┘  │   │  │
│   │                             │                                       │   │  │
│   └─────────────────────────────┼───────────────────────────────────────┘   │  │
│                                 │                                            │  │
│   ┌─────────────────────────────┼────────────────────────────────────────┐  │  │
│   │                    存储层 (Storage Layer)                              │  │  │
│   │                             │                                          │  │  │
│   │   ┌───────────┐  ┌─────────┴─────────┐  ┌───────────┐                 │  │  │
│   │   │  SQLite   │  │     LevelDB       │  │   Files   │                 │  │  │
│   │   │(Metadata) │  │   (KV Store)      │  │ (Backups) │                 │  │  │
│   │   └───────────┘  └───────────────────┘  └───────────┘                 │  │  │
│   │                                                                        │  │  │
│   │   存储路径: ~/.hawkeye/                                                │  │  │
│   │                                                                        │  │  │
│   └────────────────────────────────────────────────────────────────────────┘  │  │
│                                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │                       外部服务层 (External Services)                      │  │
│   │                                                                           │  │
│   │   ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐        │  │
│   │   │  Claude   │   │  Ollama   │   │  OpenAI   │   │  Custom   │        │  │
│   │   │   API     │   │  (Local)  │   │ (Optional)│   │   LLM     │        │  │
│   │   └───────────┘   └───────────┘   └───────────┘   └───────────┘        │  │
│   │                                                                           │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 技术栈详情

| 层级 | 技术 | 版本要求 | 用途 |
|------|------|---------|------|
| **语言** | TypeScript | 5.3+ | 全栈开发语言 |
| **运行时** | Node.js | 18+ | 服务端运行时 |
| **包管理** | pnpm | 8+ | 高效的包管理 |
| **桌面框架** | Electron | 28+ | 桌面应用 |
| **前端框架** | React | 18+ | UI 框架 |
| **构建工具** | Vite/tsup | 5+/8+ | 构建打包 |
| **数据库** | SQLite/LevelDB | - | 本地存储 |
| **向量数据库** | Hnswlib | - | 向量检索 |
| **AI SDK** | @anthropic-ai/sdk | Latest | Claude API |
| **本地 LLM** | Ollama | Latest | 本地模型 |
| **浏览器自动化** | Playwright | Latest | 浏览器控制 |
| **测试** | Vitest | Latest | 单元测试 |
| **E2E 测试** | Playwright Test | Latest | 端到端测试 |

### 10.3 目录结构

```
hawkeye/
├── packages/
│   ├── core/                       # 核心引擎
│   │   ├── src/
│   │   │   ├── perception/         # 感知层
│   │   │   │   ├── screen.ts       # 屏幕感知
│   │   │   │   ├── window.ts       # 窗口追踪
│   │   │   │   ├── clipboard.ts    # 剪贴板监控
│   │   │   │   └── file-watcher.ts # 文件监控
│   │   │   │
│   │   │   ├── reasoning/          # 推理层
│   │   │   │   ├── intent.ts       # 意图理解
│   │   │   │   ├── planner.ts      # 计划生成
│   │   │   │   ├── analyzer.ts     # 计划分析
│   │   │   │   └── ai-client.ts    # AI 客户端
│   │   │   │
│   │   │   ├── execution/          # 执行层
│   │   │   │   ├── scheduler.ts    # 执行调度
│   │   │   │   ├── executors/      # 执行器
│   │   │   │   │   ├── shell.ts
│   │   │   │   │   ├── file.ts
│   │   │   │   │   ├── app.ts
│   │   │   │   │   ├── browser.ts
│   │   │   │   │   └── api.ts
│   │   │   │   ├── security.ts     # 安全层
│   │   │   │   └── rollback.ts     # 回滚管理
│   │   │   │
│   │   │   ├── memory/             # MemOS 集成
│   │   │   │   ├── episodic.ts     # 情节记忆
│   │   │   │   ├── semantic.ts     # 语义记忆
│   │   │   │   ├── procedural.ts   # 程序性记忆
│   │   │   │   ├── working.ts      # 工作记忆
│   │   │   │   └── vector-store.ts # 向量存储
│   │   │   │
│   │   │   ├── behavior/           # 行为追踪
│   │   │   │   ├── tracker.ts      # 行为追踪器
│   │   │   │   ├── patterns.ts     # 模式识别
│   │   │   │   ├── habits.ts       # 习惯学习
│   │   │   │   └── analytics.ts    # 行为分析
│   │   │   │
│   │   │   ├── storage/            # 存储层
│   │   │   │   ├── sqlite.ts       # SQLite
│   │   │   │   ├── leveldb.ts      # LevelDB
│   │   │   │   └── migration.ts    # 数据迁移
│   │   │   │
│   │   │   ├── sync/               # 同步层
│   │   │   │   ├── websocket.ts    # WebSocket
│   │   │   │   ├── ipc.ts          # IPC
│   │   │   │   └── conflict.ts     # 冲突解决
│   │   │   │
│   │   │   ├── engine.ts           # 主引擎
│   │   │   ├── config.ts           # 配置
│   │   │   └── types.ts            # 类型定义
│   │   │
│   │   ├── tests/                  # 测试
│   │   └── package.json
│   │
│   ├── desktop/                    # Electron 桌面应用
│   │   ├── src/
│   │   │   ├── main/               # 主进程
│   │   │   ├── preload/            # 预加载
│   │   │   └── renderer/           # 渲染进程 (React)
│   │   │       ├── components/
│   │   │       ├── hooks/
│   │   │       ├── stores/
│   │   │       └── pages/
│   │   └── package.json
│   │
│   ├── vscode-extension/           # VS Code 扩展
│   │   ├── src/
│   │   │   ├── extension.ts
│   │   │   ├── views/
│   │   │   └── commands/
│   │   └── package.json
│   │
│   └── chrome-extension/           # Chrome 扩展
│       ├── src/
│       │   ├── background/         # Service Worker
│       │   ├── content/            # Content Scripts
│       │   └── popup/              # Popup UI
│       ├── manifest.json
│       └── package.json
│
├── docs/                           # 文档
│   ├── PRD.md                      # 产品需求文档
│   ├── architecture.md             # 架构文档
│   └── api/                        # API 文档
│
├── scripts/                        # 脚本
├── .github/                        # GitHub 配置
├── pnpm-workspace.yaml
├── tsconfig.json
└── package.json
```

---

## 11. API 设计与集成点

### 11.1 核心 API

```typescript
// ============================================
// Hawkeye 核心 API
// ============================================

import { HawkeyeEngine, TaskSuggestion, ExecutionResult } from '@hawkeye/core';

// ---- 初始化 ----
const engine = new HawkeyeEngine({
  // AI 配置
  ai: {
    provider: 'claude',           // 'claude' | 'ollama' | 'openai'
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-5-sonnet-20241022',
  },

  // 感知配置
  perception: {
    screen: { enabled: true, interval: 5000 },
    window: { enabled: true },
    clipboard: { enabled: true },
    fileWatcher: { enabled: true, paths: ['~/Documents', '~/Downloads'] },
  },

  // 执行配置
  execution: {
    confirmationRequired: true,
    sandboxMode: true,
    maxConcurrent: 3,
  },

  // 存储配置
  storage: {
    path: '~/.hawkeye',
    encryptionEnabled: true,
  },
});

// ---- 感知 API ----

// 手动触发观察
const context = await engine.observe();

// 获取当前上下文
const currentContext = engine.getContext();

// 订阅感知事件
engine.on('perception', (event) => {
  console.log('Perception event:', event);
});

// ---- 推理 API ----

// 获取建议
const suggestions = await engine.getSuggestions();

// 获取带分析的计划
const plan = await engine.getPlan(suggestions[0]);

// 获取替代方案
const alternatives = await engine.getAlternatives(plan.id);

// ---- 执行 API ----

// 执行计划
const result = await engine.execute(plan.id, {
  confirmCallback: async (step) => {
    // 返回 true 允许执行，false 跳过
    return await showConfirmationDialog(step);
  },
});

// 取消执行
await engine.cancel(result.id);

// 回滚执行
await engine.rollback(result.id);

// ---- 记忆 API ----

// 添加记忆
await engine.memory.add({
  type: 'semantic',
  data: { concept: 'TypeScript', related: ['JavaScript', 'Node.js'] },
});

// 搜索记忆
const memories = await engine.memory.search('TypeScript');

// 获取习惯
const habits = await engine.behavior.getHabits();

// ---- 事件订阅 ----

engine.on('suggestion', (suggestions: TaskSuggestion[]) => {
  // 新建议生成
});

engine.on('execution:start', (execution) => {
  // 执行开始
});

engine.on('execution:complete', (result: ExecutionResult) => {
  // 执行完成
});

engine.on('habit:detected', (habit) => {
  // 新习惯检测到
});

// ---- 生命周期 ----

// 启动引擎
await engine.start();

// 暂停引擎
await engine.pause();

// 恢复引擎
await engine.resume();

// 停止引擎
await engine.stop();
```

### 11.2 扩展 API

```typescript
// ============================================
// 插件/扩展 API
// ============================================

import { HawkeyePlugin, PluginContext } from '@hawkeye/core';

// 定义插件
const myPlugin: HawkeyePlugin = {
  name: 'my-custom-plugin',
  version: '1.0.0',

  // 初始化
  async init(ctx: PluginContext) {
    // 注册自定义感知器
    ctx.registerPerception({
      name: 'custom-perception',
      async perceive() {
        return { custom: 'data' };
      },
    });

    // 注册自定义执行器
    ctx.registerExecutor({
      type: 'custom_action',
      async execute(step) {
        // 执行逻辑
        return { success: true };
      },
    });

    // 注册自定义意图处理器
    ctx.registerIntentHandler({
      intent: 'custom_intent',
      async handle(context) {
        return {
          suggestions: [/* ... */],
        };
      },
    });
  },

  // 销毁
  async destroy() {
    // 清理资源
  },
};

// 注册插件
engine.use(myPlugin);
```

### 11.3 跨端同步 API

```typescript
// ============================================
// 同步 API
// ============================================

import { SyncManager } from '@hawkeye/core';

const sync = new SyncManager({
  targets: ['desktop', 'vscode', 'chrome'],
  encryption: {
    enabled: true,
    algorithm: 'aes-256-gcm',
  },
});

// 发送消息到其他端
await sync.broadcast({
  type: 'suggestion_accepted',
  data: { suggestionId: '...' },
});

// 接收消息
sync.on('message', (msg) => {
  switch (msg.type) {
    case 'context_update':
      // 处理上下文更新
      break;
    case 'execution_request':
      // 处理执行请求
      break;
  }
});

// 同步状态
const status = await sync.getStatus();
// { desktop: 'connected', vscode: 'connected', chrome: 'disconnected' }
```

---

## 12. 隐私、安全与合规

### 12.1 隐私保护原则

| 原则 | 实施方式 |
|------|---------|
| **数据最小化** | 只收集实现功能必需的数据 |
| **本地优先** | 所有处理优先在本地进行 |
| **用户控制** | 用户可以查看、导出、删除所有数据 |
| **透明度** | 明确告知收集什么数据，如何使用 |
| **加密存储** | 敏感数据加密存储 |
| **传输安全** | 所有网络传输使用 TLS 加密 |

### 12.2 数据分类与处理

```typescript
interface DataClassification {
  // 第一类：本地存储，永不传输
  localOnly: {
    screenshots: true,            // 屏幕截图
    clipboard: true,              // 剪贴板内容
    fileContents: true,           // 文件内容
    passwords: true,              // 任何密码/密钥
    personalInfo: true,           // 个人信息
  };

  // 第二类：可传输到 AI，但不存储在云端
  aiAnalysis: {
    contextSummary: true,         // 上下文摘要
    errorLogs: true,              // 错误日志 (脱敏后)
    intentDescription: true,      // 意图描述
  };

  // 第三类：可同步到其他设备 (端到端加密)
  syncable: {
    suggestions: true,            // 建议历史
    habits: true,                 // 习惯模型
    preferences: true,            // 用户偏好
  };
}
```

### 12.3 安全措施

```typescript
interface SecurityMeasures {
  // 数据安全
  dataProtection: {
    encryptionAtRest: {
      algorithm: 'AES-256-GCM',
      keyDerivation: 'PBKDF2',
      keyStorageLocation: 'system_keychain',
    };
    encryptionInTransit: {
      protocol: 'TLS 1.3',
      certificatePinning: true,
    };
  };

  // 执行安全
  executionSecurity: {
    sandboxing: {
      enabled: true,
      isolationLevel: 'process',
    };
    commandValidation: {
      allowlist: true,
      blocklist: true,
      patternMatching: true,
    };
    privilegeEscalation: {
      prevention: true,
      auditLogging: true,
    };
  };

  // 访问控制
  accessControl: {
    authentication: {
      methods: ['password', 'biometric'],
      sessionTimeout: 3600000,    // 1 小时
    };
    authorization: {
      rbac: true,
      permissionGranularity: 'fine',
    };
  };

  // 审计
  auditing: {
    logAllExecutions: true,
    logSensitiveAccess: true,
    retentionDays: 90,
    tamperProtection: true,
  };
}
```

### 12.4 用户数据权利

| 权利 | 实现 |
|------|------|
| **访问权** | 用户可随时查看所有存储的数据 |
| **导出权** | 一键导出所有数据为标准格式 (JSON) |
| **删除权** | 一键删除所有数据，包括备份 |
| **修正权** | 用户可修改任何存储的数据 |
| **限制处理** | 用户可禁用特定功能的数据收集 |
| **可携带权** | 数据格式开放，可迁移到其他工具 |

### 12.5 合规要求

| 法规 | 状态 | 措施 |
|------|------|------|
| GDPR | ✅ 符合 | 数据最小化、用户控制、隐私设计 |
| CCPA | ✅ 符合 | 透明披露、选择退出、数据删除 |
| 个人信息保护法 | ✅ 符合 | 本地存储、知情同意、安全措施 |

---

## 13. 竞品分析

### 13.1 竞品对比矩阵

| 特性 | Hawkeye | Eigent | Claude Code | Cursor | Raycast AI |
|------|---------|--------|-------------|--------|------------|
| **定位** | 全场景智能助手 | 工作流自动化 | 编程助手 | 编程 IDE | 效率启动器 |
| **交互模式** | 主动感知 | 主动+任务 | 被动响应 | 被动响应 | 命令驱动 |
| **数据位置** | 本地优先 | 可选 | 云端 | 云端 | 混合 |
| **多代理** | 未来支持 | ✅ 核心功能 | ❌ | ❌ | ❌ |
| **习惯学习** | ✅ 核心功能 | 工作流学习 | ❌ | ❌ | ❌ |
| **开源** | ✅ 完全开源 | ✅ 开源 | ❌ | ❌ | 部分开源 |
| **本地 LLM** | ✅ | ✅ | ❌ | ✅ | ❌ |
| **浏览器扩展** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **VS Code 扩展** | ✅ | ❌ | ✅ | - | ❌ |
| **价格** | 免费开源 | 免费开源 | 付费 | 付费 | Freemium |

### 13.2 借鉴与差异化

#### 从 Eigent 借鉴
- **Multi-Agent Workforce**: 多代理协作架构
- **MCP Tools Integration**: 工具集成模式
- **Human-in-the-Loop**: 人类参与决策流程
- **本地部署选项**: 完全本地化能力

#### 从 MemOS 借鉴
- **多维记忆系统**: 情节/语义/程序性/工作记忆
- **知识图谱**: 结构化知识存储
- **异步处理**: 高并发低延迟
- **Multi-cube 架构**: 多知识库隔离

#### Hawkeye 差异化
1. **主动感知**: 不等用户调用，主动发现机会
2. **习惯学习**: 学习用户行为模式，个性化建议
3. **计划分析**: 提供优缺点分析，帮助用户决策
4. **全场景覆盖**: 不限于编程，支持各种工作场景
5. **隐私极致**: 本地优先，用户完全控制数据

---

## 14. 实施路线图

### 14.1 Phase 1: 基础架构 (Month 1-2)

**目标**: 完成核心引擎和基础功能

| 里程碑 | 交付物 | 优先级 |
|--------|--------|--------|
| M1.1 | 核心类型定义和架构 | P0 |
| M1.2 | 感知引擎 (屏幕、窗口、剪贴板) | P0 |
| M1.3 | 基础推理引擎 (Claude API 集成) | P0 |
| M1.4 | 基础执行引擎 (Shell、文件) | P0 |
| M1.5 | 本地存储 (SQLite) | P0 |
| M1.6 | Desktop 应用 MVP | P0 |

### 14.2 Phase 2: 多端支持 (Month 3-4)

**目标**: 完成三端应用和同步

| 里程碑 | 交付物 | 优先级 |
|--------|--------|--------|
| M2.1 | VS Code 扩展 | P0 |
| M2.2 | Chrome 扩展 | P0 |
| M2.3 | 跨端同步机制 | P1 |
| M2.4 | 文件监控集成 | P1 |
| M2.5 | 本地 LLM 支持 (Ollama) | P1 |

### 14.3 Phase 3: 智能增强 (Month 5-6)

**目标**: 完成行为追踪和习惯学习

| 里程碑 | 交付物 | 优先级 |
|--------|--------|--------|
| M3.1 | 行为追踪框架 | P0 |
| M3.2 | 模式识别算法 | P0 |
| M3.3 | 习惯学习系统 | P0 |
| M3.4 | 计划分析 (优缺点) | P0 |
| M3.5 | 权限认证系统 | P0 |

### 14.4 Phase 4: MemOS 集成 (Month 7-8)

**目标**: 完成高级记忆管理

| 里程碑 | 交付物 | 优先级 |
|--------|--------|--------|
| M4.1 | MemOS 核心集成 | P0 |
| M4.2 | 情节记忆系统 | P0 |
| M4.3 | 语义记忆和知识图谱 | P1 |
| M4.4 | 程序性记忆 (工作流自动化) | P1 |
| M4.5 | 向量检索优化 | P1 |

### 14.5 Phase 5: 生态建设 (Month 9-12)

**目标**: 完成插件系统和社区建设

| 里程碑 | 交付物 | 优先级 |
|--------|--------|--------|
| M5.1 | 插件 API | P1 |
| M5.2 | 自定义工作流 | P1 |
| M5.3 | 主线任务 Dashboard | P2 |
| M5.4 | 社区插件市场 | P2 |
| M5.5 | 企业版功能 | P2 |

### 14.6 Gantt 图 (文本表示)

```
            Month 1  Month 2  Month 3  Month 4  Month 5  Month 6  Month 7  Month 8  Month 9  Month 10 Month 11 Month 12
Phase 1     |========|========|
Phase 2              |========|========|
Phase 3                               |========|========|
Phase 4                                                 |========|========|
Phase 5                                                                   |========|========|========|========|
```

---

## 15. 成功指标与 KPI

### 15.1 核心指标

| 指标 | 定义 | 目标 (6个月) | 目标 (12个月) |
|------|------|-------------|--------------|
| **MAU** | 月活跃用户数 | 10,000 | 100,000 |
| **DAU/MAU** | 日活/月活比率 | 30% | 40% |
| **建议采纳率** | 用户接受建议的比例 | 40% | 60% |
| **执行成功率** | 执行任务成功的比例 | 90% | 95% |
| **NPS** | 净推荐值 | 30 | 50 |

### 15.2 功能指标

| 指标 | 定义 | 目标 |
|------|------|------|
| **感知延迟** | 从感知到生成建议的时间 | < 2 秒 |
| **执行延迟** | 从用户确认到开始执行的时间 | < 500ms |
| **习惯检测准确率** | 检测到的习惯实际有效的比例 | > 80% |
| **内存使用** | 运行时内存占用 | < 200MB |
| **CPU 使用** | 平均 CPU 使用率 | < 5% |

### 15.3 质量指标

| 指标 | 定义 | 目标 |
|------|------|------|
| **崩溃率** | 每千次会话的崩溃次数 | < 1 |
| **Bug 关闭时间** | P0 Bug 平均关闭时间 | < 24 小时 |
| **测试覆盖率** | 代码测试覆盖率 | > 80% |
| **文档完整性** | API 文档覆盖率 | 100% |

### 15.4 社区指标

| 指标 | 定义 | 目标 (12个月) |
|------|------|--------------|
| **GitHub Stars** | 仓库 Star 数 | 10,000 |
| **贡献者数** | 活跃贡献者数量 | 100 |
| **插件数量** | 社区插件数量 | 50 |
| **文档访问量** | 月文档访问量 | 50,000 |

---

## 16. 市场痛点与解决方案

### 16.1 市场现状数据

| 指标 | 数据 | 来源 |
|------|------|------|
| AI 付费意愿 | 仅 3% 用户愿意付费 | 智源社区 2025 调研 |
| 实际使用率 | 不足全中国人口的 0.1% | 行业调研 |
| AI 项目成功率 | 仅 25% 实现预期 ROI | IBM 2025 报告 |
| 企业规模化部署 | 不到 20% 获得实质性回报 | 36氪 AI 报告 |
| AI 人才缺口 | 超过 500 万 | 行业报告 |

**核心洞察**: 虽然 AI 技术已经非常成熟，但绝大多数普通人在日常工作中并不使用 AI。

### 16.2 普通人用不上 AI 的 10 大痛点

#### 痛点 1: 不知道问什么 (最大痛点)

> "面对空白输入框不知道从何开始，提问太模糊，AI 无法理解真实意图。"

**传统 AI**: 等用户输入问题
**Hawkeye**: 自动检测用户正在做什么，主动生成针对性建议

#### 痛点 2: Prompt 工程门槛高

> "需要学习 SCQA、TRACE 等框架，设定角色、拆解任务。"

**传统 AI**: 需要用户学习 Prompt 技巧
**Hawkeye**: 完全不需要 Prompt，系统根据上下文自动构建

#### 痛点 3: 注册和访问障碍

> "需要 VPN、海外手机号、海外信用卡。"

**传统 AI**: 需要科学上网 + 海外注册
**Hawkeye**: 本地优先 + 支持国产大模型 + 安装即用

#### 痛点 4: 学了不会用，难以落地

> "知道 AI 厉害，但不知道在工作中怎么用。"

**传统 AI**: 用户主动找 AI 的使用场景
**Hawkeye**: AI 主动发现用户的使用场景

#### 痛点 5: 问题定义能力不足

> "不知道要关注哪些维度，不会先明确分析目标。"

**传统 AI**: 等用户定义好问题再回答
**Hawkeye**: 自动帮用户定义问题并生成解决方案

#### 痛点 6: 信任问题

> "担心 AI 给出错误答案，不敢让 AI 直接执行操作。"

**传统 AI**: 直接执行或给出答案
**Hawkeye**: Human-in-the-Loop，展示优缺点风险，用户确认后才执行，所有操作可回滚

#### 痛点 7: 隐私和安全顾虑

> "不敢把敏感数据发给云端 AI，公司内网屏蔽所有 .ai 网站。"

**传统 AI**: 所有数据上传云端
**Hawkeye**: 本地优先，敏感内容自动过滤，数据永远不出本机

#### 痛点 8: 使用效果差距悬殊

> "4%的企业用AI提效超过80%，34%的企业提效不到20%。会用的人和不会用的人差距巨大。"

**传统 AI**: 效果取决于用户技能
**Hawkeye**: 效果由系统保证，自动学习用户习惯，新手和专家得到同样优质体验

#### 痛点 9: 技能培训陷阱

> "想学 AI 但找不到靠谱的老师，付费课程学完发现没用。"

**传统 AI**: 先学习，再使用
**Hawkeye**: 边用边学，无需培训，安装后立即可用

#### 痛点 10: 成本和 ROI 不确定

> "ChatGPT Plus 每月 $20，企业 AI 部署动辄百万投入。"

**传统 AI**: 订阅付费 / 高昂部署成本
**Hawkeye**: 完全免费开源，可用免费本地模型

### 16.3 Hawkeye vs 传统 AI 对比

| 痛点 | 传统 AI 方式 | Hawkeye 方式 |
|------|-------------|-------------|
| **交互模式** | 用户主动提问 | AI 主动建议 |
| **使用门槛** | 需要学习 Prompt | 无需任何学习 |
| **问题定义** | 用户自己想 | 系统自动识别 |
| **信任问题** | 直接执行 | 先展示方案再确认 |
| **隐私安全** | 数据上云 | 本地优先 |
| **使用成本** | 订阅付费 | 完全免费 |
| **学习曲线** | 先学再用 | 用了就会 |
| **适用场景** | 用户自己发现 | 系统自动发现 |

### 16.4 核心差异化定位

**传统 AI 助手的交互模式**:
> "你有什么问题，问我"

**Hawkeye 的交互模式**:
> "我看到你在做 X，需要帮你 Y 吗？"

这个根本性的差异使得 Hawkeye 能够服务那些"不知道问什么"的 99.9% 的普通人。

### 16.5 给普通人的 AI

Hawkeye 的核心价值可以总结为 **"五个零"**：

| 零 | 说明 |
|---|------|
| **零门槛** | 安装即用，无需注册、配置、学习 |
| **零输入** | 不用想问什么，AI 主动发现你的需求 |
| **零风险** | 所有操作需要确认，可以回滚 |
| **零成本** | 开源免费，支持完全离线使用 |
| **零隐私泄露** | 本地优先，数据不出本机 |

> **详细痛点分析请参考**: [用户痛点研究文档](./user-pain-points-research.md)

---

## 17. 零输入傻瓜式体验设计

### 17.1 核心理念

> **"安装即运行，观察即建议，一键即执行"**

用户不需要：
- ❌ 配置 API Key
- ❌ 设置监控路径
- ❌ 学习任何操作
- ❌ 输入任何指令
- ❌ 理解技术概念

用户只需要：
- ✅ 安装
- ✅ 看建议
- ✅ 点确认或忽略

### 17.2 自动配置系统

#### 智能 AI 后端选择
```typescript
async selectAIBackend(): Promise<AIBackend> {
  // 优先级：
  // 1. 检测本地 Ollama (免费、隐私)
  if (await this.detectOllama()) {
    return { type: 'ollama', model: 'llama3.2' };
  }

  // 2. 使用内置轻量模型 (离线可用)
  if (await this.hasBuiltinModel()) {
    return { type: 'builtin', model: 'hawkeye-tiny' };
  }

  // 3. 使用免费云端额度 (新用户福利)
  return { type: 'cloud', model: 'hawkeye-free-tier' };
}
```

#### 默认监控路径 (自动检测)

| 平台 | 自动监控路径 | 说明 |
|------|-------------|------|
| **所有平台** | `~/Desktop` | 桌面文件 |
| **所有平台** | `~/Downloads` | 下载文件 |
| **所有平台** | `~/Documents` | 文档 |
| **macOS** | `~/Library/Application Support/Code/User` | VS Code 配置 |
| **Windows** | `%APPDATA%\Code\User` | VS Code 配置 |
| **Linux** | `~/.config/Code/User` | VS Code 配置 |

### 17.3 智能默认值

```typescript
const SMART_DEFAULTS = {
  // 建议频率 - 不要太烦人
  suggestion: {
    maxPerHour: 5,                    // 每小时最多 5 个建议
    cooldownAfterReject: 30 * 60_000, // 拒绝后 30 分钟冷却
    autoHideDelay: 5000,              // 5 秒后自动隐藏
  },

  // 感知配置 - 平衡性能和功能
  perception: {
    clipboardCheckInterval: 500,      // 剪贴板检查间隔
    screenCaptureEnabled: false,      // 默认关闭屏幕截图(隐私)
    fileWatchDebounce: 1000,          // 文件变化防抖
  },

  // 隐私设置 - 默认最严格
  privacy: {
    storeScreenshots: false,          // 不存储截图
    anonymizeData: true,              // 匿名化数据
    localProcessingOnly: true,        // 仅本地处理
  },

  // 执行配置 - 安全第一
  execution: {
    requireConfirmation: true,        // 需要确认
    autoApproveReadOnly: true,        // 只读操作自动批准
    maxAutoRetries: 0,                // 不自动重试
  },
};
```

### 17.4 渐进式功能发现

不要一开始就展示所有功能，让用户逐步发现：

| 里程碑 | 解锁功能 |
|-------|---------|
| 安装完成 | 错误诊断、文件整理建议 |
| 使用 3 天 | 上下文恢复、剪贴板历史 |
| 处理 10 个建议 | 习惯学习、个性化建议 |
| 使用 7 天 | 自动化工作流、快捷操作 |
| 使用 30 天 | 高级设置、自定义规则 |

### 17.5 一键执行流程

对于**安全操作**，一键直接执行：
- 复制代码到剪贴板
- 打开相关文件
- 跳转到指定行

对于**需要确认的操作**，显示简单确认：
```
┌───────────────────────────────────┐
│  确认修改文件？                    │
│                                   │
│  📄 src/components/UserList.tsx   │
│  📝 第 42 行添加空值检查          │
│                                   │
│  [ 取消 ]      [ ✅ 确认修改 ]    │
└───────────────────────────────────┘
```

### 17.6 静默错误处理

```typescript
const errorRecovery = {
  // AI 后端不可用
  aiBackendUnavailable: async () => {
    // 1. 尝试切换到备用后端
    // 2. 如果都不行，降级到离线模式
    // 3. 静默通知用户（托盘图标变化）
    // 4. 不弹窗打扰
  },

  // 权限被拒绝
  permissionDenied: async (permission: string) => {
    // 1. 禁用相关功能
    // 2. 下次使用时再次请求
    // 3. 不反复骚扰
  },

  // 网络错误
  networkError: async () => {
    // 1. 自动切换到离线模式
    // 2. 网络恢复后自动切回
    // 3. 用户完全无感
  },
};
```

### 17.7 零输入完整场景

```
[安装] 用户下载并安装 Hawkeye
[启动] Hawkeye 自动启动，静默运行
[触发] 用户复制了一段错误代码
[建议] 右下角弹出小气泡："检测到错误，需要帮助吗？"
[查看] 用户点击气泡，看到解决方案
[执行] 用户点击"应用修复"
[完成] 文件自动修改，问题解决

整个过程用户没有：
- 输入任何命令
- 配置任何选项
- 理解任何技术概念
```

> **详细设计请参考**: [零输入体验设计文档](./zero-input-experience.md)

### 17.8 行业交互方案研究

为了实现真正的"零 Prompt"体验，我们研究了业界三个领先的 AI 驱动 UI 生成方案：

#### 17.8.1 Google A2UI (Agent-to-User Interface)

**项目地址**: [github.com/google/A2UI](https://github.com/google/A2UI)

**核心理念**: 声明式 JSON 格式的 Agent-to-User 界面协议

**关键特性**:
| 特性 | 说明 |
|------|------|
| **声明式 UI** | AI 输出 JSON 描述，前端负责渲染 |
| **组件目录** | 预定义的 UI 组件类型（按钮、表单、卡片等） |
| **框架无关** | 可适配 React、Vue、Flutter 等任何前端框架 |
| **双向通信** | 用户操作可反馈给 AI 进行下一步推理 |

**交互模式**:
```
AI 分析上下文 → 生成 JSON UI 描述 → 渲染为可交互组件 → 用户点击选择 → 反馈给 AI
```

**Hawkeye 借鉴点**:
- 使用声明式 JSON 描述建议卡片
- 组件目录系统便于扩展新的建议类型
- 用户交互可作为反馈优化后续建议

#### 17.8.2 Flutter GenUI

**项目地址**: [github.com/flutter/genui](https://github.com/flutter/genui)

**核心理念**: AI 驱动的动态界面生成 SDK

**关键特性**:
| 特性 | 说明 |
|------|------|
| **Widget 组合** | 基于 JSON 的 Widget 树描述 |
| **状态反馈** | 双向状态绑定，用户操作实时反馈 |
| **流式渲染** | 支持 AI 流式输出，渐进式 UI 构建 |
| **类型安全** | 严格的 Schema 验证 |

**交互流程**:
```typescript
interface GenUIFlow {
  // 1. AI 观察用户上下文
  observe: () => UserContext;

  // 2. 生成 UI 描述
  generate: (context: UserContext) => UIDescription;

  // 3. 渲染为交互组件
  render: (description: UIDescription) => Widget;

  // 4. 收集用户选择
  collect: (userAction: Action) => Feedback;

  // 5. 循环优化
  refine: (feedback: Feedback) => void;
}
```

**Hawkeye 借鉴点**:
- 流式 UI 生成提升响应速度
- 状态反馈循环实现个性化建议
- 严格 Schema 确保 UI 稳定性

#### 17.8.3 Vercel json-render

**项目地址**: [github.com/vercel-labs/json-render](https://github.com/vercel-labs/json-render)

**核心理念**: AI → JSON → React 渲染管道

**关键特性**:
| 特性 | 说明 |
|------|------|
| **Zod Schema** | 使用 Zod 定义组件目录，提供类型安全 |
| **Catalog 模式** | 预定义可用组件列表供 AI 选择 |
| **流式渲染** | 支持 AI 流式输出的实时渲染 |
| **React 原生** | 无缝集成 React 生态 |

**组件目录示例**:
```typescript
const suggestionCatalog = z.object({
  type: z.enum(['action_card', 'quick_fix', 'file_operation', 'code_snippet']),
  title: z.string(),
  description: z.string(),
  actions: z.array(z.object({
    label: z.string(),
    action: z.enum(['execute', 'preview', 'dismiss', 'modify']),
    primary: z.boolean().optional(),
  })),
  metadata: z.object({
    confidence: z.number(),
    reversible: z.boolean(),
    riskLevel: z.enum(['low', 'medium', 'high']),
  }),
});
```

**Hawkeye 借鉴点**:
- Zod Schema 定义建议组件类型
- Catalog 模式限制 AI 输出范围，提高稳定性
- 流式渲染提供即时反馈

#### 17.8.4 Hawkeye 交互方案设计

基于以上研究，Hawkeye 采用 **"观察-生成-选择"** 交互模式：

**核心原则：用户全程不需要输入任何文字，所有交互通过点击完成。**

```
┌─────────────────────────────────────────────────────────────────┐
│                    Hawkeye 零 Prompt 交互流程                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   [1. 观察]          [2. 理解]          [3. 生成]              │
│   ┌─────────┐       ┌─────────┐       ┌─────────┐             │
│   │ 屏幕    │       │ 上下文  │       │ JSON    │             │
│   │ 剪贴板  │──────▶│ 意图    │──────▶│ UI 描述 │             │
│   │ 文件    │       │ 推理    │       │         │             │
│   └─────────┘       └─────────┘       └─────────┘             │
│                                              │                  │
│                                              ▼                  │
│   [6. 学习]          [5. 执行]          [4. 展示]              │
│   ┌─────────┐       ┌─────────┐       ┌─────────┐             │
│   │ 反馈    │       │ 用户    │       │ 建议    │             │
│   │ 优化    │◀──────│ 点击    │◀──────│ 卡片    │             │
│   │ 记忆    │       │         │       │         │             │
│   └─────────┘       └─────────┘       └─────────┘             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 17.8.5 Web 端零输入对话界面示例

以下展示 Hawkeye Web 端的真实交互场景，**用户全程无需输入任何文字**：

```
┌─────────────────────────────────────────────────────────────────┐
│                         Hawkeye                            ⚙️   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 💬 对话                                                  │   │
│  │                                                         │   │
│  │ 🤖 帮我整理下载文件夹...                                  │   │
│  │                                                         │   │
│  │ 🤖 好的！我已检测到 23 个文件...                          │   │
│  │                                                         │   │
│  │  ┌────────────────────────────────────────────────┐    │   │
│  │  │ 📁 按类型整理                                   │    │   │
│  │  │ 将文件按扩展名分类到不同文件夹                   │    │   │
│  │  │ [ 执行 ]  [ 预览 ]  [ 忽略 ]                    │    │   │
│  │  └────────────────────────────────────────────────┘    │   │
│  │                                                         │   │
│  │  ┌────────────────────────────────────────────────┐    │   │
│  │  │ 📅 按日期整理                                   │    │   │
│  │  │ 将文件按下载日期分类                            │    │   │
│  │  │ [ 执行 ]  [ 预览 ]  [ 忽略 ]                    │    │   │
│  │  └────────────────────────────────────────────────┘    │   │
│  │                                                         │   │
│  │  ┌────────────────────────────────────────────────┐    │   │
│  │  │ 🗑️ 清理重复文件                                 │    │   │
│  │  │ 发现 5 个重复文件，可释放 1.2GB 空间             │    │   │
│  │  │ [ 执行 ]  [ 预览 ]  [ 忽略 ]                    │    │   │
│  │  └────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                         状态面板                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ 🖥️ 屏幕感知   │  │ 📁 文件监控   │  │ 📋 剪贴板    │          │
│  │ 正在分析...   │  │ 检测到 3 个   │  │ 已捕获代码   │          │
│  │ ● 运行中     │  │ 新文件        │  │ 片段         │          │
│  │              │  │ ● 活跃       │  │ ● 就绪       │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 💡 任务建议                                              │   │
│  │ 生成了 5 个建议                              [ 查看全部 ] │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ⚠️ 注意：界面没有输入框，所有交互通过点击按钮完成              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**交互流程说明**：

| 步骤 | 系统行为 | 用户行为 |
|------|---------|---------|
| 1 | 自动检测下载文件夹变化 | 无需操作 |
| 2 | AI 分析文件并生成整理建议 | 无需操作 |
| 3 | 展示多个可选方案卡片 | 浏览方案 |
| 4 | - | **点击**「执行」或「预览」 |
| 5 | 执行选中的方案 | 无需操作 |
| 6 | 显示执行结果 | **点击**「完成」或「撤销」 |

**与传统 AI 助手对比**：

| 特性 | 传统 AI (ChatGPT/Claude) | Hawkeye |
|------|-------------------------|---------|
| 启动方式 | 用户输入问题 | AI 主动发现任务 |
| 交互方式 | 文字对话 | 点击按钮 |
| 输入框 | 必须有 | **没有** |
| 方案选择 | 用户打字确认 | 点击卡片按钮 |
| 执行确认 | "请帮我执行" | 点击「执行」 |

**核心设计原则**:

| 原则 | 实现方式 |
|------|---------|
| **零输入** | AI 主动观察，用户只需点击 |
| **无输入框** | 界面不包含任何文本输入框 |
| **按钮交互** | 所有操作通过点击预定义按钮完成 |
| **卡片选择** | AI 生成多个方案，用户点击选择 |
| **可预测** | 组件目录限制，AI 输出稳定可控 |
| **可扩展** | JSON Schema 支持新组件类型 |
| **可回滚** | 所有操作记录，支持撤销 |
| **个性化** | 用户反馈循环，持续优化建议 |

**建议组件类型目录**:

```typescript
// 建议卡片 - 用户通过点击按钮交互
interface SuggestionCard {
  icon: string;           // 图标
  title: string;          // 标题
  description: string;    // 描述
  actions: ActionButton[]; // 操作按钮
}

interface ActionButton {
  label: string;          // 按钮文字: 执行/预览/忽略/撤销
  type: 'primary' | 'secondary' | 'danger';
  action: 'execute' | 'preview' | 'dismiss' | 'undo';
}

// 状态卡片 - 展示系统状态，无需用户输入
interface StatusCard {
  icon: string;
  title: string;
  status: string;
  indicator: 'running' | 'active' | 'ready' | 'idle';
}

// 建议类型枚举
type SuggestionType =
  | 'quick_action'      // 快速操作：一键执行
  | 'code_fix'          // 代码修复：展示 diff
  | 'file_operation'    // 文件操作：移动、重命名
  | 'context_restore'   // 上下文恢复：打开相关文件
  | 'learning_card'     // 学习卡片：解释概念
  | 'workflow_suggest'  // 工作流建议：自动化任务
  | 'multi_choice'      // 多选项：让用户选择方案
  | 'confirmation'      // 确认框：危险操作确认
```

---

### 17.9 竞品功能研究：AI 伴侣与智能助手

基于对 [moeru-ai/airi](https://github.com/moeru-ai/airi)、PyGPT、Fellou 等开源项目的调研，提取可借鉴的功能特性。

#### 17.9.1 AIRI (moeru-ai) - AI 虚拟伴侣平台

**项目定位**: 自托管 AI 虚拟角色平台，支持实时语音交互和游戏陪玩

| 功能特性 | 描述 | Hawkeye 借鉴价值 |
|----------|------|-----------------|
| **实时语音对话** | 超低延迟语音交互 | ⭐⭐⭐ 可作为辅助交互方式 |
| **游戏陪玩** | Minecraft、Factorio 等游戏中的 AI 伙伴 | ⭐ 垂直场景，暂不需要 |
| **VRM/Live2D 支持** | 虚拟形象动画和表情 | ⭐⭐ 可增强用户亲和感 |
| **记忆系统** | 长期记忆存储和关联 | ⭐⭐⭐ 核心功能，已规划 |
| **多 LLM 支持** | 20+ 模型提供商 | ⭐⭐⭐ 已实现 Claude + Ollama |
| **桌面常驻** | Tamagotchi 模式，始终陪伴 | ⭐⭐⭐ 符合 Hawkeye 定位 |
| **原生 GPU 加速** | CUDA/Metal 支持 | ⭐⭐ 本地模型性能优化 |

**可借鉴功能**:
1. **语音交互层**: 添加可选语音输入/输出，降低交互门槛
2. **情感化反馈**: AI 回复可附带情绪指示 (开心/担忧/建议)
3. **常驻通知**: Tray 图标动态变化，展示 AI 状态

#### 17.9.2 PyGPT - 桌面 AI 助手

**项目定位**: 开源桌面 AI 助手，强调长期记忆和自主循环

| 功能特性 | 描述 | Hawkeye 借鉴价值 |
|----------|------|-----------------|
| **长期记忆** | 跨会话记忆保留 | ⭐⭐⭐ 核心功能，已规划 |
| **持续录制模式** | 屏幕/音频持续捕获 | ⭐⭐⭐ 符合感知层设计 |
| **自主循环评估** | AI 自主判断下一步 | ⭐⭐ 可增强主动性 |
| **多模态支持** | 视觉+音频+文本 | ⭐⭐⭐ 感知层多模态 |

**可借鉴功能**:
1. **自主循环模式**: AI 完成一个建议后，自动评估是否有下一步
2. **会话连续性**: 关闭重开后，恢复上次上下文

#### 17.9.3 Fellou - 代理式 AI 浏览器

**项目定位**: 具备主动帮助能力的 AI 浏览器

| 功能特性 | 描述 | Hawkeye 借鉴价值 |
|----------|------|-----------------|
| **主动任务帮助** | AI 主动发现可帮助的点 | ⭐⭐⭐ 核心理念一致 |
| **代理式记忆** | 连接历史、上下文、知识库 | ⭐⭐⭐ 符合 MemOS 设计 |
| **动态多任务** | 同时处理多个任务流 | ⭐⭐ 可增强并行能力 |
| **网页深度理解** | 结构化解析网页内容 | ⭐⭐⭐ Chrome 扩展核心能力 |

**可借鉴功能**:
1. **任务队列可视化**: 展示当前正在处理的多个任务
2. **知识图谱**: 将感知到的信息关联成知识网络

#### 17.9.4 工作流自动化平台对比

| 平台 | 定位 | AI 特性 | Hawkeye 差异 |
|------|------|---------|--------------|
| **Activepieces** | 低代码自动化 | AI Copilot 辅助构建 | Hawkeye 更主动，无需构建 |
| **n8n** | 工作流自动化 | AI 节点支持 | Hawkeye 更轻量，零配置 |
| **Zapier** | SaaS 集成 | AI Actions | Hawkeye 本地优先 |
| **Make** | 可视化自动化 | AI 场景推荐 | Hawkeye 自动发现场景 |

**核心差异**: Hawkeye 不需要用户预定义工作流，AI 自动发现并建议自动化机会。

#### 17.9.5 功能优先级建议

基于调研，建议 Hawkeye 按以下优先级增加功能：

**P0 - 核心体验 (已规划)**
- ✅ 主动感知 (屏幕、剪贴板、文件)
- ✅ 意图识别与建议生成
- ✅ 本地优先架构
- ✅ 多端同步 (Desktop/VS Code/Chrome)

**P1 - 增强体验 (建议增加)**
| 功能 | 来源 | 实现复杂度 | 用户价值 |
|------|------|-----------|---------|
| 语音输入 | AIRI | 中 | 高 |
| 自主循环模式 | PyGPT | 低 | 中 |
| 任务队列可视化 | Fellou | 低 | 中 |
| 情感化反馈 | AIRI | 低 | 中 |

**P2 - 差异化功能 (未来考虑)**
| 功能 | 来源 | 实现复杂度 | 用户价值 |
|------|------|-----------|---------|
| 虚拟形象 | AIRI | 高 | 低 |
| 知识图谱 | Fellou | 高 | 高 |
| 游戏陪玩 | AIRI | 高 | 低 |

#### 17.9.6 技术实现参考

**语音交互层 (P1)**
```typescript
// 可选语音输入模块
interface VoiceInputConfig {
  enabled: boolean;
  wakeWord?: string;        // "Hey Hawkeye"
  language: 'en' | 'zh-CN' | 'auto';
  localProcessing: boolean; // 使用 Whisper 本地处理
}

// 语音反馈模块
interface VoiceFeedbackConfig {
  enabled: boolean;
  voice: 'default' | 'custom';
  speed: number;            // 0.5 - 2.0
  localTTS: boolean;        // 使用本地 TTS
}
```

**自主循环模式 (P1)**
```typescript
interface AutonomousLoopConfig {
  enabled: boolean;
  maxIterations: number;    // 最大自主迭代次数
  pauseOnHighRisk: boolean; // 高风险操作暂停
  requireConfirmEvery: number; // 每 N 次操作需确认
}

// 自主循环流程
// 1. 执行用户确认的建议
// 2. AI 评估执行结果
// 3. 如果发现新机会，生成新建议
// 4. 根据配置决定是否自动继续或等待确认
```

**任务队列可视化 (P1)**
```typescript
interface TaskQueueDisplay {
  activeTasks: Array<{
    id: string;
    title: string;
    status: 'pending' | 'running' | 'paused' | 'completed';
    progress: number;
    canPause: boolean;
    canCancel: boolean;
  }>;
  completedToday: number;
  suggestionsGenerated: number;
}
```

---

## 18. 附录

### 18.1 术语表

| 术语 | 定义 |
|------|------|
| **感知 (Perception)** | 观察用户工作环境的能力，包括屏幕、窗口、剪贴板等 |
| **推理 (Reasoning)** | 基于感知到的上下文，推断用户意图并生成建议 |
| **执行 (Execution)** | 根据用户确认的计划，自动执行任务 |
| **MemOS** | Memory Operating System，用于管理 AI 记忆的系统 |
| **情节记忆** | 记录具体事件和经历的记忆类型 |
| **语义记忆** | 存储概念和知识的记忆类型 |
| **程序性记忆** | 存储技能和习惯的记忆类型 |
| **工作记忆** | 当前会话的短期记忆 |

### 18.2 参考资料

**开源项目**:
- [MemOS - Memory Operating System](https://github.com/MemTensor/MemOS)
- [Eigent - Open Source Cowork Desktop](https://github.com/eigent-ai/eigent)
- [CrewAI - Multi-Agent Framework](https://github.com/crewAIInc/crewAI)
- [SuperAGI - Autonomous AI Agent Framework](https://github.com/TransformerOptimus/SuperAGI)
- [LangGraph - Plan-and-Execute Agents](https://github.com/langchain-ai/langgraph)

**AI 伴侣与桌面助手**:
- [AIRI - AI 虚拟伴侣平台](https://github.com/moeru-ai/airi) - 实时语音、记忆系统、多 LLM 支持
- [PyGPT - 桌面 AI 助手](https://github.com/szczyglis-dev/py-gpt) - 长期记忆、自主循环评估
- [Fellou - 代理式 AI 浏览器](https://fellou.ai/) - 主动任务帮助、代理式记忆

**AI 驱动 UI 生成**:
- [Google A2UI - Agent-to-User Interface Protocol](https://github.com/google/A2UI)
- [Flutter GenUI - AI-Driven Dynamic UI SDK](https://github.com/flutter/genui)
- [Vercel json-render - AI → JSON → React Pipeline](https://github.com/vercel-labs/json-render)

**研究论文**:
- Plan-and-Solve Prompting (2023)
- User Behavior Analytics Survey (2020)
- Multi-Agent Systems for Task Automation

**工具和框架**:
- [Langfuse - LLM Observability](https://langfuse.com/)
- [Arize Phoenix - ML Observability](https://docs.arize.com/phoenix/)
- [Ollama - Local LLM](https://ollama.ai/)

### 18.3 相关文档

| 文档 | 路径 | 说明 |
|------|------|------|
| **详细实现规格** | [implementation-spec.md](./implementation-spec.md) | 完整的技术实现规格，包含所有模块的代码级设计 |
| **用户痛点研究** | [user-pain-points-research.md](./user-pain-points-research.md) | 普通人使用 AI 的 10 大痛点及 Hawkeye 解决方案 |
| **零输入体验设计** | [zero-input-experience.md](./zero-input-experience.md) | 傻瓜式体验的详细设计规格 |
| **原型计划** | [prototype-plan.md](./prototype-plan.md) | MVP 原型开发计划 |

> **开发者注意**: 本 PRD 定义产品需求和目标，具体技术实现细节请参阅 [implementation-spec.md](./implementation-spec.md)。

### 18.4 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0 | 2026-01-01 | 初始版本 |
| 2.0 | 2026-01-20 | 增加 MemOS 集成、行为追踪、计划分析等完整规格 |
| 2.1 | 2026-01-20 | 新增第 17 章：零输入傻瓜式体验设计 |
| 2.2 | 2026-01-20 | 新增第 16 章：市场痛点与解决方案（基于用户研究） |
| 2.3 | 2026-01-20 | 添加详细实现规格文档引用 (implementation-spec.md) |
| 2.4 | 2026-01-20 | 新增 17.8 节：行业交互方案研究 (A2UI/GenUI/json-render) |
| 2.5 | 2026-01-20 | 新增 17.9 节：竞品功能研究 (AIRI/PyGPT/Fellou) |

---

**文档结束**

---

*本文档由 Hawkeye Team 编写和维护。如有问题或建议，请提交 Issue。*
