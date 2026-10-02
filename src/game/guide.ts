import * as THREE from 'three';
import { create } from 'zustand';
import { gameNow } from './clock';
import {
  BALLOONS,
  BOWLING,
  EGG_NEST,
  FERRIS,
  GEYSERS,
  GIANT_CARROT,
  GOLDEN_STARS,
  HAT_RACK,
  HIGH_STRIKER,
  LAKE,
  LAUNCH_PADS,
  MAZE,
  MUSHROOMS,
  PAINT_BUCKETS,
  SEESAWS,
  SHIP,
  SLIDE_TOWER,
  SNACKS,
  SNOWBALLS,
  SNOWMAN_BUILD,
  SOCCER,
  TOILET,
  TRAMPOLINES,
  TREX,
  VOLCANO,
  WINDMILL,
  XYLOPHONE,
  BRONTO,
  CHICKEN_COOP,
  BUMPER,
  distXZ,
  SKY_COURSE,
  TRACTOR,
  ZIPLINE,
  SLED_RUN,
  TREES,
  SNOW_PILES,
  BUBBLE_MACHINE,
  TUBE_RIDE,
  WATER_SLIDE
} from './layout';
import { nearestTreasure } from './hunt';
import { flocks, parkCats } from './chase';
import { players } from './runtime';
import { useStickers, type StickerId } from './stickers';
import { useGame } from './store';

// "Show me where": pick a sticker you haven't got in the album, and an arrow over your animal
// points the way to where it can be earned, with a beam of light there. No reading needed.

/** Stickers that need a friend playing too. */
export const FRIEND_STICKERS: StickerId[] = ['ride', 'tower', 'throw', 'seesaw', 'trailer', 'carrotfriends', 'slidetogether', 'snowballfight'];
/** Friend stickers that happen somewhere in particular (the guide goes there, not to the nearest friend). */
const FRIEND_PLACES: StickerId[] = ['seesaw', 'trailer', 'carrotfriends', 'slidetogether', 'snowballfight'];

type P = [number, number];
const snack = (kind: string): P[] => SNACKS.filter((s) => s.kind === kind).map((s) => [s.position[0], s.position[2]]);

/** Where to go to get each star (the launcher that gets you up there, or the star itself). */
const STAR_APPROACH: (P | null)[] = [
  GEYSERS[0],
  [FERRIS.center[0], FERRIS.center[2] + FERRIS.radius + 1],
  [SOCCER.goalCenter[0], SOCCER.goalCenter[2] + 2],
  VOLCANO.center,
  [SLIDE_TOWER.base[0], SLIDE_TOWER.base[2]],
  [SHIP.center[0], SHIP.center[1] - SHIP.width / 2 - 6], // the gangplank up to the cannon
  [LAUNCH_PADS[1].position[0], LAUNCH_PADS[1].position[2]],
  [LAUNCH_PADS[0].position[0], LAUNCH_PADS[0].position[2]],
  MUSHROOMS[4].center,
  MAZE.center,
  BRONTO.center,
  null // on the train: it comes round by itself
];

/** Fixed places for each sticker (the nearest one is used). */
const PLACES: Partial<Record<StickerId, P[]>> = {
  poopbirds: snack('kibble'),
  poop: snack('kibble'),
  golden: snack('kibble'),
  toot: snack('kibble'),
  full: snack('kibble'),
  flush: [[TOILET.position[0], TOILET.position[2]]],
  geyser: GEYSERS,
  pad: LAUNCH_PADS.map((p) => [p.position[0], p.position[2]] as P),
  cannon: [STAR_APPROACH[5]!],
  volcano: [VOLCANO.center],
  seesaw: SEESAWS.map((s) => s.center),
  bellyflop: TRAMPOLINES.map((t) => [t.position[0], t.position[2]] as P),
  giant: snack('mushroom'),
  rocket: snack('beans'),
  fire: snack('chili'),
  goal: [[SOCCER.kickoff[0], SOCCER.kickoff[2]]],
  strike: [[BOWLING.ballStart[0], BOWLING.ballStart[2]]],
  bell: [[HIGH_STRIKER.position[0], HIGH_STRIKER.position[2] + 1.5]],
  dino: [EGG_NEST.center],
  roar: [[TREX.position[0], TREX.position[2]]],
  balloon: BALLOONS.map((b) => [b[0], b[2]] as P),
  hat: [HAT_RACK.center],
  swim: [[LAKE.center[0] + 4, LAKE.center[1] - 4]],
  snowball: SNOWBALLS.map((s) => [s[0], s[2]] as P),
  windmill: [[WINDMILL.position[0] + 3, WINDMILL.position[2]]],
  tube: [[TUBE_RIDE.jettyFrom + 3, TUBE_RIDE.jettyZ]],
  sled: SLED_RUN.starts,
  // the animals' tricks: somewhere each one works well (you need to be that animal, of course)
  climb: TREES.map((t) => t.at),
  glide: [[SLIDE_TOWER.base[0], SLIDE_TOWER.base[2]]],
  sheepbounce: TRAMPOLINES.map((t) => [t.position[0], t.position[2]] as P),
  goatbonk: [[SOCCER.kickoff[0], SOCCER.kickoff[2]]],
  moo: [[BOWLING.pins[0][0], BOWLING.pins[0][1] - 3]],
  tractor: [TRACTOR.home],
  zipline: [ZIPLINE.from],
  chickens: [[CHICKEN_COOP.center[0], CHICKEN_COOP.center[1] - CHICKEN_COOP.size / 2 - 3]],
  bumper: [[BUMPER.center[0], BUMPER.center[1] + BUMPER.size[1] / 2 + 1]],
  trailer: [TRACTOR.home],
  course: [SKY_COURSE.pad],
  snowman: [[SNOWMAN_BUILD.center[0] - 2.5, SNOWMAN_BUILD.center[1] + 1.5]],
  tune: [[XYLOPHONE.center[0], XYLOPHONE.center[1] + 3.5]],
  bigtune: [[XYLOPHONE.center[0], XYLOPHONE.center[1] + 3.5]],
  carrot: [[GIANT_CARROT.at[0], GIANT_CARROT.at[1] + 3.5]],
  carrotfriends: [[GIANT_CARROT.at[0], GIANT_CARROT.at[1] + 3.5]],
  waterslide: [[WATER_SLIDE.tower[0], WATER_SLIDE.tower[1] - 1.6 - WATER_SLIDE.stairs - 1.5]],
  slidetogether: [[WATER_SLIDE.tower[0], WATER_SLIDE.tower[1] - 1.6 - WATER_SLIDE.stairs - 1.5]],
  snowballfight: SNOW_PILES.map(([x, z]): P => [x, z - 1.8]),
  paint: [[PAINT_BUCKETS.center[0], PAINT_BUCKETS.center[1] + 2.5]],
  bubble: [[BUBBLE_MACHINE.at[0] - 3, BUBBLE_MACHINE.at[1] - 3]],
  rainbowpaint: [[PAINT_BUCKETS.center[0], PAINT_BUCKETS.center[1] + 2.5]]
};

