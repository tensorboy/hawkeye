# Hawkeye Electron → Tauri 2.0 + Rust 迁移方案

## 一、当前架构全景

```
packages/
├── core/        (~95 TS 文件) 感知/推理/执行/记忆/安全/行为学习
│   ├── perception/  屏幕截图, OCR, 浏览器感知, UI解析
│   ├── reasoning/   Claude AI推理, 计划生成, 建议引擎
│   ├── execution/   MCP浏览器自动化, NutJS执行, Vision直接执行
│   ├── memory/      情景记忆, 语义记忆, 工作记忆, 程序记忆, RAG
│   ├── security/    命令检查, 文件守卫, 回滚, 注入检测
│   ├── grounding/   元素检测, UI定位, NMS
│   ├── behavior/    事件收集, 特征提取, 习惯学习, 模式识别
│   └── ...
└── desktop/     (~60 TS/TSX 文件) Electron桌面端
    ├── main/        18个服务 + 12个IPC handler文件
    ├── preload/     743行 IPC bridge (约85个API端点)
    └── renderer/    React 19 + Tailwind + DaisyUI + Zustand
```

### 关键数据流

```
[用户] → [React UI] → [preload IPC] → [Electron Main]
                                            ↓
                    [HawkeyeService] → [Core Engine]
                         ↓                    ↓
              [WhisperService]    [Perception → Reasoning → Execution]
              [SherpaOnnxService]
              [GazeOverlayService]
              [AudioProcessorService]
              [ModelManagerService]
              ...
```

---

## 二、IPC 接口完整清单 (需迁移为 Tauri Commands)

### invoke 类 (请求-响应, 共 ~65 个)

| 分类 | IPC 通道 | 说明 |
|------|----------|------|
| **核心 (7)** | observe, generate-plan, execute-plan, pause-execution, resume-execution, cancel-execution, intent-feedback | 感知-推理-执行主流程 |
| **状态 (5)** | get-intents, get-plan, get-status, get-available-providers, switch-ai-provider | 状态查询 |
| **配置 (2)** | get-config, save-config | 应用配置 |
| **AI对话 (1)** | chat | LLM对话 |
| **数据 (4)** | get-stats, cleanup, get-execution-history, get-last-context | 数据管理 |
| **智能观察 (5)** | start/stop/toggle/get-status smart-observe, get-screenshot | 屏幕监控 |
| **自适应刷新 (2)** | get-adaptive-refresh-status, record-user-activity | 刷新率控制 |
| **模型管理 (6)** | model-get-directory, model-list, model-download-hf, model-cancel-download, model-delete, model-get-recommended, model-exists | HuggingFace模型 |
| **Whisper (6)** | whisper-transcribe, whisper-status, whisper-check-mic, whisper-request-mic, whisper-reset-model, whisper-download-model, whisper-model-info | 语音识别 |
| **Sherpa-ONNX (9)** | sherpa:get-status, initialize, shutdown, download-model, get-models, start/stop-streaming, feed-audio | 流式ASR |
| **唤醒词 (4)** | sherpa:wake-word-start/stop/configure/status | 语音唤醒 |
| **TTS (5)** | sherpa:tts-speak/stop/skip/pause/resume/configure | 语音合成 |
| **说话人 (2)** | sherpa:register-speaker, identify-speaker | 声纹识别 |
| **调试 (8)** | debug-get-events/recent/since, debug-clear/pause/resume, debug-get-status, debug-export, debug-update-config | 调试时间线 |
| **生命树 (7)** | life-tree:get/rebuild/propose/start/conclude-experiment, get-unlocked-phase, get-experiments | 生命树 |
| **活动摘要 (9)** | activity-summary:get-recent/range/generate-now/get-pending/mark-updated/is-running/start/stop/get-config/update-config | 10分钟摘要 |
| **菜单栏 (3)** | menu-bar-panel:get-state/execute-action/clear-activities | 菜单栏面板 |
| **手势 (4)** | gesture-control, gesture-control:status/set-enabled/update-config | 手势控制 |
| **全局点击 (3)** | global-click:start/stop/status/cursor-position | WebGazer校准 |
| **注视覆盖 (1)** | gaze-overlay:toggle | 注视点覆盖 |
| **音频 (3)** | audio-processor:start/stop/status/process | AEC音频处理 |
| **更新 (2)** | check-for-updates, get-app-version | 自动更新 |
| **环境 (3)** | env-check, env-check-packages, env-install-packages | Python环境 |
| **旧版 (3)** | execute, getSuggestions, setApiKey | 兼容API |

