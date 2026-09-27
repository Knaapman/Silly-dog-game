import { describe, expect, it } from 'vitest';
import * as L from '../../src/game/layout';
import { buildHeightGrid, groundHeight, openness, TERRAIN, trackDist } from '../../src/game/terrain';

// The ground rolls, but everything that has to stand level stands on level ground.

describe('terrain', () => {
  it('is level under everything the layout places (trees may stand on slopes)', () => {
    const spots: [string, number, number][] = [];
    L.SNACKS.forEach((s, i) => spots.push([`snack ${i}`, s.position[0], s.position[2]]));
    L.SIGNS.forEach((s, i) => spots.push([`sign ${i}`, s.position[0], s.position[1]]));
    L.LAUNCH_PADS.forEach((p, i) => spots.push([`launch pad ${i}`, p.position[0], p.position[2]]));
    L.GEYSERS.forEach((g, i) => spots.push([`geyser ${i}`, g[0], g[1]]));
    L.TRAMPOLINES.forEach((t, i) => spots.push([`trampoline ${i}`, t.position[0], t.position[2]]));
    L.SEESAWS.forEach((s, i) => spots.push([`see-saw ${i}`, s.center[0], s.center[1]]));
    L.CAT_HOMES.forEach((c, i) => spots.push([`cat home ${i}`, c[0], c[1]]));
    L.BIRD_SPOTS.forEach((b, i) => spots.push([`bird spot ${i}`, b[0], b[2]]));
    L.SNOWMEN.forEach((s, i) => spots.push([`snowman ${i}`, s[0], s[1]]));
    L.MUSHROOMS.forEach((m, i) => spots.push([`mushroom ${i}`, m.center[0], m.center[1]]));
    L.SPAWN_POINTS.forEach((p, i) => spots.push([`spawn ${i}`, p[0], p[2]]));
    L.MAZE.walls.forEach((w, i) => spots.push([`maze wall ${i}`, (w[0] + w[2]) / 2, (w[1] + w[3]) / 2]));
    spots.push(['toilet', L.TOILET.position[0], L.TOILET.position[2]], ['hat rack', L.HAT_RACK.center[0], L.HAT_RACK.center[1]], ['t-rex', L.TREX.position[0], L.TREX.position[2]]);
    spots.push(['mesa ramp foot', L.MESA.rampFrom[0], L.MESA.rampFrom[2]], ['footbridge ramp foot', L.FOOTBRIDGE.x, L.FOOTBRIDGE.rampFrom]);
    // along the track (the rounded rectangle), and along the paths
    for (let t = 0; t < 1; t += 0.01) {
      const a = t * Math.PI * 2;
      const x = Math.max(-56, Math.min(56, Math.cos(a) * 80));
      const z = Math.max(-56, Math.min(56, Math.sin(a) * 80));
      if (trackDist(x, z) < 0.5) spots.push([`track ${t.toFixed(2)}`, x, z]);
    }
    L.PATHS.forEach(([a, b], i) => {
      for (let t = 0; t <= 1; t += 0.25) spots.push([`path ${i} @${t}`, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    });
    const bad = spots.filter(([, x, z]) => Math.abs(groundHeight(x, z)) > 0.001).map(([n, x, z]) => `${n} at (${x.toFixed(1)}, ${z.toFixed(1)}): ${groundHeight(x, z).toFixed(2)}`);
    expect(bad).toEqual([]);
  });

  it('has the hills, and some rolling grass in the open', () => {
    L.HILLS.forEach((h) => {
      expect(groundHeight(h.center[0], h.center[1])).toBeGreaterThan(h.height * 0.8);
      expect(groundHeight(h.center[0] + h.radius + 4, h.center[1])).toBeLessThan(h.height * 0.3);
    });
    let open = 0;
    let rolling = 0;
    for (let x = -60; x <= 60; x += 2)
      for (let z = -60; z <= 60; z += 2) {
        if (openness(x, z) > 0.9) open += 1;
        if (groundHeight(x, z) > 0.4) rolling += 1;
      }
    console.log(`terrain: ${open} open points, ${rolling} rolling points`);
    expect(open).toBeGreaterThan(100);
    expect(rolling).toBeGreaterThan(60);
  });

  it('builds a grid that matches the function and never dips below the flats', () => {
    const { n, heights } = buildHeightGrid();
    expect(n).toBe(Math.round((TERRAIN.half * 2) / TERRAIN.cell));
    expect(heights.length).toBe((n + 1) * (n + 1));
    let min = Infinity;
    for (const h of heights) min = Math.min(min, h);
    expect(min).toBe(0);
    const iz = Math.round((L.HILLS[0].center[1] + TERRAIN.half) / TERRAIN.cell);
    const ix = Math.round((L.HILLS[0].center[0] + TERRAIN.half) / TERRAIN.cell);
    expect(heights[iz * (n + 1) + ix]).toBeCloseTo(groundHeight(L.HILLS[0].center[0], L.HILLS[0].center[1]), 5);
  });
});
