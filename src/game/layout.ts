// Single source of truth for where things live in the park.
// x → east, z → south (towards the camera), y → up. The park is 160 × 130 m: hedges at
// x ±WORLD_HALF_X and along the north edge, the sea along the south edge.
//
//        Carnival        Mountain (winter on top)      Sports
//        Forest & maze   Fountain hub  ~river~         Dino park
//        Farm            Beach & lagoon                Playground
//        ~~~~~~~~~~~~~~~~~~~~~~ the sea ~~~~~~~~~~~~~~~~~~~~~~~~~
//
// The little train loops round the hub: through a tunnel at the mountain's foot, over the
// river, past the station, and along a trestle over the water. Every zone is laid out relative
// to its anchor in ZONES, so a whole zone can be moved by changing one number.

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export const ZONES = {
  hub: [-6, 0] as Vec2,
  carnival: [-50, -26] as Vec2,
  forest: [-58, 6] as Vec2,
  farm: [-50, 36] as Vec2,
  beach: [-4, 44] as Vec2,
  playground: [56, 38] as Vec2,
  dino: [60, -4] as Vec2,
  sports: [58, -44] as Vec2,
  winter: [12, -56] as Vec2
};

/** A point some way from a zone's anchor. */
export const at = (o: Vec2, dx: number, dz: number): Vec2 => [o[0] + dx, o[1] + dz];
export const at3 = (o: Vec2, dx: number, y: number, dz: number): Vec3 => [o[0] + dx, y, o[1] + dz];
const Z = ZONES;

// ---------------------------------------------------------------------------
// The lie of the land (see terrain.ts): a mountain across the north with a flat top the
// winter zone sits on, a stream down its south face that becomes the river, a lagoon at the
// beach, and the sea along the whole south edge.

export const WATER_LEVEL = -0.15;
/** The mountain: a plateau (a thick line from `a` to `b`, `radius` wide) `level` high, with slopes `slope` wide that you can walk straight up. */
export const MOUNTAIN = { a: [2, -58] as Vec2, b: [22, -58] as Vec2, radius: 12, level: 9, slope: 18 };
/** Where the sea begins (the beach slopes down into it over `shore` metres). */
export const SEA = { coast: 57, floor: -0.8, shore: 6 };
/** The lagoon at the beach: a round bay, open to the sea. */
export const LAKE = { center: Z.beach, radius: 12, floor: -0.7 };
/** The river: the spring on the mountain, the stream down its face, then flat all the way to the sea. `level` is the channel floor. */
export const RIVER: { p: Vec2; level: number }[] = [
  { p: [22, -46], level: 8.4 },
  { p: [22, -38], level: 4.4 },
  { p: [22, -30], level: 0.4 },
  { p: [22, -25], level: -0.6 },
  { p: [24, -10], level: -0.6 },
  { p: [26, 4], level: -0.6 },
  { p: [23, 18], level: -0.6 },
  { p: [26, 30], level: -0.6 },
  { p: [24, 44], level: -0.6 },
  { p: [26, 57], level: -0.6 },
  { p: [26, 64], level: -0.8 }
];
export const RIVER_HALF_WIDTH = 3;
export const RIVER_BANK = 2.5;

// ---------------------------------------------------------------------------
// Hub

export const PLAZA = { center: at(Z.hub, 0, 2), radius: 13 };
export const FOUNTAIN = { center: at(Z.hub, 0, -2), basinRadius: 5.5, topHeight: 3.4 };
export const GEYSERS: Vec2[] = [at(Z.hub, -8.5, 5), at(Z.hub, 8.5, 5), at(Z.hub, 0, 10.5)];
export const HAT_BOX = { position: at3(Z.hub, -9, 0, -7), size: 1.6 };
export const RED_BUTTON = { position: at3(Z.hub, 9, 0, -7), radius: 1.2 };
/** The hat rack: one wooden head per hat, in unlock order, facing the plaza. */
export const HAT_RACK = { center: at(Z.hub, -4.85, -10.3), spacing: 0.85, headHeight: 1.05 };
export const SPAWN_POINTS: Vec3[] = [at3(Z.hub, -2.5, 1, 8), at3(Z.hub, 2.5, 1, 8), at3(Z.hub, -4.5, 1, 11), at3(Z.hub, 4.5, 1, 11)];
export const LAMP_POSTS: Vec2[] = [at(Z.hub, -11, 3), at(Z.hub, 11, 3), at(Z.hub, -9, -11), at(Z.hub, 9, -11)];
export const TOILET = { position: at3(Z.hub, 10.8, 0, -2), seatHeight: 1.05 };
/** The picnic blanket, on the way from the plaza to the beach. */
export const PICNIC = { center: [3, 23] as Vec2, size: 2.8 };
/** The lawn east of the plaza: a level, open patch of grass to run about on (and the cats' favourite hunting ground). */
export const LAWN = { center: [12, -4] as Vec2, radius: 8 };

// ---------------------------------------------------------------------------
// Carnival

