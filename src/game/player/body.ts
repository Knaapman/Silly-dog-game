import type { RapierRigidBody } from '@react-three/rapier';
import type { Ray, World } from '@dimforge/rapier3d-compat';
import { playBoing, playBounce, playPower, playSlideWhistle, playSplash, playSquelch, playThud } from '../audio';
import { ANIMAL_GROUPS } from '../collision';
import { MOVE, PARTY_POINTS, WORLD_HALF_X, WORLD_HALF_Z } from '../config';
import { emit, poof, ring } from '../fx';
import { rumble } from '../input';
import { isInFountain, isInMud } from '../layout';
import { PAINT_COLORS, paintColor, paintOf, paintSplashes, SNOW_PAINT } from '../paint';
import { isInWater, waterLevelAt } from '../terrain';
import { players, propPosition, props, shakeCamera, surfaces } from '../runtime';
import { useGame } from '../store';
import { GIANT_SIZE, RADIUS } from './constants';
import { endFlop, releaseHeld, startFlip, startFlop, type FrameCtx } from './frame';
import { ballistic } from './physics';
import { safeSpot, type Rapier } from './rescue';
import { earnSticker } from '../stickers';
import { randomStream } from '../rng';

const random = randomStream('player.body');

/** Magic food wearing off, and growing / shrinking (the mushroom). Sets f.rad. */
export function powerAndSize(f: FrameCtx) {
  const { s, rb, t, dt } = f;
  if (s.power) {
    s.powerTime -= dt;
    if (s.powerTime <= 0) {
      s.power = null;
      playPower(s.pos, false);
      poof([t.x, t.y, t.z], '#ffffff', 12);
    }
  }
  const sizeTarget = s.power === 'giant' ? GIANT_SIZE : 1;
  s.sizeVel += (-60 * (s.size - sizeTarget) - 9 * s.sizeVel) * dt;
  s.size = Math.max(0.6, s.size + s.sizeVel * dt);
  if (Math.abs(s.size - s.colliderSize) > 0.01) {
    const grow = (s.size - s.colliderSize) * RADIUS;
    f.col?.setRadius(RADIUS * s.size);
    // grow upwards, not into the ground
    if (grow > 0) rb.setTranslation({ x: t.x, y: t.y + grow, z: t.z }, true);
    s.colliderSize = s.size;
  }
  f.rad = RADIUS * s.size;
}

/** What's underneath: ground distance, special surfaces, moving platforms. */
export function probeGround(f: FrameCtx, world: World, ray: Ray, excludeSensors: number) {
  const { s, rb, t, lv } = f;
  // A ray exactly on one of the ground heightfield's grid lines slips through it (it happens
  // whenever an animal lands on a round number) and finds the safety floor far below instead,
  // so the ray always starts a centimetre off the animal's middle.
  ray.origin = { x: t.x + 0.0123, y: t.y, z: t.z + 0.0071 };
  const hit = world.castRay(ray, 40, true, excludeSensors, ANIMAL_GROUPS, undefined, rb as unknown as Parameters<World['castRay']>[6]);
  f.hit = hit;
  f.groundDist = hit ? hit.timeOfImpact : 99;
  s.groundY = t.y - f.groundDist;
  f.wasGrounded = s.grounded;
  f.surface = hit && f.groundDist < f.rad + 0.4 ? surfaces.get(hit.collider.handle) : undefined;
  const groundBody = hit ? hit.collider.parent() : null;
  f.onStatic = !groundBody || groundBody.isFixed();
  // Generous so slopes (roof, hill, island) still count as ground for jumping. On a moving
  // platform, rising is measured against the platform: one going up (a gondola) still counts as
  // ground, but an animal that just jumped off it doesn't (else "stick to rides" would pull it
  // straight back down, and nothing that moves could be jumped off).
  const near = !s.flopped && f.groundDist < f.rad + 0.25;
  if (near && f.surface?.velocityAt) f.surface.velocityAt(s.pos, s.platformVel);
  else s.platformVel.set(0, 0, 0);
  s.grounded = near && lv.y - s.platformVel.y < 4;
  if (!s.grounded) s.platformVel.set(0, 0, 0);
}

