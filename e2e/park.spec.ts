import { expect, test } from '@playwright/test';
import { Game } from './game';

// The lie of the land: the mountain with the winter zone on top, the river down its face and
// through the park, the lagoon and the sea, and the train's way round it all.

const above = (game: Game, slot = 0) =>
  game.page.evaluate((slot) => {
    const s = (window as any).__silly;
    const p = s.runtime.players.get(slot).position;
    return p.y - s.terrain.groundHeight(p.x, p.z);
  }, slot);
const swimming = (game: Game, slot = 0) => game.page.evaluate((slot) => (window as any).__silly.runtime.players.get(slot).swimming as boolean, slot);
const stickers = (game: Game) => game.page.evaluate(() => [...(window as any).__silly.useStickers.getState().got] as string[]);

test('the mountain: walk up the path to the snow, and the launch pad at the foot flies you to the summit', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  // from the foot of the path, straight up: on top in a few seconds, on your feet all the way
  await game.teleport(0, -1, 1, -24);
  await game.seconds(0.5);
  await page.keyboard.down('KeyW');
  let highest = 0;
  for (let i = 0; i < 45; i += 1) {
    await game.seconds(0.1);
    const p = await game.player(0);
    highest = Math.max(highest, p.y);
    expect(await above(game)).toBeLessThan(1.4);
  }
  await page.keyboard.up('KeyW');
  await game.seconds(0.5);
  let p = await game.player(0);
  expect(p.y).toBeGreaterThan(8.5);
  expect(p.z).toBeLessThan(-45);
  await game.screenshot('test-results/mountain-top.png');

  // the pad at the foot: off you fly, onto the summit (the golden star is up there)
  await game.teleport(0, 10, 1, -29);
  for (let i = 0; i < 60; i += 1) {
    await game.seconds(0.1);
    p = await game.player(0);
    if (i > 10 && !p.launched && p.y > 11) break;
  }
  expect(p.launched).toBe(false);
  expect(p.y).toBeGreaterThan(12);
  expect(Math.hypot(p.x - 2, p.z + 59)).toBeLessThan(5);
  expect(await stickers(game)).toContain('pad');
  game.expectNoErrors();
});

test('the ski jump: up the ramp, down the slide, and off the edge of the mountain', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.teleport(0, 30, 1, -63.5);
  await game.seconds(0.5);
  // run: up the ramp, over the tower, down the slide and off the kicker (holding the stick the whole way)
  await page.keyboard.down('KeyS');
  let flight = 0;
  for (let i = 0; i < 45; i += 1) {
    await game.seconds(0.1);
    const p = await game.player(0);
    if (p.z > -41.5) flight = Math.max(flight, await above(game));
  }
  await page.keyboard.up('KeyS');
  expect(flight).toBeGreaterThan(2); // airborne past the kicker's end, high over the slope
  await game.seconds(2);
  const p = await game.player(0);
  expect(p.z).toBeGreaterThan(-40); // and down the south face
  expect(p.y).toBeLessThan(7.5);
  game.expectNoErrors();
});

test('the river: wade across, cross dry on the footbridge and the stepping stones', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  // walking east from the hub side, you get wet feet in the channel and dry ones on the far bank
  await game.teleport(0, 17, 1, 10);
  await game.seconds(0.5);
  expect(await swimming(game)).toBe(false);
  await page.keyboard.down('KeyD');
  let wet = false;
  for (let i = 0; i < 25; i += 1) {
    await game.seconds(0.1);
    if (await swimming(game)) wet = true;
  }
  await page.keyboard.up('KeyD');
  expect(wet).toBe(true);
  expect(await stickers(game)).toContain('swim');
  await game.seconds(0.5);
  expect((await game.player(0)).x).toBeGreaterThan(29);
  expect(await swimming(game)).toBe(false);

  // the footbridge on the way to the dino park: dry all the way
  await game.teleport(0, 17, 1, -2);
  await game.seconds(0.5);
  await page.keyboard.down('KeyD');
  let dry = true;
  for (let i = 0; i < 18; i += 1) {
    await game.seconds(0.1);
    if (await swimming(game)) dry = false;
    if ((await game.player(0)).y < -0.1) dry = false;
  }
  await page.keyboard.up('KeyD');
  expect(dry).toBe(true);
  expect((await game.player(0)).x).toBeGreaterThan(30);
  await game.screenshot('test-results/river-footbridge.png');

  // the stepping stones: hop, hop, hop
  await game.teleport(0, 20.5, 1, 30);
  await game.seconds(0.5);
  expect(await above(game)).toBeLessThan(0.8);
  game.expectNoErrors();
});

