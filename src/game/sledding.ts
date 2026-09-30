import { create } from 'zustand';
import { loadJson, saveJson } from './storage';

// The sled run's record: the furthest anyone has ever flown off the hill (its landing x: further
// west = further). A golden flag stands there; it's remembered on this device.

const KEY = 'sled:v1';

function load(): number | null {
  const saved = loadJson<{ best?: unknown }>(KEY);
  return typeof saved?.best === 'number' && Number.isFinite(saved.best) ? saved.best : null;
}

export const useSledding = create<{
  best: number | null;
  /** Where the last flight landed, and when (game ms). */
  last: { x: number; at: number } | null;
  /** A sled flight landed at `x`. True when that's a new record. */
  land: (x: number, at: number) => boolean;
}>((set, get) => ({
  best: load(),
  last: null,
  land: (x, at) => {
    const best = get().best;
    const record = best == null || x < best - 0.05;
    set(record ? { best: x, last: { x, at } } : { last: { x, at } });
    if (record) saveJson(KEY, { best: x });
    return record;
  }
}));
