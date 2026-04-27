//! cua-driver daemon wire protocol types.
//!
//! The daemon listens on a Unix domain socket at
//! `~/Library/Caches/cua-driver/cua-driver.sock` (mode 0o600) and speaks a
//! line-delimited JSON protocol — each message is a single JSON object
//! followed by `\n`. This is intentionally simpler than MCP framing.
//!
//! References (Swift sources): `libs/cua-driver/Sources/CuaDriverServer/{DaemonProtocol,DaemonServer}.swift`.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

/// Top-level request sent to the daemon.
///
/// `method` is one of `"call"`, `"list"`, `"describe"`, `"shutdown"`.
#[derive(Debug, Clone, Serialize)]
pub struct DaemonRequest {
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<HashMap<String, Value>>,
}

impl DaemonRequest {
    pub fn list() -> Self {
        Self { method: "list".into(), name: None, args: None }
    }

    pub fn describe(tool: impl Into<String>) -> Self {
        Self { method: "describe".into(), name: Some(tool.into()), args: None }
    }

    pub fn call(tool: impl Into<String>, args: HashMap<String, Value>) -> Self {
        Self { method: "call".into(), name: Some(tool.into()), args: Some(args) }
    }

    pub fn shutdown() -> Self {
        Self { method: "shutdown".into(), name: None, args: None }
    }
}

/// Top-level response from the daemon.
///
/// On success, `ok=true` and `result` is set. On failure, `ok=false` and
/// `error` carries the message; `exit_code` follows sysexits.h conventions
/// (1=tool error, 64=usage, 65=data, 70=software).
#[derive(Debug, Clone, Deserialize)]
pub struct DaemonResponse {
    pub ok: bool,
    #[serde(default)]
    pub result: Option<DaemonResult>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(rename = "exitCode", default)]
    pub exit_code: Option<i32>,
}

/// Result discriminator — matches Swift's `DaemonResult` enum.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", content = "payload", rename_all = "lowercase")]
pub enum DaemonResult {
    Call(CallResult),
    List(Vec<ToolDescriptor>),
    Describe(ToolDescriptor),
}

/// Result of a tool invocation. Mirrors MCP's `CallTool.Result`: a list of
/// content blocks (text, image, etc.) plus an `isError` flag.
#[derive(Debug, Clone, Deserialize)]
pub struct CallResult {
    #[serde(default)]
    pub content: Vec<ContentBlock>,
    #[serde(rename = "isError", default)]
    pub is_error: bool,
}

impl CallResult {
    /// Concatenate all text blocks for human-readable summaries.
    pub fn text(&self) -> String {
        self.content
            .iter()
            .filter_map(|b| match b {
                ContentBlock::Text { text } => Some(text.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// First image block (e.g. `screenshot` returns inline base64 PNG).
    pub fn first_image(&self) -> Option<(&str, &str)> {
        self.content.iter().find_map(|b| match b {
            ContentBlock::Image { data, mime_type } => Some((data.as_str(), mime_type.as_str())),
            _ => None,
        })
    }
}

/// A single content block in a tool result.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ContentBlock {
    Text {
        text: String,
    },
    Image {
        data: String,
        #[serde(rename = "mimeType")]
        mime_type: String,
    },
    /// Forward-compat: unknown block types are preserved as raw JSON.
    #[serde(other, deserialize_with = "deserialize_unknown")]
    Other,
}

fn deserialize_unknown<'de, D>(deserializer: D) -> Result<(), D::Error>
where
    D: serde::Deserializer<'de>,
{
    serde::de::IgnoredAny::deserialize(deserializer).map(|_| ())
}

/// Tool descriptor returned by `list` / `describe`. The full schema is rich;
/// we keep only fields we use for surfacing to the LLM.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ToolDescriptor {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(rename = "inputSchema", default)]
    pub input_schema: Option<Value>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_call_request_as_one_line() {
        let mut args = HashMap::new();
        args.insert("pid".into(), Value::from(1234));
        args.insert("x".into(), Value::from(100));
        args.insert("y".into(), Value::from(200));
        let req = DaemonRequest::call("click", args);
        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("\"method\":\"call\""));
        assert!(json.contains("\"name\":\"click\""));
        assert!(!json.contains('\n'));
    }

    #[test]
    fn decodes_call_success_response() {
        let body = r#"{"ok":true,"result":{"kind":"call","payload":{"content":[{"type":"text","text":"Clicked"}],"isError":false}}}"#;
        let resp: DaemonResponse = serde_json::from_str(body).unwrap();
        assert!(resp.ok);
        match resp.result.unwrap() {
            DaemonResult::Call(r) => {
                assert!(!r.is_error);
                assert_eq!(r.text(), "Clicked");
            }
            _ => panic!("expected Call result"),
        }
    }

    #[test]
    fn decodes_error_response() {
        let body = r#"{"ok":false,"error":"Unknown tool","exitCode":64}"#;
        let resp: DaemonResponse = serde_json::from_str(body).unwrap();
        assert!(!resp.ok);
        assert_eq!(resp.error.as_deref(), Some("Unknown tool"));
        assert_eq!(resp.exit_code, Some(64));
    }

    #[test]
    fn decodes_screenshot_image_block() {
        let body = r#"{"ok":true,"result":{"kind":"call","payload":{"content":[{"type":"image","data":"iVBOR…","mimeType":"image/png"}],"isError":false}}}"#;
        let resp: DaemonResponse = serde_json::from_str(body).unwrap();
        match resp.result.unwrap() {
            DaemonResult::Call(r) => {
                let (data, mime) = r.first_image().unwrap();
                assert!(data.starts_with("iVBOR"));
                assert_eq!(mime, "image/png");
            }
            _ => panic!(),
        }
    }
}
