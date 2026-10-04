import type * as RAPIER from '@dimforge/rapier3d-compat';
import type { useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { playBoing, playPoof, playXylo } from '../audio';
import { gameNow } from '../clock';
import { WORLD_HALF_X, WORLD_HALF_Z } from '../config';
import { poof, ring } from '../fx';
import { rumble } from '../input';
import { SPAWN_POINTS } from '../layout';
import { debugInfo, players } from '../runtime';
import { groundHeight, isInWater } from '../terrain';
import { endFlop, releaseFriend, releaseHeld, type FrameCtx } from './frame';

// "I'm stuck!": hold all four shoulder buttons (L, R, ZL and ZR; the flop and poop keys on a
// keyboard) and a ring of dots fills up round the animal, one note at a time. After
// RESCUE_SECONDS it poofs out of wherever it was (wedged somewhere, up on a roof, stuck on a
// ride) and pops up on clear ground next to a friend, or on its own spot in the plaza.
//
// Small children won't remember that, so it also happens by itself: pushing the stick for a
// while without getting anywhere gives a big hop to wiggle free, and if that doesn't help
// either, the animal pops out just the same.

export const RESCUE_SECONDS = 5;
/** Dots in the ring (one per note of the xylophone's scale). */
export const RESCUE_DOTS = 8;
/** Don't pop up next to a friend who's this close: they're probably stuck in the same place. */
const FRIEND_TOO_CLOSE = 6;
/** Pushing the stick this many seconds without getting anywhere: a big hop to wiggle free... */
export const STUCK_HOP_AFTER = 3;
/** ...and if that didn't help, popped out somewhere safe. */
export const STUCK_RESCUE_AFTER = 7;
/** Getting less than this far (along the ground) from where the pushing started is "nowhere". */
const STUCK_RADIUS = 0.8;

/** How often each has happened, and where the last few were (for tests and tuning). */
export const unstuckLog = { chord: 0, hops: 0, pops: 0, under: 0, where: [] as { slot: number; kind: 'hop' | 'pop' | 'under'; x: number; z: number }[] };
debugInfo.unstuck = unstuckLog;
export const note = (slot: number, kind: 'hop' | 'pop' | 'under', p: { x: number; z: number }) => {
  unstuckLog.where.push({ slot, kind, x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 });
  if (unstuckLog.where.length > 20) unstuckLog.where.shift();
};

export type Rapier = ReturnType<typeof useRapier>['rapier'];
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };

/** Is there room for an animal standing here (no wall, no water, not on a cliff edge)? */
function roomAt(world: RAPIER.World, rapier: Rapier, ball: RAPIER.Ball, x: number, z: number, near?: number) {
  if (Math.abs(x) > WORLD_HALF_X - 3 || Math.abs(z) > WORLD_HALF_Z - 3 || isInWater(x, z)) return false;
  const g = groundHeight(x, z);
  if (near != null && Math.abs(g - near) > 1.2) return false;
  // not on a steep slope (the ground itself isn't checked for overlaps below)
  for (const [dx, dz] of [[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]]) if (Math.abs(groundHeight(x + dx, z + dz) - g) > 0.7) return false;
  let hit = false;
  world.intersectionsWithShape(
    { x, y: g + 0.9, z },
    IDENTITY,
    ball,
    (c) => {
      if (c.shape.type === rapier.ShapeType.HeightField) return true;
      // (the safety floor far below doesn't count either)
      if (c.shape.type === rapier.ShapeType.Cuboid && (c.shape as RAPIER.Cuboid).halfExtents.x > 40) return true;
      hit = true;
      return false;
    },
    rapier.QueryFilterFlags.EXCLUDE_SENSORS | rapier.QueryFilterFlags.EXCLUDE_DYNAMIC
  );
  return !hit;
}

/**
 * Somewhere safe to pop up: next to the nearest friend who's walking about (not the buddy, not
 * on a ride, not right here), else this player's own spot in the plaza (or another one).
 */
export function safeSpot(slot: number, from: THREE.Vector3, world: RAPIER.World, rapier: Rapier): THREE.Vector3 {
  const ball = new rapier.Ball(0.6);
  const friends = [...players.values()]
    .filter((p) => p.slot !== slot && !p.bot && !p.asleep && !p.isLaunched() && p.ridingOn == null && p.grabbedBy == null && p.grounded && !p.swimming)
    .filter((p) => Math.hypot(p.position.x - from.x, p.position.z - from.z) > FRIEND_TOO_CLOSE)
    .sort((a, b) => a.position.distanceToSquared(from) - b.position.distanceToSquared(from));
  for (const p of friends) {
    const near = groundHeight(p.position.x, p.position.z);
    for (const r of [2.5, 4]) {
      for (let k = 0; k < 8; k += 1) {
        // start on the camera's side (in front of them), then round
        const a = Math.PI / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 4);
        const x = p.position.x + Math.cos(a) * r;
        const z = p.position.z + Math.sin(a) * r;
        if (roomAt(world, rapier, ball, x, z, near)) return new THREE.Vector3(x, groundHeight(x, z) + 1.2, z);
      }
    }
  }
  for (let k = 0; k < SPAWN_POINTS.length; k += 1) {
    const [x, , z] = SPAWN_POINTS[(slot + k) % SPAWN_POINTS.length];
    if (roomAt(world, rapier, ball, x, z)) return new THREE.Vector3(x, groundHeight(x, z) + 1.2, z);
  }
  const [x, , z] = SPAWN_POINTS[slot % SPAWN_POINTS.length];
  return new THREE.Vector3(x, groundHeight(x, z) + 2, z);
}

