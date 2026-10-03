import { expect, test } from '@playwright/test';
import { Game } from './game';

// The photo wall on the mesa's south face: the photos from the camera button go up in big frames,
// newest on the left (empty frames show a camera). The oldest drops off the end.

type W = { shown: number[]; loaded: number; arrivals: number };
const wall = (game: Game) => game.page.evaluate(() => ({ ...(window as any).__silly.runtime.debugInfo.photoWall }) as W);
const photoIds = (game: Game) => game.page.evaluate(() => (window as any).__silly.usePhotos.getState().photos.map((p: any) => p.id as number));

async function snap(game: Game) {
  await game.tap('KeyT');
  await game.seconds(2.2);
}

/** The pictures load in the background: step the game until the wall shows `n`. */
async function waitForWall(game: Game, n: number) {
  for (let k = 0; k < 100 && (await wall(game)).shown.length < n; k += 1) {
    await game.page.waitForTimeout(30);
    await game.seconds(0.05);
  }
}

test('photos from the camera button go up on the photo wall, newest first', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const W = await page.evaluate(() => (window as any).__silly.layout.PHOTO_WALL as { x: number; z: number });
  expect((await wall(game)).shown).toEqual([]);

  await snap(game);
  await waitForWall(game, 1);
  let ids = await photoIds(game);
  expect(ids).toHaveLength(1);
  expect((await wall(game)).shown).toEqual([ids[0]]);
  expect((await wall(game)).arrivals).toBe(1);

  // a second one goes up on the left, the first moves along
  await game.seconds(3);
  await snap(game);
  await waitForWall(game, 2);
  ids = await photoIds(game);
  expect((await wall(game)).shown).toEqual([ids[1], ids[0]]);

  // stand in front of the wall and look
  await game.teleport(0, W.x - 3, 0.5, W.z + 7);
  await game.seconds(4, true);
  await game.screenshot('test-results/photowall.png');
  await game.teleport(0, -6, 0.5, 0);
  await game.seconds(3, true);
  await game.screenshot('test-results/photowall-plaza.png');

  // five fit: a sixth pushes the oldest off the end
  for (let k = 0; k < 4; k += 1) {
    await game.seconds(3);
    await snap(game);
  }
  await waitForWall(game, 5);
  await game.seconds(0.5);
  ids = await photoIds(game);
  expect(ids).toHaveLength(6);
  expect((await wall(game)).shown).toEqual(ids.slice(1).reverse());
  game.expectNoErrors();
});
