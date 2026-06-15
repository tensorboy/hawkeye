# Shadow 自主智能增强实施计划
# Shadow Autonomous Intelligence Enhancement Implementation Plan

> 目标: 打造一个无需输入 Prompt 就能自主执行的丝滑 AI 助手
> Goal: Build a smooth AI assistant that can autonomously execute without prompt input

---

## 📁 文件结构规划 (File Structure)

```
packages/core/src/
├── autonomous/                    # 新增: 自主能力模块
│   ├── index.ts                   # 模块导出
│   ├── auto-suggest.ts            # P0: 自动建议引擎
│   ├── proactive-intent.ts        # P0: 主动意图检测
│   ├── pattern-detector.ts        # P0: 行为模式检测
│   └── types.ts                   # 类型定义
│
├── grounding/                     # 新增: UI 定位模块
│   ├── index.ts                   # 模块导出
│   ├── ui-grounding.ts            # P1: UI 元素检测与定位
│   ├── element-detector.ts        # P1: 元素检测器
│   ├── nms.ts                     # P1: 非极大值抑制
│   └── types.ts                   # 类型定义
│
├── execution/
│   ├── action-types.ts            # P1: 统一动作类型系统
│   ├── nutjs-executor.ts          # P1: NutJS GUI 执行器
│   ├── action-parser.ts           # P1: 多格式动作解析器
│   └── ... (existing files)
│
├── ai/
│   ├── context-compressor.ts      # P2: 上下文压缩器
│   ├── self-reflection.ts         # P4: 自我反思模块
│   └── ... (existing files)
│
├── memory/
│   ├── skill-learner.ts           # P4: 技能学习系统
│   └── ... (existing files)
│
└── security/                      # 新增: 安全模块
    ├── index.ts                   # 模块导出
    ├── command-checker.ts         # P3: 危险命令检测
    ├── filesystem-guard.ts        # P3: 文件系统访问控制
    └── rollback-manager.ts        # P3: 自动回滚管理器
```

---

## 🔴 Phase 0: 核心自主能力 (P0 - 最高优先级)

### Task 0.1: AutoSuggestEngine (自动建议引擎)

**文件**: `packages/core/src/autonomous/auto-suggest.ts`

**功能**:
- 基于用户历史行为预测下一步操作
- 检测重复模式并建议自动化
- 与 QuickActions UI 集成

**依赖**: BehaviorTracker, PerceptionEngine, MemOS

**接口设计**:
```typescript
interface SuggestedAction {
  id: string;
  type: 'predicted' | 'repetitive' | 'contextual' | 'scheduled';
  action: PlanStep;
  confidence: number;
  reason: string;
  trigger?: () => Promise<void>;
}

interface AutoSuggestEngine {
  analyze(context: PerceptionContext): Promise<SuggestedAction[]>;
  getTopSuggestions(limit?: number): SuggestedAction[];
  executeSuggestion(id: string): Promise<ExecutionResult>;
  dismissSuggestion(id: string): void;
  learnFromFeedback(id: string, accepted: boolean): void;
}
```

**实现要点**:
1. 集成 BehaviorTracker 获取历史行为
2. 实现时间模式检测 (早上/下午/晚上的常用操作)
3. 实现窗口上下文建议 (打开 VS Code → 建议运行测试)
4. 实现重复操作检测 (连续 3 次相同操作 → 建议自动化)

---

### Task 0.2: ProactiveIntentDetector (主动意图检测)

**文件**: `packages/core/src/autonomous/proactive-intent.ts`

**功能**:
- 无需用户输入，自动检测意图
- 基于上下文变化触发建议
- 支持多种触发条件

**接口设计**:
```typescript
type IntentTrigger =
  | 'window_switch'      // 窗口切换
  | 'idle_timeout'       // 空闲超时
  | 'repeated_action'    // 重复操作
  | 'error_detected'     // 检测到错误
  | 'file_changed'       // 文件变化
  | 'time_based'         // 时间触发
  | 'clipboard_content'; // 剪贴板内容

interface ProactiveIntent {
  id: string;
  trigger: IntentTrigger;
  confidence: number;
  description: string;
  suggestedPlan: ExecutionPlan;
  autoExecute: boolean;  // 是否自动执行 (高置信度)
}

interface ProactiveIntentDetector {
  detect(context: PerceptionContext, prevContext?: PerceptionContext): Promise<ProactiveIntent | null>;
  registerTrigger(trigger: IntentTrigger, handler: TriggerHandler): void;
  setAutoExecuteThreshold(threshold: number): void;
}
```

---

### Task 0.3: PatternDetector (行为模式检测)

**文件**: `packages/core/src/autonomous/pattern-detector.ts`

**功能**:
- 检测用户行为的重复模式
- 识别工作流程序列
- 时间规律分析

**接口设计**:
```typescript
interface BehaviorPattern {
  id: string;
  type: 'sequence' | 'time_based' | 'context_based';
  actions: RecordedAction[];
  frequency: number;
  lastOccurrence: number;
  confidence: number;
}

interface PatternDetector {
  addObservation(action: RecordedAction): void;
  detectPatterns(): BehaviorPattern[];
  getPatternForContext(context: PerceptionContext): BehaviorPattern | null;
  exportPatterns(): BehaviorPattern[];
  importPatterns(patterns: BehaviorPattern[]): void;
}
```

