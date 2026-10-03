import { expect, test } from '@playwright/test';
import { Game } from './game';

// The soak test: four robot players play for many minutes of game time (SOAK_MINUTES, default
// off: it is long), with a surprise every 40 s. Once a minute it collects the garbage, draws a
// frame and counts what the game is holding on to: memory, three.js geometries and textures,
// objects in the scene, physics bodies, and the registries. Children play for an hour; anything
// that keeps growing (a leak) would slowly make the game stutter and finally crash the tab.
//
//   SOAK_MINUTES=20 npx playwright test e2e/soak.spec.ts

const MINUTES = Number(process.env.SOAK_MINUTES ?? 0);
/** Minutes before the counts are taken as the baseline (the park fills up with poops, paint, ...). */
const WARMUP = 3;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOVES = [
  ['KeyW', 'KeyA', 'KeyS', 'KeyD'],
  ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']
];
const ACTS = [
  ['Space', 'KeyE', 'KeyQ', 'KeyR', 'KeyF', 'KeyG', 'Digit1', 'Digit2'],
  ['Enter', 'ShiftRight', 'ControlRight', 'Slash', 'Period', 'Quote', 'Comma', 'KeyM']
];

type Counts = Record<string, number>;

test.skip(MINUTES <= 0, 'set SOAK_MINUTES to run the soak test');

test(`soak: four robots play for ${MINUTES} minutes and nothing keeps growing`, async ({ page }) => {
  test.setTimeout((MINUTES * 90 + 120) * 1000);
  const cdp = await page.context().newCDPSession(page);
  const game = new Game(page);
  await game.withPads();
  await game.open(5);
  await game.start();
  await page.evaluate(() => (window as any).__silly.runtime.debugInfo.bubbles.setAuto(true));
  await game.join('kb2');
  await page.evaluate(() => {
    (window as any).__addPad(0, 'standard', 'Xbox Pad');
    (window as any).__addPad(1, '', 'HORIPAD S (Vendor: 0f0d Product: 00c1)');
  });
  await game.pad(0, 0);
  await game.pad(1, 1);
  await game.seconds(1.5);

  const count = async (): Promise<Counts> => {
    await cdp.send('HeapProfiler.collectGarbage');
    await game.seconds(1 / 60, true);
    return page.evaluate(() => {
      const s = (window as any).__silly;
      let objects = 0;
      const live = new Set<unknown>();
      s.scene.traverse((o: any) => {
        objects += 1;
        if (o.geometry) live.add(o.geometry);
      });
      const r = s.runtime;
      return {
        heapMB: Math.round(((performance as any).memory?.usedJSHeapSize ?? 0) / 1e5) / 10,
        // (the renderer uploads a geometry the first time it's drawn, so its count creeps up as the
        // robots reach parts of the park not seen yet; it can never pass what the scene holds,
        // unless meshes leave the scene without their geometry being freed: a leak)
        geometries: s.gl.info.memory.geometries,
        sceneGeometries: live.size,
        textures: s.gl.info.memory.textures,
        programs: s.gl.info.programs?.length ?? 0,
        objects,
        bodies: s.world.bodies.len(),
        colliders: s.world.colliders.len(),
        props: r.props.size,
        statics: r.statics.size,
        foods: r.foods.size,
        surfaces: r.surfaces?.size ?? 0
      };
    });
  };

  const r = rng(5);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const held = new Set<string>();
  const surprises = ['chicken', 'present', 'rain', 'ball'];
  const log: Counts[] = [];
  for (let sec = 0; sec < MINUTES * 60; sec += 1) {
    for (let k = 0; k < 2; k += 1) {
      if (r() < 0.4) {
        for (const key of MOVES[k]) if (held.has(key)) {
          await page.keyboard.up(key);
          held.delete(key);
        }
        if (r() < 0.8) {
          const key = pick(MOVES[k]);
          await page.keyboard.down(key);
          held.add(key);
        }
      }
      if (r() < 0.7) await page.keyboard.press(pick(ACTS[k]));
    }
    await page.evaluate(
      ([ax, az, bx, bz, b0, b1]) => {
        const pads = (window as any).__pads;
        if (pads[0]) pads[0].axes = [ax, az, 0, 0];
        if (pads[1]) {
          pads[1].axes[0] = bx;
          pads[1].axes[1] = bz;
        }
        for (let b = 0; b < 18; b += 1) {
          (window as any).__press(0, b, b === b0);
          (window as any).__press(1, b, b === b1);
        }
        const g = (window as any).__silly.useGame.getState();
        if (g.albumOpen) g.setAlbumOpen(false);
        if (g.menuOpen) g.setMenuOpen(false);
      },
      [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, r() < 0.6 ? pick([0, 1, 2, 3, 4, 5, 6, 7, 17]) : -1, r() < 0.6 ? pick([0, 1, 2, 3, 4, 5, 6, 7, 13]) : -1] as const
    );
    if (sec % 40 === 10) await page.evaluate((k) => (window as any).__silly.events.useEvents.getState().start(k), surprises[(sec / 40) % surprises.length | 0]);
    // every couple of minutes everyone moves to another part of the park (so the soak plays all of it)
    if (sec % 120 === 119) {
      const zones = await page.evaluate(() => Object.values((window as any).__silly.layout.ZONES) as [number, number][]);
      const [x, z] = zones[Math.floor(r() * zones.length)];
      for (let slot = 0; slot < 4; slot += 1) await game.teleport(slot, x + slot, 1, z);
    }
    await game.seconds(1);
    if (sec % 60 === 59) {
      const c = await count();
      log.push(c);
      console.log(`minute ${log.length}: ${JSON.stringify(c)}`);
    }
  }
  for (const key of held) await page.keyboard.up(key);

  // after warming up, nothing keeps growing
  const base = log[WARMUP - 1];
  const end = log[log.length - 1];
  const growth: string[] = [];
  const allow: Counts = { heapMB: base.heapMB * 0.25 + 5, sceneGeometries: 100, textures: 10, programs: 5, objects: 300, bodies: 20, colliders: 30, props: 20, statics: 5, foods: 10, surfaces: 10 };
  for (const k of Object.keys(allow)) if (end[k] - base[k] > allow[k]) growth.push(`${k}: ${base[k]} -> ${end[k]}`);
  for (const c of log) if (c.geometries > c.sceneGeometries + 50) growth.push(`geometries not in the scene: ${c.geometries} held, ${c.sceneGeometries} in the scene`);
  expect(growth).toEqual([]);
  game.expectNoErrors();
});
