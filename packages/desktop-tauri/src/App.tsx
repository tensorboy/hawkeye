import { useEffect, useCallback, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { motion, AnimatePresence } from 'framer-motion';
import { useHawkeyeStore } from './store';
import { ChatPanel } from './components/ChatPanel';
import { ObservePanel } from './components/ObservePanel';
import { GazeOverlay } from './components/GazeOverlay';
import { GesturePanel } from './components/GesturePanel';
import { DebugTimeline } from './components/DebugTimeline';
import { LifeTreePanel } from './components/LifeTreePanel';
import { GazeTrainingPanel } from './components/GazeTrainingPanel';
import { AiModelsPanel } from './components/AiModelsPanel';
import { AgentConfirmModal } from './components/AgentConfirmModal';
import { useTauriEvent } from './hooks/useEvents';
import { useExplain } from './hooks/useExplain';
import {
  getStatus,
  captureScreen,
  runOcr,
  getActiveWindow,
  loadConfig,
  saveConfig,
  initAi,
  type AppConfig,
  type GazedEntity,
  type ObservationResult,
} from './hooks/useTauri';

type TabId = 'status' | 'chat' | 'models' | 'observe' | 'gaze' | 'gesture' | 'life-tree' | 'debug';

const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const slideUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 20 },
};

const springTransition = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
};