test('the beach: sand slopes into the lagoon, the sea is out past the buoys', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.teleport(0, -4, 1, 30);
  await game.seconds(0.5);
  expect(await swimming(game)).toBe(false);
  await game.hold('KeyS', 1.5);
  expect(await swimming(game)).toBe(true);
  expect((await game.player(0)).y).toBeLessThan(0.2);
  await game.screenshot('test-results/lagoon.png');
  // out to sea: the water stays shallow, and the edge of the park stops you
  await game.teleport(0, 20, 1, 58);
  await game.seconds(0.5);
  expect(await swimming(game)).toBe(true);
  await game.hold('KeyS', 3);
  const p = await game.player(0);
  expect(p.z).toBeLessThan(66);
  expect(p.y).toBeGreaterThan(-1);

  // a duck dropped into the lagoon splashes in and bobs back up: it floats, it doesn't sink
  const duck = () =>
    page.evaluate(() => {
      const d = [...(window as any).__silly.runtime.props.values()].find((p: any) => p.kind === 'duck');
      const t = d.getBody().translation();
      return { x: t.x, y: t.y, z: t.z, body: d.getBody() && true };
    });
  await page.evaluate(() => {
    const d = [...(window as any).__silly.runtime.props.values()].find((p: any) => p.kind === 'duck');
    const b = d.getBody();
    b.setTranslation({ x: 6, y: 5, z: 40 }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
  });
  await game.seconds(4);
  const d = await duck();
  expect(Math.hypot(d.x - 6, d.z - 40)).toBeLessThan(4);
  expect(d.y).toBeGreaterThan(-0.2); // the lagoon floor is at -0.7: resting there it would be at -0.38
  expect(d.y).toBeLessThan(0.3);
  game.expectNoErrors();
});

test('the train: over the river bridge, through the tunnel, along the trestle, and stops at the station', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const loco = () =>
    page.evaluate(() => {
      const c = (window as any).__silly.runtime.debugInfo.train[0];
      return { x: c.x, z: c.z };
    });
  // wait at the platform: the train comes in and stops with its front at the platform's end
  await game.teleport(0, 31.6, 1.5, 19);
  let stopped = false;
  let prev = await loco();
  for (let i = 0; i < 100 && !stopped; i += 1) {
    await game.seconds(0.5);
    const now = await loco();
    if (Math.hypot(now.x - prev.x, now.z - prev.z) < 0.01 && Math.abs(now.x - 34) < 0.1 && Math.abs(now.z - 12) < 0.5) stopped = true;
    prev = now;
  }
  expect(stopped).toBe(true);
  await game.screenshot('test-results/station.png');
  // and on its way round it passes the bridge, the tunnel and the water: always on the track, always at ground level
  const seen = { bridge: false, tunnel: false, trestle: false };
  for (let i = 0; i < 160; i += 1) {
    await game.seconds(0.5);
    const c = await loco();
    if (Math.abs(c.z + 22) < 0.2 && Math.abs(c.x - 22.5) < 2) seen.bridge = true;
    if (Math.abs(c.z + 22) < 0.2 && Math.abs(c.x + 14) < 4) seen.tunnel = true;
    if (Math.abs(c.z - 56) < 0.2 && Math.abs(c.x) < 10) seen.trestle = true;
  }
  expect(seen).toEqual({ bridge: true, tunnel: true, trestle: true });
  // you can walk the track up the embankment, over the bridge and down again without getting wet
  await game.teleport(0, 4, 1, -22);
  await game.seconds(0.3);
  let top = 0;
  await page.keyboard.down('KeyD');
  for (let i = 0; i < 26; i += 1) {
    await game.seconds(0.1);
    top = Math.max(top, (await game.player(0)).y);
    expect(await swimming(game)).toBe(false);
  }
  await page.keyboard.up('KeyD');
  expect(top).toBeGreaterThan(2.8);
  // on the bridge over the river (straight on, the parapet where the track curves away stops you)
  expect((await game.player(0)).x).toBeGreaterThan(18);
  expect((await game.player(0)).y).toBeGreaterThan(2.8);
  // and along the trestle over the sea (the teleport height is over the sea floor there)
  await game.teleport(0, -10, 3.8, 56);
  await game.seconds(0.3);
  await game.hold('KeyD', 2);
  expect(await swimming(game)).toBe(false);
  expect((await game.player(0)).y).toBeGreaterThan(2.8);
  game.expectNoErrors();
});

test('playing alone, the buddy hops on the next wagon and rides the train with the child', async ({ page }) => {
  const game = new Game(page);
  await game.open(1, { off: ['cats', 'birds'] });
  await game.start();
  await page.evaluate(() => (window as any).__silly.useGame.getState().addBuddy());
  /** Which car each of them stands on (-1: none). */
  const cars = () =>
    page.evaluate(() => {
      const s = (window as any).__silly;
      const t = s.runtime.debugInfo.train;
      const on = (i: number) => {
        const q = s.runtime.players.get(i).position;
        return t.findIndex((c: any) => Math.hypot(q.x - c.x, q.z - c.z) < 1.9 && q.y > c.y + 0.5);
      };
      return { kid: on(0), buddy: on(1), front: { x: t[0].x as number, z: t[0].z as number } };
    });
  // the train waits at the station: the child on the third car, the buddy on the platform a little way off
  const c = await page.evaluate(() => (window as any).__silly.runtime.debugInfo.train.map((x: any) => [x.x, x.y, x.z]) as number[][]);
  await game.teleport(0, c[2][0], c[2][1] + 1.6, c[2][2]);
  await game.teleport(1, 31.6, 1.5, c[1][2] - 2);
  let s = await cars();
  for (let k = 0; k < 10 && s.buddy < 0; k += 1) {
    await game.seconds(0.5);
    s = await cars();
  }
  expect(s.buddy).toBeGreaterThan(0);
  expect(s.buddy).not.toBe(s.kid);
  // and off they go together: both still aboard well down the line
  await game.seconds(8);
  s = await cars();
  expect(Math.hypot(s.front.x - c[0][0], s.front.z - c[0][2])).toBeGreaterThan(15);
  expect(s.kid).toBe(2);
  expect(s.buddy).toBeGreaterThan(0);
  game.expectNoErrors();
});