### send 类 (单向推送, 共 ~1 个)
| IPC 通道 | 说明 |
|----------|------|
| gaze-overlay:update-gaze | 注视点数据推送 |
| renderer-error | 渲染进程错误上报 |

### 事件监听类 (后端→前端推送, 共 ~25 个)
| 事件 | 说明 |
|------|------|
| intents, plan, execution-progress, execution-completed | 核心流程事件 |
| hawkeye-ready, module-ready, ai-provider-ready/error | 状态事件 |
| show-settings, loading, error, suggestions | UI事件 |
| smart-observe-status/change-detected/interval-changed | 智能观察事件 |
| screenshot-preview | 截图预览 |
| model-download-progress | 模型下载进度 |
| whisper-segment, whisper-download-progress | Whisper事件 |
| sherpa-transcript, sherpa-speech-start/end, sherpa-download-progress | Sherpa ASR事件 |
| sherpa-wake-word-detected | 唤醒词事件 |
| sherpa-tts-done | TTS事件 |
| life-tree:updated | 生命树更新 |
| menu-bar-panel:state | 菜单栏状态 |
| audio-processor-status, audio-processed | 音频处理事件 |
| gesture-control:screenshot/toggle-recording/pause/quick-menu | 手势事件 |
| global-click:event | 全局点击事件 |
| overlay:gaze, overlay:cursor | 覆盖层事件 |
| update-available, update-progress, update-downloaded | 更新事件 |

---

## 三、分阶段迁移计划

### 阶段 0: 准备工作 (1 周)

**目标**: 搭建 Tauri 2.0 项目骨架，验证可行性

```
hawkeye/
├── packages/
│   ├── core/           (保留, TypeScript → 逐步 Rust 化)
│   ├── desktop/        (废弃, Electron 版本)
│   └── tauri-app/      (新建)
│       ├── src-tauri/       Rust 后端
│       │   ├── Cargo.toml
│       │   ├── tauri.conf.json
│       │   └── src/
│       │       ├── main.rs
│       │       ├── commands/      Tauri commands (对应 IPC handlers)
│       │       ├── services/      Rust 服务层
│       │       └── state.rs       AppState 管理
│       └── src/             前端 (从 desktop/renderer 复制)
│           ├── App.tsx
│           ├── components/
│           ├── hooks/
│           ├── pages/
│           └── stores/
```

**具体任务**:
1. `cargo install create-tauri-app` 初始化 Tauri 2.0 项目
2. 配置 `tauri.conf.json`:
   - 窗口: 380x480, 可调大小, 最小 320x400
   - 权限: camera, screen-capture, global-shortcut, tray
3. 复制 renderer 目录到 tauri-app/src
4. 删除 `window.hawkeye` 依赖, 改用 `@tauri-apps/api` 的 `invoke()` 和 `listen()`
5. 验证 React + Tailwind + DaisyUI 在 Tauri WebView 中正常运行

**验证标准**: 空壳 Tauri 应用能正常启动，React UI 渲染正确

---

### 阶段 1: 基础服务 Rust 化 (2-3 周)

**目标**: 迁移配置、数据库、托盘、全局快捷键等基础能力

#### 1.1 AppState 与配置服务

```rust
// src-tauri/src/state.rs
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub ai_provider: String,          // "llama-cpp" | "gemini" | "openai"
    pub llama_cpp_model_path: Option<String>,
    pub gemini_api_key: Option<String>,
    pub openai_api_key: Option<String>,
    pub openai_base_url: Option<String>,
    pub sync_port: u16,
    pub auto_update: bool,
    pub smart_observe: bool,
    pub smart_observe_interval: u32,
    pub whisper_enabled: bool,
    pub whisper_model_path: Option<String>,
    pub onboarding_completed: bool,
    // ...
}

pub struct AppState {
    pub config: Mutex<AppConfig>,
    pub db: Mutex<Option<rusqlite::Connection>>,
}
```

