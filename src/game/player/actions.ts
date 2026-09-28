import type * as THREE from 'three';
import {
  playAnimalNoise,
  playBigFart,
  playBoing,
  playBonk,
  playChomp,
  playDuet,
  playFart,
  playFireBreath,
  playPlop,
  playSlurp,
  playTap,
  playThrow,
  playWhoosh
} from '../audio';
import { gameNow } from '../clock';
import { BELLY_MAX, MOVE, PARTY_POINTS, WORLD_HALF_X, WORLD_HALF_Z } from '../config';
import { bonkStars, emit, ring } from '../fx';
import { rumble, type ActionName } from '../input';
import { distXZ, isOnGrass } from '../layout';
import { groundHeight } from '../terrain';
import { foods, noises, players, propPosition, props, pushNoise, shakeCamera, spawners, statics, type FoodEntry, type PlayerRuntime, type PropEntry } from '../runtime';
import { useGame } from '../store';
import { BONK_PITCH, MODEL_SCALE, RADIUS } from './constants';
import { releaseFriend, releaseHeld, type FrameCtx } from './frame';
import { earnSticker } from '../stickers';

/** How long a tongue can hang on to a friend (seconds). */
const FRIEND_HOLD_MAX = 4;
/** How far a licked friend gets thrown. */
const FRIEND_THROW = 7;

/** Lick again while holding a friend: wheee, off they fly! */
function throwFriend(f: FrameCtx) {
  const { s, tmp } = f;
  const friend = s.heldFriend != null ? players.get(s.heldFriend) : null;
  releaseFriend(f);
  if (!friend) return;
  tmp.c.set(
    Math.max(-WORLD_HALF_X + 3, Math.min(WORLD_HALF_X - 3, s.pos.x + tmp.fwd.x * FRIEND_THROW)),
    0,
    Math.max(-WORLD_HALF_Z + 3, Math.min(WORLD_HALF_Z - 3, s.pos.z + tmp.fwd.z * FRIEND_THROW))
  );
  tmp.c.y = groundHeight(tmp.c.x, tmp.c.z);
  friend.launchTo(tmp.c, Math.max(s.pos.y, friend.position.y) + 3.5);
  earnSticker('throw');
  playThrow(s.pos);
  rumble(f.source, 0.5, 0.6, 180);
  useGame.getState().addParty(PARTY_POINTS.launch);
}

