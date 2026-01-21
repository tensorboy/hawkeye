# Hawkeye v0.2.0 发布计划

**版本**: v0.2.0
**创建时间**: 2026-01-20
**预期发布**: 完成后立即发布
**优先级**: A > B > C

---

## 📋 发布目标

本次发布包含三个主要优先级：
- **Priority A**: Phase 3 - 行为追踪、习惯学习、计划分析
- **Priority B**: A2UI 界面 - Desktop 和 Chrome Extension 的卡片式零输入交互
- **Priority C**: 修复/测试现有功能 - 增加测试覆盖率

---

## 🏗️ Phase 1: Priority A - Phase 3 智能增强

### M3.1 行为追踪框架

#### 任务 A1.1: 行为事件系统 [core]
- [ ] 创建 `packages/core/src/behavior/events.ts`
  - 定义 `BehaviorEvent` 接口
  - 定义 `BehaviorEventType` 枚举
  - 实现事件收集器 `BehaviorCollector`
- [ ] 创建 `packages/core/src/behavior/tracker.ts`
  - 实现 `BehaviorTracker` 类
  - 窗口切换事件追踪
  - 应用使用时长统计
  - 文件操作序列记录
  - 剪贴板历史记录
  - 执行反馈收集

#### 任务 A1.2: 行为存储层 [core]
- [ ] 创建 `packages/core/src/behavior/storage.ts`
  - 本地 SQLite 存储
  - 事件批量写入优化
  - 数据保留策略（默认7天）
  - 敏感数据过滤

### M3.2 模式识别算法

#### 任务 A2.1: 特征提取 [core]
- [ ] 创建 `packages/core/src/behavior/features.ts`
  - 时间特征提取（时段、周期）
  - 频率特征提取（使用频率、操作频率）
  - 序列特征提取（操作序列模式）
  - 上下文特征提取（应用组合、文件类型）

#### 任务 A2.2: 模式识别器 [core]
- [ ] 创建 `packages/core/src/behavior/patterns.ts`
  - 时序模式识别（每日、每周规律）
  - 周期模式识别（工作周期、休息周期）
  - 关联规则挖掘（A->B 操作序列）
  - 异常检测（偏离常规模式）

### M3.3 习惯学习系统

#### 任务 A3.1: 习惯模型 [core]
- [ ] 创建 `packages/core/src/behavior/habits.ts`
  - `Habit` 接口定义
  - 习惯置信度计算
  - 习惯触发条件匹配
  - 习惯建议生成

#### 任务 A3.2: 习惯学习器 [core]
- [ ] 创建 `packages/core/src/behavior/learner.ts`
  - 增量学习算法
  - 习惯更新机制
  - 习惯衰减策略
  - 用户反馈融合

### M3.4 计划分析（优缺点）

#### 任务 A4.1: 计划分析器增强 [core]
- [ ] 更新 `packages/core/src/ai/analyzer.ts`
  - 添加优缺点分析 prompt
  - 风险评估逻辑
  - 替代方案生成
  - 影响范围分析

#### 任务 A4.2: 计划显示组件 [desktop/chrome]
- [ ] 更新 Desktop App 计划显示
  - 优缺点卡片
  - 风险级别标识
  - 可回滚标识
- [ ] 更新 Chrome Extension 计划显示
  - 简化版优缺点展示

---

## 🎨 Phase 2: Priority B - A2UI 界面实现

### Desktop A2UI

#### 任务 B1.1: A2UI 协议定义 [core]
- [ ] 创建 `packages/core/src/a2ui/types.ts`
```typescript
interface A2UICard {
  id: string;
  type: 'suggestion' | 'preview' | 'result' | 'confirmation';
  title: string;
  description?: string;
  icon?: string;
  actions: A2UIAction[];
  metadata?: Record<string, any>;
}

interface A2UIAction {
  id: string;
  label: string;
  type: 'primary' | 'secondary' | 'danger';
  icon?: string;
}
```

#### 任务 B1.2: Desktop A2UI 组件 [desktop]
- [ ] 创建 `packages/desktop/src/renderer/components/A2UI/`
  - `SuggestionCard.tsx` - 建议卡片（一键执行）
  - `PreviewCard.tsx` - 预览卡片（文件预览、计划预览）
  - `ResultCard.tsx` - 结果卡片（执行结果）
  - `ConfirmationCard.tsx` - 确认卡片（危险操作确认）
  - `CardList.tsx` - 卡片列表容器
  - `QuickActions.tsx` - 快捷操作栏

#### 任务 B1.3: Desktop App 主界面重构 [desktop]
- [ ] 重构 `packages/desktop/src/renderer/App.tsx`
  - 移除对话输入框
  - 改为卡片流式布局
  - 添加感知状态指示器
  - 实现卡片动画效果

### Chrome Extension A2UI

#### 任务 B2.1: Chrome Popup A2UI [chrome-extension]
- [ ] 重构 `packages/chrome-extension/src/popup/`
  - 创建 `A2UIPopup.tsx` 组件
  - 建议卡片列表
  - 一键操作按钮
  - 执行状态显示

