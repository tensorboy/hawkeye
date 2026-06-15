# Phase 0: Tauri 2.0 Feasibility Validation - Results

## Summary

**Status: PASSED** - Tauri 2.0 is viable for the Shadow desktop app migration.

## Environment

| Component | Version |
|-----------|---------|
| Rust | 1.92.0 (nightly) |
| Cargo | 1.92.0 |
| Node.js | 22.x |
| pnpm | 10.16.x |
| Tauri CLI | 2.x |
| macOS | Darwin 25.3.0 |

## Build Results

| Metric | Debug | Release |
|--------|-------|---------|
| Binary size | 45 MB | **6.6 MB** |
| Build time | ~30s | ~1m 36s |
| Compilation | OK | OK |
| Frontend (Vite) | OK | OK |

## Size Comparison: Tauri vs Electron

| | Tauri (Release) | Electron Framework |
|---|---|---|
| Binary/Framework | **6.6 MB** | 274 MB |
| Reduction | - | **~97.6% smaller** |

> Note: Electron 274MB is the framework dist folder. A packaged Electron app would be ~150-200MB with asar.

## Features Validated

- [x] Rust cargo check passes
- [x] Rust cargo build (debug + release) succeeds
- [x] Vite frontend builds cleanly
- [x] Tauri dev server launches and renders React UI
- [x] Perception engine initializes (detects screens)
- [x] Screen capture works (via `screenshots` crate)
- [x] Tray icon shows in menu bar
- [x] Window renders with DaisyUI/Tailwind styling
- [x] IPC invoke system works (frontend ↔ Rust)
- [x] Config load/save via `dirs` crate
- [x] macOS private API enabled (for transparency)

## Issues Encountered & Resolved

### 1. `dirs` crate missing
- **Error**: `E0433: failed to resolve: use of unresolved module 'dirs'`
- **Fix**: Added `dirs = "6"` to Cargo.toml

### 2. `image` crate 0.25 API change
- **Error**: `E0599: no method named 'encode' found for PngEncoder`
- **Fix**: Changed `encoder.encode()` → `encoder.write_image()`, added `use image::ImageEncoder`

### 3. Tray icon feature not enabled
- **Error**: `set_tray_icon` method not found on `tauri::Context`
- **Fix**: Added `"tray-icon"` to tauri features in Cargo.toml

### 4. `fs` plugin config format changed
- **Error**: `unknown field 'scope', expected 'requireLiteralLeadingDot'`
- **Fix**: Replaced `fs.scope` with `fs.requireLiteralLeadingDot: false` in tauri.conf.json

### 5. `clipboard-manager` plugin doesn't accept config
- **Error**: `invalid type: map, expected unit`
- **Fix**: Removed `clipboard-manager` config section from plugins

## Existing Skeleton Assessment

The `packages/desktop-tauri` package contains a working skeleton with:

### Rust Backend (10 commands)
- `get_status` - Application status
- `load_config` / `save_config` - Configuration persistence
- `capture_screen` - Screen capture via `screenshots` crate
- `run_ocr` - OCR placeholder (Vision API pending)
- `get_clipboard` - Clipboard access
- `get_active_window` - Active window via osascript
- `chat` - AI chat placeholder
- `observe` - Observation pipeline placeholder
- `open_url` - Open URL in browser

### Frontend (React 19 + Tailwind + DaisyUI + Zustand)
- Full App.tsx with capture loop, settings modal, screenshot preview
- Zustand store with all state management
- Typed Tauri invoke wrappers (useTauri.ts)
- Framer Motion animations

### Plugins (4)
- `tauri-plugin-shell` - Shell commands
- `tauri-plugin-fs` - Filesystem access
- `tauri-plugin-dialog` - Native dialogs
- `tauri-plugin-clipboard-manager` - Clipboard

## Gap Analysis: Tauri vs Electron (Current)

The Electron version has ~65 IPC endpoints in preload.ts. The Tauri skeleton has 10 commands.

### Key Missing Features for Phase 1+
1. **WebGazer eye tracking** - Needs camera access, MediaPipe WASM
2. **Gaze overlay** - Full-screen transparent overlay window
3. **Global click handlers** - For calibration
4. **Menu bar panel** - Tray panel service
5. **AI integration** - Gemini/OpenAI HTTP client
6. **WebSocket sync** - Device sync server
7. **Auto-updater** - Tauri updater plugin
8. **Keyboard shortcuts** - Global hotkeys

## Recommendation

**Proceed to Phase 1**: The Tauri 2.0 skeleton is solid. The 97.6% binary size reduction alone justifies the migration. Next steps:

1. Expand Rust IPC commands to match Electron preload endpoints
2. Implement AI chat via HTTP client (reqwest)
3. Add macOS Vision API for OCR (via objc2 or swift-bridge)
4. Set up WebGazer camera access in WebView
5. Create overlay window for gaze visualization
