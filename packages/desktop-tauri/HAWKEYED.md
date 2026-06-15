# `hawkeyed` — Headless Shadow for Programmers

A local HTTP+SSE daemon that exposes every Shadow capability — screen
perception, eye tracking, life-tree, voice, chat, and the desktop-control
agent — over a clean REST API. Designed to share one backend with the
Tauri GUI: scripts and apps see the same live state the user sees.

> **Two flavors of Shadow:**
>
> - **Shadow Desktop (Tauri)** — point-and-click app for Mac end users.
> - **hawkeyed (this)** — daemon for programmers, scripts, and integrations.

---

## Quickstart

```bash
# 1. Build (release)
cd packages/desktop-tauri/src-tauri
cargo build --release --bin hawkeye-cli

# 2. Run the daemon
./target/release/hawkeye-cli daemon
# → prints banner with the local URL + API token

# 3. In another shell, print copy-paste examples
./target/release/hawkeye-cli examples | bash -x
```

Daemon listens on `127.0.0.1:23789` by default (override with `--port` or
edit `~/.config/hawkeye/config.json::syncPort`).

---

## Auth

Bearer token, generated on first run and persisted at
`~/.config/hawkeye/api-token` (mode 0600 on Unix). Read it programmatically:

```bash
TOKEN=$(hawkeye-cli print-token)
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:23789/v1/status
```

`/v1/health` and `/v1/info` are the only routes that work without a token.

---

## Endpoints (cheat sheet)

| Method | Path | What |
|--------|------|------|
| GET | `/v1/health` | liveness probe (no auth) |
| GET | `/v1/info` | service name + version (no auth) |
| GET | `/v1/status` | AI/observe/daemon status |
| GET/PUT | `/v1/config` | read/replace the persisted config |
| POST | `/v1/ai/init` | re-init AI client from current config |
| POST | `/v1/ai/chat` | one-turn chat — `{messages:[{role,content}]}` |
| POST | `/v1/ai/chat-with-gaze-context` | same but resolves "this/that/这个/那个" against the gazed entity |
| GET | `/v1/agent/status` | cua-driver binary + daemon state |
| POST | `/v1/agent/start` | start cua-driver daemon |
| POST | `/v1/agent/chat` | tool-using turn — `{history, user_input, require_confirmation}` |
| POST | `/v1/agent/confirm` | resolve a pending risky-tool confirm |
| POST | `/v1/agent/tool/:name` | invoke a single cua-driver tool directly |
| POST | `/v1/perception/screenshot` | capture primary screen → base64 PNG |
| POST | `/v1/perception/ocr` | Apple Vision OCR → text + bbox regions |
| POST | `/v1/perception/analyze` | dispatch: Apple OCR or cloud multimodal vision |
| GET | `/v1/perception/window` | active window info |
| POST/GET | `/v1/observe/start \| stop \| status` | background screen monitor |
| POST | `/v1/gaze/sample` | submit one (features, target) sample for training |
| POST | `/v1/gaze/predict` | predict gaze from 40-feature vector |
| GET | `/v1/gaze/training-status` | sample count, train loss, model ready |
| GET/PUT/DELETE | `/v1/gaze/entity` | current "this/that" entity |
| GET/POST | `/v1/life-tree \| /v1/life-tree/rebuild` | knowledge graph snapshot |
| GET | `/v1/speech/status` | Apple Speech availability |
| POST | `/v1/speech/listen` | mic → transcript (dispatched by config) |
| GET | `/v1/events` | **SSE** stream of every backend event |

### SSE filtering

```bash
# All events
curl -NH "Authorization: Bearer $TOKEN" http://127.0.0.1:23789/v1/events

# Just gaze + agent events
curl -NH "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:23789/v1/events?filter=gaze:,agent:"
```

Each event arrives as:
```
event: gaze:entity-changed
data: {"text":"useGazedEntity","bboxPx":{...},"dwellMs":612,...}
```

Names mirror the Tauri event constants in [`events.rs`](src-tauri/src/events.rs).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ hawkeyed  :23789                                            │
│                                                              │
│   axum router ── bearer auth ── route handlers ─┐           │
│                                                  │           │
│   SSE subscribers ◄── EventBus (broadcast) ◄────┤           │
│                                                  │           │
│                              ┌───────────────────▼─────────┐│
│                              │  Arc<AppState>             ││
│                              │  · AI clients              ││
│                              │  · LifeTree                ││
│                              │  · GazeModel + buffer      ││
│                              │  · ObserveLoop             ││
│                              │  · CuaDriverSupervisor     ││
│                              │  · DebugTimeline           ││
│                              └────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
              ▲                                  ▲
              │                                  │
        Tauri GUI                          curl / scripts /
        (attaches —                        Python / Node /
        same backend)                      Bash / Postman
```

The daemon and the Tauri GUI share the same `AppState`-shaped backend
modules — there's no duplication. Plan: GUI checks `:23789/v1/info` on
launch and either attaches (if daemon is up) or runs an embedded copy.

---

## Common recipes

### Tail OCR text every time the screen changes

```bash
TOKEN=$(hawkeye-cli print-token)
curl -sH "Authorization: Bearer $TOKEN" \
  -d '{"interval_ms":2000,"change_threshold":0.04}' \
  -X POST http://127.0.0.1:23789/v1/observe/start

curl -NH "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:23789/v1/events?filter=observe:" \
| while IFS= read -r line; do
    [[ "$line" == data:* ]] && echo "${line#data: }" | jq -r '.ocrText // empty'
  done
```

### Ask Gemini what's on screen

```bash
SHOT=$(curl -sH "Authorization: Bearer $TOKEN" -X POST $HAWK/v1/perception/screenshot)
B64=$(echo "$SHOT" | jq -r .dataUrl | sed 's|^data:image/png;base64,||')

curl -sH "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"image_base64\":\"$B64\",\"prompt\":\"What app is the user using and what task are they doing?\"}" \
  $HAWK/v1/perception/analyze | jq -r .text
```

### Drive the agent with explicit confirm (safety mode)

```bash
# In one terminal, watch for confirm requests:
curl -NH "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:23789/v1/events?filter=agent:"
# → emits agent:confirm-needed with {confirmId,name,args}

# In another terminal, kick off the agent:
curl -sH "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"history":[],"user_input":"open Calculator and type 2+2","require_confirmation":true}' \
  $HAWK/v1/agent/chat

# When you see a confirm-needed event, resolve it:
curl -sH "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"confirm_id":"<id from event>","accept":true}' \
  -X POST $HAWK/v1/agent/confirm
```

---

## Errors

Every non-2xx response carries `{"error": "..."}`. Auth failures return
`401` with no body. Risky-tool rejections show up in `agent/chat`'s
response as `userDeclined: true` rather than as an error.

---

## Roadmap

- [ ] OpenAPI 3.0 spec + Swagger UI at `/v1/docs`
- [ ] WebSocket equivalent of `/v1/events` (currently SSE-only)
- [ ] GUI auto-attach (detect daemon on launch, skip embedded backend)
- [ ] Per-token scopes (`readonly`, `agent`, `admin`)
- [ ] systemd / launchd service install helpers
