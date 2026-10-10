import { interactionGroups } from '@react-three/rapier';
import { useRef } from 'react';
import * as THREE from 'three';
import { playBoing } from '../audio';
import { gameClock, gameNow, useSafeFrame } from '../clock';
import { poof } from '../fx';
import { getInput, makeInputFrame, setInputFrame, NO_INPUT, type ActionName } from '../input';
import { distXZ } from '../layout';
import { RADIUS } from '../player/constants';
import { launchSpots, physics, players, type PlayerRuntime } from '../runtime';
import { groundHeight } from '../terrain';
import { buddyMay, settings } from '../settings';
import { isPaused, useGame } from '../store';
import { TEST_MODE } from '../testMode';
import { hamster } from './HamsterBalls';
import { ferris } from './Carnival';
import type { HerdChicken } from './Chickens';
import { PLAYS, RUN_UP, type PlayCtx } from './buddyPlay';
import { randomStream } from '../rng';

const random = randomStream('buddy');

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
/** Standing this high the child is up on something: follow in their footsteps, not round them. */
const UP_HIGH = 2.6;
/** How many of the child's recent footsteps to remember. */
const TRAIL = 24;

/**
 * Automatic buddy: `auto` makes it come and go by itself (off in test mode unless a test switches
 * it on); `think` lets it move about once it's here (a test can switch that off to have it stand
 * still, e.g. as something to throw at).
 */
export const buddyControl = { auto: !TEST_MODE, think: true, boings: 0 };

export type Brain = {
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
  /** The chicken being walked to the coop, where it was when we started on it, and since when (game ms); ones that wouldn't budge, left alone until then. */
  herding: { chicken: HerdChicken | null; from: THREE.Vector3; since: number; skip: Map<HerdChicken, number> };
  /** When the child was last seen building a snowman (game ms). */
  snowmanAt: number;
};

const scratch = { target: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3() };

