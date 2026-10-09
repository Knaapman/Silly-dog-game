import { interactionGroups } from '@react-three/rapier';
import { useRef } from 'react';
import * as THREE from 'three';
import { playBoing } from '../audio';
import { gameClock, gameNow, useSafeFrame } from '../clock';
import { poof } from '../fx';
import { getInput, makeInputFrame, setInputFrame, NO_INPUT, type ActionName } from '../input';
import { BRONTO, CHICKEN_COOP, distXZ, TUBE_RIDE, isInMud, MOLES, ROUNDABOUT, SEESAWS } from '../layout';
import { RADIUS } from '../player/constants';
import { launchSpots, physics, players, seesawLow, type PlayerRuntime } from '../runtime';
import { parkCats } from '../chase';
import { groundHeight } from '../terrain';
import { settings } from '../settings';
import { isPaused, useGame } from '../store';
import { TEST_MODE } from '../testMode';
import { swingHelp } from './Swings';
import { hamster } from './HamsterBalls';
import { moles } from './Moles';
import { blocks, kidBuilding } from './Blocks';
import { roundabout } from './Roundabout';
import { ferris } from './Carnival';
import { herd, type HerdChicken } from './Chickens';
import { onTube, riverTubes, sleds, TUBE_BOARD, TUBE_COURSE } from './Rides';
import { tickling } from './DinoPark';
import { kites } from './Kites';
import { onCar, train } from './Train';
import { GATE_IN, GATE_OUT, inCoop, useCoop } from '../coop';
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
export const buddyControl = { auto: !TEST_MODE, think: true, boings: 0 };

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
  /** The chicken being walked to the coop, where it was when we started on it, and since when (game ms); ones that wouldn't budge, left alone until then. */
  herding: { chicken: HerdChicken | null; from: THREE.Vector3; since: number; skip: Map<HerdChicken, number> };
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
    herding: { chicken: null, from: new THREE.Vector3(), since: 0, skip: new Map() }
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

    // the child is off down the sled run: the other sled, if it's close by, to race them down
    const raceSled = sleds.some((s) => s && s.rider === kid.slot) ? sleds.find((s) => s && s.mode === 'park' && distXZ(s.x, s.z, me.position.x, me.position.z) < 12) : undefined;
    // on a river tube: stay on it; the child on one: the one waiting at the jetty, to float after them
    const myTube = riverTubes.list.find((t) => t.mode === 'ride' && onTube(me, t));
    const tubing = !myTube && riverTubes.list.some((t) => onTube(kid, t)) && distXZ(me.position.x, me.position.z, JETTY_END.x, JETTY_END.z) < 15;
    const nextTube = tubing ? riverTubes.list.find((t) => t.mode === 'wait' && Math.abs(t.s - TUBE_BOARD) < 0.3) : undefined;
    // the child is on the train: on the next wagon while it waits at the station, and sit tight
    const kidCar = onCar(kid);
    const myCar = kidCar >= 0 ? onCar(me) : -1;
    // the child is flying a kite: fly another one beside them
    const kidKite = kites.list.some((k) => k.holder === kid.slot);
    const myKite = kites.list.some((k) => k.holder === me.slot);
    // the child is rounding up chickens by the coop: a loose one to walk in
    const stray = kidStanding ? strayChicken(kid, me, b, now) : null;

    const fx = Math.sin(me.facing);
    const fz = Math.cos(me.facing);
    /** How the tongue would rate something (lower is better, Infinity: out of reach), like actions.ts does. */
    const tongue = (p: THREE.Vector3, radius: number) => {
      const d = Math.max(0.01, distXZ(me.position.x, me.position.z, p.x, p.z));
      const reach = d - radius;
      const facing = ((p.x - me.position.x) * fx + (p.z - me.position.z) * fz) / d;
      return reach > 2.6 || (facing < 0.15 && reach > 0.8) ? Infinity : reach - facing + 1;
    };
    /** Walk up to `p` and stop a step short, facing it; lick when there (and it's the thing the tongue would get, not the child). */
    const fetch = (p: THREE.Vector3, grab: boolean, radius = 0.55) => {
      const d = Math.max(0.01, distXZ(me.position.x, me.position.z, p.x, p.z));
      target.set(p.x + ((me.position.x - p.x) / d) * 1.1, 0, p.z + ((me.position.z - p.z) / d) * 1.1);
      stopAt = 0.25;
      const facing = ((p.x - me.position.x) * fx + (p.z - me.position.z) * fz) / d;
      const ok = !grab || tongue(p, radius) < tongue(kid.position, RADIUS) - 0.2;
      if (ok && d < 1.7 && facing > 0.8 && now > b.nextHop) {
        b.nextHop = now + 1000;
        press.lick = true;
      }
    };

    let stopAt = 1.2;
    /** Standing somewhere on purpose (no wandering, no silliness). */
    let busy = false;
    /** Trotting along beside the child. */
    let circling = false;
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
    } else if (kidOnWheel) {
      // the child is on the ferris wheel: wait at the front of the deck, and the next gondola
      // down takes us up too
      busy = true;
      stopAt = 0.15;
      target.set(ferris.boardAt[0], 0, ferris.boardAt[1]);
      b.pending = b.pending.filter((p) => p.action !== 'jump');
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
      target.copy(swingHelp.goto);
      b.pending = b.pending.filter((p) => p.action !== 'jump');
    } else if (myCar >= 0) {
      // riding the train with the child: stay on the wagon
      busy = true;
      stopAt = 0.5;
      target.set(train.cars[myCar].x, 0, train.cars[myCar].z);
      b.pending = b.pending.filter((p) => p.action !== 'jump');
    } else if (kidCar >= 0 && train.speed < 0.3) {
      // hop onto the wagon next to the child's (not the engine: its cab fills the deck)
      busy = true;
      b.pending = b.pending.filter((p) => p.action !== 'jump');
      const pick = [kidCar - 1, kidCar + 1].filter((j) => j >= 1 && j < train.cars.length).sort((i, j) => distXZ(me.position.x, me.position.z, train.cars[i].x, train.cars[i].z) - distXZ(me.position.x, me.position.z, train.cars[j].x, train.cars[j].z))[0];
      const car = train.cars[pick];
      target.set(car.x, 0, car.z);
      stopAt = 0.3;
      if (distXZ(me.position.x, me.position.z, car.x, car.z) < 2.4 && me.grounded && now > b.nextHop) {
        b.nextHop = now + 800;
        press.jump = true;
      }
    } else if (myTube) {
      // riding the river: sit tight in the middle of the ring
      busy = true;
      stopAt = 0.3;
      target.set(myTube.x, 0, myTube.z);
      b.pending = b.pending.filter((p) => p.action !== 'jump');
    } else if (tubing) {
      // step off the jetty onto the tube waiting there (the child's own, if it hasn't gone yet: we
      // share), or wait at the end of the jetty for the next one to come up (not swim after them)
      busy = true;
      b.pending = b.pending.filter((p) => p.action !== 'jump');
      if (nextTube) {
        stopAt = 0;
        target.set(nextTube.x, 0, nextTube.z);
      } else {
        stopAt = 0.3;
        target.copy(JETTY_END);
      }
    } else if (raceSled) {
      // walk into it, and down we go a moment behind the child
      busy = true;
      stopAt = 0;
      target.set(raceSled.x, 0, raceSled.z);
      b.pending = b.pending.filter((p) => p.action !== 'jump');
    } else if (kidKite && !myKite) {
      // pick up a spool lying about (not too far off: the child's on the hill with theirs)
      let pick = -1;
      let pd = KITE_FROM;
      kites.list.forEach((k, j) => {
        const p = kites.spool[j];
        if (k.holder != null || !p) return;
        const d = distXZ(me.position.x, me.position.z, p.x, p.z);
        if (d < pd) {
          pd = d;
          pick = j;
        }
      });
      if (pick >= 0) {
        busy = true;
        b.pending = b.pending.filter((p) => p.action !== 'jump');
        fetch(kites.spool[pick], true, 0.3);
      }
    } else if (kidKite && myKite) {
      // run round the child, fast: up goes the kite (and the child's up there with theirs)
      busy = true;
      const kd = distXZ(me.position.x, me.position.z, kid.position.x, kid.position.z);
      const a = Math.atan2(me.position.z - kid.position.z, me.position.x - kid.position.x) + (kd > KITE_LAP + 2 ? 0 : 0.8);
      target.set(kid.position.x + Math.cos(a) * KITE_LAP, 0, kid.position.z + Math.sin(a) * KITE_LAP);
      stopAt = 0;
    } else if (stray && inCoop(me.position.x, me.position.z, -0.4)) {
      // in the coop (followed one in): out through the gate first, not pushing at the fence from inside
      busy = true;
      target.set(GATE_OUT.x, 0, GATE_OUT.z - 1);
      stopAt = 0.3;
    } else if (stray) {
      // circle round behind it and walk it in: chickens run from us just as they do from the
      // child. Lined up with the gate: on in through it; anywhere else: round to the front of the
      // gate first (straight at the coop it would only be pushed into the fence beside the gate)
      busy = true;
      b.pending = b.pending.filter((p) => p.action !== 'jump');
      const lined = Math.abs(stray.pos.x - GATE_IN.x) < CHICKEN_COOP.gate / 2 - 0.2 && stray.pos.z < GATE_IN.z && stray.pos.z > GATE_OUT.z - 3;
      const goal = lined ? GATE_IN : GATE_OUT;
      const gd = Math.max(0.01, distXZ(stray.pos.x, stray.pos.z, goal.x, goal.z));
      const ax = (stray.pos.x - goal.x) / gd;
      const az = (stray.pos.z - goal.z) / gd;
      const md = Math.max(0.01, distXZ(me.position.x, me.position.z, stray.pos.x, stray.pos.z));
      const behind = ((me.position.x - stray.pos.x) * ax + (me.position.z - stray.pos.z) * az) / md;
      // not behind it yet: round at a distance (close by, it would run off the wrong way); then in
      const back = behind > 0.7 ? HERD_CLOSE : HERD_ROUND;
      target.set(stray.pos.x + ax * back, 0, stray.pos.z + az * back);
      stopAt = 0.3;
    } else if (now - tickling.childAt < TICKLE_HELP && !tickling.sneezing && distXZ(kid.position.x, kid.position.z, BRONTO.center[0], BRONTO.center[1]) < 6) {
      // the child is tickling the brontosaurus: tickle it too (from across its tummy, not bonking
      // the child), and it sneezes all the sooner
      busy = true;
      b.pending = b.pending.filter((p) => p.action !== 'jump');
      const [tx, tz] = BRONTO.center;
      const kd = Math.max(0.01, distXZ(kid.position.x, kid.position.z, tx, tz));
      const md = distXZ(me.position.x, me.position.z, tx, tz);
      target.set(tx - ((kid.position.x - tx) / kd) * TICKLE_FROM, 0, tz - ((kid.position.z - tz) / kd) * TICKLE_FROM);
      stopAt = 0.4;
      if (md < TICKLE_FROM + 0.4 && distXZ(me.position.x, me.position.z, kid.position.x, kid.position.z) > 2.5 && now > b.nextHop) {
        b.nextHop = now + 1100;
        press.bonk = true;
      }
    } else if (moles.active && distXZ(kid.position.x, kid.position.z, MOLES.center[0], MOLES.center[1]) < 6) {
      // the child is bonking moles: bonk some too. Not the ones right by the child (those are
      // theirs), not one that's only just come up, and never the golden one: that's for the child.
      busy = true;
      b.pending = b.pending.filter((p) => p.action !== 'jump');
      let best = -1;
      let bd = 1e9;
      moles.list.forEach((m, i) => {
        const [hx, hz] = MOLES.holes[i];
        if (m.state !== 'up' || m.golden || m.t < 0.5 || distXZ(kid.position.x, kid.position.z, hx, hz) < 1.5) return;
        const md = distXZ(me.position.x, me.position.z, hx, hz);
        if (md < bd) {
          bd = md;
          best = i;
        }
      });
      if (best >= 0) {
        target.set(MOLES.holes[best][0], 0, MOLES.holes[best][1]);
        stopAt = 0.1;
        if (bd < 1.5 && now > b.nextHop) {
          b.nextHop = now + 900;
          press.bonk = true;
        }
      } else {
        // waiting at the edge of the molehills, across from the child
        const kd = Math.max(0.01, distXZ(kid.position.x, kid.position.z, MOLES.center[0], MOLES.center[1]));
        target.set(MOLES.center[0] - ((kid.position.x - MOLES.center[0]) / kd) * 3, 0, MOLES.center[1] - ((kid.position.z - MOLES.center[1]) / kd) * 3);
        stopAt = 0.5;
      }
    } else if (roundabout.riders.includes(kid.slot) && !roundabout.riders.includes(me.slot)) {
      // the child is riding the roundabout: run round beside it, pushing it faster and faster
      busy = true;
      b.pending = b.pending.filter((p) => p.action !== 'jump');
      const [rx, rz] = ROUNDABOUT.center;
      const a = Math.atan2(me.position.z - rz, me.position.x - rx);
      // (it turns the way the angle goes down: run that way, a little way ahead)
      const ahead = a - (roundabout.spin >= 0 ? 0.7 : -0.7);
      const r = ROUNDABOUT.radius + 0.6;
      target.set(rx + Math.cos(ahead) * r, 0, rz + Math.sin(ahead) * r);
      stopAt = 0.05;
    } else if (kidBuilding(kid, now)) {
      // the child is building a tower: fetch blocks for it
      busy = true;
      b.pending = b.pending.filter((p) => p.action !== 'jump');
      const mine = blocks.list.findIndex((bl) => bl.holder === me.slot);
      const tower = blocks.kidTop;
      if (mine >= 0) {
        // carrying one: onto the child's tower (if there's room up there for one more)
        if (tower >= 0 && tower !== mine) fetch(blocks.pos[tower], false);
        else target.copy(me.position);
      } else {
        // a block lying loose (not in the child's tower, nothing on it), nearest first
        let pick = -1;
        let pd = 1e9;
        const base = tower >= 0 ? blocks.pos[tower] : kid.position;
        blocks.list.forEach((bl, j) => {
          const p = blocks.pos[j];
          if (bl.holder != null || bl.height > 1 || bl.above >= 0 || distXZ(p.x, p.z, base.x, base.z) < 1.5) return;
          const d = distXZ(me.position.x, me.position.z, p.x, p.z);
          if (d < pd && d < 14) {
            pd = d;
            pick = j;
          }
        });
        if (pick >= 0) fetch(blocks.pos[pick], true);
      }
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
    // flying a kite, and the child's put theirs down: ours down too
    if (myKite && !kidKite && now > b.nextHop) {
      b.nextHop = now + 1000;
      press.lick = true;
    }
    // still carrying a block, and the child's stopped building: put it down
    if (!kidBuilding(kid, now) && blocks.list.some((bl) => bl.holder === me.slot) && now > b.nextHop) {
      b.nextHop = now + 1000;
      press.lick = true;
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

/** The end of the tube jetty, where the buddy waits for its tube. */
const JETTY_END = (() => {
  const p = TUBE_COURSE.at(TUBE_BOARD);
  return new THREE.Vector3(p.x - TUBE_RIDE.radius - 0.6, 0, p.z);
})();

/** Kites: a spool this close (m) to fetch; laps round the child this far out. */
const KITE_FROM = 14;
const KITE_LAP = 4.5;

/** Tickling: a child's tickle this recent (ms) and the buddy joins in, from this far out from the middle. */
const TICKLE_HELP = 4000;
const TICKLE_FROM = 2.6;

/** Herding: the child this close to the coop's gate, and loose chickens this close to it, count. */
const HERD_NEAR = 16;
const HERD_FROM = 24;
/** Behind a chicken: this close pushes it on (it runs from 3.6 m); going round, this far. */
const HERD_CLOSE = 2;
const HERD_ROUND = 4.6;
/** Not moved this far (m) in this long (ms): it isn't going anywhere; leave it alone this long. */
const HERD_BUDGE = 1.5;
const HERD_STUCK = 8000;
const HERD_SKIP = 20000;

/** A loose chicken near the coop for the buddy to walk in, while the child is about there. */
function strayChicken(kid: PlayerRuntime, me: PlayerRuntime, b: Brain, now: number): HerdChicken | null {
  if (useCoop.getState().doneAt >= 0) return null;
  if (distXZ(kid.position.x, kid.position.z, GATE_OUT.x, GATE_OUT.z) > HERD_NEAR) return null;
  let best: HerdChicken | null = null;
  let bd = Infinity;
  for (const c of herd) {
    if (!c || c.penned || c.leaving || c.mode === 'held' || c.mode === 'tumble' || inCoop(c.pos.x, c.pos.z, -0.6) || (b.herding.skip.get(c) ?? 0) > now) continue;
    if (distXZ(c.pos.x, c.pos.z, GATE_OUT.x, GATE_OUT.z) > HERD_FROM) continue;
    // (one in the mud last: we'd only get stuck in it)
    const d = distXZ(c.pos.x, c.pos.z, me.position.x, me.position.z) + (isInMud(c.pos.x, c.pos.z) ? 30 : 0);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  // one that hasn't gone anywhere for a while with us right by it (wedged somewhere): another one
  const h = b.herding;
  if (best !== h.chicken) {
    h.chicken = best;
    h.since = now;
    if (best) h.from.copy(best.pos);
  } else if (best && (distXZ(best.pos.x, best.pos.z, h.from.x, h.from.z) > HERD_BUDGE || distXZ(best.pos.x, best.pos.z, me.position.x, me.position.z) > HERD_ROUND + 1)) {
    // (it's only stuck if it stays put with us right there)
    h.since = now;
    h.from.copy(best.pos);
  } else if (best && now - h.since > HERD_STUCK) {
    h.skip.set(best, now + HERD_SKIP);
    h.chicken = null;
  }
  return best;
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
