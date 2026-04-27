# Agent (cua-driver) Integration

This document describes the **computer-use agent** layer added to Hawkeye's
Tauri build: how it's wired, how to install the dependency binary, how to
test it end-to-end, and what the security model looks like.

## What got built

Hawkeye's Tauri app now has a **"hand"** to match its existing **"eye"**
(WebGazer) and **"brain"** (Gemini chat). When the user enables Agent mode
in the chat panel, Gemini receives a tool catalog and can:

- **screenshot** the desktop
- **list_windows** / **get_window_state** to see what's running
- **click** / **type_text** / **press_key** / **scroll** to act
- **launch_app** to open something

All actions go through [trycua/cua's `cua-driver`](https://github.com/trycua/cua)
— a Swift daemon that drives native macOS apps **in the background without
stealing focus or moving the cursor** by using private SkyLight SPIs and
focus-without-raise tricks. We talk to it over a Unix socket using the line-
delimited JSON protocol it already exposes for its CLI.

## Architecture

```
┌─────────────────┐    invoke    ┌─────────────────────┐
│ ChatPanel +     │ ───────────► │ chat_with_agent     │
│ useAgent hook   │              │ (commands/agent_cmd)│
└─────────────────┘              └─────────┬───────────┘
        ▲                                  │
        │ agent:tool-call-{start,end}      │
        │ Tauri events                     ▼
┌───────┴─────────┐              ┌─────────────────────┐
│ Live tool       │              │ run_user_turn       │ ← agent/runner.rs
│ stream UI       │              │ (loop)              │
└─────────────────┘              └─────┬───────────┬───┘
                                       │           │
                                  ┌────▼──┐   ┌────▼──────┐
                                  │Gemini │   │ CuaDriver │
                                  │chat_  │   │  Client   │ ← agent/cua_driver.rs
                                  │with_  │   └─────┬─────┘
                                  │tools  │         │ Unix socket
                                  └───────┘         │ JSON-line protocol
                                                    ▼
                              ┌──────────────────────────────────┐
                              │ cua-driver daemon (Swift)        │
                              │ ~/Library/Caches/cua-driver/     │
                              │   cua-driver.sock                │
                              │ → CGEvent / SkyLight / AX        │
                              │ → 28 MCP tools (we use 8)        │
                              └──────────────────────────────────┘
```

### New files

- `src-tauri/src/agent/protocol.rs` — wire types (`DaemonRequest`, `DaemonResponse`, `CallResult`, `ContentBlock`)
- `src-tauri/src/agent/cua_driver.rs` — async Unix-socket client + `DaemonSupervisor` (binary discovery, spawn, health check)
- `src-tauri/src/agent/tools.rs` — curated 8-tool catalog mapped to Gemini `FunctionDeclaration`s
- `src-tauri/src/agent/runner.rs` — tool-use loop (`run_user_turn`), max 8 rounds, emits `agent:tool-call-{start,end}` events
- `src-tauri/src/agent/mod.rs` — module exports
- `src-tauri/src/commands/agent_cmd.rs` — Tauri commands: `get_agent_status`, `start_agent`, `chat_with_agent`, `invoke_cua_tool`
- `src/hooks/useAgent.ts` — React hook with live tool-call streaming
- `src/hooks/useTauri.ts` (extended) — TypeScript types and invoke wrappers

### Modified files

- `src-tauri/src/ai/types.rs` — `FunctionDeclaration`, `FunctionCall`, `FunctionResult`, `ToolMessage`, `ToolTurn`; Gemini wire types extended with `tools`, `tool_config`, `function_call`/`function_response` parts
- `src-tauri/src/ai/provider.rs` — `AiProvider::chat_with_tools` (default: unsupported error) + `supports_tools()`
- `src-tauri/src/ai/gemini.rs` — full `chat_with_tools` impl with multi-round tool conversation translation
- `src-tauri/src/state.rs` — `ai_client: RwLock<Option<Arc<dyn AiProvider>>>` (was `Box`); new `agent_supervisor: RwLock<Option<DaemonSupervisor>>`
- `src-tauri/src/commands/chat_cmd.rs` — wraps providers in `Arc` instead of `Box`
- `src-tauri/src/lib.rs` — registers `agent` module + 4 new commands; spawns supervisor in setup
- `src-tauri/src/events.rs` — `AGENT_TOOL_CALL_{START,END}`, `AGENT_DAEMON_{READY,ERROR}`
- `src/components/ChatPanel.tsx` — Agent mode toggle, tool-call audit trail, live stream

## Installing cua-driver

The Hawkeye binary does **not** ship with cua-driver. Install it once:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh)"
```

This downloads a signed/notarized release tarball, places `CuaDriver.app`
in `/Applications/`, and symlinks `/usr/local/bin/cua-driver`. After the
first launch, macOS will prompt for **Accessibility** and **Screen
Recording** permissions — both required.

Override the version with `CUA_DRIVER_VERSION=0.0.5` and override the
binary location with `CUA_DRIVER_BIN=/path/to/cua-driver` if needed.

To verify:

```bash
cua-driver --version       # prints the build number
cua-driver serve &         # starts the daemon
ls ~/Library/Caches/cua-driver/cua-driver.sock   # should exist
```

## Running Hawkeye + the agent

```bash
cd packages/desktop-tauri
pnpm tauri:dev
```

In the chat panel:

1. Toggle the **Agent** checkbox at the top.
2. The status badge will show one of: `⚠ driver missing` / `start daemon` / `● ready`.
   - If "start daemon", click it to spawn the daemon (or call `start_agent` from devtools).
3. Type a request. Examples:
   - `Take a screenshot and describe what's on my screen.`
   - `Open Safari.`
   - `What apps are currently running?`
   - `Click the "Send" button in the focused window.`
