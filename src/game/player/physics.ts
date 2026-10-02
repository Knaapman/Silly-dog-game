import * as THREE from 'three';
import { GRAVITY } from '../config';
import { SPAWN_POINTS } from '../layout';
import { playersCentroid } from '../runtime';
import { groundHeight } from '../terrain';

export function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Velocity that lands on `to` after peaking at absolute height `apex`. Returns the flight time. */
export function ballistic(from: THREE.Vector3, to: THREE.Vector3, apex: number, out: THREE.Vector3) {
  const g = -GRAVITY;
  const top = Math.max(apex, from.y + 0.5, to.y + 0.5);
  const vy = Math.sqrt(2 * g * (top - from.y));
  const tUp = vy / g;
  const tDown = Math.sqrt((2 * (top - to.y)) / g);
  const time = tUp + tDown;
  out.set((to.x - from.x) / time, vy, (to.z - from.z) / time);
  return time;
}

/** Where a (re)spawning animal appears: next to the others, or on its own spawn point. */
export function pickSpawn(slot: number) {
  const others = new THREE.Vector3();
  const count = playersCentroid(others, slot);
  if (count > 0) {
    const a = Math.random() * Math.PI * 2;
    const x = others.x + Math.cos(a) * 2.5;
    const z = others.z + Math.sin(a) * 2.5;
    // (above the ground there: the others may be up the mountain)
    return new THREE.Vector3(x, groundHeight(x, z) + 3, z);
  }
  const p = SPAWN_POINTS[slot % SPAWN_POINTS.length];
  return new THREE.Vector3(p[0], 5, p[2]);
}
