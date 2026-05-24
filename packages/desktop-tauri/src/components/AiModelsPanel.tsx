/**
 * AiModelsPanel — single management surface for every model in Hawkeye.
 *
 * Six sections, top to bottom by importance:
 *
 *   1. Chat Provider       — Gemini / OpenAI / Local LLM (provider switch
 *                            + per-provider config + validate button)
 *   2. Local Text LLMs     — GGUF registry: download / delete / select
 *   3. Speech Recognition  — Apple Speech (built-in) + Whisper.cpp models
 *   4. Vision OCR          — Apple Vision (built-in, info card)
 *   5. Face Tracking       — MediaPipe Face Mesh (bundled WASM, info card)
 *   6. Gaze Prediction     — WebGazer + ANE (embedded GazeTrainingPanel)
 *   7. Desktop Agent       — cua-driver binary status + start
 *
 * Saves go through `saveConfig` → file; activating a provider also
 * triggers `init_ai` so the validation result is reflected immediately.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useHawkeyeStore } from '../store';
import {
  type AgentStatus,
  type AppConfig,
  type DaemonInfo,
  type DownloadProgress,
  type LocalModel,
  type ModelInfo,
  type SpeechStatusInfo,
  deleteModel,
  downloadModel,
  getAgentStatus,
  getDaemonInfo,
  getRecommendedModels,
  initAi,
  listModels,
  saveConfig,
  speechStatus,
  startAgent,
} from '../hooks/useTauri';
import { GazeTrainingPanel } from './GazeTrainingPanel';

type ProviderId = 'gemini' | 'openai' | 'local';

const PROVIDER_LABELS: Record<ProviderId, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI Compatible',
  local: 'Local (llama.cpp)',
};

/** Tag pill (green ✓ / red ✗ / amber …) used in section headers. */
const StatusDot: React.FC<{ tone: 'ok' | 'warn' | 'err' | 'idle'; label?: string }> = ({
  tone,
  label,
}) => {
  const color = tone === 'ok' ? '#22c55e' : tone === 'warn' ? '#f59e0b' : tone === 'err' ? '#ef4444' : '#6b7280';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
      {label && <span style={{ color }}>{label}</span>}
    </span>
  );
};

const Section: React.FC<{
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, subtitle, right, children }) => (
  <div className="card">
    <div className="card-title flex items-center justify-between gap-2">
      <div>
        <div>{title}</div>
        {subtitle && (
          <div className="text-xs text-hawkeye-text-muted font-normal mt-0.5">{subtitle}</div>
        )}
      </div>
      {right}
    </div>
    <div className="card-content">{children}</div>
  </div>
);