```rust
// src-tauri/src/commands/config.rs
#[tauri::command]
pub fn get_config(state: tauri::State<AppState>) -> Result<AppConfig, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    Ok(config.clone())
}

#[tauri::command]
pub fn save_config(state: tauri::State<AppState>, partial: serde_json::Value) -> Result<AppConfig, String> {
    let mut config = state.config.lock().map_err(|e| e.to_string())?;
    // merge partial into config...
    Ok(config.clone())
}
```

**迁移映射**:
| Electron | Tauri Rust |
|----------|-----------|
| ConfigService (config-service.ts) | `src-tauri/src/services/config.rs` |
| config-handlers.ts | `src-tauri/src/commands/config.rs` |
| get-config / save-config IPC | `#[tauri::command] get_config / save_config` |

#### 1.2 托盘与全局快捷键

```rust
// src-tauri/src/tray.rs
use tauri::{
    tray::{TrayIconBuilder, TrayIconEvent},
    menu::{Menu, MenuItem},
    Manager,
};

pub fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let menu = Menu::with_items(app, &[
        &MenuItem::with_id(app, "observe", "Observe (⌘⇧H)", true, None::<&str>)?,
        &MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?,
        &MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?,
    ])?;

    TrayIconBuilder::new()
        .menu(&menu)
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "observe" => { /* trigger observe */ }
                "settings" => { /* emit show-settings */ }
                "quit" => app.exit(0),
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}
```

**迁移映射**:
| Electron | Tauri Rust |
|----------|-----------|
| TrayStatusService (tray-status-service.ts) | `src-tauri/src/services/tray.rs` |
| globalShortcut.register() | `tauri::plugin::global-shortcut` |
| app.requestSingleInstanceLock() | Tauri 内置单实例 plugin |

#### 1.3 数据库迁移 (better-sqlite3 → rusqlite)

```rust
// src-tauri/src/services/database.rs
use rusqlite::{Connection, params};

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(path: &str) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        conn.execute_batch("
            PRAGMA journal_mode=WAL;
            PRAGMA synchronous=NORMAL;
        ")?;
        Ok(Self { conn })
    }

    pub fn get_execution_history(&self, limit: i64) -> Result<Vec<ExecutionHistoryItem>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT * FROM executions ORDER BY started_at DESC LIMIT ?1"
        )?;
        // ...
    }
}
```

**阶段 1 完成标准**:
- [x] Tauri 应用正常启动，React UI 完整渲染
- [x] 配置读写正常 (JSON 文件持久化)
- [x] 托盘图标+菜单正常，支持动态状态切换
- [x] 全局快捷键 Cmd+Shift+H 正常
- [x] SQLite 数据库读写正常
- [x] 自动更新 (tauri-plugin-updater) 正常

---

### 阶段 2: IPC 层迁移 (2-3 周)

**目标**: 将 743 行 preload + 12 个 handler 文件全部迁移为 Tauri commands

#### 2.1 前端适配层

创建一个兼容层，让前端代码最小改动:

```typescript
// src/lib/api.ts — 替代 window.hawkeye
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export const hawkeye = {
  // 核心 API
  observe: () => invoke('observe'),
  generatePlan: (intentId: string) => invoke('generate_plan', { intentId }),
  executePlan: (planId?: string) => invoke('execute_plan', { planId }),
  pauseExecution: (planId: string) => invoke('pause_execution', { planId }),
  resumeExecution: (planId: string) => invoke('resume_execution', { planId }),
  cancelExecution: (planId: string) => invoke('cancel_execution', { planId }),
  intentFeedback: (intentId: string, feedback: string) =>
    invoke('intent_feedback', { intentId, feedback }),

  // 状态 API
  getIntents: () => invoke('get_intents'),
  getPlan: () => invoke('get_plan'),
  getStatus: () => invoke('get_status'),
  getConfig: () => invoke('get_config'),
  saveConfig: (config: Partial<AppConfig>) => invoke('save_config', { config }),

  // AI 对话
  chat: (messages: ChatMessage[]) => invoke('chat', { messages }),

  // 事件监听 (Tauri events 替代 ipcRenderer.on)
  onIntents: (callback: (intents: UserIntent[]) => void) => {
    const unlisten = listen<UserIntent[]>('intents', (e) => callback(e.payload));
    return () => { unlisten.then(fn => fn()); };
  },
  onPlan: (callback: (plan: ExecutionPlan) => void) => {
    const unlisten = listen<ExecutionPlan>('plan', (e) => callback(e.payload));
    return () => { unlisten.then(fn => fn()); };
  },
  // ... 其余 25 个事件同理
};
```