#### 任务 B2.2: Chrome Popup HTML/CSS [chrome-extension]
- [ ] 更新 `packages/chrome-extension/public/popup.html`
  - 卡片式布局结构
  - 移除输入框元素
- [ ] 创建/更新 `packages/chrome-extension/public/popup.css`
  - A2UI 卡片样式
  - 响应式设计（固定宽度 360px）
  - 暗色主题支持

#### 任务 B2.3: Chrome Content Script [chrome-extension]
- [ ] 更新 `packages/chrome-extension/src/content/index.ts`
  - 浮动建议卡片（可选显示）
  - 页面分析触发
  - 快捷键支持

---

## 🧪 Phase 3: Priority C - 测试与修复

### 测试框架搭建

#### 任务 C1.1: Core 包测试 [core]
- [ ] 配置 Vitest 测试框架
- [ ] 创建 `packages/core/src/__tests__/`
  - `perception.test.ts` - 感知层测试
  - `reasoning.test.ts` - 推理层测试
  - `execution.test.ts` - 执行层测试
  - `behavior.test.ts` - 行为追踪测试
  - `a2ui.test.ts` - A2UI 协议测试

#### 任务 C1.2: Desktop 测试 [desktop]
- [ ] 配置 Electron 测试环境
- [ ] 创建组件测试
  - A2UI 组件测试
  - IPC 通信测试

#### 任务 C1.3: Chrome Extension 测试 [chrome-extension]
- [ ] 配置 Chrome Extension 测试
- [ ] 消息传递测试
- [ ] Popup 组件测试

### 现有功能修复

#### 任务 C2.1: 代码审查与修复
- [ ] 检查所有 TypeScript 类型错误
- [ ] 修复 ESLint 警告
- [ ] 检查并修复内存泄漏
- [ ] 优化启动性能

#### 任务 C2.2: 构建验证
- [ ] 确保 `pnpm build` 全部通过
- [ ] 确保 `pnpm lint` 无错误
- [ ] 确保 `pnpm test` 全部通过
- [ ] 验证各平台构建产物

---

## 📦 Phase 4: 发布准备

### 任务 D1: 版本更新
- [ ] 更新 `package.json` 版本号到 `0.2.0`
- [ ] 更新 Chrome Extension `manifest.json` 版本号
- [ ] 更新 README 更新日志

### 任务 D2: 构建发布包
- [ ] Desktop App 构建（macOS/Windows/Linux）
- [ ] Chrome Extension 构建
- [ ] VS Code Extension 构建

### 任务 D3: 发布
- [ ] Git tag: `v0.2.0`
- [ ] GitHub Release
- [ ] Chrome Web Store 提交（可选）
- [ ] VS Code Marketplace 提交（可选）

---

## 📁 新增/修改文件清单

### 新增文件
```
packages/core/src/
├── behavior/
│   ├── index.ts
│   ├── events.ts
│   ├── tracker.ts
│   ├── storage.ts
│   ├── features.ts
│   ├── patterns.ts
│   ├── habits.ts
│   └── learner.ts
├── a2ui/
│   ├── index.ts
│   ├── types.ts
│   └── renderer.ts
└── __tests__/
    ├── perception.test.ts
    ├── reasoning.test.ts
    ├── execution.test.ts
    ├── behavior.test.ts
    └── a2ui.test.ts

packages/desktop/src/renderer/
├── components/
│   └── A2UI/
│       ├── index.ts
│       ├── SuggestionCard.tsx
│       ├── PreviewCard.tsx
│       ├── ResultCard.tsx
│       ├── ConfirmationCard.tsx
│       ├── CardList.tsx
│       └── QuickActions.tsx
└── styles/
    └── a2ui.css

packages/chrome-extension/
├── src/popup/
│   └── A2UIPopup.tsx (新增或重构)
└── public/
    └── popup.css (更新)
```

### 修改文件
```
packages/desktop/src/renderer/App.tsx
packages/desktop/src/main/index.ts
packages/chrome-extension/src/popup/index.ts
packages/chrome-extension/public/popup.html
packages/core/src/ai/analyzer.ts
package.json (各包)
```

---

## ⏱️ 执行顺序

1. **A1** → A2 → A3 → A4 (Phase 3 核心功能，串行依赖)
2. **B1.1** → B1.2 → B1.3 (Desktop A2UI)
3. **B2** (Chrome A2UI，可与 B1 并行)
4. **C1** (测试框架，可与 A/B 并行)
5. **C2** (修复，在 A/B 完成后)
6. **D** (发布，所有任务完成后)

---

## ✅ 验收标准

### 功能验收
- [ ] 行为追踪正常记录用户操作
- [ ] 模式识别能检测每日重复任务
- [ ] 习惯建议生成准确
- [ ] A2UI 界面无需文字输入即可完成所有操作
- [ ] 计划显示包含优缺点和风险

### 质量验收
- [ ] 测试覆盖率 > 60%
- [ ] 无 TypeScript 类型错误
- [ ] 无 ESLint 错误
- [ ] 内存占用 < 200MB
- [ ] CPU 占用 < 5%

### 发布验收
- [ ] 所有平台构建成功
- [ ] Git tag 已创建
- [ ] GitHub Release 已发布
