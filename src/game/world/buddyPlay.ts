import * as THREE from 'three';
import type { ActionName } from '../input';
import { BRONTO, CHICKEN_COOP, distXZ, isInMud, MOLES, PENGUIN_SHY, ROUNDABOUT, SEESAWS, SNOW, SNOWMAN_BUILD, TUBE_RIDE } from '../layout';
import { players, seesawLow, type PlayerRuntime } from '../runtime';
import { parkCats } from '../chase';
import { SNOWMAN_MIN, useSnowman } from '../snowman';
import { GATE_IN, GATE_OUT, inCoop, useCoop } from '../coop';
import { swingSeats } from './Swings';
import { zipline } from './Zipline';
import { inTrailer, tractor } from './Tractor';
import { moles } from './Moles';
import { blocks, kidBuilding } from './Blocks';
import { roundabout } from './Roundabout';
import { ferris } from './Carnival';
import { herd, type HerdChicken } from './Chickens';
import { onTube, riverTubes, sleds, TUBE_BOARD, TUBE_COURSE } from './Rides';
import { tickling } from './DinoPark';
import { kites } from './Kites';
import { onCar, train } from './Train';
import { shy } from './PenguinShy';
import { buddyThrow, holdingBall, nearestBall, snowballFight, threwLately, THROW_BACK_RANGE } from './SnowballFight';
import { rolling } from './Winter';
import type { Brain } from './Buddy';

// What the buddy does at each attraction, in order: the first one that applies takes over (it
// picks where to stand and what to press); none applies and the buddy just trots along beside
// the child. Each one is either something to do along with the child (`join`: a ride, a kite, a
// push on the roundabout) or help towards what the child is trying to do (`help`: chickens in
// the coop, penguins off the counter, a snowman); `core` is just keeping up. A grown-up can turn
// `help`, or `help` and `join`, off (see buddyMay in settings.ts).

export type PlayKind = 'core' | 'join' | 'help';

/** What a play gets to look at and change, this frame. */
export type PlayCtx = {
  b: Brain;
  me: PlayerRuntime;
  kid: PlayerRuntime;
  now: number;
  dt: number;
  /** The child is on their feet (not flying, riding, held or flopped). */
  kidStanding: boolean;
  kidOnWheel: boolean;
  /** How far apart the buddy and the child are. */
  d: number;
  /** The child is up above, out of reach: get ready to boing (see Buddy.tsx). */
  kidAbove: boolean;
  /** ...and close enough that the boing wants a run-up first. */
  runUp: boolean;
  /** Where to go, and how close is close enough. */
  target: THREE.Vector3;
  stopAt: number;
  tmp: THREE.Vector3;
  press: Partial<Record<ActionName, boolean>>;
  /** Walk up to `p` and stop a step short, facing it; lick when there (and it's the thing the tongue would get, not the child). */
  fetch: (p: THREE.Vector3, grab: boolean, radius?: number) => void;
};

export type Play = {
  name: string;
  kind: PlayKind;
  /** Every frame, whatever the buddy ends up doing (to keep track of things). */
  sense?: (c: PlayCtx) => void;
  /** Does this apply now? If so, set the target (and stopAt, presses) and say true. */
  act: (c: PlayCtx) => boolean;
  /** Every frame, after: tidying up (putting something down that's no longer wanted). */
  tidy?: (c: PlayCtx) => void;
};

/** Boing up to the child from at least this far out, or it bonks its head on whatever the child stands on. */
export const RUN_UP = 7;

/** No more jumping about: it would spoil whatever we're doing. */
const calm = (b: Brain) => {
  b.pending = b.pending.filter((p) => p.action !== 'jump');
};

/** Put down whatever we're holding (once a second at most). */
const putDown = (c: PlayCtx) => {
  if (c.now <= c.b.nextHop) return;
  c.b.nextHop = c.now + 1000;
  c.press.lick = true;
};

// ---- keeping up ----

