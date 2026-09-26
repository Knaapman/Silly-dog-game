import * as THREE from 'three';
import { playGurgle, playStomp } from '../audio';
import { gameNow } from '../clock';
import { emit, ring } from '../fx';
import { players, propPosition, props, shakeCamera } from '../runtime';
import type { createRig } from './AnimalModel';
import { MODEL_SCALE, RADIUS, UP } from './constants';
import type { FrameCtx } from './frame';

/** The scene objects one animal moves around every frame. */
export type PlayerVisuals = {
  rig: ReturnType<typeof createRig>;
  yawGroup: THREE.Group | null;
  squashGroup: THREE.Group | null;
  sizeGroup: THREE.Group | null;
  flipGroup: THREE.Group | null;
  shadowRing: THREE.Mesh | null;
  beam: THREE.Mesh | null;
  marker: THREE.Mesh | null;
  tongue: THREE.Mesh | null;
  tongueTip: THREE.Mesh | null;
  /** When this animal (re)appeared, in game ms: the spawn beam fades out after that. */
  bornAt: number;
};

/** Everything you see: squash and flips, waddles, googly eyes, magic-food effects, tongue. */
export function animate(f: FrameCtx, vis: PlayerVisuals) {
  const { s, t, lv, tmp, dt, time, spec, rad, species, napping } = f;
  const r = vis.rig;
  const hSpeed = Math.hypot(lv.x, lv.z);
  const airborne = !s.grounded && !s.swimming && s.airTime > 0.08;

  if (vis.yawGroup) {
    const yg = vis.yawGroup;
    yg.visible = !s.hidden;
    yg.rotation.y = s.flopped ? yg.rotation.y : s.facing;
    const swimDip = s.swimming ? -0.32 + Math.sin(time * 3) * 0.04 : 0;
    yg.position.y = THREE.MathUtils.lerp(yg.position.y, -rad + swimDip, 1 - Math.exp(-10 * dt));
  }

  // squash & stretch spring
  s.squashVel += (-120 * s.squash - 10 * s.squashVel) * dt;
  s.squash += s.squashVel * dt;
  if (vis.squashGroup) {
    const q = THREE.MathUtils.clamp(s.squash, -0.5, 0.6);
    vis.squashGroup.scale.set(1 + q * 0.5, 1 - q, 1 + q * 0.5);
  }

  // flips
  if (vis.flipGroup) {
    const fg = vis.flipGroup;
    if (s.flip) {
      s.flip.t += dt;
      const p = Math.min(1, s.flip.t / s.flip.dur);
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      fg.rotation.set(0, 0, 0);
      fg.rotation[s.flip.axis] = eased * Math.PI * 2 * s.flip.dir;
      if (p >= 1) {
        s.flip = null;
        fg.rotation.set(0, 0, 0);
      }
    } else if (s.stunned > 0) {
      fg.rotation.y += dt * 20;
    } else {
      fg.rotation.y = THREE.MathUtils.lerp(fg.rotation.y % (Math.PI * 2), 0, 1 - Math.exp(-12 * dt));
    }
  }

  // body lunge / bob / tilt
  if (r.body) {
    const bonking = s.bonkTime > 0;
    const moving = hSpeed > 0.6 && s.grounded;
    if (moving) s.walkPhase += hSpeed * dt * 2.3;
    const pooping = s.poopTime > 0;
    const bob = moving ? Math.abs(Math.sin(s.walkPhase)) * 0.06 : Math.sin(time * 2.2) * 0.012;
    // Squatting: bottom down, nose up, with a little straining shiver.
    const targetPitch = pooping ? -0.3 : bonking ? 0.35 : airborne ? THREE.MathUtils.clamp(-lv.y * 0.03, -0.35, 0.35) : 0;
    r.body.position.y = pooping ? -0.12 : bob;
    r.body.position.x = pooping ? Math.sin(time * 70) * 0.012 : 0;
    r.body.position.z = THREE.MathUtils.lerp(r.body.position.z, bonking ? 0.28 : 0, 1 - Math.exp(-25 * dt));
    r.body.rotation.x = THREE.MathUtils.lerp(r.body.rotation.x, targetPitch, 1 - Math.exp(-(pooping ? 30 : 12) * dt));
    // A full tummy waddles.
    const waddle = (species === 'duck' ? 0.13 : 0.04) + 0.03 * s.belly;
    r.body.rotation.z = THREE.MathUtils.lerp(r.body.rotation.z, moving ? -Math.sin(s.walkPhase) * waddle : 0, 0.2);
  }

  // Belly: a springy size that jiggles on every bite and shrinks with every poop.
  const bellyTarget = s.belly === 0 ? 0.8 : 0.96 + 0.11 * s.belly;
  s.bellyVel += (-170 * (s.bellyScale - bellyTarget) - 8 * s.bellyVel) * dt;
  s.bellyScale = Math.max(0.5, s.bellyScale + s.bellyVel * dt);
  if (r.belly) {
    r.belly.scale.setScalar(s.bellyScale);
    r.belly.visible = s.bellyScale > 0.82;
  }
  vis.sizeGroup?.scale.setScalar(s.size);

  // Rosy cheeks: straining to poop, or a mouth full of chili.
  if (r.cheeks) {
    const cheekTarget = s.power === 'chili' ? 1.25 + Math.sin(time * 18) * 0.12 : s.poopTime > 0 ? 1 : 0.001;
    const cs = THREE.MathUtils.lerp(r.cheeks.scale.x, cheekTarget, 1 - Math.exp(-14 * dt));
    r.cheeks.scale.setScalar(cs);
    r.cheeks.visible = cs > 0.05;
  }

  // What each magic food looks like while it lasts.
  if (s.power && !s.hidden) {
    s.powerFx -= dt;
    const headY = t.y + (spec.head[1] * MODEL_SCALE + 0.1) * s.size - rad;
    if (s.power === 'beans' && s.powerFx <= 0) {
      // rumbly tummy: little green puffs from the bottom
      s.powerFx = 0.3;
      tmp.c.copy(s.pos).addScaledVector(tmp.fwd, -0.55 * s.size);
      emit('puff', [tmp.c.x, t.y - 0.1, tmp.c.z], { count: 1, color: ['#b5e48c', '#99d98c'], speed: 0.4, up: 0.6, size: 0.22 });
      if (Math.random() < 0.15) playGurgle(s.pos);
    } else if (s.power === 'chili' && s.powerFx <= 0) {
      // steam out of the ears, sparks under fast feet
      s.powerFx = 0.2;
      const sx = Math.cos(s.facing) * 0.25 * s.size;
      const sz = -Math.sin(s.facing) * 0.25 * s.size;
      emit('puff', [t.x + sx, headY + 0.2, t.z + sz], { count: 1, color: '#ffffff', speed: 0.5, up: 2.5, size: 0.2 });
      emit('puff', [t.x - sx, headY + 0.2, t.z - sz], { count: 1, color: '#ffffff', speed: 0.5, up: 2.5, size: 0.2 });
      if (hSpeed > 4 && s.grounded) emit('star', [t.x, s.groundY + 0.1, t.z], { count: 2, color: ['#ff9100', '#ffd23f'], speed: 1.5, up: 1.5, size: 0.12 });
    }
  }
  if (s.power === 'giant' && s.grounded && hSpeed > 1.5 && !s.swimming) {
    // STOMP STOMP
    s.stompTimer -= dt;
    if (s.stompTimer <= 0) {
      s.stompTimer = 0.36;
      playStomp(s.pos);
      shakeCamera(0.12);
      emit('puff', [t.x, s.groundY + 0.1, t.z], { count: 4, color: '#f5f0e6', speed: 2.5, up: 0.4, size: 0.4 });
    }
  }

  if (r.head) {
    const bonking = s.bonkTime > 0;
    s.idleTime = hSpeed < 0.3 && s.grounded ? s.idleTime + dt : 0;
    const lookAround = s.idleTime > 2 ? Math.sin(time * 0.9) * 0.5 : 0;
    const chewing = s.chew > 0 ? Math.sin(time * 30) * 0.12 : 0;
    const targetX = (napping ? 0.7 : bonking ? 0.55 : s.noiseTime > 0 ? -0.5 + Math.sin(time * 40) * 0.05 : s.held != null ? 0.15 : 0) + chewing;
    r.head.rotation.x = THREE.MathUtils.lerp(r.head.rotation.x, targetX, 1 - Math.exp(-18 * dt));
    r.head.rotation.y = THREE.MathUtils.lerp(r.head.rotation.y, lookAround, 1 - Math.exp(-4 * dt));
    r.head.rotation.z = s.flopped ? Math.sin(time * 9) * 0.3 : THREE.MathUtils.lerp(r.head.rotation.z, 0, 0.2);
  }

  const legAmp = Math.min(1, hSpeed / 5) * 0.75;
  r.legs.forEach((leg, i) => {
    if (!leg) return;
    const front = i < 2;
    const phase = i === 0 || i === 3 ? 0 : Math.PI;
    let target: number;
    if (s.ridingOn != null) target = front ? -0.8 : -1.25; // sitting, legs forward
    else if (s.flopped || s.stunned > 0) target = Math.sin(time * 26 + i * 1.7) * 1.1;
    else if (s.swimming) target = Math.sin(time * 14 + phase) * 0.8;
    else if (airborne) target = front ? -0.9 : 0.8;
    else if (hSpeed > 0.6) target = Math.sin(s.walkPhase + phase) * legAmp;
    else target = 0;
    leg.rotation.x = THREE.MathUtils.lerp(leg.rotation.x, target, 1 - Math.exp(-20 * dt));
  });

  if (r.tail) {
    const wag = species === 'pig' ? 0 : Math.sin(time * (9 + hSpeed)) * (s.noiseTime > 0 || hSpeed > 1 ? 0.8 : 0.35);
    r.tail.rotation.y = wag;
    r.tail.rotation.x = THREE.MathUtils.lerp(r.tail.rotation.x, s.poopTime > 0 ? -1.1 : 0, 1 - Math.exp(-20 * dt));
    if (species === 'pig') r.tail.rotation.z += dt * (4 + hSpeed * 2);
  }

  r.ears.forEach((ear, i) => {
    if (!ear) return;
    const flop = THREE.MathUtils.clamp(-lv.y * 0.05, -0.5, 0.5) + Math.sin(s.walkPhase * 2 + i) * 0.12 * Math.min(1, hSpeed / 5);
    ear.rotation.x = THREE.MathUtils.lerp(ear.rotation.x, flop + (s.flopped ? Math.sin(time * 20 + i) : 0), 0.3);
  });

  googlyEyes(f, vis);

  if (r.mud) {
    r.mud.visible = s.mud > 0.02;
    r.mud.scale.setScalar(Math.max(0.001, s.mud));
  }

  // a unicorn leaves a little rainbow of sparkles behind when it runs
  if (species === 'unicorn' && hSpeed > 2 && !s.hidden && Math.random() < 0.4) {
    tmp.c.copy(s.pos).addScaledVector(tmp.fwd, -0.6 * s.size);
    emit('star', [tmp.c.x, t.y - 0.1, tmp.c.z], { count: 1, color: ['#ff4d5e', '#ffd23f', '#22c55e', '#3b82f6', '#a855f7'], speed: 0.6, up: 1, size: 0.1, life: 0.9 });
  }

  // ripples while paddling
  if (s.swimming) {
    s.rippleTimer -= dt;
    if (s.rippleTimer <= 0) {
      s.rippleTimer = hSpeed > 1 ? 0.35 : 0.9;
      ring([t.x, 0.06, t.z], { color: '#d9f3ff', radius: 1.6, duration: 0.9 });
    }
  }

  worldHelpers(f, vis);
}