export const FERRIS = { center: at3(Z.carnival, 0, 11, -10), radius: 9, gondolas: 8, speed: 0.17 };
export const CAROUSEL = { center: at(Z.carnival, -11, 3), radius: 5, speed: 0.55 };
export const HIGH_STRIKER = { position: at3(Z.carnival, 10, 0, 4), height: 8 };
/** Ice-cream stalls (the ice creams sit on the counters). */
export const STALLS: { position: Vec3; colors: [string, string] }[] = [
  { position: at3(Z.carnival, -9, 0, 11), colors: ['#ff4d5e', '#ffffff'] },
  { position: at3(Z.carnival, 9, 0, 13), colors: ['#3b82f6', '#ffffff'] }
];
/** The bumper cars: a floor with a low rail round it (a gap on the south side to walk in), and four cars. */
export const BUMPER = { center: at(Z.carnival, 2, 5), size: [10, 9] as Vec2, gate: 2.4, cars: 4 };
export const BUNTING_POLES: Vec2[] = [at(Z.carnival, -20, 12), at(Z.carnival, -8, 14), at(Z.carnival, 6, 14), at(Z.carnival, 14, 9), at(Z.carnival, 14, -4)];

// ---------------------------------------------------------------------------
// Sports

export const SOCCER = {
  goalCenter: at3(Z.sports, 0, 0, -12.5),
  goalWidth: 7,
  goalHeight: 2.8,
  goalDepth: 2.2,
  kickoff: at3(Z.sports, 0, 0.8, -2),
  field: { center: at(Z.sports, 0, -4), size: [16, 17] as Vec2 }
};

const LANE_X = Z.sports[0] + 13;
const LANE_FROM = Z.sports[1] + 4;
export const BOWLING = {
  laneX: LANE_X,
  laneFrom: LANE_FROM,
  laneTo: Z.sports[1] + 22,
  ballStart: [LANE_X, 0.6, Z.sports[1] + 19.5] as Vec3,
  pins: [
    [LANE_X, LANE_FROM + 5.4],
    [LANE_X - 0.4, LANE_FROM + 4.7],
    [LANE_X + 0.4, LANE_FROM + 4.7],
    [LANE_X - 0.8, LANE_FROM + 4],
    [LANE_X, LANE_FROM + 4],
    [LANE_X + 0.8, LANE_FROM + 4]
  ] as Vec2[]
};

/** A good place to fish (lick the water): the lagoon's north shore (east of where the beach ball floats), facing the water (south). */
export const FISHING_SPOT = [5, 33.7] as Vec2;
/** Hamster balls: four giant clear balls waiting in a row on the grass at the top of the bowling lane (roll down it!). */
export const HAMSTER = { radius: 1.1, homes: [0, 1, 2, 3].map((i): Vec2 => [LANE_X, Z.sports[1] + 28 + (i - 1.5) * 2.6]) };
export const CRATE_TOWER = { base: at3(Z.sports, -12, 0, 14), size: 1.2, rows: 4 };
/**
 * Giant dominoes: a winding row on the grass north of the soccer field, one every `spacing`
 * metres along a smooth line through `points` (first to last). The bell stands past the last one.
 */
export const DOMINOES = {
  points: ([[-2, 18], [5, 18], [8, 15], [5, 12], [-1, 12], [-3, 9], [0, 6.5], [7, 6.5]] as Vec2[]).map(([x, z]): Vec2 => [Z.sports[0] + x, Z.sports[1] + z]),
  spacing: 1,
  height: 1.8
};
export const CONES: Vec3[] = [at3(Z.sports, -9, 0.4, 5), at3(Z.sports, 9, 0.4, 5), at3(Z.sports, -9, 0.4, -12), at3(Z.sports, 9, 0.4, -12), at3(Z.sports, -18, 0.4, 16), at3(Z.sports, -15, 0.4, 18)];

// ---------------------------------------------------------------------------
// Dino park

export const VOLCANO = { center: at(Z.dino, 4, 8), baseRadius: 9.5, height: 7, craterRadius: 2.2 };
export const BRONTO = { center: at(Z.dino, -1, -10) };
export const TREX = { position: at3(Z.dino, -13, 0, 14) };
export const EGG_NEST = { center: at(Z.dino, -9, 3), eggs: 5 };
/** The pad that drops you into the volcano's crater (the dino park places it). */
export const DINO_PAD = at3(Z.dino, -8, 0, 10.5);

// ---------------------------------------------------------------------------
// Playground

export const SLIDE_TOWER = { base: at3(Z.playground, -12, 0, -7), height: 5 };
export const BOUNCY_CASTLE = { center: at(Z.playground, 11, -7), size: 7 };
export const BALL_PIT = { center: at(Z.playground, 12, 7), size: 6 };
/** The swings on the playground's east side: a beam along x with a seat for each child, swinging north–south (forwards is south, towards the camera). */
export const SWINGS = { center: at(Z.playground, 16.5, 0), seats: 4, spacing: 2.2 };
export const SEESAWS: { center: Vec2; angle: number }[] = [
  { center: at(Z.playground, -3, 10), angle: 0 },
  { center: at(Z.playground, 3, 4), angle: Math.PI / 2 }
];
/**
 * The giant xylophone: eight keys in a row, low notes to the west, each a little shorter than the
 * one before. `pitch`: key to key; `width` × `depth`: the keys (the first and the last depth);
 * `top`: how high they stand. The songbird sings from its post behind them.
 */
export const XYLOPHONE = { center: at(Z.playground, -3.5, -1.5), pitch: 1.62, width: 1.5, depth: [3.4, 2.5] as Vec2, top: 0.22, bird: at(Z.playground, -3.5, -4.7) };
/** Paint buckets in a row at the north end of the playground (red, yellow, blue, green): headbutt one over. */
export const PAINT_BUCKETS = { center: at(Z.playground, 6, -13), spacing: 2.1 };
export const TRAMPOLINES: { position: Vec3; radius: number }[] = [
  { position: at3(Z.playground, -16, 0, 4), radius: 1.8 },
  { position: at3(Z.playground, -11, 0, 9), radius: 1.8 },
  { position: at3(Z.playground, -6, 0, 4), radius: 1.8 }
];
export const TRAMPOLINE_TOP = 0.14;