const launcher: Play = {
  name: 'launcher',
  kind: 'core',
  act: (c) => {
    const { b, me } = c;
    if (!b.via) return false;
    // off to the launcher the child took; wait on it (a geyser takes a moment), and if it
    // doesn't take us, boing over instead
    c.stopAt = 0.15;
    c.target.set(b.via.x, 0, b.via.z);
    calm(b);
    if (distXZ(me.position.x, me.position.z, b.via.x, b.via.z) < 1) {
      b.via.waited += c.dt;
      if (b.via.waited > 7) b.via = null;
    }
    return true;
  }
};

const ferrisWait: Play = {
  name: 'ferris',
  kind: 'join',
  act: (c) => {
    if (!c.kidOnWheel) return false;
    // the child is on the ferris wheel: wait at the front of the deck, and the next gondola
    // down takes us up too
    c.stopAt = 0.15;
    c.target.set(ferris.boardAt[0], 0, ferris.boardAt[1]);
    calm(c.b);
    return true;
  }
};

const runUp: Play = {
  name: 'run-up',
  kind: 'core',
  act: (c) => {
    if (!c.kidAbove) return false;
    // the child is up above us: stand back for a run-up (see the boing in Buddy.tsx) and get ready
    const { me, kid, d } = c;
    c.stopAt = 0.2;
    if (!c.runUp) c.target.copy(me.position);
    else if (d < 0.3) c.target.set(kid.position.x + RUN_UP, 0, kid.position.z);
    else c.target.set(kid.position.x + ((me.position.x - kid.position.x) / d) * RUN_UP, 0, kid.position.z + ((me.position.z - kid.position.z) / d) * RUN_UP);
    return true;
  }
};

// ---- rides ----

const swing: Play = {
  name: 'swing',
  kind: 'join',
  act: (c) => {
    const { riders, x: xs, z: sz } = swingSeats;
    const kidSeat = riders.indexOf(c.kid.slot);
    if (kidSeat < 0) return false;
    calm(c.b);
    if (riders.includes(c.me.slot)) {
      // on the swing next to the child's: swinging along (Swings.tsx does the swinging)
      c.target.copy(c.me.position);
      return true;
    }
    // the child is on a swing: sit on the one next to it (the nearer side of the two, if both are free)
    const free = [kidSeat - 1, kidSeat + 1].filter((i) => i >= 0 && i < xs.length && riders[i] == null);
    const pick = free.sort((a, b) => Math.abs(xs[a] - c.me.position.x) - Math.abs(xs[b] - c.me.position.x))[0];
    if (pick == null) return false;
    c.target.set(xs[pick], 0, sz);
    c.stopAt = 0;
    return true;
  }
};

const zip: Play = {
  name: 'zipline',
  kind: 'join',
  act: (c) => {
    const riders = zipline.riders();
    if (!riders.includes(c.kid.slot) || riders.includes(c.me.slot)) return false;
    const { at } = zipline;
    if (distXZ(c.me.position.x, c.me.position.z, at.x, at.z) > 20) return false;
    // the child is off down the zipline: up onto the platform after them, and the next handle takes us
    calm(c.b);
    c.target.set(at.x, 0, at.z);
    c.stopAt = 0;
    return true;
  }
};

const trailer: Play = {
  name: 'trailer',
  kind: 'join',
  act: (c) => {
    const s = tractor.state;
    const { b, me, now } = c;
    if (!s || s.driver !== c.kid.slot) return false;
    if (inTrailer(me)) {
      // riding in the trailer behind the child: stay in it
      calm(b);
      c.target.set(s.tx, 0, s.tz);
      c.stopAt = 0.4;
      return true;
    }
    // the child is driving the tractor: while it's going slowly, jump in the trailer
    if (Math.abs(s.speed) > 1.5 || distXZ(me.position.x, me.position.z, s.tx, s.tz) > 15) return false;
    calm(b);
    c.target.set(s.tx, 0, s.tz);
    c.stopAt = 0;
    if (distXZ(me.position.x, me.position.z, s.tx, s.tz) < 2.2 && me.grounded && now > b.nextHop) {
      b.nextHop = now + 800;
      c.press.jump = true;
    }
    return true;
  }
};

