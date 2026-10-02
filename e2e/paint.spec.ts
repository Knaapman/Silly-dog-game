import { expect, test } from '@playwright/test';
import { Game } from './game';

// Paint buckets: headbutt one over and everyone near is painted; painted animals leave paw
// prints; walk through the puddle to get painted too; the water washes it off.

const paintOf = (game: Game, slot = 0) =>
  game.page.evaluate((slot) => {
    const p = (window as any).__silly.runtime.debugInfo.paintOf?.get?.(slot);
    return p ? { amount: p.amount as number, color: p.color as number, colors: [...p.colors] as number[] } : null;
  }, slot);
const info = (game: Game) => game.page.evaluate(() => {
  const d = (window as any).__silly.runtime.debugInfo.paint;
  return { tips: d.buckets.map((b: any) => b.tips as number), puddles: d.buckets.map((b: any) => !!b.puddle), prints: d.footprints.added as number };
});
const stickers = (game: Game) => game.page.evaluate(() => (window as any).__silly.useStickers.getState().got as string[]);

test('headbutt a paint bucket: painted! paw prints everywhere, a friend through the puddle, and a wash', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');
  const P = await page.evaluate(() => (window as any).__silly.layout.PAINT_BUCKETS as { center: [number, number]; spacing: number });
  const bx = (i: number) => P.center[0] + (i - 1.5) * P.spacing;
  const bz = P.center[1];
  await game.teleport(1, bx(0) - 3, 1, bz + 6);

  // over goes the red one (from the south, so it pours out north)
  await game.hopTo(0, [bx(0), bz + 4], [bx(0), bz + 1.4]);
  await game.tap('KeyE');
  await game.seconds(0.4);
  expect((await info(game)).tips[0]).toBe(1);
  let p = await paintOf(game);
  expect(p?.amount).toBeGreaterThan(0.9);
  expect(p?.color).toBe(0);
  expect(await stickers(game)).toContain('paint');
  await game.screenshot('test-results/paint-tip.png');

  // run about: a trail of paw prints
  const before = (await info(game)).prints;
  await game.hold('KeyS', 1.5);
  expect((await info(game)).prints - before).toBeGreaterThan(5);
  await game.screenshot('test-results/paint-prints.png');

  // player two walks through the puddle (just north of the bucket): painted red too
  expect((await info(game)).puddles[0]).toBe(true);
  await game.teleport(1, bx(0) - 2.5, 0.6, bz - 1.3);
  await game.hold('ArrowRight', 1);
  expect((await paintOf(game, 1))?.color).toBe(0);

  // all four colours before a wash: the rainbow sticker
  for (const i of [1, 2, 3]) {
    await game.hopTo(0, [bx(i), bz + 4], [bx(i), bz + 1.4]);
    await game.tap('KeyE');
    await game.seconds(0.4);
  }
  p = await paintOf(game);
  expect(p?.colors.sort()).toEqual([0, 1, 2, 3]);
  expect(p?.color).toBe(3);
  expect(await stickers(game)).toContain('rainbowpaint');
  await game.seconds(3);
  await page.evaluate(() => (window as any).__silly.useSettings.getState().set?.({ zoom: 0.6 }));
  await game.screenshot('test-results/paint-dog.png');

  // the buckets stand back up after a while
  await game.seconds(6.5);
  await game.hopTo(0, [bx(0), bz + 4], [bx(0), bz + 1.4]);
  await game.tap('KeyE');
  await game.seconds(0.4);
  expect((await info(game)).tips[0]).toBe(2);

  // a swim washes it off (player two goes home first: the leash keeps friends together)
  await page.evaluate(() => (window as any).__silly.useGame.getState().leave(1));
  const fountain = await page.evaluate(() => (window as any).__silly.layout.FOUNTAIN.center as [number, number]);
  await game.teleport(0, fountain[0] + 3.5, 0.5, fountain[1]);
  await game.seconds(3);
  p = await paintOf(game);
  expect(p?.amount).toBe(0);
  expect(p?.colors).toEqual([]);
  game.expectNoErrors();
});
