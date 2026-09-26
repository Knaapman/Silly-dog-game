import { CylinderCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { create } from 'zustand';
import { playPop, playSplat, playSquelch, playYuck } from '../audio';
import { POOP_GROUPS } from '../collision';
import { PARTY_POINTS } from '../config';
import { emit, poof } from '../fx';
import { isInPond, type Vec3 } from '../layout';
import { allocPropId, debugInfo, drains, players, props, registerProp, spawners, type PropEntry } from '../runtime';
import { useGame } from '../store';
import { gameClock, gameNow, useGameFrame } from '../clock';

// Poops! They plop out behind an animal that has eaten, get buzzed by flies, can be kicked
// around, make you slip when you run over them, and after a while sprout into a flower.

const MAX_POOPS = 24;
const SPROUT_AFTER = 35;
const FLOWER_SLOTS = 48;
const FLIES_PER_POOP = 2;

type PoopData = { id: number; position: Vec3; velocity: Vec3; size: number; golden: boolean; yaw: number };
type Flower = { x: number; z: number; color: string; born: number };

let nextPoopId = 1;
/** Poops that should turn into a flower right now (too many of them around). */
const sproutNow = new Set<number>();
/** Live bodies, for the flies. */
const live = new Map<number, { body: () => RapierRigidBody | null; size: number; golden: boolean }>();

const usePoops = create<{
  poops: PoopData[];
  flowers: (Flower | null)[];
  nextFlower: number;
  add: (p: Omit<PoopData, 'id'>) => void;
  remove: (id: number) => void;
  plant: (x: number, z: number) => void;
  clear: () => void;
}>((set, get) => ({
  poops: [],
  flowers: Array.from({ length: FLOWER_SLOTS }, () => null),
  nextFlower: 0,
  add: (p) => {
    const poops = get().poops;
    // Too many: the oldest ones that aren't already sprouting turn into flowers.
    const over = poops.length - sproutNow.size - (MAX_POOPS - 1);
    for (let i = 0, n = 0; i < poops.length && n < over; i += 1) {
      if (sproutNow.has(poops[i].id)) continue;
      sproutNow.add(poops[i].id);
      n += 1;
    }
    set({ poops: [...poops, { ...p, id: nextPoopId++ }] });
  },
  remove: (id) => {
    sproutNow.delete(id);
    set((s) => ({ poops: s.poops.filter((p) => p.id !== id) }));
  },
  plant: (x, z) =>
    set((s) => {
      const flowers = s.flowers.slice();
      flowers[s.nextFlower] = { x, z, color: FLOWER_COLORS[Math.floor(Math.random() * FLOWER_COLORS.length)], born: gameNow() };
      return { flowers, nextFlower: (s.nextFlower + 1) % FLOWER_SLOTS };
    }),
  clear: () => {
    sproutNow.clear();
    set({ poops: [], flowers: Array.from({ length: FLOWER_SLOTS }, () => null), nextFlower: 0 });
  }
}));

const FLOWER_COLORS = ['#ff4d8d', '#ffd23f', '#a855f7', '#3b82f6', '#ff8a3d', '#ffffff'];

// ---------------------------------------------------------------------------
// The poop itself: a swirl with googly eyes and a smile, one merged mesh.

function coloured(g: THREE.BufferGeometry, color: string, matrix: THREE.Matrix4) {
  g.applyMatrix4(matrix);
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

const m4 = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(sx, sy, sz));

const geometryCache = new Map<string, THREE.BufferGeometry>();
/** Base sits at y = 0, about 0.5 tall at size 1. */
function poopGeometry(golden: boolean) {
  const key = golden ? 'gold' : 'brown';
  let geo = geometryCache.get(key);
  if (geo) return geo;
  const body = golden ? '#ffc933' : '#7a4a2b';
  const body2 = golden ? '#ffd966' : '#8d5a36';
  const parts = [
    coloured(new THREE.SphereGeometry(0.24, 16, 10), body, m4(0, 0.12, 0, 1, 0.55, 1)),
    coloured(new THREE.SphereGeometry(0.18, 14, 9), body2, m4(0, 0.25, 0, 1, 0.62, 1)),
    coloured(new THREE.SphereGeometry(0.12, 12, 8), body, m4(0, 0.36, 0, 1, 0.7, 1)),
    coloured(new THREE.ConeGeometry(0.07, 0.15, 10), body2, m4(0.01, 0.46, 0, 1, 1, 1, 0, -0.35)),
    // eyes
    coloured(new THREE.SphereGeometry(0.05, 10, 8), '#ffffff', m4(-0.07, 0.27, 0.14)),
    coloured(new THREE.SphereGeometry(0.05, 10, 8), '#ffffff', m4(0.07, 0.27, 0.14)),
    coloured(new THREE.SphereGeometry(0.025, 8, 6), '#1a1a1a', m4(-0.065, 0.27, 0.185)),
    coloured(new THREE.SphereGeometry(0.025, 8, 6), '#1a1a1a', m4(0.075, 0.27, 0.185)),
    // smile (half a torus, bowl side down)
    coloured(new THREE.TorusGeometry(0.06, 0.014, 6, 12, Math.PI), '#3b1f0f', m4(0, 0.2, 0.2, 1, 1, 1, 0, Math.PI))
  ];
  geo = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  geometryCache.set(key, geo);
  return geo;
}

const materials = {
  brown: new THREE.MeshLambertMaterial({ vertexColors: true }),
  gold: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.55, roughness: 0.28, emissive: new THREE.Color('#5a3b00') })
};

