#!/usr/bin/env node
/**
 * Hawkeye-specific knowledge-graph builder.
 *
 * Emits a `knowledge-graph.json` compatible with the Understand-Anything
 * dashboard schema, focused on the things a generic analyzer misses:
 *   - Tauri commands (Rust `#[tauri::command]`)  ↔  TS `invoke(...)`
 *   - Event constants (Rust `events::NAME`)      ↔  TS `useTauriEvent / listen(...)`
 *
 * Output: ../.understand/knowledge-graph.json
 *
 * Run: node packages/desktop-tauri/scripts/build-graph.mjs
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');
const TAURI_PKG = join(REPO_ROOT, 'packages/desktop-tauri');
const RUST_ROOT = join(TAURI_PKG, 'src-tauri/src');
const TS_ROOT = join(TAURI_PKG, 'src');
const SWIFT_DIRS = ['swift-ocr/Sources', 'swift-ane/Sources'].map(p => join(TAURI_PKG, 'src-tauri', p));
// Dashboard expects `.understand-anything/` at the project root it points GRAPH_DIR at.
const OUT_DIR = join(REPO_ROOT, '.understand-anything');
const OUT_FILE = join(OUT_DIR, 'knowledge-graph.json');

// ─── file walking ───────────────────────────────────────────────────────────
function walk(dir, exts) {
  const out = [];
  if (!safeStat(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules' || entry === 'target' || entry === 'dist') continue;
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p, exts));
    else if (exts.some(e => entry.endsWith(e))) out.push(p);
  }
  return out;
}
function safeStat(p) { try { return statSync(p); } catch { return null; } }

const rustFiles = walk(RUST_ROOT, ['.rs']);
const tsFiles = walk(TS_ROOT, ['.ts', '.tsx']).filter(p => !p.endsWith('.d.ts'));
const swiftFiles = SWIFT_DIRS.flatMap(d => walk(d, ['.swift']));

console.error(`[scan] ${rustFiles.length} Rust, ${tsFiles.length} TS/TSX, ${swiftFiles.length} Swift`);

// ─── extractors ─────────────────────────────────────────────────────────────
const RE_TAURI_COMMAND = /#\[(?:tauri::)?command\][^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*(?:pub\s+)?(?:async\s+)?fn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
const RE_EVENT_CONST = /pub\s+const\s+([A-Z][A-Z0-9_]*)\s*:\s*&str\s*=\s*"([^"]+)"/g;
const RE_INVOKE = /invoke\s*[<(]\s*(?:[^>]+>\s*\()?\s*['"`]([a-z_][a-z0-9_]*)['"`]/g;
const RE_LISTEN = /(?:useTauriEvent|listen)\s*[<(](?:[^>]+>\s*\()?\s*['"`]([a-z][a-z0-9_:-]*)['"`]/g;
const RE_RUST_USE_CRATE = /use\s+crate::([a-zA-Z_][a-zA-Z0-9_:]*)/g;
const RE_TS_IMPORT_LOCAL = /from\s+['"`](\.\.?\/[^'"`]+)['"`]/g;
const RE_RUST_EMIT_EVENT = /(?:app|sink|self\.sink|window)\.emit\s*\(\s*(?:events::)?([A-Z][A-Z0-9_]*)/g;

const findAll = (re, content) => {
  const out = [];
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(content)) !== null) {
    out.push({ match: m, line: content.slice(0, m.index).split('\n').length });
  }
  return out;
};

// ─── pass 1: file index + per-file extraction ───────────────────────────────
const fileIndex = new Map(); // absPath → { rel, lang, content, fn[], emits[], imports[] }
const eventConsts = new Map(); // CONST_NAME → "event:name"
const tauriCommands = new Map(); // fn_name → { filePath, line, rel }

for (const p of rustFiles) {
  const content = readFileSync(p, 'utf8');
  const rel = relative(REPO_ROOT, p);
  const fns = [];
  for (const { match, line } of findAll(RE_TAURI_COMMAND, content)) {
    const name = match[1];
    fns.push({ name, line });
    tauriCommands.set(name, { file: p, rel, line });
  }
  const emits = [];
  for (const { match, line } of findAll(RE_RUST_EMIT_EVENT, content)) {
    emits.push({ constName: match[1], line });
  }
  fileIndex.set(p, { rel, lang: 'rust', content, fns, emits });
  // event constants (only events.rs typically, but scan all)
  for (const { match } of findAll(RE_EVENT_CONST, content)) {
    eventConsts.set(match[1], match[2]);
  }
}

for (const p of tsFiles) {
  const content = readFileSync(p, 'utf8');
  const rel = relative(REPO_ROOT, p);
  const invokes = [];
  for (const { match, line } of findAll(RE_INVOKE, content)) {
    invokes.push({ command: match[1], line });
  }
  const listens = [];
  for (const { match, line } of findAll(RE_LISTEN, content)) {
    listens.push({ eventName: match[1], line });
  }
  const tsImports = [];
  for (const { match } of findAll(RE_TS_IMPORT_LOCAL, content)) {
    tsImports.push(match[1]);
  }
  fileIndex.set(p, { rel, lang: 'typescript', content, invokes, listens, tsImports });
}

for (const p of swiftFiles) {
  const content = readFileSync(p, 'utf8');
  const rel = relative(REPO_ROOT, p);
  fileIndex.set(p, { rel, lang: 'swift', content });
}

console.error(`[scan] ${tauriCommands.size} Tauri commands, ${eventConsts.size} event constants`);

// ─── pass 2: assemble nodes + edges ─────────────────────────────────────────
const nodes = [];
const edges = [];
const nodeIds = new Set();
const pushNode = (n) => { if (!nodeIds.has(n.id)) { nodes.push(n); nodeIds.add(n.id); } };
const pushEdge = (e) => edges.push({ direction: 'forward', weight: 0.7, ...e });

// File nodes
for (const [p, info] of fileIndex) {
  const name = basename(p);
  const tags = [info.lang];
  if (info.rel.includes('/commands/')) tags.push('tauri-command');
  if (info.rel.includes('/hooks/')) tags.push('hook');
  if (info.rel.includes('/components/')) tags.push('component');
  if (info.lang === 'rust' && info.fns?.length) tags.push('has-tauri-commands');
  const summary = makeFileSummary(info);
  pushNode({
    id: `file:${info.rel}`,
    type: 'file',
    name,
    filePath: info.rel,
    summary,
    tags,
    complexity: info.content.split('\n').length > 300 ? 'complex' : info.content.split('\n').length > 80 ? 'moderate' : 'simple',
  });
}

// Event constant nodes — one node per event
for (const [constName, eventName] of eventConsts) {
  pushNode({
    id: `concept:event:${eventName}`,
    type: 'concept',
    name: eventName,
    summary: `Tauri event "${eventName}" (Rust constant: ${constName}). Emitted from backend, listened by frontend.`,
    tags: ['tauri-event', eventName.split(':')[0]],
    complexity: 'simple',
  });
}

// Tauri command function nodes (Rust side) + contains edge from file
for (const [fnName, info] of tauriCommands) {
  const fileNodeId = `file:${info.rel}`;
  const fnNodeId = `function:${info.rel}:${fnName}`;
  pushNode({
    id: fnNodeId,
    type: 'function',
    name: fnName,
    filePath: info.rel,
    lineRange: [info.line, info.line],
    summary: `Tauri command \`${fnName}\` — exposed to frontend via invoke('${fnName}').`,
    tags: ['tauri-command', 'rust', 'ipc-endpoint'],
    complexity: 'simple',
  });
  pushEdge({ source: fileNodeId, target: fnNodeId, type: 'contains', weight: 1.0 });
}

// Cross-language edges: TS invoke → Rust command
let invokeEdgeCount = 0;
for (const [p, info] of fileIndex) {
  if (info.lang !== 'typescript') continue;
  for (const { command, line } of info.invokes ?? []) {
    const cmd = tauriCommands.get(command);
    if (!cmd) continue;
    pushEdge({
      source: `file:${info.rel}`,
      target: `function:${cmd.rel}:${command}`,
      type: 'calls',
      description: `invoke('${command}') at line ${line}`,
      weight: 0.9,
    });
    invokeEdgeCount++;
  }
}

// Cross-language edges: Rust emit → event concept, TS listen → event concept
let publishCount = 0, subscribeCount = 0;
const eventConstByName = new Map([...eventConsts.entries()].map(([k, v]) => [k, v]));
for (const [p, info] of fileIndex) {
  if (info.lang === 'rust') {
    for (const { constName, line } of info.emits ?? []) {
      const ev = eventConstByName.get(constName);
      if (!ev) continue;
      pushEdge({
        source: `file:${info.rel}`,
        target: `concept:event:${ev}`,
        type: 'publishes',
        description: `emit(events::${constName}) at line ${line}`,
        weight: 0.8,
      });
      publishCount++;
    }
  }
  if (info.lang === 'typescript') {
    for (const { eventName, line } of info.listens ?? []) {
      const eventConceptId = `concept:event:${eventName}`;
      if (!nodeIds.has(eventConceptId)) {
        // unknown event — still record as orphan concept for visibility
        pushNode({
          id: eventConceptId,
          type: 'concept',
          name: eventName,
          summary: `Tauri event "${eventName}" (no matching const in events.rs).`,
          tags: ['tauri-event', 'orphan-listener'],
          complexity: 'simple',
        });
      }
      pushEdge({
        source: `file:${info.rel}`,
        target: eventConceptId,
        type: 'subscribes',
        description: `useTauriEvent('${eventName}') at line ${line}`,
        weight: 0.8,
      });
      subscribeCount++;
    }
  }
}

// TS-to-TS import edges (only local relative imports)
for (const [p, info] of fileIndex) {
  if (info.lang !== 'typescript') continue;
  const fromDir = dirname(p);
  for (const imp of info.tsImports ?? []) {
    const resolved = resolveTsImport(fromDir, imp);
    if (resolved && fileIndex.has(resolved)) {
      pushEdge({
        source: `file:${info.rel}`,
        target: `file:${fileIndex.get(resolved).rel}`,
        type: 'imports',
        weight: 0.5,
      });
    }
  }
}

// Rust mod / use crate:: edges — coarse, just to show module containment
for (const [p, info] of fileIndex) {
  if (info.lang !== 'rust') continue;
  for (const { match } of findAll(RE_RUST_USE_CRATE, info.content)) {
    const targetMod = match[1].split('::')[0]; // first segment
    const candidate = [...fileIndex.keys()].find(k =>
      fileIndex.get(k).lang === 'rust' &&
      (fileIndex.get(k).rel.endsWith(`/${targetMod}/mod.rs`) ||
       fileIndex.get(k).rel.endsWith(`/${targetMod}.rs`))
    );
    if (candidate && candidate !== p) {
      pushEdge({
        source: `file:${info.rel}`,
        target: `file:${fileIndex.get(candidate).rel}`,
        type: 'imports',
        weight: 0.4,
      });
    }
  }
}

// ─── layers ─────────────────────────────────────────────────────────────────
const layers = buildLayers();

// ─── project meta + tour ────────────────────────────────────────────────────
let gitHash = '';
try { gitHash = execSync('git rev-parse HEAD', { cwd: REPO_ROOT }).toString().trim(); } catch {}

const graph = {
  version: '1.0.0',
  project: {
    name: 'hawkeye-desktop-tauri',
    languages: ['rust', 'typescript', 'swift'],
    frameworks: ['Tauri 2.0', 'React 19', 'tokio', 'zustand', 'Vite'],
    description: `Hawkeye (Tauri) — Rust backend + React frontend + Swift CLI binaries. Generated by build-graph.mjs.`,
    analyzedAt: new Date().toISOString(),
    gitCommitHash: gitHash,
  },
  nodes,
  edges,
  layers,
  tour: buildTour(),
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(graph, null, 2));
console.error(`[ok] wrote ${nodes.length} nodes, ${edges.length} edges → ${relative(REPO_ROOT, OUT_FILE)}`);
console.error(`     cross-lang edges: invoke=${invokeEdgeCount}, publish=${publishCount}, subscribe=${subscribeCount}`);

// ─── helpers ────────────────────────────────────────────────────────────────
function makeFileSummary(info) {
  if (info.lang === 'rust') {
    if (info.fns?.length) return `Rust module with ${info.fns.length} Tauri command(s): ${info.fns.map(f => f.name).slice(0,4).join(', ')}.`;
    if (info.rel.endsWith('events.rs')) return `Central registry of Tauri event name constants (backend → frontend).`;
    if (info.rel.endsWith('lib.rs')) return `Tauri app entry point — sets up plugins, AppState, tray, observe loop, daemon, and the generate_handler![] command registry.`;
    if (info.rel.endsWith('state.rs')) return `Shared AppState (Arc<AppState>) with RwLock fields, managed by Tauri and accessed by every command.`;
    return `Rust module under ${info.rel.split('/').slice(2, -1).join('/')}.`;
  }
  if (info.lang === 'typescript') {
    const calls = info.invokes?.length ?? 0;
    const listens = info.listens?.length ?? 0;
    const parts = [];
    if (calls) parts.push(`${calls} invoke() call(s)`);
    if (listens) parts.push(`${listens} event listener(s)`);
    if (info.rel.endsWith('useTauri.ts')) return `Centralized typed wrapper around every Tauri invoke() call in Hawkeye. Single source of truth for IPC commands.`;
    if (info.rel.endsWith('useEvents.ts')) return `Generic useTauriEvent hook — wraps Tauri listen() with auto-cleanup and ref-stable handler.`;
    if (info.rel.endsWith('App.tsx')) return `Root React component. Wires up event listeners, gaze overlay, observe panel, life-tree, chat.`;
    return parts.length ? `TS file with ${parts.join(', ')}.` : `TS module.`;
  }
  if (info.lang === 'swift') return `Swift CLI binary source (compiled by build.rs, invoked from Rust as a subprocess).`;
  return '';
}

function resolveTsImport(fromDir, importPath) {
  const base = join(fromDir, importPath);
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const candidate = base + ext;
    if (fileIndex.has(candidate)) return candidate;
  }
  return null;
}

function buildLayers() {
  const layerMap = new Map(); // id → { name, description, nodeIds[] }
  const add = (id, name, description, nodeId) => {
    if (!layerMap.has(id)) layerMap.set(id, { id, name, description, nodeIds: [] });
    layerMap.get(id).nodeIds.push(nodeId);
  };
  for (const n of nodes) {
    if (n.type !== 'file') continue;
    const p = n.filePath;
    if (!p) continue;
    const tauriRel = p.replace(/^packages\/desktop-tauri\//, '');
    if (tauriRel.startsWith('src-tauri/src/')) {
      const seg = tauriRel.split('/')[2] ?? 'misc';
      // Top-level module → domain layer
      const domain = seg.replace(/\.rs$/, '');
      add(`layer:rust-${domain}`, `Backend · ${domain}`, `Rust modules under src-tauri/src/${domain}`, n.id);
    } else if (tauriRel.startsWith('src/')) {
      const seg = tauriRel.split('/')[1] ?? 'misc';
      add(`layer:ts-${seg}`, `Frontend · ${seg}`, `TS/TSX under src/${seg}`, n.id);
    } else if (tauriRel.includes('swift-')) {
      add(`layer:swift`, `Native · Swift CLIs`, `Swift binaries compiled by build.rs (OCR, ANE, etc.)`, n.id);
    }
  }
  // Event concepts grouped together
  const evNodes = nodes.filter(n => n.id.startsWith('concept:event:')).map(n => n.id);
  if (evNodes.length) layerMap.set('layer:events', { id: 'layer:events', name: 'IPC · Tauri Events', description: 'Backend → frontend event channels', nodeIds: evNodes });
  // Tauri command functions
  const cmdNodes = nodes.filter(n => n.type === 'function' && n.tags?.includes('tauri-command')).map(n => n.id);
  if (cmdNodes.length) layerMap.set('layer:commands', { id: 'layer:commands', name: 'IPC · Tauri Commands', description: 'Rust functions exposed via invoke()', nodeIds: cmdNodes });
  return [...layerMap.values()];
}

function buildTour() {
  // Hand-curated end-to-end flow: observe loop
  const find = (predicate) => nodes.find(predicate)?.id;
  const obsLoop = find(n => n.filePath?.endsWith('observe/loop_runner.rs'));
  const ocr = find(n => n.filePath?.endsWith('perception/ocr.rs'));
  const swiftOcr = find(n => n.filePath?.includes('swift-ocr'));
  const events = find(n => n.filePath?.endsWith('events.rs'));
  const evObsUpdate = find(n => n.id === 'concept:event:observe:update');
  const useEvents = find(n => n.filePath?.endsWith('hooks/useEvents.ts'));
  const app = find(n => n.filePath?.endsWith('src/App.tsx'));
  const useTauri = find(n => n.filePath?.endsWith('hooks/useTauri.ts'));
  const lib = find(n => n.filePath?.endsWith('src-tauri/src/lib.rs'));
  const steps = [];
  let order = 1;
  const step = (title, description, nodeIds) => {
    if (nodeIds.filter(Boolean).length) steps.push({ order: order++, title, description, nodeIds: nodeIds.filter(Boolean) });
  };
  step('🎬 入口 — Tauri 应用启动', 'lib.rs 注册插件、AppState、托盘菜单，以及把 ~95 个 Rust 命令注册到 generate_handler![]。', [lib]);
  step('📸 观察循环 — 心跳', 'observe/loop_runner.rs 每 N 秒触发：截屏 → OCR → 哈希对比 → 发事件。这是整个 app 的主循环。', [obsLoop]);
  step('👁 OCR — Rust 调 Swift', 'perception/ocr.rs 把截图丢给 swift-ocr 子进程，Swift 用 macOS Vision API 识别文字。HAWKEYE_OCR_PATH 由 build.rs 注入。', [ocr, swiftOcr]);
  step('📡 事件常量表', 'events.rs 是所有后端→前端事件名的唯一来源（observe:update / gaze:entity-changed / agent:confirm-needed 等）。', [events]);
  step('🔔 一个具体事件 — observe:update', '后端通过 sink.emit() 发送，前端通过 useTauriEvent 订阅。看这个节点周围的边就能追到所有发布/订阅方。', [evObsUpdate]);
  step('🪝 前端监听 hook', 'useEvents.ts 的 useTauriEvent 是前端唯一的事件订阅入口（包了 listen + 自动清理 + ref-stable handler）。', [useEvents]);
  step('🧭 前端根组件', 'App.tsx 装配各个 panel，监听关键事件（gaze:entity-changed, observe:update），把数据塞进 zustand store。', [app]);
  step('☎️ 前端调后端的总入口', 'useTauri.ts 是整个项目里唯一调 invoke() 的文件 — 所有跨语言命令调用都从这里发起。', [useTauri]);
  return steps;
}
