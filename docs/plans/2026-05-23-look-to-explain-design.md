# Look-to-Explain — MVP Design

**Status:** Approved (2026-05-23) · ready for implementation
**Author:** Claude + tom

## Summary

Add a feature to Shadow: user looks at any region of the screen, presses a
hotkey, Shadow captures that region, OCRs it, asks the configured AI provider
for an explanation, and pops a floating HTML card next to the gaze point.

Three modes via three hotkeys:

| Hotkey | Mode | Prompt purpose |
|---|---|---|
| `⌥E` | **Dictionary** | "What is this term/symbol/error?" — 1-2 sentence definition |
| `⌥⇧E` | **Troubleshoot** | "What's wrong + why + how to fix" — for errors/warnings |
| `⌥⌘E` | **Scene summary** | "What is this whole UI/screen?" — for orientation |

## Architecture

```
[user presses ⌥E]
        │
        ▼
 global-shortcut plugin (new) ── emits internal signal ──┐
                                                          ▼
                       frontend hook reads gazedEntity from zustand store
                                                          │
                                                          ▼
                       invoke('explain_gaze_target', { mode, x, y })
                                                          │
                                                          ▼ Rust
              perception::screen::capture_region(x±200, y±200)
                                                          │
                                                          ▼
                       perception::ocr::run_on_region(image)
                                                          │
                                                          ▼
              ai::provider().chat(prompts[mode] + ocr_text) → html_str
                                                          │
                                                          ▼
                       sink.emit("explain:ready", { html, anchor, mode })
                                                          │
            ┌─────────────────────────────────────────────┘
            ▼
  explain-overlay WebviewWindow listens, positions itself at anchor, renders html
```

## New code

### Rust (`packages/desktop-tauri/src-tauri/`)

| File | Change | Purpose |
|---|---|---|
| `Cargo.toml` | + `tauri-plugin-global-shortcut = "2"` | hotkey registration |
| `src/lib.rs` | register global-shortcut plugin + 3 hotkeys; create `explain-overlay` window on demand | wire-up |
| `src/events.rs` | + `EXPLAIN_READY: &str = "explain:ready"` | event name constant |
| `src/perception/screen.rs` | + `capture_region(rect: Rect) -> Vec<u8>` | sub-region screenshot |
| `src/perception/ocr.rs` | + `run_on_region_bytes(png: &[u8]) -> Result<String>` | OCR a pre-cropped image |
| `src/commands/explain_cmd.rs` *(new)* | `explain_gaze_target(mode, x, y)` end-to-end orchestrator | the single Tauri command |
| `src/ai/prompts/explain.rs` *(new)* | 3 prompt template constants in Chinese | mode-specific framing |

### Frontend (`packages/desktop-tauri/src/`)

| File | Change | Purpose |
|---|---|---|
| `explain-overlay/main.tsx` *(new entry)* | tiny React app — only renders `ExplainCard` | the popup webview |
| `explain-overlay/ExplainCard.tsx` *(new)* | dark card UI, dangerouslySetInnerHTML for AI HTML, close button | the card |
| `hooks/useExplain.ts` *(new)* | wraps `invoke('explain_gaze_target')` + listens `explain:ready` for main window side | main window side |
| `App.tsx` | call `useExplain()` once so hotkey-triggered events route correctly | wiring |
| `lib/explain-window.ts` *(new)* | helper: open/move/focus the explain-overlay window via Tauri WebviewWindow API | window management |

### Config

| File | Change |
|---|---|
| `tauri.conf.json` | add 2nd window: `label: "explain-overlay"`, `decorations: false`, `transparent: true`, `alwaysOnTop: true`, `skipTaskbar: true`, `visible: false`, `url: "/explain.html"` |
| `electron.vite.config.ts` *(actually `vite.config.ts`)* | multi-entry: `main` + `explain` |
| `index.html` (existing) — unchanged |
| `explain.html` *(new)* | tiny shell that loads `explain-overlay/main.tsx` |

## Capture-region strategy

- Use `gazedEntity.{x, y}` from zustand (already populated by `useWebGazer`/`useGazedEntity`).
- Crop a 400×400 px box centered on that point.
- On multi-display setups: trust macOS `CGDisplay` API to give global coords — same one `screen.rs` already uses for full screenshots.
- Retina handling: capture native pixels, no downscale.

## Card placement

`explain-overlay` window is created lazily on first use, then reused
(`window.set_position` + `window.show` each subsequent trigger).
Default position: `(gazeX + 20, gazeY + 20)`, with edge-flip if it would clip.

## Out of scope (V2+)

- Auto-trigger on gaze dwell (user explicitly rejected for MVP)
- History sidebar with "what you asked today" (V2)
- Click-through follow-up turn ("详细点 →" button is rendered but no-op for MVP)
- Privacy redaction (regex PII filter)
- Smart cropping via OCR text blocks
- Local LLM forcing (uses whatever the user's chat provider is)

## Risks

1. **`⌥E` / `⌥⇧E` conflict with macOS Option+letter dead-keys** (`´` etc.). May need to fall back to `Ctrl+E` family or expose hotkey config.
2. **WebGazer accuracy** (~50–100 px) plus crop margin means edge cases (tiny text near window border) will miss. MVP accepts.
3. **Tauri 2.0 multi-window in same app** — verified API exists; risk is in vite multi-entry config for the 2nd HTML.
4. **Shortcut firing while explain-overlay is focused** — must dedupe or it'll spawn nested calls.

## Success criteria

1. Press `⌥E` while looking at a word → within 3 seconds a card with a 1-sentence definition appears next to the gaze point.
2. Pressing again with a different gaze position closes/reopens the card at the new spot.
3. The 3 modes produce visibly different responses on the same target.
4. Cargo and pnpm dev both build clean (no warnings introduced).