const tmp = new THREE.Vector3();

const Poop = memo(function Poop({ data }: { data: PoopData }) {
  const { id, size, golden } = data;
  const body = useRef<RapierRigidBody>(null);
  const propId = useMemo(() => allocPropId(), []);
  const born = useRef(gameNow());
  const lastSpeed = useRef(0);
  const stink = useRef(Math.random() * 1.5);
  const gone = useRef(false);

  const finish = (how: 'splat' | 'sprout' | 'flush' | 'quiet') => {
    if (gone.current) return;
    gone.current = true;
    const rb = body.current;
    if (rb) {
      const p = rb.translation();
      if (how === 'splat') {
        emit('chunk', [p.x, p.y, p.z], { count: 14, color: golden ? ['#ffd23f', '#fff3a8'] : ['#7a4a2b', '#5d3a22', '#8d5a36'], speed: 4, up: 4, size: 0.12 });
        playSplat(p);
      } else if (how === 'flush') {
        emit('drop', [p.x, p.y, p.z], { count: 10, color: ['#7fd3ff', '#ffffff'], speed: 2, up: 2, size: 0.12 });
      } else if (how === 'sprout') {
        const onGround = p.y < 1.2 && !isInPond(p.x, p.z) && Math.abs(p.x) < 60 && Math.abs(p.z) < 60;
        if (onGround) usePoops.getState().plant(p.x, p.z);
        poof([p.x, p.y + 0.2, p.z], onGround ? '#b6f5a8' : '#ffffff', 10);
        playPop(p);
      }
    }
    usePoops.getState().remove(id);
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    const rb = body.current;
    rb?.setLinvel({ x: data.velocity[0], y: data.velocity[1], z: data.velocity[2] }, true);
    rb?.setAngvel({ x: 0, y: (Math.random() - 0.5) * 3, z: 0 }, true);
    const entry: PropEntry = {
      id: propId,
      kind: 'poop',
      getBody: () => body.current,
      radius: 0.26 * size,
      launch: 11,
      heavy: false,
      grabbable: true,
      enabled: true,
      heldBy: null,
      onBonk: () => playSquelch(body.current?.translation()),
      // Licking a poop: BLEH! It gets flicked away, and nobody carries it around.
      onGrab: (slot) => {
        const rb2 = body.current;
        const licker = players.get(slot);
        if (rb2 && licker) {
          const p = rb2.translation();
          playYuck(p);
          emit('puff', [p.x, p.y + 0.4, p.z], { count: 8, color: ['#b5e48c', '#99d98c', '#d9ed92'], speed: 1.5, up: 1.5, size: 0.35 });
          tmp.set(p.x - licker.position.x, 0, p.z - licker.position.z).normalize();
          rb2.setLinvel({ x: tmp.x * 4, y: 3, z: tmp.z * 4 }, true);
        }
        return false;
      }
    };
    const unregister = registerProp(entry);
    live.set(id, { body: () => body.current, size, golden });
    return () => {
      unregister();
      live.delete(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useGameFrame((_, delta) => {
    const rb = body.current;
    if (!rb || gone.current) return;
    const age = (gameNow() - born.current) / 1000;
    const p = rb.translation();
    if (p.y < -10) return finishRef.current('quiet');
    if (age > SPROUT_AFTER || sproutNow.has(id)) return finishRef.current('sprout');
    // A flushing toilet sucks nearby poops over the rim, swirls them round and down the drain.
    const now = gameNow();
    for (const d of drains) {
      if (now > d.flushingUntil) continue;
      const dx = p.x - d.x;
      const dz = p.z - d.z;
      const dist = Math.hypot(dx, dz);
      if (dist > d.radius + 1.2 || p.y < -0.5 || p.y > d.top + 1.6) continue;
      const inside = dist < d.radius && p.y > d.top - 0.3;
      rb.setLinvel({ x: -dz * 5 - dx * 4, y: inside ? -1 : 3, z: dx * 5 - dz * 4 }, true);
      if (inside && d.flushingUntil - now < 1100) return finishRef.current('flush');
    }

    // A hard landing (kicked high, dropped from the ferris wheel...) splats it.
    const v = rb.linvel();
    const speed = Math.hypot(v.x, v.y, v.z);
    if (age > 0.3 && lastSpeed.current > 9 && speed < lastSpeed.current * 0.45) {
      useGame.getState().addParty(PARTY_POINTS.splat);
      return finishRef.current('splat');
    }
    lastSpeed.current = speed;

    // Stink lines (or sparkles for a golden one).
    stink.current -= delta;
    if (stink.current <= 0) {
      stink.current = golden ? 0.5 : 2.2 + Math.random();
      if (golden) emit('star', [p.x, p.y + 0.3 * size, p.z], { count: 2, color: ['#ffd23f', '#ffffff'], speed: 1.2, up: 1.5, size: 0.12 });
      else emit('puff', [p.x, p.y + 0.45 * size, p.z], { count: 2, color: ['#8bc34a', '#aed581'], speed: 0.3, up: 1, size: 0.09, life: 1.1 });
    }

    // Running over a poop: whoops! Slip, flip, squish.
    if (age < 1) return;
    for (const pl of players.values()) {
      if (pl.asleep || pl.isLaunched()) continue;
      const pp = pl.position;
      const pv = pl.velocity;
      if (Math.abs(pp.y - p.y) > 0.9) continue;
      if (Math.hypot(pv.x, pv.z) < 2.2 || Math.abs(pv.y) > 2.5) continue;
      // Distance from the poop to the path the animal ran along since the last frame, so a
      // fast runner on a slow tablet can't skip over it. (Animals pass through poops.)
      const ax = pp.x - pv.x * delta;
      const az = pp.z - pv.z * delta;
      const dx = pp.x - ax;
      const dz = pp.z - az;
      const len2 = dx * dx + dz * dz || 1;
      const k = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / len2));
      if (Math.hypot(p.x - ax - dx * k, p.z - az - dz * k) > 0.45 + 0.24 * size) continue;
      pl.hop(6.5);
      playSquelch(pp);
      useGame.getState().addParty(PARTY_POINTS.bonk);
      return finishRef.current('splat');
    }
  });

  return (
    // Only spins around its up axis: a poop always lands swirl-up with its face showing.
    <RigidBody ref={body} position={data.position} rotation={[0, data.yaw, 0]} colliders={false} linearDamping={0.6} angularDamping={1.5} enabledRotations={[false, true, false]}>
      <CylinderCollider args={[0.2 * size, 0.24 * size]} friction={1.2} restitution={0.1} density={1.2} collisionGroups={POOP_GROUPS} />
      <mesh geometry={poopGeometry(golden)} material={golden ? materials.gold : materials.brown} castShadow position={[0, -0.2 * size, 0]} scale={size} />
    </RigidBody>
  );
});

// ---------------------------------------------------------------------------
// Flies buzzing around every (non-golden) poop: one instanced mesh for all of them.

function Flies() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useGameFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const t = gameClock.time;
    let i = 0;
    live.forEach((poop, id) => {
      const rb = poop.body();
      if (!rb || poop.golden) return;
      const p = rb.translation();
      for (let k = 0; k < FLIES_PER_POOP && i < m.count; k += 1) {
        const a = t * (5 + k) + k * Math.PI + id;
        const r = 0.32 * poop.size + Math.sin(t * 3 + id + k) * 0.08;
        dummy.position.set(p.x + Math.cos(a) * r, p.y + 0.45 * poop.size + Math.sin(t * 11 + k * 2 + id) * 0.08, p.z + Math.sin(a) * r);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        i += 1;
      }
    });
    dummy.position.set(0, -50, 0);
    dummy.updateMatrix();
    for (let j = i; j < m.count; j += 1) m.setMatrixAt(j, dummy.matrix);
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, (MAX_POOPS + 4) * FLIES_PER_POOP]} frustumCulled={false}>
      <sphereGeometry args={[0.035, 6, 4]} />
      <meshBasicMaterial color="#1a1a1a" />
    </instancedMesh>
  );
}

