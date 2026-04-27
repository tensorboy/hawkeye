# Hawkeye Headless Operations Guide

Hawkeye runs in three modes:

| Mode | Binary | Use case |
|---|---|---|
| **Desktop** | `hawkeye-desktop` (Tauri) | Full UI: chat panel, life tree, gaze overlay, observe HUD |
| **Node CLI** | `hawkeye` (npm package `@hawkeye/cli`) | Cross-platform scripting; one-shot perceive / plan / execute via `@hawkeye/core` |
| **Rust CLI** | `hawkeye-cli` (single static binary) | Single-binary deployment; reuses the Tauri Rust backend without any webview |

The Desktop and Rust modes share the same Rust backend (`packages/desktop-tauri/src-tauri/`); the Node CLI wraps `@hawkeye/core` directly.

This document covers the two headless modes (Node + Rust). For the Tauri desktop UI plus its agent (cua-driver) integration, see [`packages/desktop-tauri/AGENT_INTEGRATION.md`](packages/desktop-tauri/AGENT_INTEGRATION.md).

---

## Table of contents

- [Quick start](#quick-start)
- [Architecture](#architecture)
- [Node CLI (`hawkeye`)](#node-cli-hawkeye)
- [Rust CLI (`hawkeye-cli`)](#rust-cli-hawkeye-cli)
- [Configuration](#configuration)
- [Choosing between Node and Rust](#choosing-between-node-and-rust)
- [cua-driver agent mode](#cua-driver-agent-mode)
- [Phase 3 roadmap](#phase-3-roadmap)
- [File-level reference](#file-level-reference)

---

## Quick start

### Node CLI

```bash
cd packages/cli
pnpm install && pnpm build

# Optional: link globally so `hawkeye` is on $PATH
ln -s "$(pwd)/dist/main.js" /usr/local/bin/hawkeye

hawkeye init                          # writes ~/.config/hawkeye/cli.json
export GEMINI_API_KEY=…
hawkeye chat "what model are you?"    # one-turn chat
hawkeye perceive --json | jq          # screenshot + OCR + intent
hawkeye run "open Safari"             # end-to-end perceive→plan→execute
hawkeye daemon                        # NDJSON event stream
```

### Rust CLI

```bash
cd packages/desktop-tauri/src-tauri
cargo build --release --bin hawkeye-cli

# Single-binary deployment
cp target/release/hawkeye-cli /usr/local/bin/

hawkeye-cli config              # print effective AppConfig
hawkeye-cli chat "hello"        # one-turn chat
hawkeye-cli observe             # NDJSON event stream
hawkeye-cli agent-status        # cua-driver health probe
hawkeye-cli agent "list windows"  # tool-using turn (needs cua-driver)
```

---

## Architecture

```
                       ┌─────────────────────┐
                       │  @hawkeye/core      │  pure Node lib (zero UI deps)
                       │  - perception       │
                       │  - reasoning        │
                       │  - execution        │
                       │  - storage / memory │
                       └──────────▲──────────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            │                     │                     │
   ┌────────┴───────┐    ┌────────┴────────┐    ┌──────┴───────┐
   │ @hawkeye/cli   │    │ Electron (old)  │    │ desktop-tauri │
   │ (Node CLI)     │    │  packages/      │    │ Rust backend  │
   │                │    │  desktop/       │    │ + React UI    │
   └────────────────┘    └─────────────────┘    └───┬───────┬───┘
                                                    │       │
                                              ┌─────┴──┐ ┌──┴────────┐
                                              │ Tauri  │ │ hawkeye-  │
                                              │ webview│ │ cli       │
                                              └────────┘ │ (Rust)    │
                                                         └───────────┘
                                          ┌────────────────────┐
                                          │  cua-driver daemon │
                                          │  (Swift, macOS)    │
                                          └────────────────────┘
```

### EventSink decoupling

The Tauri Rust backend was decoupled from `tauri::AppHandle` so the same observe / agent code paths run from CLI:

```rust
// packages/desktop-tauri/src-tauri/src/event_sink.rs
pub trait EventSink: Send + Sync {
    fn emit(&self, event: &str, payload: Value);
}
pub struct TauriSink { handle: AppHandle }   // GUI: forwards to webview
pub struct StdoutSink;                        // CLI: NDJSON to stdout
pub struct NoopSink;                          // tests: drops events
pub type SharedSink = Arc<dyn EventSink>;
```

`ObserveLoop::start` and `agent::run_user_turn` both take `Arc<dyn EventSink>` — the GUI plugs in a `TauriSink` during Tauri setup, the CLI plugs in a `StdoutSink`. Tests can use `NoopSink`.

---

## Node CLI (`hawkeye`)

**Source**: [`packages/cli/`](packages/cli/) — TypeScript package `@hawkeye/cli` v0.1.0, ESM-only, ~17 KB compiled output.

### Commands

| Command | Description |
|---|---|
| `hawkeye init [--force]` | Write a starter `~/.config/hawkeye/cli.json`, create `~/.hawkeye/` data dir |
| `hawkeye perceive [--json]` | One-shot screenshot + OCR + intent recognition; emits `UserIntent[]` |
| `hawkeye plan <intentFile>` | Generate `ExecutionPlan` from a stored intent (use `-` for stdin) |
| `hawkeye execute <planFile>` | Execute a plan, streaming step results |
| `hawkeye run "<task>"` | End-to-end: perceive → top intent → plan → execute |
| `hawkeye chat "<message>"` | One-turn AI chat (no perception, no tools) |
| `hawkeye daemon [--interval=3000]` | Long-running observe loop, NDJSON events to stdout |

Global flag `--json` switches to NDJSON output for any command.

### Build

```bash
cd packages/cli
pnpm install     # resolves @hawkeye/core via workspace link
pnpm build       # tsup → dist/main.js (shebang'd, exec)
pnpm typecheck
```

**Bundle**: 17 KB ESM file (`dist/main.js`), `@hawkeye/core` and its native deps (`better-sqlite3`, `screenshot-desktop`) externalized — resolved at runtime from `node_modules`.

### Disabled-by-default modules

`buildHawkeyeConfig()` in [`packages/cli/src/config.ts`](packages/cli/src/config.ts) turns off behavior tracking, memory, dashboard, workflow, plugins, autonomous, and the task queue. The CLI is one-shot; these modules add startup cost and pull native deps. The `daemon` subcommand can opt in via env vars (Phase 3 work).

### Daemon polling caveat

`@hawkeye/core` does not currently expose a single `observation` event. The `daemon` subcommand falls back to polling `perceiveAndRecognize` on the configured interval, while also subscribing to 11 real `Hawkeye` events (`ready`, `perceiving`, `intents:detected`, `plan:generated`, `execution:step:*`, etc.). All emitted as NDJSON to stdout.

---

## Rust CLI (`hawkeye-cli`)

**Source**: [`packages/desktop-tauri/src-tauri/src/bin/cli.rs`](packages/desktop-tauri/src-tauri/src-tauri/src/bin/cli.rs) — clap-based, 173 LOC, reuses `hawkeye_lib` crate.

### Commands

| Command | Description |
|---|---|
| `hawkeye-cli config` | Pretty-print the effective `AppConfig` (after env + file resolution) |
| `hawkeye-cli observe [--interval-ms=3000] [--change-threshold=0.05]` | Run the observe loop, NDJSON events to stdout, Ctrl+C to stop |
| `hawkeye-cli chat <text>` | One-turn AI chat using the configured provider (Gemini default) |
| `hawkeye-cli agent <text>` | Tool-using agent turn (requires cua-driver running) |
| `hawkeye-cli agent-status` | Probe cua-driver socket connectivity, print JSON status |

### Build

```bash
cd packages/desktop-tauri/src-tauri

# Debug build (~80 MB)
cargo build --bin hawkeye-cli

# Release build (~7-10 MB with LTO + opt-level="s" + strip)
cargo build --release --bin hawkeye-cli
```

The Tauri desktop binary still builds normally:

```bash
cargo build --bin hawkeye-desktop      # original, unchanged
```

`Cargo.toml` declares both:

```toml
[[bin]]
name = "hawkeye-desktop"
path = "src/main.rs"

[[bin]]
name = "hawkeye-cli"
path = "src/bin/cli.rs"
```

### Provider support

| Provider | Status |
|---|---|
| Gemini | ✅ full (chat + tools / function-calling) |
| OpenAI | ✅ chat only (tool calling: not yet implemented) |
| Local llama-cpp | ❌ rejected at startup — requires Tauri-only `init_ai` lifecycle. Will be wired up later. |

---

## Configuration

### Node CLI: `~/.config/hawkeye/cli.json`

```jsonc
{
  "ai": {
    "provider": "gemini",
    "apiKey": "…",                 // OR set GEMINI_API_KEY env var
    "model": "gemini-2.5-flash",
    "baseUrl": "https://generativelanguage.googleapis.com/v1beta"
  },
  "perception": { "enableScreen": true, "enableOCR": true },
  "storage": { "dataDir": "~/.hawkeye" },
  "observe": { "intervalMs": 3000, "changeThreshold": 0.05 }
}
```

### Rust CLI: `~/.config/hawkeye/config.json`

The Rust backend was already file-driven via `dirs::config_dir().join("hawkeye/config.json")` — that path is reused untouched.

### Resolution order (Node CLI)

1. CLI args (`--json`, etc.)
2. Env vars: `HAWKEYE_CONFIG` (path override), `HAWKEYE_DATA_DIR`, `GEMINI_API_KEY` / `GOOGLE_API_KEY`, `OPENAI_API_KEY`
3. JSON file at `$HAWKEYE_CONFIG` (or default path)
4. Built-in defaults

### Custom binary location for cua-driver

Override `CUA_DRIVER_BIN`:

```bash
export CUA_DRIVER_BIN="$HOME/Applications/CuaDriver.app/Contents/MacOS/cua-driver"
```

Search order: `$CUA_DRIVER_BIN` → `/usr/local/bin/cua-driver` → `/Applications/CuaDriver.app/Contents/MacOS/cua-driver`.

---

## Choosing between Node and Rust

| Concern | Node (`hawkeye`) | Rust (`hawkeye-cli`) |
|---|---|---|
| **Setup** | requires Node 20+, pnpm, `@hawkeye/core` workspace deps | single static binary |
| **Bundle size** | 17 KB CLI + ~150 MB `node_modules` (shared with workspace) | ~7-10 MB release |
| **Cross-platform** | macOS / Linux / Windows | macOS only currently (cua-driver, Swift OCR/Speech, Metal llama.cpp) |
| **Coverage** | full `@hawkeye/core` (memory, life-tree, knowledge graph, browser-agent, MCP) | observe + chat + agent (cua-driver) only |
| **Use cases** | scripts, CI, Docker, dev workflows | distributable single binary, embedded in other macOS tools |
| **Startup** | ~500 ms (Node bootstrap + better-sqlite3 native init) | ~50 ms |
| **Fits remote dev** | ✅ works fine via SSH (no display needed) | ✅ same |

Rule of thumb: **Node CLI for breadth, Rust CLI for distribution.** Most users on macOS dev machines prefer Node — it covers all of `@hawkeye/core`. Rust CLI shines when you want one binary you can `scp` to another box.

---

## cua-driver agent mode

When `agent` mode is enabled, Hawkeye gains "hands" via [trycua/cua's `cua-driver`](https://github.com/trycua/cua) — a Swift daemon that drives macOS apps **in the background without stealing focus**.

### Install

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh)"
```

This downloads a signed/notarized release tarball, installs `CuaDriver.app` to `/Applications/` and symlinks `/usr/local/bin/cua-driver`. macOS will prompt for **Accessibility** and **Screen Recording** permissions on first launch.

### Verify

```bash
cua-driver --version
cua-driver serve &                                    # starts daemon
ls ~/Library/Caches/cua-driver/cua-driver.sock        # should exist

# From either CLI:
hawkeye-cli agent-status      # JSON status: binaryInstalled, daemonRunning, socketPath
```

### 8 curated tools

The model sees these via Gemini function-calling. Defined in [`packages/desktop-tauri/src-tauri/src/agent/tools.rs`](packages/desktop-tauri/src-tauri/src/agent/tools.rs):

| Tool | Purpose |
|---|---|
| `screenshot` | Capture PNG of full screen or a specific window |
| `list_windows` | Enumerate visible windows with pid/title/bounds |
| `get_window_state` | AX tree + PNG snapshot of a window |
| `click` | AX-element OR pixel-coord click without focus theft |
| `type_text` | Type into a focused field without raising the window |
| `press_key` | Hotkey combo (`cmd+s`, `return`, `escape`) |
| `scroll` | Scroll within a window |
| `launch_app` | Open a macOS app by bundle id or path |

The model can chain these — e.g., `screenshot → click(x,y) → type_text → screenshot` — for up to **`MAX_TOOL_ROUNDS = 8`** rounds per user turn. Anything beyond hard-stops with an error.

### Security

- **Allow-list**: only the 8 tools above are accepted; anything else returns `{ok: false, error: "not in allow-list"}` to the model so it can recover, without ever reaching the daemon.
- **Socket permissions**: cua-driver creates the Unix socket with mode `0o600` — only the owning user can speak to it.
- **No daemon auth**: filesystem permissions are the only gate. Accessibility/Screen Recording grants live at the OS level on the cua-driver app bundle.
- **Round cap**: `MAX_TOOL_ROUNDS = 8`. Exceeding raises a hard error.
- **Failures degrade gracefully**: tool errors become `{ok:false, error:…}` payloads fed back to the model, not exceptions to the user.

For the full design — Swift SkyLight SPIs, focus-without-raise, AX-vs-pixel addressing — see [`packages/desktop-tauri/AGENT_INTEGRATION.md`](packages/desktop-tauri/AGENT_INTEGRATION.md).

---

## Phase 3 roadmap

The following are documented in [`HEADLESS_PLAN.md`](HEADLESS_PLAN.md) and not yet built:

- **3a. YAML / TOML config schema** — let Rust + Node share a single config format with IDE auto-complete via JSON Schema
- **3b. REST / gRPC server mode** — `hawkeye-cli serve --port 8080` with axum, exposing `POST /v1/{perceive,plan,execute,chat,agent}` + WebSocket `/v1/observe` for event streaming
- **3c. systemd / launchd service** — daemon mode runnable as a managed service on macOS / Linux
- **3d. Multi-platform CI builds** — release matrix for macOS arm64+x86_64, Linux x86_64+arm64
- **3e. Docker image** — `hawkeye-cli` on Linux (no agent mode — cua-driver is macOS-only)
- **OpenAI / local-llama tool calling** — extend `chat_with_tools` for non-Gemini providers

---

## File-level reference

### Node CLI (`packages/cli/`)

| Path | Purpose |
|---|---|
| `package.json` | `@hawkeye/cli@0.1.0`, `bin: hawkeye`, workspace dep on `@hawkeye/core` |
| `tsup.config.ts` | ESM bundle, `node20` target, shebang banner |
| `src/main.ts` | Commander entrypoint + global `--json` flag |
| `src/config.ts` | 4-layer config merge (defaults → file → env → overrides), `CliConfig`/`HawkeyeConfig` translation |
| `src/output.ts` | `pretty` (ANSI, TTY-aware) and `json` (NDJSON) modes |
| `src/commands/{init,perceive,plan,execute,run,chat,daemon}.ts` | One file per subcommand |
| `README.md` | One-page usage doc |

### Rust CLI + EventSink decoupling (`packages/desktop-tauri/src-tauri/`)

| Path | Status | Purpose |
|---|---|---|
| `src/event_sink.rs` | NEW | `EventSink` trait + `TauriSink` / `StdoutSink` / `NoopSink` impls |
| `src/bin/cli.rs` | NEW | clap-based CLI: `config` / `observe` / `chat` / `agent` / `agent-status` |
| `Cargo.toml` | MOD | Two `[[bin]]` entries; new `clap = "4"` dep |
| `src/lib.rs` | MOD | `pub mod` everywhere; setup installs `TauriSink` into `AppState.event_sink` |
| `src/state.rs` | MOD | Added `event_sink: RwLock<Option<SharedSink>>` |
| `src/agent/runner.rs` | MOD | `run_user_turn(sink: Arc<dyn EventSink>, …)` instead of `AppHandle` |
| `src/observe/loop_runner.rs` | MOD | `ObserveLoop::start(sink: Arc<dyn EventSink>, …)` |
| `src/perception/mod.rs` | MOD | Dropped unused `_app: &AppHandle` parameter |
| `src/commands/{observe_cmd,agent_cmd}.rs` | MOD | Resolve sink from state, fall back to ad-hoc `TauriSink::new(app)` |

### Agent / cua-driver integration (`packages/desktop-tauri/src-tauri/src/agent/`)

| Path | Status | Purpose |
|---|---|---|
| `agent/protocol.rs` | NEW | Wire types for cua-driver line-delimited JSON protocol |
| `agent/cua_driver.rs` | NEW | Async Unix-socket client + `DaemonSupervisor` (binary discovery, spawn) |
| `agent/tools.rs` | NEW | Curated 8-tool catalog → Gemini `FunctionDeclaration`s |
| `agent/runner.rs` | NEW | Tool-use loop, `MAX_TOOL_ROUNDS = 8`, emits `agent:tool-call-{start,end}` |
| `agent/mod.rs` | NEW | Module exports |
| `commands/agent_cmd.rs` | NEW | Tauri commands: `get_agent_status`, `start_agent`, `chat_with_agent`, `invoke_cua_tool` |
| `ai/types.rs` | MOD | `FunctionDeclaration`, `FunctionCall`, `FunctionResult`, `ToolMessage`, `ToolTurn` + Gemini wire types |
| `ai/provider.rs` | MOD | `chat_with_tools()` default-impl (unsupported), `supports_tools()` |
| `ai/gemini.rs` | MOD | Full `chat_with_tools` impl + `tool_config` + `function_call`/`function_response` translation |

### Frontend (`packages/desktop-tauri/src/`)

| Path | Status | Purpose |
|---|---|---|
| `hooks/useAgent.ts` | NEW | React hook: live tool-call stream from `agent:tool-call-*` events |
| `hooks/useTauri.ts` | MOD | Types + invoke wrappers: `AgentStatus`, `AgentTurnResult`, `ToolCallRecord`, `getAgentStatus`, `startAgent`, `chatWithAgent`, `invokeCuaTool` |
| `components/ChatPanel.tsx` | MOD | Agent-mode toggle, tool-call audit trail, live-stream UI |

---

## Verification log

```text
$ cd packages/cli && pnpm build && node dist/main.js --version
0.1.0
$ node dist/main.js init
Wrote ~/.config/hawkeye/cli.json
Created data dir at ~/.hawkeye

$ cd packages/desktop-tauri/src-tauri && cargo test --lib agent::
test result: ok. 5 passed; 0 failed; 0 ignored
$ cargo build --bin hawkeye-cli
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 7.83s
$ cargo build --bin hawkeye-desktop
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 8.13s
$ ./target/debug/hawkeye-cli agent-status
{
  "binaryInstalled": false,
  "binaryPath": null,
  "daemonRunning": false,
  "socketPath": "/Users/.../Library/Caches/cua-driver/cua-driver.sock"
}
```
