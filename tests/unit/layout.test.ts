import { describe, expect, it } from 'vitest';
import { WORLD_HALF_X, WORLD_HALF_Z } from '../../src/game/config';
import * as L from '../../src/game/layout';
import { groundHeight, mountainWeight, riverAt, trackDist } from '../../src/game/terrain';

// The park layout, checked for things standing where they shouldn't: on the train track, on a
// path, in the river, on top of each other, on the mountain's slope, in the sea or in the
// hedge. Things that float (balloons, stars, food on a counter) and things meant to be on a
// path (signposts, launch pads) are fine.

function segDist(x: number, z: number, a: L.Vec2, b: L.Vec2) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / Math.max(1e-6, dx * dx + dz * dz)));
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}
/** The train is 2.4 m wide: this much room is needed beside the track centre line. */
const TRAIN_ROOM = 1.3;

type Spot = { name: string; x: number; z: number; r: number; floats?: boolean; onPathOk?: boolean; slopeOk?: boolean; wet?: boolean; winter?: boolean };
const spots: Spot[] = [];
const add = (name: string, x: number, z: number, r: number, more: Partial<Spot> = {}) => spots.push({ name, x, z, r, ...more });
L.TREES.forEach((t, i) => add(`tree ${i} (${t.kind})`, t.at[0], t.at[1], t.kind === 'pine' || t.kind === 'snowpine' ? 1.8 : 1.7, { slopeOk: true }));
L.SNACKS.forEach((s, i) => add(`snack ${i} (${s.kind})`, s.position[0], s.position[2], 0.6, { floats: s.kind === 'icecream' || s.kind === 'cake' }));
L.SIGNS.forEach((s, i) => add(`sign ${i}`, s.position[0], s.position[1], 0.4, { onPathOk: true }));
L.LAUNCH_PADS.forEach((p, i) => add(`launch pad ${i}`, p.position[0], p.position[2], 1.4, { onPathOk: true }));
add('dino pad', L.DINO_PAD[0], L.DINO_PAD[2], 1.4, { onPathOk: true });
L.GEYSERS.forEach((g, i) => add(`geyser ${i}`, g[0], g[1], 1.2));
L.TRAMPOLINES.forEach((t, i) => add(`trampoline ${i}`, t.position[0], t.position[2], t.radius));
L.SEESAWS.forEach((s, i) => add(`see-saw ${i}`, s.center[0], s.center[1], 3.5));
L.CAT_HOMES.forEach((c, i) => add(`cat home ${i}`, c[0], c[1], 1));
L.BIRD_SPOTS.forEach((b, i) => add(`bird spot ${i}`, b[0], b[2], b[3], { onPathOk: true, floats: b[1] > 0, slopeOk: true, winter: mountainWeight(b[0], b[2]) === 1 }));
L.SNOWMEN.forEach((s, i) => add(`snowman ${i}`, s[0], s[1], 0.9, { winter: true }));
L.SNOWBALLS.forEach((s, i) => add(`snowball ${i}`, s[0], s[2], 0.5, { winter: true }));
add('ice pond', L.ICE.center[0], L.ICE.center[1], L.ICE.radius, { winter: true });
add('ski jump', L.SKI_JUMP.base[0], L.SKI_JUMP.base[2], 2.2, { winter: true });
add('ski jump ramp foot', L.SKI_JUMP.base[0], L.SKI_JUMP.base[2] - 1.6 - 7, 1.2, { winter: true });
add('summit', L.SNOW_HILL.center[0], L.SNOW_HILL.center[1], L.SNOW_HILL.radius, { winter: true });
L.MUSHROOMS.forEach((m, i) => add(`mushroom ${i}`, m.center[0], m.center[1], m.radius));
L.HILLS.forEach((h, i) => add(`hill ${i}`, h.center[0], h.center[1], h.radius));
L.BALLOONS.forEach((b, i) => add(`balloon ${i}`, b[0], b[2], 0.5, { floats: true, onPathOk: true }));
L.GOLDEN_STARS.forEach((s, i) => s !== 'train' && add(`star ${i}`, s[0], s[2], 0.5, { floats: true, onPathOk: true }));
// the set pieces
L.STALLS.forEach((s, i) => add(`stall ${i}`, s.position[0], s.position[2], 2.5));
L.BUNTING_POLES.forEach((b, i) => add(`bunting pole ${i}`, b[0], b[1], 0.3));
L.CONES.forEach((c, i) => add(`cone ${i}`, c[0], c[2], 0.4));
add('crate tower', L.CRATE_TOWER.base[0], L.CRATE_TOWER.base[2], 3);
add('high striker', L.HIGH_STRIKER.position[0], L.HIGH_STRIKER.position[2], 1.5);
add('carousel', L.CAROUSEL.center[0], L.CAROUSEL.center[1], L.CAROUSEL.radius + 0.5);
add('ferris wheel', L.FERRIS.center[0], L.FERRIS.center[2], L.FERRIS.radius + 0.5);
add('volcano', L.VOLCANO.center[0], L.VOLCANO.center[1], L.VOLCANO.baseRadius);
add('brontosaurus', L.BRONTO.center[0], L.BRONTO.center[1], 6);
add('t-rex', L.TREX.position[0], L.TREX.position[2], 3.5);
add('egg nest', L.EGG_NEST.center[0], L.EGG_NEST.center[1], 2.5);
add('slide tower', L.SLIDE_TOWER.base[0], L.SLIDE_TOWER.base[2], 2);
add('slide tower ramp foot', L.SLIDE_TOWER.base[0], L.SLIDE_TOWER.base[2] - 1.6 - 10, 1.2);
add('slide end', L.SLIDE_TOWER.base[0] + 1.6 + 9.5, L.SLIDE_TOWER.base[2], 1.2);
add('bouncy castle', L.BOUNCY_CASTLE.center[0], L.BOUNCY_CASTLE.center[1], L.BOUNCY_CASTLE.size / 2 + 1);
add('ball pit', L.BALL_PIT.center[0], L.BALL_PIT.center[1], L.BALL_PIT.size / 2 + 1);
add('barn', L.BARN.center[0], L.BARN.center[1], 4);
add('silo', L.SILO.center[0], L.SILO.center[1], L.SILO.radius + 0.2);
add('windmill', L.WINDMILL.position[0], L.WINDMILL.position[2], 2);
add('mud', L.MUD.center[0], L.MUD.center[1], L.MUD.radius);
add('tractor', L.TRACTOR[0], L.TRACTOR[2], 2);
L.FARM_PROPS.forEach((p, i) => add(`farm prop ${i} (${p.kind})`, p.position[0], p.position[2], 0.8));
L.MELON_PATCH.forEach((m, i) => add(`melon ${i}`, m[0], m[1], 0.7));
L.LAMP_POSTS.forEach((p, i) => add(`lamp post ${i}`, p[0], p[1], 0.3));
add('hat box', L.HAT_BOX.position[0], L.HAT_BOX.position[2], 0.9);
add('red button', L.RED_BUTTON.position[0], L.RED_BUTTON.position[2], L.RED_BUTTON.radius);
add('toilet', L.TOILET.position[0], L.TOILET.position[2], 1.2);
add('hat rack', L.HAT_RACK.center[0], L.HAT_RACK.center[1], 3.6);
add('fountain', L.FOUNTAIN.center[0], L.FOUNTAIN.center[1], L.FOUNTAIN.basinRadius + 0.2, { wet: true });
add('picnic', L.PICNIC.center[0], L.PICNIC.center[1], 2);
L.SANDCASTLES.forEach((c, i) => add(`sandcastle ${i}`, c[0], c[1], 1.2));
L.UMBRELLAS.forEach((u, i) => add(`umbrella ${i}`, u.position[0], u.position[2], 1.6));
add('ship', L.SHIP.center[0], L.SHIP.center[1], 5, { wet: true });
add('gangplank foot', L.SHIP.center[0], L.SHIP.center[1] - L.SHIP.width / 2 - 6, 1);
add('lighthouse island', L.ISLAND.center[0], L.ISLAND.center[1], 3.5, { wet: true });
add('fallen log', L.FALLEN_LOG[0], L.FALLEN_LOG[2], 2.6);
add('mesa ramp foot', L.MESA.rampFrom[0], L.MESA.rampFrom[2], 1.5, { slopeOk: true });
add('footbridge ramp foot', L.FOOTBRIDGE.rampFrom, L.FOOTBRIDGE.z, 1.5);
L.SPAWN_POINTS.forEach((p, i) => add(`spawn ${i}`, p[0], p[2], 0.6));
L.MAZE.walls.forEach((w, i) => add(`maze wall ${i}`, (w[0] + w[2]) / 2, (w[1] + w[3]) / 2, 0.45));

