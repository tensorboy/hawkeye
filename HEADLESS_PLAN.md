# Hawkeye 无 UI 运行能力 —— 执行计划

> **状态（2026-04-26）**：✅ Phase 1 完成 · ✅ Phase 2 完成 · 📋 Phase 3 待启动
> 完整使用文档见 [`HEADLESS.md`](HEADLESS.md)；cua-driver agent 集成见 [`packages/desktop-tauri/AGENT_INTEGRATION.md`](packages/desktop-tauri/AGENT_INTEGRATION.md)。

> **结论**：3 条路径技术上都可行，且彼此不互斥。建议 **Phase 1（Node CLI）** 立即开干（1 天交付），**Phase 2（Tauri Rust CLI）** 在 Phase 1 验证完后启动，**Phase 3** 按需推进。

---

## 验证后的事实基线

| 假设 | 状态 | 关键证据 |
|---|---|---|
| `@hawkeye/core` 完全 UI-agnostic | ✅ 真 | 零 `electron/react/@tauri-apps/document` 引用 |
| 已发布为双格式 (ESM+CJS+types) 库 | ✅ 真 | `package.json:5-29` 完整 `exports` map |
| 子路径导入可用 | ✅ 真 | `/perception` `/reasoning` `/execution` 都已 export |
| `createHawkeye()` 工厂 + 核心方法 | ✅ 真 | `hawkeye.ts:1554-1557` 工厂；`initialize/perceiveAndRecognize/generatePlan/executePlan` 全部 `hawkeye.ts:265-562` |
| `~/.hawkeye/` 存储惯例可被 config 覆盖 | ✅ 真 | `storage/storage.ts:19` `config.dataDir \|\| os.homedir()/.hawkeye` |
| Tauri Cargo.toml 已是库形式 | ✅ 真 | `crate-type = ["staticlib","cdylib","rlib"]` 已声明 |
| 现有 `bin` CLI 入口 | ❌ **缺** | `package.json` 无 `bin` 字段；需要新建 |

**已知风险**：
- ⚠️ `better-sqlite3` 需 native compile（Python + 编译工具链）—— 文档说明即可
- ⚠️ `nutjs-executor` 在纯 Node 下 GUI 操作会失败 → 默认禁用，引导用 cua-driver 或 browser-agent
- ⚠️ `screenshot-desktop` macOS 需 Screen Recording 权限

---

## Phase 1：Node CLI（路径 1）—— ✅ 已完成

**目标**：新增 `packages/cli/`，零改动现有代码，立即拿到 `hawkeye` 命令。

