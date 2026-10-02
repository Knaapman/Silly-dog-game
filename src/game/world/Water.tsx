import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GRAVITY, WORLD_HALF_X, WORLD_HALF_Z } from '../config';
import { playSplash } from '../audio';
import { emit, ring } from '../fx';
import { RIVER, RIVER_HALF_WIDTH, SEA, WATER_LEVEL } from '../layout';
import { lambert } from '../materials';
import { props } from '../runtime';
import { isInWater, waterLevelAt } from '../terrain';
import { gameClock, useGameFrame } from '../clock';
import { nearAnyCamera } from '../views';

// The water: one big sheet at WATER_LEVEL (the sea, the lagoon and the river all show through
// wherever the ground is cut below it), the stream tumbling down the mountain's face on its own
// sloping ribbon, a line of buoys where the park ends out at sea, and a nudge that keeps ducks,
// balls and crates floating instead of sinking to the bottom.

function waterMaterial() {
  return new THREE.MeshStandardMaterial({ color: '#4fc3f7', roughness: 0.15, metalness: 0.1 });
}

/** The stream down the mountain: a ribbon along the river's sloping stretches, 45 cm above the channel floor. */
function streamGeometry() {
  const pts = RIVER.filter((_, i) => i === 0 || RIVER[i - 1].level > -0.6);
  const w = RIVER_HALF_WIDTH + 0.4;
  const pos: number[] = [];
  const index: number[] = [];
  pts.forEach((p, i) => {
    const prev = pts[Math.max(0, i - 1)].p;
    const next = pts[Math.min(pts.length - 1, i + 1)].p;
    const dx = next[0] - prev[0];
    const dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    const y = Math.max(WATER_LEVEL, p.level + 0.45);
    pos.push(p.p[0] - (dz / len) * w, y, p.p[1] + (dx / len) * w, p.p[0] + (dz / len) * w, y, p.p[1] - (dx / len) * w);
    if (i > 0) {
      const k = (i - 1) * 2;
      index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function Sea() {
  const sheet = useMemo(waterMaterial, []);
  const stream = useMemo(() => {
    const m = waterMaterial();
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
    return m;
  }, []);
  const geometry = useMemo(streamGeometry, []);
  useGameFrame(() => {
    const l = 0.58 + Math.sin(gameClock.time * 1.5) * 0.025;
    sheet.color.setHSL(0.56, 0.75, l);
    stream.color.setHSL(0.56, 0.75, l + 0.04);
  });
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_LEVEL, 0]} material={sheet}>
        <planeGeometry args={[400, 400]} />
      </mesh>
      <mesh receiveShadow geometry={geometry} material={stream} />
    </group>
  );
}

/** White streaks on see-through water, running along v (the flow), fading out at the edges. */
function streakTexture() {
  const W = 64;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  let seed = 11;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  ctx.lineCap = 'round';
  for (let i = 0; i < 70; i += 1) {
    const u = 0.1 + rnd() * 0.8;
    const edge = 1 - Math.abs(u - 0.5) * 2; // fewer, fainter streaks near the banks
    ctx.strokeStyle = `rgba(255,255,255,${(0.25 + rnd() * 0.45) * (0.4 + 0.6 * edge)})`;
    ctx.lineWidth = 1 + rnd() * 2.5;
    const v = rnd() * H;
    const len = 12 + rnd() * 40;
    // draw it twice when it crosses the top, so the texture wraps without a seam
    for (const off of [0, -H]) {
      ctx.beginPath();
      ctx.moveTo(u * W, v + off);
      ctx.lineTo(u * W + (rnd() - 0.5) * 3, v + len + off);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * The river's flow: a see-through ribbon of white streaks from the spring to the coast, drifting
 * downstream. The texture is stretched where the stream is steep, so it rushes down the
 * mountain and slows to a lazy drift in the valley.
 */
function flowGeometry() {
  const HALF = RIVER_HALF_WIDTH + 0.2;
  const pts: { x: number; z: number; y: number; v: number }[] = [];
  let v = 0;
  for (let i = 1; i < RIVER.length; i += 1) {
    const a = RIVER[i - 1];
    const b = RIVER[i];
    const len = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1]);
    const steep = a.level - b.level > 0.5;
    const n = Math.max(1, Math.ceil(len));
    for (let k = i === 1 ? 0 : 1; k <= n; k += 1) {
      const t = k / n;
      const z = a.p[1] + (b.p[1] - a.p[1]) * t;
      if (z > SEA.coast - 1) break;
      if (k > 0) v += len / n / (steep ? 14 : 5);
      pts.push({ x: a.p[0] + (b.p[0] - a.p[0]) * t, z, y: Math.max(WATER_LEVEL, a.level + (b.level - a.level) * t + 0.45) + 0.03, v });
    }
  }
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  pts.forEach((p, i) => {
    const prev = pts[Math.max(0, i - 2)];
    const next = pts[Math.min(pts.length - 1, i + 2)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const sx = (-dz / len) * HALF;
    const sz = (dx / len) * HALF;
    pos.push(p.x - sx, p.y, p.z - sz, p.x + sx, p.y, p.z + sz);
    uv.push(0, p.v, 1, p.v);
    if (i > 0) {
      const k = (i - 1) * 2;
      index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Where the stream comes off the mountain's face into the valley: foam. */
const FALLS_FOOT = RIVER.find((p) => p.level <= -0.6)!.p;

function Flow() {
  const geometry = useMemo(flowGeometry, []);
  const material = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ map: streakTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    m.polygonOffset = true;
    m.polygonOffsetFactor = -4;
    m.polygonOffsetUnits = -4;
    return m;
  }, []);
  const foam = useRef(0);
  useGameFrame((_, delta) => {
    if (material.map) material.map.offset.y = -((gameClock.time * 0.45) % 1);
    // foam where the stream lands, and a few drops tumbling down it (only when someone is near)
    if (!nearAnyCamera(FALLS_FOOT[0], FALLS_FOOT[1], 45)) return;
    foam.current -= delta;
    if (foam.current > 0) return;
    foam.current = 0.12;
    emit('puff', [FALLS_FOOT[0] + (Math.random() - 0.5) * 4, WATER_LEVEL + 0.2, FALLS_FOOT[1] - Math.random() * 2], {
      count: 2,
      color: ['#ffffff', '#e0f6ff'],
      size: 0.45,
      speed: 0.8,
      up: 1.2,
      gravity: 0.5,
      life: 1.2
    });
    const a = RIVER[1 + Math.floor(Math.random() * 2)];
    emit('drop', [a.p[0] + (Math.random() - 0.5) * 3, a.level + 0.6, a.p[1]], { count: 2, color: ['#ffffff', '#bfe9ff'], speed: 1.5, up: 2, size: 0.12, dir: [0, 0, 2.5] });
  });
  return <mesh geometry={geometry} material={material} renderOrder={1} />;
}

/** Red and white buoys bobbing along the park's edge out at sea. */
function Buoys() {
  const group = useRef<THREE.Group>(null);
  const xs = useMemo(() => {
    const out: number[] = [];
    for (let x = -WORLD_HALF_X + 2; x <= WORLD_HALF_X - 2; x += 5) out.push(x);
    return out;
  }, []);
  useGameFrame(() => {
    group.current?.children.forEach((b, i) => {
      b.position.y = WATER_LEVEL + 0.15 + Math.sin(gameClock.time * 1.3 + i) * 0.08;
      b.rotation.z = Math.sin(gameClock.time * 0.9 + i * 1.7) * 0.15;
    });
  });
  return (
    <group ref={group}>
      {xs.map((x, i) => (
        <group key={i} position={[x, WATER_LEVEL, WORLD_HALF_Z - 1.5]}>
          <mesh castShadow material={lambert(i % 2 ? '#ff4d5e' : '#ffffff')}>
            <sphereGeometry args={[0.5, 12, 10]} />
          </mesh>
          <mesh position={[0, 0.7, 0]} material={lambert('#37474f')}>
            <cylinderGeometry args={[0.05, 0.05, 0.6, 6]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * Light things float: a duck or a ball that ends up in the water bobs back up to the surface.
 * Anything that drops in (heavy or not) makes a splash.
 */
function Buoyancy() {
  const wet = useMemo(() => new Set<number>(), []);
  useGameFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    props.forEach((prop) => {
      if (prop.heldBy != null || !prop.enabled) {
        wet.delete(prop.id);
        return;
      }
      const rb = prop.getBody();
      if (!rb) return;
      const t = rb.translation();
      const level = isInWater(t.x, t.z) ? waterLevelAt(t.x, t.z) : -Infinity;
      const inside = t.y - prop.radius < level;
      if (!inside) {
        wet.delete(prop.id);
        return;
      }
      if (!wet.has(prop.id)) {
        wet.add(prop.id);
        const fall = -rb.linvel().y;
        if (fall > 2.5) {
          emit('drop', [t.x, level + 0.1, t.z], { count: Math.min(24, 6 + Math.round(fall * 1.5)), color: ['#7fd3ff', '#ffffff'], speed: 2 + fall * 0.2, up: 3 + fall * 0.3, size: 0.12 });
          ring([t.x, level + 0.04, t.z], { color: '#e0f6ff', radius: 0.8 + prop.radius * 2, duration: 0.6 });
          playSplash([t.x, t.y, t.z], fall > 8);
        }
      }
      if (prop.heavy) return;
      const target = level + prop.radius * 0.35;
      if (t.y > target + prop.radius) return;
      const v = rb.linvel();
      // cancel gravity while it's in the water, and a damped spring holds it at the surface
      const lift = -GRAVITY + (target - t.y) * 14 - v.y * 4;
      rb.setLinvel({ x: v.x * (1 - 2 * dt), y: v.y + lift * dt, z: v.z * (1 - 2 * dt) }, true);
    });
  });
  return null;
}

export function Water() {
  return (
    <group>
      <Sea />
      <Flow />
      <Buoys />
      <Buoyancy />
    </group>
  );
}
