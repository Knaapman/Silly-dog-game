import * as THREE from 'three';
import { create } from 'zustand';
import { playCheer } from './audio';
import { after, gameNow, seededRandom } from './clock';
import { PARTY_POINTS } from './config';
import { distXZ, TREASURE_HIGH_SPOTS, TREASURE_SPOTS, type Vec2 } from './layout';
import { loadJson, saveJson } from './storage';
import { earnSticker } from './stickers';
import { useGame } from './store';
import { groundHeight } from './terrain';

// The treasure hunt: five treasures hidden round the park, each in a different area. Find them
// all and there's a party, one more gem goes in the chest by the plaza, and five new treasures
// are hidden somewhere else. It never runs out. Which round it is (and what's been found) is
// remembered, so the next day starts where the last one stopped instead of in the same places.

export const TREASURES = 5;
/** Each treasure's colour (also its slot at the top of the screen). */
export const TREASURE_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f59e0b'] as const;
/** How long the party runs before the next five are hidden (seconds). */
export const NEXT_ROUND_AFTER = 8;

const KEY = 'hunt:v1';

type Saved = { round: number; found: boolean[]; chest: number };

function load(): Saved {
  const s = loadJson<Partial<Saved>>(KEY);
  const round = typeof s?.round === 'number' && s.round >= 0 ? Math.floor(s.round) : 0;
  const found = Array.from({ length: TREASURES }, (_, i) => !!(Array.isArray(s?.found) && s.found[i]));
  const chest = typeof s?.chest === 'number' && s.chest >= 0 ? Math.floor(s.chest) : 0;
  // a round saved as all found was mid-party: carry on with the next one
  return found.every(Boolean) ? { round: round + 1, found: found.map(() => false), chest } : { round, found, chest };
}

/** Where a treasure is: x and z, and for the ones up high, the height of what it sits on. */
export type TreasureSpot = Vec2 | [number, number, number];

/**
 * Where round `round` hides its treasures: one spot in each of five different areas. Every other
 * round, the last one goes somewhere harder instead (up high, or across the water).
 */
export function roundSpots(round: number): TreasureSpot[] {
  const random = seededRandom(round * 7919 + 101);
  const zones = [...new Set(TREASURE_SPOTS.map((s) => s.zone))];
  // shuffle the areas, take five, and a spot in each
  for (let i = zones.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [zones[i], zones[j]] = [zones[j], zones[i]];
  }
  const picked: TreasureSpot[] = zones.slice(0, TREASURES).map((zone) => {
    const spots = TREASURE_SPOTS.filter((s) => s.zone === zone);
    return spots[Math.floor(random() * spots.length)].at;
  });
  if (round % 2 === 1) {
    // one tricky one, not right next to another treasure
    const far = TREASURE_HIGH_SPOTS.filter((h) => picked.slice(0, -1).every((p) => distXZ(p[0], p[1], h.at[0], h.at[1]) > 8));
    const high = far[Math.floor(random() * far.length)];
    if (high) picked[TREASURES - 1] = [high.at[0], high.at[1], high.y];
  }
  return picked;
}

/** The height a treasure sits at (the ground, or what it's up on). */
export function spotHeight(spot: TreasureSpot) {
  return spot.length === 3 ? spot[2] : groundHeight(spot[0], spot[1]);
}

type HuntStore = Saved & {
  spots: TreasureSpot[];
  /** Game time (ms) of the last treasure found, and of the last round finished. */
  lastFoundAt: number;
  roundDoneAt: number;
  find: (i: number) => void;
  /** Tests: jump to a round. */
  setRound: (round: number) => void;
};

const initial = load();

export const useHunt = create<HuntStore>((set, get) => ({
  ...initial,
  spots: roundSpots(initial.round),
  lastFoundAt: -Infinity,
  roundDoneAt: -Infinity,
  find: (i) => {
    const s = get();
    if (s.found[i] || i < 0 || i >= TREASURES) return;
    const found = s.found.map((f, k) => f || k === i);
    const done = found.every(Boolean);
    set({ found, lastFoundAt: gameNow(), ...(done ? { chest: s.chest + 1, roundDoneAt: gameNow() } : {}) });
    earnSticker('treasure');
    const game = useGame.getState();
    if (done) {
      earnSticker('hunt');
      game.addParty(1);
      after(0.8, playCheer);
      const round = s.round;
      after(NEXT_ROUND_AFTER, () => {
        if (get().round === round) get().setRound(round + 1);
      });
    } else game.addParty(PARTY_POINTS.treasure);
    save();
  },
  setRound: (round) => {
    set({ round, found: Array.from({ length: TREASURES }, () => false), spots: roundSpots(round) });
    save();
  }
}));

function save() {
  const { round, found, chest } = useHunt.getState();
  saveJson(KEY, { round, found, chest });
}

/** Where treasure `i` is (on the ground). */
export function treasurePosition(i: number, out: THREE.Vector3) {
  const spot = useHunt.getState().spots[i];
  return out.set(spot[0], spotHeight(spot), spot[1]);
}

/** The nearest treasure still to be found, from `from`. False when there's none left (between rounds). */
export function nearestTreasure(from: THREE.Vector3, out: THREE.Vector3) {
  const { spots, found } = useHunt.getState();
  let best = Infinity;
  spots.forEach((spot, i) => {
    if (found[i]) return;
    const d = distXZ(from.x, from.z, spot[0], spot[1]);
    if (d < best) {
      best = d;
      out.set(spot[0], spotHeight(spot), spot[1]);
    }
  });
  return best < Infinity;
}
