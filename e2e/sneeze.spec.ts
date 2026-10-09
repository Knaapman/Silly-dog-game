import { expect, test } from '@playwright/test';
import { Game } from './game';

// Tickle the brontosaurus: headbutt its legs and tummy and it giggles; five tickles in a few
// seconds and... ah... ah... CHOO! Anyone up on its back is sneezed off onto the grass, anyone in
// front of its nose is blown away, and there's a sticker.

type B = { tickles: number[]; sneezes: number; blown: number };
const bronto = (game: Game) => game.page.evaluate(() => ({ ...(window as any).__silly.runtime.debugInfo.bronto }) as B);
const center = (game: Game) => game.page.evaluate(() => (window as any).__silly.layout.BRONTO.center as [number, number]);
const stickers = (game: Game) => game.page.evaluate(() => (window as any).__silly.useStickers.getState().got as string[]);

test('five tickles and the brontosaurus sneezes: a friend on its back flies off, one at its nose is blown away', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');
  const [bx, bz] = await center(game);

  // a friend up on its back
  await game.teleport(1, bx, 5.5, bz);
  await game.seconds(1);
  const onBack = await game.player(1);
  expect(onBack.y).toBeGreaterThan(4);

  // tickle: up to its tummy from the south, and headbutt, again and again
  await game.hopTo(0, [bx + 0.5, bz + 5.5], [bx + 0.5, bz + 3]);
  for (let k = 0; k < 4; k += 1) {
    await game.tap('KeyE');
    await game.seconds(0.6);
  }
  let b = await bronto(game);
  expect(b.tickles.length).toBe(4);
  expect(b.sneezes).toBe(0);
  await game.tap('KeyE');
  await game.seconds(0.4, true);
  await game.screenshot('test-results/sneeze-ah.png');
  await game.seconds(0.9, true);
  await game.screenshot('test-results/sneeze.png');
  b = await bronto(game);
  expect(b.sneezes).toBe(1);
  expect(b.blown).toBeGreaterThanOrEqual(1);
  expect(await stickers(game)).toContain('sneeze');
  // the friend flew off its back and landed on the grass beside it
  for (let k = 0; k < 40 && (await game.player(1)).launched; k += 1) await game.seconds(0.1);
  await game.seconds(0.5);
  const off = await game.player(1);
  expect(off.y).toBeLessThan(1.5);
  expect(Math.abs(off.z - bz)).toBeGreaterThan(4);
  game.expectNoErrors();
});

test('a few tickles now and then only make it giggle', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const [bx, bz] = await center(game);
  for (let k = 0; k < 6; k += 1) {
    await game.hopTo(0, [bx + 0.5, bz + 5.5], [bx + 0.5, bz + 3]);
    await game.tap('KeyE');
    await game.seconds(2.5);
  }
  const b = await bronto(game);
  expect(b.sneezes).toBe(0);
  expect(b.tickles.length).toBeGreaterThanOrEqual(1);
  game.expectNoErrors();
});

test('playing alone, the buddy tickles too: slow tickles from the child still end in a sneeze', async ({ page }) => {
  const game = new Game(page);
  await game.open(1, { off: ['cats', 'birds'] });
  await game.start();
  await page.evaluate(() => (window as any).__silly.useGame.getState().addBuddy());
  await game.seconds(1);
  const [bx, bz] = await center(game);
  await game.teleport(1, bx - 4, 0.5, bz + 6);
  await game.hopTo(0, [bx + 0.5, bz + 5.5], [bx + 0.5, bz + 3]);
  // a tickle every two seconds: three at most in the window, never enough on its own
  for (let k = 0; k < 6 && (await bronto(game)).sneezes === 0; k += 1) {
    await game.tap('KeyE');
    await game.seconds(2);
  }
  expect((await bronto(game)).sneezes).toBe(1);
  expect(await stickers(game)).toContain('sneeze');
  game.expectNoErrors();
});
