import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import * as input from './game/input';
import * as runtime from './game/runtime';
import { useGame } from './game/store';

if (import.meta.env.DEV) {
  // Handy for poking at the game from the browser console / automated checks.
  (window as unknown as Record<string, unknown>).__silly = { runtime, useGame, input };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