const river = { d: 0, level: 0 };
const nearRiver = (x: number, z: number, r: number) => riverAt(x, z, river).d < L.RIVER_HALF_WIDTH + L.RIVER_BANK + r;

describe('park layout', () => {
  it('keeps everything off the train track', () => {
    const out: string[] = [];
    for (const s of spots) {
      const d = trackDist(s.x, s.z);
      if (d < s.r + TRAIN_ROOM) out.push(`${s.name} at (${s.x}, ${s.z}) is ${d.toFixed(1)} m from the track centre, needs ${(s.r + TRAIN_ROOM).toFixed(1)}`);
    }
    L.MAZE.walls.forEach((w, i) => {
      for (let t = 0; t <= 1; t += 0.05) {
        const x = w[0] + (w[2] - w[0]) * t;
        const z = w[1] + (w[3] - w[1]) * t;
        if (trackDist(x, z) < 0.45 + TRAIN_ROOM) {
          out.push(`maze wall ${i} crosses the track at (${x.toFixed(1)}, ${z.toFixed(1)})`);
          break;
        }
      }
    });
    expect(out).toEqual([]);
  });

  it('keeps things out of the river, except on the crossings', () => {
    const out: string[] = [];
    for (const s of spots) {
      if (s.wet || s.floats) continue;
      if (nearRiver(s.x, s.z, Math.min(s.r, 1))) out.push(`${s.name} at (${s.x}, ${s.z}) is in the river (${river.d.toFixed(1)} m from its middle)`);
    }
    expect(out).toEqual([]);
    // the crossings sit squarely over the channel, with their ends on the banks
    const bank = L.RIVER_HALF_WIDTH + L.RIVER_BANK;
    expect(riverAt(L.TRAIN_BRIDGE.center[0], L.TRAIN_BRIDGE.center[1], river).d).toBeLessThan(1.5);
    expect(L.TRAIN_BRIDGE.length / 2).toBeGreaterThan(bank + 1);
    expect(trackDist(L.TRAIN_BRIDGE.center[0], L.TRAIN_BRIDGE.center[1])).toBeLessThan(0.01);
    expect(riverAt(L.RIVER_FOOTBRIDGE.center[0], L.RIVER_FOOTBRIDGE.center[1], river).d).toBeLessThan(1.5);
    expect(L.RIVER_FOOTBRIDGE.length / 2).toBeGreaterThan(bank);
    const mid: L.Vec2 = [(L.STEPPING_STONES.from[0] + L.STEPPING_STONES.to[0]) / 2, (L.STEPPING_STONES.from[1] + L.STEPPING_STONES.to[1]) / 2];
    expect(riverAt(mid[0], mid[1], river).d).toBeLessThan(1.5);
    expect(groundHeight(...L.STEPPING_STONES.from)).toBeGreaterThan(-0.2);
    expect(groundHeight(...L.STEPPING_STONES.to)).toBeGreaterThan(-0.2);
  });

  it('keeps the winter zone on the mountain top', () => {
    const out: string[] = [];
    for (const s of spots) {
      const w = mountainWeight(s.x, s.z);
      if (s.winter && w < 1) out.push(`${s.name} at (${s.x}, ${s.z}) is not on the plateau (${w.toFixed(2)})`);
    }
    expect(out).toEqual([]);
  });

  it('the tunnel, the footbridge and the station sit squarely on the track', () => {
    const north = L.TRAIN.center[1] - L.TRAIN.halfZ;
    const straight = L.TRAIN.halfX - L.TRAIN.cornerRadius;
    expect(L.MESA.center[1]).toBe(north);
    expect(Math.abs(L.MESA.center[0] - L.TRAIN.center[0]) + L.MESA.halfLength).toBeLessThan(straight);
    expect(L.MESA.opening).toBeGreaterThan(2.4 + 1.5);
    expect(L.MESA.clearance).toBeGreaterThan(3.6 + 0.4);
    expect(L.MESA.rampTo[1]).toBeGreaterThan(L.MESA.clearance + L.MESA.roof);
    const west = L.TRAIN.center[0] - L.TRAIN.halfX;
    expect(L.FOOTBRIDGE.deckFrom).toBeGreaterThan(west + 2);
    expect(L.FOOTBRIDGE.deckTo).toBeLessThan(west - 2);
    expect(L.FOOTBRIDGE.height).toBeGreaterThan(3.6 + 0.6);
    expect(Math.abs(L.FOOTBRIDGE.z - L.TRAIN.center[1])).toBeLessThan(L.TRAIN.halfZ - L.TRAIN.cornerRadius);
    const { from, to } = L.TRAIN.station;
    expect(Math.abs(from - 3.2 - L.TRAIN.center[1])).toBeLessThan(L.TRAIN.halfZ - L.TRAIN.cornerRadius);
    expect(Math.abs(to + 3.2 - L.TRAIN.center[1])).toBeLessThan(L.TRAIN.halfZ - L.TRAIN.cornerRadius);
    // nothing else inside their footprints
    const inside = spots.filter(
      (s) =>
        (Math.abs(s.x - L.MESA.center[0]) < L.MESA.halfLength + s.r && Math.abs(s.z - L.MESA.center[1]) < L.MESA.halfWidth + s.r) ||
        (Math.abs(s.z - L.FOOTBRIDGE.z) < L.FOOTBRIDGE.width / 2 + s.r && s.x < L.FOOTBRIDGE.rampFrom + s.r && s.x > L.FOOTBRIDGE.deckTo - s.r && s.name !== 'footbridge ramp foot') ||
        (Math.abs(s.x - (L.TRAIN.center[0] + L.TRAIN.halfX - 2.4)) < 1 + s.r && s.z > from - 3.2 - s.r && s.z < to + 3.2 + s.r)
    );
    expect(inside.map((s) => s.name)).toEqual([]);
  });

  it('keeps things off the paths', () => {
    const out: string[] = [];
    for (const s of spots) {
      if (s.onPathOk || s.floats) continue;
      [...L.PATHS, ...L.MOUNTAIN_PATHS].forEach(([a, b], i) => {
        const d = segDist(s.x, s.z, a, b);
        if (d < L.PATH_WIDTH / 2 + Math.min(0.5, s.r)) out.push(`${s.name} at (${s.x}, ${s.z}) stands on path ${i}`);
      });
    }
    expect(out).toEqual([]);
  });

  it('keeps things from standing on top of each other', () => {
    const out: string[] = [];
    const group = (n: string) => n.replace(/ \d.*$/, '');
    for (let i = 0; i < spots.length; i += 1)
      for (let j = i + 1; j < spots.length; j += 1) {
        const a = spots[i];
        const b = spots[j];
        if (a.floats || b.floats) continue;
        if (group(a.name) === group(b.name)) continue; // trees may touch trees, cones cones...
        const hilly = (s: Spot) => group(s.name) === 'hill' || group(s.name) === 'summit';
        if ((a.slopeOk && hilly(b)) || (b.slopeOk && hilly(a))) continue; // trees may stand on hills
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < a.r + b.r) out.push(`${a.name} (${a.x}, ${a.z}) overlaps ${b.name} (${b.x}, ${b.z})`);
      }
    expect(out).toEqual([]);
  });

  it('keeps everything inside the hedge and out of the sea', () => {
    const out = spots
      .filter((s) => !s.wet && (Math.abs(s.x) > WORLD_HALF_X - 1 || s.z < -WORLD_HALF_Z + 1 || s.z > L.SEA.coast - 1))
      .map((s) => `${s.name} at (${s.x}, ${s.z})`);
    expect(out).toEqual([]);
    const wet = spots.filter((s) => !s.wet && !s.floats && groundHeight(s.x, s.z) < -0.2).map((s) => `${s.name} at (${s.x}, ${s.z}) is under water`);
    expect(wet).toEqual([]);
  });

  it('every zone is a reasonable way from its neighbours', () => {
    const names = Object.keys(L.ZONES) as (keyof typeof L.ZONES)[];
    for (const a of names)
      for (const b of names) {
        if (a >= b) continue;
        const d = Math.hypot(L.ZONES[a][0] - L.ZONES[b][0], L.ZONES[a][1] - L.ZONES[b][1]);
        expect(d, `${a} and ${b} are only ${d.toFixed(0)} m apart`).toBeGreaterThan(30);
      }
  });
});
