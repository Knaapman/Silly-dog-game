import { useFrame } from '@react-three/fiber';
import { BallCollider, RigidBody, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  playAnimalNoise,
  playBonk,
  playBoing,
  playBounce,
  playDuet,
  playFlop,
  playHatTada,
  playJump,
  playPoof,
  playSlideWhistle,
  playSlurp,
  playSplash,
  playSquelch,
  playThrow,
  playThud,
  playWhoosh
} from '../audio';
import { GRAVITY, MOVE, PARTY_POINTS, WORLD_HALF } from '../config';
import { bonkStars, burstConfetti, emit, poof, ring } from '../fx';
import { getInput, NO_INPUT, rumble } from '../input';
import { distXZ, isInMud, isInPond, isOnSnow, SPAWN_POINTS } from '../layout';
import { lambert } from '../materials';
import {
  noises,
  players,
  playersCentroid,
  propPosition,
  props,
  pushNoise,
  shakeCamera,
  statics,
  surfaces,
  type PlayerRuntime,
  type PropEntry
} from '../runtime';
import { useGame, type PlayerInfo } from '../store';
import { AnimalModel, createRig, SPECIES_SPECS } from './AnimalModel';

const RADIUS = 0.5;
/** Animals are drawn a bit bigger than their physics ball so small kids can read them. */
const MODEL_SCALE = 1.15;
const UP = new THREE.Vector3(0, 1, 0);

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

type Flip = { axis: 'x' | 'y' | 'z'; t: number; dur: number; dir: number };
type Pupil = { x: number; y: number; vx: number; vy: number };

function createState(spawn: THREE.Vector3) {
  return {
    pos: spawn.clone(),
    vel: new THREE.Vector3(),
    prevVel: new THREE.Vector3(),
    facing: 0,
    targetFacing: 0,
    grounded: false,
    airTime: 0,
    coyote: 0,
    jumpBuffer: 0,
    jumps: 0,
    lastVy: 0,
    groundY: 0,
    flopped: false,
    flopTime: 0,
    bonkTime: 0,
    bonkCooldown: 0,
    dashTime: 0,
    bonkHits: new Set<number>(),
    held: null as number | null,
    lickMiss: 0,
    noiseTime: 0,
    launched: 0,
    padCooldown: 0,
    launchAirborne: false,
    bounceCooldown: 0,
    stunned: 0,
    pendingBump: null as THREE.Vector3 | null,
    pendingHop: 0,
    pendingLaunch: null as { target: THREE.Vector3; apex: number } | null,
    holdAt: null as THREE.Vector3 | null,
    hidden: false,
    platformVel: new THREE.Vector3(),
    sliding: false,
    stepTimer: 0,
    gravityOff: false,
    grip: false,
    jumpedAt: 0,
    noiseAt: 0,
    flip: null as Flip | null,
    squash: 0,
    squashVel: 0,
    mud: 0,
    swimming: false,
    inMud: false,
    rippleTimer: 0,
    walkPhase: 0,
    idleTime: 0,
    pupils: [
      { x: 0, y: 0, vx: 0, vy: 0 },
      { x: 0, y: 0, vx: 0, vy: 0 }
    ] as Pupil[]
  };
}

/** Velocity that lands on `to` after peaking at absolute height `apex`. */
function ballistic(from: THREE.Vector3, to: THREE.Vector3, apex: number, out: THREE.Vector3) {
  const g = -GRAVITY;
  const top = Math.max(apex, from.y + 0.5, to.y + 0.5);
  const vy = Math.sqrt(2 * g * (top - from.y));
  const tUp = vy / g;
  const tDown = Math.sqrt((2 * (top - to.y)) / g);
  const time = tUp + tDown;
  out.set((to.x - from.x) / time, vy, (to.z - from.z) / time);
  return time;
}

function pickSpawn(slot: number) {
  const others = new THREE.Vector3();
  const count = playersCentroid(others, slot);
  if (count > 0) {
    const a = Math.random() * Math.PI * 2;
    return new THREE.Vector3(others.x + Math.cos(a) * 2.5, 6, others.z + Math.sin(a) * 2.5);
  }
  const p = SPAWN_POINTS[slot % SPAWN_POINTS.length];
  return new THREE.Vector3(p[0], 5, p[2]);
}

const BONK_PITCH: Partial<Record<PropEntry['kind'], number>> = {
  chicken: 1.6,
  dino: 1.9,
  cow: 0.6,
  snowball: 0.8,
  duck: 1.8,
  ball: 1.4,
  beachball: 1.2,
  apple: 1.5,
  hay: 0.7,
  barrel: 0.8,
  bowling: 0.6,
  crate: 0.9
};

