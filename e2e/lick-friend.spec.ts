import { expect, test } from '@playwright/test';
import { Game } from './game';

test('lick a friend: grab, drag, throw; and jump to wriggle free', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');

  // the dog faces east with the goat just in front of it (open grass east of the plaza)
  const face = async () => {
    await game.teleport(1, 8.6, 1, -6);
    await game.hopTo(0, [5, -6], [7, -6]);
  };
  await face();
  await game.tap('KeyQ');
  expect((await game.player(1)).grabbedBy).toBe(0);

  // walk backwards (west): the goat comes along on the tongue
  const g0 = await game.player(1);
  await game.hold('KeyA', 1);
  const g1 = await game.player(1);
  expect(g0.x - g1.x).toBeGreaterThan(2);
  expect((await game.player(1)).grabbedBy).toBe(0);
  await game.screenshot('test-results/lick-friend.png');

  // lick again: the goat flies off
  const before = await game.player(1);
  await game.tap('KeyQ');
  expect((await game.player(1)).launched).toBe(true);
  expect(await game.maxY(1, 1.2)).toBeGreaterThan(before.y + 2.5);
  await game.seconds(1.5);
  expect((await game.player(1)).grabbedBy).toBeNull();

  // thrown in the open, it lands well away (7 m ahead of the thrower)
  await face();
  await game.tap('KeyQ');
  const held = await game.player(1);
  await game.tap('KeyQ');
  await game.seconds(2.5);
  const landed = await game.player(1);
  expect(landed.x - held.x).toBeGreaterThan(4.5);

  // grabbed again: the goat's jump button breaks free
  await face();
  await game.tap('KeyQ');
  expect((await game.player(1)).grabbedBy).toBe(0);
  await game.tap('Enter');
  expect((await game.player(1)).grabbedBy).toBeNull();

  // and nobody hangs on forever
  await face();
  await game.tap('KeyQ');
  expect((await game.player(1)).grabbedBy).toBe(0);
  await game.seconds(4.5);
  expect((await game.player(1)).grabbedBy).toBeNull();
  game.expectNoErrors();
});
