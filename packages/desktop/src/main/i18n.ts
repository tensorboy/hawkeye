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
    // Auto-updater
    'updater.updateAvailable': 'Update Available',
    'updater.newVersionMessage': 'A new version {{version}} is available. Would you like to download it now?',
    'updater.downloadNow': 'Download Now',
    'updater.later': 'Later',
    'updater.updateReady': 'Update Ready',
    'updater.restartMessage': 'The update has been downloaded. Restart the application to apply the update.',
    'updater.restartNow': 'Restart Now',
  },
  'zh-CN': {
    'tray.observeScreen': '观察屏幕',
    'tray.showSuggestions': '显示建议',
    'tray.settings': '设置',
    'tray.quit': '退出',
    'tray.tooltip': 'Hawkeye - 智能任务助手',
    'error.configureApiKey': '请先配置 API 密钥',
    'error.engineNotInitialized': '引擎未初始化',
    // Auto-updater
    'updater.updateAvailable': '发现新版本',
    'updater.newVersionMessage': '发现新版本 {{version}}，是否立即下载？',
    'updater.downloadNow': '立即下载',
    'updater.later': '稍后',
    'updater.updateReady': '更新就绪',
    'updater.restartMessage': '更新已下载完成，重启应用以完成更新。',
    'updater.restartNow': '立即重启',
  },
  'zh-TW': {
    'tray.observeScreen': '觀察螢幕',
    'tray.showSuggestions': '顯示建議',
    'tray.settings': '設定',
    'tray.quit': '結束',
    'tray.tooltip': 'Hawkeye - 智慧任務助手',
    'error.configureApiKey': '請先設定 API 金鑰',
    'error.engineNotInitialized': '引擎未初始化',
    // Auto-updater
    'updater.updateAvailable': '發現新版本',
    'updater.newVersionMessage': '發現新版本 {{version}}，是否立即下載？',
    'updater.downloadNow': '立即下載',
    'updater.later': '稍後',
    'updater.updateReady': '更新就緒',
    'updater.restartMessage': '更新已下載完成，重啟應用以完成更新。',
    'updater.restartNow': '立即重啟',
  },
  ja: {
    'tray.observeScreen': '画面を観察',
    'tray.showSuggestions': '提案を表示',
    'tray.settings': '設定',
    'tray.quit': '終了',
    'tray.tooltip': 'Hawkeye - インテリジェントタスクアシスタント',
    'error.configureApiKey': 'まず API キーを設定してください',
    'error.engineNotInitialized': 'エンジンが初期化されていません',
    // Auto-updater
    'updater.updateAvailable': '新しいバージョンが利用可能',
    'updater.newVersionMessage': '新しいバージョン {{version}} が利用可能です。今すぐダウンロードしますか？',
    'updater.downloadNow': '今すぐダウンロード',
    'updater.later': '後で',
    'updater.updateReady': 'アップデート準備完了',
    'updater.restartMessage': 'アップデートがダウンロードされました。アプリを再起動して更新を適用してください。',
    'updater.restartNow': '今すぐ再起動',
  },
  ko: {
    'tray.observeScreen': '화면 관찰',
    'tray.showSuggestions': '제안 표시',
    'tray.settings': '설정',
    'tray.quit': '종료',
    'tray.tooltip': 'Hawkeye - 지능형 작업 도우미',
    'error.configureApiKey': '먼저 API 키를 설정해주세요',
    'error.engineNotInitialized': '엔진이 초기화되지 않았습니다',
    // Auto-updater
    'updater.updateAvailable': '새 버전 사용 가능',
    'updater.newVersionMessage': '새 버전 {{version}}이(가) 사용 가능합니다. 지금 다운로드하시겠습니까?',
    'updater.downloadNow': '지금 다운로드',
    'updater.later': '나중에',
    'updater.updateReady': '업데이트 준비 완료',
    'updater.restartMessage': '업데이트가 다운로드되었습니다. 애플리케이션을 다시 시작하여 업데이트를 적용하세요.',
    'updater.restartNow': '지금 다시 시작',
  },
  es: {
    'tray.observeScreen': 'Observar pantalla',
    'tray.showSuggestions': 'Mostrar sugerencias',
    'tray.settings': 'Configuración',
    'tray.quit': 'Salir',
    'tray.tooltip': 'Hawkeye - Asistente inteligente de tareas',
    'error.configureApiKey': 'Por favor, configura primero la clave API',
    'error.engineNotInitialized': 'Motor no inicializado',
    // Auto-updater
    'updater.updateAvailable': 'Actualización disponible',
    'updater.newVersionMessage': 'Una nueva versión {{version}} está disponible. ¿Deseas descargarla ahora?',
    'updater.downloadNow': 'Descargar ahora',
    'updater.later': 'Más tarde',
    'updater.updateReady': 'Actualización lista',
    'updater.restartMessage': 'La actualización se ha descargado. Reinicia la aplicación para aplicar la actualización.',
    'updater.restartNow': 'Reiniciar ahora',
  },
  pt: {
    'tray.observeScreen': 'Observar tela',
    'tray.showSuggestions': 'Mostrar sugestões',
    'tray.settings': 'Configurações',
    'tray.quit': 'Sair',
    'tray.tooltip': 'Hawkeye - Assistente inteligente de tarefas',
    'error.configureApiKey': 'Por favor, configure a chave API primeiro',
    'error.engineNotInitialized': 'Motor não inicializado',
    // Auto-updater
    'updater.updateAvailable': 'Atualização disponível',
    'updater.newVersionMessage': 'Uma nova versão {{version}} está disponível. Deseja baixar agora?',
    'updater.downloadNow': 'Baixar agora',
    'updater.later': 'Mais tarde',
    'updater.updateReady': 'Atualização pronta',
    'updater.restartMessage': 'A atualização foi baixada. Reinicie o aplicativo para aplicar a atualização.',
    'updater.restartNow': 'Reiniciar agora',
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

export function t(key: string, params?: Record<string, string>): string {
  const localeTranslations = translations[currentLocale] || translations.en;
  let text = localeTranslations[key] || translations.en[key] || key;

  // Support {{key}} interpolation
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
    });
  }

  return text;
}

export function getLocale(): string {
  return currentLocale;
}
