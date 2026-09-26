import { create } from 'zustand';
import { HATS, type HatId } from './config';
import { gameNow } from './clock';
import { loadJson, removeKey, saveJson } from './storage';

// Progress that stays between visits: every golden star ever found counts towards new hats.

/** How many stars (ever) unlock each hat. The first hat is free; the last takes a whole round. */
export const HAT_UNLOCKS: { hat: Exclude<HatId, 'none'>; stars: number }[] = [
  { hat: 'party', stars: 0 },
  { hat: 'crown', stars: 1 },
  { hat: 'propeller', stars: 3 },
  { hat: 'flower', stars: 5 },
  { hat: 'cowboy', stars: 7 },
  { hat: 'tophat', stars: 9 },
  { hat: 'duck', stars: 12 }
];

const KEY = 'progress:v1';

type ProgressStore = {
  starsEver: number;
  /** The hat unlocked most recently, and when (game ms), for the big "new hat!" moment. */
  lastUnlock: { hat: HatId; at: number } | null;
  /** Count one found star. Returns the hat it unlocked, if any. */
  addStar: () => HatId | null;
  reset: () => void;
};

function load(): number {
  const saved = loadJson<{ starsEver?: unknown }>(KEY);
  const n = saved?.starsEver;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export const useProgress = create<ProgressStore>((set, get) => ({
  starsEver: load(),
  lastUnlock: null,
  addStar: () => {
    const starsEver = get().starsEver + 1;
    const unlocked = HAT_UNLOCKS.find((u) => u.stars === starsEver)?.hat ?? null;
    set({ starsEver, lastUnlock: unlocked ? { hat: unlocked, at: gameNow() } : get().lastUnlock });
    saveJson(KEY, { starsEver });
    return unlocked;
  },
  reset: () => {
    set({ starsEver: 0, lastUnlock: null });
    removeKey(KEY);
  }
}));

export function isHatUnlocked(hat: HatId, starsEver = useProgress.getState().starsEver) {
  if (hat === 'none') return true;
  const u = HAT_UNLOCKS.find((x) => x.hat === hat);
  return !!u && starsEver >= u.stars;
}

/** Unlocked hats in the usual order, 'none' first. */
export function unlockedHats(starsEver = useProgress.getState().starsEver): HatId[] {
  return HATS.filter((h) => isHatUnlocked(h, starsEver));
}