const formatBytes = (n?: number): string => {
  if (!n) return '—';
  const mb = n / (1024 * 1024);
  if (mb > 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
};

export const AiModelsPanel: React.FC = () => {
  const config = useHawkeyeStore((s) => s.config);
  const setConfig = useHawkeyeStore((s) => s.setConfig);

  return (
    <div className="main-content" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <DaemonBanner />
      <ChatProviderSection config={config} setConfig={setConfig} />
      <LocalLlmSection config={config} setConfig={setConfig} />
      <SpeechSection config={config} setConfig={setConfig} />
      <VisionSection config={config} setConfig={setConfig} />
      <FaceMeshSection />
      <GazeSection />
      <AgentSection />
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────
// 0. Daemon banner (for programmers)
// ──────────────────────────────────────────────────────────────────────

const DaemonBanner: React.FC = () => {
  const [info, setInfo] = useState<DaemonInfo | null>(null);
  const [copied, setCopied] = useState<'token' | 'curl' | null>(null);

  useEffect(() => {
    getDaemonInfo().then(setInfo).catch(() => {});
    const t = window.setInterval(() => {
      getDaemonInfo().then(setInfo).catch(() => {});
    }, 5000);
    return () => window.clearInterval(t);
  }, []);

  if (!info) return null;

  const tone = info.running ? 'ok' : 'warn';
  const copy = (text: string, kind: 'token' | 'curl') => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1200);
    });
  };

  const curl = info.token
    ? `curl -H "Authorization: Bearer ${info.token}" ${info.url}/v1/status`
    : `curl ${info.url}/v1/health`;

  return (
    <Section
      title="hawkeyed (companion daemon)"
      subtitle={
        info.running
          ? 'Headless HTTP+SSE API for scripts, MCP, and external apps — see HAWKEYED.md'
          : 'Daemon not running — scripts/external tools won\'t be able to attach'
      }
      right={
        <StatusDot
          tone={tone}
          label={info.running ? (info.spawnedByGui ? 'Spawned' : 'Attached') : 'Off'}
        />
      }
    >
      <div className="space-y-1 text-xs">
        <Row k="URL" v={info.url} good={info.running} />
        <Row k="Port" v={String(info.port)} />
        <Row k="Spawned by GUI" v={info.spawnedByGui ? 'yes' : 'no — external'} />
        {info.token && (
          <div className="flex justify-between gap-2 items-center" style={{ marginTop: 4 }}>
            <span className="text-hawkeye-text-muted">Token</span>
            <code
              style={{
                fontSize: 11,
                cursor: 'pointer',
                padding: '2px 6px',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: 4,
                color: copied === 'token' ? '#86efac' : '#cbd5e1',
              }}
              onClick={() => copy(info.token ?? '', 'token')}
              title="Click to copy"
            >
              {copied === 'token' ? 'copied ✓' : `${info.token.slice(0, 16)}…`}
            </code>
          </div>
        )}
      </div>

      {info.running && (
        <div
          style={{
            marginTop: 10,
            padding: '8px 10px',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: 6,
            fontFamily: 'SF Mono, Menlo, monospace',
            fontSize: 11,
            color: copied === 'curl' ? '#86efac' : '#cbd5e1',
            cursor: 'pointer',
            overflowX: 'auto',
            whiteSpace: 'nowrap',
          }}
          onClick={() => copy(curl, 'curl')}
          title="Click to copy"
        >
          {copied === 'curl' ? '# copied to clipboard ✓' : `$ ${curl}`}
        </div>
      )}
    </Section>
  );
};

/**
 * Reusable "source" segmented control. Used by Speech/Vision sections to
 * let the user switch between local and cloud providers per category.
 */
