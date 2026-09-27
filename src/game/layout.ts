// Single source of truth for where things live in the park.
// x → right, z → towards the camera, y → up. Hedges sit at ±WORLD_HALF.
//
//            Forest & maze      Carnival          Sports
//            Farm               Fountain hub      Dino park
//            Winter             Beach & lake      Playground
//        (a little train drives around all of it)

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export const ZONES = {
  hub: [0, 0] as Vec2,
  carnival: [0, -40] as Vec2,
  sports: [38, -36] as Vec2,
  dino: [40, 0] as Vec2,
  playground: [34, 36] as Vec2,
  beach: [0, 38] as Vec2,
  winter: [-36, 36] as Vec2,
  farm: [-40, -2] as Vec2,
  forest: [-38, -38] as Vec2
};

// ---------------------------------------------------------------------------
// Hub

export const PLAZA = { center: [0, 2] as Vec2, radius: 13 };
export const FOUNTAIN = { center: [0, -2] as Vec2, basinRadius: 5.5, topHeight: 3.4 };
const FOUNTAIN_TOP = 3.4;
export const GEYSERS: Vec2[] = [
  [-8.5, 5],
  [8.5, 5],
  [0, 10.5]
];
export const HAT_BOX = { position: [-9, 0, -7] as Vec3, size: 1.6 };
export const RED_BUTTON = { position: [9, 0, -7] as Vec3, radius: 1.2 };
/** The hat rack: one wooden head per hat, in unlock order, facing the plaza. */
export const HAT_RACK = { center: [-4.85, -10.3] as Vec2, spacing: 0.85, headHeight: 1.05 };
export const SPAWN_POINTS: Vec3[] = [
  [-2.5, 1, 8],
  [2.5, 1, 8],
  [-4.5, 1, 11],
  [4.5, 1, 11]
];

// ---------------------------------------------------------------------------
// Carnival

export const FERRIS = { center: [0, 11, -50] as Vec3, radius: 9, gondolas: 8, speed: 0.17 };
export const CAROUSEL = { center: [-11, -37] as Vec2, radius: 5, speed: 0.55 };
export const HIGH_STRIKER = { position: [14, 0, -36] as Vec3, height: 8 };

// ---------------------------------------------------------------------------
// Sports

export const SOCCER = {
  goalCenter: [38, 0, -48.5] as Vec3,
  goalWidth: 7,
  goalHeight: 2.8,
  goalDepth: 2.2,
  kickoff: [38, 0.8, -38] as Vec3,
  field: { center: [38, -40] as Vec2, size: [16, 17] as Vec2 }
};

export const BOWLING = {
  laneX: 51,
  laneFrom: -32,
  laneTo: -14,
  ballStart: [51, 0.6, -16.5] as Vec3,
  pins: [
    [51, -26.6],
    [50.6, -27.3],
    [51.4, -27.3],
    [50.2, -28.0],
    [51, -28.0],
    [51.8, -28.0]
  ] as Vec2[]
};

export const CRATE_TOWER = { base: [26, 0, -22] as Vec3, size: 1.2, rows: 4 };

// ---------------------------------------------------------------------------
// Dino park

export const VOLCANO = { center: [44, 8] as Vec2, baseRadius: 9.5, height: 7, craterRadius: 2.2 };
export const BRONTO = { center: [39, -10] as Vec2 };
export const TREX = { position: [27, 0, 14] as Vec3 };
export const EGG_NEST = { center: [31, 3] as Vec2, eggs: 5 };

// ---------------------------------------------------------------------------
// Playground

export const SLIDE_TOWER = { base: [22, 0, 29] as Vec3, height: 5 };
export const BOUNCY_CASTLE = { center: [45, 29] as Vec2, size: 7 };
export const BALL_PIT = { center: [46, 43] as Vec2, size: 6 };
export const SEESAWS: { center: Vec2; angle: number }[] = [
  { center: [31, 46], angle: 0 },
  { center: [37, 40], angle: Math.PI / 2 }
];
export const TRAMPOLINES: { position: Vec3; radius: number }[] = [
  { position: [18, 0, 40], radius: 1.8 },
  { position: [23, 0, 45], radius: 1.8 },
  { position: [28, 0, 40], radius: 1.8 }
];
export const TRAMPOLINE_TOP = 0.14;

// ---------------------------------------------------------------------------
// Beach & lake