#### 2.2 Rust Commands 结构

```
src-tauri/src/commands/
├── mod.rs              模块导出
├── core.rs             observe, generate_plan, execute_plan, ...  (7个)
├── config.rs           get_config, save_config                    (2个)
├── status.rs           get_intents, get_plan, get_status, ...     (5个)
├── chat.rs             chat                                        (1个)
├── data.rs             get_stats, cleanup, get_execution_history   (4个)
├── smart_observe.rs    start/stop/toggle_smart_observe, ...        (7个)
├── model.rs            model_list, model_download_hf, ...          (7个)
├── whisper.rs          whisper_transcribe, whisper_status, ...     (7个)
├── sherpa.rs           sherpa commands                             (20个)
├── debug.rs            debug timeline commands                     (8个)
├── life_tree.rs        life tree commands                          (7个)
├── activity.rs         activity summary commands                   (9个)
├── menu_bar.rs         menu bar panel commands                     (3个)
├── gesture.rs          gesture control commands                    (4个)
├── global_click.rs     global click commands                       (4个)
├── gaze_overlay.rs     gaze overlay commands                       (2个)
├── audio.rs            audio processor commands                    (4个)
└── update.rs           check_for_updates, get_app_version          (2个)
```

#### 2.3 事件推送 (Electron webContents.send → Tauri app.emit)

```rust
// Electron:  mainWindow.webContents.send('intents', intents);
// Tauri:     app.emit("intents", &intents).unwrap();

use tauri::Emitter;

fn emit_intents(app: &tauri::AppHandle, intents: &[UserIntent]) {
    app.emit("intents", intents).unwrap();
}
```

**阶段 2 完成标准**:
- [x] 所有 65+ invoke API 迁移完成
- [x] 所有 25+ 事件推送迁移完成
- [x] 前端通过 api.ts 适配层调用，App.tsx 改动 < 20 行
- [x] 完整 E2E 功能测试通过

---

### 阶段 3: AI 推理管道 Rust 化 (3-4 周)

**目标**: LLM 推理和语音管道从 Node.js 迁移到 Rust

#### 3.1 本地 LLM (node-llama-cpp → llama-cpp-rs)

```toml
# Cargo.toml
[dependencies]
llama-cpp-2 = "0.1"  # llama.cpp Rust 绑定
```

```rust
// src-tauri/src/services/llm.rs
use llama_cpp_2::model::LlamaModel;
use llama_cpp_2::context::LlamaContext;

pub struct LocalLlmService {
    model: Option<LlamaModel>,
    ctx: Option<LlamaContext>,
}

impl LocalLlmService {
    pub async fn load_model(&mut self, path: &str, gpu_layers: i32) -> Result<(), String> {
        let params = LlamaModelParams::default()
            .with_n_gpu_layers(gpu_layers);
        self.model = Some(LlamaModel::load_from_file(path, params)?);
        Ok(())
    }

    pub async fn chat(&self, messages: &[ChatMessage]) -> Result<String, String> {
        // 构建 prompt, 推理, 返回结果
    }
}
```

**性能收益**:
- 消除 NAPI bridge 开销 (~2-5ms/call)
- Rust 直接管理 GGUF 模型内存映射
- GPU 层控制更精确 (Metal/CUDA)

#### 3.2 语音识别 (smart-whisper → whisper-rs)

```toml
[dependencies]
whisper-rs = "0.11"  # whisper.cpp Rust 绑定
```