const SourceSwitch: React.FC<{
  options: Array<{ id: string; label: string; hint?: string; disabled?: boolean }>;
  value: string;
  onChange: (id: string) => void;
}> = ({ options, value, onChange }) => (
  <div className="flex gap-2 mb-3 flex-wrap">
    {options.map((opt) => (
      <button
        key={opt.id}
        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        style={{
          background:
            value === opt.id ? 'rgba(245, 158, 11, 0.18)' : 'rgba(255, 255, 255, 0.04)',
          border: `1px solid ${value === opt.id ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.08)'}`,
          color: value === opt.id ? '#fef3c7' : 'var(--hawkeye-text-secondary, #aaa)',
          opacity: opt.disabled ? 0.5 : 1,
          cursor: opt.disabled ? 'not-allowed' : 'pointer',
        }}
        onClick={() => !opt.disabled && onChange(opt.id)}
        disabled={opt.disabled}
        title={opt.hint}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

// ──────────────────────────────────────────────────────────────────────
// 1. Chat Provider
// ──────────────────────────────────────────────────────────────────────

interface SectionProps {
  config: AppConfig | null;
  setConfig: (cfg: AppConfig) => void;
}

const ChatProviderSection: React.FC<SectionProps> = ({ config, setConfig }) => {
  const [draft, setDraft] = useState<AppConfig | null>(config);
  const [validating, setValidating] = useState(false);
  const [valid, setValid] = useState<null | { ok: boolean; msg: string }>(null);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  const provider = (draft?.aiProvider ?? 'gemini') as ProviderId;

  const update = (patch: Partial<AppConfig>) => {
    if (!draft) return;
    setDraft({ ...draft, ...patch });
    setValid(null);
  };

  const saveAndValidate = async () => {
    if (!draft) return;
    setValidating(true);
    setValid(null);
    try {
      await saveConfig(draft);
      setConfig(draft);
      const ok = await initAi();
      setValid(
        ok
          ? { ok: true, msg: 'Connected · provider is now active' }
          : { ok: false, msg: 'Could not initialize — check key/URL/model' },
      );
    } catch (e) {
      setValid({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setValidating(false);
    }
  };

  if (!draft) {
    return (
      <Section title="Chat Provider">
        <div className="text-xs text-hawkeye-text-muted">Loading config…</div>
      </Section>
    );
  }

  return (
    <Section
      title="Chat Provider"
      subtitle="Which AI answers your messages and powers gaze command chips"
      right={valid && <StatusDot tone={valid.ok ? 'ok' : 'err'} label={valid.ok ? 'OK' : 'Error'} />}
    >
      {/* Provider segmented control */}
      <div className="flex gap-2 mb-4">
        {(['gemini', 'openai', 'local'] as ProviderId[]).map((p) => (
          <button
            key={p}
            className="flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{
              background:
                provider === p
                  ? 'rgba(245, 158, 11, 0.18)'
                  : 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${provider === p ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.08)'}`,
              color: provider === p ? '#fef3c7' : 'var(--hawkeye-text-secondary, #aaa)',
            }}
            onClick={() => update({ aiProvider: p })}
          >
            {PROVIDER_LABELS[p]}
          </button>
        ))}
      </div>

      {provider === 'gemini' && (
        <div className="space-y-3">
          <Field label="API Key">
            <input
              type="password"
              className="form-input"
              value={draft.geminiApiKey ?? ''}
              onChange={(e) => update({ geminiApiKey: e.target.value })}
              placeholder="AIza…"
              autoComplete="off"
            />
          </Field>
          <Field label="Model">
            <input
              type="text"
              className="form-input"
              value={draft.geminiModel ?? ''}
              onChange={(e) => update({ geminiModel: e.target.value })}
              placeholder="gemini-2.5-flash-preview-05-20"
            />
          </Field>
          <Field
            label="Base URL"
            hint="Optional — leave blank for Google's default. Useful for self-hosted Gemini proxies."
          >
            <input
              type="text"
              className="form-input"
              value={draft.geminiBaseUrl ?? ''}
              onChange={(e) => update({ geminiBaseUrl: e.target.value || undefined })}
              placeholder="https://generativelanguage.googleapis.com/v1beta"
            />
          </Field>
        </div>
      )}

      {provider === 'openai' && (
        <div className="space-y-3">
          <Field label="Base URL" hint="Any OpenAI-compatible endpoint (OpenAI / DeepSeek / Moonshot / vLLM / Ollama)">
            <input
              type="text"
              className="form-input"
              value={draft.openaiBaseUrl ?? ''}
              onChange={(e) => update({ openaiBaseUrl: e.target.value || undefined })}
              placeholder="https://api.openai.com/v1"
            />
          </Field>
          <Field label="API Key">
            <input
              type="password"
              className="form-input"
              value={draft.openaiApiKey ?? ''}
              onChange={(e) => update({ openaiApiKey: e.target.value })}
              placeholder="sk-…"
              autoComplete="off"
            />
          </Field>
          <Field label="Model">
            <input
              type="text"
              className="form-input"
              value={draft.openaiModel ?? ''}
              onChange={(e) => update({ openaiModel: e.target.value })}
              placeholder="gpt-4o-mini"
            />
          </Field>
        </div>
      )}

      {provider === 'local' && (
        <div className="space-y-3">
          <Field
            label="Active GGUF model"
            hint="Pick a model from the Local LLMs section below (download first if it's not yet on disk)."
          >
            <input
              type="text"
              className="form-input"
              value={draft.localModelId ?? ''}
              onChange={(e) => update({ localModelId: e.target.value })}
              placeholder="qwen2.5-3b-q4"
            />
          </Field>
          <div className="text-xs text-hawkeye-text-muted">
            Local provider runs on Apple Metal — zero network, full privacy. Vision falls back to text-only.
          </div>
        </div>
      )}

      {/* Validate / save */}
      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-hawkeye-border">
        <button
          className="btn btn-primary text-xs"
          onClick={saveAndValidate}
          disabled={validating}
        >
          {validating ? 'Validating…' : 'Save & Activate'}
        </button>
        {valid && (
          <span
            className="text-xs"
            style={{ color: valid.ok ? '#22c55e' : '#ef4444' }}
          >
            {valid.msg}
          </span>
        )}
      </div>
    </Section>
  );
};

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({
  label,
  hint,
  children,
}) => (
  <div className="form-group">
    <label className="form-label">{label}</label>
    {children}
    {hint && (
      <div className="text-xs text-hawkeye-text-muted mt-1" style={{ lineHeight: 1.4 }}>
        {hint}
      </div>
    )}
  </div>
);

// ──────────────────────────────────────────────────────────────────────
// 2. Local Text LLMs (GGUF registry)
// ──────────────────────────────────────────────────────────────────────

const LocalLlmSection: React.FC<SectionProps> = ({ config, setConfig }) => {
  const [registry, setRegistry] = useState<ModelInfo[]>([]);
  const [downloaded, setDownloaded] = useState<LocalModel[]>([]);
  const [progress, setProgress] = useState<Record<string, DownloadProgress>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [r, l] = await Promise.all([getRecommendedModels(), listModels()]);
      setRegistry(r);
      setDownloaded(l);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live download progress
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<DownloadProgress>('model:download-progress', (e) => {
      setProgress((p) => ({ ...p, [e.payload.modelId]: e.payload }));
      if (e.payload.status === 'completed' || e.payload.status === 'failed') {
        setBusyId(null);
        refresh();
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [refresh]);

  const isDownloaded = (id: string) => downloaded.some((m) => m.id === id);

  const handleDownload = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await downloadModel(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this model file?')) return;
    try {
      await deleteModel(id);
      // If this was the active model, fall back to gemini.
      if (config?.localModelId === id) {
        const next: AppConfig = { ...config, localModelId: undefined };
        await saveConfig(next);
        setConfig(next);
      }
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSetActive = async (id: string) => {
    if (!config) return;
    const next: AppConfig = { ...config, aiProvider: 'local', localModelId: id };
    await saveConfig(next);
    setConfig(next);
    initAi().catch(() => {});
  };

  // Group by type for clarity
  const textLlms = useMemo(() => registry.filter((m) => m.modelType === 'text_llm'), [registry]);
  const whispers = useMemo(() => registry.filter((m) => m.modelType === 'whisper'), [registry]);

  return (
    <>
      <Section
        title="Local Text LLMs"
        subtitle="GGUF models that run offline via llama.cpp on Apple Metal"
        right={
          <StatusDot
            tone={downloaded.some((m) => m.modelType === 'text_llm') ? 'ok' : 'idle'}
            label={`${downloaded.filter((m) => m.modelType === 'text_llm').length} installed`}
          />
        }
      >
        {error && (
          <div className="text-xs mb-2" style={{ color: '#ef4444' }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {textLlms.map((m) => (
            <ModelRow
              key={m.id}
              model={m}
              installed={isDownloaded(m.id)}
              active={config?.aiProvider === 'local' && config?.localModelId === m.id}
              progress={progress[m.id]}
              busy={busyId === m.id}
              onDownload={() => handleDownload(m.id)}
              onDelete={() => handleDelete(m.id)}
              onActivate={() => handleSetActive(m.id)}
            />
          ))}
        </div>
      </Section>

      {/* Whisper goes under speech but registry lists it here — duplicate render below. */}
      <Section
        title="Whisper Speech Models"
        subtitle="GGML weights for whisper.cpp — high-accuracy transcription"
        right={
          <StatusDot
            tone={downloaded.some((m) => m.modelType === 'whisper') ? 'ok' : 'idle'}
            label={`${downloaded.filter((m) => m.modelType === 'whisper').length} installed`}
          />
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {whispers.map((m) => (
            <ModelRow
              key={m.id}
              model={m}
              installed={isDownloaded(m.id)}
              active={false}
              progress={progress[m.id]}
              busy={busyId === m.id}
              onDownload={() => handleDownload(m.id)}
              onDelete={() => handleDelete(m.id)}
              showActivate={false}
            />
          ))}
        </div>
      </Section>
    </>
  );
};

const ModelRow: React.FC<{
  model: ModelInfo;
  installed: boolean;
  active: boolean;
  progress?: DownloadProgress;
  busy?: boolean;
  showActivate?: boolean;
  onDownload: () => void;
  onDelete: () => void;
  onActivate?: () => void;
}> = ({ model, installed, active, progress, busy, showActivate = true, onDownload, onDelete, onActivate }) => {
  const pct = progress?.progress ? Math.round(progress.progress * 100) : 0;
  const downloading = progress?.status === 'downloading' || progress?.status === 'starting';
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 10,
        border: `1px solid ${active ? 'rgba(245,158,11,0.45)' : 'rgba(255,255,255,0.06)'}`,
        background: active ? 'rgba(245,158,11,0.07)' : 'rgba(255,255,255,0.02)',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{model.name}</span>
            {active && (
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(245,158,11,0.2)', color: '#fef3c7' }}
              >
                active
              </span>
            )}
            {installed && !active && (
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(34,197,94,0.18)', color: '#86efac' }}
              >
                installed
              </span>
            )}
          </div>
          <div className="text-xs text-hawkeye-text-muted mt-0.5" style={{ lineHeight: 1.4 }}>
            {model.description}
          </div>
          <div className="text-xs text-hawkeye-text-muted mt-1 font-mono">
            {formatBytes(model.sizeBytes)} · {model.filename}
          </div>
        </div>
        <div className="flex gap-1.5">
          {!installed && !downloading && (
            <button className="btn btn-primary text-xs" onClick={onDownload} disabled={busy}>
              Download
            </button>
          )}
          {installed && showActivate && !active && onActivate && (
            <button className="btn text-xs" onClick={onActivate}>
              Use
            </button>
          )}
          {installed && (
            <button
              className="btn text-xs"
              onClick={onDelete}
              style={{ color: '#fca5a5' }}
              title="Delete from disk"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {downloading && (
        <div className="mt-2">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-hawkeye-text-muted">{progress?.status}</span>
            <span className="font-mono">
              {pct}% · {formatBytes(progress?.downloadedBytes)} / {formatBytes(progress?.totalBytes)}
            </span>
          </div>
          <div className="w-full h-1.5 bg-hawkeye-surface rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: '#3b82f6' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────
// 3. Speech Recognition — pick source: Apple local / Whisper local / cloud
// ──────────────────────────────────────────────────────────────────────

type SpeechProvider = 'apple' | 'whisper' | 'openai' | 'gemini';

const SpeechSection: React.FC<SectionProps> = ({ config, setConfig }) => {
  const [appleStatus, setAppleStatus] = useState<SpeechStatusInfo | null>(null);
  const [whispers, setWhispers] = useState<LocalModel[]>([]);
  const [error, setError] = useState<string | null>(null);

  const provider = ((config?.speechProvider as SpeechProvider) ?? 'apple');

  useEffect(() => {
    speechStatus()
      .then(setAppleStatus)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    listModels()
      .then((all) => setWhispers(all.filter((m) => m.modelType === 'whisper')))
      .catch(() => {});
  }, []);

  const update = async (patch: Partial<AppConfig>) => {
    if (!config) return;
    const next: AppConfig = { ...config, ...patch };
    await saveConfig(next);
    setConfig(next);
  };

  // Status dot per provider
  const tone: 'ok' | 'warn' | 'err' | 'idle' =
    provider === 'apple'
      ? appleStatus?.available && appleStatus?.authorized
        ? 'ok'
        : appleStatus
        ? 'warn'
        : 'idle'
      : provider === 'whisper'
      ? whispers.length > 0
        ? 'ok'
        : 'warn'
      : provider === 'openai'
      ? config?.openaiApiKey
        ? 'ok'
        : 'warn'
      : config?.geminiApiKey
      ? 'ok'
      : 'warn';

  const toneLabel =
    tone === 'ok' ? 'Ready' : tone === 'warn' ? 'Needs setup' : 'Loading…';

  return (
    <Section
      title="Speech Recognition"
      subtitle="Choose a local on-device backend or a cloud API"
      right={<StatusDot tone={tone} label={toneLabel} />}
    >
      <SourceSwitch
        value={provider}
        onChange={(p) => update({ speechProvider: p })}
        options={[
          { id: 'apple', label: 'Apple Speech (local)', hint: 'macOS built-in, ANE-accelerated' },
          {
            id: 'whisper',
            label: 'Whisper.cpp (local)',
            hint: 'Download Whisper models in the Whisper section above',
          },
          { id: 'openai', label: 'OpenAI Whisper API', hint: 'Reuses your OpenAI key' },
          { id: 'gemini', label: 'Gemini Audio', hint: 'Reuses your Gemini key' },
        ]}
      />

      {error && (
        <div className="text-xs mb-2" style={{ color: '#ef4444' }}>
          {error}
        </div>
      )}

      {provider === 'apple' && appleStatus && (
        <div className="space-y-1 text-xs">
          <Row k="Available" v={appleStatus.available ? 'yes' : 'no'} good={appleStatus.available} />
          <Row k="Authorized" v={appleStatus.authorized ? 'yes' : 'no'} good={appleStatus.authorized} />
          <Row k="Locale" v={appleStatus.locale || '—'} />
          {!appleStatus.authorized && (
            <div className="text-xs text-hawkeye-text-muted mt-2" style={{ lineHeight: 1.4 }}>
              Grant Speech Recognition access in System Settings → Privacy &amp; Security → Speech Recognition.
            </div>
          )}
        </div>
      )}

      {provider === 'whisper' && (
        <div className="space-y-2 text-xs">
          {whispers.length === 0 ? (
            <div className="text-hawkeye-text-muted" style={{ lineHeight: 1.4 }}>
              No Whisper model installed. Scroll up to the &ldquo;Whisper Speech Models&rdquo; section and download one first.
            </div>
          ) : (
            <>
              <Field label="Active Whisper model">
                <select
                  className="form-input form-select"
                  value={config?.whisperModelId ?? whispers[0].id}
                  onChange={(e) => update({ whisperModelId: e.target.value })}
                >
                  {whispers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({formatBytes(m.sizeBytes)})
                    </option>
                  ))}
                </select>
              </Field>
              <div className="text-hawkeye-text-muted" style={{ lineHeight: 1.4 }}>
                Multi-language, fully offline, accuracy improves with model size.
              </div>
            </>
          )}
        </div>
      )}

      {provider === 'openai' && (
        <div className="text-xs space-y-1">
          <Row
            k="OpenAI key"
            v={config?.openaiApiKey ? 'configured' : 'missing'}
            good={!!config?.openaiApiKey}
          />
          <Row k="Endpoint" v="POST /audio/transcriptions (model: whisper-1)" />
          {!config?.openaiApiKey && (
            <div className="text-hawkeye-text-muted mt-2" style={{ lineHeight: 1.4 }}>
              Set the OpenAI API key in the Chat Provider section above to enable this.
            </div>
          )}
        </div>
      )}

      {provider === 'gemini' && (
        <div className="text-xs space-y-1">
          <Row
            k="Gemini key"
            v={config?.geminiApiKey ? 'configured' : 'missing'}
            good={!!config?.geminiApiKey}
          />
          <Row k="Input" v="multimodal — audio sent as part of generateContent" />
          {!config?.geminiApiKey && (
            <div className="text-hawkeye-text-muted mt-2" style={{ lineHeight: 1.4 }}>
              Set the Gemini API key in the Chat Provider section above to enable this.
            </div>
          )}
        </div>
      )}
    </Section>
  );
};

// ──────────────────────────────────────────────────────────────────────
// 4. Vision OCR / multimodal — pick source: Apple local / Gemini / OpenAI
// ──────────────────────────────────────────────────────────────────────

type VisionProvider = 'apple' | 'gemini' | 'openai';

const VisionSection: React.FC<SectionProps> = ({ config, setConfig }) => {
  const provider = ((config?.visionProvider as VisionProvider) ?? 'apple');

  const update = async (patch: Partial<AppConfig>) => {
    if (!config) return;
    const next: AppConfig = { ...config, ...patch };
    await saveConfig(next);
    setConfig(next);
  };

  const tone: 'ok' | 'warn' | 'err' | 'idle' =
    provider === 'apple'
      ? 'ok'
      : provider === 'gemini'
      ? config?.geminiApiKey
        ? 'ok'
        : 'warn'
      : config?.openaiApiKey
      ? 'ok'
      : 'warn';

  return (
    <Section
      title="Vision / OCR"
      subtitle="What looks at the screen — bbox OCR locally or rich multimodal in the cloud"
      right={<StatusDot tone={tone} label={tone === 'ok' ? 'Ready' : 'Needs key'} />}
    >
      <SourceSwitch
        value={provider}
        onChange={(p) => update({ visionProvider: p })}
        options={[
          {
            id: 'apple',
            label: 'Apple Vision OCR (local)',
            hint: 'Fast, free, returns bbox — best for gaze→entity hit-testing',
          },
          { id: 'gemini', label: 'Gemini Vision (cloud)', hint: 'Multimodal understanding, not just OCR' },
          { id: 'openai', label: 'GPT-4o Vision (cloud)', hint: 'Rich captioning + reasoning' },
        ]}
      />

      {provider === 'apple' && (
        <div className="space-y-1 text-xs">
          <Row k="Backend" v="VNRecognizeTextRequest" />
          <Row k="Recognition level" v=".accurate" />
          <Row k="Languages" v="en, zh-Hans, zh-Hant, ja, ko, de, fr, es, pt, it" />
          <Row k="Output" v="text + per-region bbox + confidence" good />
          <Row k="Network" v="none (fully offline)" good />
          <div className="text-hawkeye-text-muted mt-2" style={{ lineHeight: 1.4 }}>
            Drives the gaze→entity hit-testing in the Gaze tab. Cloud providers don&apos;t produce bboxes — keep Apple here unless you need scene-level understanding.
          </div>
        </div>
      )}

      {provider === 'gemini' && (
        <div className="space-y-1 text-xs">
          <Row
            k="Gemini key"
            v={config?.geminiApiKey ? 'configured' : 'missing'}
            good={!!config?.geminiApiKey}
          />
          <Row k="Model" v={config?.geminiModel || 'gemini-2.5-flash-preview-05-20'} />
          <Row k="Uses" v="chat_with_vision() — frame screenshots go straight to the model" />
          {!config?.geminiApiKey && (
            <div className="text-hawkeye-text-muted mt-2" style={{ lineHeight: 1.4 }}>
              Set the Gemini API key in the Chat Provider section above.
            </div>
          )}
        </div>
      )}

      {provider === 'openai' && (
        <div className="space-y-1 text-xs">
          <Row
            k="OpenAI key"
            v={config?.openaiApiKey ? 'configured' : 'missing'}
            good={!!config?.openaiApiKey}
          />
          <Row k="Model" v={config?.openaiModel || 'gpt-4o-mini'} />
          <Row k="Endpoint" v={config?.openaiBaseUrl || 'https://api.openai.com/v1'} />
          {!config?.openaiApiKey && (
            <div className="text-hawkeye-text-muted mt-2" style={{ lineHeight: 1.4 }}>
              Set the OpenAI API key in the Chat Provider section above.
            </div>
          )}
        </div>
      )}
    </Section>
  );
};

// ──────────────────────────────────────────────────────────────────────
// 5. Face Mesh (MediaPipe — info card)
// ──────────────────────────────────────────────────────────────────────

const FaceMeshSection: React.FC = () => (
  <Section
    title="MediaPipe Face Mesh (bundled)"
    subtitle="468-landmark face mesh → 40-dim eye features for the gaze model"
    right={<StatusDot tone="ok" label="WASM" />}
  >
    <div className="space-y-1 text-xs">
      <Row k="Vendor" v="Google MediaPipe" />
      <Row k="Format" v="WebAssembly + WebGL" />
      <Row k="Location" v="/public/mediapipe/face_mesh" />
      <Row k="Landmarks" v="468 total · 20 used for eyes (10/eye)" />
      <Row k="Network" v="none (bundled in app)" good />
    </div>
  </Section>
);

// ──────────────────────────────────────────────────────────────────────
// 6. Gaze Prediction (delegates to existing panel)
// ──────────────────────────────────────────────────────────────────────

const GazeSection: React.FC = () => (
  <Section
    title="Gaze Prediction"
    subtitle="WebGazer ridge baseline + your custom-trained ANE MLP (40 → 128 → 64 → 2)"
  >
    <div style={{ margin: -8 }}>
      <GazeTrainingPanel />
    </div>
  </Section>
);

// ──────────────────────────────────────────────────────────────────────
// 7. Desktop Agent (cua-driver)
// ──────────────────────────────────────────────────────────────────────

const AgentSection: React.FC = () => {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getAgentStatus());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleStart = async () => {
    setBusy(true);
    setError(null);
    try {
      await startAgent();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const tone: 'ok' | 'warn' | 'err' | 'idle' = !status
    ? 'idle'
    : !status.binaryInstalled
    ? 'err'
    : status.daemonRunning
    ? 'ok'
    : 'warn';

  return (
    <Section
      title="Desktop Agent (cua-driver)"
      subtitle="External tool-use binary that lets the LLM control mouse / keyboard / screen"
      right={
        status ? (
          <StatusDot
            tone={tone}
            label={
              !status.binaryInstalled
                ? 'Not installed'
                : status.daemonRunning
                ? 'Running'
                : 'Stopped'
            }
          />
        ) : (
          <StatusDot tone="idle" label="checking…" />
        )
      }
    >
      {error && (
        <div className="text-xs mb-2" style={{ color: '#ef4444' }}>
          {error}
        </div>
      )}
      {status && (
        <div className="space-y-1 text-xs">
          <Row k="Binary installed" v={status.binaryInstalled ? 'yes' : 'no'} good={status.binaryInstalled} />
          {status.binaryPath && <Row k="Path" v={status.binaryPath} />}
          <Row k="Daemon running" v={status.daemonRunning ? 'yes' : 'no'} good={status.daemonRunning} />
          <Row k="Socket" v={status.socketPath} />
        </div>
      )}
      {status && status.binaryInstalled && !status.daemonRunning && (
        <button className="btn btn-primary text-xs mt-3" onClick={handleStart} disabled={busy}>
          {busy ? 'Starting…' : 'Start Daemon'}
        </button>
      )}
      {status && !status.binaryInstalled && (
        <div className="text-xs text-hawkeye-text-muted mt-2" style={{ lineHeight: 1.4 }}>
          Install:{' '}
          <code style={{ fontSize: 11 }}>
            /bin/bash -c &quot;$(curl -fsSL https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh)&quot;
          </code>
        </div>
      )}
    </Section>
  );
};

const Row: React.FC<{ k: string; v: string; good?: boolean }> = ({ k, v, good }) => (
  <div className="flex justify-between gap-2">
    <span className="text-hawkeye-text-muted">{k}</span>
    <span
      className="font-mono text-right"
      style={{
        color: good === true ? '#86efac' : good === false ? '#fca5a5' : undefined,
        wordBreak: 'break-all',
      }}
    >
      {v}
    </span>
  </div>
);

export default AiModelsPanel;
