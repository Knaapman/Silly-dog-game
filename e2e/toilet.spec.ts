import { expect, test } from '@playwright/test';
import { Game } from './game';

test('the giant toilet flushes you (and your poop) across the park', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await page.evaluate(() => {
    const p = (window as any).__silly.runtime.players.get(0);
    p.feed();
    p.feed();
  });
  // walk up the ramp from the plaza side: the lip on the seat stops us sitting on it
  await game.teleport(0, 6, 1, -2);
  await game.seconds(1);
  await game.hold('KeyD', 1.5);
  await game.seconds(0.5);
  const seat = await game.player();
  expect(seat.y).toBeGreaterThan(1.3);
  expect(Math.hypot(seat.x - 10.8, seat.z + 2)).toBeLessThan(0.9);

  const party0 = await page.evaluate(() => (window as any).__silly.useGame.getState().party);
  await game.tap('KeyG');
  await game.seconds(1.6);
  expect((await game.poopStats()).poops).toBe(0); // swirled down the drain
  expect(await page.evaluate(() => (window as any).__silly.useGame.getState().party)).toBeGreaterThan(party0);

  // ...then whoosh, far away
  await game.seconds(5);
  const landed = await game.player();
  expect(Math.hypot(landed.x - 10.8, landed.z + 2)).toBeGreaterThan(15);
  game.expectNoErrors();
});
