import { expect, test } from '@playwright/test';
import { Game } from './game';

// The roundabout: push it (headbutt its edge, or run round beside it) and it turns, carrying
// whoever's on it round; when it really whizzes, a rider near the edge flies off (a sticker, and a
// friend sticker when a friend did the pushing). It slows down by itself. Alone, the buddy pushes.

type R = { spin: number; flings: number; pushes: number; bonks: number; lastPusher: number; riders: number[] };
const ra = (game: Game) => game.page.evaluate(() => ({ ...(window as any).__silly.runtime.debugInfo.roundabout }) as R);
const layout = (game: Game) => game.page.evaluate(() => (window as any).__silly.layout.ROUNDABOUT as { center: [number, number]; radius: number });
const stickers = (game: Game) => game.page.evaluate(() => (window as any).__silly.useStickers.getState().got as string[]);

test('a friend shoves the roundabout round while you ride: faster and faster, until you fly off', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');
  const { center, radius } = await layout(game);
  const [cx, cz] = center;
  // on board, out near the edge
  await game.teleport(0, cx + 1.8, 0.9, cz);
  await game.seconds(0.8);
  expect((await ra(game)).riders).toContain(0);

  // the friend, on the south side, headbutts the rim eastwards (the way it turns), again and again
  for (let k = 0; k < 6 && (await ra(game)).flings === 0; k += 1) {
    await game.hopTo(1, [cx - 2, cz + radius + 0.6], [cx - 0.5, cz + radius + 0.6]);
    await game.tap('ShiftRight');
    await game.seconds(0.3);
  }
  for (let k = 0; k < 20 && (await ra(game)).flings === 0; k += 1) await game.seconds(0.1);
  const s = await ra(game);
  expect(s.bonks).toBeGreaterThanOrEqual(2);
  expect(s.flings).toBe(1);
  expect((await game.player(0)).launched).toBe(true);
  expect(await stickers(game)).toContain('roundabout');
  expect(await stickers(game)).toContain('roundaboutfriends');
  await game.seconds(0.2, true);
  await game.screenshot('test-results/roundabout-fling.png');

  // left alone, it slows right down
  await game.seconds(14, true);
  expect(Math.abs((await ra(game)).spin)).toBeLessThan(0.6);
  await game.screenshot('test-results/roundabout.png');
  game.expectNoErrors();
});

test('running past it pushes it round; riding it in the middle you hang on', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const { center, radius } = await layout(game);
  const [cx, cz] = center;
  // run east along its south side
  await game.teleport(0, cx - 4, 0.5, cz + radius + 0.5);
  await game.seconds(0.5);
  await game.hold('KeyD', 1.2);
  let s = await ra(game);
  expect(s.pushes).toBeGreaterThan(0);
  expect(s.spin).toBeGreaterThan(0.5);
  // hop on, right in the middle: round you go, but you don't fly off
  await page.evaluate(() => ((window as any).__silly.runtime.debugInfo.roundabout.spin = 3.5));
  await game.teleport(0, cx + 0.3, 0.9, cz);
  await game.seconds(1.5);
  s = await ra(game);
  expect(s.riders).toContain(0);
  expect(s.flings).toBe(0);
  game.expectNoErrors();
});

test('playing alone, the buddy runs round pushing while you ride', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const { center } = await layout(game);
  const [cx, cz] = center;
  await page.evaluate(() => (window as any).__silly.useGame.getState().addBuddy());
  await game.seconds(1);
  await game.teleport(0, cx + 1.8, 0.9, cz);
  for (let k = 0; k < 20 && Math.abs((await ra(game)).spin) < 1.5; k += 1) await game.seconds(0.5);
  const s = await ra(game);
  const buddy = await page.evaluate(() => [...(window as any).__silly.runtime.players.values()].find((p: any) => p.bot)?.slot as number);
  expect(Math.abs(s.spin)).toBeGreaterThanOrEqual(1.5);
  expect(s.lastPusher).toBe(buddy);
  game.expectNoErrors();
});

test('a rider flung off the east side lands on the grass, not in the border hedge', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const { center } = await layout(game);
  const [cx, cz] = center;
  const half = 80; // (WORLD_HALF_X: the border hedge stands just inside it)
  // spinning fast, and a rider dropped onto its east rim: off they go, eastwards towards the hedge
  await page.evaluate(() => ((window as any).__silly.runtime.debugInfo.roundabout.spin = 3.5));
  await game.teleport(0, cx + 2.1, 0.7, cz);
  for (let k = 0; k < 20 && (await ra(game)).flings === 0; k += 1) await game.seconds(1 / 30);
  expect((await ra(game)).flings).toBe(1);
  for (let k = 0; k < 40 && (await game.player(0)).launched; k += 1) await game.seconds(0.1);
  await game.seconds(0.5);
  const p = await game.player(0);
  expect(p.launched).toBe(false);
  expect(p.x).toBeGreaterThan(cx + 1.5); // (it went east)
  expect(p.x).toBeLessThan(half - 1.6);
  expect(p.y).toBeLessThan(1.5);
  game.expectNoErrors();
});