// ---------------------------------------------------------------------------
// Flowers that grew where a poop used to be.

function Garden() {
  const flowers = usePoops((s) => s.flowers);
  const stems = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    const h = heads.current;
    if (!h) return;
    flowers.forEach((f, i) => {
      if (f) h.setColorAt(i, color.set(f.color));
    });
    if (h.instanceColor) h.instanceColor.needsUpdate = true;
  }, [flowers, color]);

  // Grow in over half a second, then gently sway.
  useGameFrame(() => {
    const s = stems.current;
    const h = heads.current;
    if (!s || !h) return;
    const now = gameNow();
    flowers.forEach((f, i) => {
      if (!f) {
        dummy.position.set(0, -50, 0);
        dummy.scale.setScalar(0.001);
      } else {
        const grow = Math.min(1, (now - f.born) / 600);
        const k = grow < 1 ? grow * (1.6 - 0.6 * grow) : 1;
        dummy.position.set(f.x, 0, f.z);
        dummy.rotation.set(Math.sin(gameClock.time * 1.5 + i) * 0.08, i, 0);
        dummy.scale.setScalar(Math.max(0.001, k * 1.3));
      }
      dummy.updateMatrix();
      s.setMatrixAt(i, dummy.matrix);
      h.setMatrixAt(i, dummy.matrix);
    });
    s.instanceMatrix.needsUpdate = true;
    h.instanceMatrix.needsUpdate = true;
  });

  const stemGeo = useMemo(() => new THREE.CylinderGeometry(0.03, 0.04, 0.5, 5).translate(0, 0.25, 0), []);
  const headGeo = useMemo(() => new THREE.IcosahedronGeometry(0.16, 0).scale(1, 0.55, 1).translate(0, 0.56, 0), []);
  return (
    <group>
      <instancedMesh ref={stems} args={[stemGeo, undefined, FLOWER_SLOTS]} frustumCulled={false}>
        <meshLambertMaterial color="#3f9b3a" />
      </instancedMesh>
      <instancedMesh ref={heads} args={[headGeo, undefined, FLOWER_SLOTS]} frustumCulled={false}>
        <meshLambertMaterial color="#ffffff" />
      </instancedMesh>
    </group>
  );
}

