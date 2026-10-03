import type { RapierCollider, RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { playBoing, playFlop, playThrow } from '../audio';
import type { HatId, Species } from '../config';
import { MOVE } from '../config';
import { emit, poof } from '../fx';
import { rumble, type InputFrame, type SourceId } from '../input';
import { players, props, type PlayerRuntime, type Surface } from '../runtime';
import { useGame } from '../store';
import type { SPECIES_SPECS } from './AnimalModel';
import type { Flip, PlayerState } from './state';

type Vec = { x: number; y: number; z: number };

export function createTmp() {
  return {
    fwd: new THREE.Vector3(),
    head: new THREE.Vector3(),
    mouth: new THREE.Vector3(),
    p: new THREE.Vector3(),
    d: new THREE.Vector3(),
    c: new THREE.Vector3(),
    v: new THREE.Vector3(),
    q: new THREE.Quaternion()
  };
}

/**
 * Everything one frame of an animal works with. The steps in body.ts, actions.ts,
 * piggyback.ts, movement.ts and animate.ts each read and update it, in a fixed order
 * (see Player.tsx).
 */
export type FrameCtx = {
  s: PlayerState;
  rb: RapierRigidBody;
  col: RapierCollider | null;
  slot: number;
  source: SourceId;
  color: string;
  hat: HatId;
  species: Species;
  spec: (typeof SPECIES_SPECS)[Species];
  input: InputFrame;
  napping: boolean;
  /** Game-time step for this frame (0 while paused). */
  dt: number;
  time: number;
  rt: PlayerRuntime | undefined;
  /** Position and velocity at the start of the frame. */
  t: Vec;
  lv: Vec;
  tmp: ReturnType<typeof createTmp>;
  /** Current physics radius (bigger while giant). */
  rad: number;
  hit: { timeOfImpact: number } | null;
  groundDist: number;
  surface: Surface | undefined;
  onStatic: boolean;
  wasGrounded: boolean;
  /** Dragging something heavy with the tongue. */
  heavyDrag: boolean;
  /** A bean rocket went off this frame. */
  rocketed: boolean;
  riding: boolean;
  /** The velocity this frame will end with. */
  v: Vec;
};

export function startFlip(f: FrameCtx, axis: Flip['axis'], dur: number, dir = 1) {
  f.s.flip = { axis, t: 0, dur, dir };
}

/** Let go of whatever the tongue holds (optionally throwing it forward). */
export function releaseHeld(f: FrameCtx, throwIt: boolean) {
  const { s, tmp } = f;
  if (s.held == null) return;
  const prop = props.get(s.held);
  s.held = null;
  if (!prop) return;
  prop.heldBy = null;
  const placed = prop.onRelease?.(throwIt) === true;
  const pb = prop.getBody();
  if (throwIt && pb && !placed) {
    const power = prop.heavy ? 7 : 13;
    pb.setLinvel({ x: tmp.fwd.x * power + s.vel.x * 0.5, y: prop.heavy ? 4 : 6.5, z: tmp.fwd.z * power + s.vel.z * 0.5 }, true);
    pb.setAngvel({ x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 8 }, true);
    playThrow(s.pos);
    rumble(f.source, 0.2, 0.5, 90);
  }
}

/** Let go of a friend held by the tongue (if they haven't wriggled free already). */
export function releaseFriend(f: FrameCtx) {
  const { s } = f;
  if (s.heldFriend == null) return;
  const friend = players.get(s.heldFriend);
  if (friend?.grabbedBy === f.slot) friend.grabbedBy = null;
  s.heldFriend = null;
}

export function startFlop(f: FrameCtx) {
  const { s, rb, col, lv, t } = f;
  s.flopped = true;
  s.flopTime = MOVE.flopDuration;
  releaseHeld(f, false);
  releaseFriend(f);
  rb.setEnabledRotations(true, true, true, true);
  col?.setFriction(0.9);
  rb.setLinvel({ x: lv.x * 0.5, y: Math.max(lv.y, 6), z: lv.z * 0.5 }, true);
  rb.setAngvel({ x: (Math.random() - 0.5) * 16, y: (Math.random() - 0.5) * 10, z: (Math.random() - 0.5) * 16 }, true);
  playFlop(s.pos);
  emit('star', [t.x, t.y + 0.8, t.z], { count: 5, color: ['#ffe14d', '#ffffff'], speed: 3, up: 3 });
  useGame.getState().addParty(0.01);
}

export function endFlop(f: FrameCtx) {
  const { s, rb, col, t } = f;
  s.flopped = false;
  rb.setEnabledRotations(false, false, false, true);
  rb.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
  col?.setFriction(0);
  rb.setLinvel({ x: 0, y: 7, z: 0 }, true);
  s.squash = -0.3;
  startFlip(f, 'y', 0.45);
  poof([t.x, t.y - 0.2, t.z], '#ffffff', 10);
  playBoing(s.pos, 1.3);
}
