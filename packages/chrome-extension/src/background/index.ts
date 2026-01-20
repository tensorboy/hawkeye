/**
 * Hawkeye Chrome Extension - Background Service Worker
 */

import { ClaudeClient } from './claude';
import type { TaskSuggestion, PageContext } from './types';

// 存储
interface StorageData {
  apiKey: string;
  model: string;
  suggestions: TaskSuggestion[];
}

let client: ClaudeClient | null = null;

// 初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('Hawkeye extension installed');

  // 创建右键菜单
  chrome.contextMenus.create({
    id: 'hawkeye-observe',
    title: 'Hawkeye: Analyze Selection',
    contexts: ['selection'],
  });

  chrome.contextMenus.create({
    id: 'hawkeye-observe-page',
    title: 'Hawkeye: Analyze Page',
    contexts: ['page'],
  });
});

// 初始化 Claude 客户端
async function initClient(): Promise<ClaudeClient | null> {
  const data = await chrome.storage.local.get(['apiKey', 'model']);
  if (!data.apiKey) {
    return null;
  }
  client = new ClaudeClient({
    apiKey: data.apiKey,
    model: data.model || 'claude-sonnet-4-20250514',
  });
  return client;
}

// 分析页面内容
async function analyzePageContent(context: PageContext): Promise<TaskSuggestion[]> {
  if (!client) {
    await initClient();
  }
  if (!client) {
    throw new Error('Please configure your API key first');
  }

  const prompt = `Analyze the following web page content and suggest actionable tasks.

URL: ${context.url}
Title: ${context.title}
${context.selection ? `Selected Text: ${context.selection}` : ''}

Page Content (truncated):
${context.content.substring(0, 5000)}

Based on this content, suggest 1-5 actionable tasks the user might want to do.
Each task should have:
- title: A short action title
- description: What this task will do
- type: one of (navigate, extract, summarize, search, action)
- confidence: 0.0-1.0

Respond in JSON format:
{
  "suggestions": [
    {
      "title": "...",
      "description": "...",
      "type": "...",
      "confidence": 0.8
    }
  ]
}`;

  const response = await client.complete(prompt);
  const parsed = JSON.parse(response);

  return parsed.suggestions.map((s: TaskSuggestion, i: number) => ({
    ...s,
    id: `suggestion-${Date.now()}-${i}`,
    timestamp: Date.now(),
  }));
}

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === 'hawkeye-observe' || info.menuItemId === 'hawkeye-observe-page') {
    try {
      // 获取页面内容
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({
          content: document.body.innerText,
          selection: window.getSelection()?.toString() || '',
        }),
      });

      const pageData = results[0]?.result;
      if (!pageData) return;

      const context: PageContext = {
        url: tab.url || '',
        title: tab.title || '',
        content: pageData.content,
        selection: info.selectionText || pageData.selection,
      };

      const suggestions = await analyzePageContent(context);

      // 保存建议
      await chrome.storage.local.set({ suggestions });

      // 通知 popup
      chrome.runtime.sendMessage({ type: 'suggestions-updated', suggestions });

      // 显示通知
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Hawkeye',
        message: `Found ${suggestions.length} suggestion(s)`,
      });
    } catch (error) {
      console.error('Hawkeye analysis error:', error);
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Hawkeye Error',
        message: (error as Error).message,
      });
    }
  }
});

// 处理快捷键
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'observe-page') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.contextMenus.onClicked.dispatch(
        { menuItemId: 'hawkeye-observe-page' } as chrome.contextMenus.OnClickData,
        tab
      );
    }
  }
});

// 处理来自 popup 和 content script 的消息
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'analyze') {
    analyzePageContent(message.context)
      .then((suggestions) => {
        chrome.storage.local.set({ suggestions });
        sendResponse({ success: true, suggestions });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // 异步响应
  }

  if (message.type === 'get-suggestions') {
    chrome.storage.local.get(['suggestions']).then((data) => {
      sendResponse({ suggestions: data.suggestions || [] });
    });
    return true;
  }

  if (message.type === 'set-api-key') {
    chrome.storage.local.set({ apiKey: message.apiKey }).then(() => {
      client = null; // 重新初始化
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'get-config') {
    chrome.storage.local.get(['apiKey', 'model']).then((data) => {
      sendResponse({ hasApiKey: !!data.apiKey, model: data.model });
    });
    return true;
  }
});

// 初始化
initClient();
