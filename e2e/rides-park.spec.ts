import { expect, test } from '@playwright/test';
import { Game } from './game';

// The rides on the new ground: a rubber ring down the river, a sled down the mountain.

const stickers = (game: Game) => game.page.evaluate(() => [...(window as any).__silly.useStickers.getState().got] as string[]);
const tubes = (game: Game) => game.page.evaluate(() => ((window as any).__silly.runtime.debugInfo.tubes as any[]).map((t) => ({ mode: t.mode, s: t.s, x: t.x, y: t.y, z: t.z })));
const sleds = (game: Game) => game.page.evaluate(() => ((window as any).__silly.runtime.debugInfo.sleds as any[]).map((t) => ({ mode: t.mode, x: t.x, z: t.z })));
const swimming = (game: Game) => game.page.evaluate(() => (window as any).__silly.runtime.players.get(0).swimming as boolean);

test('river tubing: step on at the jetty, float down the river under the bridge, get tipped out on the bank', async ({ page }) => {
  test.setTimeout(240_000);
  const game = new Game(page);
  await game.open();
  await game.start();
  // walk along the jetty onto the tube waiting at its end
  await game.teleport(0, 18, 1, -13);
  await game.seconds(0.5);
  await game.hold('KeyD', 0.7);
  await game.seconds(1.2);
  let t = await tubes(game);
  const mine = t.findIndex((x) => x.mode === 'ride');
  expect(mine).toBeGreaterThanOrEqual(0);
  // along for the ride: never in the water, always on the tube, under the footbridge and on
  let underBridge = false;
  let p = await game.player(0);
  for (let i = 0; i < 40; i += 1) {
    await game.seconds(0.5);
    t = await tubes(game);
    p = await game.player(0);
    if (p.launched) break;
    expect(await swimming(game)).toBe(false);
    expect(Math.hypot(p.x - t[mine].x, p.z - t[mine].z)).toBeLessThan(1.1);
    if (Math.abs(p.z + 2) < 1) underBridge = true;
    if (i === 8) await game.screenshot('test-results/tubing.png');
  }
  expect(underBridge).toBe(true);
  // tipped out onto the west bank at the take-out
  for (let i = 0; i < 20 && (await game.player(0)).launched; i += 1) await game.seconds(0.25);
  p = await game.player(0);
  expect(Math.hypot(p.x - 17.5, p.z - 23)).toBeLessThan(3);
  expect(await swimming(game)).toBe(false);
  expect(await stickers(game)).toContain('tube');
  // the tube bobs back up at the end of the line at the jetty
  await game.seconds(1.5);
  t = await tubes(game);
  expect(t.every((x) => x.mode === 'wait')).toBe(true);
  expect(Math.max(...t.map((x) => x.z))).toBeLessThan(-12);
  game.expectNoErrors();
});

test('sledding: walk into a sled on the mountain top, whoosh down the slope, fly off the hill', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  // on the mountain top, just east of the sled, walk west into it
  await game.teleport(0, -4, 1, -55);
  await game.seconds(0.5);
  await game.hold('KeyA', 0.4);
  let s = await sleds(game);
  expect(s[0].mode).toBe('ride');
  let fastest = 0;
  let prev = (await game.player(0)).x;
  let p = await game.player(0);
  for (let i = 0; i < 70; i += 1) {
    await game.seconds(0.1);
    p = await game.player(0);
    fastest = Math.max(fastest, (prev - p.x) / 0.1);
    prev = p.x;
    if (i === 12) await game.screenshot('test-results/sledding.png');
    if ((await sleds(game))[0].mode === 'away') break;
  }
  expect(fastest).toBeGreaterThan(8); // really going down the slope
  expect(await stickers(game)).toContain('sled');
  // flying off the hill, and landing well past it in the grass
  for (let i = 0; i < 30 && (await game.player(0)).launched; i += 1) await game.seconds(0.2);
  p = await game.player(0);
  expect(p.x).toBeLessThan(-42);
  expect(Math.abs(p.z + 55)).toBeLessThan(4);
  // the sled pops back up at the top
  await game.seconds(3);
  s = await sleds(game);
  expect(s[0]).toMatchObject({ mode: 'park', x: -6.5, z: -55 });
  game.expectNoErrors();
});

test('the arched footbridge: up, over the river, down again, dry feet', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.teleport(0, 16, 1, -2);
  await game.seconds(0.5);
  let top = 0;
  await page.keyboard.down('KeyD');
  for (let i = 0; i < 22; i += 1) {
    await game.seconds(0.1);
    top = Math.max(top, (await game.player(0)).y);
    expect(await swimming(game)).toBe(false);
  }
  await page.keyboard.up('KeyD');
  expect(top).toBeGreaterThan(2.3);
  expect((await game.player(0)).x).toBeGreaterThan(31);
  game.expectNoErrors();
});
