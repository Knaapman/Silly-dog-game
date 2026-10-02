import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { playBoing } from '../audio';
import { gameClock, gameNow } from '../clock';
import { poof } from '../fx';
import { getInput, makeInputFrame, setInputFrame, NO_INPUT, type ActionName } from '../input';
import { distXZ, SEESAWS } from '../layout';
import { RADIUS } from '../player/constants';
import { launchSpots, players, seesawLow, type PlayerRuntime } from '../runtime';
import { parkCats } from '../chase';
import { groundHeight } from '../terrain';
import { settings } from '../settings';
import { isPaused, useGame } from '../store';
import { TEST_MODE } from '../testMode';
import { swingHelp } from './Swings';

// The buddy: when one child plays alone, a computer animal keeps them company. It is a normal
// animal driven by made-up controller input, so everything works on it: ride it, lick it and
// throw it, fling it off a see-saw, headbutt it. It follows, copies jumps and noises, waits on
// the far end of a see-saw, and while you ride on its back it runs where you push the stick.
// Fly off a launch pad, a cannon or a geyser and it takes the same one after you; get up
// somewhere it can't walk to and it comes after you with a big boing. When a real friend
// joins, it makes room.

/** Seconds of playing alone before the buddy comes. */
const ARRIVE_AFTER = 4;
const FOLLOW = 3;
/** Too far away (or stuck too long): pop back next to the child. */
const CATCH_UP = 24;
/** Higher (or lower) than this and walking won't get there (a jump reaches about 2 m). */
const OUT_OF_REACH = 2;
/** Seconds the child is out of reach before the buddy boings over to them. */
const BOING_AFTER = 2.5;
/** Boing from at least this far out, or it bonks its head on whatever the child stands on. */
const RUN_UP = 7;
/** Standing this high the child is up on something: follow in their footsteps, not round them. */
const UP_HIGH = 2.6;
/** How many of the child's recent footsteps to remember. */
const TRAIL = 24;

/**
 * Automatic buddy: `auto` makes it come and go by itself (off in test mode unless a test switches
 * it on); `think` lets it move about once it's here (a test can switch that off to have it stand
 * still, e.g. as something to throw at).
 */
export const buddyControl = { auto: !TEST_MODE, think: true };

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
  /** Spots the child stood on lately (solid ground to land or walk on), newest last. */
  trail: THREE.Vector3[];
  kidFlying: boolean;
  /** The launcher the child flew off (a pad, a cannon, a geyser): take the same one. */
  via: { x: number; z: number; at: number; landed: boolean; waited: number } | null;
  /** How long the child has been out of reach (up on something, or down where we can't get). */
  apartFor: number;
  nextBoing: number;
};

const scratch = { target: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3() };

/** A point along see-saw `i`, `along` metres from the hinge towards end `side` (+1 / -1). */
const seesawEnd = (i: number, side: number, out: THREE.Vector3, along = 2.4) => {
  const { center, angle } = SEESAWS[i];
  return out.set(center[0] + side * along * Math.cos(angle), 0, center[1] - side * along * Math.sin(angle));
};

export function Buddy() {
  const brain = useRef<Brain>({
    synced: false,
    aloneSince: -1,
    kidJumpedAt: 0,
    kidNoiseAt: 0,
    pending: [],
    circle: Math.random() * 6,
    lastPos: new THREE.Vector3(),
    stuckFor: 0,
    nextSilly: 0,
    nextHop: 0,
    hopInUntil: 0,
    rodeSince: -1,
    trail: [],
    kidFlying: false,
    via: null,
    apartFor: 0,
    nextBoing: 0
  });

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
    if (!buddyControl.think) {
      setInputFrame('bot', NO_INPUT);
      return;
    }

    const me = players.get(botInfo.slot);
    const kidInfo = kids[0];
    const kid = kidInfo ? players.get(kidInfo.slot) : undefined;
    if (!me || !kid || isPaused(game)) {
      setInputFrame('bot', NO_INPUT);
      return;
    }
    setInputFrame('bot', think(b, me, kid, kidInfo.source, now));
  }, -5);
  return null;
}