export function Player({ info }: { info: PlayerInfo }) {
  const { slot, source, species, hat, color } = info;
  const asleep = !!info.asleep;
  const { world, rapier } = useRapier();
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const yawGroup = useRef<THREE.Group>(null);
  const squashGroup = useRef<THREE.Group>(null);
  const flipGroup = useRef<THREE.Group>(null);
  const shadowRing = useRef<THREE.Mesh>(null);
  const marker = useRef<THREE.Mesh>(null);
  const tongue = useRef<THREE.Mesh>(null);
  const tongueTip = useRef<THREE.Mesh>(null);
  const rig = useRef(createRig());

  const spawn = useMemo(() => pickSpawn(slot), [slot]);
  const st = useRef(createState(spawn));
  const speciesRef = useRef(species);
  speciesRef.current = species;
  const asleepRef = useRef(asleep);
  asleepRef.current = asleep;
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const beam = useRef<THREE.Mesh>(null);
  const bornAt = useRef(performance.now());

  const tmp = useMemo(
    () => ({
      fwd: new THREE.Vector3(),
      head: new THREE.Vector3(),
      mouth: new THREE.Vector3(),
      p: new THREE.Vector3(),
      d: new THREE.Vector3(),
      c: new THREE.Vector3(),
      v: new THREE.Vector3(),
      q: new THREE.Quaternion()
    }),
    []
  );
  const ray = useMemo(() => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }), [rapier]);

  // Register with the runtime so props, critters, camera and other players can find us.
  useEffect(() => {
    const s = st.current;
    const rt: PlayerRuntime = {
      slot,
      source,
      getBody: () => body.current,
      position: s.pos,
      velocity: s.vel,
      facing: 0,
      flopped: false,
      asleep: false,
      jumpedAt: 0,
      noiseAt: 0,
      bump: (dir) => {
        s.pendingBump = dir.clone();
      },
      hop: (vy) => {
        s.pendingHop = vy;
      },
      launchTo: (target, apex) => {
        s.pendingLaunch = { target: target.clone(), apex };
      },
      hold: (position, hidden = false) => {
        s.holdAt = position ? position.clone() : null;
        s.hidden = position ? hidden : false;
      },
      isLaunched: () => s.launched > 0 || s.pendingLaunch != null || s.holdAt != null
    };
    players.set(slot, rt);
    // "I'm here!" - buzz the controller that just joined.
    rumble(sourceRef.current, 0.6, 0.6, 250);
    return () => {
      players.delete(slot);
      if (useGame.getState().phase === 'play') {
        poof([s.pos.x, s.pos.y, s.pos.z], color, 16);
        playPoof(s.pos);
      }
      const held = s.held != null ? props.get(s.held) : null;
      if (held) {
        held.heldBy = null;
        held.onRelease?.();
      }
    };
  }, [slot]);

  // Poof when (re)spawning or switching animal.
  useEffect(() => {
    const s = st.current;
    poof([s.pos.x, s.pos.y, s.pos.z], '#ffffff', 12);
    ring([s.pos.x, s.pos.y, s.pos.z], { color, radius: 1.6, duration: 0.4 });
    playPoof(s.pos);
    s.squash = -0.35;
  }, [species, color]);

  const lastHat = useRef(hat);
  useEffect(() => {
    if (lastHat.current === hat) return;
    lastHat.current = hat;
    const s = st.current;
    emit('confetti', [s.pos.x, s.pos.y + 1.3, s.pos.z], { count: 24, speed: 3, up: 5 });
    playHatTada(s.pos);
    s.squash = 0.25;
  }, [hat]);

  useFrame((state, delta) => {
    const rb = body.current;
    if (!rb) return;
    const dt = Math.min(delta, 1 / 20);
    const s = st.current;
    const game = useGame.getState();
    const napping = asleepRef.current;
    const input = game.phase === 'play' && !game.menuOpen && !napping ? getInput(source) : NO_INPUT;
    const time = state.clock.elapsedTime;
    const species = speciesRef.current;
    const spec = SPECIES_SPECS[species];
    const rt = players.get(slot);

    const t = rb.translation();
    const lv = rb.linvel();
    s.prevVel.copy(s.vel);
    s.pos.set(t.x, t.y, t.z);
    s.vel.set(lv.x, lv.y, lv.z);

    // ----- ground probe (also places the landing-shadow ring)
    ray.origin = { x: t.x, y: t.y, z: t.z };
    const hit = world.castRay(ray, 40, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, rb);
    const groundDist = hit ? hit.timeOfImpact : 99;
    s.groundY = t.y - groundDist;
    const wasGrounded = s.grounded;
    const surface = hit && groundDist < RADIUS + 0.4 ? surfaces.get(hit.collider.handle) : undefined;
    const groundBody = hit ? hit.collider.parent() : null;
    const onStatic = !groundBody || groundBody.isFixed();
    // Generous so slopes (roof, hill, island) still count as ground for jumping. Moving
    // platforms can rise faster than a normal "falling" check allows.
    const riseLimit = surface?.velocityAt ? 12 : 4;
    s.grounded = !s.flopped && groundDist < RADIUS + 0.25 && lv.y < riseLimit;
    if (s.grounded && surface?.velocityAt) surface.velocityAt(s.pos, s.platformVel);
    else s.platformVel.set(0, 0, 0);

    // ----- timers
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
    s.airTime = s.grounded ? 0 : s.airTime + dt;
    // A launch ends as soon as we touch down again, so nobody slides off the landing spot.
    if (s.launched > 0) {
      if (!s.grounded) s.launchAirborne = true;
      else if (s.launchAirborne) s.launched = 0;
    }

    tmp.fwd.set(Math.sin(s.facing), 0, Math.cos(s.facing));

    // ----- water & mud
    const swimming = isInPond(t.x, t.z) && t.y < 1.3;
    const inMud = isInMud(t.x, t.z) && t.y < 1.3;
    if (swimming && !s.swimming) {
      playSplash(s.pos);
      emit('drop', [t.x, 0.3, t.z], { count: 26, color: ['#7fd3ff', '#ffffff'], speed: 4, up: 6 });
      ring([t.x, 0.06, t.z], { color: '#e0f6ff', radius: 2.5, duration: 0.7 });
      useGame.getState().addParty(PARTY_POINTS.splash);
      rumble(source, 0.2, 0.4, 120);
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
      if (Math.random() < 0.2) emit('puff', [t.x, t.y + 0.3, t.z], { count: 1, color: '#ffffff', size: 0.2, speed: 1, up: 1 });
    } else s.mud = Math.max(0, s.mud - dt * 0.015);

    // ----- flop (ragdoll)
    const col = collider.current;
    const startFlop = () => {
      s.flopped = true;
      s.flopTime = MOVE.flopDuration;
      releaseHeld(false);
      rb.setEnabledRotations(true, true, true, true);
      col?.setFriction(0.9);
      rb.setLinvel({ x: lv.x * 0.5, y: Math.max(lv.y, 6), z: lv.z * 0.5 }, true);
      rb.setAngvel({ x: (Math.random() - 0.5) * 16, y: (Math.random() - 0.5) * 10, z: (Math.random() - 0.5) * 16 }, true);
      playFlop(s.pos);
      emit('star', [t.x, t.y + 0.8, t.z], { count: 5, color: ['#ffe14d', '#ffffff'], speed: 3, up: 3 });
      useGame.getState().addParty(0.01);
    };
    const endFlop = () => {
      s.flopped = false;
      rb.setEnabledRotations(false, false, false, true);
      rb.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
      col?.setFriction(0);
      rb.setLinvel({ x: 0, y: 7, z: 0 }, true);
      s.squash = -0.3;
      startFlip('y', 0.45);
      poof([t.x, t.y - 0.2, t.z], '#ffffff', 10);
      playBoing(s.pos, 1.3);
    };
    const startFlip = (axis: Flip['axis'], dur: number, dir = 1) => {
      s.flip = { axis, t: 0, dur, dir };
    };

    if (input.pressed.flop && !s.flopped) startFlop();
    else if (s.flopped) {
      s.flopTime -= dt;
      const canWake = s.flopTime < MOVE.flopDuration - 0.6;
      if (s.flopTime <= 0 || (canWake && (input.pressed.flop || input.pressed.jump))) endFlop();
      else if (Math.hypot(input.x, input.z) > 0.2) {
        // steer the tumbling body by spinning it like a ball
        const av = rb.angvel();
        const k = 1 - Math.exp(-6 * dt);
        rb.setAngvel({ x: av.x + (input.z * 14 - av.x) * k, y: av.y, z: av.z + (-input.x * 14 - av.z) * k }, true);
      }
    }

    // ----- held prop (sticky tongue)
    function releaseHeld(throwIt: boolean) {
      if (s.held == null) return;
      const prop = props.get(s.held);
      s.held = null;
      if (!prop) return;
      prop.heldBy = null;
      prop.onRelease?.();
      const pb = prop.getBody();
      if (throwIt && pb) {
        const power = prop.heavy ? 7 : 13;
        pb.setLinvel({ x: tmp.fwd.x * power + s.vel.x * 0.5, y: prop.heavy ? 4 : 6.5, z: tmp.fwd.z * power + s.vel.z * 0.5 }, true);
        pb.setAngvel({ x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 8 }, true);
        playThrow(s.pos);
        rumble(source, 0.2, 0.5, 90);
      }
    }

    const mouthOffsetY = (spec.head[1] - 0.1) * MODEL_SCALE - RADIUS;
    const mouthOffsetZ = (spec.head[2] + 0.3) * MODEL_SCALE;
    tmp.mouth.copy(s.pos).addScaledVector(tmp.fwd, mouthOffsetZ);
    tmp.mouth.y += mouthOffsetY;

    if (input.pressed.lick && !s.flopped) {
      if (s.held != null) releaseHeld(true);
      else {
        let best: PropEntry | null = null;
        let bestScore = Infinity;
        props.forEach((prop) => {
          if (!prop.grabbable || !prop.enabled || prop.heldBy != null) return;
          if (!propPosition(prop, tmp.p)) return;
          tmp.d.copy(tmp.p).sub(tmp.mouth);
          const dist = tmp.d.length() - prop.radius;
          if (dist > 2.6) return;
          const flat = Math.hypot(tmp.d.x, tmp.d.z) || 1;
          const facing = (tmp.d.x * tmp.fwd.x + tmp.d.z * tmp.fwd.z) / flat;
          if (facing < 0.15 && dist > 0.8) return;
          const score = dist - facing;
          if (score < bestScore) {
            bestScore = score;
            best = prop;
          }
        });
        const target = best as PropEntry | null;
        if (target) {
          const keep = target.onGrab?.(slot);
          if (keep !== false) {
            target.heldBy = slot;
            s.held = target.id;
          }
          playSlurp(s.pos);
          rumble(source, 0.1, 0.3, 60);
        } else {
          s.lickMiss = 0.32;
          playSlurp(s.pos, true);
        }
      }
    }

    let heavyDrag = false;
    if (s.held != null) {
      const prop = props.get(s.held);
      const pb = prop?.getBody();
      if (!prop || !pb || !prop.enabled || s.flopped) {
        releaseHeld(false);
      } else {
        propPosition(prop, tmp.p);
        tmp.c.copy(tmp.mouth).addScaledVector(tmp.fwd, prop.radius + 0.12);
        tmp.d.copy(tmp.c).sub(tmp.p);
        const dist = tmp.d.length();
        if (dist > 7) releaseHeld(false);
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
            heavyDrag = true;
            const rope = 1.4 + prop.radius;
            if (dist > rope) {
              tmp.d.multiplyScalar(((dist - rope) * 9) / dist);
              pb.setLinvel({ x: pv.x * 0.9 + tmp.d.x, y: pv.y + Math.max(0, tmp.d.y) * 0.5, z: pv.z * 0.9 + tmp.d.z }, true);
            }
          }
        }
      }
    }

    // ----- noise (bark / meh / oink / baa)
    if (input.pressed.noise && !s.flopped) {
      playAnimalNoise(species, s.pos);
      s.noiseTime = 0.5;
      s.noiseAt = performance.now();
      ring([t.x, t.y + 0.2, t.z], { color, radius: 3.5, duration: 0.6 });
      const now = performance.now();
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

    // ----- change animal / hat (Select / Start on a controller)
    if (input.pressed.species) useGame.getState().cycleSpecies(slot);
    if (input.pressed.hat) useGame.getState().nextHat(slot);

    // ----- headbutt
    if (input.pressed.bonk && s.bonkCooldown <= 0 && !s.flopped && s.stunned <= 0) {
      s.bonkTime = MOVE.bonkDuration;
      s.bonkCooldown = MOVE.bonkCooldown;
      s.dashTime = 0.16;
      s.bonkHits.clear();
      playWhoosh(s.pos);
    }
    if (s.bonkTime > 0) {
      tmp.head.copy(s.pos).addScaledVector(tmp.fwd, 0.8);
      tmp.head.y += 0.15;
      let hits = 0;
      props.forEach((prop) => {
        if (!prop.enabled || prop.heldBy != null || s.bonkHits.has(prop.id)) return;
        if (!propPosition(prop, tmp.p)) return;
        if (tmp.p.distanceTo(tmp.head) - prop.radius > 0.75) return;
        s.bonkHits.add(prop.id);
        tmp.d.set(tmp.p.x - s.pos.x, 0, tmp.p.z - s.pos.z);
        if (tmp.d.lengthSq() < 0.001) tmp.d.copy(tmp.fwd);
        tmp.d.normalize().add(tmp.fwd).normalize();
        const pb = prop.getBody();
        if (pb) {
          const v = prop.launch;
          pb.wakeUp();
          pb.setLinvel({ x: tmp.d.x * v, y: v * 0.55 + 2, z: tmp.d.z * v }, true);
          pb.setAngvel({ x: (Math.random() - 0.5) * 12, y: (Math.random() - 0.5) * 12, z: (Math.random() - 0.5) * 12 }, true);
        }
        prop.onBonk?.(slot, tmp.d);
        bonkStars([tmp.p.x, tmp.p.y + 0.3, tmp.p.z]);
        playBonk(tmp.p, BONK_PITCH[prop.kind] ?? 1);
        useGame.getState().addParty(prop.kind === 'chicken' || prop.kind === 'cow' || prop.kind === 'dino' ? PARTY_POINTS.bonkCritter : PARTY_POINTS.bonk);
        hits += 1;
      });
      players.forEach((other) => {
        if (other.slot === slot || s.bonkHits.has(-1 - other.slot)) return;
        if (other.position.distanceTo(tmp.head) > 1.15) return;
        s.bonkHits.add(-1 - other.slot);
        tmp.d.copy(other.position).sub(s.pos).setY(0);
        if (tmp.d.lengthSq() < 0.001) tmp.d.copy(tmp.fwd);
        other.bump(tmp.d.normalize());
        bonkStars([other.position.x, other.position.y + 0.6, other.position.z]);
        hits += 1;
      });
      statics.forEach((st2) => {
        if (s.bonkHits.has(100000 + st2.id)) return;
        if (distXZ(st2.position.x, st2.position.z, tmp.head.x, tmp.head.z) > st2.radius + 0.6) return;
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

    // ----- being bumped by a friend / party hop
    let vx = lv.x;
    let vy = lv.y;
    let vz = lv.z;
    if (s.pendingBump) {
      if (s.flopped) endFlop();
      releaseHeld(false);
      vx = s.pendingBump.x * 7;
      vz = s.pendingBump.z * 7;
      vy = 9;
      s.stunned = 0.55;
      startFlip('y', 0.55, Math.random() < 0.5 ? 1 : -1);
      playBoing(s.pos, 1.5);
      rumble(source, 0.5, 0.5, 160);
      s.pendingBump = null;
    }
    if (s.pendingHop > 0 && !s.flopped) {
      vy = Math.max(vy, s.pendingHop);
      startFlip('x', 0.7);
      s.pendingHop = 0;
    }

    // ----- held in place (inside a cannon...)
    if (s.holdAt) {
      if (s.flopped) endFlop();
      releaseHeld(false);
      rb.setTranslation(s.holdAt, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      vx = vy = vz = 0;
    }

    // ----- launched by a pad / cannon / geyser: fly in a big arc to a fun spot
    if (s.pendingLaunch && !s.holdAt) {
      if (s.flopped) endFlop();
      const { target, apex } = s.pendingLaunch;
      s.pendingLaunch = null;
      tmp.c.set(target.x, target.y + RADIUS + 0.1, target.z);
      const flight = ballistic(s.pos, tmp.c, apex, tmp.v);
      vx = tmp.v.x;
      vy = tmp.v.y;
      vz = tmp.v.z;
      s.launched = flight;
      s.launchAirborne = false;
      if (Math.hypot(tmp.v.x, tmp.v.z) > 0.5) s.targetFacing = s.facing = Math.atan2(tmp.v.x, tmp.v.z);
      s.jumps = 1;
      s.squash = 0.5;
      startFlip('x', Math.min(1.2, flight * 0.8));
      releaseHeld(false);
      playSlideWhistle('up', s.pos);
      poof([t.x, t.y - 0.3, t.z], '#fff3a8', 12);
      rumble(source, 0.8, 0.8, 250);
      useGame.getState().addParty(PARTY_POINTS.launch);
      rb.setLinvel({ x: vx, y: vy, z: vz }, true);
    }

    // ----- movement
    if (!s.flopped && !s.holdAt) {
      let speed: number = MOVE.speed;
      if (s.swimming) speed = MOVE.swimSpeed;
      else if (s.inMud) speed = MOVE.mudSpeed;
      if (heavyDrag) speed *= 0.72;
      const controlling = s.launched <= 0 && s.stunned <= 0;
      const mag = Math.hypot(input.x, input.z);
      const pv = s.platformVel;
      if (controlling) {
        const accel = s.grounded || s.swimming ? (surface?.slippery ?? MOVE.groundAccel) : MOVE.airAccel;
        const k = 1 - Math.exp(-accel * dt);
        vx += (input.x * speed + pv.x - vx) * k;
        vz += (input.z * speed + pv.z - vz) * k;
        if (mag > 0.15 && s.bonkTime <= 0) s.targetFacing = Math.atan2(input.x, input.z);
      }
      // Stick to rides going up and down.
      if (s.grounded && surface?.velocityAt && s.jumpBuffer <= 0) vy = pv.y - 0.3;
      if (s.dashTime > 0) {
        vx = tmp.fwd.x * MOVE.bonkDashSpeed + pv.x;
        vz = tmp.fwd.z * MOVE.bonkDashSpeed + pv.z;
      }
      s.facing = lerpAngle(s.facing, s.targetFacing, 1 - Math.exp(-14 * dt));

      // Slides: a happy "wheee" when you start going fast.
      const sliding = s.grounded && !!surface?.slide && Math.hypot(lv.x, lv.z) > 3;
      if (sliding && !s.sliding) {
        playSlideWhistle('down', s.pos);
        useGame.getState().addParty(PARTY_POINTS.bounce);
      }
      s.sliding = sliding;
      if (sliding && Math.random() < 0.3) emit('star', [t.x, t.y - 0.3, t.z], { count: 1, color: ['#ffffff', '#fff3a8'], speed: 1, up: 1, size: 0.1 });

      // Snow crunches under your feet.
      if (s.grounded && (surface?.snow || isOnSnow(t.x, t.z)) && Math.hypot(lv.x, lv.z) > 2) {
        s.stepTimer -= dt;
        if (s.stepTimer <= 0) {
          s.stepTimer = 0.18;
          emit('puff', [t.x, s.groundY + 0.1, t.z], { count: 2, color: '#ffffff', speed: 1, up: 0.8, size: 0.18 });
        }
      }

      // Soft leash: nobody wanders off-screen in co-op.
      if (players.size > 1 && s.launched <= 0) {
        playersCentroid(tmp.c, slot);
        const d = distXZ(t.x, t.z, tmp.c.x, tmp.c.z);
        if (d > MOVE.leashRadius) {
          const pull = Math.min(6, (d - MOVE.leashRadius) * 1.5);
          vx += ((tmp.c.x - t.x) / d) * pull;
          vz += ((tmp.c.z - t.z) / d) * pull;
        }
      }

      // Jump / double jump (with a flip!)
      if (input.pressed.jump) s.jumpBuffer = 0.14;
      if (s.grounded || s.swimming) {
        s.coyote = 0.1;
        s.jumps = 0;
      }

      // Bouncy things (trampolines, mushrooms, bouncy castle). Checked before jumping so
      // mashing jump on landing gives an even bigger bounce instead of a normal hop. The
      // collider's own restitution may already have bounced us a little: still boost.
      if (surface?.bounce && s.bounceCooldown <= 0 && lv.y < surface.bounce - 3 && groundDist < RADIUS + 0.35) {
        vy = surface.bounce + (input.held.jump || s.jumpBuffer > 0 ? 3.5 : 0);
        s.jumps = 1;
        s.jumpBuffer = 0;
        s.coyote = 0;
        s.bounceCooldown = 0.3;
        s.squash = 0.45;
        const axes: Flip['axis'][] = ['x', 'z', 'y'];
        startFlip(axes[Math.floor(Math.random() * axes.length)], 0.8, Math.random() < 0.5 ? 1 : -1);
        playBoing(s.pos, 0.9 + Math.random() * 0.4);
        ring([t.x, s.groundY + 0.05, t.z], { color: '#ffffff', radius: 2.2, duration: 0.4 });
        rumble(source, 0.3, 0.6, 120);
        surface.onBounce?.(slot);
        useGame.getState().addParty(PARTY_POINTS.bounce);
      }

      if (s.jumpBuffer > 0 && s.stunned <= 0) {
        if (s.coyote > 0) {
          vy = (s.swimming ? 8 : MOVE.jumpVelocity) + Math.max(0, pv.y);
          s.jumps = 1;
          s.coyote = 0;
          s.jumpBuffer = 0;
          s.squash = -0.3;
          s.jumpedAt = performance.now();
          playJump(s.pos);
          if (s.swimming) {
            playSplash(s.pos, false);
            emit('drop', [t.x, 0.3, t.z], { count: 12, color: ['#7fd3ff', '#ffffff'], speed: 3, up: 5 });
          } else emit('puff', [t.x, s.groundY + 0.1, t.z], { count: 5, color: '#f5f0e6', speed: 2, up: 0.5, size: 0.25 });
        } else if (s.jumps < 2 && s.airTime > 0.05) {
          vy = MOVE.doubleJumpVelocity;
          s.jumps = 2;
          s.jumpBuffer = 0;
          s.jumpedAt = performance.now();
          startFlip('x', 0.5);
          playJump(s.pos, true);
          ring([t.x, t.y - 0.4, t.z], { color: '#ffffff', radius: 1.4, duration: 0.35 });
          emit('star', [t.x, t.y - 0.3, t.z], { count: 4, color: ['#ffffff', '#ffe14d'], speed: 2.5, up: -1 });
        }
      }

      // Sticky feet: standing still on a slope (hill, roof, volcano) shouldn't creep downhill.
      // Static ground: switch gravity off. Moving things (see-saw, crates) need your weight,
      // so there you grip with friction instead.
      const still =
        s.grounded &&
        mag < 0.1 &&
        !surface?.slippery &&
        !surface?.velocityAt &&
        !surface?.bounce &&
        s.launched <= 0 &&
        s.jumpBuffer <= 0 &&
        !s.swimming &&
        s.dashTime <= 0 &&
        s.stunned <= 0 &&
        vy <= 1;
      const idle = still && onStatic;
      const grip = still && !onStatic;
      if (grip !== s.grip) {
        s.grip = grip;
        col?.setFriction(grip ? 2 : 0);
      }
      if (idle !== s.gravityOff) {
        s.gravityOff = idle;
        rb.setGravityScale(idle ? 0 : 1, true);
      }
      if (idle) {
        vy = Math.min(0, vy) * 0.5;
        vx *= 0.6;
        vz *= 0.6;
      }

      rb.setLinvel({ x: vx, y: vy, z: vz }, true);
    } else {
      if (s.grip) {
        s.grip = false;
        if (!s.flopped) col?.setFriction(0); // flopping sets its own friction
      }
      if (s.gravityOff) {
        s.gravityOff = false;
        rb.setGravityScale(1, true);
      }
    }

    // ----- landing
    if (s.grounded && !wasGrounded) {
      const impact = -s.lastVy;
      if (impact > 7) {
        s.squash = Math.min(0.5, impact * 0.025);
        emit('puff', [t.x, s.groundY + 0.1, t.z], { count: 8, color: s.inMud ? '#6b4a2b' : '#f5f0e6', speed: 3, up: 0.6, size: 0.3 });
        playBounce(s.pos, 0.3);
      }
      if (impact > 16) {
        // Belly-flop shockwave: everything nearby jumps.
        ring([t.x, s.groundY + 0.08, t.z], { color: '#ffffff', radius: 4.5, duration: 0.5 });
        playThud(s.pos);
        shakeCamera(0.4);
        rumble(source, 0.9, 0.6, 200);
        props.forEach((prop) => {
          if (prop.heldBy != null || !propPosition(prop, tmp.p)) return;
          const d = tmp.p.distanceTo(s.pos);
          if (d > 4 || d < 0.01) return;
          const pb = prop.getBody();
          const push = (1 - d / 4) * prop.launch * 0.7;
          pb?.setLinvel({ x: ((tmp.p.x - t.x) / d) * push, y: push + 2, z: ((tmp.p.z - t.z) / d) * push }, true);
        });
        useGame.getState().addParty(PARTY_POINTS.bellyFlop);
      }
    }
    s.lastVy = lv.y;

    // ----- fell out of the world? pop back in.
    if (t.y < -8 || Math.abs(t.x) > WORLD_HALF + 6 || Math.abs(t.z) > WORLD_HALF + 6) {
      const p = pickSpawn(slot);
      rb.setTranslation(p, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      poof([p.x, p.y, p.z], color, 18);
    }

    if (napping && Math.random() < dt * 1.5) {
      emit('puff', [t.x + 0.3, t.y + 1.2, t.z], { count: 1, color: '#e3f2fd', size: 0.18, speed: 0.2, up: 1.2, gravity: -1, life: 1.5 });
    }
    if (rt) {
      rt.source = source;
      rt.asleep = napping;
      rt.facing = s.facing;
      rt.flopped = s.flopped;
      rt.jumpedAt = s.jumpedAt;
      rt.noiseAt = s.noiseAt;
    }

    // =====================================================================
    // Animation
    const r = rig.current;
    const hSpeed = Math.hypot(lv.x, lv.z);
    const airborne = !s.grounded && !s.swimming && s.airTime > 0.08;

    if (yawGroup.current) {
      yawGroup.current.visible = !s.hidden;
      yawGroup.current.rotation.y = s.flopped ? yawGroup.current.rotation.y : s.facing;
      const swimDip = s.swimming ? -0.32 + Math.sin(time * 3) * 0.04 : 0;
      yawGroup.current.position.y = THREE.MathUtils.lerp(yawGroup.current.position.y, -RADIUS + swimDip, 1 - Math.exp(-10 * dt));
    }

    // squash & stretch spring
    s.squashVel += (-120 * s.squash - 10 * s.squashVel) * dt;
    s.squash += s.squashVel * dt;
    if (squashGroup.current) {
      const q = THREE.MathUtils.clamp(s.squash, -0.5, 0.6);
      squashGroup.current.scale.set(1 + q * 0.5, 1 - q, 1 + q * 0.5);
    }

    // flips
    if (flipGroup.current) {
      const fg = flipGroup.current;
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
      const bob = moving ? Math.abs(Math.sin(s.walkPhase)) * 0.06 : Math.sin(time * 2.2) * 0.012;
      const targetPitch = bonking ? 0.35 : airborne ? THREE.MathUtils.clamp(-lv.y * 0.03, -0.35, 0.35) : 0;
      r.body.position.y = bob;
      r.body.position.z = THREE.MathUtils.lerp(r.body.position.z, bonking ? 0.28 : 0, 1 - Math.exp(-25 * dt));
      r.body.rotation.x = THREE.MathUtils.lerp(r.body.rotation.x, targetPitch, 1 - Math.exp(-12 * dt));
      r.body.rotation.z = THREE.MathUtils.lerp(r.body.rotation.z, moving ? -Math.sin(s.walkPhase) * 0.04 : 0, 0.2);
    }

    if (r.head) {
      const bonking = s.bonkTime > 0;
      s.idleTime = hSpeed < 0.3 && s.grounded ? s.idleTime + dt : 0;
      const lookAround = s.idleTime > 2 ? Math.sin(time * 0.9) * 0.5 : 0;
      const targetX = napping ? 0.7 : bonking ? 0.55 : s.noiseTime > 0 ? -0.5 + Math.sin(time * 40) * 0.05 : s.held != null ? 0.15 : 0;
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
      if (s.flopped || s.stunned > 0) target = Math.sin(time * 26 + i * 1.7) * 1.1;
      else if (s.swimming) target = Math.sin(time * 14 + phase) * 0.8;
      else if (airborne) target = front ? -0.9 : 0.8;
      else if (hSpeed > 0.6) target = Math.sin(s.walkPhase + phase) * legAmp;
      else target = 0;
      leg.rotation.x = THREE.MathUtils.lerp(leg.rotation.x, target, 1 - Math.exp(-20 * dt));
    });

    if (r.tail) {
      const wag = species === 'pig' ? 0 : Math.sin(time * (9 + hSpeed)) * (s.noiseTime > 0 || hSpeed > 1 ? 0.8 : 0.35);
      r.tail.rotation.y = wag;
      if (species === 'pig') r.tail.rotation.z += dt * (4 + hSpeed * 2);
    }

    r.ears.forEach((ear, i) => {
      if (!ear) return;
      const flop = THREE.MathUtils.clamp(-lv.y * 0.05, -0.5, 0.5) + Math.sin(s.walkPhase * 2 + i) * 0.12 * Math.min(1, hSpeed / 5);
      ear.rotation.x = THREE.MathUtils.lerp(ear.rotation.x, flop + (s.flopped ? Math.sin(time * 20 + i) : 0), 0.3);
    });

    // googly eyes: pupils slosh around with acceleration
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

    if (r.mud) {
      r.mud.visible = s.mud > 0.02;
      r.mud.scale.setScalar(Math.max(0.001, s.mud));
    }

    // ripples while paddling
    if (s.swimming) {
      s.rippleTimer -= dt;
      if (s.rippleTimer <= 0) {
        s.rippleTimer = hSpeed > 1 ? 0.35 : 0.9;
        ring([t.x, 0.06, t.z], { color: '#d9f3ff', radius: 1.6, duration: 0.9 });
      }
    }

    // ----- world-space helpers: landing shadow, player marker, tongue
    if (shadowRing.current) {
      const sr = shadowRing.current;
      const height = Math.max(0, t.y - RADIUS - s.groundY);
      sr.position.set(t.x, s.groundY + 0.04, t.z);
      sr.scale.setScalar(THREE.MathUtils.clamp(1 - height * 0.04, 0.55, 1));
      sr.visible = hit != null && !s.hidden;
    }
    if (beam.current) {
      const age = (performance.now() - bornAt.current) / 1000;
      const b = beam.current;
      b.visible = age < 2.5;
      if (b.visible) {
        b.position.set(t.x, t.y + 6, t.z);
        (b.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - age / 2.5);
      }
    }
    if (marker.current) {
      const m = marker.current;
      m.visible = players.size > 1 && !s.hidden;
      m.position.set(t.x, t.y + spec.head[1] * MODEL_SCALE + 0.2 + Math.sin(time * 4) * 0.08 + (hat === 'none' ? 0 : 0.4), t.z);
      m.rotation.y += dt * 3;
    }
    if (tongue.current && tongueTip.current) {
      let target: THREE.Vector3 | null = null;
      if (s.held != null) {
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
      tongue.current.visible = show;
      tongueTip.current.visible = show;
      if (show && target) {
        tmp.d.copy(target).sub(tmp.mouth);
        const len = tmp.d.length();
        tongue.current.position.copy(tmp.mouth).addScaledVector(tmp.d, 0.5);
        tmp.q.setFromUnitVectors(UP, tmp.d.normalize());
        tongue.current.quaternion.copy(tmp.q);
        tongue.current.scale.set(1, len, 1);
        tongueTip.current.position.copy(target);
      }
    }
  });

  return (
    <>
      <RigidBody
        ref={body}
        position={[spawn.x, spawn.y, spawn.z]}
        colliders={false}
        enabledRotations={[false, false, false]}
        linearDamping={0}
        angularDamping={1.2}
        ccd
        canSleep={false}
      >
        <BallCollider ref={collider} args={[RADIUS]} friction={0} restitution={0} density={4} />
        <group ref={yawGroup} position={[0, -RADIUS, 0]}>
          <group ref={squashGroup}>
            <group ref={flipGroup} position={[0, 0.6, 0]}>
              <group position={[0, -0.6, 0]} scale={MODEL_SCALE}>
                <AnimalModel key={species} species={species} hat={hat} color={color} rig={rig} />
              </group>
            </group>
          </group>
        </group>
      </RigidBody>

      <mesh ref={shadowRing} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <ringGeometry args={[0.55, 0.78, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} />
      </mesh>
      <mesh ref={beam}>
        <cylinderGeometry args={[0.9, 1.2, 12, 20, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={marker} rotation={[Math.PI, 0, 0]} material={lambert(color)}>
        <coneGeometry args={[0.18, 0.3, 4]} />
      </mesh>
      <mesh ref={tongue} visible={false} material={lambert('#ff6f9c')}>
        <cylinderGeometry args={[0.055, 0.075, 1, 8]} />
      </mesh>
      <mesh ref={tongueTip} visible={false} material={lambert('#ff6f9c')}>
        <sphereGeometry args={[0.1, 10, 8]} />
      </mesh>
    </>
  );
}