/** Sticky tongue: lick to grab, eat food (or grass) or a friend, lick again to throw; drags what it holds. */
export function tongue(f: FrameCtx) {
  const { s, t, tmp, spec, input, slot, source } = f;
  const mouthOffsetY = (spec.head[1] - 0.1) * MODEL_SCALE * s.size - f.rad;
  const mouthOffsetZ = (spec.head[2] + 0.3) * MODEL_SCALE * s.size;
  tmp.mouth.copy(s.pos).addScaledVector(tmp.fwd, mouthOffsetZ);
  tmp.mouth.y += mouthOffsetY;

  if (input.pressed.lick && !s.flopped) {
    if (s.heldFriend != null) throwFriend(f);
    else if (s.held != null) releaseHeld(f, true);
    else {
      // Lower is better: close to the mouth and in front of it. -1 = out of reach.
      const tongueScore = (position: THREE.Vector3, radius: number) => {
        tmp.d.copy(position).sub(tmp.mouth);
        const dist = tmp.d.length() - radius;
        if (dist > 2.6 * Math.max(1, s.size * 0.8)) return -1;
        const flat = Math.hypot(tmp.d.x, tmp.d.z) || 1;
        const facing = (tmp.d.x * tmp.fwd.x + tmp.d.z * tmp.fwd.z) / flat;
        if (facing < 0.15 && dist > 0.8) return -1;
        return dist - facing + 1;
      };
      let best: PropEntry | null = null;
      let bestScore = Infinity;
      props.forEach((prop) => {
        if (!prop.grabbable || !prop.enabled || prop.heldBy != null) return;
        if (!propPosition(prop, tmp.p)) return;
        const score = tongueScore(tmp.p, prop.radius);
        if (score >= 0 && score < bestScore) {
          bestScore = score;
          best = prop;
        }
      });
      let bestFood: FoodEntry | null = null;
      foods.forEach((food) => {
        if (!food.enabled) return;
        const score = tongueScore(food.position, food.radius);
        if (score >= 0 && score < bestScore) {
          bestScore = score;
          bestFood = food;
        }
      });
      // Friends can be licked too (and then dragged around, or thrown!)
      let bestFriend: PlayerRuntime | null = null;
      players.forEach((p) => {
        if (p.slot === slot || p.grabbedBy != null || p.isLaunched() || p.ridingOn === slot || s.ridingOn === p.slot) return;
        if (players.get(slot)?.grabbedBy === p.slot) return; // no licking back the one who's got you
        const score = tongueScore(p.position, RADIUS * p.size);
        if (score >= 0 && score < bestScore) {
          bestScore = score;
          bestFriend = p;
        }
      });
      const friend = bestFriend as PlayerRuntime | null;
      const target = friend ? null : (best as PropEntry | null);
      const food = friend ? null : (bestFood as FoodEntry | null);
      if (friend) {
        friend.grabbedBy = slot;
        friend.tug.copy(friend.position);
        s.heldFriend = friend.slot;
        s.friendHoldTime = 0;
        playSlurp(s.pos);
        playBoing(friend.position, 1.6);
        rumble(source, 0.2, 0.4, 100);
        useGame.getState().addParty(PARTY_POINTS.duet);
      } else if (food) {
        food.eat(slot);
        playSlurp(s.pos);
        rumble(source, 0.15, 0.35, 80);
      } else if (target) {
        const keep = target.onGrab?.(slot);
        if (keep !== false) {
          target.heldBy = slot;
          s.held = target.id;
        }
        playSlurp(s.pos);
        rumble(source, 0.1, 0.3, 60);
      } else if (s.grounded && s.groundY - groundHeight(t.x, t.z) < 0.5 && isOnGrass(t.x, t.z)) {
        // Nothing to lick, but there's always grass: munch!
        s.lickMiss = 0.32;
        playChomp(s.pos);
        emit('chunk', [tmp.mouth.x, s.groundY + 0.15, tmp.mouth.z], { count: 8, color: ['#5fbf4a', '#8bd96b', '#3f9b3a'], speed: 2, up: 2.5, size: 0.07 });
        f.rt?.feed();
        useGame.getState().addParty(PARTY_POINTS.eat * 0.5);
      } else {
        s.lickMiss = 0.32;
        playSlurp(s.pos, true);
      }
    }
  }

  f.heavyDrag = false;
  if (s.heldFriend != null) {
    const friend = players.get(s.heldFriend);
    s.friendHoldTime += f.dt;
    // They wriggled free (jump!), got launched, or it's been long enough: let go.
    if (!friend || friend.grabbedBy !== slot || friend.isLaunched() || s.flopped || s.holdAt || s.friendHoldTime > FRIEND_HOLD_MAX || friend.position.distanceTo(tmp.mouth) > 7) {
      releaseFriend(f);
    } else {
      friend.tug.copy(tmp.mouth).addScaledVector(tmp.fwd, 1 + RADIUS * friend.size);
      friend.tug.y = Math.max(friend.tug.y, s.groundY + RADIUS * friend.size);
      f.heavyDrag = true;
    }
  }
  if (s.held != null) {
    const prop = props.get(s.held);
    const pb = prop?.getBody();
    if (!prop || !pb || !prop.enabled || s.flopped) {
      releaseHeld(f, false);
    } else {
      propPosition(prop, tmp.p);
      tmp.c.copy(tmp.mouth).addScaledVector(tmp.fwd, prop.radius + 0.12);
      tmp.d.copy(tmp.c).sub(tmp.p);
      const dist = tmp.d.length();
      if (dist > 7) releaseHeld(f, false);
      else {
        const pv = pb.linvel();
        if (!prop.heavy) {
          tmp.v.copy(s.vel).addScaledVector(tmp.d, 14);
          if (tmp.v.length() > 26) tmp.v.setLength(26);
          const k = 0.6;
          pb.setLinvel({ x: pv.x + (tmp.v.x - pv.x) * k, y: pv.y + (tmp.v.y - pv.y) * k, z: pv.z + (tmp.v.z - pv.z) * k }, true);
          const av = pb.angvel();
          pb.setAngvel({ x: av.x * 0.85, y: av.y * 0.85, z: av.z * 0.85 }, true);
        } else {
          f.heavyDrag = true;
          const rope = 1.4 + prop.radius;
          if (dist > rope) {
            tmp.d.multiplyScalar(((dist - rope) * 9) / dist);
            pb.setLinvel({ x: pv.x * 0.9 + tmp.d.x, y: pv.y + Math.max(0, tmp.d.y) * 0.5, z: pv.z * 0.9 + tmp.d.z }, true);
          }
        }
      }
    }
  }
}