export function tickTimers(f: FrameCtx) {
  const { s, dt, tmp } = f;
  s.jumpBuffer -= dt;
  s.coyote -= dt;
  s.bonkTime -= dt;
  s.bonkCooldown -= dt;
  s.dashTime -= dt;
  s.lickMiss -= dt;
  s.noiseTime -= dt;
  s.launched -= dt;
  s.padCooldown -= dt;
  s.bounceCooldown -= dt;
  s.stunned -= dt;
  s.rideCooldown -= dt;
  s.airTime = s.grounded ? 0 : s.airTime + dt;
  // A launch ends as soon as we touch down again, so nobody slides off the landing spot.
  if (s.launched > 0) {
    if (!s.grounded) s.launchAirborne = true;
    else if (s.launchAirborne) s.launched = 0;
  }
  tmp.fwd.set(Math.sin(s.facing), 0, Math.cos(s.facing));
}

export function waterAndMud(f: FrameCtx) {
  const { s, t, dt } = f;
  // wet feet: standing on ground that is under the water (not on a bridge or a stepping stone
  // over it), or splashing about in the fountain's basin
  const wl = waterLevelAt(t.x, t.z);
  const swimming = (isInFountain(t.x, t.z) && t.y < 1.3) || (isInWater(t.x, t.z) && s.groundY < wl - 0.1 && t.y < wl + 1.3);
  const inMud = isInMud(t.x, t.z) && t.y < 1.3;
  if (swimming && !s.swimming) {
    const w = waterLevelAt(t.x, t.z);
    playSplash(s.pos);
    emit('drop', [t.x, w + 0.3, t.z], { count: 26, color: ['#7fd3ff', '#ffffff'], speed: 4, up: 6 });
    ring([t.x, w + 0.06, t.z], { color: '#e0f6ff', radius: 2.5, duration: 0.7 });
    useGame.getState().addParty(PARTY_POINTS.splash);
    earnSticker('swim');
    rumble(f.source, 0.2, 0.4, 120);
  }
  if (inMud && !s.inMud) {
    playSquelch(s.pos);
    emit('chunk', [t.x, 0.2, t.z], { count: 16, color: ['#6b4a2b', '#4d341e'], speed: 3, up: 5, size: 0.14 });
  }
  s.swimming = swimming;
  s.inMud = inMud;
  if (inMud) s.mud = Math.min(1, s.mud + dt * 2.5);
  else if (swimming && s.mud > 0) {
    s.mud = Math.max(0, s.mud - dt * 1.2);
    if (random() < 0.2) emit('puff', [t.x, t.y + 0.3, t.z], { count: 1, color: '#ffffff', size: 0.2, speed: 1, up: 1 });
  } else s.mud = Math.max(0, s.mud - dt * 0.015);

  // paint: a splash puts it on (a fresh coat); the water washes it off; otherwise it slowly dries and flakes off
  const splash = paintSplashes.get(f.slot);
  if (splash === SNOW_PAINT) {
    // a snowball: a dusting of snow over whatever else
    paintSplashes.delete(f.slot);
    s.paint = Math.max(s.paint, 0.85);
    s.paintColor = SNOW_PAINT;
  } else if (splash != null) {
    paintSplashes.delete(f.slot);
    s.paint = 1;
    s.paintColor = splash;
    if (!s.paintColors.includes(splash)) s.paintColors.push(splash);
    earnSticker('paint');
    if (s.paintColors.length >= PAINT_COLORS.length) earnSticker('rainbowpaint');
  } else if (swimming && s.paint > 0) {
    s.paint = Math.max(0, s.paint - dt * 1.2);
    if (random() < 0.3) emit('puff', [t.x, t.y + 0.3, t.z], { count: 1, color: paintColor(s.paintColor), size: 0.2, speed: 1, up: 1 });
  } else s.paint = Math.max(0, s.paint - dt * (s.paintColor === SNOW_PAINT ? 0.07 : 0.012));
  if (s.paint <= 0) s.paintColors.length = 0;
  paintOf.set(f.slot, { amount: s.paint, color: s.paintColor, colors: s.paintColors });
}