/** Googly eyes: the pupils slosh around with acceleration (and spin while dizzy). */
function googlyEyes(f: FrameCtx, vis: PlayerVisuals) {
  const { s, dt, time } = f;
  const r = vis.rig;
  // Paused (dt 0): leave the pupils where they are rather than divide by zero.
  if (dt <= 0) return;
  const er = r.eyeRadius;
  const rightX = Math.cos(s.facing);
  const rightZ = -Math.sin(s.facing);
  const ax = THREE.MathUtils.clamp(((s.vel.x - s.prevVel.x) * rightX + (s.vel.z - s.prevVel.z) * rightZ) / dt, -120, 120);
  const ay = THREE.MathUtils.clamp((s.vel.y - s.prevVel.y) / dt, -120, 120);
  const maxR = er * 0.42;
  s.pupils.forEach((p, i) => {
    if (s.flopped || s.stunned > 0) {
      p.x = Math.cos(time * 14 + i * Math.PI) * maxR;
      p.y = Math.sin(time * 14 + i * Math.PI) * maxR;
      p.vx = p.vy = 0;
    } else {
      const k = 240 + i * 60;
      const c = 5 + i * 2;
      p.vx += (-k * p.x - c * p.vx - ax * 0.0022) * dt;
      p.vy += (-k * (p.y + er * 0.1) - c * p.vy - ay * 0.0022) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const len = Math.hypot(p.x, p.y);
      if (len > maxR) {
        const nx = p.x / len;
        const ny = p.y / len;
        p.x = nx * maxR;
        p.y = ny * maxR;
        const vn = p.vx * nx + p.vy * ny;
        if (vn > 0) {
          p.vx -= 1.7 * vn * nx;
          p.vy -= 1.7 * vn * ny;
        }
      }
    }
    const pupil = r.pupils[i];
    if (pupil) pupil.position.set(p.x, p.y, Math.sqrt(Math.max(0, er * er * 0.64 - p.x * p.x - p.y * p.y)));
  });
}

