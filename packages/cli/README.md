# @hawkeye/cli

A standalone command-line interface to the Hawkeye Core engine.

## Install (within the monorepo)

```bash
cd packages/cli
pnpm install
pnpm build
node dist/main.js --help
```

The `dist/main.js` file is a shebanged ESM bundle, so you can also do:

```bash
chmod +x dist/main.js
./dist/main.js --help
```

If you publish or `npm link` the package, the `hawkeye` binary will be on PATH.

## Setup

```bash
hawkeye init
```

That writes a starter config to `~/.config/hawkeye/cli.json` and creates the data
directory at `~/.hawkeye/`. Edit the config to set your API key, or export one of:

- `GEMINI_API_KEY` (or `GOOGLE_API_KEY`)
- `OPENAI_API_KEY`
- `HAWKEYE_DATA_DIR` (overrides storage path)
- `HAWKEYE_CONFIG` (overrides config path)

Resolution order (highest priority first): CLI args → env vars → config file → built-in defaults.

## Commands

| Command | Description |
|---------|-------------|
| `hawkeye init [--force]` | Write starter config + create data dir |
| `hawkeye perceive [--json]` | Capture screen, recognize intents |
| `hawkeye plan <intentFile> [--json]` | Generate plan for a stored UserIntent (use `-` for stdin) |
| `hawkeye execute <planFile> [--json]` | Run a previously generated plan |
| `hawkeye run "<task>" [--json]` | End-to-end: perceive → plan → execute |
| `hawkeye chat "<message>" [--json]` | One-turn chat against the configured AI provider |
| `hawkeye daemon [--interval=3000]` | Long-running observe loop, NDJSON output to stdout |

The `--json` global flag switches output to NDJSON (one JSON value per line on
stdout, errors on stderr). Without it, output is colored/pretty.

## Examples

```bash
# Quick chat
hawkeye chat "summarize the OAuth 2.0 device flow"

# One-shot capture, intents to JSON for later:
hawkeye perceive --json > intents.json

# Pipe an intent into plan:
jq '.value[0]' intents.json | hawkeye plan -

# End-to-end:
hawkeye run "rename the screenshots in ~/Desktop to today's date"
```

## Known limitations

- The CLI runs `@hawkeye/core` directly, which depends on native modules
  (`better-sqlite3`, `screenshot-desktop`, etc.). You need the same Node
  version that built core's native bindings.
- Most subcommands require an AI API key. `init`, `--version`, and `--help`
  do not.
- `perceive`/`run` capture the screen on macOS — grant screen-recording
  permission to your terminal first.
- `daemon` falls back to interval polling because @hawkeye/core does not yet
  expose a dedicated `observation` event.

## Architecture

```
src/
  main.ts            # commander setup, dispatch
  config.ts          # CliConfig + 3-layer merge + buildHawkeyeConfig()
  output.ts          # pretty / json output modes
  commands/
    init.ts
    perceive.ts
    plan.ts
    execute.ts
    run.ts
    chat.ts
    daemon.ts
```

Zero changes are made to `@hawkeye/core`. The CLI translates a small `CliConfig`
into the full `HawkeyeConfig` and consumes the same public API as
`@hawkeye/desktop` and `@hawkeye/desktop-tauri`.
