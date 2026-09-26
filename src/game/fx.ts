import * as THREE from 'three';

// Pooled particle + shockwave-ring data. Pure data so anything (store, props, players)
// can emit effects without React; FxRenderer draws the pools with instanced meshes.

export type ParticleKind = 'puff' | 'star' | 'confetti' | 'drop' | 'feather' | 'heart' | 'chunk';

export const PARTICLE_KINDS: ParticleKind[] = ['puff', 'star', 'confetti', 'drop', 'feather', 'heart', 'chunk'];

const POOL_SIZES: Record<ParticleKind, number> = {
  puff: 280,
  star: 220,
  confetti: 800,
  drop: 260,
  feather: 140,
  heart: 90,
  chunk: 220
};

const DEFAULTS: Record<ParticleKind, { gravity: number; drag: number; life: number; size: number; speed: number; up: number }> = {
  puff: { gravity: -1.5, drag: 3, life: 0.7, size: 0.35, speed: 2.5, up: 1 },
  star: { gravity: 10, drag: 1.2, life: 0.8, size: 0.22, speed: 5, up: 4 },
  confetti: { gravity: 5, drag: 1.4, life: 2.4, size: 1, speed: 7, up: 7 },
  drop: { gravity: 20, drag: 0.6, life: 0.7, size: 0.14, speed: 3, up: 5 },
  feather: { gravity: 2.2, drag: 2.5, life: 1.8, size: 1, speed: 4, up: 3 },
  heart: { gravity: -2.5, drag: 1.5, life: 1.2, size: 0.28, speed: 1.5, up: 2 },
  chunk: { gravity: 22, drag: 0.4, life: 1.1, size: 0.2, speed: 6, up: 6 }
};

export type ParticlePool = {
  max: number;
  count: number;
  px: Float32Array; py: Float32Array; pz: Float32Array;
  vx: Float32Array; vy: Float32Array; vz: Float32Array;
  rx: Float32Array; ry: Float32Array; rz: Float32Array;
  wx: Float32Array; wy: Float32Array; wz: Float32Array;
  life: Float32Array; maxLife: Float32Array; size: Float32Array;
  gravity: Float32Array; drag: Float32Array;
  r: Float32Array; g: Float32Array; b: Float32Array;
};

function createPool(max: number): ParticlePool {
  const f = () => new Float32Array(max);
  return {
    max, count: 0,
    px: f(), py: f(), pz: f(), vx: f(), vy: f(), vz: f(),
    rx: f(), ry: f(), rz: f(), wx: f(), wy: f(), wz: f(),
    life: f(), maxLife: f(), size: f(), gravity: f(), drag: f(),
    r: f(), g: f(), b: f()
  };
}

export const pools = Object.fromEntries(
  PARTICLE_KINDS.map((kind) => [kind, createPool(POOL_SIZES[kind])])
) as Record<ParticleKind, ParticlePool>;

type PointLike = THREE.Vector3 | { x: number; y: number; z: number } | [number, number, number];

function toXYZ(p: PointLike) {
  return Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : p;
}

export type EmitOptions = {
  count?: number;
  color?: string | readonly string[];
  speed?: number;
  up?: number;
  spread?: number;
  life?: number;
  size?: number;
  gravity?: number;
  drag?: number;
  /** Adds a directional push to every particle. */
  dir?: [number, number, number];
};

const tmpColor = new THREE.Color();
export const CONFETTI_COLORS = ['#ff4d5e', '#ffd23f', '#3bceac', '#3b82f6', '#a855f7', '#ff8fd8', '#ffffff'];