// ---------------------------------------------------------------------------

export function Poops() {
  const poops = usePoops((s) => s.poops);
  const resetToken = useGame((s) => s.resetToken);

  useEffect(() => {
    spawners.poop = (position, velocity, size, golden) =>
      usePoops.getState().add({
        position: [position.x, position.y, position.z],
        velocity: [velocity.x, velocity.y, velocity.z],
        size,
        golden,
        yaw: Math.random() * Math.PI * 2
      });
    debugInfo.poopStats = poopStats;
    return () => {
      spawners.poop = () => {};
    };
  }, []);

  // "Tidy up the park" / the big red button: all gone.
  const firstReset = useRef(resetToken);
  useEffect(() => {
    if (resetToken !== firstReset.current) usePoops.getState().clear();
  }, [resetToken]);

  return (
    <group>
      {poops.map((p) => (
        <Poop key={p.id} data={p} />
      ))}
      <Flies />
      <Garden />
    </group>
  );
}

/** For automated checks: how many poops / flowers exist right now. */
export function poopStats() {
  let entries = 0;
  props.forEach((p) => {
    if (p.kind === 'poop') entries += 1;
  });
  return { poops: usePoops.getState().poops.length, entries, flowers: usePoops.getState().flowers.filter(Boolean).length };
}
