import * as THREE from 'three';
import { playBoing, playRustle, playSpin } from '../audio';
import { after, gameNow } from '../clock';
import { PARTY_POINTS } from '../config';
import { emit, ring } from '../fx';
import { nearestTreasure } from '../hunt';
import { rumble } from '../input';
import { distXZ, TREES } from '../layout';
import { treeShakeListeners } from '../chase';
import { kiteLift, players, propPosition, props, shakeCamera } from '../runtime';
import { useGame } from '../store';
import { earnSticker } from '../stickers';
import { groundHeight } from '../terrain';
import { startFlip, type FrameCtx } from './frame';

// Every animal has a trick of its own, on the buttons it already has (no new buttons to learn):
//
//   dog      barking sniffs out the nearest hidden treasure (a trail of sparkles points the way)
//   goat     a much stronger headbutt
//   pig      a toot on an empty tummy is a fart jump
//   sheep    bouncy wool: a big landing bounces back up
//   cat      walk into a tree trunk to climb it (jump, or push away, to hop down)
//   duck     swims fast; hold jump while falling to glide
//   cow      the moo is a shockwave that knocks things over
//   unicorn  a third, rainbow jump in the air

export const TRICK = {
  duckSwim: 9,
  /** A gliding duck falls no faster than this (m/s)... */
  glideFall: 2.2,
  /** ...and steers better than a normal jump in the air. */
  glideAccel: 9,
  /** Holding a kite flying high, you fall no faster than this (m/s). */
  kiteFall: 2.6,
  pigMud: 12,
  pigToot: 11,
  pigTootAir: 9,
  goatBonk: 1.8,
  goatBump: 1.5,
  /** Sheep: landings faster than this bounce, keeping this much of the speed (and no more than max). */
  sheepMin: 10.5,
  sheepKeep: 0.7,
  sheepMax: 13,
  mooRadius: 7,
  rainbowJump: 10,
  climbTime: 0.7
} as const;

/** Duck: hold jump while falling to glide down slowly, feathers drifting behind. */
export function glide(f: FrameCtx, controlling: boolean) {
  const { s, input, v, t } = f;
  // (any animal holding a kite that's flying high floats down gently too)
  const lift = kiteLift.get(f.slot) ?? 0;
  if (lift > 0.6 && !s.grounded && !s.swimming && v.y < 0 && s.launched <= 0) {
    v.y = Math.max(v.y, -TRICK.kiteFall);
    s.gliding = true;
    return;
  }
  const gliding = f.species === 'duck' && controlling && !s.grounded && !s.swimming && input.held.jump && v.y < 0 && s.launched <= 0;
  if (gliding) {
    v.y = Math.max(v.y, -TRICK.glideFall);
    s.glideTime += f.dt;
    if (Math.random() < f.dt * 8) emit('puff', [t.x, t.y + 0.2, t.z], { count: 1, color: ['#ffffff', '#fff3a8'], speed: 0.6, up: 0.2, size: 0.12, gravity: 0.3, life: 1 });
    if (s.glideTime > 1.2) earnSticker('glide');
  } else s.glideTime = 0;
  s.gliding = gliding;
}

/** Sheep: bouncy wool. A big landing (a double jump, a jump off something high) bounces back up. */
export function woolBounce(f: FrameCtx) {
  const { s, v, t, surface } = f;
  if (f.species !== 'sheep' || !s.grounded || f.wasGrounded || surface?.bounce || s.swimming || s.flopped) return;
  const impact = -s.lastVy;
  if (impact < TRICK.sheepMin) return;
  v.y = Math.min(TRICK.sheepMax, impact * TRICK.sheepKeep);
  s.jumps = 1;
  s.squash = 0.45;
  playBoing(s.pos, 0.7 + Math.random() * 0.2);
  emit('puff', [t.x, s.groundY + 0.2, t.z], { count: 10, color: ['#ffffff', '#f3efe6'], speed: 2.5, up: 1, size: 0.35 });
  rumble(f.source, 0.2, 0.5, 100);
  // (the sticker wants a real jump: dropping in when joining bounces too, but doesn't count)
  if (impact > 11 && s.jumpedAt > 0 && gameNow() - s.jumpedAt < 2500) {
    earnSticker('sheepbounce');
    useGame.getState().addParty(PARTY_POINTS.trick);
  }
}

