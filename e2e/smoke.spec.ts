import { test } from '@playwright/test';
import { Game } from './game';

test('every area of the park loads and runs without errors', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const areas: [string, number, number][] = [
    ['hub', -6, 9],
    ['carnival', -50, -20],
    ['sports', 58, -46],
    ['dino', 56, -2],
    ['playground', 56, 36],
    ['beach', 2, 26],
    ['lagoon', -4, 44],
    ['the sea', 0, 60],
    ['winter, up the mountain', 12, -54],
    ['the mountain path', 2, -40],
    ['farm', -50, 40],
    ['forest', -58, 16],
    ['the river', 24, 10],
    ['the station', 31.6, 19],
    ['the mesa top', -14, -22]
  ];
  for (const [, x, z] of areas) {
    await game.teleport(0, x, 1.2, z);
    await game.seconds(1, true);
  }
  game.expectNoErrors();
});