export function Buddy() {
  const brain = useRef<Brain>({
    synced: false,
    aloneSince: -1,
    kidJumpedAt: 0,
    kidNoiseAt: 0,
    pending: [],
    circle: random() * 6,
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
    nextBoing: 0,
    herding: { chicken: null, from: new THREE.Vector3(), since: 0, skip: new Map() },
    snowmanAt: -1e9
  });

  // after the input is read (priority -10), before the animals move (0)
  useSafeFrame(() => {
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
  // (a gondola on the ferris wheel is no place to land: it moves on)
  const kidOnWheel = ferris.riding.includes(kid.slot);
  if (kidStanding && !kidOnWheel) {
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
  if (hamster.balls.some((b) => b && b.rider === me.slot)) {
    // in a hamster ball: roll along after the child (and bump into them now and then)
    const d = distXZ(me.position.x, me.position.z, kid.position.x, kid.position.z);
    if (d > 3) {
      const k = Math.min(1, (d - 2) / 4) / d;
      x = (kid.position.x - me.position.x) * k;
      z = (kid.position.z - me.position.z) * k;
    }
    b.pending = [];
  } else if (ferris.riding.includes(me.slot)) {
    // in a gondola on the ferris wheel, behind the child's: enjoy the ride; once the child has got
    // out, hop out too, down at the bottom (towards the deck)
    b.pending = b.pending.filter((p) => p.action !== 'jump');
    if (!kidOnWheel && me.position.y - groundHeight(me.position.x, me.position.z) < 1.5) {
      z = 1;
      press.jump = true;
    }
  } else if (me.grabbedBy != null || kid.asleep) {
    // dangling from a tongue (giggle now and then), or waiting for a napping friend
    if (me.grabbedBy != null && random() < dt * 0.6) press.noise = true;
    b.pending = [];
  } else if (me.ridingOn != null) {
    // riding on the child's back: enjoy it for a bit, then hop off (up high: only onto a spot
    // the child stood on, never into thin air). A jump still queued from before (copying the
    // child, or being silly) would throw us straight off again: forget those.
    b.pending = b.pending.filter((p) => p.action !== 'jump');
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
    b.apartFor = outOfReach && !kidOnWheel ? b.apartFor + dt : Math.max(0, b.apartFor - dt * 2);
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

    const fx = Math.sin(me.facing);
    const fz = Math.cos(me.facing);
    /** How the tongue would rate something (lower is better, Infinity: out of reach), like actions.ts does. */
    const tongue = (p: THREE.Vector3, radius: number) => {
      const d = Math.max(0.01, distXZ(me.position.x, me.position.z, p.x, p.z));
      const reach = d - radius;
      const facing = ((p.x - me.position.x) * fx + (p.z - me.position.z) * fz) / d;
      return reach > 2.6 || (facing < 0.15 && reach > 0.8) ? Infinity : reach - facing + 1;
    };
    const c: PlayCtx = {
      b,
      me,
      kid,
      now,
      dt,
      kidStanding,
      kidOnWheel,
      d,
      kidAbove,
      runUp,
      target,
      stopAt: 1.2,
      tmp,
      press,
      fetch: (p, grab, radius = 0.55) => {
        const pd = Math.max(0.01, distXZ(me.position.x, me.position.z, p.x, p.z));
        target.set(p.x + ((me.position.x - p.x) / pd) * 1.1, 0, p.z + ((me.position.z - p.z) / pd) * 1.1);
        c.stopAt = 0.25;
        const facing = ((p.x - me.position.x) * fx + (p.z - me.position.z) * fz) / pd;
        const ok = !grab || tongue(p, radius) < tongue(kid.position, RADIUS) - 0.2;
        if (ok && pd < 1.7 && facing > 0.8 && now > b.nextHop) {
          b.nextHop = now + 1000;
          press.lick = true;
        }
      }
    };
    // the attractions (buddyPlay.ts): the first that applies, and that the grown-ups allow, takes over
    // (sense and tidy always run: keeping track, and putting down what we no longer want)
    for (const play of PLAYS) play.sense?.(c);
    /** Standing somewhere on purpose (no wandering, no silliness). */
    let busy = false;
    for (const play of PLAYS) {
      if (buddyMay(play.kind) && play.act(c)) {
        busy = true;
        break;
      }
    }
    /** Trotting along beside the child. */
    let circling = false;
    if (!busy) {
      const spot = kidHigh ? footstep(b.trail, kid, 1.5, 4) : null;
      if (spot) {
        // up on something (a roof, a tower): follow in the child's footsteps, not into thin air
        target.copy(spot);
        c.stopAt = 0.6;
      } else if (kidHigh) {
        // nowhere known to stand but right where the child is: stay close, or come closer
        target.copy(d < 3 ? me.position : kid.position);
      } else {
        // trot along beside the child, slowly circling round: on the side where there's room
        // (never a spot inside a wall, which it would push against for ever), going round till there is
        circling = true;
        b.circle += dt * 0.3;
        let r = roomToward(kid, b.circle);
        for (let k = 1; k < 8 && r < 1.5; k += 1) {
          b.circle += Math.PI / 4;
          r = roomToward(kid, b.circle);
        }
        target.set(kid.position.x + Math.cos(b.circle) * r, 0, kid.position.z + Math.sin(b.circle) * r);
      }
    }
    for (const play of PLAYS) play.tidy?.(c);
    const stopAt = c.stopAt;
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
    // (trotting beside the child and stuck anyway: try another side)
    if (circling && b.stuckFor > 0.5 && b.stuckFor - dt <= 0.5) b.circle += Math.PI / 2;
    if (b.stuckFor > 0.8 && b.stuckFor - dt <= 0.8) press.jump = true;
    if (b.stuckFor > 5) {
      b.stuckFor = 0;
      catchUp(me, kid, b.trail);
    }
    // and just being silly now and then while standing about
    if (!moving && now > b.nextSilly && !busy && me.grounded && !me.isLaunched()) {
      b.nextSilly = now + 7000 + random() * 8000;
      if (random() < 0.5) {
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

/**
 * How far (up to FOLLOW) the buddy can stand from the child in direction `angle` before something
 * solid is in the way (a wall, a fence, a tree), leaving room for itself.
 */
function roomToward(kid: PlayerRuntime, angle: number) {
  const { world, rapier } = physics;
  if (!world || !rapier) return FOLLOW;
  roomRay.origin = { x: kid.position.x, y: kid.position.y + 0.1, z: kid.position.z };
  roomRay.dir = { x: Math.cos(angle), y: 0, z: Math.sin(angle) };
  const hit = world.castRay(roomRay as never, FOLLOW + ROOM, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, NOT_ANIMALS);
  return hit ? Math.max(0, Math.min(FOLLOW, hit.timeOfImpact - ROOM)) : FOLLOW;
}
/** Room the buddy needs between where it stands and a wall (its size, and a bit). */
const ROOM = 0.8;
const roomRay = { origin: { x: 0, y: 0, z: 0 }, dir: { x: 1, y: 0, z: 0 } };
/** A ray that sees everything solid except animals (the child and the buddy themselves). */
const NOT_ANIMALS = interactionGroups(0, [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

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
  buddyControl.boings += 1;
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
    const a = random() * Math.PI * 2;
    body.setTranslation({ x: kid.position.x + Math.cos(a) * 2.5, y: kid.position.y + 2, z: kid.position.z + Math.sin(a) * 2.5 }, true);
  }
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
}
