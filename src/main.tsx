import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import * as clock from './game/clock';
import { seededRandom } from './game/clock';
import * as input from './game/input';
import { TEST_MODE, TEST_SEED } from './game/testMode';
import * as runtime from './game/runtime';
import { usePhotos } from './game/photo';
import { useProgress } from './game/progress';
import { useSettings } from './game/settings';
import { useGame } from './game/store';

if (TEST_MODE) Math.random = seededRandom(TEST_SEED);

if (import.meta.env.DEV || TEST_MODE) {
  // Handy for poking at the game from the browser console / automated checks.
  const w = window as unknown as { __silly?: Record<string, unknown> };
  w.__silly = { ...w.__silly, runtime, useGame, useSettings, useProgress, usePhotos, input, clock };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