```rust
// src-tauri/src/services/whisper.rs
use whisper_rs::{WhisperContext, WhisperContextParameters, FullParams, SamplingStrategy};

pub struct WhisperService {
    ctx: Option<WhisperContext>,
    language: String,
}

impl WhisperService {
    pub fn initialize(&mut self, model_path: &str) -> Result<(), String> {
        let params = WhisperContextParameters::default();
        self.ctx = Some(WhisperContext::new_with_params(model_path, params)?);
        Ok(())
    }

    pub fn transcribe(&self, audio_data: &[f32]) -> Result<String, String> {
        let ctx = self.ctx.as_ref().ok_or("Not initialized")?;
        let mut state = ctx.create_state()?;
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some(&self.language));
        state.full(params, audio_data)?;

        let mut text = String::new();
        for i in 0..state.full_n_segments()? {
            text.push_str(&state.full_get_segment_text(i)?);
        }
        Ok(text)
    }
}
```

#### 3.3 音频处理管道 (零拷贝 Rust 实现)

```rust
// src-tauri/src/services/audio_pipeline.rs
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::Arc;
use tokio::sync::broadcast;

pub struct AudioPipeline {
    tx: broadcast::Sender<Vec<f32>>,
}

impl AudioPipeline {
    pub fn start(&self) -> Result<(), String> {
        let host = cpal::default_host();
        let device = host.default_input_device().ok_or("No input device")?;
        let config = device.default_input_config()?;

        let tx = self.tx.clone();
        let stream = device.build_input_stream(
            &config.into(),
            move |data: &[f32], _| {
                let _ = tx.send(data.to_vec());
            },
            |err| eprintln!("Audio error: {}", err),
            None,
        )?;
        stream.play()?;
        Ok(())
    }
}
```

**性能收益**:
- 音频数据从捕获到 Whisper 推理全程 Rust, 零 JS 序列化
- 用 `broadcast` channel 分发给 Whisper + Sherpa + WakeWord, 无拷贝

---

### 阶段 4: 系统集成能力 Rust 化 (2-3 周)

**目标**: 全局钩子、屏幕截图、手势控制等系统级能力

#### 4.1 全局键鼠钩子 (uiohook-napi → rdev)

```toml
[dependencies]
rdev = "0.5"
```

```rust
// src-tauri/src/services/global_input.rs
use rdev::{listen, Event, EventType};

pub fn start_global_listener(tx: tokio::sync::mpsc::Sender<ClickEvent>) {
    std::thread::spawn(move || {
        listen(move |event: Event| {
            if let EventType::ButtonPress(button) = event.event_type {
                let _ = tx.blocking_send(ClickEvent {
                    x: event.x as f64,
                    y: event.y as f64,
                    button: button as u32,
                    timestamp: event.time.duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default().as_millis() as u64,
                });
            }
        }).unwrap();
    });
}
```

#### 4.2 屏幕截图 (Electron desktopCapturer → xcap)

```toml
[dependencies]
xcap = "0.0.13"
```

```rust
// src-tauri/src/services/screen_capture.rs
use xcap::Monitor;

pub fn capture_primary_screen() -> Result<Vec<u8>, String> {
    let monitor = Monitor::all()?.into_iter()
        .find(|m| m.is_primary())
        .ok_or("No primary monitor")?;
    let image = monitor.capture_image()?;
    let mut buf = Vec::new();
    image.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Png)?;
    Ok(buf)
}
```

#### 4.3 鼠标键盘自动化 (robotjs → enigo)

```toml
[dependencies]
enigo = "0.2"
```

```rust
use enigo::{Enigo, Mouse, Keyboard, Settings, Coordinate};

pub fn click_at(x: i32, y: i32) {
    let mut enigo = Enigo::new(&Settings::default()).unwrap();
    enigo.move_mouse(x, y, Coordinate::Abs).unwrap();
    enigo.button(enigo::Button::Left, enigo::Direction::Click).unwrap();
}
```

---

### 阶段 5: 注视追踪迁移策略 (2-4 周)

WebGazer.js 是最复杂的迁移点。推荐 **两阶段方案**:

#### 5.1 短期: WebView 内保留 (推荐)

WebGazer 依赖 browser DOM (Canvas, getUserMedia, MediaPipe WASM)。
Tauri WebView 完全支持这些 API，所以:

```
[Tauri WebView]
  ├── React UI
  ├── WebGazer.js (保留, 在 WebView 中运行)
  │   └── useWebGazer.ts (保留, 小改: IPC 方式变更)
  └── 通过 invoke() 将 gaze 数据发送给 Rust 后端
```