export const LAKE = { center: [0, 38] as Vec2, radius: 12 };
export const ISLAND = { center: [0, 41] as Vec2, sphereRadius: 7, height: 0.8 };
export const LIGHTHOUSE = { center: [0, 41] as Vec2, height: 9, radius: 1.2, balcony: 2.4 };
export const SHIP = { center: [-7, 35] as Vec2, deck: 1.8, length: 9, width: 3.6 };
export const SANDCASTLES: Vec2[] = [
  [6, 25.5],
  [10, 29],
  [-11, 29]
];

// ---------------------------------------------------------------------------
// Winter

export const SNOW = { center: [-36, 37] as Vec2, radius: 17 };
export const SNOW_HILL = { center: [-43, 42] as Vec2, sphereRadius: 14, height: 4.5 };
export const SKI_JUMP = { base: [-24, 0, 30] as Vec3, height: 4.5 };
export const ICE = { center: [-27, 45] as Vec2, radius: 5.5 };
export const SNOWMEN: Vec2[] = [
  [-38, 26],
  [-22, 36],
  [-35, 50],
  [-44, 30]
];
export const SNOWBALLS: Vec3[] = [
  [-33, 1, 35],
  [-30, 1, 39]
];

// ---------------------------------------------------------------------------
// Farm

export const BARN = { center: [-47, -9] as Vec2, width: 10, depth: 8, wallHeight: 5, ridgeHeight: 8.2 };
export const SILO = { center: [-51.5, 2] as Vec2, radius: 2.2, height: 9 };
export const WINDMILL = { position: [-51, 0, 13] as Vec3 };
export const MUD = { center: [-33, -9] as Vec2, radius: 3.5 };
export const PASTURE = { center: [-41, 8] as Vec2, size: [12, 8] as Vec2 };
export const CHICKEN_HOME = { center: [-36, -2] as Vec2, radius: 8, count: 8 };
export const MELON_PATCH: Vec2[] = [
  [-27, 6],
  [-24.5, 6],
  [-22, 6],
  [-27, 9],
  [-24.5, 9],
  [-22, 9]
];

// ---------------------------------------------------------------------------
// Forest & maze

export const MUSHROOMS: { center: Vec2; height: number; radius: number; color: string }[] = [
  { center: [-25, -32], height: 1.8, radius: 2.3, color: '#ff4d5e' },
  { center: [-21, -37], height: 3.4, radius: 2.1, color: '#a855f7' },
  { center: [-24, -42.5], height: 5, radius: 2, color: '#3b82f6' },
  { center: [-30, -43], height: 6.6, radius: 1.9, color: '#ff8fd8' },
  { center: [-32, -37], height: 8.2, radius: 1.8, color: '#ffb020' }
];

export const MAZE = {
  center: [-44, -42] as Vec2,
  // [x1, z1, x2, z2] hedge segments (axis aligned); clear of the train's corner
  walls: [
    [-50, -48, -38, -48],
    [-50, -48, -50, -36],
    [-50, -36, -46, -36],
    [-42, -36, -38, -36],
    [-38, -48, -38, -36],
    [-47, -45, -41, -45],
    [-47, -45, -47, -39],
    [-47, -39, -45, -39],
    [-41, -45, -41, -39],
    [-43, -39, -41, -39]
  ] as [number, number, number, number][]
};

// ---------------------------------------------------------------------------
// Landmarks in the open grass: hills to run up and jump off, a mesa with the train tunnel
// through it (a ramp and a launch pad get you on top), and a footbridge over the track

export const HILLS: { center: Vec2; radius: number; height: number }[] = [
  { center: [-26, -14], radius: 6.5, height: 2.6 },
  { center: [27, -14], radius: 5, height: 2.2 },
  { center: [23, -45], radius: 5.5, height: 2.4 }
];

/** The mesa straddles the east straight of the track: x 50..62, z -9..9, tunnel along z. */
export const MESA = {
  center: [56, 0] as Vec2,
  halfWidth: 6,
  halfLength: 9,
  /** The tunnel: this wide, this tall (the train is 2.4 m wide, 3.6 m tall with its chimney). */
  opening: 4.4,
  clearance: 4.2,
  roof: 1,
  /**
   * A ramp up to the top, square on to the north face (a ramp that comes in at an angle lets an
   * animal hugging its rail run into the corner). Its end rests a little above the top: a ramp
   * that only meets a ledge level with it leaves a step that stops a rolling animal.
   */
  rampFrom: [51.3, 0, 20] as Vec3,
  rampTo: [51.3, 5.6, 9.2] as Vec3
};

