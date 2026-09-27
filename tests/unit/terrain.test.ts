import { describe, expect, it } from 'vitest';
import * as L from '../../src/game/layout';
import { buildHeightGrid, groundHeight, isInWater, mountainWeight, riverAt, TERRAIN, trackDist, waterLevelAt } from '../../src/game/terrain';

// The ground rolls, but everything that has to stand level stands on level ground: the park on
// the flat, the winter zone on the mountain's top, the river in its channel.

describe('terrain', () => {
  it('is level under everything the layout places on the flat (trees may stand on slopes)', () => {
    const spots: [string, number, number][] = [];
    L.SNACKS.forEach((s, i) => spots.push([`snack ${i}`, s.position[0], s.position[2]]));
    L.SIGNS.forEach((s, i) => spots.push([`sign ${i}`, s.position[0], s.position[1]]));
    L.LAUNCH_PADS.forEach((p, i) => spots.push([`launch pad ${i}`, p.position[0], p.position[2]]));
    spots.push(['dino pad', L.DINO_PAD[0], L.DINO_PAD[2]]);
    L.GEYSERS.forEach((g, i) => spots.push([`geyser ${i}`, g[0], g[1]]));
    L.TRAMPOLINES.forEach((t, i) => spots.push([`trampoline ${i}`, t.position[0], t.position[2]]));
    L.SEESAWS.forEach((s, i) => spots.push([`see-saw ${i}`, s.center[0], s.center[1]]));
    L.CAT_HOMES.forEach((c, i) => spots.push([`cat home ${i}`, c[0], c[1]]));
    L.BIRD_SPOTS.forEach((b, i) => mountainWeight(b[0], b[2]) === 0 && spots.push([`bird spot ${i}`, b[0], b[2]]));
    L.MUSHROOMS.forEach((m, i) => spots.push([`mushroom ${i}`, m.center[0], m.center[1]]));
    L.SPAWN_POINTS.forEach((p, i) => spots.push([`spawn ${i}`, p[0], p[2]]));
    L.MAZE.walls.forEach((w, i) => spots.push([`maze wall ${i}`, (w[0] + w[2]) / 2, (w[1] + w[3]) / 2]));
    L.STALLS.forEach((s, i) => spots.push([`stall ${i}`, s.position[0], s.position[2]]));
    L.SANDCASTLES.forEach((c, i) => spots.push([`sandcastle ${i}`, c[0], c[1]]));
    L.UMBRELLAS.forEach((u, i) => spots.push([`umbrella ${i}`, u.position[0], u.position[2]]));
    L.CONES.forEach((c, i) => spots.push([`cone ${i}`, c[0], c[2]]));
    L.FARM_PROPS.forEach((p, i) => spots.push([`farm prop ${i}`, p.position[0], p.position[2]]));
    L.MELON_PATCH.forEach((m, i) => spots.push([`melon ${i}`, m[0], m[1]]));
    L.LAMP_POSTS.forEach((p, i) => spots.push([`lamp post ${i}`, p[0], p[1]]));
    L.BUNTING_POLES.forEach((p, i) => spots.push([`bunting pole ${i}`, p[0], p[1]]));
    spots.push(
      ['toilet', L.TOILET.position[0], L.TOILET.position[2]],
      ['hat rack', L.HAT_RACK.center[0], L.HAT_RACK.center[1]],
      ['t-rex', L.TREX.position[0], L.TREX.position[2]],
      ['picnic', L.PICNIC.center[0], L.PICNIC.center[1]],
      ['crate tower', L.CRATE_TOWER.base[0], L.CRATE_TOWER.base[2]],
      ['high striker', L.HIGH_STRIKER.position[0], L.HIGH_STRIKER.position[2]],
      ['tractor', L.TRACTOR[0], L.TRACTOR[2]],
      ['fallen log', L.FALLEN_LOG[0], L.FALLEN_LOG[2]],
      ['gangplank foot', L.SHIP.center[0], L.SHIP.center[1] - L.SHIP.width / 2 - 6],
      ['footbridge ramp foot', L.FOOTBRIDGE.rampFrom, L.FOOTBRIDGE.z],
      ['footbridge far end', L.FOOTBRIDGE.deckTo - 1, L.FOOTBRIDGE.z],
      ['bowling lane start', L.BOWLING.laneX, L.BOWLING.laneFrom],
      ['bowling lane end', L.BOWLING.laneX, L.BOWLING.laneTo],
      ['slide tower ramp foot', L.SLIDE_TOWER.base[0], L.SLIDE_TOWER.base[2] - 1.6 - 10],
      ['slide end', L.SLIDE_TOWER.base[0] + 1.6 + 9.5, L.SLIDE_TOWER.base[2]],
      ['train bridge west end', L.TRAIN_BRIDGE.center[0] - L.TRAIN_BRIDGE.length / 2, L.TRAIN_BRIDGE.center[1]],
      ['train bridge east end', L.TRAIN_BRIDGE.center[0] + L.TRAIN_BRIDGE.length / 2, L.TRAIN_BRIDGE.center[1]],
      ['river footbridge west end', L.RIVER_FOOTBRIDGE.center[0] - L.RIVER_FOOTBRIDGE.length / 2, L.RIVER_FOOTBRIDGE.center[1]],
      ['river footbridge east end', L.RIVER_FOOTBRIDGE.center[0] + L.RIVER_FOOTBRIDGE.length / 2, L.RIVER_FOOTBRIDGE.center[1]],
      ['station north ramp', L.TRAIN.center[0] + L.TRAIN.halfX - 2.4, L.TRAIN.station.from - 3.2],
      ['station south ramp', L.TRAIN.center[0] + L.TRAIN.halfX - 2.4, L.TRAIN.station.to + 3.2]
    );
    // the corners of the soccer field
    const [fx, fz] = L.SOCCER.field.center;
    const [fw, fh] = L.SOCCER.field.size;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) spots.push([`field corner ${sx} ${sz}`, fx + (sx * fw) / 2, fz + (sz * fh) / 2]);
    // along the paths
    L.PATHS.forEach(([a, b], i) => {
      for (let t = 0; t <= 1; t += 0.25) spots.push([`path ${i} @${t}`, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    });
    const bad = spots.filter(([, x, z]) => Math.abs(groundHeight(x, z)) > 0.001).map(([n, x, z]) => `${n} at (${x.toFixed(1)}, ${z.toFixed(1)}): ${groundHeight(x, z).toFixed(2)}`);
    expect(bad).toEqual([]);
  });

  it('is level along the track on land, and below it over the water (the trestle)', () => {
    const bad: string[] = [];
    let wet = 0;
    for (let x = -40; x <= 40; x += 0.5)
      for (let z = -25; z <= 60; z += 0.5) {
        if (trackDist(x, z) > 0.3) continue;
        const h = groundHeight(x, z);
        if (h > 0.001) bad.push(`track at (${x}, ${z}) is ${h.toFixed(2)} m up`);
        const onBridge = Math.abs(x - L.TRAIN_BRIDGE.center[0]) < L.TRAIN_BRIDGE.length / 2 && Math.abs(z - L.TRAIN_BRIDGE.center[1]) < 2;
        if (h < -0.001 && z < 44 && !onBridge) bad.push(`track at (${x}, ${z}) is ${(-h).toFixed(2)} m down`);
        if (h < -0.3) wet += 1;
      }
    expect(bad).toEqual([]);
    expect(wet).toBeGreaterThan(80);
  });

  it('has the winter zone level on the mountain top, with the summit above it', () => {
    const level = L.WINTER.level;
    const spots: [string, number, number][] = [
      ['ice pond', L.ICE.center[0], L.ICE.center[1]],
      ['ice pond edge', L.ICE.center[0] + L.ICE.radius, L.ICE.center[1]],
      ['ice pond south edge', L.ICE.center[0], L.ICE.center[1] + L.ICE.radius],
      ['ski jump', L.SKI_JUMP.base[0], L.SKI_JUMP.base[2]],
      ['ski jump ramp foot', L.SKI_JUMP.base[0], L.SKI_JUMP.base[2] - 1.6 - 7],
      ['ski jump slide top', L.SKI_JUMP.base[0], L.SKI_JUMP.base[2] + 1.6]
    ];
    L.SNOWMEN.forEach((s, i) => spots.push([`snowman ${i}`, s[0], s[1]]));
    L.SNOWBALLS.forEach((s, i) => spots.push([`snowball ${i}`, s[0], s[2]]));
    L.BIRD_SPOTS.forEach((b, i) => mountainWeight(b[0], b[2]) === 1 && spots.push([`bird spot ${i}`, b[0], b[2]]));
    const bad = spots.filter(([, x, z]) => Math.abs(groundHeight(x, z) - level) > 0.001).map(([n, x, z]) => `${n} at (${x}, ${z}): ${groundHeight(x, z).toFixed(2)}`);
    expect(bad).toEqual([]);
    expect(groundHeight(L.SNOW_HILL.center[0], L.SNOW_HILL.center[1])).toBeCloseTo(level + L.SNOW_HILL.height, 3);
    // the slide flies off the plateau's edge: the ground drops away under the kicker
    expect(groundHeight(L.SKI_JUMP.base[0], L.SKI_JUMP.base[2] + 1.6 + 8 + 2.6)).toBeLessThan(level - 1.5);
    // the mountain path climbs at a walkable grade all the way up
    const [a, b] = L.MOUNTAIN_PATHS[0];
    let prev = groundHeight(a[0], a[1]);
    let steepest = 0;
    for (let t = 0.02; t <= 1.0001; t += 0.02) {
      const h = groundHeight(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      steepest = Math.max(steepest, (h - prev) / (0.02 * Math.hypot(b[0] - a[0], b[1] - a[1])));
      expect(h).toBeGreaterThanOrEqual(prev - 0.001);
      prev = h;
    }
    expect(prev).toBeGreaterThan(level - 1.5);
    expect(steepest).toBeLessThan(0.6);
  });

  it('runs the river in a channel from the mountain to the sea, with water in it', () => {
    L.RIVER.forEach((p, i) => {
      expect(groundHeight(p.p[0], p.p[1]), `river point ${i}`).toBeCloseTo(p.level, 2);
      expect(isInWater(p.p[0], p.p[1]), `water at river point ${i}`).toBe(true);
    });
    // the banks are back up at ground level, either side of the flat stretch
    const r = { d: 0, level: 0 };
    for (const z of [-15, 0, 10, 25, 40]) {
      let x = -10;
      let best = Infinity;
      for (let px = 10; px <= 40; px += 0.25) if (riverAt(px, z, r).d < best) (best = r.d), (x = px);
      const w = L.RIVER_HALF_WIDTH + L.RIVER_BANK + 0.6;
      expect(groundHeight(x - w, z)).toBeGreaterThan(-0.05);
      expect(groundHeight(x + w, z)).toBeGreaterThan(-0.05);
      expect(isInWater(x - w, z)).toBe(false);
    }
    // the stream's surface follows it down the mountain, the rest is one sheet
    expect(waterLevelAt(19, -37)).toBeGreaterThan(3);
    expect(waterLevelAt(24, 10)).toBe(L.WATER_LEVEL);
    expect(waterLevelAt(L.LAKE.center[0], L.LAKE.center[1])).toBe(L.WATER_LEVEL);
  });

  it('has a lagoon, a beach that slopes into the sea, and dry land everywhere else', () => {
    expect(groundHeight(L.LAKE.center[0], L.LAKE.center[1])).toBeCloseTo(L.LAKE.floor, 3);
    expect(isInWater(L.LAKE.center[0], L.LAKE.center[1])).toBe(true);
    for (const x of [-70, -30, 0, 40, 75]) {
      expect(groundHeight(x, L.SEA.coast + 5), `sea at x ${x}`).toBeCloseTo(L.SEA.floor, 2);
      expect(isInWater(x, L.SEA.coast + 5)).toBe(true);
    }
    for (const x of [-70, -30, 16, 40, 75]) {
      expect(groundHeight(x, L.SEA.coast - L.SEA.shore - 1), `shore at x ${x}`).toBeGreaterThanOrEqual(-0.001);
      expect(isInWater(x, L.SEA.coast - L.SEA.shore - 1)).toBe(false);
    }
    expect(isInWater(L.PLAZA.center[0], L.PLAZA.center[1] + 8)).toBe(false);
    expect(isInWater(L.FOUNTAIN.center[0], L.FOUNTAIN.center[1])).toBe(true);
    expect(isInWater(L.SANDCASTLES[0][0], L.SANDCASTLES[0][1])).toBe(false);
  });

  it('has the hills, and some rolling grass in the open', () => {
    L.HILLS.forEach((h) => {
      const top = groundHeight(h.center[0], h.center[1]);
      expect(top).toBeGreaterThan(h.height * 0.8);
      let around = 0;
      for (let k = 0; k < 8; k += 1) around += groundHeight(h.center[0] + Math.cos(k * 0.785) * (h.radius + 3), h.center[1] + Math.sin(k * 0.785) * (h.radius + 3)) / 8;
      expect(around).toBeLessThan(top - h.height * 0.6);
    });
    let rolling = 0;
    for (let x = -78; x <= 78; x += 2)
      for (let z = -63; z <= 50; z += 2) {
        if (mountainWeight(x, z) === 0 && groundHeight(x, z) > 0.4) rolling += 1;
      }
    console.log(`terrain: ${rolling} rolling points`);
    expect(rolling).toBeGreaterThan(80);
  });

  it('builds a grid that matches the function', () => {
    const { nx, nz, heights } = buildHeightGrid();
    expect(nx).toBe(Math.round((TERRAIN.maxX - TERRAIN.minX) / TERRAIN.cell));
    expect(nz).toBe(Math.round((TERRAIN.maxZ - TERRAIN.minZ) / TERRAIN.cell));
    expect(heights.length).toBe((nx + 1) * (nz + 1));
    let min = Infinity;
    let max = -Infinity;
    for (const h of heights) {
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
    expect(min).toBeGreaterThan(L.SEA.floor - 0.01);
    expect(max).toBeGreaterThan(L.WINTER.level + L.SNOW_HILL.height - 0.1);
    const iz = Math.round((L.HILLS[0].center[1] - TERRAIN.minZ) / TERRAIN.cell);
    const ix = Math.round((L.HILLS[0].center[0] - TERRAIN.minX) / TERRAIN.cell);
    expect(heights[iz * (nx + 1) + ix]).toBeCloseTo(groundHeight(TERRAIN.minX + ix * TERRAIN.cell, TERRAIN.minZ + iz * TERRAIN.cell), 5);
  });
});