/**
 * While the chord is held, the shoulder buttons don't also flop and poop, and a flop they started
 * (one of them goes down a moment before the others) stands back up: the animal waits calmly
 * while the ring fills, instead of tumbling off somewhere.
 */
export function calmForRescue(f: FrameCtx) {
  if (!f.input.rescue) return;
  f.input = { ...f.input, pressed: { ...f.input.pressed, flop: false, poop: false }, presses: { ...f.input.presses, flop: 0, poop: 0 } };
  if (f.s.flopped) endFlop(f);
}

/** Holding the "I'm stuck" chord: fill the ring, and when it's full, pop out somewhere safe. */
export function rescue(f: FrameCtx, world: RAPIER.World, rapier: Rapier) {
  const { s } = f;
  if (!f.input.rescue) {
    s.rescueHold = 0;
    return;
  }
  // (done: waiting for the buttons to be let go)
  if (s.rescueHold < 0) return;
  const before = Math.floor((s.rescueHold / RESCUE_SECONDS) * RESCUE_DOTS);
  s.rescueHold += f.dt;
  const dots = Math.floor((s.rescueHold / RESCUE_SECONDS) * RESCUE_DOTS);
  if (dots > before && dots < RESCUE_DOTS) {
    playXylo(dots - 1, s.pos, 0.6);
    rumble(f.source, 0.1, 0.2, 60);
  }
  if (s.rescueHold < RESCUE_SECONDS) return;
  s.rescueHold = -1;
  unstuckLog.chord += 1;
  popOut(f, world, rapier);
}

/**
 * Pushing the stick but not getting anywhere (and not on a ride, a tongue, a back or a tree, where
 * standing still is normal): a big hop after a few seconds, popped out after a few more. Not at
 * the park's edge: nothing's wrong there, the hedge just stops you.
 */
export function autoUnstick(f: FrameCtx, world: RAPIER.World, rapier: Rapier) {
  const { s, input, rt } = f;
  const pushing = Math.hypot(input.x, input.z) > 0.6 && !input.rescue;
  const free = !s.holdAt && s.ridingOn == null && rt?.grabbedBy == null && !s.flopped && s.launched <= 0 && !s.pendingLaunch && s.climbTree < 0 && !f.heavyDrag;
  const atEdge = Math.abs(s.pos.x) > WORLD_HALF_X - 2.5 || Math.abs(s.pos.z) > WORLD_HALF_Z - 2.5;
  if (!pushing || !free || atEdge || Math.hypot(s.pos.x - s.stuckFrom.x, s.pos.z - s.stuckFrom.z) > STUCK_RADIUS) {
    s.stuckFor = 0;
    s.stuckFrom.copy(s.pos);
    return;
  }
  const before = s.stuckFor;
  s.stuckFor += f.dt;
  if (before < STUCK_HOP_AFTER && s.stuckFor >= STUCK_HOP_AFTER) {
    s.pendingHop = 9;
    playBoing(s.pos, 1.2);
    unstuckLog.hops += 1;
    note(f.slot, 'hop', s.pos);
  }
  if (s.stuckFor >= STUCK_RESCUE_AFTER) {
    unstuckLog.pops += 1;
    note(f.slot, 'pop', s.pos);
    popOut(f, world, rapier);
    s.stuckFor = 0;
    s.stuckFrom.copy(s.pos);
  }
}

/** Let go of everything and pop up somewhere safe. */
function popOut(f: FrameCtx, world: RAPIER.World, rapier: Rapier) {
  const { s, rb, rt } = f;
  // let go of everything: a ride, a tree, a tongue (ours or a friend's), a back to ride on
  s.holdAt = null;
  s.hidden = false;
  s.climbTree = -1;
  releaseHeld(f, false);
  releaseFriend(f);
  if (rt) rt.grabbedBy = null;
  if (s.flopped) endFlop(f);
  s.ridingOn = null;
  s.rideCooldown = 1;
  s.launched = 0;
  s.pendingLaunch = null;
  s.pendingHop = 0;
  s.pendingBump = null;
  s.stunned = 0;
  if (rt) rt.rescuedAt = gameNow();

  const from = s.pos.clone();
  const to = safeSpot(f.slot, from, world, rapier);
  rb.setTranslation(to, true);
  rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
  f.v.x = f.v.y = f.v.z = 0;
  s.pos.copy(to);
  s.vel.set(0, 0, 0);
  poof([from.x, from.y, from.z], f.color, 16);
  poof([to.x, to.y, to.z], '#ffffff', 18);
  ring([to.x, to.y - 0.6, to.z], { color: f.color, radius: 2, duration: 0.5 });
  playPoof(to);
  playXylo(RESCUE_DOTS - 1, to);
  rumble(f.source, 0.6, 0.6, 250);
  s.squash = -0.35;
}