4. As Gemini decides to call tools, you'll see them stream in real time
   under the conversation (`screenshot — Captured 1440x900 PNG`, `click —
   Clicked successfully`, etc.).
5. The final assistant text appears once the model emits text-only output.

## Security model

- **Allow-list**: Only the 8 curated tool names in `agent::tools::allowed_tool_names()`
  can be invoked; anything else returns `{ok: false, error: "not in allow-list"}`
  *to the model* (not to the daemon), letting it recover.
- **Round cap**: `MAX_TOOL_ROUNDS = 8`. The loop hard-stops past that limit.
- **Socket permissions**: cua-driver creates the socket with mode `0o600`,
  so only the owning user can speak to it.
- **No daemon auth**: the socket is filesystem-permission-gated only.
  TCC (Accessibility/Screen Recording) lives at the OS level on the
  cua-driver app bundle.
- **Failures degrade**: tool errors become `{ok:false, error:…}` payloads
  fed back to the model, not exceptions to the user. The model can then
  apologize, retry, or change strategy.

## Known limitations / future work

- **OpenAI / local llama.cpp** providers still respond with "tool calling
  not supported". Adding it is straightforward: implement
  `chat_with_tools` for each via OpenAI's `tools` field / a JSON-formatted
  prompt for local models.
- **Curated tool set is static**. We ignore the daemon's `list` and
  `describe` methods; we could surface the full 28-tool catalog
  dynamically with a richer Gemini schema translation.
- **No conversation persistence**. Both plain chat and agent chat lose
  history on reload. Hawkeye memory says this is also true today for the
  non-agent path.
- **Image return path**: when the model calls `screenshot`, we attach the
  PNG as a *follow-up* user image part (since Gemini doesn't support
  inline images inside `function_response`). Works in practice; mention
  this in prompts if needed.
- **macOS only**. cua-driver is macOS-exclusive (uses Apple
  Virtualization-adjacent SkyLight SPIs). Linux/Windows would need a
  different driver.

## Verifying the integration

```bash
# Backend tests
cd packages/desktop-tauri/src-tauri
cargo test --lib agent::

# Expected: 5 passed
#   default_socket_under_cache_dir
#   encodes_call_request_as_one_line
#   decodes_call_success_response
#   decodes_error_response
#   decodes_screenshot_image_block
```

```bash
# Manual smoke (requires cua-driver installed)
cua-driver serve &
sleep 1

# From any Hawkeye chat with agent mode on:
"List my open windows"
# → list_windows tool call → assistant reports the windows

"Take a screenshot"
# → screenshot tool call → assistant describes what's on screen
```

## File-level test plan

| Layer | Test |
|---|---|
| `agent/protocol.rs` | unit tests pass (encode/decode JSON-line protocol) |
| `agent/cua_driver.rs` | `is_running()` returns false with no daemon; `default_path()` resolves under `~/Library/Caches/` |
| `agent/runner.rs` | (manual) tool-use loop runs to completion within `MAX_TOOL_ROUNDS` |
| `ai/gemini.rs::do_chat_with_tools` | (manual) supplies a `tools` block, parses `function_call` parts |
| `commands/agent_cmd.rs` | `get_agent_status` returns sane values; `invoke_cua_tool` blocks unauthorized tools |
| `useAgent.ts` | live tool stream populates from `agent:tool-call-*` events |
| `ChatPanel.tsx` | Agent toggle switches to `chat_with_agent`; clear tool trail rendering |