const trainRide: Play = {
  name: 'train',
  kind: 'join',
  act: (c) => {
    const { b, me, kid, now } = c;
    const kidCar = onCar(kid);
    if (kidCar < 0) return false;
    const myCar = onCar(me);
    if (myCar >= 0) {
      // riding the train with the child: stay on the wagon
      c.stopAt = 0.5;
      c.target.set(train.cars[myCar].x, 0, train.cars[myCar].z);
      calm(b);
      return true;
    }
    if (train.speed >= 0.3) return false;
    // hop onto the wagon next to the child's (not the engine: its cab fills the deck)
    calm(b);
    const pick = [kidCar - 1, kidCar + 1].filter((j) => j >= 1 && j < train.cars.length).sort((i, j) => distXZ(me.position.x, me.position.z, train.cars[i].x, train.cars[i].z) - distXZ(me.position.x, me.position.z, train.cars[j].x, train.cars[j].z))[0];
    const car = train.cars[pick];
    c.target.set(car.x, 0, car.z);
    c.stopAt = 0.3;
    if (distXZ(me.position.x, me.position.z, car.x, car.z) < 2.4 && me.grounded && now > b.nextHop) {
      b.nextHop = now + 800;
      c.press.jump = true;
    }
    return true;
  }
};

/** The end of the tube jetty, where the buddy waits for its tube. */
const JETTY_END = (() => {
  const p = TUBE_COURSE.at(TUBE_BOARD);
  return new THREE.Vector3(p.x - TUBE_RIDE.radius - 0.6, 0, p.z);
})();

const tubes: Play = {
  name: 'tubes',
  kind: 'join',
  act: (c) => {
    const { me, kid } = c;
    const myTube = riverTubes.list.find((t) => t.mode === 'ride' && onTube(me, t));
    if (myTube) {
      // riding the river: sit tight in the middle of the ring
      c.stopAt = 0.3;
      c.target.set(myTube.x, 0, myTube.z);
      calm(c.b);
      return true;
    }
    if (!riverTubes.list.some((t) => onTube(kid, t)) || distXZ(me.position.x, me.position.z, JETTY_END.x, JETTY_END.z) >= 15) return false;
    // the child is on a tube: step off the jetty onto the one waiting there (the child's own, if it
    // hasn't gone yet: we share), or wait at the end of the jetty for the next one to come up (not
    // swim after them)
    calm(c.b);
    const next = riverTubes.list.find((t) => t.mode === 'wait' && Math.abs(t.s - TUBE_BOARD) < 0.3);
    if (next) {
      c.stopAt = 0;
      c.target.set(next.x, 0, next.z);
    } else {
      c.stopAt = 0.3;
      c.target.copy(JETTY_END);
    }
    return true;
  }
};

const sledRace: Play = {
  name: 'sled',
  kind: 'join',
  act: (c) => {
    const { me, kid } = c;
    // the child is off down the sled run: the other sled, if it's close by, to race them down
    if (!sleds.some((s) => s && s.rider === kid.slot)) return false;
    const sled = sleds.find((s) => s && s.mode === 'park' && distXZ(s.x, s.z, me.position.x, me.position.z) < 12);
    if (!sled) return false;
    // walk into it, and down we go a moment behind the child
    c.stopAt = 0;
    c.target.set(sled.x, 0, sled.z);
    calm(c.b);
    return true;
  }
};

// ---- games ----

/** Snowman: the child this close to the ring (m) counts as building, for this long (ms) after; snowballs this close to fetch; laps this far out. */
const SNOW_NEAR = 12;
const SNOW_KEEP = 8000;
const SNOW_FROM = 16;
const SNOW_LAP = 3.5;
/** Where those laps go round, from the middle of the snow. */
const SNOW_LAPS = [1, -9.5] as const;

/** Is the child pushing this snowball (right up against it, and it's rolling)? */
function pushing(sb: (typeof rolling)[number], kid: PlayerRuntime) {
  const at = sb.at();
  return !!at && distXZ(at.x, at.z, kid.position.x, kid.position.z) < sb.r() + 1.2 && sb.speed() > 0.6;
}

/** Helping with the snowman right now: the bottom or the middle still to come (the head is always the child's). */
const building = (c: PlayCtx) => useSnowman.getState().pieces.length < 2 && c.now - c.b.snowmanAt < SNOW_KEEP;
const myBall = (c: PlayCtx) => rolling.find((sb) => sb.entry()?.heldBy === c.me.slot);

