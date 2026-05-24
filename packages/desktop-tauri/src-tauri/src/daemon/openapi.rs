//! OpenAPI 3.0 spec for hawkeyed, served at `/v1/openapi.json`.
//! Companion Swagger UI HTML at `/v1/docs` loads it via CDN-hosted swagger-ui-dist.
//!
//! We hand-write the spec as a raw JSON literal rather than annotate every
//! route with utoipa — at ~30 routes the annotation churn outweighs the
//! convenience, and a single spec file is easier to read & version.

use std::sync::OnceLock;

use axum::{response::Html, response::IntoResponse, Json};
use serde_json::Value;

static SPEC_CACHE: OnceLock<Value> = OnceLock::new();

pub async fn openapi_json() -> Json<Value> {
    Json(spec().clone())
}

pub async fn docs_html() -> impl IntoResponse {
    Html(SWAGGER_UI_HTML)
}

fn spec() -> &'static Value {
    SPEC_CACHE.get_or_init(|| {
        let mut v: Value = serde_json::from_str(SPEC_JSON).expect("openapi spec must parse");
        // Patch version dynamically so it stays in sync with Cargo.toml.
        if let Some(info) = v.get_mut("info").and_then(|i| i.as_object_mut()) {
            info.insert(
                "version".to_string(),
                Value::String(env!("CARGO_PKG_VERSION").to_string()),
            );
        }
        v
    })
}

const SWAGGER_UI_HTML: &str = r##"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>hawkeyed · API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body { margin: 0; background: #0e1015; }
    .topbar { display: none; }
    .swagger-ui { filter: invert(0.88) hue-rotate(180deg); }
    .swagger-ui .highlight-code { filter: invert(1) hue-rotate(180deg); }
    .swagger-ui img { filter: invert(1) hue-rotate(180deg); }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/v1/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      defaultModelsExpandDepth: 1,
      tryItOutEnabled: true,
      requestInterceptor: (req) => {
        const token = localStorage.getItem('hawkeyed_token');
        if (token && !req.headers.Authorization) {
          req.headers.Authorization = 'Bearer ' + token;
        }
        return req;
      },
      onComplete: () => {
        const el = document.createElement('div');
        el.style.cssText = 'background:#fef3c7;color:#0e1015;padding:8px 16px;font:13px/1.4 system-ui;text-align:center;';
        el.innerHTML = "Paste your bearer token (<code>hawkeye-cli print-token</code>) into the <b>Authorize</b> button — or run <code>localStorage.setItem('hawkeyed_token','...')</code> in DevTools.";
        document.body.prepend(el);
      },
    });
  </script>
</body>
</html>"##;