// ---------------------------------------------------------------------------
// Beach & lagoon

export const ISLAND = { center: at(Z.beach, 0, 3), sphereRadius: 7, height: 0.8 };
export const LIGHTHOUSE = { center: ISLAND.center, height: 9, radius: 1.2, balcony: 2.4 };
/** The pirate ship, afloat at the lagoon's edge, its gangplank down to the sand. */
export const SHIP = { center: at(Z.beach, -8, -6), deck: 1.8, length: 9, width: 3.6 };
/**
 * The water slide on the lagoon's east shore: a tower with stairs up its north side, and two
 * slides side by side that wind west and south down into the lagoon. `path`: the middle of the
 * two slides (x, height above the sand, z), from the top of the tower to the end over the water.
 */
export const WATER_SLIDE = {
  tower: at(Z.beach, 20, -3),
  height: 5,
  stairs: 8,
  lane: 0.65,
  path: [
    [14.7, 5.0, 41.0],
    [12.6, 4.6, 40.6],
    [10.7, 4.0, 41.6],
    [10.0, 3.3, 43.6],
    [10.9, 2.7, 45.6],
    [10.2, 2.1, 47.6],
    [8.2, 1.6, 48.8],
    [6.0, 1.1, 49.2]
  ] as Vec3[]
};
export const SANDCASTLES: Vec2[] = [at(Z.beach, 6, -15), at(Z.beach, 12, -11), at(Z.beach, -13, -11)];
export const UMBRELLAS: { position: Vec3; colors: [string, string] }[] = [
  { position: at3(Z.beach, -5, 0, -16), colors: ['#ff4d5e', '#ffffff'] },
  { position: at3(Z.beach, 15, 0, -8), colors: ['#3b82f6', '#ffd23f'] }
];

// ---------------------------------------------------------------------------
// Winter: on top of the mountain. Everything here stands `level` metres up.

export const WINTER = { level: MOUNTAIN.level };
export const SNOW = { center: Z.winter, radius: 13 };
/** The summit: a round snowy top above the plateau (a launch pad at the foot gets you up). */
export const SNOW_HILL = { center: at(Z.winter, -10, -3), radius: 8, height: 4 };
export const SKI_JUMP = { base: at3(Z.winter, 18, WINTER.level, 2), height: 4.5 };
export const ICE = { center: at(Z.winter, 0, 6), radius: 4.5 };
export const SNOWMEN: Vec2[] = [at(Z.winter, -16, 6), at(Z.winter, 6, -2), at(Z.winter, 21, -6), at(Z.winter, -14, 8)];
/**
 * The zipline: from a platform on the south rim of the mountain top, right over the park, down
 * to a pole in the lagoon. `platform`: how high the platform stands; `cable`: the cable's height
 * above the platform. The end is `endHeight` above the water, so you drop in with a splash.
 */
/**
 * The hot air balloon: it waits on its pad on the grass by the T-rex, between the plaza and the
 * playground (off the lawn next to the plaza, where everybody walks past). Its flight is a loop
 * through `route` (east of the zipline, so it never crosses the cable) at `height` above the sea.
 */
export const BALLOON = {
  pad: [41, 14.5] as Vec2,
  height: 16,
  route: [[41, 14.5], [52, 24], [60, 40], [42, 50], [20, 42], [14, 24], [24, 10], [41, 14.5]] as Vec2[]
};
export const ZIPLINE = { from: [4.2, -48.9] as Vec2, platform: 0.8, cable: 3.2, to: [-4, 38] as Vec2, endHeight: 4 };
/** A flag on the summit, beside where the launch pad lands you. */
export const SUMMIT_FLAG = at(SNOW_HILL.center, 1.8, -1.2);
export const SNOWBALLS: Vec3[] = [at3(Z.winter, 2, WINTER.level + 1, -4), at3(Z.winter, -5, WINTER.level + 1, 7), at3(Z.winter, 11, WINTER.level + 1, -3)];
/** The bubble machine, on the grass between the plaza and the beach; it blows its bubbles towards the plaza. */
export const BUBBLE_MACHINE = { at: [8, 16] as Vec2, blow: -Math.PI * 0.8 };
/** Snowball fight: two snow piles with little snowballs to throw (lick one, lick again to throw). */
export const SNOW_PILES: Vec2[] = [at(Z.winter, 4, -4), at(Z.winter, 12, -8)];
/** Where you build your own snowman: roll a big snowball into the ring, then two more onto it. */
export const SNOWMAN_BUILD = { center: at(Z.winter, 9, 2), radius: 1.4 };

// ---------------------------------------------------------------------------
// Farm