/** Flop (ragdoll): start, wake up, and steer the tumbling body. */
export function flop(f: FrameCtx) {
  const { s, rb, input, dt } = f;
  if (input.pressed.flop && !s.flopped) startFlop(f);
  else if (s.flopped) {
    s.flopTime -= dt;
    const canWake = s.flopTime < MOVE.flopDuration - 0.6;
    if (s.flopTime <= 0 || (canWake && (input.pressed.flop || input.pressed.jump))) endFlop(f);
    else if (Math.hypot(input.x, input.z) > 0.2) {
      // steer the tumbling body by spinning it like a ball
      const av = rb.angvel();
      const k = 1 - Math.exp(-6 * dt);
      rb.setAngvel({ x: av.x + (input.z * 14 - av.x) * k, y: av.y, z: av.z + (-input.x * 14 - av.z) * k }, true);
    }
  }
}

/** Things done to us: bumped by a friend, a bean rocket, a toot hop, a party hop, a cannon. */
export function impulses(f: FrameCtx) {
  const { s, rb, t, tmp } = f;
  if (s.pendingBump) {
    if (s.flopped) endFlop(f);
    releaseHeld(f, false);
    f.v.x = s.pendingBump.x * 7;
    f.v.z = s.pendingBump.z * 7;
    f.v.y = 9;
    s.stunned = 0.55;
    startFlip(f, 'y', 0.55, random() < 0.5 ? 1 : -1);
    playBoing(s.pos, 1.5);
    rumble(f.source, 0.5, 0.5, 160);
    s.pendingBump = null;
  }
  f.rocketed = false;
  if (s.pendingRocket) {
    s.pendingRocket = false;
    f.rocketed = true;
    if (!s.flopped) {
      // straight up (not above the treetops... well, a bit above), and a push forward
      f.v.y = Math.max(f.v.y, t.y > 24 ? 0 : 10.5);
      f.v.x += tmp.fwd.x * 5;
      f.v.z += tmp.fwd.z * 5;
      s.squash = 0.45;
    }
  }
  if (s.pendingNudge > 0) {
    if (!s.flopped) f.v.y = Math.max(f.v.y, s.pendingNudge);
    s.pendingNudge = 0;
  }
  if (s.pendingHop > 0 && !s.flopped) {
    f.v.y = Math.max(f.v.y, s.pendingHop);
    startFlip(f, 'x', 0.7);
    s.pendingHop = 0;
  }

  // held in place (inside a cannon...)
  if (s.holdAt) {
    if (s.flopped) endFlop(f);
    releaseHeld(f, false);
    rb.setTranslation(s.holdAt, true);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    f.v.x = f.v.y = f.v.z = 0;
  }
}

/** On the end of a friend's tongue: pulled along until you jump free (or get thrown). */
export function tugged(f: FrameCtx) {
  const { s, rt, rb, tmp, input } = f;
  if (rt?.grabbedBy == null) return;
  if (s.holdAt || s.pendingLaunch) {
    rt.grabbedBy = null;
    return;
  }
  if (input.pressed.jump) {
    // wriggle free!
    rt.grabbedBy = null;
    f.v.y = Math.max(f.v.y, 8);
    s.jumpBuffer = 0;
    s.squash = -0.3;
    startFlip(f, 'y', 0.5, random() < 0.5 ? 1 : -1);
    playBoing(s.pos, 1.4);
    rumble(f.source, 0.3, 0.3, 120);
    rb.setLinvel(f.v, true);
    return;
  }
  // a springy pull towards the tongue tip (like a held ball, but a bit gentler), looking at
  // whoever has got you
  tmp.d.copy(rt.tug).sub(s.pos);
  const holder = players.get(rt.grabbedBy);
  if (holder) s.targetFacing = Math.atan2(holder.position.x - s.pos.x, holder.position.z - s.pos.z);
  tmp.v.copy(tmp.d).multiplyScalar(10);
  if (tmp.v.length() > 18) tmp.v.setLength(18);
  const k = s.flopped ? 0.25 : 0.5;
  f.v.x += (tmp.v.x - f.v.x) * k;
  f.v.z += (tmp.v.z - f.v.z) * k;
  if (tmp.d.y > 0.3) f.v.y += (tmp.v.y - f.v.y) * k * 0.5;
  if (s.flopped) rb.setLinvel(f.v, true);
}

