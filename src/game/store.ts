import { create } from 'zustand';
import { HATS, MAX_PLAYERS, PARTY_DURATION_MS, PARTY_POINTS, PLAYER_COLORS, SPECIES, type HatId, type Species } from './config';
import { GOLDEN_STARS } from './layout';
import { playCheer, playFanfare, playHatTada } from './audio';
import { players as runtimePlayers } from './runtime';
import type { SourceId } from './input';

// Reactive state only for things the UI / scene graph needs to re-render on.
// Per-frame data lives in runtime.ts.

export type PlayerInfo = {
  slot: number;
  source: SourceId;
  species: Species;
  hat: HatId;
  color: string;
  joinedAt: number;
};

type Phase = 'title' | 'play';

interface GameStore {
  phase: Phase;
  players: PlayerInfo[];
  party: number;
  partyUntil: number;
  partyStartedAt: number;
  partyCount: number;
  stars: boolean[];
  lastStarAt: number;
  menuOpen: boolean;
  resetToken: number;
  touchUi: boolean;

  start: (source: SourceId) => void;
  join: (source: SourceId) => number | null;
  leave: (slot: number) => void;
  backToTitle: () => void;
  cycleSpecies: (slot: number, dir?: number) => void;
  nextHat: (slot: number) => void;
  randomHat: (slot: number) => void;
  addParty: (amount: number) => void;
  collectStar: (index: number) => void;
  resetPark: () => void;
  setMenuOpen: (open: boolean) => void;
  setTouchUi: (enabled: boolean) => void;
}

function pickRandomHat(current: HatId): HatId {
  const options = HATS.filter((h) => h !== 'none' && h !== current);
  return options[Math.floor(Math.random() * options.length)];
}

export const useGame = create<GameStore>((set, get) => {
  const startParty = (durationMs: number) => {
    const now = Date.now();
    set((state) => ({
      party: 0,
      partyUntil: now + durationMs,
      partyStartedAt: now,
      partyCount: state.partyCount + 1,
      players: state.players.map((p) => ({ ...p, hat: pickRandomHat(p.hat) }))
    }));
    playFanfare();
    window.setTimeout(playCheer, 900);
    runtimePlayers.forEach((p) => p.hop(12));
  };

  return {
    phase: 'title',
    players: [],
    party: 0,
    partyUntil: 0,
    partyStartedAt: 0,
    partyCount: 0,
    stars: GOLDEN_STARS.map(() => false),
    lastStarAt: 0,
    menuOpen: false,
    resetToken: 0,
    touchUi: false,

    start: (source) => {
      set({ phase: 'play' });
      if (!get().players.some((p) => p.source === source)) get().join(source);
    },

    join: (source) => {
      const state = get();
      if (state.players.some((p) => p.source === source)) return null;
      if (state.players.length >= MAX_PLAYERS) return null;
      const used = new Set(state.players.map((p) => p.slot));
      let slot = 0;
      while (used.has(slot)) slot += 1;
      const player: PlayerInfo = {
        slot,
        source,
        species: SPECIES[slot % SPECIES.length],
        hat: 'none',
        color: PLAYER_COLORS[slot],
        joinedAt: Date.now()
      };
      set({ players: [...state.players, player].sort((a, b) => a.slot - b.slot) });
      return slot;
    },

    leave: (slot) => set((state) => ({ players: state.players.filter((p) => p.slot !== slot) })),

    backToTitle: () => set({ phase: 'title', players: [], menuOpen: false }),

    cycleSpecies: (slot, dir = 1) =>
      set((state) => ({
        players: state.players.map((p) => {
          if (p.slot !== slot) return p;
          const i = SPECIES.indexOf(p.species);
          return { ...p, species: SPECIES[(i + dir + SPECIES.length) % SPECIES.length] };
        })
      })),

    nextHat: (slot) =>
      set((state) => ({
        players: state.players.map((p) => (p.slot === slot ? { ...p, hat: HATS[(HATS.indexOf(p.hat) + 1) % HATS.length] } : p))
      })),

    randomHat: (slot) => {
      set((state) => ({
        players: state.players.map((p) => (p.slot === slot ? { ...p, hat: pickRandomHat(p.hat) } : p))
      }));
      playHatTada(runtimePlayers.get(slot)?.position);
    },

    addParty: (amount) => {
      const state = get();
      if (state.phase !== 'play' || Date.now() < state.partyUntil) return;
      const next = state.party + amount;
      if (next >= 1) startParty(PARTY_DURATION_MS);
      else set({ party: next });
    },

    collectStar: (index) => {
      const state = get();
      if (state.stars[index]) return;
      const stars = state.stars.map((s, i) => (i === index ? true : s));
      set({ stars, lastStarAt: Date.now() });
      if (stars.every(Boolean)) {
        // Every golden star found: huge party, then hide them all again for another round.
        startParty(PARTY_DURATION_MS + 4000);
        window.setTimeout(() => set({ stars: GOLDEN_STARS.map(() => false) }), PARTY_DURATION_MS + 4000);
      } else {
        get().addParty(PARTY_POINTS.star);
      }
    },

    resetPark: () => set((state) => ({ resetToken: state.resetToken + 1 })),

    setMenuOpen: (open) => set({ menuOpen: open }),

    setTouchUi: (enabled) => set({ touchUi: enabled })
  };
});

export function isPartyTime() {
  return Date.now() < useGame.getState().partyUntil;
}