/** Animal noise (bark / meh / oink / baa), or dragon fire with a chili inside. */
export function voice(f: FrameCtx) {
  const { s, t, tmp, input, slot, source } = f;
  if (input.pressed.noise && !s.flopped && s.power === 'chili') {
    // Hot hot hot! Dragon breath: a burst of flames that sends things flying.
    playFireBreath(s.pos);
    earnSticker('fire');
    s.noiseTime = 0.5;
    for (let i = 0; i < 3; i += 1) {
      emit('puff', [tmp.mouth.x, tmp.mouth.y, tmp.mouth.z], { count: 8, color: ['#ff3d00', '#ff9100', '#ffd23f'], speed: 1.5, up: 0.6, size: 0.3 + i * 0.12, life: 0.55, dir: [tmp.fwd.x * (7 + i * 2.5), 0.4, tmp.fwd.z * (7 + i * 2.5)] });
    }
    const inFlames = (p: THREE.Vector3) => {
      tmp.d.copy(p).sub(s.pos).setY(0);
      const d = tmp.d.length();
      return d < 5.5 && d > 0.01 && tmp.d.dot(tmp.fwd) / d > 0.55;
    };
    props.forEach((prop) => {
      if (prop.heldBy != null || !prop.enabled || !propPosition(prop, tmp.p) || !inFlames(tmp.p)) return;
      tmp.d.normalize();
      prop.getBody()?.setLinvel({ x: tmp.d.x * 6, y: 7, z: tmp.d.z * 6 }, true);
      prop.onBonk?.(slot, tmp.d);
      emit('puff', [tmp.p.x, tmp.p.y + 0.3, tmp.p.z], { count: 3, color: ['#555555', '#888888'], speed: 1, up: 2, size: 0.3 });
    });
    players.forEach((other) => {
      if (other.slot === slot || !inFlames(other.position)) return;
      // hot bottom! the friend jumps up with a puff of smoke
      other.hop(8);
      emit('puff', [other.position.x, other.position.y, other.position.z], { count: 6, color: ['#555555', '#888888'], speed: 1.5, up: 3, size: 0.35 });
    });
    statics.forEach((st2) => {
      if (inFlames(st2.position)) st2.onBonk(slot, tmp.fwd);
    });
    pushNoise(s.pos, slot);
    shakeCamera(0.2);
    rumble(source, 0.6, 0.6, 250);
    useGame.getState().addParty(PARTY_POINTS.bonk * 2);
  } else if (input.pressed.noise && !s.flopped) {
    playAnimalNoise(f.species, s.pos);
    s.noiseTime = 0.5;
    s.noiseAt = gameNow();
    ring([t.x, t.y + 0.2, t.z], { color: f.color, radius: 3.5, duration: 0.6 });
    const now = gameNow();
    const partner = noises.find((n) => n.slot !== slot && now - n.time < 900 && n.position.distanceTo(s.pos) < 8);
    if (partner) {
      // Two friends calling together: hearts!
      tmp.c.copy(partner.position).add(s.pos).multiplyScalar(0.5);
      emit('heart', [tmp.c.x, tmp.c.y + 1.2, tmp.c.z], { count: 10, color: ['#ff4d8d', '#ff8fb5'], speed: 2, up: 2.5 });
      playDuet();
      useGame.getState().addParty(PARTY_POINTS.duet);
    }
    pushNoise(s.pos, slot);
    props.forEach((prop) => {
      if (prop.heavy || prop.heldBy != null || !propPosition(prop, tmp.p)) return;
      if (tmp.p.distanceTo(s.pos) < 3.5) prop.getBody()?.applyImpulse({ x: 0, y: 0.6, z: 0 }, true);
    });
  }
}

