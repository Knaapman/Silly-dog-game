import { BallCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { create } from 'zustand';
import { playCheer, playCollect, playFanfare, playPop, playRainPatter, playSplash, playSquawk } from '../audio';
import { gameClock, gameNow, useGameFrame } from '../clock';
import { PARTY_POINTS, WORLD_HALF } from '../config';
import { burstConfetti, emit, poof, ring } from '../fx';
import { distXZ, isInPond } from '../layout';
import { lambert } from '../materials';
import { camera, players, playersCentroid, registerFood, type PlayerRuntime } from '../runtime';
import { settings } from '../settings';
import { earnSticker } from '../stickers';
import { groundHeight } from '../terrain';
import { useGame } from '../store';
import { TEST_MODE } from '../testMode';

// Park surprises: now and then something happens that pulls everybody somewhere new, with no
// words needed: a golden chicken to chase, a present floating by on a balloon, or a rain
// shower with puddles to jump in (and a rainbow after).

export type EventKind = 'chicken' | 'present' | 'rain';
export const EVENT_ICON: Record<EventKind, string> = { chicken: '🐔', present: '🎁', rain: '☔' };
const KINDS: EventKind[] = ['chicken', 'present', 'rain'];

/** Seconds of play before the first surprise, and between surprises. */
const FIRST_AFTER = 60;
const GAP = [70, 110] as const;
const CHICKEN_TIME = 40;
const PRESENT_TIME = 45;
const RAIN_TIME = 40;
const DRY_TIME = 12;
export const RAINBOW_TIME = 25;

type EventStore = {
  kind: EventKind | null;
  /** Game ms the current surprise started. */
  startedAt: number;
  /** Game ms the next surprise is due (null until play starts). */
  next: number | null;
  rainbowUntil: number;
  start: (kind: EventKind) => void;
  end: () => void;
};

export const useEvents = create<EventStore>((set) => ({
  kind: null,
  startedAt: 0,
  next: null,
  rainbowUntil: 0,
  start: (kind) => set({ kind, startedAt: gameNow() }),
  end: () => set({ kind: null, next: gameNow() + (GAP[0] + Math.random() * (GAP[1] - GAP[0])) * 1000 })
}));

/** Non-reactive state other parts of the game read every frame. */
export const weather = { rain: 0 };
/** Where the current surprise is (for tests and the camera-free hint). */
export const eventSpot = { chicken: new THREE.Vector3(), present: new THREE.Vector3(), puddles: [] as THREE.Vector3[] };

const tmp = new THREE.Vector3();

/** A point `dist` away from the players (or the plaza), inside the park and not in the lake. */
function spotNearPlayers(dist: number, out: THREE.Vector3) {
  if (playersCentroid(out) === 0) out.set(0, 0, 4);
  const lim = WORLD_HALF - 8;
  for (let tries = 0; tries < 12; tries += 1) {
    const a = Math.random() * Math.PI * 2;
    const x = THREE.MathUtils.clamp(out.x + Math.cos(a) * dist, -lim, lim);
    const z = THREE.MathUtils.clamp(out.z + Math.sin(a) * dist, -lim, lim);
    if (!isInPond(x, z)) return out.set(x, groundHeight(x, z), z);
  }
  return out.set(0, 0, 8);
}

function nearestPlayer(x: number, z: number) {
  let best: PlayerRuntime | null = null;
  let bestD = Infinity;
  players.forEach((p) => {
    if (p.asleep) return;
    const d = distXZ(p.position.x, p.position.z, x, z);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  });
  return { player: best as PlayerRuntime | null, dist: bestD };
}

// ---------------------------------------------------------------------------
// The runaway golden chicken

function GoldenChicken() {
  const body = useRef<RapierRigidBody>(null);
  const yaw = useRef<THREE.Group>(null);
  const wings = useRef<(THREE.Group | null)[]>([]);
  const start = useMemo(() => {
    const at = spotNearPlayers(12, new THREE.Vector3()).setY(1.5);
    eventSpot.chicken.copy(at);
    return at;
  }, []);
  const st = useRef({ facing: Math.random() * Math.PI * 2, done: false, squawk: 0, sparkle: 0, flap: 0 });
  const startedAt = useEvents((s) => s.startedAt);

  const finish = (caughtBy: PlayerRuntime | null) => {
    const s = st.current;
    if (s.done) return;
    s.done = true;
    const p = eventSpot.chicken;
    if (caughtBy) {
      burstConfetti([p.x, p.y + 0.8, p.z], 80, 8);
      emit('feather', [p.x, p.y + 0.5, p.z], { count: 20, color: ['#ffd23f', '#fff3a8'], speed: 4, up: 4 });
      ring([p.x, p.y, p.z], { color: '#ffd23f', radius: 3.5, duration: 0.6 });
      playCollect(p);
      playCheer();
      caughtBy.hop(10);
      useGame.getState().addParty(PARTY_POINTS.star * 2);
      earnSticker('chicken');
    } else {
      // got away: flaps off into the sky
      poof([p.x, p.y, p.z], '#ffd23f', 18);
      playSquawk(p);
    }
    useEvents.getState().end();
  };

  // licking it counts as catching it
  useEffect(() => {
    const food = registerFood({ position: eventSpot.chicken, radius: 0.45, enabled: true, eat: (slot) => finish(players.get(slot) ?? null) });
    return food.unregister;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useGameFrame((_, dt) => {
    const rb = body.current;
    const s = st.current;
    if (!rb || s.done) return;
    const t = rb.translation();
    eventSpot.chicken.set(t.x, t.y, t.z);
    const age = (gameNow() - startedAt) / 1000;
    const { player, dist } = nearestPlayer(t.x, t.z);
    if (player && dist < 1.25 && Math.abs(player.position.y - t.y) < 1.6) return finish(player);
    if (age > CHICKEN_TIME) return finish(null);

    // run away from whoever is closest, zig-zagging; wander when nobody is near
    const fleeing = !!player && dist < 10;
    let dx: number;
    let dz: number;
    if (fleeing && player) {
      const ax = t.x - player.position.x;
      const az = t.z - player.position.z;
      const l = Math.hypot(ax, az) || 1;
      const zig = Math.sin(gameClock.time * 3.2) * 0.7;
      dx = ax / l - (az / l) * zig;
      dz = az / l + (ax / l) * zig;
    } else {
      dx = Math.sin(s.facing + Math.sin(gameClock.time * 0.7));
      dz = Math.cos(s.facing + Math.sin(gameClock.time * 0.7));
    }
    // stay in the park and out of the lake
    const lim = WORLD_HALF - 8;
    if (Math.abs(t.x) > lim) dx -= Math.sign(t.x) * 2;
    if (Math.abs(t.z) > lim) dz -= Math.sign(t.z) * 2;
    if (isInPond(t.x + dx * 2.5, t.z + dz * 2.5)) {
      const ox = dx;
      dx = -dz;
      dz = ox;
    }
    const target = Math.atan2(dx, dz);
    let d = target - s.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    s.facing += d * (1 - Math.exp(-8 * dt));
    // it gets tired after a while, so small legs can catch it
    const speed = fleeing ? THREE.MathUtils.lerp(6.2, 4.2, THREE.MathUtils.clamp((age - 12) / 15, 0, 1)) : 2.2;
    const v = rb.linvel();
    rb.setLinvel({ x: Math.sin(s.facing) * speed, y: v.y, z: Math.cos(s.facing) * speed }, true);

    s.squawk -= dt;
    if (fleeing && s.squawk <= 0) {
      s.squawk = 1.2 + Math.random();
      playSquawk(t);
    }
    s.sparkle -= dt;
    if (s.sparkle <= 0) {
      s.sparkle = 0.12;
      emit('star', [t.x, t.y + 0.2, t.z], { count: 1, color: ['#ffd23f', '#fff3a8'], speed: 0.5, up: 1, size: 0.1, life: 0.7 });
    }
    s.flap += dt * (fleeing ? 30 : 8);
    if (yaw.current) {
      yaw.current.rotation.y = s.facing;
      yaw.current.position.y = -0.35 + Math.abs(Math.sin(s.flap * 0.5)) * (fleeing ? 0.15 : 0.04);
    }
    wings.current.forEach((w, i) => {
      if (w) w.rotation.z = (i === 0 ? 1 : -1) * (fleeing ? 0.4 + Math.sin(s.flap) * 0.6 : 0.1);
    });
  });

  const gold = '#ffc93c';
  return (
    <RigidBody ref={body} position={[start.x, start.y, start.z]} colliders={false} enabledRotations={[false, false, false]} canSleep={false} linearDamping={0.5}>
      <BallCollider args={[0.35]} friction={0} density={0.6} />
      <group ref={yaw}>
        <mesh castShadow position={[0, 0.35, 0]} scale={[1, 0.9, 1.2]} material={lambert(gold)}>
          <sphereGeometry args={[0.32, 14, 10]} />
        </mesh>
        <mesh castShadow position={[0, 0.72, 0.2]} material={lambert(gold)}>
          <sphereGeometry args={[0.18, 12, 10]} />
        </mesh>
        <mesh position={[0, 0.92, 0.2]} material={lambert('#ff4d5e')} scale={[0.5, 1, 1.2]}>
          <sphereGeometry args={[0.09, 8, 6]} />
        </mesh>
        <mesh position={[0, 0.7, 0.4]} rotation={[Math.PI / 2, 0, 0]} material={lambert('#ff9f1c')}>
          <coneGeometry args={[0.05, 0.14, 6]} />
        </mesh>
        {[-1, 1].map((sx) => (
          <mesh key={sx} position={[sx * 0.08, 0.77, 0.34]} material={lambert('#111111')}>
            <sphereGeometry args={[0.03, 8, 6]} />
          </mesh>
        ))}
        {[-1, 1].map((sx, i) => (
          <group
            key={`w${sx}`}
            position={[sx * 0.3, 0.42, -0.02]}
            ref={(g) => {
              wings.current[i] = g;
            }}
          >
            <mesh position={[sx * 0.08, 0, 0]} scale={[0.35, 0.7, 1]} material={lambert('#ffb020')}>
              <sphereGeometry args={[0.22, 10, 8]} />
            </mesh>
          </group>
        ))}
        {[-1, 1].map((sx) => (
          <mesh key={`l${sx}`} position={[sx * 0.1, 0.02, 0.02]} material={lambert('#ff9f1c')}>
            <cylinderGeometry args={[0.025, 0.025, 0.14, 6]} />
          </mesh>
        ))}
      </group>
    </RigidBody>
  );
}

// ---------------------------------------------------------------------------
// A present floating by on a balloon

function PresentBalloon() {
  const group = useRef<THREE.Group>(null);
  const balloon = useRef<THREE.Group>(null);
  const pos = useMemo(() => {
    const at = spotNearPlayers(22, new THREE.Vector3());
    at.y += 2.3;
    eventSpot.present.copy(at);
    return at;
  }, []);
  const startedAt = useEvents((s) => s.startedAt);
  const st = useRef({ angle: Math.random() * Math.PI * 2, done: false, leaving: false });
  const color = useMemo(() => ['#ff4d5e', '#3b82f6', '#a855f7', '#22c55e'][Math.floor(Math.random() * 4)], []);

  const burst = (by: PlayerRuntime | null) => {
    const s = st.current;
    if (s.done || s.leaving) return;
    s.done = true;
    const p = eventSpot.present;
    burstConfetti([p.x, p.y + 0.5, p.z], 120, 9);
    emit('star', [p.x, p.y, p.z], { count: 30, color: ['#ffd23f', '#ffffff', color], speed: 7, up: 5 });
    ring([p.x, p.y, p.z], { color: '#ffd23f', radius: 4, duration: 0.6 });
    playPop(p);
    playFanfare();
    // a new hat for everybody!
    useGame.getState().players.forEach((pl) => useGame.getState().randomHat(pl.slot));
    players.forEach((pl) => pl.hop(9));
    by?.hop(11);
    useGame.getState().addParty(PARTY_POINTS.star * 2);
    earnSticker('present');
    useEvents.getState().end();
  };

  useEffect(() => {
    const food = registerFood({ position: eventSpot.present, radius: 0.6, enabled: true, eat: (slot) => burst(players.get(slot) ?? null) });
    return food.unregister;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useGameFrame((_, dt) => {
    const s = st.current;
    if (s.done) return;
    const age = (gameNow() - startedAt) / 1000;
    if (age > PRESENT_TIME) s.leaving = true;
    if (s.leaving) {
      pos.y += dt * 3;
      if (pos.y > 30) {
        s.done = true;
        useEvents.getState().end();
      }
    } else {
      // drift over to the players and slowly circle around them
      s.angle += dt * 0.25;
      if (playersCentroid(tmp) === 0) tmp.set(0, 0, 4);
      tmp.x += Math.cos(s.angle) * 5;
      tmp.z += Math.sin(s.angle) * 5;
      const dx = tmp.x - pos.x;
      const dz = tmp.z - pos.z;
      const d = Math.hypot(dx, dz);
      const step = Math.min(d, dt * 3.5);
      if (d > 0.01) {
        pos.x += (dx / d) * step;
        pos.z += (dz / d) * step;
      }
      pos.y = groundHeight(pos.x, pos.z) + 2.3 + Math.sin(gameClock.time * 1.6) * 0.25;
      players.forEach((p) => {
        if (p.position.distanceTo(pos) < 1.35) burst(p);
      });
    }
    eventSpot.present.copy(pos);
    if (group.current) {
      group.current.position.copy(pos);
      group.current.rotation.y = Math.sin(gameClock.time * 0.8) * 0.4;
    }
    if (balloon.current) balloon.current.rotation.z = Math.sin(gameClock.time * 1.3) * 0.12;
  });

  return (
    <group ref={group} position={pos}>
      {/* the present */}
      <mesh castShadow material={lambert('#ffd23f')}>
        <boxGeometry args={[0.9, 0.9, 0.9]} />
      </mesh>
      <mesh material={lambert(color)}>
        <boxGeometry args={[0.92, 0.92, 0.22]} />
      </mesh>
      <mesh material={lambert(color)}>
        <boxGeometry args={[0.22, 0.92, 0.92]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.18, 0.55, 0]} rotation={[Math.PI / 2, s * 0.5, 0]} material={lambert(color)}>
          <torusGeometry args={[0.15, 0.05, 8, 16]} />
        </mesh>
      ))}
      {/* the string and the balloon */}
      <group ref={balloon}>
        <mesh position={[0, 1.6, 0]} material={lambert('#ffffff')}>
          <cylinderGeometry args={[0.012, 0.012, 2.3, 4]} />
        </mesh>
        <mesh castShadow position={[0, 3.6, 0]} scale={[1, 1.15, 1]} material={lambert(color)}>
          <sphereGeometry args={[1.1, 20, 16]} />
        </mesh>
        <mesh position={[0, 2.35, 0]} material={lambert(color)}>
          <coneGeometry args={[0.14, 0.2, 8]} />
        </mesh>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Rain, puddles, and a rainbow after

const DROPS = 500;

type Puddle = { pos: THREE.Vector3; r: number; cool: number; step: number };

function RainShower() {
  const { world, rapier } = useRapier();
  const drops = useRef<THREE.InstancedMesh>(null);
  const puddleMeshes = useRef<(THREE.Mesh | null)[]>([]);
  const startedAt = useEvents((s) => s.startedAt);
  const st = useRef({ patter: 0, rainbowShown: false });
  const dropPos = useMemo(() => {
    const a = new Float32Array(DROPS * 3);
    for (let i = 0; i < DROPS; i += 1) {
      a[i * 3] = (Math.random() - 0.5) * 44;
      a[i * 3 + 1] = Math.random() * 16;
      a[i * 3 + 2] = (Math.random() - 0.5) * 32;
    }
    return a;
  }, []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // puddles on low, flat ground around the players
  const puddles = useMemo<Puddle[]>(() => {
    const out: Puddle[] = [];
    const ray = new rapier.Ray({ x: 0, y: 20, z: 0 }, { x: 0, y: -1, z: 0 });
    for (let tries = 0; tries < 40 && out.length < 6; tries += 1) {
      const spot = spotNearPlayers(3 + Math.random() * 9, new THREE.Vector3());
      ray.origin = { x: spot.x, y: 20, z: spot.z };
      const hit = world.castRay(ray, 40, true);
      if (!hit) continue;
      const y = 20 - hit.timeOfImpact;
      const fixed = hit.collider.parent()?.isFixed() ?? true;
      if (!fixed || y > 0.6 || out.some((p) => distXZ(p.pos.x, p.pos.z, spot.x, spot.z) < 3.5)) continue;
      out.push({ pos: new THREE.Vector3(spot.x, y + 0.03, spot.z), r: 1.1 + Math.random() * 0.6, cool: 0, step: 0 });
    }
    return out;
  }, [world, rapier]);

  // (published from an effect, so React's development double-mount can't leave it empty)
  useEffect(() => {
    eventSpot.puddles = puddles.map((p) => p.pos);
    return () => {
      weather.rain = 0;
      eventSpot.puddles = [];
    };
  }, [puddles]);

  useGameFrame((_, dt) => {
    const age = (gameNow() - startedAt) / 1000;
    // clouds in, rain, clouds out, puddles dry up
    const rain = age < 3 ? age / 3 : age < RAIN_TIME - 4 ? 1 : Math.max(0, (RAIN_TIME - age) / 4);
    weather.rain = rain;
    const wet = age < RAIN_TIME ? Math.min(1, age / 6) : Math.max(0, 1 - (age - RAIN_TIME) / DRY_TIME);
    if (age >= RAIN_TIME && !st.current.rainbowShown) {
      st.current.rainbowShown = true;
      useEvents.setState({ rainbowUntil: gameNow() + RAINBOW_TIME * 1000 });
      earnSticker('rainbow');
    }
    if (age >= RAIN_TIME + DRY_TIME) {
      useEvents.getState().end();
      return;
    }

    // falling rain around the camera's focus
    const m = drops.current;
    if (m) {
      const f = camera.focus;
      const shown = Math.floor(DROPS * rain);
      for (let i = 0; i < shown; i += 1) {
        let y = dropPos[i * 3 + 1] - dt * 18;
        if (y < 0) {
          y += 16;
          dropPos[i * 3] = (Math.random() - 0.5) * 44;
          dropPos[i * 3 + 2] = (Math.random() - 0.5) * 32;
        }
        dropPos[i * 3 + 1] = y;
        dummy.position.set(f.x + dropPos[i * 3], y, f.z + dropPos[i * 3 + 2]);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      }
      m.count = shown;
      m.instanceMatrix.needsUpdate = true;
    }
    st.current.patter -= dt;
    if (rain > 0.2 && st.current.patter <= 0) {
      st.current.patter = 0.22;
      playRainPatter(rain);
    }

    // puddles: jump in for a big splash, run through for little ones
    puddles.forEach((pd, i) => {
      const mesh = puddleMeshes.current[i];
      if (mesh) {
        mesh.visible = wet > 0.02;
        mesh.scale.setScalar(Math.max(0.01, wet));
      }
      pd.cool -= dt;
      pd.step -= dt;
      if (wet < 0.3) return;
      players.forEach((p) => {
        if (distXZ(p.position.x, p.position.z, pd.pos.x, pd.pos.z) > pd.r * wet || p.position.y > pd.pos.y + 1.2) return;
        if (p.velocity.y < -3 && pd.cool <= 0) {
          pd.cool = 0.6;
          emit('drop', [pd.pos.x, pd.pos.y + 0.2, pd.pos.z], { count: 36, color: ['#7fd3ff', '#bfe9ff', '#ffffff'], speed: 5, up: 8 });
          ring([pd.pos.x, pd.pos.y + 0.02, pd.pos.z], { color: '#d9f3ff', radius: 2.6, duration: 0.5 });
          playSplash(p.position);
          useGame.getState().addParty(PARTY_POINTS.splash * 2);
          earnSticker('puddle');
        } else if (Math.hypot(p.velocity.x, p.velocity.z) > 3 && pd.step <= 0) {
          pd.step = 0.15;
          emit('drop', [p.position.x, pd.pos.y + 0.1, p.position.z], { count: 4, color: ['#7fd3ff', '#ffffff'], speed: 2, up: 3 });
        }
      });
    });
  });

  return (
    <>
      <instancedMesh ref={drops} args={[undefined, undefined, DROPS]} frustumCulled={false}>
        <boxGeometry args={[0.03, 0.55, 0.03]} />
        <meshBasicMaterial color="#cfe9ff" transparent opacity={0.6} />
      </instancedMesh>
      {puddles.map((pd, i) => (
        <mesh
          key={i}
          ref={(m) => {
            puddleMeshes.current[i] = m;
          }}
          position={pd.pos}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={1}
        >
          <circleGeometry args={[pd.r, 28]} />
          <meshLambertMaterial color="#5aa8e6" transparent opacity={0.75} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------

/** Starts a surprise now and then (never on its own in test mode: tests start them). */
export function ParkEvents() {
  const kind = useEvents((s) => s.kind);
  const startedAt = useEvents((s) => s.startedAt);
  const order = useRef(0);
  useGameFrame(() => {
    const game = useGame.getState();
    const ev = useEvents.getState();
    // back on the title screen: whatever was going on stops
    if (game.phase !== 'play') {
      if (ev.kind) ev.end();
      return;
    }
    if (TEST_MODE) return;
    const now = gameNow();
    if (ev.next == null) {
      useEvents.setState({ next: now + FIRST_AFTER * 1000 });
      return;
    }
    if (ev.kind || now < ev.next || players.size === 0) return;
    if (!settings().surprises) {
      useEvents.setState({ next: now + 10_000 });
      return;
    }
    // take turns, starting somewhere random
    if (order.current === 0) order.current = Math.floor(Math.random() * KINDS.length) + 1;
    ev.start(KINDS[order.current++ % KINDS.length]);
  });
  // (keyed by start time, so a new surprise of the same kind starts fresh)
  return (
    <>
      {kind === 'chicken' && <GoldenChicken key={startedAt} />}
      {kind === 'present' && <PresentBalloon key={startedAt} />}
      {kind === 'rain' && <RainShower key={startedAt} />}
    </>
  );
}
