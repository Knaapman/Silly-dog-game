import { describe, expect, it } from 'vitest';
import * as L from '../../src/game/layout';

// The park layout, checked for things standing where they shouldn't: on the train track, on a
// path, on top of each other, or in the border hedge. Things that float (balloons, stars) and
// launch pads at the end of a path are fine.

const H = L.TRAIN.half;
const R = L.TRAIN.cornerRadius;
const C = H - R;
/** Distance from a point to the train track centre line (a rounded rectangle). */
function trackDist(x: number, z: number) {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  if (ax <= C || az <= C) return Math.abs(Math.max(ax, az) - H);
  return Math.abs(Math.hypot(ax - C, az - C) - R);
}
function segDist(x: number, z: number, a: L.Vec2, b: L.Vec2) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / Math.max(1e-6, dx * dx + dz * dz)));
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}
/** The train is 2.4 m wide: this much room is needed beside the track centre line. */
const TRAIN_ROOM = 1.3;

type Spot = { name: string; x: number; z: number; r: number; floats?: boolean; onPathOk?: boolean };
const spots: Spot[] = [];
L.TREES.forEach((t, i) => spots.push({ name: `tree ${i} (${t.kind})`, x: t.at[0], z: t.at[1], r: t.kind === 'pine' || t.kind === 'snowpine' ? 1.8 : 1.7 }));
L.SNACKS.forEach((s, i) => spots.push({ name: `snack ${i} (${s.kind})`, x: s.position[0], z: s.position[2], r: 0.6 }));
L.SIGNS.forEach((s, i) => spots.push({ name: `sign ${i}`, x: s.position[0], z: s.position[1], r: 0.4, onPathOk: true }));
L.LAUNCH_PADS.forEach((p, i) => spots.push({ name: `launch pad ${i}`, x: p.position[0], z: p.position[2], r: 1.4, onPathOk: true }));
L.GEYSERS.forEach((g, i) => spots.push({ name: `geyser ${i}`, x: g[0], z: g[1], r: 1.2 }));
L.TRAMPOLINES.forEach((t, i) => spots.push({ name: `trampoline ${i}`, x: t.position[0], z: t.position[2], r: t.radius }));
L.SEESAWS.forEach((s, i) => spots.push({ name: `see-saw ${i}`, x: s.center[0], z: s.center[1], r: 3.5 }));
L.CAT_HOMES.forEach((c, i) => spots.push({ name: `cat home ${i}`, x: c[0], z: c[1], r: 1 }));
L.BIRD_SPOTS.forEach((b, i) => spots.push({ name: `bird spot ${i}`, x: b[0], z: b[2], r: b[3], onPathOk: true, floats: b[1] > 0 }));
L.SNOWMEN.forEach((s, i) => spots.push({ name: `snowman ${i}`, x: s[0], z: s[1], r: 0.9 }));
L.MUSHROOMS.forEach((m, i) => spots.push({ name: `mushroom ${i}`, x: m.center[0], z: m.center[1], r: m.radius }));
L.HILLS.forEach((h, i) => spots.push({ name: `hill ${i}`, x: h.center[0], z: h.center[1], r: h.radius }));
L.BALLOONS.forEach((b, i) => spots.push({ name: `balloon ${i}`, x: b[0], z: b[2], r: 0.5, floats: true, onPathOk: true }));
L.GOLDEN_STARS.forEach((s, i) => s !== 'train' && spots.push({ name: `star ${i}`, x: s[0], z: s[2], r: 0.5, floats: true, onPathOk: true }));

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

  it('the mesa tunnel and the footbridge sit squarely over the track', () => {
    expect(L.MESA.center[0]).toBe(L.TRAIN.half);
    expect(Math.abs(L.MESA.center[1])).toBeLessThan(L.TRAIN.half - L.TRAIN.cornerRadius - L.MESA.halfLength);
    expect(L.MESA.opening).toBeGreaterThan(2.4 + 1.5);
    expect(L.MESA.clearance).toBeGreaterThan(3.6 + 0.4);
    expect(L.FOOTBRIDGE.deckFrom).toBeGreaterThan(-L.TRAIN.half + 2);
    expect(L.FOOTBRIDGE.deckTo).toBeLessThan(-L.TRAIN.half - 2);
    expect(L.FOOTBRIDGE.height).toBeGreaterThan(3.6 + 0.6);
    // nothing else inside their footprints
    const inside = spots.filter((s) => (Math.abs(s.x - L.MESA.center[0]) < L.MESA.halfWidth + s.r && Math.abs(s.z - L.MESA.center[1]) < L.MESA.halfLength + s.r) || (Math.abs(s.x - L.FOOTBRIDGE.x) < L.FOOTBRIDGE.width / 2 + s.r && s.z < L.FOOTBRIDGE.rampFrom + s.r && s.z > L.FOOTBRIDGE.deckTo - s.r));
    expect(inside.map((s) => s.name)).toEqual([]);
  });

  it('keeps things off the paths', () => {
    const out: string[] = [];
    for (const s of spots) {
      if (s.onPathOk || s.floats) continue;
      L.PATHS.forEach(([a, b], i) => {
        const d = segDist(s.x, s.z, a, b);
        if (d < L.PATH_WIDTH / 2 + Math.min(0.5, s.r)) out.push(`${s.name} at (${s.x}, ${s.z}) stands on path ${i}`);
      });
    }
    expect(out).toEqual([]);
  });

  it('keeps things from standing on top of each other', () => {
    const out: string[] = [];
    for (let i = 0; i < spots.length; i += 1)
      for (let j = i + 1; j < spots.length; j += 1) {
        const a = spots[i];
        const b = spots[j];
        if (a.floats || b.floats) continue;
        if (a.name.split(' ')[0] === b.name.split(' ')[0]) continue; // trees may touch trees
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < a.r + b.r) out.push(`${a.name} (${a.x}, ${a.z}) overlaps ${b.name} (${b.x}, ${b.z})`);
      }
    expect(out).toEqual([]);
  });

  it('keeps everything inside the hedge', () => {
    const out = spots.filter((s) => Math.abs(s.x) > 61 || Math.abs(s.z) > 61).map((s) => s.name);
    expect(out).toEqual([]);
  });
});
