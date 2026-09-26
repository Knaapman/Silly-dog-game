import { test } from '@playwright/test';
import { Game } from './game';

test('every area of the park loads and runs without errors', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const areas: [string, number, number][] = [
    ['hub', 0, 9],
    ['carnival', 0, -38],
    ['sports', 36, -30],
    ['dino', 36, 2],
    ['playground', 30, 36],
    ['beach', 2, 24],
    ['winter', -30, 32],
    ['farm', -36, -2],
    ['forest', -30, -32]
  ];
  for (const [, x, z] of areas) {
    await game.teleport(0, x, 1, z);
    await game.seconds(1, true);
  }
  game.expectNoErrors();
});
