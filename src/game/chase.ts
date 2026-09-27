import type { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { create } from 'zustand';
import { playCheer } from './audio';
import { after, gameNow } from './clock';
import { PARTY_POINTS } from './config';
import { settings, type Level } from './settings';
import { earnSticker } from './stickers';
import { useGame } from './store';

// The chase: park cats to tag (they flee up a tree; bark them back down) and bird flocks to
// scatter. The world objects register here, so the guide, the buddy and tests can find them.

export type CatMode = 'idle' | 'stalk' | 'alert' | 'flee' | 'tagged' | 'toTree' | 'tree' | 'fall' | 'dizzy' | 'held' | 'conga';

export type CatRuntime = {
  index: number;
  position: THREE.Vector3;
  mode: CatMode;
  /** Tree it's sitting in (index into TREES), or -1. */
  tree: number;
  getBody: () => RapierRigidBody | null;
};

export type FlockRuntime = {
  index: number;
  /** Where the flock is (the landing spot while down, the middle of the flock while flying). */
  center: THREE.Vector3;
  landed: boolean;
  /** Something scary: everybody up! `slot` is the player who did it (null: a cat). */
  scare: (from: THREE.Vector3, slot: number | null) => void;
};

export const parkCats: CatRuntime[] = [];
export const flocks: FlockRuntime[] = [];

/** Called with the tree index whenever a tree gets shaken (headbutt, or a bark under it). */
export const treeShakeListeners = new Set<(tree: number) => void>();

export const CAT_COUNT = 4;
/** After all four are tagged they follow the child in a line for this long (ms). */
export const CONGA_MS = 20000;

// ---------------------------------------------------------------------------
// How hard a cat is to catch. Three fixed levels, or 'auto': every child has a skill number
// (0 easy .. 1 tricky) that creeps up with quick catches and down when cats get away, and the
// cats they chase run accordingly. So a five-year-old and a six-year-old on the same sofa each
// get a cat they can just about catch.

export type ChaseParams = {
  /** Flee speed as a fraction of the child's running speed: fresh, then tired (after 3 s). */
  speed: [number, number];
  /** How close a child gets before the cat notices: awake, and napping. */
  notice: [number, number];
  /** How close counts as tagged. */
  tag: number;
};

export const CHASE_LEVELS: ChaseParams[] = [
  { speed: [0.72, 0.5], notice: [4.5, 2.5], tag: 1.9 }, // easy
  { speed: [0.86, 0.62], notice: [5.5, 3.5], tag: 1.5 }, // normal
  { speed: [0.97, 0.78], notice: [7, 4.5], tag: 1.25 } // tricky
];

/** Cat behaviour for a skill of 0..1: easy at 0, normal at 0.5, tricky at 1, blended between. */
export function paramsForSkill(skill: number): ChaseParams {
  const k = Math.min(1, Math.max(0, skill)) * 2;
  const i = Math.min(1, Math.floor(k));
  const f = k - i;
  const a = CHASE_LEVELS[i];
  const b = CHASE_LEVELS[i + 1];
  const mix = (x: number, y: number) => x + (y - x) * f;
  return { speed: [mix(a.speed[0], b.speed[0]), mix(a.speed[1], b.speed[1])], notice: [mix(a.notice[0], b.notice[0]), mix(a.notice[1], b.notice[1])], tag: mix(a.tag, b.tag) };
}

export type ChaseOutcome = 'tagged' | 'escaped';

/** The skill after one chase: quick catches push it up, a cat that got away pulls it down. */
export function adaptSkill(skill: number, outcome: ChaseOutcome, seconds: number) {
  let next = skill;
  if (outcome === 'escaped') next -= 0.12;
  else if (seconds <= 5) next += 0.1;
  else if (seconds <= 12) next += 0.03;
  else next -= 0.05;
  return Math.round(Math.min(1, Math.max(0, next)) * 1000) / 1000;
}

type ChaseStore = {
  /** Which cats have been tagged this round (all of them: a cheer, and a new round). */
  tagged: boolean[];
  lastTagAt: number;
  roundDoneAt: number;
  /** The cats follow this child in a line until this time (game ms). */
  congaUntil: number;
  congaLeader: number;
  /** Per player slot, for 'auto': how good this child is at catching cats (0..1). */
  skill: number[];
  tag: (cat: number, slot: number) => void;
  reportChase: (slot: number, outcome: ChaseOutcome, seconds: number) => void;
};

export const useChase = create<ChaseStore>((set, get) => ({
  tagged: Array.from({ length: CAT_COUNT }, () => false),
  lastTagAt: -1e9,
  roundDoneAt: -1e9,
  congaUntil: -1e9,
  congaLeader: -1,
  skill: [0.5, 0.5, 0.5, 0.5],
  tag: (cat, slot) => {
    const game = useGame.getState();
    game.addParty(PARTY_POINTS.star);
    earnSticker('cattag');
    if (get().tagged[cat]) {
      set({ lastTagAt: gameNow() });
      return;
    }
    const tagged = get().tagged.map((t, i) => t || i === cat);
    set({ tagged, lastTagAt: gameNow() });
    if (tagged.every(Boolean)) {
      set({ roundDoneAt: gameNow(), congaUntil: gameNow() + CONGA_MS, congaLeader: slot });
      earnSticker('allcats');
      playCheer();
      game.addParty(PARTY_POINTS.star * 2);
      after(3.5, () => set({ tagged: tagged.map(() => false) }));
    }
  },
  reportChase: (slot, outcome, seconds) => {
    if (slot < 0 || slot >= CAT_COUNT) return;
    const skill = [...get().skill];
    skill[slot] = adaptSkill(skill[slot] ?? 0.5, outcome, seconds);
    set({ skill });
  }
}));

/** How the cats behave for the child in `slot` (the grown-ups' setting, or their own skill). */
export function chaseParams(slot: number): ChaseParams {
  const level: Level | 'auto' = settings().chase;
  if (level !== 'auto') return CHASE_LEVELS[level];
  return paramsForSkill(useChase.getState().skill[slot] ?? 0.5);
}