/** Poop! One per bite (queued, so mashing works), a toot on an empty tummy, rockets on beans. */
export function poop(f: FrameCtx) {
  const { s, t, tmp, input, dt, slot, source } = f;
  s.poopCooldown -= dt;
  s.rocketCooldown -= dt;
  s.chew -= dt;
  if (s.grounded || s.swimming) s.fartedInAir = false;
  if (input.pressed.poop && !s.flopped && !s.holdAt) {
    s.poopAt = gameNow();
    tmp.c.copy(s.pos).addScaledVector(tmp.fwd, -0.6);
    const waiting = s.poopPresses + (s.poopQueued ? 1 : 0);
    if (s.power === 'beans') {
      // Beans: every press is a rocket toot. Keep pressing to fly!
      if (s.rocketCooldown <= 0) {
        s.rocketCooldown = 0.28;
        s.pendingRocket = true;
        playBigFart(s.pos);
        earnSticker('rocket');
        emit('puff', [tmp.c.x, s.pos.y - 0.3 * s.size, tmp.c.z], { count: 16, color: ['#b5e48c', '#99d98c', '#d9ed92', '#76c893'], speed: 2.5, up: -1, size: 0.55 * s.size, dir: [-tmp.fwd.x * 3, -3, -tmp.fwd.z * 3] });
        ring([t.x, s.groundY + 0.08, t.z], { color: '#b5e48c', radius: 2.4, duration: 0.45 });
        shakeCamera(0.2);
        pushNoise(s.pos, slot);
        rumble(source, 0.8, 0.4, 220);
        useGame.getState().addParty(PARTY_POINTS.fart * 2);
      }
    } else if (s.belly > waiting && !s.swimming) {
      // every press counts, even several between two slow frames (one poop per bite)
      s.poopPresses += Math.min(Math.max(1, input.presses.poop), s.belly - waiting);
    } else if (waiting === 0 && s.poopCooldown <= 0) {
      s.poopCooldown = 0.25;
      playFart(s.pos);
      earnSticker('toot');
      const green = ['#b5e48c', '#99d98c', '#d9ed92'];
      if (s.swimming) emit('drop', [tmp.c.x, s.pos.y + 0.1, tmp.c.z], { count: 12, color: ['#e0f7ff', '#ffffff'], speed: 1.2, up: 4, size: 0.16 });
      else emit('puff', [tmp.c.x, s.pos.y - 0.1, tmp.c.z], { count: 9, color: green, speed: 1.6, up: 0.8, size: 0.45, dir: [-tmp.fwd.x * 2, 0, -tmp.fwd.z * 2] });
      s.squash = -0.25;
      // A little toot hop, once per jump in the air.
      if (s.grounded) s.pendingNudge = 4;
      else if (!s.fartedInAir && !s.swimming) {
        s.fartedInAir = true;
        s.pendingNudge = 4.5;
      }
      pushNoise(s.pos, slot);
      rumble(source, 0.35, 0.1, 160);
      useGame.getState().addParty(PARTY_POINTS.fart);
    }
  }
  if (s.poopTime <= 0 && s.poopPresses > 0 && !s.flopped && !s.holdAt) {
    // Squat for a moment; the poop comes out partway through.
    s.poopPresses -= 1;
    s.poopTime = 0.34;
    s.poopQueued = { size: 0.75 + 0.13 * s.belly, golden: s.belly >= BELLY_MAX && Math.random() < 0.35 };
    s.squash = 0.25;
  }
  if (s.flopped || s.holdAt) {
    // interrupted mid-squat: the bite stays in the tummy
    s.poopPresses = 0;
    s.poopQueued = null;
    s.poopTime = 0;
  }
  if (s.poopTime > 0) {
    const before = s.poopTime;
    s.poopTime -= dt;
    if (before > 0.16 && s.poopTime <= 0.16 && s.poopQueued) {
      const { size, golden } = s.poopQueued;
      s.poopQueued = null;
      s.belly = Math.max(0, s.belly - 1);
      s.bellyVel -= 2.5;
      const back = (0.55 + 0.26 * size) * s.size;
      // a little to the left or right, so a row of poops spreads out instead of stacking
      const side = (Math.random() - 0.5) * 0.6;
      tmp.c.copy(s.pos).addScaledVector(tmp.fwd, -back);
      tmp.c.x += tmp.fwd.z * side;
      tmp.c.z -= tmp.fwd.x * side;
      tmp.c.y = s.pos.y - 0.12 * s.size;
      tmp.v.set(-tmp.fwd.x * 2.2 + tmp.fwd.z * side * 2 + s.vel.x * 0.5, 0.6 + Math.max(0, s.vel.y) * 0.5, -tmp.fwd.z * 2.2 - tmp.fwd.x * side * 2 + s.vel.z * 0.5);
      spawners.poop(tmp.c, tmp.v, size * s.size, golden);
      earnSticker('poop');
      if (golden) earnSticker('golden');
      playPlop(s.pos, size, golden);
      s.squash = -0.3;
      rumble(source, golden ? 0.6 : 0.3, 0.2, golden ? 300 : 120);
      if (golden) {
        emit('star', [tmp.c.x, tmp.c.y + 0.3, tmp.c.z], { count: 16, color: ['#ffd23f', '#fff3a8', '#ffffff'], speed: 4, up: 4 });
        ring([tmp.c.x, s.groundY + 0.08, tmp.c.z], { color: '#ffd23f', radius: 2.5, duration: 0.6 });
      }
      useGame.getState().addParty(golden ? PARTY_POINTS.goldenPoop : PARTY_POINTS.poop);
    }
  }
}

