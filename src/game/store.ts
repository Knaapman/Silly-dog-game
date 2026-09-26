import { create } from 'zustand';
import { BASE_SPECIES, MAX_PLAYERS, PARTY_DURATION_MS, PARTY_POINTS, PLAYER_COLORS, type HatId, type Species } from './config';
import { GOLDEN_STARS } from './layout';
import { playCheer, playFanfare, playHatTada } from './audio';
import { players as runtimePlayers } from './runtime';
import { discardPendingPresses, padIdOf, rumbleAll, type SourceId } from './input';
import { after, gameNow } from './clock';
import { unlockedHats, useProgress } from './progress';
import { earnSticker, unlockedSpecies } from './stickers';

// Reactive state only for things the UI / scene graph needs to re-render on.
// Per-frame data lives in runtime.ts.

export type PlayerInfo = {
  slot: number;
  source: SourceId;
  species: Species;
  hat: HatId;
  color: string;
  joinedAt: number;
  /** Gamepad id string, so a controller that reconnects (even on a new index) gets its animal back. */
  padId?: string;
  /** Controller disconnected: the animal naps until it comes back. */
  asleep?: boolean;
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
  /** The sticker album is open (the game waits, like with the grown-ups menu). */
  albumOpen: boolean;
  resetToken: number;
  touchUi: boolean;

  start: (source: SourceId) => void;
  join: (source: SourceId) => number | null;
  leave: (slot: number) => void;
  setAsleep: (slot: number, asleep: boolean) => void;
  reattach: (slot: number, source: SourceId) => void;
  backToTitle: () => void;
  cycleSpecies: (slot: number, dir?: number) => void;
  nextHat: (slot: number) => void;
  randomHat: (slot: number) => void;
  setHat: (slot: number, hat: HatId) => void;
  addParty: (amount: number) => void;
  /** `slot`: who found it (they get to wear any hat it unlocks). */
  collectStar: (index: number, slot?: number) => void;
  resetPark: () => void;
  setMenuOpen: (open: boolean) => void;
  setAlbumOpen: (open: boolean) => void;
  setTouchUi: (enabled: boolean) => void;
}

/** A different hat, from the ones the stars have unlocked so far. */
function pickRandomHat(current: HatId): HatId {
  const options = unlockedHats().filter((h) => h !== 'none' && h !== current);
  if (options.length === 0) return current === 'none' ? (unlockedHats().find((h) => h !== 'none') ?? 'none') : current;
  return options[Math.floor(Math.random() * options.length)];
}

export const useGame = create<GameStore>((set, get) => {
  const startParty = (durationMs: number) => {
    const now = gameNow();
    set((state) => ({
      party: 0,
      partyUntil: now + durationMs,
      partyStartedAt: now,
      partyCount: state.partyCount + 1,
      players: state.players.map((p) => ({ ...p, hat: pickRandomHat(p.hat) }))
    }));
    playFanfare();
    earnSticker('party');
    after(0.9, playCheer);
    runtimePlayers.forEach((p) => p.hop(12));
    rumbleAll(get().players.map((p) => p.source), 0.7, 0.9, 600);
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
    albumOpen: false,
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
        species: BASE_SPECIES[slot % BASE_SPECIES.length],
        hat: 'none',
        color: PLAYER_COLORS[slot],
        joinedAt: Date.now(),
        padId: padIdOf(source)
      };
      set({ players: [...state.players, player].sort((a, b) => a.slot - b.slot) });
      return slot;
    },

    leave: (slot) => set((state) => ({ players: state.players.filter((p) => p.slot !== slot) })),

    setAsleep: (slot, asleep) =>
      set((state) => ({ players: state.players.map((p) => (p.slot === slot && !!p.asleep !== asleep ? { ...p, asleep } : p)) })),

    reattach: (slot, source) =>
      set((state) => ({ players: state.players.map((p) => (p.slot === slot ? { ...p, source, asleep: false, padId: padIdOf(source) ?? p.padId } : p)) })),

    backToTitle: () => set({ phase: 'title', players: [], menuOpen: false, albumOpen: false }),

    cycleSpecies: (slot, dir = 1) =>
      set((state) => ({
        players: state.players.map((p) => {
          if (p.slot !== slot) return p;
          const all = unlockedSpecies();
          const i = Math.max(0, all.indexOf(p.species));
          return { ...p, species: all[(i + dir + all.length) % all.length] };
        })
      })),

    nextHat: (slot) => {
      const hats = unlockedHats();
      set((state) => ({
        players: state.players.map((p) => (p.slot === slot ? { ...p, hat: hats[(hats.indexOf(p.hat) + 1) % hats.length] } : p))
      }));
    },

    setHat: (slot, hat) => set((state) => ({ players: state.players.map((p) => (p.slot === slot ? { ...p, hat } : p)) })),

    randomHat: (slot) => {
      set((state) => ({
        players: state.players.map((p) => (p.slot === slot ? { ...p, hat: pickRandomHat(p.hat) } : p))
      }));
      playHatTada(runtimePlayers.get(slot)?.position);
    },

    addParty: (amount) => {
      const state = get();
      if (state.phase !== 'play' || gameNow() < state.partyUntil) return;
      const next = state.party + amount;
      if (next >= 1) startParty(PARTY_DURATION_MS);
      else set({ party: next });
    },

    collectStar: (index, slot) => {
      const state = get();
      if (state.stars[index]) return;
      const stars = state.stars.map((s, i) => (i === index ? true : s));
      set({ stars, lastStarAt: gameNow() });
      earnSticker('star');
      if (stars.every(Boolean)) earnSticker('allstars');
      // Every star counts towards new hats; whoever found it wears the new one straight away.
      const unlocked = useProgress.getState().addStar();
      if (unlocked && slot != null) get().setHat(slot, unlocked);
      rumbleAll(state.players.map((p) => p.source), 0.4, 0.8, 300);
      if (stars.every(Boolean)) {
        // Every golden star found: huge party, then hide them all again for another round.
        startParty(PARTY_DURATION_MS + 4000);
        after((PARTY_DURATION_MS + 4000) / 1000, () => set({ stars: GOLDEN_STARS.map(() => false) }));
      } else {
        get().addParty(PARTY_POINTS.star);
      }
    },

    resetPark: () => set((state) => ({ resetToken: state.resetToken + 1 })),

    // Buttons pressed to use a menu or the album mustn't also do something in the game (the
    // key that picks a sticker is also player two's jump / join key).
    setMenuOpen: (open) => {
      if (!open && get().menuOpen) discardPendingPresses();
      set(open ? { menuOpen: true, albumOpen: false } : { menuOpen: false });
    },

    setAlbumOpen: (open) => {
      if (!open && get().albumOpen) discardPendingPresses();
      set(open ? { albumOpen: true, menuOpen: false } : { albumOpen: false });
    },

    setTouchUi: (enabled) => set({ touchUi: enabled })
  };
});

export function isPartyTime() {
  return gameNow() < useGame.getState().partyUntil;
}

/** The game waits while a grown-up menu or the sticker album is open. */
export function isPaused(state: { menuOpen: boolean; albumOpen: boolean } = useGame.getState()) {
  return state.menuOpen || state.albumOpen;
}