export const BARN = { center: at(Z.farm, -7, -7), width: 10, depth: 8, wallHeight: 5, ridgeHeight: 8.2 };
export const SILO = { center: at(Z.farm, -11.5, 4), radius: 2.2, height: 9 };
export const WINDMILL = { position: at3(Z.farm, -11, 0, 15) };
export const MUD = { center: at(Z.farm, 7, -7), radius: 3.5 };
/** The farm tractor (and its trailer): parked east of the barn, facing the way out (+x). */
export const TRACTOR = { home: at(Z.farm, 6, -0.5), yaw: Math.PI / 2 };
export const PASTURE = { center: at(Z.farm, -1, 10), size: [12, 8] as Vec2 };
export const CHICKEN_HOME = { center: at(Z.farm, 4, 0), radius: 8, count: 8 };
/** The giant carrot in the vegetable garden, south of the melons: grab its leaves with your tongue and pull (friends pull from the other sides). `pull`: how far out the pullers stand. */
export const GIANT_CARROT = { at: at(Z.farm, -18.5, 5.2), pull: 2.4 };
/** The chicken coop: a fenced pen east of the pasture, the gate in its north side (towards the chickens' yard). */
export const CHICKEN_COOP = { center: at(Z.farm, 9, 12), size: 5.5, gate: 2.4, fence: 1.1 };
/** The melon field, out on the grass west of the silo (clear of the railway embankment on the farm's east side). */
export const MELON_PATCH: Vec2[] = [at(Z.farm, -20, -3), at(Z.farm, -17.5, -3), at(Z.farm, -15, -3), at(Z.farm, -20, -0.5), at(Z.farm, -17.5, -0.5), at(Z.farm, -15, -0.5)];
export const FARM_PROPS: { kind: 'hay' | 'barrel'; position: Vec3; rotation?: Vec3; color?: string }[] = [
  { kind: 'hay', position: at3(Z.farm, -0.5, 0.62, -12.5), rotation: [0, 0, Math.PI / 2] },
  { kind: 'hay', position: at3(Z.farm, -2.9, 0.62, -12.8), rotation: [0, 0.3, Math.PI / 2] },
  { kind: 'hay', position: at3(Z.farm, 1.5, 0.55, -7) },
  { kind: 'barrel', position: at3(Z.farm, -4, 0.5, -1.5) },
  { kind: 'barrel', position: at3(Z.farm, -5.2, 0.5, -2.3), color: '#3b82f6' },
  { kind: 'barrel', position: at3(Z.farm, -12, 0.5, -1), color: '#22c55e' }
];

// ---------------------------------------------------------------------------
// Forest & maze

export const MUSHROOMS: { center: Vec2; height: number; radius: number; color: string }[] = [
  { center: at(Z.forest, 13, 6), height: 1.8, radius: 2.3, color: '#ff4d5e' },
  { center: at(Z.forest, 17, 1), height: 3.4, radius: 2.1, color: '#a855f7' },
  { center: at(Z.forest, 14, -4.5), height: 5, radius: 2, color: '#3b82f6' },
  { center: at(Z.forest, 8, -5), height: 6.6, radius: 1.9, color: '#ff8fd8' },
  { center: at(Z.forest, 6, 1), height: 8.2, radius: 1.8, color: '#ffb020' }
];

const MAZE_C = at(Z.forest, -6, -4);
const mz = (x1: number, z1: number, x2: number, z2: number): [number, number, number, number] => [MAZE_C[0] + x1, MAZE_C[1] + z1, MAZE_C[0] + x2, MAZE_C[1] + z2];
export const MAZE = {
  center: MAZE_C,
  /** [x1, z1, x2, z2] hedge segments (axis aligned). */
  walls: [mz(-6, -6, 6, -6), mz(-6, -6, -6, 6), mz(-6, 6, -2, 6), mz(2, 6, 6, 6), mz(6, -6, 6, 6), mz(-3, -3, 3, -3), mz(-3, -3, -3, 3), mz(-3, 3, -1, 3), mz(3, -3, 3, 3), mz(1, 3, 3, 3)]
};
export const FALLEN_LOG = at3(Z.forest, -4, 0.55, 13);

// ---------------------------------------------------------------------------
// Landmarks in the open grass

/** Hills to run up and jump off: round bumps in the ground (the summit is one too). */
export const HILLS: { center: Vec2; radius: number; height: number }[] = [
  { center: [-30, -36], radius: 5.5, height: 2.5 },
  { center: [-27, 45], radius: 5, height: 2.2 },
  { center: [-36, -52], radius: 6, height: 2.6 }
];

/** Big boulders on the mountain's slopes: climb up, jump off. */
export const BOULDERS: { at: Vec2; r: number }[] = [
  { at: [-12, -42], r: 1.5 },
  { at: [8, -37], r: 1.1 },
  { at: [36, -57], r: 1.6 },
  { at: [-24, -63], r: 1.6 },
  { at: [45, -60], r: 1.3 },
  { at: [-3, -33], r: 0.9 }
];

/**
 * The mesa: a rocky outcrop at the mountain's foot with the train tunnel through it. The tunnel
 * runs along x (the north straight). You get on top from the mountainside: a short ramp from
 * the slope behind it. Its end rests a little above the top: a ramp that only meets a ledge
 * level with it leaves a step that stops a rolling animal.
 */
export const MESA = {
  center: [-14, -22] as Vec2,
  /** Half the tunnel's length (along x) and half the mesa's width (along z). */
  halfLength: 9,
  halfWidth: 6,
  /** The tunnel: this wide, this tall (the train is 2.4 m wide, 3.6 m tall with its chimney). */
  opening: 4.4,
  clearance: 4.2,
  roof: 1,
  rampFrom: [-14, 0, -38] as Vec3,
  rampTo: [-14, 5.5, -28.4] as Vec3
};

/**
 * A footbridge over the west straight, on the way to the farm: up the ramp from the hub side,
 * along the deck, look down on the train. The deck is a chunky box: a thin slab lets a fast
 * animal sink through.
 */
export const FOOTBRIDGE = { z: 36, height: 4.6, deckThickness: 1, rampFrom: -22, deckFrom: -30, deckTo: -39, width: 2.6 };

// ---------------------------------------------------------------------------
// Train: a rounded rectangle round the hub. Legs: north z = -22, east x = 34, south z = 56
// (over the water, on a trestle), west x = -34. The station is on the east straight.

