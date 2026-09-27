import { WORLD_HALF } from './config';
import {
  BALLOONS,
  BIRD_SPOTS,
  BOWLING,
  CAT_HOMES,
  CRATE_TOWER,
  distXZ,
  FLOOR_PATCHES,
  FOOTBRIDGE,
  HIGH_STRIKER,
  HILLS,
  LAUNCH_PADS,
  MESA,
  PATH_WIDTH,
  PATHS,
  PICNIC,
  PLAZA,
  SIGNS,
  SNACKS,
  SOCCER,
  TRAIN,
  TREX,
  type Vec2
} from './layout';

// The ground: not flat. Rolling grass between the zones, the hills, and (one day) a mountain
// and a river. Everything that has to stand level (the zones' floors, the paths, the track, the
// set pieces out in the grass) sits on a plateau at height 0: the height function is masked to
// zero there, with a soft blend round the edge. The same function makes the physics heightfield,
// the grass mesh and `groundHeight()`, so an animal, a tree and a shadow all agree where the
// ground is.

/** The heightfield covers the park and a little beyond the hedge, in cells this big. */
export const TERRAIN = { half: WORLD_HALF + 4, cell: 0.5 };
/** How far a plateau's edge blends out into the rolling grass. */
const BLEND = 3.5;

type Flat = { kind: 'disc'; c: Vec2; r: number } | { kind: 'seg'; a: Vec2; b: Vec2; r: number };

function segDist(x: number, z: number, a: Vec2, b: Vec2) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / Math.max(1e-6, dx * dx + dz * dz)));
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}

/** Distance from a point to the train track centre line (a rounded rectangle). */
export function trackDist(x: number, z: number) {
  const H = TRAIN.half;
  const R = TRAIN.cornerRadius;
  const C = H - R;
  const ax = Math.abs(x);
  const az = Math.abs(z);
  if (ax <= C || az <= C) return Math.abs(Math.max(ax, az) - H);
  return Math.abs(Math.hypot(ax - C, az - C) - R);
}

/** Everything that stands on level ground, as discs and thick segments. */
export const FLATS: Flat[] = [
  ...FLOOR_PATCHES.map((p) => ({ kind: 'disc' as const, c: p.center, r: p.radius + 1 })),
  { kind: 'disc', c: PLAZA.center, r: PLAZA.radius + 1 },
  ...PATHS.map(([a, b]) => ({ kind: 'seg' as const, a, b, r: PATH_WIDTH / 2 + 1 })),
  ...SIGNS.map((s) => ({ kind: 'disc' as const, c: s.position, r: 2 })),
  ...SNACKS.map((s) => ({ kind: 'disc' as const, c: [s.position[0], s.position[2]] as Vec2, r: 2 })),
  ...LAUNCH_PADS.map((p) => ({ kind: 'disc' as const, c: [p.position[0], p.position[2]] as Vec2, r: 3 })),
  ...CAT_HOMES.map((c) => ({ kind: 'disc' as const, c, r: 2.5 })),
  ...BIRD_SPOTS.map((b) => ({ kind: 'disc' as const, c: [b[0], b[2]] as Vec2, r: b[3] + 1 })),
  ...BALLOONS.map((b) => ({ kind: 'disc' as const, c: [b[0], b[2]] as Vec2, r: 1.5 })),
  { kind: 'disc', c: MESA.center, r: MESA.halfWidth + MESA.halfLength + 2 },
  { kind: 'seg', a: [MESA.rampFrom[0], MESA.rampFrom[2]], b: [MESA.rampTo[0], MESA.rampTo[2]], r: 3 },
  { kind: 'seg', a: [FOOTBRIDGE.x, FOOTBRIDGE.rampFrom + 2], b: [FOOTBRIDGE.x, FOOTBRIDGE.deckTo], r: 4 },
  { kind: 'disc', c: [CRATE_TOWER.base[0], CRATE_TOWER.base[2]], r: 4 },
  { kind: 'disc', c: [HIGH_STRIKER.position[0], HIGH_STRIKER.position[2]], r: 4 },
  { kind: 'seg', a: [BOWLING.laneX, BOWLING.laneFrom], b: [BOWLING.laneX, BOWLING.laneTo], r: 4 },
  { kind: 'disc', c: SOCCER.field.center, r: Math.max(...SOCCER.field.size) / 2 + 3 },
  { kind: 'disc', c: PICNIC.center, r: 4 },
  { kind: 'disc', c: [TREX.position[0], TREX.position[2]], r: 7 },
  { kind: 'disc', c: [21.4, -30.6], r: 4 },
  { kind: 'disc', c: [-9.6, -28.6], r: 4 }
];

function smoothstep(t: number) {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
}

/** 0 on a plateau, rising to 1 out in the open grass. */
export function openness(x: number, z: number) {
  let k = 1;
  // the track corridor, and the strip along the hedge
  k = Math.min(k, smoothstep((trackDist(x, z) - 4) / BLEND));
  k = Math.min(k, smoothstep((WORLD_HALF - 3 - Math.max(Math.abs(x), Math.abs(z))) / BLEND));
  for (const f of FLATS) {
    const d = f.kind === 'disc' ? distXZ(x, z, f.c[0], f.c[1]) - f.r : segDist(x, z, f.a, f.b) - f.r;
    if (d >= BLEND) continue;
    k = Math.min(k, smoothstep(d / BLEND));
    if (k <= 0) return 0;
  }
  return k;
}

/** The lie of the land before the plateaus are pressed into it. */
function relief(x: number, z: number) {
  // gentle mounds every 25 m or so, with level troughs between them
  const w = Math.sin(x / 9.5 + 0.7) * Math.cos(z / 12.5 - 0.3);
  let h = 2.2 * Math.pow(Math.max(0, w + 0.2), 1.3);
  // the hills: round cosine bumps
  for (const hill of HILLS) {
    const d = distXZ(x, z, hill.center[0], hill.center[1]);
    if (d < hill.radius) h += hill.height * 0.5 * (1 + Math.cos((Math.PI * d) / hill.radius));
  }
  return h;
}

/** The ground height at a point in the park. */
export function groundHeight(x: number, z: number) {
  const k = openness(x, z);
  return k <= 0 ? 0 : relief(x, z) * k;
}

/** The sampled grid the physics and the grass mesh are built from. */
export function buildHeightGrid() {
  const { half, cell } = TERRAIN;
  const n = Math.round((half * 2) / cell);
  const heights = new Float32Array((n + 1) * (n + 1));
  for (let iz = 0; iz <= n; iz += 1)
    for (let ix = 0; ix <= n; ix += 1) {
      const x = -half + ix * cell;
      const z = -half + iz * cell;
      heights[iz * (n + 1) + ix] = groundHeight(x, z);
    }
  return { n, heights };
}