/**
 * A footbridge over the north straight: walk up from the park, look down on the train. The deck
 * is a chunky box: a thin slab lets a fast animal sink through (the physics flips the contact to
 * the underside once the ball's middle passes the slab's middle).
 */
export const FOOTBRIDGE = { x: -18, height: 4.6, deckThickness: 1, rampFrom: -43, deckFrom: -51.5, deckTo: -60.5, width: 2.6 };

// ---------------------------------------------------------------------------
// Train (rounded rectangle around the whole park)

export const TRAIN = { half: 56, cornerRadius: 14, speed: 6, station: { from: 6, to: 20 } };

// ---------------------------------------------------------------------------
// Launch pads (glowing arrows)

export type LaunchPadDef = { position: Vec3; target: Vec3; apex: number };
export const LAUNCH_PADS: LaunchPadDef[] = [
  { position: [-36, 0, -16], target: [BARN.center[0], BARN.ridgeHeight, BARN.center[1]], apex: 11.5 },
  { position: [-20, 0, 18], target: [SNOW_HILL.center[0], SNOW_HILL.height, SNOW_HILL.center[1]], apex: 12 },
  { position: [18, 0, -14], target: [CRATE_TOWER.base[0], 5, CRATE_TOWER.base[2]], apex: 9 },
  { position: [42, 0, -19], target: [56, 5.2, 0], apex: 12 }
];

// ---------------------------------------------------------------------------
// Golden stars (the 'train' one rides on the locomotive and is placed by the train)

export const GOLDEN_STARS: (Vec3 | 'train')[] = [
  [FOUNTAIN.center[0], FOUNTAIN.topHeight + 1.4, FOUNTAIN.center[1]], // top of the fountain (geysers)
  [FERRIS.center[0], FERRIS.center[1] + FERRIS.radius - 0.4, FERRIS.center[2]], // top of the ferris wheel
  [SOCCER.goalCenter[0], 0.9, SOCCER.goalCenter[2]], // inside the soccer goal
  [VOLCANO.center[0], 13, VOLCANO.center[1]], // above the volcano crater
  [SLIDE_TOWER.base[0], SLIDE_TOWER.height + 1.3, SLIDE_TOWER.base[2]], // top of the slide tower
  [LIGHTHOUSE.center[0], LIGHTHOUSE.height + 1.2, LIGHTHOUSE.center[1] + 1.6], // lighthouse balcony (ship cannon)
  [SNOW_HILL.center[0], SNOW_HILL.height + 1.4, SNOW_HILL.center[1]], // snow hill top
  [BARN.center[0], BARN.ridgeHeight + 1.4, BARN.center[1]], // barn roof (launch pad)
  [MUSHROOMS[4].center[0], MUSHROOMS[4].height + 2.2, MUSHROOMS[4].center[1]], // above the tallest mushroom
  [MAZE.center[0], 1.0, MAZE.center[1]], // hedge maze centre
  [48.2, 7.9, -10], // on the brontosaurus's head
  'train' // riding on the train's roof
];

// ---------------------------------------------------------------------------
// Food: lick it to fill your belly (and then... the poop button).

