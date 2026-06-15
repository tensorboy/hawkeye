/**
 * Shadow Desktop - Renderer Entry
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './i18n';
// Tailwind CSS (includes DaisyUI)
import './tailwind.css';
// Legacy styles (will be gradually replaced by Tailwind)
import './styles.css';
import './styles/a2ui.css';

window.addEventListener('error', (event) => {
  window.hawkeye?.reportRendererError?.({
    type: 'error',
    message: event.message || 'Unknown renderer error',
    source: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    stack: event.error?.stack,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const message = typeof reason === 'string' ? reason : String(reason?.message || reason || 'Unhandled rejection');
  window.hawkeye?.reportRendererError?.({
    type: 'unhandledrejection',
    message,
    stack: reason?.stack,
  });
});

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