改动量:
- `useWebGazer.ts` 基本不变
- `WebGazerGaze/index.tsx` 将 `ipcRenderer.send('gaze-overlay:update-gaze', ...)` 改为 `invoke('update_gaze', ...)`

#### 5.2 长期: Rust 原生眼动追踪 (可选, 6个月+)

```toml
[dependencies]
opencv = "0.93"         # OpenCV Rust 绑定
mediapipe = "..."       # MediaPipe C++ FFI (需自建绑定)
ndarray = "0.16"        # 矩阵运算
```

```rust
// 原生 Rust 眼动管道
CameraCapture (nokhwa crate)
    → FaceMesh (MediaPipe C++ FFI)
    → EyeFeatureExtraction
    → RidgeRegression (nalgebra)
    → GazePoint
```

**建议**: 阶段 5.1 足够用，5.2 只在需要脱离 WebView 时考虑。

---

### 阶段 6: Gaze Overlay 迁移 (1 周)

#### 当前实现
- 独立 BrowserWindow (透明, 鼠标穿透, 置顶)
- 内联 HTML+CSS+JS 渲染注视点和鼠标

#### Tauri 迁移方案

```rust
// src-tauri/src/services/gaze_overlay.rs
use tauri::WebviewWindowBuilder;

pub fn create_overlay(app: &tauri::AppHandle) -> Result<(), String> {
    let monitor = app.primary_monitor()?.ok_or("No primary monitor")?;
    let size = monitor.size();

    WebviewWindowBuilder::new(app, "gaze-overlay", tauri::WebviewUrl::App("gaze-overlay.html".into()))
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .resizable(false)
        .position(0.0, 0.0)
        .inner_size(size.width as f64, size.height as f64)
        .build()?;

    // macOS: 设置鼠标穿透
    #[cfg(target_os = "macos")]
    {
        let overlay = app.get_webview_window("gaze-overlay").unwrap();
        overlay.set_ignore_cursor_events(true)?;
    }

    Ok(())
}
```

---

## 四、Cargo.toml 依赖清单

```toml
[dependencies]
# Tauri 核心
tauri = { version = "2", features = ["tray-icon", "global-shortcut"] }
tauri-plugin-updater = "2"
tauri-plugin-dialog = "2"
tauri-plugin-shell = "2"
tauri-plugin-notification = "2"

# 序列化
serde = { version = "1", features = ["derive"] }
serde_json = "1"
toml = "0.8"

# 数据库
rusqlite = { version = "0.32", features = ["bundled"] }

# AI/ML
llama-cpp-2 = "0.1"          # 本地 LLM
whisper-rs = "0.11"           # 语音识别
ort = "2"                     # ONNX Runtime (Sherpa 替代)

# 音频
cpal = "0.15"                 # 跨平台音频捕获
hound = "3.5"                 # WAV 编解码

# 系统集成
rdev = "0.5"                  # 全局键鼠钩子
enigo = "0.2"                 # 鼠标键盘自动化
xcap = "0.0.13"               # 屏幕截图
notify = "7"                  # 文件系统监听

# 异步/并发
tokio = { version = "1", features = ["full"] }
tokio-stream = "0.1"

# HTTP
reqwest = { version = "0.12", features = ["json", "stream"] }

# 日志
tracing = "0.1"
tracing-subscriber = "0.3"
```

---

## 五、迁移优先级矩阵

| 模块 | 影响面 | 难度 | 优先级 | 阶段 |
|------|--------|------|--------|------|
| 项目骨架 + React 复制 | 全局 | 低 | P0 | 0 |
| 配置服务 | 全局 | 低 | P0 | 1 |
| 数据库 (rusqlite) | 全局 | 低 | P0 | 1 |
| 托盘 + 快捷键 | 全局 | 低 | P0 | 1 |
| IPC 适配层 (api.ts) | 全局 | 中 | P0 | 2 |
| 核心 commands (7) | 核心流程 | 中 | P1 | 2 |
| 状态/配置 commands (7) | 基础功能 | 低 | P1 | 2 |
| 事件推送 (25) | 实时通信 | 中 | P1 | 2 |
| LLM 服务 (llama-cpp-rs) | AI 推理 | 中 | P1 | 3 |
| Whisper 服务 (whisper-rs) | 语音 | 中 | P1 | 3 |
| 屏幕截图 (xcap) | 感知 | 低 | P1 | 4 |
| 全局钩子 (rdev) | 输入 | 中 | P1 | 4 |
| 自动化 (enigo) | 执行 | 低 | P2 | 4 |
| WebGazer (保留 WebView) | 眼动 | 低 | P2 | 5 |
| Gaze Overlay | 可视化 | 低 | P2 | 6 |
| Sherpa-ONNX (ort) | 语音 | 高 | P2 | 3 |
| 活动摘要 | 辅助 | 低 | P3 | 2 |
| 生命树 | 辅助 | 低 | P3 | 2 |
| 调试时间线 | 调试 | 低 | P3 | 2 |
| 手势控制 | 扩展 | 中 | P3 | 4 |