export type SnackKind = 'kibble' | 'cake' | 'carrot' | 'icecream' | MagicKind;
/** Magic food, floating on a little pedestal: beans (rocket toots), mushroom (giant), chili (fire). */
export type MagicKind = 'beans' | 'mushroom' | 'chili';
export const SNACKS: { kind: SnackKind; position: Vec3 }[] = [
  // dog bowls right next to where everyone spawns
  { kind: 'kibble', position: [-5, 0, 7.5] },
  { kind: 'kibble', position: [5, 0, 7.5] },
  // picnic blanket between the plaza and the beach
  { kind: 'cake', position: [6.4, 0.06, 20] },
  { kind: 'cake', position: [7.6, 0.06, 21] },
  { kind: 'cake', position: [6.6, 0.06, 21.3] },
  // carrot patch on the farm
  ...([[-32, 3], [-30.6, 3], [-29.2, 3], [-32, 4.6], [-30.6, 4.6], [-29.2, 4.6]] as Vec2[]).map((c) => ({ kind: 'carrot' as const, position: [c[0], 0, c[1]] as Vec3 })),
  // ice creams on the carnival stall counters
  { kind: 'icecream', position: [-9.6, 1.2, -28.6] },
  { kind: 'icecream', position: [-8.4, 1.2, -28.6] },
  { kind: 'icecream', position: [21.4, 1.2, -30.6] },
  { kind: 'icecream', position: [22.6, 1.2, -30.6] },
  // the magic snack table on the west side of the plaza...
  { kind: 'beans', position: [-10.8, 0, -4.6] },
  { kind: 'mushroom', position: [-10.8, 0, -3.3] },
  { kind: 'chili', position: [-10.8, 0, -2] },
  // ...and one of each out in the park, where it fits
  { kind: 'beans', position: [-38, 0, -14] },
  { kind: 'mushroom', position: [-29, 0, -28] },
  { kind: 'chili', position: [32, 0, 10] }
];
export const TOILET = { position: [10.8, 0, -2] as Vec3, seatHeight: 1.05 };
export const PICNIC = { center: [7, 20.6] as Vec2, size: 2.8 };

// ---------------------------------------------------------------------------

export const PATHS: [Vec2, Vec2][] = [
  [[0, -12], [0, -30]],
  [[8, -9], [30, -30]],
  [[12, 0], [30, 0]],
  [[9, 9], [22, 15]],
  [[-9, 9], [-23, 19]],
  [[-12, 0], [-30, 0]],
  [[-8, -9], [-26, -28]],
  [[10, 16], [16, 30]]
];

/** Pictogram signposts at the plaza edge, pointing at each zone. */
export const SIGNS: { position: Vec2; zone: keyof typeof ZONES; icon: string }[] = [
  { position: [-3.5, -13], zone: 'carnival', icon: '🎡' },
  { position: [11, -9.5], zone: 'sports', icon: '⚽' },
  { position: [14, 3.5], zone: 'dino', icon: '🦕' },
  { position: [11.5, 12.5], zone: 'playground', icon: '🛝' },
  { position: [-3, 16], zone: 'beach', icon: '🏝️' },
  { position: [-11.5, 12.5], zone: 'winter', icon: '⛄' },
  { position: [-14, -3.5], zone: 'farm', icon: '🐄' },
  { position: [-11, -10], zone: 'forest', icon: '🍄' }
];

export const BALLOONS: Vec3[] = [
  [-5, 2.4, 9],
  [5, 2.8, 9],
  [0, 3.2, 13.5],
  [6, 3, -30],
  [9, 4, -32],
  [-6, 3.4, -30],
  [19, 3, -32],
  [18, 5.5, 40],
  [28, 6, 40],
  [23, 7.5, 45],
  [45, 3.5, 36],
  [4, 2.4, 23],
  [-26, 2.6, -28],
  [-21, 4.5, -33]
];

// ---------------------------------------------------------------------------
// The chase: park cats (each has a home patch near some trees) and bird flocks (they land on
// open grass, and on a few high spots you need a launcher for)

export const CAT_HOMES: Vec2[] = [
  [13, -10],
  [-18, -7],
  [11, 27],
  [33, 19]
];

/** Where bird flocks land: [x, ground height, z, spread radius]. */
export const BIRD_SPOTS: [number, number, number, number][] = [
  [-8, 0, 13, 2.2],
  [7, 0, -13, 2.2],
  [38, 0, -40, 2.6],
  [-41, 0, 8, 2.6],
  [-9, 0, 25, 2],
  [-44, 0, 20, 2.2],
  [7, 0, -28, 2.2],
  [21, 0, 3, 2],
  [36, 0, 29, 2.2],
  [-26, 0, -39, 2],
  [0, FOUNTAIN_TOP, -2, 0.9],
  [-7, 1.8, 35, 1.3]
];
export const BIRD_FLOCKS = 4;