const snowman: Play = {
  name: 'snowman',
  kind: 'help',
  sense: (c) => {
    const { kid } = c;
    const pieces = useSnowman.getState().pieces.length;
    const [rx, rz] = SNOWMAN_BUILD.center;
    if (pieces < 2 && distXZ(kid.position.x, kid.position.z, rx, rz) < SNOW_NEAR && (pieces > 0 || rolling.some((sb) => sb.entry()?.heldBy === kid.slot || pushing(sb, kid)))) c.b.snowmanAt = c.now;
  },
  act: (c) => {
    if (!building(c)) return false;
    const { me, kid } = c;
    const mine = myBall(c);
    if (!mine) {
      // a snowball to roll: one lying about, not the child's
      let pick: (typeof rolling)[number] | undefined;
      let pd = SNOW_FROM;
      for (const sb of rolling) {
        const e = sb.entry();
        const at = sb.at();
        if (!e || !at || !e.enabled || e.heldBy != null || pushing(sb, kid)) continue;
        const d = distXZ(me.position.x, me.position.z, at.x, at.z);
        if (d < pd) {
          pd = d;
          pick = sb;
        }
      }
      const at = pick?.at();
      if (!pick || !at) return false;
      calm(c.b);
      c.fetch(c.tmp.set(at.x, at.y, at.z), true, pick.r());
      return true;
    }
    // carrying it: round and round through the snow till it's big enough, then into the ring
    calm(c.b);
    if (mine.r() < SNOWMAN_MIN[useSnowman.getState().pieces.length] + 0.08) {
      // (round a patch of open snow south of the piles: clear of the ring, the ice, the snowmen)
      const cx = SNOW.center[0] + SNOW_LAPS[0];
      const cz = SNOW.center[1] + SNOW_LAPS[1];
      const a = Math.atan2(me.position.z - cz, me.position.x - cx) + 0.9;
      c.target.set(cx + Math.cos(a) * SNOW_LAP, 0, cz + Math.sin(a) * SNOW_LAP);
      c.stopAt = 0;
    } else {
      c.target.set(SNOWMAN_BUILD.center[0], 0, SNOWMAN_BUILD.center[1]);
      c.stopAt = 0.2;
    }
    return true;
  },
  // carrying a snowball, and the snowman's not ours to help with now: put it down
  tidy: (c) => {
    if (myBall(c) && !building(c)) putDown(c);
  }
};

/** Kites: a spool this close (m) to fetch; laps round the child this far out. */
const KITE_FROM = 14;
const KITE_LAP = 4.5;

const kite: Play = {
  name: 'kite',
  kind: 'join',
  act: (c) => {
    const { me, kid } = c;
    if (!kites.list.some((k) => k.holder === kid.slot)) return false;
    if (!kites.list.some((k) => k.holder === me.slot)) {
      // the child is flying a kite: pick up a spool lying about (not too far off: the child's on
      // the hill with theirs)
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
      if (pick < 0) return false;
      calm(c.b);
      c.fetch(kites.spool[pick], true, 0.3);
      return true;
    }
    // run round the child, fast: up goes the kite (and the child's up there with theirs)
    const kd = distXZ(me.position.x, me.position.z, kid.position.x, kid.position.z);
    const a = Math.atan2(me.position.z - kid.position.z, me.position.x - kid.position.x) + (kd > KITE_LAP + 2 ? 0 : 0.8);
    c.target.set(kid.position.x + Math.cos(a) * KITE_LAP, 0, kid.position.z + Math.sin(a) * KITE_LAP);
    c.stopAt = 0;
    return true;
  },
  // flying a kite, and the child's put theirs down: ours down too
  tidy: (c) => {
    if (kites.list.some((k) => k.holder === c.me.slot) && !kites.list.some((k) => k.holder === c.kid.slot)) putDown(c);
  }
};

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

/** This frame's loose chicken (see strayChicken), looked for every frame so its stuck timer keeps going. */
let stray: HerdChicken | null = null;