export const TRAIN = {
  center: [0, 17] as Vec2,
  halfX: 34,
  halfZ: 39,
  cornerRadius: 10,
  speed: 6,
  /** The platform: along the east straight, between these z values, on the inside. */
  station: { from: 12, to: 26 }
};

/**
 * Every bridge over water is high enough to float under: its underside is at least this far
 * above the water (an animal standing on a river tube, ears and hat included, is 1.9 m).
 */
export const FLOAT_CLEARANCE = 2.1;

/**
 * Where the track crosses water it climbs onto a bridge, high enough to float (or swim) under:
 * up a grassy embankment `ramp` metres long to `height`, level across the water, and down
 * again. `from` and `to` are where each bridge's level top starts and ends: points on the
 * track, in the direction the train runs. The ramps keep clear of the station, the tunnel
 * and the footbridge over the west straight, where the track stays on the ground.
 */
export const TRACK_LIFTS = {
  height: 2.5,
  ramp: 14,
  deckThickness: 0.4,
  bridges: [
    { name: 'river bridge', from: [29.2, -20.6] as Vec2, to: [15.4, -22] as Vec2, style: 'stone' as const },
    { name: 'trestle', from: [-33.3, 49.8] as Vec2, to: [33.3, 49.6] as Vec2, style: 'wood' as const }
  ]
};
/** The river bridge (on the first of those lifts): where the track crosses the river. */
export const TRAIN_BRIDGE = { center: [22.5, -22] as Vec2, width: 3.4 };
/**
 * The path from the hub to the dino park crosses the river here, on an arched footbridge: the
 * river tubes float underneath (a rider standing on a tube is 1.1 m tall; the deck's underside
 * is at `height - deckThickness`).
 */
export const RIVER_FOOTBRIDGE = { z: -2, west: 16, east: 32, deckFrom: 22.4, deckTo: 27.8, width: 2.8, height: 2.65, deckThickness: 0.45 };
/** Stepping stones across the river on the way to the playground. */
export const STEPPING_STONES = { from: [20.5, 30] as Vec2, to: [31.5, 30] as Vec2, count: 7, radius: 0.75 };

// ---------------------------------------------------------------------------
// Rides on the new ground: rubber rings down the river, sleds down the mountain

/**
 * River tubing: rubber rings wait in a line at a jetty below the train bridge. Step onto the one
 * at the jetty and off it floats, down the middle of the river (the `course`, a smooth line
 * through these points), under the footbridge, to the take-out before the stepping stones,
 * where it tips you out onto the bank.
 */
export const TUBE_RIDE = {
  course: [[24, -19], [24, -10], [26, 4], [23, 18], [25.5, 28]] as Vec2[],
  jettyZ: -13,
  jettyFrom: 16.5,
  takeOutZ: 23,
  landing: [17.5, 23] as Vec2,
  count: 3,
  radius: 1.05,
  speed: 2.4
};

/**
 * Sledding: two sleds on the west rim of the mountain's top. Walk into one and it pushes off,
 * down the west face (steer with the stick), and throws you off where the run goes up the
 * hill at the mountain's foot.
 */
export const SLED_RUN = {
  starts: [[-6.5, -55], [-6.5, -52]] as Vec2[],
  /** How far a sled can be steered to either side of its start line. */
  laneHalfWidth: 3,
  kickX: -33,
  /** Star hoops floating over the run (both lanes can reach every one): through one = faster. */
  hoops: [[-14, -53.5], [-20, -54.4], [-26, -52.6]] as Vec2[],
  /** How far you fly off the hill: metres per m/s of speed at the kick, and extra for a jump right at the kick. */
  flyPerSpeed: 1.3,
  jumpBonus: 3.5,
  /** Never lands further than this (the sky course starts a little further on). */
  furthestX: -56,
  /** Coloured lines in the grass where you land: green, yellow, red. */
  markers: [-45, -48, -51],
  /** The landing field, across (z). */
  fieldZ: [-58.5, -48.5] as Vec2
};

// ---------------------------------------------------------------------------
// The sky course: a climb into the sky in the north-west corner, behind the carnival. Stumps, a
// spinning disc, a platform that slides to and fro, a bouncy cloud, wobbly planks on balloons,
// and a cloud at the top with a bell and a rainbow pad back down. It climbs away from the camera,
// so the high parts are never hidden behind the low ones. Heights are absolute (the ground rolls
// a little there). Every step is one that a jump (or the bouncy cloud) makes: never more than
// 1.2 m up, and at most 1.3 m across.

