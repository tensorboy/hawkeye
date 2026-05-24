/**
 * Entry point for the explain-overlay window (a 2nd Tauri WebviewWindow).
 * Tiny by design: renders one component, listens for one event.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ExplainCard } from './ExplainCard';

const root = document.getElementById('explain-root');
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <ExplainCard />
    </React.StrictMode>,
  );
}