function think(b: Brain, me: PlayerRuntime, kid: PlayerRuntime, kidSource: Parameters<typeof getInput>[0], now: number) {
  const { target, a: tmp } = scratch;
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
    b.kidFlying = kid.isLaunched();
    b.trail = [];
    b.via = null;
  }
  if (kid.jumpedAt !== b.kidJumpedAt) {
    if (kid.position.distanceTo(me.position) >= 2) b.pending.push({ action: 'jump', at: now + 250 });
    b.kidJumpedAt = kid.jumpedAt;
  }
  if (kid.noiseAt !== b.kidNoiseAt) {
    b.pending.push({ action: 'noise', at: now + 350 });
    b.kidNoiseAt = kid.noiseAt;
  }

  // remember where the child walks (solid ground), and which launcher they fly off
  const kidStanding = kid.grounded && !kid.isLaunched() && kid.ridingOn == null && kid.grabbedBy == null && !kid.flopped;
  if (kidStanding) {
    const last = b.trail[b.trail.length - 1];
    if (!last || last.distanceTo(kid.position) > 0.5) {
      const spot = b.trail.length >= TRAIL ? b.trail.shift()! : new THREE.Vector3();
      b.trail.push(spot.copy(kid.position));
    }
  }
  const kidFlying = kid.isLaunched();
  if (kidFlying && !b.kidFlying) {
    const spot = launchSpots.get(kid.slot);
    b.via = spot && now - spot.at < 1000 ? { x: spot.x, z: spot.z, at: now, landed: false, waited: 0 } : null;
  }
  b.kidFlying = kidFlying;
  if (b.via && !b.via.landed && kidStanding) {
    b.via.landed = true;
    // came down right next to us anyway: no need to go round
    if (kid.position.distanceTo(me.position) < 4) b.via = null;
  }
  if (
    b.via &&
    (me.isLaunched() || // on our way!
      now - b.via.at > 20000 ||
      (b.via.landed && distXZ(kid.position.x, kid.position.z, b.via.x, b.via.z) < 4) || // came back
      distXZ(me.position.x, me.position.z, b.via.x, b.via.z) > 30)
  ) {
    b.via = null;
  }

  const riddenByKid = kid.ridingOn === me.slot;
  if (me.grabbedBy != null || kid.asleep) {
    // dangling from a tongue (giggle now and then), or waiting for a napping friend
    if (me.grabbedBy != null && Math.random() < dt * 0.6) press.noise = true;
    b.pending = [];
  } else if (me.ridingOn != null) {
    // riding on the child's back: enjoy it for a bit, then hop off (up high: only onto a spot
    // the child stood on, never into thin air)
    if (b.rodeSince < 0) b.rodeSince = now;
    if (now - b.rodeSince > 5000) {
      const spot = kid.position.y - groundHeight(kid.position.x, kid.position.z) > UP_HIGH ? footstep(b.trail, kid, 1.2, 3.5) : null;
      if (spot) {
        const d = Math.max(0.01, distXZ(spot.x, spot.z, me.position.x, me.position.z));
        const k = Math.min(1, d / 3.5) / d;
        x = (spot.x - me.position.x) * k;
        z = (spot.z - me.position.z) * k;
      }
      if (spot || kid.position.y - groundHeight(kid.position.x, kid.position.z) <= UP_HIGH) press.jump = true;
    }
  } else if (riddenByKid) {
    // giddy-up: the child steers with the stick
    const kidIn = getInput(kidSource);
    x = kidIn.x;
    z = kidIn.z;
    b.pending = b.pending.filter((p) => p.action !== 'jump');
  } else {
    b.rodeSince = -1;
    // flying (a launcher, a boing): no jumping about, or it spoils the flight
    if (me.isLaunched()) b.pending = b.pending.filter((p) => p.action !== 'jump');
    const d = distXZ(me.position.x, me.position.z, kid.position.x, kid.position.z);
    // heights above the ground: a hill you can walk up doesn't count as "up somewhere"
    const kidUp = kid.position.y - groundHeight(kid.position.x, kid.position.z);
    const meUp = me.position.y - groundHeight(me.position.x, me.position.z);
    const kidHigh = kidUp > UP_HIGH;

    // the child is up (or down) somewhere walking won't get us: after a moment, a big boing
    const dy = kidUp - meUp;
    const settled = kidStanding && !b.via && !me.isLaunched();
    const kidAbove = settled && dy > OUT_OF_REACH;
    const outOfReach = (kidAbove && me.velocity.y < 0.5) || (settled && dy < -OUT_OF_REACH && b.stuckFor > 0.3);
    b.apartFor = outOfReach ? b.apartFor + dt : Math.max(0, b.apartFor - dt * 2);
    const runUp = kidAbove && d < RUN_UP - 0.5;
    if (b.apartFor > BOING_AFTER && now > b.nextBoing && (!runUp || b.apartFor > BOING_AFTER + 3)) {
      b.apartFor = 0;
      b.nextBoing = now + 4000;
      boing(me, landingSpot(b.trail, kid, target));
      return makeInputFrame();
    }
    if (d > CATCH_UP && !me.isLaunched() && !kid.isLaunched() && !b.via) {
      catchUp(me, kid, b.trail);
      return makeInputFrame();
    }

    let stopAt = 1.2;
    /** Standing somewhere on purpose (no wandering, no silliness). */
    let busy = false;
    if (b.via) {
      // off to the launcher the child took; wait on it (a geyser takes a moment), and if it
      // doesn't take us, boing over instead
      busy = true;
      stopAt = 0.15;
      target.set(b.via.x, 0, b.via.z);
      b.pending = b.pending.filter((p) => p.action !== 'jump');
      if (distXZ(me.position.x, me.position.z, b.via.x, b.via.z) < 1) {
        b.via.waited += dt;
        if (b.via.waited > 7) b.via = null;
      }
    } else if (kidAbove) {
      // the child is up above us: stand back for a run-up (see the boing above) and get ready
      busy = true;
      stopAt = 0.2;
      if (!runUp) target.copy(me.position);
      else if (d < 0.3) target.set(kid.position.x + RUN_UP, 0, kid.position.z);
      else target.set(kid.position.x + ((me.position.x - kid.position.x) / d) * RUN_UP, 0, kid.position.z + ((me.position.z - kid.position.z) / d) * RUN_UP);
    } else if (swingHelp.slot === me.slot) {
      // the child is on a swing: stand behind it (the swing does the pushing, with our hop)
      busy = true;
      stopAt = 0.25;
      target.copy(swingHelp.spot);
      b.pending = b.pending.filter((p) => p.action !== 'jump');
    } else {
      // near a see-saw? get onto the far end (pushing it down if it's up) so the child can
      // land on the other end and fling us
      for (let i = 0; i < SEESAWS.length; i += 1) {
        const c = SEESAWS[i].center;
        if (distXZ(kid.position.x, kid.position.z, c[0], c[1]) > 7) continue;
        const a = seesawEnd(i, 1, tmp);
        const ad = distXZ(kid.position.x, kid.position.z, a.x, a.z);
        const bEnd = seesawEnd(i, -1, target);
        const bd = distXZ(kid.position.x, kid.position.z, bEnd.x, bEnd.z);
        const far = ad > bd ? 1 : -1;
        busy = true;
        stopAt = 0.35;
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
    }
    if (!busy) {
      // the child is chasing a cat: run round ahead of it, so it turns back towards the child
      for (const cat of parkCats) {
        if (!cat || (cat.mode !== 'flee' && cat.mode !== 'alert')) continue;
        const cd = distXZ(cat.position.x, cat.position.z, kid.position.x, kid.position.z);
        if (cd > 14 || cd < 0.5) continue;
        target.set(cat.position.x + ((cat.position.x - kid.position.x) / cd) * 3, 0, cat.position.z + ((cat.position.z - kid.position.z) / cd) * 3);
        stopAt = 0.5;
        busy = true;
        break;
      }
    }
    if (!busy) {
      const spot = kidHigh ? footstep(b.trail, kid, 1.5, 4) : null;
      if (spot) {
        // up on something (a roof, a tower): follow in the child's footsteps, not into thin air
        target.copy(spot);
        stopAt = 0.6;
      } else if (kidHigh) {
        // nowhere known to stand but right where the child is: stay close, or come closer
        target.copy(d < 3 ? me.position : kid.position);
      } else {
        // trot along beside the child, slowly circling round
        b.circle += dt * 0.3;
        target.set(kid.position.x + Math.cos(b.circle) * FOLLOW, 0, kid.position.z + Math.sin(b.circle) * FOLLOW);
      }
    }
    const td = distXZ(me.position.x, me.position.z, target.x, target.z);
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
      catchUp(me, kid, b.trail);
    }
    // and just being silly now and then while standing about
    if (!moving && now > b.nextSilly && !busy && me.grounded && !me.isLaunched()) {
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

/** The newest spot the child stood on, `min`..`max` metres from them at their height. */
function footstep(trail: THREE.Vector3[], kid: PlayerRuntime, min: number, max: number) {
  for (let i = trail.length - 1; i >= 0; i -= 1) {
    const p = trail[i];
    const d = distXZ(p.x, p.z, kid.position.x, kid.position.z);
    if (d >= min && d <= max && Math.abs(p.y - kid.position.y) < 0.8) return p;
  }
  return null;
}

/** Ground to land on next to the child: a spot they just stood on (so it's solid), else their back. */
function landingSpot(trail: THREE.Vector3[], kid: PlayerRuntime, out: THREE.Vector3) {
  const spot = footstep(trail, kid, 1.2, 4);
  if (spot) return out.set(spot.x, spot.y - RADIUS, spot.z);
  return out.set(kid.position.x, kid.position.y + 0.9, kid.position.z);
}

/** A big boing over to the child, like a launch pad without the pad. */
function boing(me: PlayerRuntime, spot: THREE.Vector3) {
  playBoing(me.position, 0.7);
  me.launchTo(spot, Math.max(spot.y, me.position.y) + 3);
}

/** Pop back in next to the child. */
function catchUp(me: PlayerRuntime, kid: PlayerRuntime, trail: THREE.Vector3[]) {
  const body = me.getBody();
  if (!body) return;
  poof([me.position.x, me.position.y, me.position.z], '#ffffff', 10);
  if (kid.position.y - groundHeight(kid.position.x, kid.position.z) > UP_HIGH) {
    // up on something: onto a spot the child stood on (or onto their back), not into thin air
    const at = landingSpot(trail, kid, scratch.b);
    body.setTranslation({ x: at.x, y: at.y + RADIUS + 0.6, z: at.z }, true);
  } else {
    const a = Math.random() * Math.PI * 2;
    body.setTranslation({ x: kid.position.x + Math.cos(a) * 2.5, y: kid.position.y + 2, z: kid.position.z + Math.sin(a) * 2.5 }, true);
  }
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
}