const chickens: Play = {
  name: 'chickens',
  kind: 'help',
  sense: (c) => {
    stray = c.kidStanding ? strayChicken(c.kid, c.me, c.b, c.now) : null;
  },
  act: (c) => {
    if (!stray) return false;
    const { me } = c;
    if (inCoop(me.position.x, me.position.z, -0.4)) {
      // in the coop (followed one in): out through the gate first, not pushing at the fence from inside
      c.target.set(GATE_OUT.x, 0, GATE_OUT.z - 1);
      c.stopAt = 0.3;
      return true;
    }
    // circle round behind it and walk it in: chickens run from us just as they do from the
    // child. Lined up with the gate: on in through it; anywhere else: round to the front of the
    // gate first (straight at the coop it would only be pushed into the fence beside the gate)
    calm(c.b);
    const lined = Math.abs(stray.pos.x - GATE_IN.x) < CHICKEN_COOP.gate / 2 - 0.2 && stray.pos.z < GATE_IN.z && stray.pos.z > GATE_OUT.z - 3;
    const goal = lined ? GATE_IN : GATE_OUT;
    const gd = Math.max(0.01, distXZ(stray.pos.x, stray.pos.z, goal.x, goal.z));
    const ax = (stray.pos.x - goal.x) / gd;
    const az = (stray.pos.z - goal.z) / gd;
    const md = Math.max(0.01, distXZ(me.position.x, me.position.z, stray.pos.x, stray.pos.z));
    const behind = ((me.position.x - stray.pos.x) * ax + (me.position.z - stray.pos.z) * az) / md;
    // not behind it yet: round at a distance (close by, it would run off the wrong way); then in
    const back = behind > 0.7 ? HERD_CLOSE : HERD_ROUND;
    c.target.set(stray.pos.x + ax * back, 0, stray.pos.z + az * back);
    c.stopAt = 0.3;
    return true;
  }
};

/** Penguin shy: the child threw this recently (ms) this close by (m): throw too, from this far in front, this often (ms). */
const SHY_HELP = 15000;
const SHY_NEAR = 10;
const SHY_FROM = 5.5;
const SHY_EVERY = 2600;

/** Snowballs this close (m) on a pile are worth fetching. */
const SNOWBALL_FROM = 20;
/** Thrown at by the child: a snowball back at them within this long (ms), or never mind. */
const THROW_BACK_FOR = 12000;

const throwBack: Play = {
  name: 'throw back',
  kind: 'join',
  act: (c) => {
    const { me, now } = c;
    const tb = snowballFight.throwBack;
    if (!tb) return false;
    const by = players.get(tb.by);
    if (!by || now - tb.at > THROW_BACK_FOR) {
      snowballFight.throwBack = null;
      return false;
    }
    calm(c.b);
    if (!holdingBall(me.slot)) {
      // hit! a snowball from the pile, and...
      const ball = nearestBall(me.position.x, me.position.z, SNOWBALL_FROM);
      if (!ball) {
        snowballFight.throwBack = null;
        return false;
      }
      c.fetch(ball, true, 0.35);
      return true;
    }
    // ...back at them (walking closer if they're too far for a throw)
    const d = distXZ(me.position.x, me.position.z, by.position.x, by.position.z);
    if (d > THROW_BACK_RANGE - 2) {
      c.target.copy(by.position);
      c.stopAt = THROW_BACK_RANGE - 3;
      return true;
    }
    c.target.copy(me.position);
    c.tmp.copy(by.position);
    c.tmp.y += 0.2;
    if (buddyThrow(me.slot, c.tmp)) snowballFight.throwBack = null;
    return true;
  },
  // nobody to throw at any more: put the snowball down
  tidy: (c) => {
    if (holdingBall(c.me.slot) && !snowballFight.throwBack && !threwLately(c.kid.slot, c.now, SHY_HELP)) putDown(c);
  }
};

