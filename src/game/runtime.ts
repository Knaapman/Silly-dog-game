import type { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';

// Mutable, non-reactive world registry. Everything that changes every frame lives here
// (never in zustand) so 60fps updates don't trigger React renders.

export type PropKind =
  | 'ball'
  | 'beachball'
  | 'soccer'
  | 'bowling'
  | 'crate'
  | 'barrel'
  | 'cone'
  | 'hay'
  | 'melon'
  | 'pin'
  | 'apple'
  | 'duck'
  | 'chicken';

export type PropEntry = {
  id: number;
  kind: PropKind;
  getBody: () => RapierRigidBody | null;
  /** Approximate radius used for headbutt / tongue hit tests. */
  radius: number;
  /** Speed a headbutt gives it (lighter things fly further). */
  launch: number;
  heavy: boolean;
  grabbable: boolean;
  enabled: boolean;
  heldBy: number | null;
  onBonk?: (slot: number, dir: THREE.Vector3) => void;
  onGrab?: (slot: number) => boolean | void;
  onRelease?: () => void;
};

export const props = new Map<number, PropEntry>();
let nextPropId = 1;

export function allocPropId() {
  return nextPropId++;
}

export function registerProp(entry: PropEntry) {
  props.set(entry.id, entry);
  return () => {
    props.delete(entry.id);
  };
}

export function propPosition(entry: PropEntry, out: THREE.Vector3) {
  const body = entry.getBody();
  if (!body) return null;
  const t = body.translation();
  return out.set(t.x, t.y, t.z);
}

/** Static things that react to a headbutt (trees, the hat box...). */
export type StaticBonkable = {
  id: number;
  position: THREE.Vector3;
  radius: number;
  onBonk: (slot: number, dir: THREE.Vector3) => void;
};

export const statics = new Map<number, StaticBonkable>();

export function registerStatic(entry: StaticBonkable) {
  statics.set(entry.id, entry);
  return () => {
    statics.delete(entry.id);
  };
}

export type PlayerRuntime = {
  slot: number;
  getBody: () => RapierRigidBody | null;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  facing: number;
  flopped: boolean;
  /** Called when another player headbutts this one. */
  bump: (dir: THREE.Vector3) => void;
  hop: (vy: number) => void;
};

export const players = new Map<number, PlayerRuntime>();

/** Recent animal noises; critters listen to these. */
export const noises: { position: THREE.Vector3; time: number; slot: number }[] = [];

export function pushNoise(position: THREE.Vector3, slot: number) {
  const now = performance.now();
  noises.push({ position: position.clone(), time: now, slot });
  while (noises.length > 0 && now - noises[0].time > 2000) noises.shift();
}

export const trampolineBounces = new Map<number, number>();

export const camera = {
  focus: new THREE.Vector3(0, 0, 4),
  shake: 0
};

const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function shakeCamera(amount: number) {
  if (reducedMotion) return;
  camera.shake = Math.min(1.2, Math.max(camera.shake, amount));
}

/** Spawns an apple from a tree; set by the orchard component. */
export const spawners = {
  apple: (_position: THREE.Vector3) => {}
};

export function playersCentroid(out: THREE.Vector3, excludeSlot?: number) {
  let count = 0;
  out.set(0, 0, 0);
  players.forEach((p) => {
    if (p.slot === excludeSlot) return;
    out.add(p.position);
    count += 1;
  });
  if (count > 0) out.divideScalar(count);
  return count;
}
