import { WORLD_HALF_X, WORLD_HALF_Z } from './config';
import {
  BALLOONS,
  BIRD_SPOTS,
  BOWLING,
  BUNTING_POLES,
  CAT_HOMES,
  CONES,
  CRATE_TOWER,
  distXZ,
  FLOOR_PATCHES,
  FOOTBRIDGE,
  HIGH_STRIKER,
  HILLS,
  ICE,
  isInFountain,
  LAKE,
  LAUNCH_PADS,
  LAWN,
  MESA,
  MOUNTAIN,
  MOUNTAIN_PATH_GRADE,
  PATH_WIDTH,
  PATHS,
  PICNIC,
  PLAZA,
  RIVER,
  RIVER_BANK,
  RIVER_HALF_WIDTH,
  SANDCASTLES,
  SEA,
  SHIP,
  SIGNS,
  SNACKS,
  SNOW_HILL,
  SOCCER,
  STALLS,
  TRAIN,
  TREX,
  TUBE_RIDE,
  UMBRELLAS,
  WATER_LEVEL,
  WINTER,
  type Vec2
} from './layout';

// The ground: not flat. Rolling grass between the zones, a mountain across the north with a
// flat top, hills, a river in a channel, a lagoon and the sea. Everything that has to stand
// level (the zones' floors, the paths, the track, the set pieces out in the grass) sits on a
// "flat": the height function is pressed to the flat's level there, with a soft blend round the
// edge. Flats are applied in order, later ones over earlier ones: the mountain first, then the
// zones and the track, then the water (so the river cuts under the track and the paths, and the
// bridges span it), then the small things that stand right by the water. The same function
// makes the physics heightfield, the grass mesh and `groundHeight()`, so an animal, a tree and a
// shadow all agree where the ground is.

/** The heightfield covers the park, a little beyond the hedges, and the mountain's back. */
export const TERRAIN = { minX: -(WORLD_HALF_X + 4), maxX: WORLD_HALF_X + 4, minZ: -(WORLD_HALF_Z + 24), maxZ: WORLD_HALF_Z + 4, cell: 0.5 };
/** How far a flat's edge blends out into the ground around it. */
const BLEND = 3.5;

type Extra = { level?: number; levelB?: number; blend?: number; linear?: boolean };
export type Flat = Extra & (
  | { kind: 'disc'; c: Vec2; r: number }
  | { kind: 'seg'; a: Vec2; b: Vec2; r: number }
  | { kind: 'track'; r: number }
  | { kind: 'sea' }
  | { kind: 'river' }
);

/** Distance from a point to a segment, and how far along it the nearest point is (0..1). */
function segNear(x: number, z: number, a: Vec2, b: Vec2, out: { d: number; t: number }) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / Math.max(1e-6, dx * dx + dz * dz)));
  out.d = Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
  out.t = t;
  return out;
}
const near = { d: 0, t: 0 };

/** Distance from a point to the train track centre line (a rounded rectangle round `TRAIN.center`). */
export function trackDist(x: number, z: number) {
  const R = TRAIN.cornerRadius;
  const CX = TRAIN.halfX - R;
  const CZ = TRAIN.halfZ - R;
  const ax = Math.abs(x - TRAIN.center[0]);
  const az = Math.abs(z - TRAIN.center[1]);
  if (ax <= CX) return Math.abs(az - TRAIN.halfZ);
  if (az <= CZ) return Math.abs(ax - TRAIN.halfX);
  return Math.abs(Math.hypot(ax - CX, az - CZ) - R);
}

function smoothstep(t: number) {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
}

/** Distance to the river's centre line, and the channel floor level at the nearest point. */
export function riverAt(x: number, z: number, out = { d: Infinity, level: 0 }) {
  out.d = Infinity;
  for (let i = 1; i < RIVER.length; i += 1) {
    segNear(x, z, RIVER[i - 1].p, RIVER[i].p, near);
    if (near.d < out.d) {
      out.d = near.d;
      out.level = RIVER[i - 1].level + (RIVER[i].level - RIVER[i - 1].level) * near.t;
    }
  }
  return out;
}
const riverTmp = { d: Infinity, level: 0 };

