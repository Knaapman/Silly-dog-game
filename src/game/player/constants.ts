import * as THREE from 'three';
import type { PowerKind, PropEntry } from '../runtime';

/** Physics ball radius of an animal (times its size while giant). */
export const RADIUS = 0.5;
/** Animals are drawn a bit bigger than their physics ball so small kids can read them. */
export const MODEL_SCALE = 1.15;
export const UP = new THREE.Vector3(0, 1, 0);

/** Magic food: how long it lasts, how big the mushroom makes you, and its colour. */
export const POWER_TIME: Record<PowerKind, number> = { beans: 12, giant: 15, chili: 10 };
export const GIANT_SIZE = 2.2;
export const POWER_COLOR: Record<PowerKind, string> = { beans: '#8bc34a', giant: '#ff4d5e', chili: '#ff7a1a' };

/** How high the "bonk" sounds for each thing you headbutt. */
export const BONK_PITCH: Partial<Record<PropEntry['kind'], number>> = {
  chicken: 1.6,
  dino: 1.9,
  poop: 0.5,
  cow: 0.6,
  snowball: 0.8,
  duck: 1.8,
  ball: 1.4,
  beachball: 1.2,
  apple: 1.5,
  hay: 0.7,
  barrel: 0.8,
  bowling: 0.6,
  crate: 0.9
};
