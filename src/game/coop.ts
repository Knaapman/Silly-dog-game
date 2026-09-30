import { create } from 'zustand';
import { CHICKEN_COOP, CHICKEN_HOME } from './layout';

// The chicken round-up: which chickens are in the coop. Once in, a chicken stays in (so the
// count only goes up). All of them in: a party, and after a while the gate opens and they
// wander back out to their yard, for another round-up.

/** How long the chickens stay in after the round-up (seconds). */
export const PENNED_FOR = 45;

export const useCoop = create<{
  penned: boolean[];
  /** Game time (ms) the last one went in (all of them), or -1. */
  doneAt: number;
  pen: (i: number, on: boolean) => void;
  finish: (at: number) => void;
  release: () => void;
}>((set) => ({
  penned: Array.from({ length: CHICKEN_HOME.count }, () => false),
  doneAt: -1,
  pen: (i, on) => set((s) => (s.penned[i] === on ? s : { penned: s.penned.map((p, k) => (k === i ? on : p)) })),
  finish: (at) => set({ doneAt: at }),
  release: () => set({ penned: Array.from({ length: CHICKEN_HOME.count }, () => false), doneAt: -1 })
}));

const [cx, cz] = CHICKEN_COOP.center;
const half = CHICKEN_COOP.size / 2;

/** Inside the pen (a little way in from the fence). */
export function inCoop(x: number, z: number, margin = 0.25) {
  return Math.abs(x - cx) < half - margin && Math.abs(z - cz) < half - margin;
}

/** Just outside the gate (north side), and just inside it. */
export const GATE_OUT = { x: cx, z: cz - half - 1.2 };
export const GATE_IN = { x: cx, z: cz - half + 1 };
