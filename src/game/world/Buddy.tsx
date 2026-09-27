import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { gameClock, gameNow } from '../clock';
import { poof } from '../fx';
import { getInput, makeInputFrame, setInputFrame, NO_INPUT, type ActionName } from '../input';
import { distXZ, SEESAWS } from '../layout';
import { players, seesawLow, type PlayerRuntime } from '../runtime';
import { settings } from '../settings';
import { isPaused, useGame } from '../store';
import { TEST_MODE } from '../testMode';

// The buddy: when one child plays alone, a computer animal keeps them company. It is a normal
// animal driven by made-up controller input, so everything works on it: ride it, lick it and
// throw it, fling it off a see-saw, headbutt it. It follows, copies jumps and noises, waits on
// the far end of a see-saw, and while you ride on its back it runs where you push the stick.
// When a real friend joins, it makes room.

/** Seconds of playing alone before the buddy comes. */
const ARRIVE_AFTER = 4;
const FOLLOW = 3;
/** Too far away (or stuck too long): pop back next to the child. */
const CATCH_UP = 24;

/** Automatic buddy (off in test mode unless a test switches it on). */
export const buddyControl = { auto: !TEST_MODE };

type Brain = {
  /** Caught up with what the child did before the buddy arrived. */
  synced: boolean;
  aloneSince: number;
  kidJumpedAt: number;
  kidNoiseAt: number;
  pending: { action: ActionName; at: number }[];
  circle: number;
  lastPos: THREE.Vector3;
  stuckFor: number;
  nextSilly: number;
  nextHop: number;
  /** Jumping onto a raised see-saw end until this time (game ms). */
  hopInUntil: number;
  rodeSince: number;
};

/** A point along see-saw `i`, `along` metres from the hinge towards end `side` (+1 / -1). */
const seesawEnd = (i: number, side: number, out: THREE.Vector3, along = 2.4) => {
  const { center, angle } = SEESAWS[i];
  return out.set(center[0] + side * along * Math.cos(angle), 0, center[1] - side * along * Math.sin(angle));
};

export function Buddy() {
  const brain = useRef<Brain>({ synced: false, aloneSince: -1, kidJumpedAt: 0, kidNoiseAt: 0, pending: [], circle: Math.random() * 6, lastPos: new THREE.Vector3(), stuckFor: 0, nextSilly: 0, nextHop: 0, hopInUntil: 0, rodeSince: -1 });
  const target = useRef(new THREE.Vector3());
  const tmp = useRef(new THREE.Vector3());

  // after the input is read (priority -10), before the animals move (0)
  useFrame(() => {
    const game = useGame.getState();
    const b = brain.current;
    const now = gameNow();
    const kids = game.players.filter((p) => !p.bot);
    const botInfo = game.players.find((p) => p.bot);

    // come (after a few seconds of playing alone) and go (a friend joined, or it's switched off)
    if (buddyControl.auto) {
      const wanted = game.phase === 'play' && settings().buddy && kids.length === 1;
      if (!wanted) {
        b.aloneSince = -1;
        if (botInfo) game.removeBuddy();
        return;
      }
      if (!botInfo) {
        b.synced = false;
        if (b.aloneSince < 0) b.aloneSince = now;
        if ((now - b.aloneSince) / 1000 >= ARRIVE_AFTER && !isPaused(game)) game.addBuddy();
        return;
      }
    }
    if (!botInfo) return;

    const me = players.get(botInfo.slot);
    const kidInfo = kids[0];
    const kid = kidInfo ? players.get(kidInfo.slot) : undefined;
    if (!me || !kid || isPaused(game)) {
      setInputFrame('bot', NO_INPUT);
      return;
    }
    setInputFrame('bot', think(b, me, kid, kidInfo.source, now, target.current, tmp.current));
  }, -5);
  return null;
}