**完成情况**：
- ✅ 781 LOC TypeScript across 10 source files
- ✅ ESM bundle 17 KB (`packages/cli/dist/main.js`, shebang'd, exec)
- ✅ 7 子命令：`init / perceive / plan / execute / run / chat / daemon`
- ✅ 全局 `--json` flag for NDJSON output
- ✅ 4 层 config merge（defaults → file → env → overrides）
- ✅ `pnpm build` + `pnpm typecheck` 全绿；`hawkeye init` / `--version` / `--help` smoke 通过
- ⚠️ Daemon 子命令暂用 polling fallback —— `@hawkeye/core` 未暴露统一 `observation` event；订阅了 11 个真实事件。已在 README 注明。

### 文件清单
```
packages/cli/
├── package.json            # name=@hawkeye/cli, bin: { hawkeye }
├── tsconfig.json           # 继承根
├── tsup.config.ts          # 单文件打包，shebang
├── src/
│   ├── main.ts             # commander/yargs 入口
│   ├── config.ts           # 加载顺序：CLI args > env > ~/.config/hawkeye/cli.json > defaults
│   ├── output.ts           # JSON / pretty 双格式
│   └── commands/
│       ├── init.ts         # 生成默认 cli.json + 创建 ~/.hawkeye/
│       ├── perceive.ts     # 单次截屏+OCR+意图，输出 JSON
│       ├── plan.ts         # 读 intent.json → 生成 ExecutionPlan
│       ├── execute.ts      # 读 plan.json → 执行
│       ├── run.ts          # 端到端 perceive→plan→execute
│       ├── chat.ts         # 单轮 chat（无工具）
│       └── daemon.ts       # 长连接 observe loop，stdout 流式输出
└── README.md
```

### 子命令定义

| 命令 | 功能 | I/O |
|---|---|---|
| `hawkeye init` | 写 `~/.config/hawkeye/cli.json` 默认配置 | stdout: 路径 |
| `hawkeye perceive [--json]` | 单次感知 | stdout: `UserIntent[]` |
| `hawkeye plan <file>` | 从 intent.json 生成计划 | stdout: `ExecutionPlan` JSON |
| `hawkeye execute <file>` | 执行计划 | stdout: PlanExecution 状态流 |
| `hawkeye run "<task>"` | 端到端 | stdout: 执行结果 |
| `hawkeye chat "<msg>"` | 一次 chat | stdout: assistant text |
| `hawkeye daemon [--interval=3000]` | 持续 observe | stdout: NDJSON 事件流 |
| `hawkeye --version` / `--help` | 元信息 | stdout |

### 配置 schema (cli.json)
```jsonc
{
  "ai": {
    "providers": [
      { "type": "gemini", "apiKey": "...", "model": "gemini-2.5-flash" }
    ],
    "preferredProvider": "gemini"
  },
  "perception": { "enableScreen": true, "enableOCR": true },
  "storage": { "database": { "dbPath": "~/.hawkeye/hawkeye.db" } },
  "observe": { "intervalMs": 3000, "changeThreshold": 0.05 }
}
```

### 环境变量覆盖
- `HAWKEYE_CONFIG` → 自定义 config 路径
- `HAWKEYE_DATA_DIR` → 覆盖 `~/.hawkeye`
- `GEMINI_API_KEY` / `GOOGLE_API_KEY` / `OPENAI_API_KEY` → 已在 core 内置支持

### 工作量
- ~400 行 TS
- 0 行核心改动
- **1 个工程师 1 天**

### 验收
- [ ] `hawkeye init` 写出配置
- [ ] `hawkeye perceive --json | jq '.[].intentType'` 输出意图
- [ ] `hawkeye run "open Safari"` 端到端跑通
- [ ] `hawkeye daemon` 流式输出事件
- [ ] 完全脱离 Electron/Tauri（用 `pmap` / `lsof` 验证无 webview 进程）

---

## Phase 2：Tauri Rust CLI bin（路径 2）—— ✅ 已完成

**目标**：复用 desktop-tauri 的 Rust 后端，编译成 7-10MB 单二进制（无 webview / 无 Node）。

**完成情况**：
- ✅ 新增 `src/event_sink.rs`（54 LOC）—— `EventSink` trait + `TauriSink` / `StdoutSink` / `NoopSink`
- ✅ 新增 `src/bin/cli.rs`（173 LOC）—— clap-based 5 子命令
- ✅ `Cargo.toml` 显式声明 `[[bin]] hawkeye-desktop` + `[[bin]] hawkeye-cli`，新增 `clap = "4"` dep
- ✅ `lib.rs` 全部 `mod` → `pub mod`；setup 时把 `TauriSink` 装进 `AppState.event_sink`
- ✅ `state.rs` 加 `event_sink: RwLock<Option<SharedSink>>` 字段
- ✅ `agent/runner.rs` 的 `run_user_turn` 改用 `Arc<dyn EventSink>`
- ✅ `observe/loop_runner.rs::ObserveLoop::start` 改用 `Arc<dyn EventSink>`
- ✅ `perception/mod.rs::init` 删了未使用的 AppHandle 参数
- ✅ Verification：`cargo build --bin hawkeye-{desktop,cli}` 双绿；`cargo test --lib agent::` 5/5 通过；CLI smoke (`--help` / `--version` / `agent-status` / `config`) 全部通过
- 📦 ~227 LOC 新增 + ~70 LOC 重构跨 7 个现有文件

### 重构步骤

#### Step 2.1：抽 EventSink trait（解耦核心和 Tauri）

新文件 `src-tauri/src/event_sink.rs`：
```rust
use serde_json::Value;
use std::sync::Arc;

pub trait EventSink: Send + Sync {
    fn emit(&self, event: &str, payload: Value);
}

/// Tauri 实现 —— 转发到 AppHandle.emit
pub struct TauriSink(pub tauri::AppHandle);
impl EventSink for TauriSink {
    fn emit(&self, event: &str, payload: Value) {
        let _ = self.0.emit(event, payload);
    }
}

/// CLI 实现 —— stdout NDJSON
pub struct StdoutSink;
impl EventSink for StdoutSink {
    fn emit(&self, event: &str, payload: Value) {
        println!("{}", serde_json::json!({ "event": event, "data": payload }));
    }
}

/// 静默实现 —— 给一次性命令用
pub struct NoopSink;
impl EventSink for NoopSink {
    fn emit(&self, _: &str, _: Value) {}
}
```

#### Step 2.2：把 `lib.rs::run()` 拆三段

```rust
// 现状：单个 pub fn run() { tauri::Builder::default().setup(|app| {...}).invoke_handler!(...).run(...) }

// 改成：
pub fn run() {                    // Tauri 入口（保留）
    let cfg = config::load_config().unwrap_or_default();
    let state = init_core(cfg);
    tauri::Builder::default()
        .setup(move |app| init_tauri(app, state.clone()))
        .invoke_handler(tauri::generate_handler![...])
        .run(...);
}

pub fn init_core(cfg: AppConfig) -> Arc<AppState> {
    state::AppState::new(cfg)     // 纯逻辑
}

fn init_tauri(app: &mut App, state: Arc<AppState>) -> Result<()> {
    let handle = app.handle().clone();
    app.manage(state.clone());
    spawn_perception(&handle);
    spawn_agent_supervisor(&handle, &state);
    setup_tray(...)?;
    Ok(())
}
```

#### Step 2.3：observe/loop_runner.rs 解耦

```rust
// 旧：
pub fn start(handle: AppHandle, state: Arc<AppState>, ...) -> ObserveLoop {
    handle.emit(events::OBSERVE_STOPPED, ...);
}

// 新：
pub fn start(sink: Arc<dyn EventSink>, state: Arc<AppState>, ...) -> ObserveLoop {
    sink.emit(events::OBSERVE_STOPPED, json!({}));
}
```

约 5 处调用站点要改（`loop_runner.rs:6, 64`、`gaze_cmd.rs`、`commands/observe_cmd.rs` 等）。

#### Step 2.4：agent/runner.rs 解耦

`run_user_turn(app: AppHandle, ...)` → `run_user_turn(sink: Arc<dyn EventSink>, ...)`。
`commands/agent_cmd.rs::chat_with_agent` 在 Tauri 上下文里把 `app` 包成 `TauriSink`。

#### Step 2.5：perception/mod.rs::init 删 AppHandle 参数（你的报告说没用）

#### Step 2.6：新增 CLI bin

`src-tauri/Cargo.toml`：
```toml
[[bin]]
name = "hawkeye-cli"
path = "src/bin/cli.rs"

[dependencies]
clap = { version = "4", features = ["derive"] }   # 新增
```

`src-tauri/src/bin/cli.rs`：
```rust
use clap::{Parser, Subcommand};
use hawkeye_lib::{config, event_sink::StdoutSink, init_core, observe};
use std::sync::Arc;

#[derive(Parser)]
#[command(version, about = "Hawkeye headless CLI")]
struct Cli {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Single-shot screen perception (screenshot + OCR + window).
    Perceive,
    /// Continuous observe loop, NDJSON events to stdout.
    Observe { #[arg(long, default_value_t = 3000)] interval_ms: u64 },
    /// One-turn AI chat.
    Chat { text: String },
    /// Tool-using agent turn (requires cua-driver installed).
    Agent { text: String },
    /// Print effective config.
    Config,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    env_logger::init();
    let cli = Cli::parse();
    let cfg = config::load_config()?;
    let state = init_core(cfg);
    let sink = Arc::new(StdoutSink);

    match cli.cmd {
        Cmd::Perceive => { /* call perception once, print JSON */ }
        Cmd::Observe { interval_ms } => {
            let _loop = observe::ObserveLoop::start(sink.clone(), state, interval_ms, 0.05);
            tokio::signal::ctrl_c().await?;
        }
        Cmd::Chat { text } => { /* init AI, call chat, print */ }
        Cmd::Agent { text } => { /* init AI, ensure daemon, run agent turn */ }
        Cmd::Config => { println!("{}", serde_json::to_string_pretty(&*state.config.read().await)?); }
    }
    Ok(())
}
```

#### Step 2.7：Build matrix 验证
- `cargo build --release --bin hawkeye-cli` 跑通
- `cargo build --release --bin hawkeye-desktop` 仍跑通（Tauri 主程序不破）
- `pnpm tauri:dev` 仍跑通（端到端）
- `ls -lh target/release/hawkeye-cli` < 10MB

### 工作量
- 重构 lib.rs：~80 行变动
- EventSink + 实现：~80 行新增
- observe/agent 解耦：~50 行变动
- src/bin/cli.rs：~150 行新增
- Cargo.toml + clap：5 行
- **~200 行重构 + 250 行新增**
- **1 个 Rust 工程师 3-5 天**

### 验收
- [ ] `cargo build --bin hawkeye-cli` 通过
- [ ] 二进制 < 10MB
- [ ] `hawkeye-cli observe` 流式输出 NDJSON
- [ ] `hawkeye-cli agent "list windows"` 联通 cua-driver 并执行
- [ ] Tauri app 仍正常构建启动
- [ ] 单元测试全过（agent 模块 5 个 + 其他）

### 风险
- ⚠️ Swift 子进程（hawkeye-ocr/speech/ane）由 build.rs 编译路径硬编码 —— CLI bin 也要包路径常量。`HAWKEYE_OCR_PATH` 已是 `option_env!()` 模式（你 memory 里写的），CLI bin 会自动继承。✅ 不阻塞。
- ⚠️ llama-cpp-2 + Metal feature 是 macOS-only。Linux build 需要 `#[cfg(target_os = "macos")]` 守卫或 stub。Phase 2 只做 macOS。

---

## Phase 3：高级特性（按需）

### 3a. YAML/TOML 配置 schema（半天）
- 加 `serde_yaml` / `toml` deps
- `config::load_config()` 自动检测 `.json` / `.yaml` / `.toml` 后缀
- 写 `config.schema.json`（JSON Schema） 让 IDE 提供补全

### 3b. REST/gRPC server 模式（2 天）
- `hawkeye-cli serve --port 8080`
- axum router：`POST /v1/perceive`、`/v1/plan`、`/v1/execute`、`/v1/chat`、`/v1/agent`
- WebSocket `/v1/observe` 推送事件
- 直接复用 `EventSink` 的 broadcaster 实现

### 3c. systemd / launchd 服务（半天）
- macOS：`packages/desktop-tauri/scripts/com.hawkeye.cli.plist` + 安装脚本
- Linux：`hawkeye.service` unit
- `hawkeye-cli daemon --foreground` 给 launchd 调用

### 3d. Multi-platform CI 构建（1 天）
- `.github/workflows/cli-release.yml`
- macOS（arm64+x86_64）+ Linux（x86_64+arm64）矩阵
- 自动产生 release artifact

### 3e. Docker image（半天）
- `Dockerfile` for hawkeye-cli on Linux
- 注意：cua-driver 不能跑（macOS only），所以 Docker 镜像里 agent 模式要 disable

---

## 推荐执行顺序与并行度

```
Day 1   ───────────►  Phase 1（Node 工程师）
Day 2   ─►  Phase 1 验收 + 文档
Day 3-5 ───────────►  Phase 2 重构 + bin（Rust 工程师，可与 Phase 1 并行启动）
Day 6   ─►  Phase 2 验收
Day 7+  ───────────►  Phase 3 按需扩展
```

Phase 1 和 Phase 2 完全可以并行 —— Node CLI 不动 Rust，Rust 重构不动 core 包，互不干扰。

---

## 立即可做的 3 件事

1. **创建 `packages/cli/` 包**（Phase 1.1-1.4）：~4 小时
2. **写 EventSink trait + 改 ObserveLoop**（Phase 2.3）：~2 小时
3. **加 [[bin]] hawkeye-cli + clap dispatch**（Phase 2.6 骨架）：~2 小时

任意一个我都可以现在就开干。

---

## 关键决策点（需要你拍板）

| # | 决策 | 我的推荐 |
|---|---|---|
| A | 先做 Phase 1 还是 Phase 2 | **先 Phase 1** —— 1 天交付，验证 core 真的能脱壳 |
| B | Phase 2 的 CLI bin 名称 | `hawkeye-cli`（避免与 Node CLI `hawkeye` 撞名） |
| C | 配置文件格式 | **JSON 起步**（Rust 端已经是 json），Phase 3 加 YAML |
| D | hawkeye CLI 是否包含 cua-driver 集成 | **是**，作为 `agent` 子命令，复用 Phase 1 已建好的 Rust agent 模块 |
| E | Linux 支持范围 | Phase 1 全平台 / Phase 2 macOS only / Phase 3 加 Linux |
