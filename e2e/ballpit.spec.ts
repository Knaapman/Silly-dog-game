import { expect, test } from '@playwright/test';
import { Game } from './game';

// The ball pit: jump in and the balls splash up; wade through and they part round you; pull a big
// ball out with your tongue and throw it, and later it rolls back into the pit.

const pit = (game: Game) => game.page.evaluate(() => ({ ...(window as any).__silly.runtime.debugInfo.ballPit }) as { splashes: number; stir: number; back: number; last: { speed: number } | null });
const layout = (game: Game) => game.page.evaluate(() => (window as any).__silly.layout.BALL_PIT as { center: [number, number]; size: number });

test('ball pit: jump in and the balls splash up everywhere (a sticker), then settle again', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const P = await layout(game);
  const [cx, cz] = P.center;
  expect((await pit(game)).splashes).toBe(0);
  // in from up high
  await game.teleport(0, cx, 4, cz);
  for (let i = 0; i < 30 && (await pit(game)).splashes === 0; i += 1) await game.seconds(0.05);
  let p = await pit(game);
  expect(p.splashes).toBe(1);
  expect(p.last!.speed).toBeGreaterThan(5);
  expect(await page.evaluate(() => (window as any).__silly.useStickers.getState().got)).toContain('ballpit');
  await game.seconds(0.25, true);
  await game.screenshot('test-results/ballpit-splash.png');
  expect((await pit(game)).stir).toBeGreaterThan(0.3);
  // out again: the balls settle back down
  await game.teleport(0, cx, 1, cz + P.size);
  await game.seconds(3);
  p = await pit(game);
  expect(p.stir).toBeLessThan(0.05);
  game.expectNoErrors();
});

test('wading through: the balls part round you (no splash when you just step in)', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const [cx, cz] = (await layout(game)).center;
  await game.teleport(0, cx - 2, 0.15, cz);
  await game.seconds(0.6);
  // wading is slow going (half speed): still in the pit after a second's walk, the balls parting
  await game.page.keyboard.down('KeyD');
  await game.seconds(1);
  const p = await pit(game);
  const me = await game.player();
  await game.page.keyboard.up('KeyD');
  expect(me.x - (cx - 2)).toBeLessThan(5);
  expect(Math.abs(me.x - cx)).toBeLessThan(2.8);
  expect(p.splashes).toBe(0);
  expect(p.stir).toBeGreaterThan(0.1);
  await game.screenshot('test-results/ballpit-wade.png');
  game.expectNoErrors();
});

test('pull a big ball out with your tongue, throw it out of the pit: later it rolls back in', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const P = await layout(game);
  const [cx, cz] = P.center;
  // inside, by the south wall, facing south
  await game.teleport(0, cx, 0.2, cz + P.size / 2 - 1.4);
  await game.seconds(0.6);
  await game.hold('KeyS', 0.12);
  await game.seconds(0.3);
  await game.tap('KeyQ');
  await game.seconds(0.3);
  const held = () => page.evaluate(() => [...(window as any).__silly.runtime.props.values()].filter((p: any) => p.kind === 'pitball' && p.heldBy === 0).length as number);
  expect(await held()).toBe(1);
  await game.tap('KeyQ');
  await game.seconds(2);
  expect(await held()).toBe(0);
  const outside = () =>
    page.evaluate(([cx, cz, half]) => [...(window as any).__silly.runtime.props.values()].filter((p: any) => {
      if (p.kind !== 'pitball') return false;
      const t = p.getBody().translation();
      return Math.abs(t.x - cx) > half || Math.abs(t.z - cz) > half;
    }).length as number, [cx, cz, P.size / 2] as const);
  expect(await outside()).toBeGreaterThanOrEqual(1);
  // out of the way, and wait: back it comes
  await game.teleport(0, cx + 12, 1, cz);
  await game.seconds(14);
  expect(await outside()).toBe(0);
  expect((await pit(game)).back).toBeGreaterThanOrEqual(1);
  game.expectNoErrors();
});