function think(b: Brain, me: PlayerRuntime, kid: PlayerRuntime, kidSource: Parameters<typeof getInput>[0], now: number, target: THREE.Vector3, tmp: THREE.Vector3) {
  const press: Partial<Record<ActionName, boolean>> = {};
  let x = 0;
  let z = 0;
  const dt = gameClock.dt;

  // copy the child: a jump or a noise, a moment later (not a jump from right next to us: that
  // child is probably trying to land on our back)
  if (!b.synced) {
    b.synced = true;
    b.kidJumpedAt = kid.jumpedAt;
    b.kidNoiseAt = kid.noiseAt;
  }
  if (kid.jumpedAt !== b.kidJumpedAt) {
    if (kid.position.distanceTo(me.position) >= 2) b.pending.push({ action: 'jump', at: now + 250 });
    b.kidJumpedAt = kid.jumpedAt;
  }
  if (kid.noiseAt !== b.kidNoiseAt) {
    b.pending.push({ action: 'noise', at: now + 350 });
    b.kidNoiseAt = kid.noiseAt;
  }

  const riddenByKid = kid.ridingOn === me.slot;
  if (me.grabbedBy != null || kid.asleep) {
    // dangling from a tongue (giggle now and then), or waiting for a napping friend
    if (me.grabbedBy != null && Math.random() < dt * 0.6) press.noise = true;
    b.pending = [];
  } else if (me.ridingOn != null) {
    // riding on the child's back: enjoy it for a bit, then hop off
    if (b.rodeSince < 0) b.rodeSince = now;
    if (now - b.rodeSince > 5000) press.jump = true;
  } else if (riddenByKid) {
    // giddy-up: the child steers with the stick
    const kidIn = getInput(kidSource);
    x = kidIn.x;
    z = kidIn.z;
    b.pending = b.pending.filter((p) => p.action !== 'jump');
  } else {
    b.rodeSince = -1;
    const d = distXZ(me.position.x, me.position.z, kid.position.x, kid.position.z);
    if (d > CATCH_UP && !me.isLaunched()) {
      catchUp(me, kid);
      return makeInputFrame();
    }
    // near a see-saw? get onto the far end (pushing it down if it's up) so the child can
    // land on the other end and fling us
    let waiting = false;
    for (let i = 0; i < SEESAWS.length; i += 1) {
      const c = SEESAWS[i].center;
      if (distXZ(kid.position.x, kid.position.z, c[0], c[1]) > 7) continue;
      const a = seesawEnd(i, 1, tmp);
      const ad = distXZ(kid.position.x, kid.position.z, a.x, a.z);
      const bEnd = seesawEnd(i, -1, target);
      const bd = distXZ(kid.position.x, kid.position.z, bEnd.x, bEnd.z);
      const far = ad > bd ? 1 : -1;
      waiting = true;
      if (seesawLow[i] === far || now < b.hopInUntil) {
        // our end is down (or we're jumping onto it): stand on it and wait
        seesawEnd(i, far, target, 2.3);
      } else {
        // our end is up in the air: line up just past its tip, then jump in onto it
        seesawEnd(i, far, target, 3.9);
        if (distXZ(me.position.x, me.position.z, target.x, target.z) < 0.7 && now > b.nextHop) {
          b.nextHop = now + 1500;
          b.hopInUntil = now + 900;
          press.jump = true;
        }
      }
      break;
    }
    if (!waiting) {
      // trot along beside the child, slowly circling round
      b.circle += dt * 0.3;
      target.set(kid.position.x + Math.cos(b.circle) * FOLLOW, 0, kid.position.z + Math.sin(b.circle) * FOLLOW);
    }
    const td = distXZ(me.position.x, me.position.z, target.x, target.z);
    const stopAt = waiting ? 0.35 : 1.2;
    if (td > stopAt && !me.isLaunched()) {
      const k = Math.min(1, (td - stopAt * 0.5) / 2.5);
      x = ((target.x - me.position.x) / td) * k;
      z = ((target.z - me.position.z) / td) * k;
    }
    // stuck against something while trying to move: hop, and if that doesn't help, pop over
    const moving = Math.hypot(x, z) > 0.4;
    if (moving && me.position.distanceTo(b.lastPos) < dt * 1.5) b.stuckFor += dt;
    else b.stuckFor = Math.max(0, b.stuckFor - dt * 2);
    if (b.stuckFor > 0.8 && b.stuckFor - dt <= 0.8) press.jump = true;
    if (b.stuckFor > 5) {
      b.stuckFor = 0;
      catchUp(me, kid);
    }
    // and just being silly now and then while standing about
    if (!moving && now > b.nextSilly && !waiting) {
      b.nextSilly = now + 7000 + Math.random() * 8000;
      if (Math.random() < 0.5) {
        b.pending.push({ action: 'jump', at: now }, { action: 'jump', at: now + 250 });
      } else press.noise = true;
    }
  }
  b.lastPos.copy(me.position);
  const due = b.pending.filter((p) => p.at <= now);
  b.pending = b.pending.filter((p) => p.at > now);
  for (const p of due) press[p.action] = true;
  return makeInputFrame(x, z, press);
}

/** Pop back in next to the child. */
function catchUp(me: PlayerRuntime, kid: PlayerRuntime) {
  const body = me.getBody();
  if (!body) return;
  poof([me.position.x, me.position.y, me.position.z], '#ffffff', 10);
  const a = Math.random() * Math.PI * 2;
  body.setTranslation({ x: kid.position.x + Math.cos(a) * 2.5, y: kid.position.y + 2, z: kid.position.z + Math.sin(a) * 2.5 }, true);
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
}
