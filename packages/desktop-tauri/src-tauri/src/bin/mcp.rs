//! `hawkeye-mcp` — Model Context Protocol stdio server.
//!
//! Wraps the local hawkeyed daemon so AI tools that speak MCP (Claude Code,
//! Cursor, Continue, etc.) can call into Hawkeye for live screen context,
//! gaze targets, and the user's life-tree knowledge graph.
//!
//! Wire format: line-delimited JSON-RPC 2.0 on stdin/stdout (per the MCP
//! spec). All log output goes to stderr — never write logs to stdout or
//! you'll corrupt the JSON-RPC stream.
//!
//! Configuration (via env):
//!   HAWKEYED_URL    default http://127.0.0.1:23789
//!   HAWKEYED_TOKEN  default read from ~/.config/hawkeye/api-token
//!
//! Register in Claude Code (`~/.config/claude/mcp.json`):
//!   {
//!     "mcpServers": {
//!       "hawkeye": {
//!         "command": "/path/to/hawkeye-mcp"
//!       }
//!     }
//!   }

use std::io::{BufRead, Write};
use std::sync::Arc;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const MCP_PROTOCOL_VERSION: &str = "2024-11-05";

#[derive(Deserialize)]
struct Req {
    jsonrpc: String,
    #[serde(default)]
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Serialize)]
struct Resp {
    jsonrpc: &'static str,
    id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<RpcError>,
}

#[derive(Serialize)]
struct RpcError {
    code: i32,
    message: String,
}

struct DaemonClient {
    base: String,
    token: String,
    http: reqwest::Client,
}

impl DaemonClient {
    fn from_env() -> Result<Self> {
        let base = std::env::var("HAWKEYED_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:23789".to_string());
        let token = match std::env::var("HAWKEYED_TOKEN") {
            Ok(t) => t,
            Err(_) => {
                // Fall back to the on-disk token (same one the daemon uses).
                let path = dirs::config_dir()
                    .ok_or_else(|| anyhow::anyhow!("no config dir"))?
                    .join("hawkeye/api-token");
                std::fs::read_to_string(&path)
                    .with_context(|| {
                        format!(
                            "read token at {} — set HAWKEYED_TOKEN or run `hawkeye-cli print-token` first",
                            path.display()
                        )
                    })?
                    .trim()
                    .to_string()
            }
        };
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()?;
        Ok(Self { base, token, http })
    }

    async fn get(&self, path: &str) -> Result<Value> {
        let resp = self
            .http
            .get(format!("{}{}", self.base, path))
            .bearer_auth(&self.token)
            .send()
            .await?;
        let status = resp.status();
        let v: Value = resp.json().await?;
        if !status.is_success() {
            anyhow::bail!("GET {} → {}: {}", path, status, v);
        }
        Ok(v)
    }

    async fn post(&self, path: &str, body: Value) -> Result<Value> {
        let resp = self
            .http
            .post(format!("{}{}", self.base, path))
            .bearer_auth(&self.token)
            .json(&body)
            .send()
            .await?;
        let status = resp.status();
        let v: Value = resp.json().await?;
        if !status.is_success() {
            anyhow::bail!("POST {} → {}: {}", path, status, v);
        }
        Ok(v)
    }
}

/// Tool catalog exposed to the MCP client. Kept small and high-signal so
/// the client's LLM picks tools confidently.
fn tool_catalog() -> Value {
    json!([
        {
            "name": "hawkeye_current_view",
            "description": "Get a snapshot of what the user is doing RIGHT NOW: the active window/app + OCR text from the screen. Use this when the user references their own screen or asks 'what am I looking at'.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "hawkeye_gazed_entity",
            "description": "Get the specific text region the user is currently looking at (via eye tracking). Returns the text content + bounding box + dwell time. Use this when the user says 'this', 'that', 'this thing', '这个', '那个' — Hawkeye knows exactly what their eyes are on.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "hawkeye_life_tree",
            "description": "Get the user's life-tree knowledge graph — their tracked projects, technologies, people, and concepts derived from observed screen activity. Use to ground your suggestions in what the user actually works on.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "hawkeye_screenshot",
            "description": "Capture the user's primary screen. Returns base64 PNG. Use only when you need raw pixels — for text content prefer hawkeye_current_view (cheaper).",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "hawkeye_observe_status",
            "description": "Get the latest observation from Hawkeye's background screen monitor — last app, last OCR text, change rate. Cheaper than hawkeye_current_view because it returns the cached frame.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "hawkeye_set_gazed_entity",
            "description": "Tell Hawkeye to treat a specific text + bbox as the 'this/that' target. Use sparingly — normally the user's actual gaze sets this automatically.",
            "inputSchema": {
                "type": "object",
                "required": ["text", "bboxPx"],
                "properties": {
                    "text": { "type": "string" },
                    "entityType": { "type": "string" },
                    "bboxPx": {
                        "type": "object",
                        "properties": {
                            "xPx": { "type": "number" },
                            "yPx": { "type": "number" },
                            "widthPx": { "type": "number" },
                            "heightPx": { "type": "number" }
                        }
                    }
                }
            }
        }
    ])
}

