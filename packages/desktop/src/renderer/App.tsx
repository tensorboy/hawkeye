/**
 * Hawkeye Desktop - Main App Component
 */

import React, { useState, useEffect } from 'react';

interface TaskSuggestion {
  id: string;
  title: string;
  description: string;
  type: string;
  confidence: number;
}

declare global {
  interface Window {
    hawkeye: {
      observe: () => Promise<void>;
      execute: (id: string) => Promise<unknown>;
      getSuggestions: () => Promise<TaskSuggestion[]>;
      setApiKey: (key: string) => Promise<void>;
      getConfig: () => Promise<{ hasApiKey: boolean }>;
      onSuggestions: (callback: (suggestions: TaskSuggestion[]) => void) => void;
      onLoading: (callback: (loading: boolean) => void) => void;
      onError: (callback: (error: string) => void) => void;
    };
  }
}

export default function App() {
  const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    // 检查配置
    window.hawkeye.getConfig().then((config) => {
      setHasApiKey(config.hasApiKey);
      if (!config.hasApiKey) {
        setShowSettings(true);
      }
    });

    // 监听事件
    window.hawkeye.onSuggestions((newSuggestions) => {
      setSuggestions(newSuggestions);
      if (newSuggestions.length > 0) {
        setSelectedId(newSuggestions[0].id);
      }
      setError(null);
    });

    window.hawkeye.onLoading(setLoading);
    window.hawkeye.onError((err) => setError(err));
  }, []);

  const handleObserve = async () => {
    if (!hasApiKey) {
      setShowSettings(true);
      return;
    }
    await window.hawkeye.observe();
  };

  const handleExecute = async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      await window.hawkeye.execute(selectedId);
      // 移除已执行的建议
      setSuggestions((prev) => prev.filter((s) => s.id !== selectedId));
      setSelectedId(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    await window.hawkeye.setApiKey(apiKey);
    setHasApiKey(true);
    setShowSettings(false);
    setApiKey('');
  };

  if (showSettings) {
    return (
      <div className="container settings">
        <h2>⚙️ Settings</h2>
        <div className="form-group">
          <label>Anthropic API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
          />
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={handleSaveApiKey}>
            Save
          </button>
          {hasApiKey && (
            <button className="btn" onClick={() => setShowSettings(false)}>
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <header className="header">
        <h1>🦅 Hawkeye</h1>
        <div className="header-actions">
          <button className="btn-icon" onClick={() => setShowSettings(true)} title="Settings">
            ⚙️
          </button>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="content">
        {loading ? (
          <div className="loading">
            <div className="spinner"></div>
            <p>Analyzing screen...</p>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="empty-state">
            <div className="icon">👁️</div>
            <p>No suggestions yet</p>
            <button className="btn btn-primary" onClick={handleObserve}>
              Observe Screen
            </button>
            <p className="hint">or press ⌘+Shift+H</p>
          </div>
        ) : (
          <>
            <ul className="suggestion-list">
              {suggestions.map((suggestion) => (
                <li
                  key={suggestion.id}
                  className={`suggestion-item ${selectedId === suggestion.id ? 'selected' : ''}`}
                  onClick={() => setSelectedId(suggestion.id)}
                >
                  <div className="suggestion-header">
                    <span className="suggestion-title">💡 {suggestion.title}</span>
                    <span className="suggestion-confidence">
                      {Math.round(suggestion.confidence * 100)}%
                    </span>
                  </div>
                  <p className="suggestion-desc">{suggestion.description}</p>
                  <span className="suggestion-type">{suggestion.type}</span>
                </li>
              ))}
            </ul>

            <div className="footer-actions">
              <button
                className="btn btn-primary"
                onClick={handleExecute}
                disabled={!selectedId}
              >
                ▶️ Execute
              </button>
              <button className="btn" onClick={handleObserve}>
                🔄 Refresh
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