/** Where a flat can reach (its reach plus its blend): outside this box it leaves the ground alone. */
type Box = { x0: number; x1: number; z0: number; z1: number };
const boxes = new WeakMap<Flat, Box>();
function boxOf(f: Flat): Box {
  let b = boxes.get(f);
  if (b) return b;
  const e = f.blend ?? BLEND;
  if (f.kind === 'disc') b = { x0: f.c[0] - f.r - e, x1: f.c[0] + f.r + e, z0: f.c[1] - f.r - e, z1: f.c[1] + f.r + e };
  else if (f.kind === 'seg') {
    const m = f.r + e;
    b = { x0: Math.min(f.a[0], f.b[0]) - m, x1: Math.max(f.a[0], f.b[0]) + m, z0: Math.min(f.a[1], f.b[1]) - m, z1: Math.max(f.a[1], f.b[1]) + m };
  } else if (f.kind === 'track') {
    const m = f.r + e;
    b = { x0: TRAIN.center[0] - TRAIN.halfX - m, x1: TRAIN.center[0] + TRAIN.halfX + m, z0: TRAIN.center[1] - TRAIN.halfZ - m, z1: TRAIN.center[1] + TRAIN.halfZ + m };
  } else if (f.kind === 'river') {
    const m = RIVER_HALF_WIDTH + e;
    b = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    for (const { p } of RIVER) {
      b.x0 = Math.min(b.x0, p[0] - m);
      b.x1 = Math.max(b.x1, p[0] + m);
      b.z0 = Math.min(b.z0, p[1] - m);
      b.z1 = Math.max(b.z1, p[1] + m);
    }
  } else b = { x0: -Infinity, x1: Infinity, z0: SEA.coast - e, z1: Infinity };
  boxes.set(f, b);
  return b;
}

/** How much a flat pulls the ground to its level at a point: 1 inside, fading to 0 over its blend. */
function weight(f: Flat, x: number, z: number) {
  const box = boxOf(f);
  if (x <= box.x0 || x >= box.x1 || z <= box.z0 || z >= box.z1) return 0;
  const blend = f.blend ?? BLEND;
  let d: number;
  if (f.kind === 'disc') d = distXZ(x, z, f.c[0], f.c[1]) - f.r;
  else if (f.kind === 'seg') d = segNear(x, z, f.a, f.b, near).d - f.r;
  else if (f.kind === 'track') d = trackDist(x, z) - f.r;
  else if (f.kind === 'river') d = riverAt(x, z, riverTmp).d - RIVER_HALF_WIDTH;
  else d = SEA.coast - z;
  if (d >= blend) return 0;
  if (d <= 0) return 1;
  return f.linear ? 1 - eased(d / blend) : 1 - smoothstep(d / blend);
}

/**
 * A straight ramp (you can walk up it anywhere) with its two corners rounded off, so the ground
 * cover that follows it has no crease to poke through, and the foot has no hard line.
 */
const EASE = 0.15;
function eased(u: number) {
  if (u < EASE) return (u * u) / (2 * EASE * (1 - EASE));
  if (u > 1 - EASE) return 1 - ((1 - u) * (1 - u)) / (2 * EASE * (1 - EASE));
  return (u - EASE / 2) / (1 - EASE);
}

const disc = (c: Vec2, r: number, more: Extra = {}): Flat => ({ kind: 'disc', c, r, ...more });
const seg = (a: Vec2, b: Vec2, r: number, more: Extra = {}): Flat => ({ kind: 'seg', a, b, r, ...more });

/** The mountain alone: 0 off it, its level on top. */
const MOUNTAIN_FLAT: Flat = seg(MOUNTAIN.a, MOUNTAIN.b, MOUNTAIN.radius, { level: MOUNTAIN.level, blend: MOUNTAIN.slope, linear: true });
export function mountainWeight(x: number, z: number) {
  return weight(MOUNTAIN_FLAT, x, z);
}

