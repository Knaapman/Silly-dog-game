import { expect, test } from '@playwright/test';
import { Game } from './game';

test('piggyback: ride a friend, get thrown off, stack a tower', async ({ page }) => {
  const game = new Game(page);
  await game.withPads();
  await game.open();
  await game.start();
  await game.join('kb2');

  // drop the dog on the goat's back
  await game.teleport(1, 12, 1, -4);
  await game.seconds(1);
  await game.teleport(0, 12, 2.2, -4);
  await game.seconds(1);
  let rider = await game.player(0);
  expect(rider.ridingOn).toBe(1);
  expect(rider.y).toBeGreaterThan(1.3);

  // the goat walks: the dog comes along on its back
  const c0 = await game.player(1);
  await game.hold('ArrowRight', 1);
  await game.seconds(0.3);
  const c1 = await game.player(1);
  rider = await game.player(0);
  expect(c1.x - c0.x).toBeGreaterThan(3);
  expect(Math.abs(rider.x - c1.x)).toBeLessThan(0.3);
  expect(rider.y - c1.y).toBeGreaterThan(0.8);

  // the goat flops: everybody off
  await game.tap('Period');
  await game.seconds(0.5);
  expect((await game.player(0)).ridingOn).toBeNull();
  await game.seconds(4);
  await game.tap('Period'); // wake up
  await game.seconds(1);

  // a tower of three with a controller player on top
  await page.evaluate(() => (window as any).__addPad(0));
  await game.pad(0, 0, 0.2);
  await game.seconds(1.5);
  const padSlot = await page.evaluate(() => (window as any).__silly.useGame.getState().players.find((p: any) => p.source === 'pad0').slot);
  await game.teleport(1, 16, 1, 4);
  await game.seconds(1);
  await game.teleport(0, 16, 2.2, 4);
  await game.seconds(1);
  await game.teleport(padSlot, 16, 3.4, 4);
  await game.seconds(1);
  expect((await game.player(0)).ridingOn).toBe(1);
  expect((await game.player(padSlot)).ridingOn).toBe(0);
  expect((await game.player(padSlot)).y).toBeGreaterThan((await game.player(0)).y + 0.8);

  // jump off the top
  await game.pad(0, 0, 0.1);
  await game.seconds(0.2);
  expect((await game.player(padSlot)).ridingOn).toBeNull();
  game.expectNoErrors();
});