/** Start on a controller: change hat. */
export function looks(f: FrameCtx) {
  if (f.input.pressed.hat) useGame.getState().nextHat(f.slot);
}

/** An open animal picker closes by itself when nobody touches it for this long (seconds). */
const PICK_IDLE = 10;
/** A picker that just opened ignores the "go" buttons this long, so a joining press doesn't close it straight away. */
const PICK_GRACE = 0.5;
const PICK_GO: ActionName[] = ['jump', 'bonk', 'lick', 'noise', 'flop', 'poop', 'hat'];

/**
 * Choosing an animal (Select opens the row of faces; joining with a button does too): left /
 * right looks through the animals, and the animal changes as you go; Select shows the next one;
 * any other button goes and plays. True while the faces are up: the animal waits meanwhile.
 */
export function choosing(f: FrameCtx): boolean {
  const { s, input, slot } = f;
  const game = useGame.getState();
  const me = game.players.find((p) => p.slot === slot);
  if (!me?.picking) {
    if (s.picking && me) {
      // chosen (here, or with a tap on the screen): the new animal says hello
      playAnimalNoise(me.species, s.pos);
      s.noiseTime = 0.5;
      f.rt?.hop(7);
      emit('confetti', [s.pos.x, s.pos.y + 1.2, s.pos.z], { count: 20, speed: 3, up: 5 });
      rumble(f.source, 0.4, 0.4, 150);
    }
    s.picking = false;
    if (!input.pressed.species || !me || me.bot) return false;
    game.setPicking(slot, true);
    playTap();
    return true;
  }
  // one step per push of the stick (it has to come back towards the middle to go again)
  const lean = input.x > 0.6 ? 1 : input.x < -0.6 ? -1 : Math.abs(input.x) < 0.3 ? 0 : s.pickDir;
  if (!s.picking) {
    s.picking = true;
    s.pickAge = 0;
    s.pickIdle = 0;
    s.pickDir = lean;
  }
  s.pickAge += f.dt;
  s.pickIdle += f.dt;
  const step = lean !== 0 && lean !== s.pickDir ? lean : input.pressed.species ? 1 : 0;
  s.pickDir = lean;
  if (step) {
    game.cycleSpecies(slot, step);
    s.pickIdle = 0;
  }
  const go = s.pickAge > PICK_GRACE && PICK_GO.some((a) => input.pressed[a]);
  if (go || s.pickIdle > PICK_IDLE) game.setPicking(slot, false);
  return true;
}

