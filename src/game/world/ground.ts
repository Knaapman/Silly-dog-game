import type { RapierRigidBody } from '@react-three/rapier';
import { debugInfo } from '../runtime';
import { groundHeight } from '../terrain';

/** A thing whose middle is this far below the ground has got under it (m). */
const UNDER = 0.3;

/** How many times something was put back on top of the ground (for the tests). */
export const lifted = { count: 0 };
debugInfo.lifted = lifted;

/**
 * Never under the ground, for the things that roll and fly about (the animals have their own:
 * keepAboveGround in player/body.ts). The sea and river beds lie just above the floor under the
 * park, so a hard landing can punch a ball, a crate or a cat through, to sit half in the bed; and
 * anything that got under higher ground would roll about beneath the world. Put it back on top.
 * Returns whether it had to.
 */
export function liftIfUnder(rb: RapierRigidBody, radius: number) {
  const t = rb.translation();
  const g = groundHeight(t.x, t.z);
  if (t.y > g - UNDER) return false;
  rb.setTranslation({ x: t.x, y: g + radius + 0.05, z: t.z }, true);
  const v = rb.linvel();
  rb.setLinvel({ x: v.x, y: Math.max(0, v.y), z: v.z }, true);
  lifted.count += 1;
  return true;
}
