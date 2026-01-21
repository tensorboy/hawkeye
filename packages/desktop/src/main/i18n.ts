/**
 * Hawkeye Desktop - Main Process i18n
 */

import { app } from 'electron';

const translations: Record<string, Record<string, string>> = {
  en: {
    'tray.observeScreen': 'Observe Screen',
    'tray.showSuggestions': 'Show Suggestions',
    'tray.settings': 'Settings',
    'tray.quit': 'Quit',
    'tray.tooltip': 'Hawkeye - Intelligent Task Assistant',
    'error.configureApiKey': 'Please configure API key first',
    'error.engineNotInitialized': 'Engine not initialized',
  },
  'zh-CN': {
    'tray.observeScreen': '观察屏幕',
    'tray.showSuggestions': '显示建议',
    'tray.settings': '设置',
    'tray.quit': '退出',
    'tray.tooltip': 'Hawkeye - 智能任务助手',
    'error.configureApiKey': '请先配置 API 密钥',
    'error.engineNotInitialized': '引擎未初始化',
  },
  'zh-TW': {
    'tray.observeScreen': '觀察螢幕',
    'tray.showSuggestions': '顯示建議',
    'tray.settings': '設定',
    'tray.quit': '結束',
    'tray.tooltip': 'Hawkeye - 智慧任務助手',
    'error.configureApiKey': '請先設定 API 金鑰',
    'error.engineNotInitialized': '引擎未初始化',
  },
  ja: {
    'tray.observeScreen': '画面を観察',
    'tray.showSuggestions': '提案を表示',
    'tray.settings': '設定',
    'tray.quit': '終了',
    'tray.tooltip': 'Hawkeye - インテリジェントタスクアシスタント',
    'error.configureApiKey': 'まず API キーを設定してください',
    'error.engineNotInitialized': 'エンジンが初期化されていません',
  },
  ko: {
    'tray.observeScreen': '화면 관찰',
    'tray.showSuggestions': '제안 표시',
    'tray.settings': '설정',
    'tray.quit': '종료',
    'tray.tooltip': 'Hawkeye - 지능형 작업 도우미',
    'error.configureApiKey': '먼저 API 키를 설정해주세요',
    'error.engineNotInitialized': '엔진이 초기화되지 않았습니다',
  },
  es: {
    'tray.observeScreen': 'Observar pantalla',
    'tray.showSuggestions': 'Mostrar sugerencias',
    'tray.settings': 'Configuración',
    'tray.quit': 'Salir',
    'tray.tooltip': 'Hawkeye - Asistente inteligente de tareas',
    'error.configureApiKey': 'Por favor, configura primero la clave API',
    'error.engineNotInitialized': 'Motor no inicializado',
  },
  pt: {
    'tray.observeScreen': 'Observar tela',
    'tray.showSuggestions': 'Mostrar sugestões',
    'tray.settings': 'Configurações',
    'tray.quit': 'Sair',
    'tray.tooltip': 'Hawkeye - Assistente inteligente de tarefas',
    'error.configureApiKey': 'Por favor, configure a chave API primeiro',
    'error.engineNotInitialized': 'Motor não inicializado',
  },
};

function normalizeLocale(locale: string): string {
  // Map system locales to our supported locales
  const localeMap: Record<string, string> = {
    'zh-CN': 'zh-CN',
    'zh-TW': 'zh-TW',
    'zh-Hans': 'zh-CN',
    'zh-Hant': 'zh-TW',
    zh: 'zh-CN',
    ja: 'ja',
    ko: 'ko',
    es: 'es',
    pt: 'pt',
    'pt-BR': 'pt',
    en: 'en',
    'en-US': 'en',
    'en-GB': 'en',
  };

  if (localeMap[locale]) {
    return localeMap[locale];
  }

  // Try base language
  const baseLocale = locale.split('-')[0];
  if (localeMap[baseLocale]) {
    return localeMap[baseLocale];
  }

  return 'en';
}

let currentLocale = 'en';

export function initI18n(): void {
  const systemLocale = app.getLocale();
  currentLocale = normalizeLocale(systemLocale);
}

export function t(key: string): string {
  const localeTranslations = translations[currentLocale] || translations.en;
  return localeTranslations[key] || translations.en[key] || key;
}

export function getLocale(): string {
  return currentLocale;
}