export const SKY_COURSE = {
  /** The start: a pad that takes you back up to the highest flag anyone has reached. */
  pad: [-61, -45.5] as Vec2,
  stumps: [
    { at: [-63.5, -47.5] as Vec2, top: 1.2 },
    { at: [-66, -48] as Vec2, top: 2.4 },
    { at: [-68.5, -47.5] as Vec2, top: 3.6 }
  ],
  stumpRadius: 0.9,
  /** The two wooden platforms (flags 1 and 2). */
  platforms: [
    { at: [-72, -47.5] as Vec2, top: 4.4, size: [3, 3] as Vec2 },
    { at: [-74, -57.5] as Vec2, top: 6, size: [3, 3] as Vec2 }
  ],
  disc: { at: [-74, -52.5] as Vec2, top: 5.2, radius: 2.2, speed: 0.8 },
  /** Slides along x between `from` and `to` (its centre), there and back in `period` seconds. */
  slider: { z: -57.5, from: -71.1, to: -65.9, top: 6, size: 2.4, period: 6 },
  bouncer: { at: [-63.3, -57.5] as Vec2, top: 6, radius: 1.2, bounce: 14 },
  /** The cloud the bouncer throws you up to (flag 3). */
  cloud: { at: [-63.5, -61] as Vec2, top: 9, size: [3, 3] as Vec2 },
  planks: [
    { at: [-67, -61] as Vec2, top: 9.6 },
    { at: [-69.5, -61] as Vec2, top: 10.2 },
    { at: [-72, -61] as Vec2, top: 10.8 }
  ],
  plankSize: [1.8, 1.3] as Vec2,
  plankBob: 0.25,
  /** The top cloud (flag 4): the bell, and the rainbow pad that flies you back down. */
  top: { at: [-75.5, -60.5] as Vec2, top: 11.4, size: [3.6, 4] as Vec2 },
  bell: [-74.4, -61.9] as Vec2,
  rainbowPad: [-76.4, -59.3] as Vec2,
  rainbowTarget: [-59.5, -52.5] as Vec2
};

/** The course's flags, in order: the two platforms, the cloud, the top. */
export const SKY_FLAGS: { at: Vec2; top: number; size: Vec2 }[] = [...SKY_COURSE.platforms, SKY_COURSE.cloud, SKY_COURSE.top];

// ---------------------------------------------------------------------------
// Launch pads (glowing arrows)

export type LaunchPadDef = { position: Vec3; target: Vec3; apex: number };
export const LAUNCH_PADS: LaunchPadDef[] = [
  { position: at3(Z.farm, 4, 0, -18), target: [BARN.center[0], BARN.ridgeHeight, BARN.center[1]], apex: 11.5 },
  { position: [10, 0, -29], target: [SNOW_HILL.center[0], WINTER.level + SNOW_HILL.height, SNOW_HILL.center[1]], apex: 18 },
  { position: [38, 0, -22], target: [CRATE_TOWER.base[0], 5, CRATE_TOWER.base[2]], apex: 9 }
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
  [SNOW_HILL.center[0], WINTER.level + SNOW_HILL.height + 1.4, SNOW_HILL.center[1]], // the summit (launch pad)
  [BARN.center[0], BARN.ridgeHeight + 1.4, BARN.center[1]], // barn roof (launch pad)
  [MUSHROOMS[4].center[0], MUSHROOMS[4].height + 2.2, MUSHROOMS[4].center[1]], // above the tallest mushroom
  [MAZE.center[0], 1.0, MAZE.center[1]], // hedge maze centre
  [BRONTO.center[0] + 9.2, 7.9, BRONTO.center[1]], // on the brontosaurus's head
  'train' // riding on the train's roof
];

// ---------------------------------------------------------------------------
// Food: lick it to fill your belly (and then... the poop button).

export type SnackKind = 'kibble' | 'cake' | 'carrot' | 'icecream' | MagicKind;
/** Magic food, floating on a little pedestal: beans (rocket toots), mushroom (giant), chili (fire). */
export type MagicKind = 'beans' | 'mushroom' | 'chili';
export const SNACKS: { kind: SnackKind; position: Vec3 }[] = [
  // dog bowls right next to where everyone spawns
  { kind: 'kibble', position: at3(Z.hub, -5, 0, 7.5) },
  { kind: 'kibble', position: at3(Z.hub, 5, 0, 7.5) },
  // cakes on the picnic blanket
  { kind: 'cake', position: [PICNIC.center[0] - 0.6, 0.06, PICNIC.center[1] - 0.6] },
  { kind: 'cake', position: [PICNIC.center[0] + 0.6, 0.06, PICNIC.center[1] + 0.4] },
  { kind: 'cake', position: [PICNIC.center[0] - 0.4, 0.06, PICNIC.center[1] + 0.7] },
  // carrot patch on the farm
  ...([[7, 5], [8.4, 5], [9.8, 5], [7, 6.6], [8.4, 6.6], [9.8, 6.6]] as Vec2[]).map((c) => ({ kind: 'carrot' as const, position: at3(Z.farm, c[0], 0, c[1]) })),
  // ice creams on the stall counters
  ...STALLS.flatMap((s) => [-0.6, 0.6].map((dx) => ({ kind: 'icecream' as const, position: [s.position[0] + dx, 1.2, s.position[2] + 0.4] as Vec3 }))),
  // the magic snack table on the west side of the plaza...
  { kind: 'beans', position: at3(Z.hub, -10.8, 0, -4.6) },
  { kind: 'mushroom', position: at3(Z.hub, -10.8, 0, -3.3) },
  { kind: 'chili', position: at3(Z.hub, -10.8, 0, -2) },
  // ...and one of each out in the park, where it fits
  { kind: 'beans', position: [-28, 0, 10] },
  { kind: 'mushroom', position: at3(Z.forest, 8, 0, 10) },
  { kind: 'chili', position: at3(Z.dino, -5, 0, 15) }
];

// ---------------------------------------------------------------------------
// Paths: from the signposts round the plaza out to each zone. They are level (the ground is
// pressed flat under them); the ones up the mountain follow the slope instead.