/** World-space helpers: landing shadow, spawn beam, player marker, tongue. */
function worldHelpers(f: FrameCtx, vis: PlayerVisuals) {
  const { s, t, tmp, dt, time, spec, rad } = f;
  if (vis.shadowRing) {
    const sr = vis.shadowRing;
    const height = Math.max(0, t.y - rad - s.groundY);
    sr.position.set(t.x, s.groundY + 0.04, t.z);
    sr.scale.setScalar(THREE.MathUtils.clamp(1 - height * 0.04, 0.55, 1) * s.size);
    sr.visible = f.hit != null && !s.hidden;
  }
  if (vis.beam) {
    const age = (gameNow() - vis.bornAt) / 1000;
    const b = vis.beam;
    b.visible = age < 2.5;
    if (b.visible) {
      b.position.set(t.x, t.y + 6, t.z);
      (b.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - age / 2.5);
    }
  }
  if (vis.marker) {
    const m = vis.marker;
    m.visible = players.size > 1 && !s.hidden;
    m.position.set(t.x, t.y + (spec.head[1] * MODEL_SCALE + (f.hat === 'none' ? 0 : 0.4)) * s.size + 0.2 + Math.sin(time * 4) * 0.08, t.z);
    m.rotation.y += dt * 3;
  }
  if (vis.tongue && vis.tongueTip) {
    let target: THREE.Vector3 | null = null;
    const friend = s.heldFriend != null ? players.get(s.heldFriend) : undefined;
    if (friend) {
      // stuck to the friend's face
      tmp.d.copy(tmp.mouth).sub(friend.position).normalize();
      target = tmp.p.copy(friend.position).addScaledVector(tmp.d, RADIUS * friend.size * 0.9);
      target.y += 0.25 * friend.size;
    } else if (s.held != null) {
      const prop = props.get(s.held);
      if (prop && propPosition(prop, tmp.p)) {
        tmp.d.copy(tmp.mouth).sub(tmp.p).normalize();
        target = tmp.p.addScaledVector(tmp.d, prop.radius * 0.85);
      }
    } else if (s.lickMiss > 0) {
      const phase = 1 - s.lickMiss / 0.32;
      const reach = Math.sin(phase * Math.PI) * 1.8;
      target = tmp.p.copy(tmp.mouth).addScaledVector(tmp.fwd, reach);
    }
    const show = target != null && target.distanceTo(tmp.mouth) > 0.05;
    vis.tongue.visible = show;
    vis.tongueTip.visible = show;
    if (show && target) {
      tmp.d.copy(target).sub(tmp.mouth);
      const len = tmp.d.length();
      vis.tongue.position.copy(tmp.mouth).addScaledVector(tmp.d, 0.5);
      tmp.q.setFromUnitVectors(UP, tmp.d.normalize());
      vis.tongue.quaternion.copy(tmp.q);
      vis.tongue.scale.set(1, len, 1);
      vis.tongueTip.position.copy(target);
    }
  }
}
