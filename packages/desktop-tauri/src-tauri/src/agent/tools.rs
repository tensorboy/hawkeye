//! Curated catalog of cua-driver tools surfaced to the LLM.
//!
//! cua-driver exposes ~28 MCP tools. Most LLMs pick better tools when the
//! catalog is small, well-described, and consistent. We hand-curate the
//! subset most useful for assistive automation, and translate them to
//! Gemini's `FunctionDeclaration` shape (which is OpenAPI 3.0 JSON Schema).

use serde_json::{json, Value};

use crate::ai::types::FunctionDeclaration;

/// Build the curated function-declaration list to send to Gemini.
pub fn gemini_function_declarations() -> Vec<FunctionDeclaration> {
    vec![
        screenshot(),
        list_windows(),
        get_window_state(),
        click(),
        type_text(),
        press_key(),
        scroll(),
        launch_app(),
    ]
}

/// Allow-list of cua-driver tool names that the LLM may invoke. Anything
/// outside this set is rejected before reaching the daemon.
pub fn allowed_tool_names() -> &'static [&'static str] {
    &[
        "screenshot",
        "list_windows",
        "get_window_state",
        "click",
        "type_text",
        "press_key",
        "scroll",
        "launch_app",
    ]
}

pub fn is_allowed(tool: &str) -> bool {
    allowed_tool_names().contains(&tool)
}

// --- individual tool declarations ------------------------------------------

fn fd(name: &str, description: &str, parameters: Value) -> FunctionDeclaration {
    FunctionDeclaration {
        name: name.to_string(),
        description: description.to_string(),
        parameters,
    }
}

fn screenshot() -> FunctionDeclaration {
    fd(
        "screenshot",
        "Capture a PNG screenshot of the current screen or a specific window. Use to see the user's desktop before deciding what to do. The result image is automatically attached to the next turn.",
        json!({
            "type": "object",
            "properties": {
                "window_id": {
                    "type": "integer",
                    "description": "Optional CGWindowID. Omit to capture the full primary display."
                }
            }
        }),
    )
}

fn list_windows() -> FunctionDeclaration {
    fd(
        "list_windows",
        "Enumerate visible windows across all running apps. Returns title, pid, window_id, bounds, and minimized state. Use to find the window you want to interact with.",
        json!({
            "type": "object",
            "properties": {
                "pid": {
                    "type": "integer",
                    "description": "Optional: limit to a single process."
                },
                "on_screen_only": {
                    "type": "boolean",
                    "description": "If true, exclude minimized/hidden windows. Default true."
                }
            }
        }),
    )
}

fn get_window_state() -> FunctionDeclaration {
    fd(
        "get_window_state",
        "Snapshot a window's accessibility (AX) tree plus a PNG. Returns interactive elements with stable element_index values you can pass to click/type_text without re-resolving coordinates. Required before AX-element-addressed clicks.",
        json!({
            "type": "object",
            "properties": {
                "pid": { "type": "integer", "description": "Process id (from list_windows)." },
                "window_id": { "type": "integer", "description": "Window id (from list_windows)." },
                "query": {
                    "type": "string",
                    "description": "Optional substring to filter element titles/roles (e.g., \"button\")."
                }
            },
            "required": ["pid", "window_id"]
        }),
    )
}

fn click() -> FunctionDeclaration {
    fd(
        "click",
        "Click on a UI element or at a pixel coordinate WITHOUT stealing focus or moving the user's cursor. Two modes: (1) AX-addressed: pass {pid, window_id, element_index} from a recent get_window_state result; (2) pixel-addressed: pass {pid, x, y} where x/y are window-local pixel coordinates from a screenshot.",
        json!({
            "type": "object",
            "properties": {
                "pid": { "type": "integer", "description": "Target process id." },
                "window_id": { "type": "integer", "description": "Target window id (AX mode)." },
                "element_index": {
                    "type": "integer",
                    "description": "AX element index from get_window_state (AX mode)."
                },
                "x": {
                    "type": "number",
                    "description": "Window-local x in screenshot pixels (pixel mode)."
                },
                "y": {
                    "type": "number",
                    "description": "Window-local y in screenshot pixels (pixel mode)."
                },
                "button": {
                    "type": "string",
                    "enum": ["left", "right"],
                    "description": "Mouse button. Default left."
                }
            },
            "required": ["pid"]
        }),
    )
}

fn type_text() -> FunctionDeclaration {
    fd(
        "type_text",
        "Type a string into the focused text field of a window without raising or stealing focus. If element_index is given, it is focused first. Otherwise the current focus inside the window is used.",
        json!({
            "type": "object",
            "properties": {
                "pid": { "type": "integer", "description": "Target process id." },
                "text": { "type": "string", "description": "Text to type." },
                "window_id": { "type": "integer", "description": "Optional target window id." },
                "element_index": {
                    "type": "integer",
                    "description": "Optional AX element index to focus before typing."
                }
            },
            "required": ["pid", "text"]
        }),
    )
}

fn press_key() -> FunctionDeclaration {
    fd(
        "press_key",
        "Send a single keystroke or hotkey combo (e.g., \"cmd+s\", \"return\", \"escape\"). Format: lowercase modifier names joined with '+' followed by the key.",
        json!({
            "type": "object",
            "properties": {
                "pid": { "type": "integer", "description": "Target process id." },
                "keys": {
                    "type": "string",
                    "description": "Hotkey string, e.g. \"cmd+s\" or \"return\"."
                }
            },
            "required": ["pid", "keys"]
        }),
    )
}

fn scroll() -> FunctionDeclaration {
    fd(
        "scroll",
        "Scroll within a window. Positive dy scrolls down (content moves up).",
        json!({
            "type": "object",
            "properties": {
                "pid": { "type": "integer", "description": "Target process id." },
                "window_id": { "type": "integer", "description": "Optional target window id." },
                "dx": { "type": "number", "description": "Horizontal scroll delta in pixels." },
                "dy": { "type": "number", "description": "Vertical scroll delta in pixels." }
            },
            "required": ["pid"]
        }),
    )
}

fn launch_app() -> FunctionDeclaration {
    fd(
        "launch_app",
        "Launch a macOS app by bundle id (e.g., com.apple.Safari) or absolute path. Activates if already running.",
        json!({
            "type": "object",
            "properties": {
                "bundle_id": { "type": "string", "description": "App bundle identifier." },
                "path": { "type": "string", "description": "Optional absolute .app path (alternative to bundle_id)." }
            }
        }),
    )
}