export const PATHS: [Vec2, Vec2][] = [
  [[-1, -14], [-1, -20]], // north, to the mountain path
  [[8, 0], [19, -2]], // east, to the river footbridge...
  [[31, -2], [40, -2]], // ...and on to the dino park
  [[40, -2], [46, -1]],
  [[40, -2], [46, -24]], // north from the dino junction to the sports
  [[6, 9], [20, 30]], // south-east, to the stepping stones...
  [[32, 30], [42, 34]], // ...and on to the playground
  [[-4, 15.6], [-4, 27]], // south, to the beach
  [[-15.5, 11.5], [-34, 22]], // south-west, over the track to the farm
  [[-34, 22], [-40, 22.5]],
  [[-20, 2.5], [-26, 4]], // west, to the forest
  [[-26, 4], [-37.5, 5]],
  [[-16.5, -8.5], [-36, -19]] // north-west, to the carnival
];
/**
 * The path up the mountain: drawn on the slope. The ground under it is graded to a straight
 * climb from the foot (`from`) to the plateau's edge (`to`), so there are no bumps on the way up.
 */
export const MOUNTAIN_PATHS: [Vec2, Vec2][] = [[[-1, -20], [2, -46]]];
export const MOUNTAIN_PATH_GRADE = { from: [-1, -28] as Vec2, to: [2, -46] as Vec2 };
export const PATH_WIDTH = 2.6;

/** Pictogram signposts at the plaza edge, pointing at each zone. */
export const SIGNS: { position: Vec2; zone: keyof typeof ZONES; icon: string }[] = [
  { position: [-1, -12.4], zone: 'winter', icon: '⛄' },
  { position: [4.6, -8.4], zone: 'sports', icon: '⚽' },
  { position: [8, 0], zone: 'dino', icon: '🦕' },
  { position: [6, 9], zone: 'playground', icon: '🛝' },
  { position: [-4, 15.6], zone: 'beach', icon: '🏝️' },
  { position: [-15.5, 11.5], zone: 'farm', icon: '🐄' },
  { position: [-20, 2.5], zone: 'forest', icon: '🍄' },
  { position: [-16.5, -8.5], zone: 'carnival', icon: '🎡' }
];

export const BALLOONS: Vec3[] = [
  at3(Z.hub, -5, 2.4, 9),
  at3(Z.hub, 5, 2.8, 9),
  at3(Z.hub, 0, 3.2, 13.5),
  at3(Z.carnival, 6, 3, 10),
  at3(Z.carnival, 9, 4, 8),
  at3(Z.carnival, -6, 3.4, 10),
  at3(Z.carnival, 16, 3, 4),
  at3(Z.playground, -16, 5.5, 4),
  at3(Z.playground, -6, 6, 4),
  at3(Z.playground, -11, 7.5, 9),
  at3(Z.playground, 11, 3.5, 0),
  [0, 2.4, 29],
  at3(Z.forest, 12, 2.6, 10),
  at3(Z.forest, 17, 4.5, 5)
];

// ---------------------------------------------------------------------------
// The chase: park cats (each has a home patch near some trees) and bird flocks (they land on
// open grass, and on a few high spots you need a launcher for)

export const CAT_HOMES: Vec2[] = [
  [15, -16],
  [-26, -4],
  [12, 30],
  [38, 8]
];

/**
 * Where treasure can be hidden: tucked beside something (a fence, a rock, a building), on open
 * ground with nothing overhead, off the railway and out of the water. Found by scanning the
 * park's physics for clear spots with something 1-2 m away; each round of the treasure hunt
 * hides one treasure in each of five different areas.
 */
export const TREASURE_SPOTS: { zone: keyof typeof ZONES; at: Vec2 }[] = (
  [
    ['hub', [[3, 14], [5, -18], [15, 4]]],
    ['carnival', [[-67, -26], [-33, -30], [-65, -42]]],
    ['forest', [[-41, -4], [-73, 22], [-39, 16]]],
    ['farm', [[-37.5, 52], [-65, 50]]],
    ['beach', [[-19, 44], [-9, 24]]],
    ['playground', [[55, 22], [39, 50], [39, 28], [71, 22]]],
    ['dino', [[53, -18], [71, 12], [53, 16]]],
    ['sports', [[51, -36], [71, -60], [43, -60], [39, -42]]],
    ['winter', [[11, -56], [33, -50], [-5, -48], [7, -44]]]
  ] as [keyof typeof ZONES, Vec2[]][]
).flatMap(([zone, list]) => list.map((at) => ({ zone, at })));

/**
 * Harder hiding places, somewhere up high or across the water (absolute surface height). Every
 * other round, one of the five treasures goes to one of these: up the gangplank onto the ship's
 * deck, up the ramp onto the mesa, a swim to the lighthouse island, the sky course's cloud,
 * bouncing on a big mushroom, and the footbridge over the railway.
 */
export const TREASURE_HIGH_SPOTS: { at: Vec2; y: number }[] = [
  { at: [-15.2, 38.3], y: 1.8 },
  { at: [-18, -20], y: 5.2 },
  { at: [-1.4, 48.6], y: 0.09 },
  { at: [-63, -60.5], y: 9 },
  { at: [-50, 1], y: 6.8 },
  { at: [-34.5, 36], y: 4.6 }
];

/** The treasure chest west of the plaza: one gem for every treasure hunt round ever finished. `yaw` turns it to face the plaza. */
export const TREASURE_CHEST = { position: [-21, 8] as Vec2, yaw: Math.PI / 2 };