const SPEC_JSON: &str = r##"{
  "openapi": "3.0.3",
  "info": {
    "title": "hawkeyed",
    "description": "HTTP+SSE daemon for Hawkeye — local AI screen assistant. Pair with the Hawkeye Desktop Mac app to script every capability (chat, gaze, OCR, life-tree, agent, voice).",
    "version": "0.0.0",
    "license": { "name": "MIT" }
  },
  "servers": [{ "url": "http://127.0.0.1:23789", "description": "local daemon" }],
  "security": [{ "bearerAuth": [] }],
  "components": {
    "securitySchemes": {
      "bearerAuth": { "type": "http", "scheme": "bearer" }
    },
    "schemas": {
      "ChatMessage": {
        "type": "object",
        "required": ["role", "content"],
        "properties": {
          "role":    { "type": "string", "enum": ["user", "assistant", "system"] },
          "content": { "type": "string" }
        }
      },
      "ChatResponse": {
        "type": "object",
        "properties": {
          "text": { "type": "string" },
          "model": { "type": "string" },
          "durationMs": { "type": "integer", "format": "int64" }
        }
      },
      "OcrRegion": {
        "type": "object",
        "properties": {
          "text": { "type": "string" },
          "confidence": { "type": "number", "format": "float" },
          "bbox": {
            "type": "object",
            "description": "Normalized 0-1, origin BOTTOM-LEFT (Vision convention)",
            "properties": {
              "x": { "type": "number" }, "y": { "type": "number" },
              "width": { "type": "number" }, "height": { "type": "number" }
            }
          }
        }
      },
      "GazedEntity": {
        "type": "object",
        "required": ["text", "bboxPx", "confidence", "dwellMs", "timestamp"],
        "properties": {
          "text": { "type": "string" },
          "entityType": { "type": "string", "nullable": true },
          "bboxPx": {
            "type": "object",
            "properties": {
              "xPx": { "type": "number" }, "yPx": { "type": "number" },
              "widthPx": { "type": "number" }, "heightPx": { "type": "number" }
            }
          },
          "confidence": { "type": "number" },
          "dwellMs": { "type": "integer", "format": "int64" },
          "appName": { "type": "string", "nullable": true },
          "timestamp": { "type": "integer", "format": "int64" }
        }
      },
      "Error": {
        "type": "object",
        "properties": { "error": { "type": "string" } }
      }
    }
  },
  "tags": [
    { "name": "Public",     "description": "Discovery/health — no auth required" },
    { "name": "AI",         "description": "Chat + provider lifecycle" },
    { "name": "Agent",      "description": "cua-driver desktop control" },
    { "name": "Perception", "description": "Screen capture + OCR + vision" },
    { "name": "Observe",    "description": "Background screen monitoring" },
    { "name": "Gaze",       "description": "Eye tracking + this/that entity" },
    { "name": "Life Tree",  "description": "Knowledge graph of activities + experiments" },
    { "name": "Speech",     "description": "Voice recognition" },
    { "name": "Models",     "description": "Local GGUF / Whisper model registry + downloads" },
    { "name": "Debug",      "description": "Debug timeline events" },
    { "name": "Intent",     "description": "Rule + AI intent recognition" },
    { "name": "Summary",    "description": "Activity log summarization" },
    { "name": "Training",   "description": "Local fine-tuning data collection" },
    { "name": "Gesture",    "description": "Hand-gesture control" },
    { "name": "Adaptive",   "description": "Adaptive observe-loop refresh tuning" },
    { "name": "Updater",    "description": "Auto-update (Tauri-only)" },
    { "name": "Util",       "description": "Misc helpers (clipboard, open URL, ...)" },
    { "name": "Events",     "description": "Live event stream (SSE)" }
  ],
  "paths": {
    "/v1/health": {
      "get": { "tags": ["Public"], "summary": "Liveness probe", "security": [],
               "responses": { "200": { "description": "alive" } } }
    },
    "/v1/info": {
      "get": { "tags": ["Public"], "summary": "Service + version", "security": [],
               "responses": { "200": { "description": "info" } } }
    },
    "/v1/status": {
      "get": { "tags": ["AI"], "summary": "Daemon + AI + observe status",
               "responses": { "200": { "description": "status" } } }
    },
    "/v1/config": {
      "get": { "tags": ["AI"], "summary": "Read persisted config",
               "responses": { "200": { "description": "config" } } },
      "put": { "tags": ["AI"], "summary": "Replace persisted config",
               "requestBody": { "required": true, "content": { "application/json": {} } },
               "responses": { "200": { "description": "saved" } } }
    },
    "/v1/ai/init": {
      "post": { "tags": ["AI"], "summary": "Initialize AI client from current config",
                "responses": { "200": { "description": "initialized" } } }
    },
    "/v1/ai/chat": {
      "post": {
        "tags": ["AI"], "summary": "One-turn chat",
        "requestBody": { "required": true, "content": { "application/json": { "schema": {
          "type": "object",
          "properties": { "messages": { "type": "array", "items": { "$ref": "#/components/schemas/ChatMessage" } } }
        }}}},
        "responses": { "200": { "description": "reply", "content": { "application/json": {
          "schema": { "$ref": "#/components/schemas/ChatResponse" } } } } }
      }
    },
    "/v1/ai/chat-with-gaze-context": {
      "post": {
        "tags": ["AI"],
        "summary": "Chat with this/that auto-resolved against gazed entity",
        "description": "Same as /v1/ai/chat, but the daemon substitutes 'this' / 'that' / '这个' / '那个' in the last user message with the currently-gazed entity (set via /v1/gaze/entity).",
        "requestBody": { "required": true, "content": { "application/json": { "schema": {
          "type": "object",
          "properties": { "messages": { "type": "array", "items": { "$ref": "#/components/schemas/ChatMessage" } } }
        }}}},
        "responses": { "200": { "description": "reply" } }
      }
    },
    "/v1/agent/status":  { "get":  { "tags": ["Agent"], "summary": "cua-driver state",      "responses": { "200": { "description": "status" } } } },
    "/v1/agent/start":   { "post": { "tags": ["Agent"], "summary": "Ensure cua-driver up",  "responses": { "200": { "description": "started" } } } },
    "/v1/agent/chat": {
      "post": {
        "tags": ["Agent"], "summary": "Tool-using turn (LLM + cua-driver)",
        "requestBody": { "required": true, "content": { "application/json": { "schema": {
          "type": "object",
          "required": ["history", "user_input"],
          "properties": {
            "history": { "type": "array", "items": { "$ref": "#/components/schemas/ChatMessage" } },
            "user_input": { "type": "string" },
            "require_confirmation": { "type": "boolean", "default": false,
              "description": "When true, the agent emits agent:confirm-needed via SSE for every risky tool call and waits for POST /v1/agent/confirm." }
          }
        }}}},
        "responses": { "200": { "description": "agent turn result" } }
      }
    },
    "/v1/agent/confirm": {
      "post": {
        "tags": ["Agent"], "summary": "Resolve a pending risky-tool confirmation",
        "requestBody": { "required": true, "content": { "application/json": { "schema": {
          "type": "object", "required": ["confirm_id", "accept"],
          "properties": { "confirm_id": { "type": "string" }, "accept": { "type": "boolean" } }
        }}}},
        "responses": { "200": { "description": "resolved" } }
      }
    },
    "/v1/agent/tool/{name}": {
      "post": {
        "tags": ["Agent"], "summary": "Invoke a single cua-driver tool (bypasses LLM)",
        "parameters": [{ "name": "name", "in": "path", "required": true, "schema": { "type": "string" },
          "description": "Tool name from allow-list: screenshot, list_windows, get_window_state, click, type_text, press_key, scroll, launch_app" }],
        "requestBody": { "required": true, "content": { "application/json": { "schema": {
          "type": "object", "properties": { "args": { "type": "object" } } } } } },
        "responses": { "200": { "description": "tool result" } }
      }
    },
    "/v1/perception/screenshot": {
      "post": { "tags": ["Perception"], "summary": "Capture primary screen as base64 PNG",
                "responses": { "200": { "description": "screenshot" } } }
    },
    "/v1/perception/ocr": {
      "post": {
        "tags": ["Perception"], "summary": "Apple Vision OCR (text + bbox regions)",
        "requestBody": { "required": true, "content": { "application/json": { "schema": {
          "type": "object", "required": ["image_base64"],
          "properties": { "image_base64": { "type": "string", "description": "raw base64 PNG (no data: prefix)" } }
        }}}},
        "responses": { "200": { "description": "ocr result", "content": { "application/json": { "schema": {
          "type": "object",
          "properties": {
            "text":    { "type": "string" },
            "regions": { "type": "array", "items": { "$ref": "#/components/schemas/OcrRegion" } }
          }
        }}}}}
      }
    },
    "/v1/perception/analyze": {
      "post": {
        "tags": ["Perception"],
        "summary": "Vision dispatch — Apple OCR (with bbox) or cloud multimodal",
        "description": "Routes to the provider chosen in config.visionProvider. Apple returns OCR text + bbox; Gemini/OpenAI return rich captioning without bbox.",
        "requestBody": { "required": true, "content": { "application/json": { "schema": {
          "type": "object", "required": ["image_base64"],
          "properties": {
            "image_base64": { "type": "string" },
            "prompt": { "type": "string", "nullable": true, "description": "Only used for cloud providers" }
          }
        }}}},
        "responses": { "200": { "description": "analysis result" } }
      }
    },
    "/v1/perception/window": {
      "get": { "tags": ["Perception"], "summary": "Active window info",
               "responses": { "200": { "description": "window" } } }
    },
    "/v1/observe/start": {
      "post": {
        "tags": ["Observe"], "summary": "Start background observe loop",
        "requestBody": { "content": { "application/json": { "schema": {
          "type": "object",
          "properties": {
            "interval_ms":     { "type": "integer", "default": 3000 },
            "change_threshold": { "type": "number", "default": 0.05 }
          }
        }}}},
        "responses": { "200": { "description": "started" } }
      }
    },
    "/v1/observe/stop":   { "post": { "tags": ["Observe"], "summary": "Stop observe loop",
                                       "responses": { "200": { "description": "stopped" } } } },
    "/v1/observe/status": { "get":  { "tags": ["Observe"], "summary": "Get loop state + last obs",
                                       "responses": { "200": { "description": "status" } } } },
    "/v1/gaze/sample": {
      "post": {
        "tags": ["Gaze"], "summary": "Submit one training sample",
        "requestBody": { "required": true, "content": { "application/json": { "schema": {
          "type": "object", "required": ["features", "targetX", "targetY", "timestamp"],
          "properties": {
            "features":  { "type": "array", "items": { "type": "number" }, "description": "40 floats" },
            "targetX":   { "type": "number" },
            "targetY":   { "type": "number" },
            "timestamp": { "type": "integer" }
          }
        }}}},
        "responses": { "200": { "description": "sample count" } }
      }
    },
    "/v1/gaze/predict": {
      "post": {
        "tags": ["Gaze"], "summary": "Predict gaze from 40-feature vector",
        "requestBody": { "required": true, "content": { "application/json": { "schema": {
          "type": "object",
          "properties": { "features": { "type": "array", "items": { "type": "number" } } }
        }}}},
        "responses": { "200": { "description": "prediction" } }
      }
    },
    "/v1/gaze/training-status": {
      "get": { "tags": ["Gaze"], "summary": "Sample count + train loss + model ready",
               "responses": { "200": { "description": "status" } } }
    },
    "/v1/gaze/entity": {
      "get":    { "tags": ["Gaze"], "summary": "Get the currently-gazed entity",
                  "responses": { "200": { "description": "entity",
                    "content": { "application/json": { "schema": { "$ref": "#/components/schemas/GazedEntity" } } } } } },
      "put":    { "tags": ["Gaze"], "summary": "Set the currently-gazed entity",
                  "requestBody": { "required": true, "content": { "application/json": { "schema": {
                    "$ref": "#/components/schemas/GazedEntity" } } } },
                  "responses": { "200": { "description": "ok" } } },
      "delete": { "tags": ["Gaze"], "summary": "Clear the gazed entity",
                  "responses": { "200": { "description": "cleared" } } }
    },
    "/v1/life-tree": {
      "get": { "tags": ["Life Tree"], "summary": "Knowledge graph snapshot",
               "responses": { "200": { "description": "snapshot" } } }
    },
    "/v1/life-tree/rebuild": {
      "post": { "tags": ["Life Tree"], "summary": "Wipe + rebuild the life tree",
                "responses": { "200": { "description": "snapshot" } } }
    },
    "/v1/speech/status": {
      "get": { "tags": ["Speech"], "summary": "Apple Speech availability",
               "responses": { "200": { "description": "status" } } }
    },
    "/v1/speech/listen": {
      "post": {
        "tags": ["Speech"], "summary": "Listen + transcribe (routes by speechProvider)",
        "requestBody": { "content": { "application/json": { "schema": {
          "type": "object", "properties": { "duration_secs": { "type": "integer", "default": 5 } }
        }}}},
        "responses": { "200": { "description": "transcript" } }
      }
    },
    "/v1/speech/listen-apple": {
      "post": { "tags": ["Speech"], "summary": "Listen via Apple Speech directly (bypasses dispatcher)",
                "requestBody": { "content": { "application/json": { "schema": { "type": "object",
                  "properties": { "duration_secs": { "type": "integer", "default": 5 } } } } } },
                "responses": { "200": { "description": "transcript" } } }
    },
    "/v1/speech/transcribe-file": {
      "post": { "tags": ["Speech"], "summary": "Transcribe an audio file at the given path",
                "requestBody": { "required": true, "content": { "application/json": { "schema": {
                  "type": "object", "required": ["audio_path"],
                  "properties": { "audio_path": { "type": "string" } } } } } },
                "responses": { "200": { "description": "transcript" } } }
    },

    "/v1/models": {
      "get": { "tags": ["Models"], "summary": "List installed local models",
               "responses": { "200": { "description": "installed models" } } }
    },
    "/v1/models/dir": {
      "get": { "tags": ["Models"], "summary": "Get the models directory path",
               "responses": { "200": { "description": "dir" } } }
    },
    "/v1/models/recommended": {
      "get": { "tags": ["Models"], "summary": "Curated registry of recommended models",
               "responses": { "200": { "description": "model registry" } } }
    },
    "/v1/models/by-type/{model_type}": {
      "get": { "tags": ["Models"], "summary": "Filter registry by type",
               "parameters": [{ "name": "model_type", "in": "path", "required": true,
                                "schema": { "type": "string", "enum": ["text_llm","vision_llm","whisper","tts","vad","embedding"] } }],
               "responses": { "200": { "description": "filtered models" } } }
    },
    "/v1/models/{id}/exists": {
      "get": { "tags": ["Models"], "summary": "Check if a model is installed on disk",
               "parameters": [{ "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }],
               "responses": { "200": { "description": "{exists: bool}" } } }
    },
    "/v1/models/{id}/download": {
      "post": { "tags": ["Models"], "summary": "Download a model from the registry",
                "description": "Streams `model:download-progress` events via SSE while running.",
                "parameters": [{ "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }],
                "responses": { "200": { "description": "downloaded local model" } } }
    },
    "/v1/models/{id}/path": {
      "get": { "tags": ["Models"], "summary": "Resolve the on-disk path of an installed model",
               "parameters": [{ "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }],
               "responses": { "200": { "description": "{path: string|null}" } } }
    },
    "/v1/models/{id}": {
      "delete": { "tags": ["Models"], "summary": "Delete a model from disk",
                  "parameters": [{ "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }],
                  "responses": { "200": { "description": "ok" } } }
    },
    "/v1/models/download/cancel": {
      "post": { "tags": ["Models"], "summary": "Cancel the in-flight download (if any)",
                "responses": { "200": { "description": "ok" } } }
    },

    "/v1/debug/events": {
      "get":    { "tags": ["Debug"], "summary": "List debug events",
                  "parameters": [
                    { "name": "types", "in": "query", "schema": { "type": "string" },
                      "description": "Comma-separated event types (e.g. ocr,llm_input)" },
                    { "name": "limit", "in": "query", "schema": { "type": "integer" } }
                  ],
                  "responses": { "200": { "description": "events" } } },
      "post":   { "tags": ["Debug"], "summary": "Push a debug event",
                  "requestBody": { "required": true, "content": { "application/json": { "schema": { "type": "object",
                    "required": ["event_type","label","data"],
                    "properties": {
                      "event_type": { "type": "string" }, "label": { "type": "string" },
                      "data": {}, "duration_ms": { "type": "integer" } } } } } },
                  "responses": { "200": { "description": "pushed event" } } },
      "delete": { "tags": ["Debug"], "summary": "Clear all debug events",
                  "responses": { "200": { "description": "ok" } } }
    },
    "/v1/debug/events/since/{since_ms}": {
      "get": { "tags": ["Debug"], "summary": "Events newer than a Unix-ms timestamp",
               "parameters": [{ "name": "since_ms", "in": "path", "required": true, "schema": { "type": "integer" } }],
               "responses": { "200": { "description": "events" } } }
    },
    "/v1/debug/events/search": {
      "get": { "tags": ["Debug"], "summary": "Full-text search debug events",
               "parameters": [{ "name": "q", "in": "query", "required": true, "schema": { "type": "string" } }],
               "responses": { "200": { "description": "events" } } }
    },
    "/v1/debug/status": { "get": { "tags": ["Debug"], "summary": "Counter + pause state", "responses": {"200":{"description":"status"}} } },
    "/v1/debug/pause":  { "post": { "tags": ["Debug"], "summary": "Pause event recording", "responses": {"200":{"description":"paused"}} } },
    "/v1/debug/resume": { "post": { "tags": ["Debug"], "summary": "Resume event recording", "responses": {"200":{"description":"resumed"}} } },

    "/v1/intent/recent": {
      "get": { "tags": ["Intent"], "summary": "Recent recognized intents", "responses": {"200":{"description":"intents"}} }
    },
    "/v1/intent/recognize": {
      "post": { "tags": ["Intent"], "summary": "Run rule-based recognition on last observation",
                "responses": { "200": { "description": "intents" } } }
    },
    "/v1/intent/recognize-ai": {
      "post": { "tags": ["Intent"], "summary": "Rule + AI-merged recognition", "responses": {"200":{"description":"intents"}} }
    },

    "/v1/life-tree/nodes/{node_id}/propose-experiment": {
      "post": { "tags": ["Life Tree"], "summary": "Propose an experiment for a tree node (LLM-driven)",
                "parameters": [{ "name": "node_id", "in": "path", "required": true, "schema": { "type": "string" } }],
                "responses": { "200": { "description": "proposal" } } }
    },
    "/v1/life-tree/experiments": {
      "get":  { "tags": ["Life Tree"], "summary": "List all experiment nodes", "responses": {"200":{"description":"experiments"}} },
      "post": { "tags": ["Life Tree"], "summary": "Start an experiment under a node",
                "requestBody": { "required": true, "content": { "application/json": { "schema": { "type": "object",
                  "required": ["node_id","title","description","phase"],
                  "properties": {
                    "node_id": { "type": "string" }, "title": { "type": "string" },
                    "description": { "type": "string" },
                    "phase": { "type": "string", "enum": ["task","goal","automation"] }
                  } } } } },
                "responses": { "200": { "description": "{ok, experimentId}" } } }
    },
    "/v1/life-tree/experiments/{exp_id}/conclude": {
      "post": { "tags": ["Life Tree"], "summary": "Conclude an experiment (succeeded/failed)",
                "parameters": [{ "name": "exp_id", "in": "path", "required": true, "schema": { "type": "string" } }],
                "requestBody": { "required": true, "content": { "application/json": { "schema": {
                  "type": "object", "required": ["succeeded"], "properties": { "succeeded": { "type": "boolean" } } } } } },
                "responses": { "200": { "description": "ok" } } }
    },
    "/v1/life-tree/unlocked-phase": {
      "get": { "tags": ["Life Tree"], "summary": "Highest experiment phase the user has unlocked",
               "responses": { "200": { "description": "{phase}" } } }
    },

    "/v1/summary/generate": {
      "post": { "tags": ["Summary"], "summary": "Summarize pending activity log via LLM",
                "responses": { "200": { "description": "summary" } } }
    },
    "/v1/summary/recent": {
      "get": { "tags": ["Summary"], "summary": "Recent activity summaries",
               "parameters": [{ "name": "count", "in": "query", "schema": { "type": "integer", "default": 10 } }],
               "responses": { "200": { "description": "summaries" } } }
    },
    "/v1/summary/activity-stats": {
      "get": { "tags": ["Summary"], "summary": "Counters over activity log", "responses": {"200":{"description":"stats"}} }
    },

    "/v1/training/samples": {
      "post": { "tags": ["Training"], "summary": "Save a training sample (conversation turn)",
                "requestBody": { "required": true, "content": { "application/json": { "schema": { "type": "object",
                  "required": ["session_id","turn_id","messages"],
                  "properties": {
                    "session_id": { "type": "string" },
                    "turn_id": { "type": "integer" },
                    "messages": { "type": "array", "items": { "$ref": "#/components/schemas/ChatMessage" } },
                    "context": { "type": "object" }
                  } } } } },
                "responses": { "200": { "description": "ok" } } }
    },
    "/v1/training/samples/{session_id}/rate": {
      "post": { "tags": ["Training"], "summary": "Attach a thumbs-up/down rating to a saved turn",
                "parameters": [{ "name": "session_id", "in": "path", "required": true, "schema": { "type": "string" } }],
                "requestBody": { "required": true, "content": { "application/json": { "schema": { "type": "object",
                  "required": ["turn_id","rating"],
                  "properties": {
                    "turn_id": { "type": "integer" },
                    "rating": { "type": "integer", "description": "-1, 0, or +1" },
                    "comment": { "type": "string" } } } } } },
                "responses": { "200": { "description": "ok" } } }
    },
    "/v1/training/stats": {
      "get": { "tags": ["Training"], "summary": "Sample counts by rating + storage path",
               "responses": { "200": { "description": "stats" } } }
    },
    "/v1/training/export": {
      "post": { "tags": ["Training"], "summary": "Export samples to ChatML JSONL for fine-tuning",
                "requestBody": { "content": { "application/json": { "schema": { "type": "object",
                  "properties": { "output_path": { "type": "string", "description": "Optional override path" } } } } } },
                "responses": { "200": { "description": "{path, count}" } } }
    },

    "/v1/gesture/event": {
      "post": { "tags": ["Gesture"], "summary": "Submit a gesture event for handling",
                "responses": { "200": { "description": "ok" } } }
    },
    "/v1/gesture/status": {
      "get": { "tags": ["Gesture"], "summary": "Gesture config + enabled state",
               "responses": { "200": { "description": "config" } } }
    },
    "/v1/gesture/config": {
      "put": { "tags": ["Gesture"], "summary": "Replace gesture config",
               "responses": { "200": { "description": "saved config" } } }
    },
    "/v1/gesture/enabled": {
      "post": { "tags": ["Gesture"], "summary": "Toggle gesture handling",
                "requestBody": { "required": true, "content": { "application/json": { "schema": { "type": "object",
                  "required": ["enabled"], "properties": { "enabled": { "type": "boolean" } } } } } },
                "responses": { "200": { "description": "ok" } } }
    },

    "/v1/adaptive/record-activity": {
      "post": { "tags": ["Adaptive"], "summary": "Tell the refresh tuner about an activity event",
                "requestBody": { "required": true, "content": { "application/json": { "schema": { "type": "object",
                  "required": ["event_type"],
                  "properties": { "event_type": { "type": "string",
                    "enum": ["screen_change","user_interaction","window_switch","clipboard_change","ai_request","plan_execution"] } } } } } },
                "responses": { "200": { "description": "ok" } } }
    },
    "/v1/adaptive/refresh-status": {
      "get": { "tags": ["Adaptive"], "summary": "Current adaptive refresh state",
               "responses": { "200": { "description": "status" } } }
    },

    "/v1/updater/check":   { "post": { "tags": ["Updater"], "summary": "Check for updates (501 in daemon — use GUI)", "responses": {"501":{"description":"not implemented"}} } },
    "/v1/updater/install": { "post": { "tags": ["Updater"], "summary": "Install pending update (501 in daemon — use GUI)", "responses": {"501":{"description":"not implemented"}} } },
    "/v1/updater/version": { "get":  { "tags": ["Updater"], "summary": "App version", "responses": {"200":{"description":"{version}"}} } },

    "/v1/clipboard": { "get": { "tags": ["Util"], "summary": "Read clipboard (returns null in daemon — GUI plugin only)", "responses": {"200":{"description":"content"}} } },
    "/v1/util/open-url": {
      "post": { "tags": ["Util"], "summary": "Open a URL in the system default browser",
                "requestBody": { "required": true, "content": { "application/json": { "schema": { "type": "object",
                  "required": ["url"], "properties": { "url": { "type": "string" } } } } } },
                "responses": { "200": { "description": "ok" } } }
    },

    "/v1/gaze/model": {
      "delete": { "tags": ["Gaze"], "summary": "Delete the trained gaze model + sample buffer", "responses": {"200":{"description":"ok"}} }
    },
    "/v1/gaze/load-weights": {
      "post": { "tags": ["Gaze"], "summary": "Reload persisted gaze model weights from disk",
                "responses": { "200": { "description": "{ok, loaded}" } } }
    },
    "/v1/gaze/training/trigger": {
      "post": { "tags": ["Gaze"], "summary": "Trigger ANE training (501 — needs sink-based runner refactor)",
                "responses": { "501": { "description": "not implemented" } } }
    },

    "/v1/events": {
      "get": {
        "tags": ["Events"],
        "summary": "SSE stream of every backend event",
        "description": "Each frame: event: <name>\\ndata: <json>\\n\\n. Names mirror Tauri event constants (gaze:entity-changed, agent:tool-call-end, observe:update, etc.).",
        "parameters": [{
          "name": "filter", "in": "query", "required": false,
          "schema": { "type": "string" },
          "description": "Comma-separated event-name prefixes (e.g. gaze:,agent:)"
        }],
        "responses": { "200": { "description": "SSE stream",
                                "content": { "text/event-stream": {} } } }
      }
    }
  }
}"##;
