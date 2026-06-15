/**
 * Main A2UI View - Card-based interaction interface
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import type { A2UICard } from '@hawkeye/core';
import { CardList } from '../components/A2UI';
import { DebugTimeline } from '../components/DebugTimeline';
import { SettingsModal } from '../components/SettingsModal';
import { LifeTreePanel } from '../components/LifeTree';
import { TimelineTreePanel } from '../components/TimelineTree';
import { CameraPreview } from '../components/CameraPreview';
import { useHawkeyeStore } from '../stores';
import type { ExecutionPlan, PlanExecution, ChatMessage } from '../stores/types';
import logoIcon from '../assets/icon.png';

const generateId = () => `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const overlayVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

const modalVariants = {
  initial: { opacity: 0, scale: 0.95, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.95, y: 10 },
};

const slideUpVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

const panelVariants = {
  initial: { opacity: 0, x: 50 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 50 },
};

const springTransition = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
};

const smoothTransition = {
  duration: 0.2,
  ease: [0.4, 0, 0.2, 1] as const,
};

// Card factory helpers
const createProgressCard = (plan: ExecutionPlan, execution: PlanExecution): A2UICard => ({
  id: `progress_${execution.planId}`,
  type: 'progress',
  title: `执行中: ${plan.title}`,
  description: plan.steps[execution.currentStep - 1]?.description || '准备中...',
  icon: 'refresh',
  currentStep: execution.currentStep,
  totalSteps: plan.steps.length,
  stepDescription: plan.steps[execution.currentStep - 1]?.description || '准备中...',
  progress: (execution.currentStep / plan.steps.length) * 100,
  pausable: true,
  cancellable: true,
  status: 'running',
  timestamp: Date.now(),
  metadata: {
    planId: execution.planId,
    progress: (execution.currentStep / plan.steps.length) * 100,
    currentStep: execution.currentStep,
    totalSteps: plan.steps.length,
  },
  actions: [
    { id: 'pause', label: '暂停', type: 'secondary', icon: 'clock' },
    { id: 'cancel', label: '取消', type: 'danger', icon: 'x' },
  ],
});

export function MainView() {
  const { t } = useTranslation();

  const {
    cards, addCard, removeCard,
    chatMessages, chatInput, setChatInput, addChatMessage, clearChatMessages,
    currentPlan, setCurrentPlan, currentExecution, setCurrentExecution,
    status,
    showSettings, setShowSettings,
    showChatDialog, setShowChatDialog,
    showDebugTimeline, setShowDebugTimeline,
    showScreenshotPreview, setShowScreenshotPreview,
    setShowHistory,
    chatLoading, setChatLoading,
    screenshotZoomed, setScreenshotZoomed,
    smartObserveWatching,
    screenshotPreview, setScreenshotPreview,
    ocrTextPreview, setOcrTextPreview,
    showLifeTree, setShowLifeTree,
    showTimelineTree, setShowTimelineTree,
    showCameraPreview, setShowCameraPreview,
  } = useHawkeyeStore();

  // Gesture control state
  const [gestureScreenshot, setGestureScreenshot] = useState<string | null>(null);
  const [showGestureScreenshot, setShowGestureScreenshot] = useState(false);

  // Set up gesture control event listeners
  useEffect(() => {
    // Guard: window.hawkeye only exists in Electron
    if (!window.hawkeye) return;

    // Screenshot captured via gesture
    const unsubScreenshot = window.hawkeye.onGestureControlScreenshot?.((data) => {
      setGestureScreenshot(data.dataUrl);
      setShowGestureScreenshot(true);
      // Auto-hide after 3 seconds
      setTimeout(() => setShowGestureScreenshot(false), 3000);
    });

    // Toggle recording via gesture (toggle smart observe)
    const unsubRecording = window.hawkeye.onGestureControlToggleRecording?.(() => {
      window.hawkeye.toggleSmartObserve?.();
    });

    // Pause via gesture (stop smart observe)
    const unsubPause = window.hawkeye.onGestureControlPause?.(() => {
      if (smartObserveWatching) {
        window.hawkeye.stopSmartObserve?.();
      }
    });

    // Quick menu via gesture (show settings)
    const unsubQuickMenu = window.hawkeye.onGestureControlQuickMenu?.(() => {
      setShowSettings(true);
    });

    return () => {
      unsubScreenshot?.();
      unsubRecording?.();
      unsubPause?.();
      unsubQuickMenu?.();
    };
  }, [smartObserveWatching, setShowSettings]);

  // Handle gesture actions from CameraPreview
  const handleGestureAction = useCallback((event: {
    action: string;
    gesture: string;
    confidence: number;
    position?: { x: number; y: number };
    handedness?: string;
  }) => {
    console.log('[MainView] Gesture action:', event);
    // Most actions are handled via IPC events above
    // This callback can be used for additional UI feedback
  }, []);

  const addErrorCard = useCallback((message: string) => {
    const card: A2UICard = {
      id: generateId(),
      type: 'error',
      title: '发生错误',
      description: message,
      icon: 'error',
      retryable: false,
      timestamp: Date.now(),
      actions: [{ id: 'dismiss', label: '关闭', type: 'dismiss' }],
    };
    addCard(card);
  }, [addCard]);

  // Card action handler
  const handleCardAction = async (cardId: string, actionId: string, _data?: unknown) => {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;

    try {
      switch (actionId) {
        case 'generate_plan': {
          const intentId = card.metadata?.intentId as string;
          if (intentId) {
            const plan = await window.hawkeye.generatePlan(intentId);
            setCurrentPlan(plan);
          }
          break;
        }
        case 'execute': {
          const planId = card.metadata?.planId as string;
          if (planId && currentPlan) {
            removeCard(cardId);
            const execution = await window.hawkeye.executePlan(planId);
            setCurrentExecution(execution);
            addCard(createProgressCard(currentPlan, execution));
          }
          break;
        }
        case 'reject': {
          removeCard(cardId);
          setCurrentPlan(null);
          break;
        }
        case 'pause': {
          const planId = card.metadata?.planId as string;
          if (planId) await window.hawkeye.pauseExecution(planId);
          break;
        }
        case 'cancel': {
          const planId = card.metadata?.planId as string;
          if (planId) {
            await window.hawkeye.cancelExecution(planId);
            removeCard(cardId);
            setCurrentPlan(null);
            setCurrentExecution(null);
          }
          break;
        }
        case 'done':
        case 'dismiss': {
          removeCard(cardId);
          if (card.type === 'result') {
            setCurrentPlan(null);
            setCurrentExecution(null);
          }
          break;
        }
        case 'open_settings': {
          removeCard(cardId);
          setShowSettings(true);
          break;
        }
        case 'retry': {
          if (currentPlan) {
            removeCard(cardId);
            const execution = await window.hawkeye.executePlan(currentPlan.id);
            setCurrentExecution(execution);
            addCard(createProgressCard(currentPlan, execution));
          }
          break;
        }
        default:
          break;
      }
    } catch (err) {
      addErrorCard((err as Error).message);
    }
  };

  const handleCardDismiss = (cardId: string) => {
    const card = cards.find((c) => c.id === cardId);
    if (card?.type === 'suggestion' && card.metadata?.intentId) {
      window.hawkeye.intentFeedback(card.metadata.intentId as string, 'irrelevant');
    }
    removeCard(cardId);
  };

  const handleQuickAction = async (actionId: string) => {
    switch (actionId) {
      case 'refresh':
        await window.hawkeye.observe();
        break;
      case 'clipboard':
        await window.hawkeye.observe();
        break;
      case 'history':
        setShowHistory(true);
        break;
      case 'settings':
        setShowSettings(true);
        break;
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: chatInput.trim(),
      timestamp: Date.now(),
    };

    addChatMessage(userMessage);
    setChatInput('');
    setChatLoading(true);

    try {
      const messages = [...chatMessages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const response = await window.hawkeye.chat(messages);
      addChatMessage({
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      });
    } catch (err) {
      addChatMessage({
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: `错误: ${(err as Error).message}`,
        timestamp: Date.now(),
      });
    } finally {
      setChatLoading(false);
    }
  };

  const toggleScreenshotPreview = async () => {
    if (!showScreenshotPreview) {
      const result = await window.hawkeye.getLastContext();
      if (result.success) {
        if (result.screenshot) {
          const dataUrl = result.screenshot.startsWith('data:')
            ? result.screenshot
            : `data:image/png;base64,${result.screenshot}`;
          setScreenshotPreview(dataUrl);
        }
        if (result.ocrText) {
          setOcrTextPreview(result.ocrText);
        }
      } else {
        const screenshotResult = await window.hawkeye.getScreenshot();
        if (screenshotResult.success && screenshotResult.dataUrl) {
          setScreenshotPreview(screenshotResult.dataUrl);
        }
        setOcrTextPreview(null);
      }
    }
    setShowScreenshotPreview(!showScreenshotPreview);
    setScreenshotZoomed(false);
  };

  return (
    <div className="container a2ui-container">
      {/* Header */}
      <header className="header">
        <div className="header-brand">
          <img src={logoIcon} alt="Shadow" className="brand-icon" />
        </div>
        <div className="header-actions">
          <button
            className={`btn-icon ${showDebugTimeline ? 'active' : ''}`}
            onClick={() => setShowDebugTimeline(!showDebugTimeline)}
            title={t('app.debugTimeline', '调试时间线')}
          >
            🔧
          </button>
          <button
            className={`btn-icon ${showScreenshotPreview ? 'active' : ''}`}
            onClick={toggleScreenshotPreview}
            title={t('app.screenshotPreview', '截屏预览')}
          >
            🖼️
          </button>
          <button
            className={`btn-icon ${showLifeTree ? 'active' : ''}`}
            onClick={() => setShowLifeTree(!showLifeTree)}
            title={t('app.lifeTree', '生命树')}
          >
            🌳
          </button>
          <button
            className={`btn-icon ${showTimelineTree ? 'active' : ''}`}
            onClick={() => setShowTimelineTree(!showTimelineTree)}
            title={t('app.timelineTree', '活动时间线')}
          >
            📊
          </button>
          <button
            className={`btn-icon ${showCameraPreview ? 'active' : ''}`}
            onClick={() => setShowCameraPreview(!showCameraPreview)}
            title={t('app.cameraPreview', '摄像头')}
          >
            📷
          </button>
          <button
            className="btn-icon"
            onClick={() => handleQuickAction('history')}
            title={t('app.history', '历史记录')}
          >
            📜
          </button>
          <div className="a2ui-status-indicator">
            <span
              className={`status-dot ${
                smartObserveWatching ? 'watching' : status?.aiReady ? 'active' : status?.initialized ? 'processing' : 'error'
              }`}
            />
            <span className="status-text">
              {smartObserveWatching
                ? t('app.smartObserving', '酝酿中')
                : status?.aiReady
                  ? t('app.ready', '就绪')
                  : status?.initialized
                    ? t('app.initializing', '初始化中')
                    : t('app.notConnected', '未连接')}
            </span>
          </div>
          <button
            className="btn-icon"
            onClick={() => setShowSettings(true)}
            title={t('settings.title')}
          >
            ⚙️
          </button>
        </div>
      </header>

      {/* Screenshot preview panel */}
      <AnimatePresence>
        {showScreenshotPreview && screenshotPreview && (
          <motion.div
            className={`screenshot-preview-panel ${screenshotZoomed ? 'zoomed' : ''}`}
            variants={slideUpVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={springTransition}
          >
            <div className="screenshot-preview-header">
              <span>{t('app.currentScreen', '当前屏幕')}</span>
              <div className="screenshot-preview-actions">
                <button
                  className="btn-icon-small"
                  onClick={() => setScreenshotZoomed(!screenshotZoomed)}
                  title={screenshotZoomed ? '缩小' : '放大'}
                >
                  {screenshotZoomed ? '🔍-' : '🔍+'}
                </button>
                <button className="btn-icon-small" onClick={toggleScreenshotPreview} title="刷新">
                  🔄
                </button>
                <button className="btn-close" onClick={() => setShowScreenshotPreview(false)}>×</button>
              </div>
            </div>
            <div className="screenshot-preview-content">
              <div className="screenshot-image-container" onClick={() => setScreenshotZoomed(!screenshotZoomed)}>
                <img
                  src={screenshotPreview}
                  alt="Screen Preview"
                  className={`screenshot-preview-image ${screenshotZoomed ? 'zoomed' : ''}`}
                />
              </div>
              {ocrTextPreview && (
                <div className="ocr-text-preview">
                  <div className="ocr-text-header">
                    <span>📝 OCR 识别结果</span>
                    <span className="ocr-text-length">{ocrTextPreview.length} 字符</span>
                  </div>
                  <div className="ocr-text-content">{ocrTextPreview}</div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gesture screenshot preview (floating) */}
      <AnimatePresence>
        {showGestureScreenshot && gestureScreenshot && (
          <motion.div
            className="gesture-screenshot-toast"
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={springTransition}
            onClick={() => setShowGestureScreenshot(false)}
          >
            <div className="gesture-screenshot-header">
              <span>✌️ {t('gesture.screenshotCaptured', '截图已保存')}</span>
              <button className="btn-close-small" onClick={() => setShowGestureScreenshot(false)}>×</button>
            </div>
            <img src={gestureScreenshot} alt="Gesture Screenshot" className="gesture-screenshot-thumb" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card list */}
      <div className="content a2ui-content">
        <CardList
          cards={cards}
          onAction={handleCardAction}
          onDismiss={handleCardDismiss}
          emptyMessage="暂无建议，Shadow 正在观察您的工作环境..."
        />
      </div>

      {/* Chat input at bottom */}
      <div className="chat-bottom-bar">
        <div className="chat-input-area">
          <input
            type="text"
            autoFocus
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
              }
            }}
            placeholder={t('app.typeMessage', '输入消息...')}
            disabled={chatLoading}
          />
          <motion.button
            className="btn btn-primary"
            onClick={sendChatMessage}
            disabled={!chatInput.trim() || chatLoading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {chatLoading ? '...' : t('app.send', '发送')}
          </motion.button>
        </div>
      </div>

      {/* Settings modal */}
      <AnimatePresence>
        {showSettings && <SettingsModal />}
      </AnimatePresence>

      {/* Debug timeline */}
      <AnimatePresence>
        {showDebugTimeline && (
          <motion.div
            className="debug-timeline-overlay"
            variants={panelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={springTransition}
          >
            <DebugTimeline onClose={() => setShowDebugTimeline(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Life Tree */}
      <AnimatePresence>
        {showLifeTree && (
          <motion.div
            className="life-tree-overlay"
            variants={panelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={springTransition}
          >
            <LifeTreePanel />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timeline Tree */}
      <AnimatePresence>
        {showTimelineTree && (
          <motion.div
            className="timeline-tree-overlay"
            variants={panelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={springTransition}
          >
            <TimelineTreePanel onClose={() => setShowTimelineTree(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat dialog */}
      <AnimatePresence>
        {showChatDialog && (
          <motion.div
            className="chat-dialog-overlay"
            onClick={() => setShowChatDialog(false)}
            variants={overlayVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={smoothTransition}
          >
            <motion.div
              className="chat-dialog"
              onClick={(e) => e.stopPropagation()}
              variants={modalVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={springTransition}
            >
              <div className="chat-dialog-header">
                <h3>{t('app.chatWithAI', '与 AI 对话')}</h3>
                <button className="btn-close" onClick={() => setShowChatDialog(false)}>×</button>
              </div>
              <div className="chat-messages">
                {chatMessages.length === 0 ? (
                  <motion.div
                    className="chat-empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    <p>{t('app.chatWelcome', '你好！我是 Shadow AI，有什么可以帮助你的？')}</p>
                  </motion.div>
                ) : (
                  chatMessages.map((msg, index) => (
                    <motion.div
                      key={msg.id}
                      className={`chat-message ${msg.role}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <div className="chat-message-content">{msg.content}</div>
                    </motion.div>
                  ))
                )}
                {chatLoading && (
                  <motion.div
                    className="chat-message assistant loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <div className="chat-message-content">
                      <span className="typing-indicator">...</span>
                    </div>
                  </motion.div>
                )}
              </div>
              <div className="chat-input-area">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendChatMessage();
                    }
                  }}
                  placeholder={t('app.typeMessage', '输入消息...')}
                  disabled={chatLoading}
                />
                <motion.button
                  className="btn btn-primary"
                  onClick={sendChatMessage}
                  disabled={!chatInput.trim() || chatLoading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {t('app.send', '发送')}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Camera Preview */}
      <AnimatePresence>
        {showCameraPreview && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={springTransition}
          >
            <CameraPreview
              onClose={() => setShowCameraPreview(false)}
              gestureControlEnabled={true}
              onGestureAction={handleGestureAction}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