---

## 🟠 Phase 1: UI 自动化能力 (P1)

### Task 1.1: UIGroundingPipeline (UI 定位管道)

**文件**: `packages/core/src/grounding/ui-grounding.ts`

**功能**:
- 从截图中检测 UI 元素
- 支持自然语言元素定位
- OCR + 视觉检测融合

**接口设计**:
```typescript
interface UIElement {
  id: string;
  type: 'button' | 'input' | 'link' | 'text' | 'icon' | 'checkbox' | 'dropdown';
  bounds: BoundingBox;
  text?: string;
  confidence: number;
  interactable: boolean;
}

interface UIGroundingPipeline {
  detectElements(screenshot: Screenshot): Promise<UIElement[]>;
  locateByDescription(description: string, elements: UIElement[]): UIElement | null;
  locateByText(text: string, elements: UIElement[]): UIElement[];
  getClickablePoint(element: UIElement): Point;
}
```

---

### Task 1.2: ActionSpace + NutJS Executor

**文件**:
- `packages/core/src/execution/action-types.ts`
- `packages/core/src/execution/nutjs-executor.ts`

**功能**:
- 统一的 GUI 动作类型系统
- 使用 NutJS 执行真实的 GUI 操作
- 屏幕坐标归一化

**接口设计**:
```typescript
type GUIAction =
  | { type: 'click'; x: number; y: number; button?: 'left' | 'right' | 'middle' }
  | { type: 'double_click'; x: number; y: number }
  | { type: 'type'; text: string; delay?: number }
  | { type: 'hotkey'; keys: string[] }
  | { type: 'scroll'; direction: 'up' | 'down' | 'left' | 'right'; amount: number }
  | { type: 'drag'; from: Point; to: Point }
  | { type: 'move'; x: number; y: number }
  | { type: 'wait'; duration: number }
  | { type: 'screenshot' };

interface NutJSExecutor {
  execute(action: GUIAction): Promise<ExecutionResult>;
  executeSequence(actions: GUIAction[]): Promise<ExecutionResult[]>;
  getScreenSize(): Promise<{ width: number; height: number }>;
  normalizeCoordinates(x: number, y: number): Promise<Point>;
}
```

---

## 🟡 Phase 2: 性能与体验优化 (P2)

### Task 2.1: DynamicQuickActions (动态快捷操作)

**文件**: 更新 `packages/desktop/src/renderer/components/A2UI/QuickActions.tsx`

**功能**:
- 动态生成基于上下文的快捷操作
- 显示建议的置信度
- 一键执行建议操作

---

### Task 2.2: ContextCompressor (上下文压缩器)

**文件**: `packages/core/src/ai/context-compressor.ts`

**功能**:
- 动态 Token 预算分配
- 增量更新 (只发送变化部分)
- 历史上下文摘要

---

## 🟢 Phase 3: 安全与可靠性 (P3)

### Task 3.1: 危险命令检测增强

**文件**: `packages/core/src/security/command-checker.ts`

### Task 3.2: 自动回滚管理器

**文件**: `packages/core/src/security/rollback-manager.ts`

---

## 🔵 Phase 4: 学习与进化 (P4)

### Task 4.1: SkillLearner (技能学习系统)

**文件**: `packages/core/src/memory/skill-learner.ts`

### Task 4.2: SelfReflection (自我反思模块)

**文件**: `packages/core/src/ai/self-reflection.ts`

---

## 📊 实施顺序

```
Week 1: P0 核心自主能力
├── Day 1-2: AutoSuggestEngine
├── Day 3-4: ProactiveIntentDetector
└── Day 5: PatternDetector + 集成测试

Week 2: P1 UI 自动化
├── Day 1-3: UIGroundingPipeline
└── Day 4-5: ActionSpace + NutJS

Week 3: P2 + P3
├── Day 1-2: DynamicQuickActions
├── Day 3: ContextCompressor
└── Day 4-5: Security 模块

Week 4: P4 + 集成
├── Day 1-3: SkillLearner + SelfReflection
└── Day 4-5: 全面集成测试
```

---

## 🎯 成功标准

1. **自主性**: 用户打开应用后，无需输入任何 Prompt，系统能自动建议 3+ 个相关操作
2. **准确性**: 建议操作的接受率 > 60%
3. **流畅性**: 从感知到建议的延迟 < 2 秒
4. **可靠性**: 执行成功率 > 95%，支持自动回滚

---

## 📝 开始执行

执行顺序:
1. 创建 `autonomous/` 目录结构
2. 实现 `types.ts` 定义所有类型
3. 实现 `pattern-detector.ts` (基础)
4. 实现 `auto-suggest.ts` (核心)
5. 实现 `proactive-intent.ts` (增强)
6. 集成到 Shadow 主引擎
7. 更新 QuickActions UI