/** Launched by a pad / cannon / geyser / toilet: fly in a big arc to a fun spot. */
export function launch(f: FrameCtx) {
  const { s, rb, t, tmp } = f;
  if (!s.pendingLaunch || s.holdAt) return;
  if (s.flopped) endFlop(f);
  const { target, apex } = s.pendingLaunch;
  s.pendingLaunch = null;
  tmp.c.set(target.x, target.y + f.rad + 0.1, target.z);
  const flight = ballistic(s.pos, tmp.c, apex, tmp.v);
  f.v.x = tmp.v.x;
  f.v.y = tmp.v.y;
  f.v.z = tmp.v.z;
  s.launched = flight;
  s.launchAirborne = false;
  if (Math.hypot(tmp.v.x, tmp.v.z) > 0.5) s.targetFacing = s.facing = Math.atan2(tmp.v.x, tmp.v.z);
  s.jumps = 1;
  s.squash = 0.5;
  startFlip(f, 'x', Math.min(1.2, flight * 0.8));
  releaseHeld(f, false);
  playSlideWhistle('up', s.pos);
  poof([t.x, t.y - 0.3, t.z], '#fff3a8', 12);
  rumble(f.source, 0.8, 0.8, 250);
  useGame.getState().addParty(PARTY_POINTS.launch);
  rb.setLinvel(f.v, true);
}

/** Touching down: squash, dust, and a belly-flop shockwave from high up. */
export function landing(f: FrameCtx) {
  const { s, t, lv, tmp } = f;
  if (s.grounded && !f.wasGrounded) {
    const impact = -s.lastVy;
    if (impact > 7) {
      s.squash = Math.min(0.5, impact * 0.025);
      emit('puff', [t.x, s.groundY + 0.1, t.z], { count: 8, color: s.inMud ? '#6b4a2b' : s.swimming ? '#bfe9ff' : '#f5f0e6', speed: 3, up: 0.6, size: 0.3 });
      playBounce(s.pos, 0.3);
    }
    if (impact > 16) {
      // Belly-flop shockwave: everything nearby jumps.
      ring([t.x, s.groundY + 0.08, t.z], { color: '#ffffff', radius: 4.5, duration: 0.5 });
      playThud(s.pos);
      shakeCamera(0.4);
      rumble(f.source, 0.9, 0.6, 200);
      props.forEach((prop) => {
        if (prop.heldBy != null || !propPosition(prop, tmp.p)) return;
        const d = tmp.p.distanceTo(s.pos);
        if (d > 4 || d < 0.01) return;
        const pb = prop.getBody();
        const push = (1 - d / 4) * prop.launch * 0.7;
        pb?.setLinvel({ x: ((tmp.p.x - t.x) / d) * push, y: push + 2, z: ((tmp.p.z - t.z) / d) * push }, true);
      });
      useGame.getState().addParty(PARTY_POINTS.bellyFlop);
      earnSticker('bellyflop');
    }
  }
  s.lastVy = lv.y;
}

/** Fell out of the world? Pop back in next to a friend (or in the plaza). */
export function respawnIfLost(f: FrameCtx, rb: RapierRigidBody, world: World, rapier: Rapier) {
  const { t } = f;
  if (t.y < -8 || Math.abs(t.x) > WORLD_HALF_X + 6 || Math.abs(t.z) > WORLD_HALF_Z + 6) {
    const p = safeSpot(f.slot, f.s.pos, world, rapier);
    rb.setTranslation(p, true);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    poof([p.x, p.y, p.z], f.color, 18);
  }
}

/** Publish what others need to know about us (camera, critters, friends, rides). */
export function syncRuntime(f: FrameCtx) {
  const { s, rt, t, dt } = f;
  if (f.napping && random() < dt * 1.5) {
    emit('puff', [t.x + 0.3, t.y + 1.2, t.z], { count: 1, color: '#e3f2fd', size: 0.18, speed: 0.2, up: 1.2, gravity: -1, life: 1.5 });
  }
  if (!rt) return;
  rt.source = f.source;
  rt.asleep = f.napping;
  rt.facing = s.facing;
  rt.flopped = s.flopped;
  rt.jumpedAt = s.jumpedAt;
  rt.noiseAt = s.noiseAt;
  rt.poopAt = s.poopAt;
  rt.belly = s.belly;
  rt.power = s.power;
  rt.size = s.size;
  rt.ridingOn = s.ridingOn;
  rt.grounded = s.grounded;
  rt.swimming = s.swimming;
}