async fn handle_tool_call(name: &str, args: &Value, client: &DaemonClient) -> Result<Value> {
    match name {
        "hawkeye_current_view" => {
            let win = client.get("/v1/perception/window").await.unwrap_or(Value::Null);
            let shot = client.post("/v1/perception/screenshot", json!({})).await?;
            let b64 = shot
                .get("dataUrl")
                .and_then(|v| v.as_str())
                .map(|s| s.trim_start_matches("data:image/png;base64,"))
                .unwrap_or("");
            let ocr = client
                .post("/v1/perception/ocr", json!({ "image_base64": b64 }))
                .await?;
            let text = ocr.get("text").and_then(|v| v.as_str()).unwrap_or("");
            let body = format!(
                "Active window: {}\n\nVisible text:\n{}",
                serde_json::to_string(&win).unwrap_or_default(),
                text
            );
            Ok(text_content(body))
        }

        "hawkeye_gazed_entity" => {
            let v = client.get("/v1/gaze/entity").await?;
            if v.is_null() {
                Ok(text_content("No gazed entity right now — the user isn't dwelling on anything detectable. They may not have eye tracking running, or they're moving their gaze (saccade).".to_string()))
            } else {
                Ok(text_content(format!(
                    "User is currently looking at:\n{}",
                    serde_json::to_string_pretty(&v).unwrap_or_default()
                )))
            }
        }

        "hawkeye_life_tree" => {
            let v = client.get("/v1/life-tree").await?;
            Ok(text_content(serde_json::to_string_pretty(&v).unwrap_or_default()))
        }

        "hawkeye_screenshot" => {
            let v = client.post("/v1/perception/screenshot", json!({})).await?;
            let url = v.get("dataUrl").and_then(|s| s.as_str()).unwrap_or("");
            let mime = "image/png";
            let b64 = url.trim_start_matches("data:image/png;base64,");
            // MCP `image` content block carries base64 data + mime type.
            Ok(json!({ "content": [{ "type": "image", "data": b64, "mimeType": mime }] }))
        }

        "hawkeye_observe_status" => {
            let v = client.get("/v1/observe/status").await?;
            Ok(text_content(serde_json::to_string_pretty(&v).unwrap_or_default()))
        }

        "hawkeye_set_gazed_entity" => {
            // Required: text, bboxPx. We fill in dummy confidence/dwell/timestamp.
            let mut payload = args.clone();
            let obj = payload
                .as_object_mut()
                .ok_or_else(|| anyhow::anyhow!("args must be an object"))?;
            obj.entry("confidence").or_insert(json!(1.0));
            obj.entry("dwellMs").or_insert(json!(0));
            obj.entry("timestamp").or_insert(json!(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis())
                    .unwrap_or(0)
            ));
            let _ = client.post("/v1/gaze/entity", payload).await?;
            // PUT not POST — fall back: use the GET-based set via the
            // alternate path. (The route is `PUT /v1/gaze/entity` but our
            // simple client only does GET/POST; the daemon accepts both.)
            // For now just report ok.
            Ok(text_content("Gazed entity updated".to_string()))
        }

        other => Err(anyhow::anyhow!("unknown tool: {}", other)),
    }
}

fn text_content(s: String) -> Value {
    json!({ "content": [{ "type": "text", "text": s }] })
}

async fn handle(req: Req, client: &DaemonClient) -> Resp {
    let id = req.id.clone().unwrap_or(Value::Null);

    let result = match req.method.as_str() {
        "initialize" => Ok(json!({
            "protocolVersion": MCP_PROTOCOL_VERSION,
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "hawkeye-mcp", "version": env!("CARGO_PKG_VERSION") }
        })),

        "notifications/initialized" => {
            // Notifications get no response. Return early with no id check.
            return Resp {
                jsonrpc: "2.0",
                id: Value::Null,
                result: None,
                error: None,
            };
        }

        "tools/list" => Ok(json!({ "tools": tool_catalog() })),

        "tools/call" => {
            let name = req
                .params
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let args = req
                .params
                .get("arguments")
                .cloned()
                .unwrap_or(json!({}));
            handle_tool_call(name, &args, client).await
        }

        "ping" => Ok(json!({})),

        other => Err(anyhow::anyhow!("unknown method: {}", other)),
    };

    match result {
        Ok(value) => Resp {
            jsonrpc: "2.0",
            id,
            result: Some(value),
            error: None,
        },
        Err(e) => Resp {
            jsonrpc: "2.0",
            id,
            result: None,
            error: Some(RpcError {
                code: -32000,
                message: e.to_string(),
            }),
        },
    }
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> Result<()> {
    // Log to stderr — MUST NOT touch stdout (reserved for JSON-RPC).
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .target(env_logger::Target::Stderr)
        .init();

    let client = Arc::new(DaemonClient::from_env()?);
    log::info!("[hawkeye-mcp] daemon at {} — protocol {}", client.base, MCP_PROTOCOL_VERSION);

    let stdin = std::io::stdin();
    let stdout = std::io::stdout();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(e) => {
                log::warn!("stdin read: {}", e);
                continue;
            }
        };
        if line.trim().is_empty() {
            continue;
        }

        let req: Req = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                log::warn!("bad request frame: {} ({})", e, line);
                continue;
            }
        };

        if req.jsonrpc != "2.0" {
            log::warn!("unexpected jsonrpc version: {}", req.jsonrpc);
            continue;
        }

        let is_notif = req.id.is_none();
        let resp = handle(req, &client).await;

        // Notifications: no response per spec.
        if is_notif && resp.id.is_null() {
            continue;
        }

        let json = serde_json::to_string(&resp)?;
        let mut out = stdout.lock();
        writeln!(out, "{}", json)?;
        out.flush()?;
    }

    Ok(())
}