/** Unicorn: a third jump in the air, in a burst of rainbow. */
export function rainbowJump(f: FrameCtx) {
  const { s, v, t } = f;
  v.y = TRICK.rainbowJump * (s.power === 'giant' ? 1.3 : 1);
  s.jumps = 3;
  startFlip(f, 'y', 0.6);
  playSpin(s.pos);
  ring([t.x, t.y - 0.4, t.z], { color: '#ff8fd8', radius: 2, duration: 0.45 });
  emit('star', [t.x, t.y - 0.3, t.z], { count: 18, color: ['#ff4d5e', '#ff9f1c', '#ffd23f', '#22c55e', '#3b82f6', '#a855f7'], speed: 4, up: -1 });
  earnSticker('unijump');
  useGame.getState().addParty(PARTY_POINTS.trick);
}

/** How many jumps an animal gets before it has to land. */
export function jumpsOf(f: FrameCtx) {
  return f.species === 'unicorn' ? 3 : 2;
}

/** Cow: the moo is a shockwave. Things nearby get knocked over, friends hop. */
export function mightyMoo(f: FrameCtx) {
  const { s, t, tmp, slot } = f;
  let hits = 0;
  props.forEach((prop) => {
    if (prop.heldBy != null || !prop.enabled || !propPosition(prop, tmp.p)) return;
    const d = tmp.p.distanceTo(s.pos);
    if (d > TRICK.mooRadius || d < 0.01) return;
    const push = (1 - d / TRICK.mooRadius) * prop.launch * 0.8 + 2;
    const pb = prop.getBody();
    if (!pb) return;
    pb.wakeUp();
    pb.setLinvel({ x: ((tmp.p.x - t.x) / d) * push, y: push * 0.5 + 2, z: ((tmp.p.z - t.z) / d) * push }, true);
    hits += 1;
  });
  players.forEach((other) => {
    if (other.slot === slot || other.position.distanceTo(s.pos) > TRICK.mooRadius - 1) return;
    other.hop(7);
    hits += 1;
  });
  ring([t.x, s.groundY + 0.1, t.z], { color: '#fff3a8', radius: TRICK.mooRadius, duration: 0.7 });
  after(0.12, () => ring([t.x, s.groundY + 0.1, t.z], { color: '#ffffff', radius: TRICK.mooRadius * 0.7, duration: 0.6 }));
  shakeCamera(0.3);
  rumble(f.source, 0.7, 0.5, 300);
  if (hits > 0) {
    earnSticker('moo');
    useGame.getState().addParty(PARTY_POINTS.trick);
  }
}

const sniffTo = new THREE.Vector3();

/** Dog: a bark sniffs out the nearest hidden treasure: a trail of golden sparkles runs off towards it. */
export function sniff(f: FrameCtx) {
  const { s } = f;
  if (!nearestTreasure(s.pos, sniffTo)) return;
  const dx = sniffTo.x - s.pos.x;
  const dz = sniffTo.z - s.pos.z;
  const len = Math.hypot(dx, dz);
  if (len < 1) return;
  const steps = Math.min(9, Math.ceil(len / 0.9));
  for (let k = 1; k <= steps; k += 1) {
    const x = s.pos.x + (dx / len) * k * 0.9;
    const z = s.pos.z + (dz / len) * k * 0.9;
    after(k * 0.06, () => emit('star', [x, groundHeight(x, z) + 0.25, z], { count: 2, color: ['#ffd23f', '#fff3a8'], speed: 0.3, up: 0.8, gravity: -0.2, size: 0.15, life: 1.6, spread: 0.1 }));
  }
}

const TRUNK = 0.4;
const perch = new THREE.Vector3();

