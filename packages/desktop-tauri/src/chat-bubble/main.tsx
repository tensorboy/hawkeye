/**
 * Entry point for the chat-bubble window (3rd Tauri WebviewWindow).
 * A system-wide floating chat: collapsed 🦅 dot anchored to the screen's
 * bottom-right corner, expanding into a gaze-aware conversation panel.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatBubble } from './ChatBubble';
import './ChatBubble.css';

const root = document.getElementById('chat-bubble-root');
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <ChatBubble />
    </React.StrictMode>,
  );
}