/** Where bird flocks land: [x, height above the ground, z, spread radius]. */
export const BIRD_SPOTS: [number, number, number, number][] = [
  [-12, 0, 14, 2.2],
  [3, 0, -14, 2.2],
  [SOCCER.field.center[0], 0, SOCCER.field.center[1], 2.6],
  [PASTURE.center[0], 0, PASTURE.center[1], 2.6],
  [-15, 0, 25, 2],
  [-48, 0, -10, 2.2],
  [10, 0, 7, 2],
  [63.5, 0, 38, 2.2],
  [-52, 0, -4, 2],
  [20, 0, -62, 2],
  [-22, 0, -44, 2.2],
  [FOUNTAIN.center[0], FOUNTAIN.topHeight, FOUNTAIN.center[1], 0.9],
  [SHIP.center[0] + 1, SHIP.deck, SHIP.center[1], 1.3]
];
export const BIRD_FLOCKS = 4;

export type TreeKind = 'round' | 'blossom' | 'pine' | 'palm' | 'snowpine';
const treesOf = (kind: TreeKind | ((i: number) => TreeKind), list: Vec2[]) => list.map((at, i) => ({ at, kind: typeof kind === 'function' ? kind(i) : kind }));
export const TREES: { at: Vec2; kind: TreeKind }[] = [
  // forest (dense)
  ...treesOf((i) => (i % 3 === 0 ? 'pine' : i % 3 === 1 ? 'round' : 'blossom'), [
    [-74, 12], [-72, -2], [-66, -8], [-60, -9], [-54, -9], [-46, -4], [-72, 18], [-68, 22], [-47, 25], [-48, 21], [-40, 0], [-40, 12], [-64, 12], [-56, 12], [-54, 3], [-70, 24]
  ]),
  // round the hub, and between the hub and its neighbours
  ...treesOf((i) => (i % 2 === 0 ? 'round' : 'blossom'), [[-24, -10], [-30, -2], [-26, 30], [13, -13], [10, -12], [16, 12], [8, 26], [-30, -40], [-70, -26], [-66, -40], [-38, -42], [-66, 26], [-38, 31], [-63.5, 47]]),
  // east: by the sports, the dino park and the playground
  ...treesOf((i) => (i % 2 === 0 ? 'pine' : 'round'), [[40, -14], [72, 20], [74, -30], [50, -62], [40, -40], [40, -52], [38.5, 45.5], [46, 26]]),
  // on the mountain's slopes
  ...treesOf('pine', [[-16, -46], [34, -36], [-8, -36], [32, -30], [44, -50]]),
  // beach palms
  ...treesOf('palm', [[-22, 30], [-19, 42], [12, 44], [16, 50], [-22, 52], [38, 51]]),
  // snow pines on the plateau
  ...treesOf('snowpine', [[-6, -64], [36, -62], [32, -48], [-12, -46], [14, -64], [8, -45], [-2, -63]])
];

export function distXZ(ax: number, az: number, bx: number, bz: number) {
  return Math.hypot(ax - bx, az - bz);
}

/** Down among the balls in the ball pit (wading is slow). */
export function isInBallPit(x: number, y: number, z: number) {
  const half = BALL_PIT.size / 2;
  return Math.abs(x - BALL_PIT.center[0]) < half && Math.abs(z - BALL_PIT.center[1]) < half && y < 1.2;
}

export function isInMud(x: number, z: number) {
  return distXZ(x, z, MUD.center[0], MUD.center[1]) < MUD.radius - 0.3;
}

export function isOnSnow(x: number, z: number) {
  return distXZ(x, z, SNOW.center[0], SNOW.center[1]) < SNOW.radius;
}

export function isInFountain(x: number, z: number) {
  return distXZ(x, z, FOUNTAIN.center[0], FOUNTAIN.center[1]) < FOUNTAIN.basinRadius - 0.3;
}

/** Coloured ground in each area. Everything outside these (and the paths) is grass. */
export type FloorKind = 'forest' | 'dirt' | 'dino' | 'rubber' | 'carnival' | 'snow' | 'sand' | 'plaza';
export const FLOOR_PATCHES: { center: Vec2; radius: number; kind: FloorKind; y: number }[] = [
  { center: Z.forest, radius: 18, kind: 'forest', y: 0.006 },
  { center: Z.farm, radius: 13, kind: 'dirt', y: 0.007 },
  { center: at(Z.dino, 0, 2), radius: 15.5, kind: 'dino', y: 0.007 },
  { center: at(Z.playground, -1, 1), radius: 15, kind: 'rubber', y: 0.007 },
  { center: Z.carnival, radius: 15, kind: 'carnival', y: 0.007 },
  { center: SNOW.center, radius: SNOW.radius, kind: 'snow', y: 0.008 },
  { center: LAKE.center, radius: LAKE.radius + 2.6, kind: 'sand', y: 0.009 },
  { center: PLAZA.center, radius: PLAZA.radius, kind: 'plaza', y: 0.01 }
];

export function distToSegment(x: number, z: number, a: Vec2, b: Vec2) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / Math.max(1e-6, dx * dx + dz * dz)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}

export function isOnPath(x: number, z: number) {
  return PATHS.some(([a, b]) => distToSegment(x, z, a, b) < PATH_WIDTH / 2) || MOUNTAIN_PATHS.some(([a, b]) => distToSegment(x, z, a, b) < PATH_WIDTH / 2);
}

/** Somewhere an animal can nibble grass (the forest floor counts; water, snow and sand don't). */
export function isOnGrass(x: number, z: number) {
  if (isInFountain(x, z)) return false;
  const onPath = isOnPath(x, z);
  // patches are drawn in order, later ones on top: the topmost one decides
  for (let i = FLOOR_PATCHES.length - 1; i >= 0; i -= 1) {
    const p = FLOOR_PATCHES[i];
    if (distXZ(x, z, p.center[0], p.center[1]) < p.radius) return p.kind === 'forest' && !onPath;
  }
  return !onPath;
}
