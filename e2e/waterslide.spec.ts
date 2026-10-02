import { expect, test } from '@playwright/test';
import { Game } from './game';

// The water slide at the beach: up the stairs, into a slide at the top, whoosh down the bends
// and out over the lagoon with a splash. Two at once side by side; the buddy hops in too.

type Ride = { rider: number | null; d: number; v: number };
type Info = { rides: Ride[]; lanes: { start: number[]; end: number[]; length: number }[]; rides_done: number };
const info = (game: Game) => game.page.evaluate(() => JSON.parse(JSON.stringify((window as any).__silly.runtime.debugInfo.waterslide)) as Info);
const stickers = (game: Game) => game.page.evaluate(() => (window as any).__silly.useStickers.getState().got as string[]);
const slide = (game: Game) => game.page.evaluate(() => (window as any).__silly.layout.WATER_SLIDE as { tower: [number, number]; height: number; stairs: number });

test('up the stairs, into the slide, round the bends and splash into the lagoon', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const W = await slide(game);
  const [tx, tz] = W.tower;

  // walk up the stairs from the bottom (they climb south, up to the top of the tower)
  await game.teleport(0, tx, 0.6, tz - 1.6 - W.stairs - 1.2);
  await game.seconds(0.5);
  await game.hold('KeyS', 3);
  let p = await game.player();
  expect(p.y).toBeGreaterThan(W.height);

  // step into the red slide at the top: down it goes, getting faster
  const lanes = (await info(game)).lanes;
  const start = lanes[0].start;
  await game.teleport(0, start[0] + 1.2, W.height + 0.6, start[2]);
  await game.seconds(0.3);
  await game.hold('KeyA', 0.4);
  let s = await info(game);
  expect(s.rides[0].rider).toBe(0);
  await game.seconds(1);
  s = await info(game);
  const v1 = s.rides[0].v;
  expect(s.rides[0].d).toBeGreaterThan(2);
  await game.screenshot('test-results/waterslide.png');
  await game.seconds(0.8);
  expect((await info(game)).rides[0].v).toBeGreaterThan(v1);
  // and out into the lagoon
  for (let t = 0; t < 80 && (await info(game)).rides[0].rider != null; t += 1) await game.seconds(0.1);
  await game.seconds(1.5);
  p = await game.player();
  const end = lanes[0].end;
  expect(Math.hypot(p.x - end[0], p.z - end[2])).toBeGreaterThan(2);
  expect(p.y).toBeLessThan(0.8);
  expect(await page.evaluate(() => (window as any).__silly.terrain.isInWater((window as any).__silly.runtime.players.get(0).position.x, (window as any).__silly.runtime.players.get(0).position.z))).toBe(true);
  expect((await info(game)).rides_done).toBe(1);
  expect(await stickers(game)).toContain('waterslide');
  expect(await stickers(game)).not.toContain('slidetogether');
  game.expectNoErrors();
});

test('two friends side by side, and the buddy hops in next to a child on their own', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');
  const W = await slide(game);
  const lanes = (await info(game)).lanes;
  const [a, b] = [lanes[0].start, lanes[1].start];
  await game.teleport(0, a[0] + 1.2, W.height + 0.6, a[2]);
  await game.teleport(1, b[0] + 1.2, W.height + 0.6, b[2]);
  await game.seconds(0.3);
  await game.page.keyboard.down('KeyA');
  await game.page.keyboard.down('ArrowLeft');
  await game.seconds(0.4);
  await game.page.keyboard.up('KeyA');
  await game.page.keyboard.up('ArrowLeft');
  let s = await info(game);
  expect(s.rides.map((r) => r.rider).sort()).toEqual([0, 1]);
  await game.screenshot('test-results/waterslide-two.png');
  for (let t = 0; t < 80 && (await info(game)).rides.some((r) => r.rider != null); t += 1) await game.seconds(0.1);
  expect(await stickers(game)).toContain('slidetogether');

  // player two goes home, the buddy comes; a child steps in and the buddy hops into the other slide
  await page.evaluate(() => (window as any).__silly.useGame.getState().leave(1));
  await page.evaluate(() => (window as any).__silly.useGame.getState().addBuddy());
  const buddy = await page.evaluate(() => (window as any).__silly.useGame.getState().players.find((p: any) => p.bot).slot as number);
  await game.teleport(buddy, W.tower[0] + 4, 1, W.tower[1] + 4);
  await game.teleport(0, a[0] + 1.2, W.height + 0.6, a[2]);
  await game.seconds(0.3);
  await game.hold('KeyA', 0.4);
  let both = false;
  for (let t = 0; t < 40 && !both; t += 1) {
    await game.seconds(0.1);
    s = await info(game);
    both = s.rides.some((r) => r.rider === buddy) && s.rides.some((r) => r.rider === 0);
  }
  expect(both).toBe(true);
  game.expectNoErrors();
});