function App() {
  const {
    isRunning,
    status,
    config,
    lastScreenshot,
    lastOcr,
    activeWindow,
    showSettings,
    showScreenshotPreview,
    ocrRegions,
    screenshotDims,
    gazedEntity,
    gazeChipResult,
    setIsRunning,
    setStatus,
    setConfig,
    setLastScreenshot,
    setLastOcr,
    setActiveWindow,
    setShowSettings,
    setShowScreenshotPreview,
    setOcrRegions,
    setScreenshotDims,
    setGazedEntity,
    setGazeChipResult,
  } = useHawkeyeStore();

  const [activeTab, setActiveTab] = useState<TabId>('status');
  const [captureInterval, setCaptureInterval] = useState<number | null>(null);

  // Mirror Rust's gaze:entity-changed / -cleared events into the store so
  // any panel can react to "what is the user looking at right now".
  useTauriEvent<GazedEntity>('gaze:entity-changed', (e) => setGazedEntity(e));
  useTauriEvent<null>('gaze:entity-cleared', () => setGazedEntity(null));

  // Look-to-Explain: bridges Tauri global-shortcut → daemon /v1/explain → overlay window.
  // Mount once; hook handles all 3 hotkey modes (⌥E / ⌥⇧E / ⌥⌘E).
  useExplain();

  // The observe loop emits regions + screenshot dims. Capture them so
  // GazeOverlay can hit-test gaze against them without re-running OCR.
  useTauriEvent<ObservationResult>('observe:update', (obs) => {
    if (obs.ocrRegions) setOcrRegions(obs.ocrRegions);
    if (obs.screenshotWidth && obs.screenshotHeight) {
      setScreenshotDims({ width: obs.screenshotWidth, height: obs.screenshotHeight });
    }
    if (obs.activeWindow) setActiveWindow(obs.activeWindow);
  });

  // Auto-dismiss chip result toast after 6s.
  useEffect(() => {
    if (!gazeChipResult) return;
    const t = window.setTimeout(() => setGazeChipResult(null), 6000);
    return () => window.clearTimeout(t);
  }, [gazeChipResult, setGazeChipResult]);

  // Initialize on mount
  useEffect(() => {
    async function init() {
      try {
        const statusResult = await getStatus();
        setStatus(statusResult.initialized ? 'Ready' : 'Initializing...');

        const configResult = await loadConfig();
        setConfig(configResult);

        // Try to init AI if key exists for the selected provider
        const hasKey =
          (configResult.aiProvider === 'gemini' && configResult.geminiApiKey) ||
          (configResult.aiProvider === 'openai' && configResult.openaiApiKey);
        if (hasKey) {
          initAi().catch(console.error);
        }
      } catch (error) {
        console.error('Init error:', error);
        setStatus('Error initializing');
      }
    }
    init();
  }, [setStatus, setConfig]);

  // Listen for tray "open-settings" event
  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | undefined;

    listen('open-settings', () => {
      setShowSettings(true);
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlistenFn = fn;
      }
    });

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, [setShowSettings]);

  // Capture loop
  const performCapture = useCallback(async () => {
    try {
      const win = await getActiveWindow();
      setActiveWindow(win);

      const screenshot = await captureScreen();
      setLastScreenshot(screenshot);
      if (screenshot.success && screenshot.width && screenshot.height) {
        setScreenshotDims({ width: screenshot.width, height: screenshot.height });
      }

      if (screenshot.success && screenshot.dataUrl) {
        const base64Data = screenshot.dataUrl.replace(/^data:image\/\w+;base64,/, '');
        const ocrResult = await runOcr(base64Data);
        setLastOcr(ocrResult);
        if (ocrResult.success && ocrResult.regions) {
          setOcrRegions(ocrResult.regions);
        }
      }
    } catch (error) {
      console.error('Capture error:', error);
    }
  }, [setActiveWindow, setLastScreenshot, setLastOcr, setScreenshotDims, setOcrRegions]);

  const toggleCapture = useCallback(() => {
    if (isRunning) {
      if (captureInterval) {
        clearInterval(captureInterval);
        setCaptureInterval(null);
      }
      setIsRunning(false);
      setStatus('Stopped');
    } else {
      performCapture();
      const interval = window.setInterval(performCapture, 3000);
      setCaptureInterval(interval);
      setIsRunning(true);
      setStatus('Running');
    }
  }, [isRunning, captureInterval, performCapture, setIsRunning, setStatus]);

  useEffect(() => {
    return () => {
      if (captureInterval) clearInterval(captureInterval);
    };
  }, [captureInterval]);

  return (
    <div className="app-container" data-theme="hawkeye">
      {/* Header */}
      <header className="header">
        <div className="header-title">
          <span className="text-2xl">🦅</span>
          <span>Hawkeye</span>
          <span className="text-xs text-hawkeye-text-muted ml-2">Tauri</span>
        </div>
        <div className="header-actions">
          <button
            className="btn btn-icon"
            onClick={() => setShowSettings(true)}
            title="Settings"
          >
            ⚙️
          </button>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="flex border-b border-hawkeye-border px-2">
        {([
          { id: 'status' as TabId, label: 'Status' },
          { id: 'chat' as TabId, label: 'Chat' },
          { id: 'models' as TabId, label: 'Models' },
          { id: 'observe' as TabId, label: 'Observe' },
          { id: 'gaze' as TabId, label: 'Gaze' },
          { id: 'gesture' as TabId, label: 'Gesture' },
          { id: 'life-tree' as TabId, label: 'Life Tree' },
          { id: 'debug' as TabId, label: 'Debug' },
        ]).map((tab) => (
          <button
            key={tab.id}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-hawkeye-primary text-hawkeye-primary'
                : 'border-transparent text-hawkeye-text-muted hover:text-hawkeye-text-secondary'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'status' && (
          <main className="main-content">
            {/* Status Card */}
            <motion.div
              className="card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={springTransition}
            >
              <div className="flex items-center justify-between">
                <div className="status-indicator">
                  <div className={`status-dot ${isRunning ? '' : 'inactive'}`} />
                  <span>{status}</span>
                </div>
                <button
                  className={`btn ${isRunning ? '' : 'btn-primary'}`}
                  onClick={toggleCapture}
                >
                  {isRunning ? 'Stop' : 'Start'}
                </button>
              </div>
            </motion.div>

            {/* Active Window Card */}
            {activeWindow && (
              <motion.div className="card" {...slideUp} transition={springTransition}>
                <div className="card-title">Active Window</div>
                <div className="card-content">
                  <div className="font-medium">{activeWindow.appName}</div>
                  <div className="text-sm text-hawkeye-text-muted truncate">
                    {activeWindow.title}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Screenshot Preview */}
            {lastScreenshot?.success && lastScreenshot.dataUrl && (
              <motion.div
                className="card cursor-pointer"
                onClick={() => setShowScreenshotPreview(true)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                {...slideUp}
                transition={springTransition}
              >
                <div className="card-title">Last Screenshot</div>
                <div className="screenshot-preview">
                  <img
                    src={lastScreenshot.dataUrl}
                    alt="Screenshot"
                    className="rounded-lg"
                    style={{ maxHeight: '200px', objectFit: 'contain' }}
                  />
                  <div className="screenshot-overlay">
                    {lastScreenshot.width}x{lastScreenshot.height}
                  </div>
                </div>
              </motion.div>
            )}

            {/* OCR Result Card */}
            {lastOcr?.success && lastOcr.text && (
              <motion.div className="card" {...slideUp} transition={springTransition}>
                <div className="card-title flex items-center gap-2">
                  <span>OCR Result</span>
                  <span className="text-xs text-hawkeye-text-muted">
                    {lastOcr.durationMs}ms
                  </span>
                </div>
                <div className="card-content max-h-32 overflow-auto">
                  <pre className="text-xs whitespace-pre-wrap font-mono">
                    {lastOcr.text.slice(0, 500)}
                    {lastOcr.text.length > 500 && '...'}
                  </pre>
                </div>
              </motion.div>
            )}
          </main>
        )}

        {activeTab === 'chat' && <ChatPanel />}
        {activeTab === 'models' && <AiModelsPanel />}
        {activeTab === 'observe' && <ObservePanel />}
        {activeTab === 'gaze' && (
          <div className="main-content">
            <GazeOverlay
              enabled={true}
              showIndicator={true}
              showDebug={true}
              regions={ocrRegions}
              screenshotWidth={screenshotDims?.width}
              screenshotHeight={screenshotDims?.height}
              activeAppName={activeWindow?.appName}
              onChipResult={(action, text) => setGazeChipResult({ action, text })}
            />
            <motion.div
              className="card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={springTransition}
            >
              <div className="card-title">Eye Tracking</div>
              <div className="card-content text-sm text-hawkeye-text-muted">
                <p>WebGazer.js ridge regression with MediaPipe face mesh.</p>
                <p className="mt-2">Click anywhere on screen to improve calibration accuracy. The dot shows your estimated gaze position.</p>
                <p className="mt-2">
                  <strong>This / That:</strong> dwell on a text region for ~500ms — a highlighted bbox + voice-style command chips appear. Chips run through <code>chat_with_gaze_context</code>, which substitutes &ldquo;这个/that&rdquo; with the gazed text on the backend.
                </p>
                {gazedEntity && (
                  <p className="mt-2" style={{ color: 'var(--hawkeye-primary, #f59e0b)' }}>
                    Currently gazing: <code>{gazedEntity.text.slice(0, 80)}</code>
                  </p>
                )}
              </div>
            </motion.div>
            <GazeTrainingPanel />
          </div>
        )}
        {activeTab === 'gesture' && <GesturePanel />}
        {activeTab === 'life-tree' && <LifeTreePanel />}
        {activeTab === 'debug' && <DebugTimeline />}
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && config && (
          <SettingsModal
            config={config}
            onClose={() => setShowSettings(false)}
            onSave={async (newConfig) => {
              await saveConfig(newConfig);
              setConfig(newConfig);
              setShowSettings(false);
              // Re-init AI for any provider with a key
              const hasKey =
                (newConfig.aiProvider === 'gemini' && newConfig.geminiApiKey) ||
                (newConfig.aiProvider === 'openai' && newConfig.openaiApiKey);
              if (hasKey) {
                initAi().catch(console.error);
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* Agent risky-action confirmation modal — global, all tabs */}
      <AgentConfirmModal />

      {/* Gaze chip result toast */}
      <AnimatePresence>
        {gazeChipResult && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={springTransition}
            onClick={() => setGazeChipResult(null)}
            style={{
              position: 'fixed',
              right: 20,
              bottom: 20,
              maxWidth: 360,
              padding: '12px 16px',
              borderRadius: 12,
              background: 'rgba(15, 17, 22, 0.94)',
              border: '1px solid rgba(245, 158, 11, 0.45)',
              boxShadow: '0 12px 30px rgba(0, 0, 0, 0.45)',
              color: '#f5f5f5',
              zIndex: 10010,
              cursor: 'pointer',
              backdropFilter: 'blur(14px)',
            }}
          >
            <div style={{ fontSize: 11, color: 'rgba(245,158,11,0.8)', marginBottom: 6 }}>
              gaze · {gazeChipResult.action}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
              {gazeChipResult.text}
            </div>
            <div style={{ fontSize: 10, opacity: 0.45, marginTop: 6 }}>tap to dismiss</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Screenshot Preview Modal */}
      <AnimatePresence>
        {showScreenshotPreview && lastScreenshot?.dataUrl && (
          <motion.div
            className="modal-overlay"
            onClick={() => setShowScreenshotPreview(false)}
            {...fadeIn}
          >
            <motion.div
              className="max-w-4xl max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
              {...slideUp}
              transition={springTransition}
            >
              <img
                src={lastScreenshot.dataUrl}
                alt="Screenshot"
                className="rounded-lg shadow-2xl"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Settings Modal Component
interface SettingsModalProps {
  config: AppConfig;
  onClose: () => void;
  onSave: (config: AppConfig) => Promise<void>;
}

function SettingsModal({ config, onClose, onSave }: SettingsModalProps) {
  const [localConfig, setLocalConfig] = useState<AppConfig>(config);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(localConfig);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div className="modal-overlay" onClick={onClose} {...fadeIn}>
      <motion.div
        className="modal-content w-[500px]"
        onClick={(e) => e.stopPropagation()}
        {...slideUp}
        transition={springTransition}
      >
        <div className="modal-header">
          <h2 className="modal-title">Settings</h2>
          <button className="btn btn-icon" onClick={onClose}>
            x
          </button>
        </div>

        <div className="space-y-6">
          <div className="settings-section">
            <h3 className="settings-section-title">AI Provider</h3>
            <div className="form-group">
              <label className="form-label">Provider</label>
              <select
                className="form-input form-select"
                value={localConfig.aiProvider}
                onChange={(e) =>
                  setLocalConfig({ ...localConfig, aiProvider: e.target.value })
                }
              >
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI Compatible</option>
              </select>
            </div>

            {localConfig.aiProvider === 'gemini' && (
              <>
                <div className="form-group">
                  <label className="form-label">API Key</label>
                  <input
                    type="password"
                    className="form-input"
                    value={localConfig.geminiApiKey || ''}
                    onChange={(e) =>
                      setLocalConfig({ ...localConfig, geminiApiKey: e.target.value })
                    }
                    placeholder="Enter Gemini API key"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Model</label>
                  <input
                    type="text"
                    className="form-input"
                    value={localConfig.geminiModel || ''}
                    onChange={(e) =>
                      setLocalConfig({ ...localConfig, geminiModel: e.target.value })
                    }
                    placeholder="gemini-2.5-flash-preview-05-20"
                  />
                </div>
              </>
            )}

            {localConfig.aiProvider === 'openai' && (
              <>
                <div className="form-group">
                  <label className="form-label">Base URL</label>
                  <input
                    type="text"
                    className="form-input"
                    value={localConfig.openaiBaseUrl || ''}
                    onChange={(e) =>
                      setLocalConfig({ ...localConfig, openaiBaseUrl: e.target.value })
                    }
                    placeholder="https://api.openai.com/v1"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">API Key</label>
                  <input
                    type="password"
                    className="form-input"
                    value={localConfig.openaiApiKey || ''}
                    onChange={(e) =>
                      setLocalConfig({ ...localConfig, openaiApiKey: e.target.value })
                    }
                    placeholder="sk-..."
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Model</label>
                  <input
                    type="text"
                    className="form-input"
                    value={localConfig.openaiModel || ''}
                    onChange={(e) =>
                      setLocalConfig({ ...localConfig, openaiModel: e.target.value })
                    }
                    placeholder="gpt-4o"
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default App;
