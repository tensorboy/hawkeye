/**
 * Hawkeye Desktop - Renderer Entry
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

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
