import { expect, test } from '@playwright/test';
import { Game } from './game';

const stars = (game: Game) => game.page.evaluate(() => (window as any).__silly.useGame.getState().stars as boolean[]);

test('a geyser throws you onto the fountain, where the first star is', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.teleport(0, -14.5, 1, 5); // standing on a geyser
  await game.seconds(7);
  expect((await stars(game))[0]).toBe(true);
  game.expectNoErrors();
});

test('the barn launch pad puts you on the roof star', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.teleport(0, -46, 1, 18); // LAUNCH_PADS[0], next to the barn
  await game.seconds(5);
  expect((await stars(game))[7]).toBe(true);
  game.expectNoErrors();
});

test('see-saw: jumping on one end flings a friend on the other', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');
  // see-saw 1 runs along z at (59, 42). Bring both over first, or the co-op leash (which pulls
  // players together past 30 m) drags the waiting one off the plank.
  await game.teleport(0, 59, 1, 36);
  await game.teleport(1, 56, 1, 44);
  await game.seconds(1);
  await game.teleport(0, 59, 2.4, 40); // waiting on one end
  await game.seconds(3);
  const rest = (await game.player(0)).y;
  expect(rest).toBeLessThan(1.2);
  await game.teleport(1, 59, 7, 44); // drop on the other end
  expect(await game.maxY(0, 2)).toBeGreaterThan(rest + 3);
  game.expectNoErrors();
});