---

## 六、预期收益量化

| 指标 | Electron 当前 | Tauri Rust 预期 | 改善 |
|------|-------------|----------------|------|
| 安装包体积 | ~180 MB | ~12 MB | **15x 减小** |
| 冷启动时间 | ~3-5 秒 | ~0.5-1 秒 | **4x 加速** |
| 空闲内存 | ~120 MB | ~25 MB | **5x 减小** |
| LLM 推理延迟 | NAPI bridge ~3ms | 直接 FFI ~0ms | **消除桥接** |
| 音频管道延迟 | JS 序列化 ~5ms | 零拷贝 ~0ms | **消除序列化** |
| 安全风险 | nodeIntegration=true | 最小权限模型 | **消除高危配置** |

---

## 七、风险与缓解

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|---------|
| Tauri WebView 兼容性 (WebGazer/MediaPipe WASM) | 中 | 高 | 阶段 0 立即验证 |
| whisper-rs 编译问题 (需要 CMake/Clang) | 中 | 中 | CI 预编译, 提供 fallback |
| macOS 权限 (屏幕录制/辅助功能) | 低 | 高 | Tauri plugin 处理, 与 Electron 逻辑相同 |
| 前端组件不兼容 WebView | 低 | 中 | framer-motion 等库 WebView 兼容好 |
| Rust 学习曲线 | 确定 | 中 | 先迁移简单服务, 积累经验 |
| Sherpa-ONNX 迁移复杂度 | 高 | 中 | 初期可用 Whisper-rs 替代, Sherpa 延后 |

---

## 八、可选: packages/core 的 Rust 化路线

packages/core 有 ~95 个 TS 文件。长期可逐步迁移为 Rust crate:

```
hawkeye-core/
├── perception/     xcap + tesseract FFI
├── reasoning/      reqwest (API) + llama-cpp-rs (local)
├── execution/      enigo + MCP client (Rust)
├── memory/         rusqlite + FTS5 + 内存向量搜索
├── security/       Rust 天然内存安全
├── grounding/      OpenCV Rust bindings
└── behavior/       ndarray + 统计分析
```

但这属于长期目标 (3-6 个月)，不建议在第一轮迁移中做。

---

## 九、时间线总览

```
Week  1      : 阶段 0 - 项目骨架 + 可行性验证
Week  2-4    : 阶段 1 - 基础服务 (配置/DB/托盘/快捷键)
Week  5-7    : 阶段 2 - IPC 全量迁移 (65 commands + 25 events)
Week  8-11   : 阶段 3 - AI 管道 (LLM + Whisper + 音频)
Week  12-14  : 阶段 4 - 系统集成 (钩子/截图/自动化)
Week  15-16  : 阶段 5 - 眼动追踪适配
Week  16     : 阶段 6 - Gaze Overlay
Week  17-18  : 集成测试 + 性能调优 + 发布
```

**总计: 约 4-5 个月** (一人全职), 可并行开发缩短至 3 个月。

---

## 十、立即可执行的第一步

```bash
# 1. 安装 Tauri CLI
cargo install create-tauri-app

# 2. 在 hawkeye 目录下创建 Tauri 项目
cd packages && create-tauri-app tauri-app --template react-ts

# 3. 复制 renderer 代码
cp -r desktop/src/renderer/* tauri-app/src/

# 4. 安装前端依赖
cd tauri-app && pnpm install

# 5. 验证启动
pnpm tauri dev
```

验证通过后, 按阶段 1 → 6 顺序推进。
