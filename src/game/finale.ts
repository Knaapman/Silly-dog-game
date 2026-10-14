import { create } from 'zustand';
import { gameNow } from './clock';

// The grand finale: everyone gathers at the fountain for a fireworks show. Two kinds:
//
//   bedtime  a grown-up's "time to stop" (or the play timer running out): the sun sets, fireworks,
//            the animals get sleepy, and a calm night screen waits with a "play again" button
//   album    the very last sticker: fireworks, and a golden crown for everyone, then play goes on
//
// The show itself runs in world/Finale.tsx; the sky colour and the night screen are in
// ui/FinaleOverlay.tsx. This is just where it's at.

export type FinaleKind = 'bedtime' | 'album';
/**
 * gather: everyone pops over to the fountain (and the sun starts to set, at bedtime)
 * show:   fireworks
 * sleep:  (bedtime) night falls, yawns and snores
 * night:  (bedtime) the night screen; the park waits, paused, for "play again"
 * crowns: (album) a golden crown pops onto every head
 */
export type FinalePhase = 'off' | 'gather' | 'show' | 'sleep' | 'night' | 'crowns';

type FinaleStore = {
  kind: FinaleKind;
  phase: FinalePhase;
  /** When the current phase began (game ms). */
  at: number;
  /** How many shows there have been (for tests and the play log). */
  shows: number;
  start: (kind: FinaleKind) => void;
  setPhase: (phase: FinalePhase) => void;
  end: () => void;
};

export const useFinale = create<FinaleStore>((set, get) => ({
  kind: 'bedtime',
  phase: 'off',
  at: 0,
  shows: 0,
  start: (kind) => {
    // (one show at a time: the bedtime show wins over a crown party already under way)
    const s = get();
    if (s.phase !== 'off' && !(kind === 'bedtime' && s.kind === 'album')) return;
    set({ kind, phase: 'gather', at: gameNow(), shows: s.shows + 1 });
  },
  setPhase: (phase) => set({ phase, at: gameNow() }),
  end: () => set({ phase: 'off', at: gameNow() })
}));

/** A finale is under way (players are held at the fountain, nobody gets on rides). */
export function finaleOn() {
  return useFinale.getState().phase !== 'off';
}

/** The night screen is up: the park sleeps (paused) until a grown-up presses play again. */
export function finaleAsleep() {
  return useFinale.getState().phase === 'night';
}

/** Phase lengths (s). */
export const FINALE = { gather: 1.6, show: 12, sleep: 4.5, crowns: 3 };