const penguins: Play = {
  name: 'penguins',
  kind: 'help',
  act: (c) => {
    const { b, me, kid, now } = c;
    if (!threwLately(kid.slot, now, SHY_HELP) || distXZ(kid.position.x, kid.position.z, PENGUIN_SHY.center[0], PENGUIN_SHY.center[1]) >= SHY_NEAR) return false;
    // the child is throwing snowballs at the penguins: throw some too, from in front of the
    // counter, off to the child's other side. Never the last one standing: that's the child's.
    calm(b);
    if (!holdingBall(me.slot)) {
      // a snowball from a pile first
      const ball = nearestBall(me.position.x, me.position.z, SNOWBALL_FROM);
      if (!ball) return false;
      c.fetch(ball, true, 0.35);
      return true;
    }
    const [px, pz] = PENGUIN_SHY.center;
    const side = kid.position.z > pz ? -1 : 1;
    c.target.set(px - SHY_FROM, 0, pz + side * 1.6);
    c.stopAt = 0.5;
    const up = shy.list.map((p, i) => (p.down ? -1 : i)).filter((i) => i >= 0);
    if (up.length > 1 && distXZ(me.position.x, me.position.z, c.target.x, c.target.z) < 1 && me.grounded && now > b.nextHop) {
      // (the nearest one standing on our side)
      const pick = up.reduce((a, i) => (Math.abs(shy.at[i].z - me.position.z) < Math.abs(shy.at[a].z - me.position.z) ? i : a), up[0]);
      if (buddyThrow(me.slot, shy.at[pick])) b.nextHop = now + SHY_EVERY;
    }
    return true;
  }
};

/** Tickling: a child's tickle this recent (ms) and the buddy joins in, from this far out from the middle. */
const TICKLE_HELP = 4000;
const TICKLE_FROM = 2.6;

const tickle: Play = {
  name: 'tickle',
  kind: 'help',
  act: (c) => {
    const { b, me, kid, now } = c;
    if (now - tickling.childAt >= TICKLE_HELP || tickling.sneezing || distXZ(kid.position.x, kid.position.z, BRONTO.center[0], BRONTO.center[1]) >= 6) return false;
    // the child is tickling the brontosaurus: tickle it too (from across its tummy, not bonking
    // the child), and it sneezes all the sooner
    calm(b);
    const [tx, tz] = BRONTO.center;
    const kd = Math.max(0.01, distXZ(kid.position.x, kid.position.z, tx, tz));
    const md = distXZ(me.position.x, me.position.z, tx, tz);
    c.target.set(tx - ((kid.position.x - tx) / kd) * TICKLE_FROM, 0, tz - ((kid.position.z - tz) / kd) * TICKLE_FROM);
    c.stopAt = 0.4;
    if (md < TICKLE_FROM + 0.4 && distXZ(me.position.x, me.position.z, kid.position.x, kid.position.z) > 2.5 && now > b.nextHop) {
      b.nextHop = now + 1100;
      c.press.bonk = true;
    }
    return true;
  }
};

const molehills: Play = {
  name: 'moles',
  kind: 'help',
  act: (c) => {
    const { b, me, kid, now } = c;
    if (!moles.active || distXZ(kid.position.x, kid.position.z, MOLES.center[0], MOLES.center[1]) >= 6) return false;
    // the child is bonking moles: bonk some too. Not the ones right by the child (those are
    // theirs), not one that's only just come up, and never the golden one: that's for the child.
    calm(b);
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
      c.target.set(MOLES.holes[best][0], 0, MOLES.holes[best][1]);
      c.stopAt = 0.1;
      if (bd < 1.5 && now > b.nextHop) {
        b.nextHop = now + 900;
        c.press.bonk = true;
      }
    } else {
      // waiting at the edge of the molehills, across from the child
      const kd = Math.max(0.01, distXZ(kid.position.x, kid.position.z, MOLES.center[0], MOLES.center[1]));
      c.target.set(MOLES.center[0] - ((kid.position.x - MOLES.center[0]) / kd) * 3, 0, MOLES.center[1] - ((kid.position.z - MOLES.center[1]) / kd) * 3);
      c.stopAt = 0.5;
    }
    return true;
  }
};

const roundaboutPush: Play = {
  name: 'roundabout',
  kind: 'join',
  act: (c) => {
    if (!roundabout.riders.includes(c.kid.slot) || roundabout.riders.includes(c.me.slot)) return false;
    // the child is riding the roundabout: run round beside it, pushing it faster and faster
    calm(c.b);
    const [rx, rz] = ROUNDABOUT.center;
    const a = Math.atan2(c.me.position.z - rz, c.me.position.x - rx);
    // (it turns the way the angle goes down: run that way, a little way ahead)
    const ahead = a - (roundabout.spin >= 0 ? 0.7 : -0.7);
    const r = ROUNDABOUT.radius + 0.6;
    c.target.set(rx + Math.cos(ahead) * r, 0, rz + Math.sin(ahead) * r);
    c.stopAt = 0.05;
    return true;
  }
};