export function emit(kind: ParticleKind, at: PointLike, options: EmitOptions = {}) {
  const pool = pools[kind];
  const d = DEFAULTS[kind];
  const p = toXYZ(at);
  const count = options.count ?? 8;
  const colors = options.color == null ? CONFETTI_COLORS : typeof options.color === 'string' ? [options.color] : options.color;
  const speed = options.speed ?? d.speed;
  const up = options.up ?? d.up;
  const spread = options.spread ?? 0.2;
  const dir = options.dir ?? [0, 0, 0];

  for (let n = 0; n < count; n += 1) {
    // Recycle the oldest slot when the pool is full.
    const i = pool.count < pool.max ? pool.count++ : Math.floor(Math.random() * pool.max);
    const a = Math.random() * Math.PI * 2;
    const r = Math.random();
    pool.px[i] = p.x + Math.cos(a) * spread * r;
    pool.py[i] = p.y + (Math.random() - 0.5) * spread;
    pool.pz[i] = p.z + Math.sin(a) * spread * r;
    const s = speed * (0.4 + Math.random() * 0.6);
    pool.vx[i] = Math.cos(a) * s + dir[0];
    pool.vy[i] = up * (0.5 + Math.random() * 0.7) + dir[1];
    pool.vz[i] = Math.sin(a) * s + dir[2];
    pool.rx[i] = Math.random() * Math.PI * 2;
    pool.ry[i] = Math.random() * Math.PI * 2;
    pool.rz[i] = Math.random() * Math.PI * 2;
    pool.wx[i] = (Math.random() - 0.5) * 14;
    pool.wy[i] = (Math.random() - 0.5) * 14;
    pool.wz[i] = (Math.random() - 0.5) * 14;
    const life = (options.life ?? d.life) * (0.75 + Math.random() * 0.5);
    pool.life[i] = life;
    pool.maxLife[i] = life;
    pool.size[i] = (options.size ?? d.size) * (0.7 + Math.random() * 0.6);
    pool.gravity[i] = options.gravity ?? d.gravity;
    pool.drag[i] = options.drag ?? d.drag;
    tmpColor.set(colors[Math.floor(Math.random() * colors.length)]);
    pool.r[i] = tmpColor.r;
    pool.g[i] = tmpColor.g;
    pool.b[i] = tmpColor.b;
  }
}

export function stepPool(pool: ParticlePool, dt: number) {
  let i = 0;
  while (i < pool.count) {
    pool.life[i] -= dt;
    if (pool.life[i] <= 0) {
      // swap-remove with the last live particle
      const last = pool.count - 1;
      if (i !== last) {
        for (const key of SWAP_KEYS) {
          const arr = pool[key];
          arr[i] = arr[last];
        }
      }
      pool.count -= 1;
      continue;
    }
    const drag = Math.max(0, 1 - pool.drag[i] * dt);
    pool.vx[i] *= drag;
    pool.vz[i] *= drag;
    pool.vy[i] = pool.vy[i] * drag - pool.gravity[i] * dt;
    pool.px[i] += pool.vx[i] * dt;
    pool.py[i] += pool.vy[i] * dt;
    pool.pz[i] += pool.vz[i] * dt;
    if (pool.py[i] < 0.03 && pool.vy[i] < 0) {
      pool.py[i] = 0.03;
      pool.vy[i] *= -0.3;
      pool.vx[i] *= 0.6;
      pool.vz[i] *= 0.6;
    }
    pool.rx[i] += pool.wx[i] * dt;
    pool.ry[i] += pool.wy[i] * dt;
    pool.rz[i] += pool.wz[i] * dt;
    i += 1;
  }
}

const SWAP_KEYS = ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'rx', 'ry', 'rz', 'wx', 'wy', 'wz', 'life', 'maxLife', 'size', 'gravity', 'drag', 'r', 'g', 'b'] as const;

// ---------------------------------------------------------------------------
// Expanding rings (shockwaves, noises, bounces)

export type Ring = { active: boolean; x: number; y: number; z: number; age: number; duration: number; radius: number; color: string };
export const RING_COUNT = 20;
export const rings: Ring[] = Array.from({ length: RING_COUNT }, () => ({ active: false, x: 0, y: 0, z: 0, age: 0, duration: 1, radius: 1, color: '#ffffff' }));
let ringCursor = 0;

export function ring(at: PointLike, options: { color?: string; radius?: number; duration?: number } = {}) {
  const p = toXYZ(at);
  const r = rings[ringCursor];
  ringCursor = (ringCursor + 1) % RING_COUNT;
  r.active = true;
  r.x = p.x;
  r.y = p.y;
  r.z = p.z;
  r.age = 0;
  r.duration = options.duration ?? 0.5;
  r.radius = options.radius ?? 2;
  r.color = options.color ?? '#ffffff';
}

// ---------------------------------------------------------------------------
// Convenience combos

export function burstConfetti(at: PointLike, count = 60, speed = 7) {
  emit('confetti', at, { count, speed, up: 8, spread: 0.6 });
}

export function poof(at: PointLike, color = '#ffffff', count = 14) {
  emit('puff', at, { count, color: [color, '#ffffff', '#ffffff'], speed: 3.5, up: 1.2, spread: 0.5, size: 0.3 });
}

export function bonkStars(at: PointLike) {
  emit('star', at, { count: 7, color: ['#ffe14d', '#fff3a8', '#ffffff'], speed: 5, up: 5 });
}
