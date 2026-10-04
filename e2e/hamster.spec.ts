import { expect, test } from '@playwright/test';
import { Game } from './game';

// Hamster balls: walk into one and you're inside; the stick rolls it (down the bowling lane into
// the pins!); two balls meeting boing; a fast ball bonks someone on foot; jump to climb out; the
// buddy gets in the next ball and rolls after you; an empty ball pops home after a while.

type Ball = { rider: number | null; x: number; y: number; z: number; speed: number };
const balls = (game: Game) =>
  game.page.evaluate(() => {
    const h = (window as any).__silly.runtime.debugInfo.hamster;
    return {
      list: h.balls.map((b: any) => {
        const t = b.body().translation();
        const v = b.body().linvel();
        return { rider: b.rider, x: t.x, y: t.y, z: t.z, speed: Math.hypot(v.x, v.z) };
      }) as Ball[],
      rides: h.rides as number,
      bumps: h.bumps as number,
      friendBumps: h.friendBumps as number,
      knocks: h.knocks as number,
      homes: h.homes as number
    };
  });
const homes = (game: Game) => game.page.evaluate(() => (window as any).__silly.layout.HAMSTER.homes as [number, number][]);
const stickers = (game: Game) => game.page.evaluate(() => (window as any).__silly.useStickers.getState().got as string[]);
const pins = (game: Game) => game.props('pin');

test('climb into a hamster ball and roll it down the bowling lane into the pins (a sticker); jump to climb out', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const H = await homes(game);
  const before = await pins(game);
  // in through the side of the one at the lane end
  await game.teleport(0, H[0][0] - 2, 0.1, H[0][1]);
  await game.seconds(0.5);
  await game.hold('KeyD', 0.5);
  let s = await balls(game);
  expect(s.list[0].rider).toBe(0);
  expect((await game.player()).launched).toBe(true);
  // roll north, down the lane
  await page.keyboard.down('KeyW');
  await game.seconds(1.5, true);
  await game.screenshot('test-results/hamster-rolling.png');
  await game.seconds(3);
  await page.keyboard.up('KeyW');
  s = await balls(game);
  const me = await game.player();
  expect(Math.hypot(me.x - s.list[0].x, me.z - s.list[0].z)).toBeLessThan(0.5);
  expect(H[0][1] - s.list[0].z).toBeGreaterThan(12);
  await game.seconds(1.5);
  const after = await pins(game);
  const moved = before.filter((p, i) => Math.hypot(p.x - after[i].x, p.z - after[i].z) > 0.3).length;
  expect(moved).toBeGreaterThanOrEqual(3);
  expect(await stickers(game)).toEqual(expect.arrayContaining(['hamster', 'strike']));
  // jump: out we climb, beside it
  await game.tap('Space');
  await game.seconds(1.5);
  s = await balls(game);
  expect(s.list[0].rider).toBeNull();
  const out = await game.player();
  expect(out.launched).toBe(false);
  expect(Math.hypot(out.x - s.list[0].x, out.z - s.list[0].z)).toBeGreaterThan(1.2);
  game.expectNoErrors();
});

test('two friends in balls bump with a boing (a friend sticker); a fast ball bonks someone on foot', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');
  // two balls out on the grass, facing each other
  await page.evaluate(() => {
    const h = (window as any).__silly.runtime.debugInfo.hamster;
    const put = (i: number, x: number, z: number) => {
      const b = h.balls[i].body();
      b.setTranslation({ x, y: (window as any).__silly.terrain.groundHeight(x, z) + 1.15, z }, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    };
    put(1, 64, -9);
    put(3, 72, -9);
  });
  await game.seconds(0.5);
  await game.teleport(0, 64, 0.1, -9);
  await game.teleport(1, 72, 0.1, -9);
  await game.seconds(0.3);
  let s = await balls(game);
  expect(s.list[1].rider).toBe(0);
  expect(s.list[3].rider).toBe(1);
  await page.keyboard.down('KeyD');
  await page.keyboard.down('ArrowLeft');
  for (let i = 0; i < 40 && (await balls(game)).bumps === 0; i += 1) await game.seconds(0.1);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('ArrowLeft');
  s = await balls(game);
  expect(s.bumps).toBeGreaterThanOrEqual(1);
  expect(s.friendBumps).toBeGreaterThanOrEqual(1);
  expect(await stickers(game)).toContain('hamsterbump');
  await game.seconds(1.5);

  // the friend climbs out and stands in the way (not where their empty ball is); player one rolls at them
  await game.tap('Enter');
  await game.seconds(1.5);
  s = await balls(game);
  expect(s.list[3].rider).toBeNull();
  const ball = s.list[1];
  await page.evaluate(([x, z]) => (window as any).__silly.runtime.debugInfo.hamster.balls[3].body().setTranslation({ x, y: 1.2, z }, true), [ball.x, ball.z + 12] as const);
  await game.teleport(1, ball.x + 7, 0.1, ball.z);
  await game.seconds(0.5);
  await page.keyboard.down('KeyD');
  for (let i = 0; i < 40 && (await balls(game)).knocks === 0; i += 1) await game.seconds(0.1);
  await page.keyboard.up('KeyD');
  s = await balls(game);
  expect(s.knocks).toBe(1);
  expect(s.list[1].rider).toBe(0);
  game.expectNoErrors();
});

test('playing alone, the buddy gets in the next ball and rolls after you; empty balls pop home after a while', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const H = await homes(game);
  await game.teleport(0, H[0][0] - 3, 0.1, H[0][1] + 2);
  await page.evaluate(() => (window as any).__silly.useGame.getState().addBuddy());
  await game.seconds(1.5);
  const bot = await page.evaluate(() => [...(window as any).__silly.runtime.players.values()].find((p: any) => p.bot).slot as number);
  await game.teleport(0, H[3][0], 0.1, H[3][1]);
  for (let i = 0; i < 16 && !(await balls(game)).list.some((b) => b.rider === bot); i += 1) await game.seconds(0.25);
  let s = await balls(game);
  expect(s.list[3].rider).toBe(0);
  const mine = s.list.findIndex((b) => b.rider === bot);
  expect(mine).toBeGreaterThanOrEqual(0);
  const start = s.list[mine];
  // roll off west across the grass: the buddy's ball comes after us
  await page.keyboard.down('KeyA');
  await game.seconds(2.5);
  await page.keyboard.up('KeyA');
  await game.seconds(1.5);
  s = await balls(game);
  expect(Math.hypot(s.list[mine].x - start.x, s.list[mine].z - start.z)).toBeGreaterThan(4);
  // out: and the buddy climbs out too
  await game.tap('Space');
  await game.seconds(0.3);
  s = await balls(game);
  expect(s.list.every((b) => b.rider == null)).toBe(true);
  // walk off; after a while the empty balls pop home
  const me = await game.player();
  await game.teleport(0, me.x - 6, 0.1, me.z);
  await game.seconds(27);
  s = await balls(game);
  expect(s.homes).toBeGreaterThanOrEqual(2);
  s.list.forEach((b, i) => expect(Math.hypot(b.x - H[i][0], b.z - H[i][1])).toBeLessThan(0.6));
  game.expectNoErrors();
});