/** Stickers for the treasure hunt: the guide leads to the nearest treasure still hidden. */
const TREASURE_STICKERS: StickerId[] = ['treasure', 'hunt', 'sniff'];

/** Stickers found by chasing: the guide leads to the nearest cat or flock of birds. */
const CAT_STICKERS: StickerId[] = ['cattag', 'cattree', 'allcats'];
const BIRD_STICKERS: StickerId[] = ['birds', 'birdbonk'];

/** Is there somewhere to go for this sticker (right now)? */
export function hasGuide(id: StickerId) {
  // friends: lead to the nearest friend (the see-saw has a place of its own)
  const toFriend = FRIEND_STICKERS.includes(id) && !FRIEND_PLACES.includes(id);
  return toFriend || id === 'star' || id === 'allstars' || TREASURE_STICKERS.includes(id) || CAT_STICKERS.includes(id) || BIRD_STICKERS.includes(id) || !!PLACES[id];
}

const nearest = (from: THREE.Vector3, places: P[], out: THREE.Vector3) => {
  let best = Infinity;
  for (const [x, z] of places) {
    const d = distXZ(from.x, from.z, x, z);
    if (d < best) {
      best = d;
      out.set(x, 0, z);
    }
  }
  return best < Infinity;
};

/**
 * Where the guide for `id` points, seen from `from` (a player). Some targets move: the
 * nearest friend, the nearest star still to find. Returns false when there's nowhere to go.
 */
export function guideTarget(id: StickerId, from: THREE.Vector3, fromSlot: number, out: THREE.Vector3) {
  if (FRIEND_STICKERS.includes(id) && !FRIEND_PLACES.includes(id)) {
    let best = Infinity;
    players.forEach((p) => {
      if (p.slot === fromSlot || p.asleep) return;
      const d = p.position.distanceTo(from);
      if (d < best) {
        best = d;
        out.set(p.position.x, 0, p.position.z);
      }
    });
    return best < Infinity;
  }
  if (TREASURE_STICKERS.includes(id)) return nearestTreasure(from, out);
  if (CAT_STICKERS.includes(id)) {
    // a cat up a tree for that one, if there is one; any cat will do otherwise
    const inTree = parkCats.filter((c) => c.mode === 'tree');
    const list = id === 'cattree' && inTree.length ? inTree : parkCats.filter((c) => c.mode !== 'tree');
    return nearest(from, (list.length ? list : parkCats).map((c) => [c.position.x, c.position.z] as P), out);
  }
  if (BIRD_STICKERS.includes(id)) {
    const landed = flocks.filter((f) => f.landed);
    return nearest(from, (landed.length ? landed : flocks).map((f) => [f.center.x, f.center.z] as P), out);
  }
  if (id === 'star' || id === 'allstars') {
    const stars = useGame.getState().stars;
    const open: P[] = [];
    GOLDEN_STARS.forEach((s, i) => {
      if (stars[i] || s === 'train' || !STAR_APPROACH[i]) return;
      open.push(STAR_APPROACH[i]!);
    });
    return nearest(from, open, out);
  }
  const places = PLACES[id];
  return !!places && nearest(from, places, out);
}

/** What the guide arrows are doing (for tests). */
export const guideDebug = { arrows: [] as { visible: boolean; yaw: number }[], beams: [] as { visible: boolean; x: number; z: number }[] };

/** How long a guide stays up without being followed (seconds). */
export const GUIDE_TIME = 120;

export const useGuide = create<{ sticker: StickerId | null; since: number; start: (id: StickerId) => void; stop: () => void }>((set) => ({
  sticker: null,
  since: 0,
  start: (id) => set({ sticker: id, since: gameNow() }),
  stop: () => set({ sticker: null })
}));

// The guide ends when its sticker is earned.
useStickers.subscribe((s) => {
  const g = useGuide.getState();
  if (g.sticker && s.got.includes(g.sticker)) g.stop();
});
