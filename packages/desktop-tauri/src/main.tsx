import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { bootstrap } from './lib/api';
import './tailwind.css';
import './styles.css';

// Resolve the daemon URL + token BEFORE the React tree mounts. Every
// useTauri.ts wrapper depends on these, and we don't want a flash of
// 401s on first render. The bootstrap is fast (~one IPC + cached
// localStorage) so the perceptible delay is < 50ms.
async function start() {
  try {
    await bootstrap();
  } catch (e) {
    // Don't block rendering — the api layer will surface per-call errors
    // at the consumer if the daemon isn't reachable.
    console.warn('[main] daemon bootstrap failed:', e);
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

start();