/** Everything that stands on level ground, in the order the ground is pressed. */
export const FLATS: Flat[] = [
  MOUNTAIN_FLAT,
  // the zones, the paths and the track
  ...FLOOR_PATCHES.filter((p) => p.kind !== 'sand').map((p) => disc(p.center, p.radius + 1, { level: p.kind === 'snow' ? WINTER.level : 0 })),
  disc(PLAZA.center, PLAZA.radius + 1),
  disc(LAWN.center, LAWN.radius),
  // the river tubes' jetty and the bank they tip you out on
  disc([TUBE_RIDE.jettyFrom + 1, TUBE_RIDE.jettyZ], 2.5),
  disc(TUBE_RIDE.landing, 2.5),
  ...PATHS.map(([a, b]) => seg(a, b, PATH_WIDTH / 2 + 1)),
  { kind: 'track', r: 4 },
  disc(MESA.center, 11),
  // level strips under the hedges (the north hedge climbs the mountain where it meets it)
  seg([-WORLD_HALF_X - 4, -WORLD_HALF_Z - 4], [-WORLD_HALF_X - 4, SEA.coast - 8], 6),
  seg([WORLD_HALF_X - 2, -WORLD_HALF_Z - 4], [WORLD_HALF_X - 2, SEA.coast - 8], 6),
  seg([-WORLD_HALF_X - 4, -WORLD_HALF_Z - 4], [-30, -WORLD_HALF_Z - 4], 6),
  seg([52, -WORLD_HALF_Z - 4], [WORLD_HALF_X + 4, -WORLD_HALF_Z - 4], 6),
  seg([FOOTBRIDGE.rampFrom + 2, FOOTBRIDGE.z], [FOOTBRIDGE.deckTo, FOOTBRIDGE.z], 4),
  disc(ICE.center, ICE.radius + 0.5, { level: WINTER.level }),
  seg(MOUNTAIN_PATH_GRADE.from, MOUNTAIN_PATH_GRADE.to, PATH_WIDTH / 2 + 0.8, { level: 0, levelB: MOUNTAIN.level }),
  // the water
  disc(LAKE.center, LAKE.radius, { level: LAKE.floor, blend: 4 }),
  { kind: 'sea', level: SEA.floor, blend: SEA.shore },
  { kind: 'river', blend: RIVER_BANK },
  // small things out in the open (and right by the water)
  ...SIGNS.map((s) => disc(s.position, 2)),
  ...SNACKS.map((s) => disc([s.position[0], s.position[2]], 2)),
  ...LAUNCH_PADS.map((p) => disc([p.position[0], p.position[2]], 3)),
  ...CAT_HOMES.map((c) => disc(c, 2.5)),
  ...BIRD_SPOTS.filter((b) => mountainWeight(b[0], b[2]) === 0).map((b) => disc([b[0], b[2]], b[3] + 1)),
  ...BALLOONS.map((b) => disc([b[0], b[2]], 1.5)),
  disc([CRATE_TOWER.base[0], CRATE_TOWER.base[2]], 4),
  disc([HIGH_STRIKER.position[0], HIGH_STRIKER.position[2]], 4),
  seg([BOWLING.laneX, BOWLING.laneFrom], [BOWLING.laneX, BOWLING.laneTo], 4),
  disc(SOCCER.field.center, Math.hypot(...SOCCER.field.size) / 2 + 1),
  disc(PICNIC.center, 4),
  disc([TREX.position[0], TREX.position[2]], 7),
  ...STALLS.map((s) => disc([s.position[0], s.position[2]], 3.5)),
  ...BUNTING_POLES.map((b) => disc(b, 1.5)),
  ...CONES.map((c) => disc([c[0], c[2]], 1.5)),
  ...SANDCASTLES.map((c) => disc(c, 2.5)),
  ...UMBRELLAS.map((u) => disc([u.position[0], u.position[2]], 2)),
  disc([SHIP.center[0], SHIP.center[1] - SHIP.width / 2 - 6], 2.5)
];

/** Round bumps on top of everything: the hills, and the summit on the mountain's top. */
const BUMPS = [...HILLS, SNOW_HILL];

/** The lie of the land before anything is pressed into it: gentle mounds every 25 m or so, with level troughs between. */
function relief(x: number, z: number) {
  const w = Math.sin(x / 9.5 + 0.7) * Math.cos(z / 12.5 - 0.3);
  return 2.2 * Math.pow(Math.max(0, w + 0.2), 1.3);
}

/** The ground height at a point in the park. */
export function groundHeight(x: number, z: number) {
  let h = relief(x, z);
  for (const f of FLATS) {
    const w = weight(f, x, z);
    if (w <= 0) continue;
    const level = f.kind === 'river' ? riverTmp.level : f.levelB != null && f.kind === 'seg' ? (f.level ?? 0) + (f.levelB - (f.level ?? 0)) * near.t : (f.level ?? 0);
    h += (level - h) * w;
  }
  for (const b of BUMPS) {
    const d = distXZ(x, z, b.center[0], b.center[1]);
    if (d < b.radius) h += b.height * 0.5 * (1 + Math.cos((Math.PI * d) / b.radius));
  }
  return h;
}

/** Where the water's surface is at a point: the sea, the lagoon and the river are one level; the stream down the mountain runs higher. */
export function waterLevelAt(x: number, z: number) {
  const r = riverAt(x, z, riverTmp);
  if (r.d < RIVER_HALF_WIDTH + RIVER_BANK && r.level > -0.6) return Math.max(WATER_LEVEL, r.level + 0.45);
  return WATER_LEVEL;
}

/** Wet feet here: the river (all the way up the mountain), the lagoon, the sea, or the fountain. */
export function isInWater(x: number, z: number) {
  if (isInFountain(x, z)) return true;
  const r = riverAt(x, z, riverTmp);
  if (r.d < RIVER_HALF_WIDTH + 0.4) return true;
  return groundHeight(x, z) < WATER_LEVEL - 0.15;
}

/** The sampled grid the physics and the grass mesh are built from: heights[iz * (nx + 1) + ix]. */
export function buildHeightGrid() {
  const { minX, maxX, minZ, maxZ, cell } = TERRAIN;
  const nx = Math.round((maxX - minX) / cell);
  const nz = Math.round((maxZ - minZ) / cell);
  const heights = new Float32Array((nx + 1) * (nz + 1));
  for (let iz = 0; iz <= nz; iz += 1)
    for (let ix = 0; ix <= nx; ix += 1) {
      heights[iz * (nx + 1) + ix] = groundHeight(minX + ix * cell, minZ + iz * cell);
    }
  return { nx, nz, heights };
}