/** Where a climbing cat sits in tree `i`: out on a branch, on the camera's side. */
function perchOf(i: number, out: THREE.Vector3) {
  const t = TREES[i];
  const round = t.kind === 'round' || t.kind === 'blossom';
  // out in front of the leaves (a cat inside the crown can't be seen)
  const [high, out_] = round ? [1.95, 1.95] : t.kind === 'palm' ? [2.2, 1.5] : [1.7, 1.5];
  return out.set(t.at[0] - 0.3, groundHeight(t.at[0], t.at[1]) + high, t.at[1] + out_);
}

/**
 * Cat: walk into a tree trunk and up you go, onto a branch. Jump (or push the stick away) to
 * hop back down. A park cat sitting in that tree gets a fright and jumps down.
 */
export function climb(f: FrameCtx) {
  const { s, input } = f;
  if (s.climbTree >= 0) {
    // (a ride, a cannon or a friend's tongue took over)
    if (f.species !== 'cat' || s.pendingLaunch || f.rt?.grabbedBy != null || (s.holdAt && s.holdAt !== s.climbHold)) {
      s.climbTree = -1;
      if (s.holdAt === s.climbHold) s.holdAt = null;
      return;
    }
    s.climbT += f.dt;
    perchOf(s.climbTree, perch);
    const k = Math.min(1, s.climbT / TRICK.climbTime);
    const e = k * k * (3 - 2 * k);
    s.climbHold.lerpVectors(s.climbFrom, perch, e);
    // scrabbling up the trunk: a little wobble
    if (k < 1) s.climbHold.x += Math.sin(s.climbT * 40) * 0.05;
    s.holdAt = s.climbHold;
    const tr = TREES[s.climbTree];
    // up the trunk facing it; once up, turned round to look at everyone (the camera)
    s.targetFacing = k < 1 ? Math.atan2(tr.at[0] - s.climbFrom.x, tr.at[1] - s.climbFrom.z) : 0;
    if (k >= 1 && s.climbT - f.dt < TRICK.climbTime) {
      // up! a park cat in this tree gets a fright
      playRustle([tr.at[0], perch.y, tr.at[1]]);
      treeShakeListeners.forEach((listener) => listener(s.climbTree));
      useGame.getState().addParty(PARTY_POINTS.trick);
    }
    // hop down with jump, or by pushing the stick (once it has been let go up there, so
    // a stick still held from climbing up doesn't hop straight back down)
    const mag = Math.hypot(input.x, input.z);
    if (k >= 1 && mag < 0.3) s.climbArmed = true;
    if (k >= 1 && (input.pressed.jump || (s.climbArmed && mag > 0.6))) {
      s.climbTree = -1;
      s.holdAt = null;
      s.pendingHop = 7;
      s.jumpBuffer = 0;
    }
    return;
  }
  if (f.species !== 'cat' || s.flopped || s.holdAt || f.riding || s.launched > 0 || s.swimming || f.rt?.grabbedBy != null || s.stunned > 0) {
    s.climbPush = 0;
    return;
  }
  const mag = Math.hypot(input.x, input.z);
  let best = -1;
  let bestD = TRUNK + f.rad + 0.35;
  if (mag > 0.5) {
    for (let i = 0; i < TREES.length; i += 1) {
      const d = distXZ(s.pos.x, s.pos.z, TREES[i].at[0], TREES[i].at[1]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  }
  const tr = best >= 0 ? TREES[best] : null;
  const into = tr ? ((tr.at[0] - s.pos.x) * input.x + (tr.at[1] - s.pos.z) * input.z) / (Math.max(0.01, bestD) * mag) : 0;
  if (!tr || into < 0.6 || s.pos.y - groundHeight(tr.at[0], tr.at[1]) > 2) {
    s.climbPush = 0;
    return;
  }
  s.climbPush += f.dt;
  if (s.climbPush < 0.15) return;
  s.climbPush = 0;
  s.climbTree = best;
  s.climbT = 0;
  s.climbArmed = false;
  s.climbFrom.copy(s.pos);
  s.climbHold.copy(s.pos);
  s.holdAt = s.climbHold;
  playRustle([tr.at[0], 2, tr.at[1]]);
  earnSticker('climb');
}
