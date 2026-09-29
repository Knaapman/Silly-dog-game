import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import * as clock from './game/clock';
import { seededRandom } from './game/clock';
import * as input from './game/input';
import { setupInstall } from './game/install';
import { TEST_MODE, TEST_SEED } from './game/testMode';
import * as runtime from './game/runtime';
import * as chase from './game/chase';
import * as terrain from './game/terrain';
import * as layout from './game/layout';
import { usePhotos } from './game/photo';
import { perf } from './game/perf';
import { useProgress } from './game/progress';
import { useSettings } from './game/settings';
import { useStickers } from './game/stickers';
import { useHunt } from './game/hunt';
import { useSkyCourse } from './game/skycourse';
import { useSledding } from './game/sledding';
import { useCoop } from './game/coop';
import * as events from './game/world/Events';
import * as guide from './game/guide';
import { buddyControl } from './game/world/Buddy';
import { useGame } from './game/store';

if (TEST_MODE) Math.random = seededRandom(TEST_SEED);

if (import.meta.env.DEV || TEST_MODE) {
  // Handy for poking at the game from the browser console / automated checks.
  const w = window as unknown as { __silly?: Record<string, unknown> };
  w.__silly = { ...w.__silly, runtime, chase, terrain, layout, useGame, useSettings, useProgress, usePhotos, useStickers, useHunt, useSkyCourse, useSledding, useCoop, events, guide, buddyControl, perf, input, clock };
}

setupInstall();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