export type TreeKind = 'round' | 'blossom' | 'pine' | 'palm' | 'snowpine';
export const TREES: { at: Vec2; kind: TreeKind }[] = [
  // forest (dense)
  ...(
    [
      [-59.5, -32], [-52, -26], [-44, -30], [-38, -27], [-35, -50], [-28, -52], [-24, -50], [-13, -49],
      [-10, -26], [-38, -52], [-56, -55], [-18, -24], [-40, -33], [-34, -31], [-27, -25], [-12, -52.5]
    ] as Vec2[]
  ).map((at, i) => ({ at, kind: (i % 3 === 0 ? 'pine' : i % 3 === 1 ? 'round' : 'blossom') as TreeKind })),
  // farm & hub edges
  ...([[-59, -20], [-31, -21], [-18, 3], [-59, 22], [17, -5], [-13, -19], [17, 19], [-17, 19]] as Vec2[]).map((at, i) => ({
    at,
    kind: (i % 2 === 0 ? 'round' : 'blossom') as TreeKind
  })),
  // sports / dino
  ...([[16, -50], [51, -45], [33, -18], [60, -18], [31, 22], [59, 22]] as Vec2[]).map((at, i) => ({
    at,
    kind: (i % 2 === 0 ? 'pine' : 'round') as TreeKind
  })),
  // playground
  ...([[13, 33], [50, 49], [28, 53], [48, 17]] as Vec2[]).map((at) => ({ at, kind: 'round' as TreeKind })),
  // beach palms
  ...([[-16, 25], [-17, 33], [-16, 50], [16, 49], [19, 22]] as Vec2[]).map((at) => ({ at, kind: 'palm' as TreeKind })),
  // winter
  ...([[-52, 28], [-59.5, 38], [-27, 52], [-18, 33], [-41, 52], [-31, 21], [-19, 45]] as Vec2[]).map((at) => ({
    at,
    kind: 'snowpine' as TreeKind
  }))
];

export function distXZ(ax: number, az: number, bx: number, bz: number) {
  return Math.hypot(ax - bx, az - bz);
}

export function isInPond(x: number, z: number) {
  const inLake = distXZ(x, z, LAKE.center[0], LAKE.center[1]) < LAKE.radius - 0.4;
  const onIsland = distXZ(x, z, ISLAND.center[0], ISLAND.center[1]) < 3.1;
  const inFountain = distXZ(x, z, FOUNTAIN.center[0], FOUNTAIN.center[1]) < FOUNTAIN.basinRadius - 0.3;
  const underShip = Math.abs(x - SHIP.center[0]) < SHIP.length / 2 && Math.abs(z - SHIP.center[1]) < SHIP.width / 2;
  return (inLake && !onIsland && !underShip) || inFountain;
}

export function isInMud(x: number, z: number) {
  return distXZ(x, z, MUD.center[0], MUD.center[1]) < MUD.radius - 0.3;
}

export function isOnSnow(x: number, z: number) {
  return distXZ(x, z, SNOW.center[0], SNOW.center[1]) < SNOW.radius;
}

/** Coloured ground in each area. Everything outside these (and the paths) is grass. */
export type FloorKind = 'forest' | 'dirt' | 'dino' | 'rubber' | 'carnival' | 'snow' | 'sand' | 'plaza';
export const FLOOR_PATCHES: { center: Vec2; radius: number; kind: FloorKind; y: number }[] = [
  { center: ZONES.forest, radius: 20, kind: 'forest', y: 0.006 },
  { center: ZONES.farm, radius: 13, kind: 'dirt', y: 0.007 },
  { center: [40, 2], radius: 15.5, kind: 'dino', y: 0.007 },
  { center: [33, 37], radius: 17, kind: 'rubber', y: 0.007 },
  { center: [0, -40], radius: 15, kind: 'carnival', y: 0.007 },
  { center: SNOW.center, radius: SNOW.radius, kind: 'snow', y: 0.008 },
  { center: LAKE.center, radius: LAKE.radius + 2.6, kind: 'sand', y: 0.009 },
  { center: PLAZA.center, radius: PLAZA.radius, kind: 'plaza', y: 0.01 }
];
export const PATH_WIDTH = 2.6;

function distToSegment(x: number, z: number, a: Vec2, b: Vec2) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}

/** Somewhere an animal can nibble grass (the forest floor counts). */
export function isOnGrass(x: number, z: number) {
  if (isInPond(x, z)) return false;
  const onPath = PATHS.some(([a, b]) => distToSegment(x, z, a, b) < PATH_WIDTH / 2);
  // patches are drawn in order, later ones on top: the topmost one decides
  for (let i = FLOOR_PATCHES.length - 1; i >= 0; i -= 1) {
    const p = FLOOR_PATCHES[i];
    if (distXZ(x, z, p.center[0], p.center[1]) < p.radius) return p.kind === 'forest' && !onPath;
  }
  return !onPath;
}