/** Headbutt: a little dash that knocks props, friends and trees. */
export function headbutt(f: FrameCtx) {
  const { s, tmp, input, slot, source } = f;
  if (input.pressed.bonk && s.bonkCooldown <= 0 && !s.flopped && s.stunned <= 0) {
    s.bonkTime = MOVE.bonkDuration;
    s.bonkCooldown = MOVE.bonkCooldown;
    s.dashTime = 0.16;
    s.bonkHits.clear();
    playWhoosh(s.pos);
  }
  if (s.bonkTime <= 0) return;
  tmp.head.copy(s.pos).addScaledVector(tmp.fwd, 0.8 * s.size);
  tmp.head.y += 0.15 * s.size;
  const giant = s.power === 'giant';
  let hits = 0;
  props.forEach((prop) => {
    if (!prop.enabled || prop.heldBy != null || s.bonkHits.has(prop.id)) return;
    if (!propPosition(prop, tmp.p)) return;
    if (tmp.p.distanceTo(tmp.head) - prop.radius > 0.75 * s.size) return;
    s.bonkHits.add(prop.id);
    tmp.d.set(tmp.p.x - s.pos.x, 0, tmp.p.z - s.pos.z);
    if (tmp.d.lengthSq() < 0.001) tmp.d.copy(tmp.fwd);
    tmp.d.normalize().add(tmp.fwd).normalize();
    const pb = prop.getBody();
    if (pb) {
      const v = prop.launch * (giant ? 1.5 : 1);
      pb.wakeUp();
      pb.setLinvel({ x: tmp.d.x * v, y: v * 0.55 + 2, z: tmp.d.z * v }, true);
      pb.setAngvel({ x: (Math.random() - 0.5) * 12, y: (Math.random() - 0.5) * 12, z: (Math.random() - 0.5) * 12 }, true);
    }
    prop.onBonk?.(slot, tmp.d);
    bonkStars([tmp.p.x, tmp.p.y + 0.3, tmp.p.z]);
    playBonk(tmp.p, BONK_PITCH[prop.kind] ?? 1);
    useGame.getState().addParty(prop.kind === 'chicken' || prop.kind === 'cat' || prop.kind === 'cow' || prop.kind === 'dino' ? PARTY_POINTS.bonkCritter : PARTY_POINTS.bonk);
    hits += 1;
  });
  players.forEach((other) => {
    if (other.slot === slot || s.bonkHits.has(-1 - other.slot)) return;
    if (other.position.distanceTo(tmp.head) > 1.15 * s.size) return;
    s.bonkHits.add(-1 - other.slot);
    tmp.d.copy(other.position).sub(s.pos).setY(0);
    if (tmp.d.lengthSq() < 0.001) tmp.d.copy(tmp.fwd);
    other.bump(tmp.d.normalize().multiplyScalar(giant ? 1.8 : 1));
    bonkStars([other.position.x, other.position.y + 0.6, other.position.z]);
    hits += 1;
  });
  statics.forEach((st2) => {
    if (s.bonkHits.has(100000 + st2.id)) return;
    if (distXZ(st2.position.x, st2.position.z, tmp.head.x, tmp.head.z) > st2.radius + 0.6 * s.size) return;
    if (Math.abs(tmp.head.y - st2.position.y) > 3) return;
    s.bonkHits.add(100000 + st2.id);
    st2.onBonk(slot, tmp.fwd);
    bonkStars([tmp.head.x, tmp.head.y + 0.4, tmp.head.z]);
    playBonk(tmp.head, 0.8);
    hits += 1;
  });
  if (hits > 0) {
    s.dashTime = 0;
    s.squash = 0.3;
    shakeCamera(0.25);
    rumble(source, 0.7, 0.4, 140);
  }
}
