import * as THREE from 'three';
import { create } from 'zustand';
import { playCheer } from './audio';
import { after, gameNow } from './clock';
import { PARTY_POINTS } from './config';
import { earnSticker } from './stickers';
import { useGame } from './store';

// The chase: park cats to tag (they flee up a tree; bark them back down) and bird flocks to
// scatter. The world objects register here, so the guide, the buddy and tests can find them.

export type CatMode = 'idle' | 'stalk' | 'alert' | 'flee' | 'tagged' | 'toTree' | 'tree' | 'fall' | 'dizzy' | 'held';

export type CatRuntime = {
  index: number;
  position: THREE.Vector3;
  mode: CatMode;
  /** Tree it's sitting in (index into TREES), or -1. */
  tree: number;
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

type ChaseStore = {
  /** Which cats have been tagged this round (all of them: a cheer, and a new round). */
  tagged: boolean[];
  lastTagAt: number;
  roundDoneAt: number;
  tag: (cat: number) => void;
};

export const useChase = create<ChaseStore>((set, get) => ({
  tagged: Array.from({ length: CAT_COUNT }, () => false),
  lastTagAt: -1e9,
  roundDoneAt: -1e9,
  tag: (cat) => {
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
      set({ roundDoneAt: gameNow() });
      earnSticker('allcats');
      playCheer();
      game.addParty(PARTY_POINTS.star * 2);
      after(3.5, () => set({ tagged: tagged.map(() => false) }));
    }
  }
}));
