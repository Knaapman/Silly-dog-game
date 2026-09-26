// Single source of truth for where things live in the park.
// x → right, z → towards the camera, y → up. Hedges sit at ±WORLD_HALF.

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export const PLAZA = { center: [0, 4] as Vec2, radius: 7 };

export const SPAWN_POINTS: Vec3[] = [
  [-2, 1, 9],
  [2, 1, 9],
  [-4, 1, 11.5],
  [4, 1, 11.5]
];

export const POND = { center: [-17, 8] as Vec2, radius: 8 };
export const ISLAND = { center: [-17, 8] as Vec2, sphereRadius: 6, height: 0.6 };
export const MUD = { center: [-16, -20] as Vec2, radius: 3.5 };
export const HILL = { center: [-25, 27] as Vec2, sphereRadius: 16, height: 4 };

export const BARN = { center: [-27, -27] as Vec2, width: 10, depth: 8, wallHeight: 5, ridgeHeight: 8.2 };
export const SILO = { center: [-35.5, -20] as Vec2, radius: 2.2, height: 9 };

export const HAT_BOX = { position: [0, 0, 0] as Vec3, size: 1.6 };
export const RED_BUTTON = { position: [18, 0, 10] as Vec3, radius: 1.2 };

export const TRAMPOLINES: { position: Vec3; radius: number }[] = [
  { position: [10, 0, -11], radius: 1.8 },
  { position: [15, 0, -15], radius: 1.8 },
  { position: [20, 0, -11], radius: 1.8 }
];
export const TRAMPOLINE_TOP = 0.14;

export type LaunchPadDef = { position: Vec3; target: Vec3; apex: number };
export const LAUNCH_PADS: LaunchPadDef[] = [
  { position: [-5, 0, 11], target: [-17, ISLAND.height, 8], apex: 6.5 },
  { position: [-15, 0, -31], target: [BARN.center[0], BARN.ridgeHeight, BARN.center[1]], apex: 11 },
  { position: [8, 0, 17], target: [HILL.center[0], HILL.height, HILL.center[1]], apex: 11 }
];

export const SOCCER = {
  goalCenter: [18, 0, -34.5] as Vec3,
  goalWidth: 7,
  goalHeight: 2.8,
  goalDepth: 2.2,
  kickoff: [18, 0.8, -25] as Vec3,
  field: { center: [18, -27] as Vec2, size: [15, 15] as Vec2 }
};

export const BOWLING = {
  laneX: 36,
  laneFrom: 10,
  laneTo: 27,
  ballStart: [36, 0.6, 24.5] as Vec3,
  pins: [
    [36, 15.4],
    [35.6, 14.7],
    [36.4, 14.7],
    [35.2, 14.0],
    [36, 14.0],
    [36.8, 14.0]
  ] as Vec2[]
};

export const CRATE_TOWER = { base: [27, 0, 4] as Vec3, size: 1.2, rows: 4 };

export const MELON_PATCH: Vec2[] = [
  [5, 24],
  [8, 24],
  [11, 24],
  [5, 28],
  [8, 28],
  [11, 28]
];

export const MAZE = {
  center: [27, 30] as Vec2,
  // [x1, z1, x2, z2] hedge segments (axis aligned)
  walls: [
    [22, 25, 32, 25],
    [32, 25, 32, 35],
    [22, 35, 32, 35],
    [22, 25, 22, 28.5],
    [22, 31.5, 22, 35],
    [24.5, 27.5, 29.5, 27.5],
    [24.5, 27.5, 24.5, 32.5],
    [24.5, 32.5, 29.5, 32.5],
    [29.5, 27.5, 29.5, 29],
    [29.5, 31, 29.5, 32.5]
  ] as [number, number, number, number][]
};

export const GOLDEN_STARS: Vec3[] = [
  [-17, 1.8, 8], // pond island
  [BARN.center[0], BARN.ridgeHeight + 1.4, BARN.center[1]], // barn roof (launch pad)
  [MUD.center[0], 0.9, MUD.center[1]], // mud puddle
  [15, 7.8, -15], // high above the middle trampoline
  [18, 0.9, -34.4], // inside the soccer goal
  [27, 6.0, 4], // top of the crate tower
  [HILL.center[0], HILL.height + 1.4, HILL.center[1]], // hill top
  [27, 1.0, 30] // hedge maze centre
];

export const TREES: Vec2[] = [
  [-36, -14], [-35, -2], [-36, 14], [-10, -36], [-2, -35], [6, -36], [28, -37], [35, -28],
  [33, -19], [36, -6], [37, 35], [14, 36], [0, 36], [-8, 35], [-8, -10], [5, -22],
  [-4, 22], [17, 22], [-31, -9], [-38, 37], [22, -4]
];

export const BALLOONS: Vec3[] = [
  [-3, 2.2, 1.5],
  [3, 2.6, 1.8],
  [0, 3.4, -3],
  [10, 5, -11],
  [20, 5.5, -11],
  [15, 4.6, -15],
  [12.5, 7, -13],
  [17.5, 7.2, -13],
  [-13, 2.4, 8],
  [-21, 2.4, 8],
  [-22, 5.5, 26],
  [-22, 2.5, -14],
  [8, 2.4, 30]
];

export const CHICKEN_HOME = { center: [-20, -14] as Vec2, radius: 9, count: 8 };

export const PATHS: [Vec2, Vec2][] = [
  [PLAZA.center, [15, -13]],
  [PLAZA.center, [-20, -20]],
  [PLAZA.center, [27, 4]],
  [PLAZA.center, [8, 26]],
  [PLAZA.center, [-20, 24]],
  [[27, 4], [27, 22]],
  [[15, -13], [18, -24]]
];

export function distXZ(ax: number, az: number, bx: number, bz: number) {
  return Math.hypot(ax - bx, az - bz);
}

export function isInPond(x: number, z: number) {
  const onIsland = distXZ(x, z, ISLAND.center[0], ISLAND.center[1]) < 2.4;
  return !onIsland && distXZ(x, z, POND.center[0], POND.center[1]) < POND.radius - 0.4;
}

export function isInMud(x: number, z: number) {
  return distXZ(x, z, MUD.center[0], MUD.center[1]) < MUD.radius - 0.3;
}
