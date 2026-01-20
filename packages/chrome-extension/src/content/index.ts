/**
 * Hawkeye Chrome Extension - Content Script
 * Runs in the context of web pages
 */

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'get-page-content') {
    const content = {
      url: window.location.href,
      title: document.title,
      content: document.body.innerText.substring(0, 20000),
      selection: window.getSelection()?.toString() || '',
      meta: extractMetadata(),
    };
    sendResponse(content);
    return true;
  }

  if (message.type === 'execute-action') {
    executeAction(message.action)
      .then((result) => sendResponse({ success: true, result }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// 提取页面元数据
function extractMetadata() {
  const meta: Record<string, string> = {};

  // Open Graph
  document.querySelectorAll('meta[property^="og:"]').forEach((el) => {
    const property = el.getAttribute('property');
    const content = el.getAttribute('content');
    if (property && content) {
      meta[property] = content;
    }
  });

  // Twitter Card
  document.querySelectorAll('meta[name^="twitter:"]').forEach((el) => {
    const name = el.getAttribute('name');
    const content = el.getAttribute('content');
    if (name && content) {
      meta[name] = content;
    }
  });

  // Description
  const description = document.querySelector('meta[name="description"]');
  if (description) {
    meta['description'] = description.getAttribute('content') || '';
  }

  return meta;
}

// 执行动作
async function executeAction(action: { type: string; params: Record<string, string> }) {
  switch (action.type) {
    case 'click':
      const element = document.querySelector(action.params.selector);
      if (element) {
        (element as HTMLElement).click();
        return { clicked: true };
      }
      throw new Error('Element not found');

    case 'fill':
      const input = document.querySelector(action.params.selector) as HTMLInputElement;
      if (input) {
        input.value = action.params.value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return { filled: true };
      }
      throw new Error('Input not found');

    case 'extract':
      const elements = document.querySelectorAll(action.params.selector);
      return Array.from(elements).map((el) => ({
        text: el.textContent?.trim(),
        html: el.innerHTML,
      }));

    case 'scroll':
      if (action.params.direction === 'top') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (action.params.direction === 'bottom') {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      } else if (action.params.selector) {
        const target = document.querySelector(action.params.selector);
        target?.scrollIntoView({ behavior: 'smooth' });
      }
      return { scrolled: true };

    case 'copy':
      const textToCopy =
        action.params.text ||
        window.getSelection()?.toString() ||
        document.body.innerText.substring(0, 1000);
      await navigator.clipboard.writeText(textToCopy);
      return { copied: true, length: textToCopy.length };

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

// 注入悬浮球（可选）
function injectFloatingButton() {
  const button = document.createElement('div');
  button.id = 'hawkeye-floating-btn';
  button.innerHTML = '🦅';
  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 48px;
    height: 48px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    z-index: 999999;
    transition: transform 0.2s, box-shadow 0.2s;
  `;

  button.addEventListener('mouseenter', () => {
    button.style.transform = 'scale(1.1)';
    button.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.5)';
  });

  button.addEventListener('mouseleave', () => {
    button.style.transform = 'scale(1)';
    button.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
  });

  button.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'analyze', context: {
      url: window.location.href,
      title: document.title,
      content: document.body.innerText.substring(0, 10000),
      selection: window.getSelection()?.toString() || '',
    }});
  });

  document.body.appendChild(button);
}

// 检查设置是否启用悬浮球
chrome.storage.local.get(['showFloatingButton']).then((data) => {
  if (data.showFloatingButton) {
    injectFloatingButton();
  }
});

console.log('Hawkeye content script loaded');