const towerBlocks: Play = {
  name: 'blocks',
  kind: 'help',
  act: (c) => {
    const { me, kid, now } = c;
    if (!kidBuilding(kid, now)) return false;
    // the child is building a tower: fetch blocks for it
    calm(c.b);
    const mine = blocks.list.findIndex((bl) => bl.holder === me.slot);
    const tower = blocks.kidTop;
    if (mine >= 0) {
      // carrying one: onto the child's tower (if there's room up there for one more)
      if (tower >= 0 && tower !== mine) c.fetch(blocks.pos[tower], false);
      else c.target.copy(me.position);
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
      if (pick >= 0) c.fetch(blocks.pos[pick], true);
    }
    return true;
  },
  // still carrying a block, and the child's stopped building: put it down
  tidy: (c) => {
    if (!kidBuilding(c.kid, c.now) && blocks.list.some((bl) => bl.holder === c.me.slot)) putDown(c);
  }
};

/** A point along see-saw `i`, `along` metres from the hinge towards end `side` (+1 / -1). */
const seesawEnd = (i: number, side: number, out: THREE.Vector3, along = 2.4) => {
  const { center, angle } = SEESAWS[i];
  return out.set(center[0] + side * along * Math.cos(angle), 0, center[1] - side * along * Math.sin(angle));
};

const seesaw: Play = {
  name: 'see-saw',
  kind: 'join',
  act: (c) => {
    const { b, me, kid, now, target } = c;
    // near a see-saw? get onto the far end (pushing it down if it's up) so the child can
    // land on the other end and fling us
    for (let i = 0; i < SEESAWS.length; i += 1) {
      const cn = SEESAWS[i].center;
      if (distXZ(kid.position.x, kid.position.z, cn[0], cn[1]) > 7) continue;
      const a = seesawEnd(i, 1, c.tmp);
      const ad = distXZ(kid.position.x, kid.position.z, a.x, a.z);
      const bEnd = seesawEnd(i, -1, target);
      const bd = distXZ(kid.position.x, kid.position.z, bEnd.x, bEnd.z);
      const far = ad > bd ? 1 : -1;
      c.stopAt = 0.35;
      if (seesawLow[i] === far || now < b.hopInUntil) {
        // our end is down (or we're jumping onto it): stand on it and wait
        seesawEnd(i, far, target, 2.3);
      } else {
        // our end is up in the air: line up just past its tip, then jump in onto it
        seesawEnd(i, far, target, 3.9);
        if (distXZ(me.position.x, me.position.z, target.x, target.z) < 0.7 && now > b.nextHop) {
          b.nextHop = now + 1500;
          b.hopInUntil = now + 900;
          c.press.jump = true;
        }
      }
      return true;
    }
    return false;
  }
};

const cats: Play = {
  name: 'cats',
  kind: 'help',
  act: (c) => {
    const { kid } = c;
    // the child is chasing a cat: run round ahead of it, so it turns back towards the child
    for (const cat of parkCats) {
      if (!cat || (cat.mode !== 'flee' && cat.mode !== 'alert')) continue;
      const cd = distXZ(cat.position.x, cat.position.z, kid.position.x, kid.position.z);
      if (cd > 14 || cd < 0.5) continue;
      c.target.set(cat.position.x + ((cat.position.x - kid.position.x) / cd) * 3, 0, cat.position.z + ((cat.position.z - kid.position.z) / cd) * 3);
      c.stopAt = 0.5;
      return true;
    }
    return false;
  }
};

/** In order: the first that applies wins. */
export const PLAYS: Play[] = [launcher, ferrisWait, runUp, swing, zip, trailer, trainRide, tubes, sledRace, throwBack, snowman, kite, chickens, penguins, tickle, molehills, roundaboutPush, towerBlocks, seesaw, cats];
