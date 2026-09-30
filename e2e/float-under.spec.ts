import { expect, test } from '@playwright/test';
import { Game } from './game';

// Every bridge over water is high enough to float (or swim) under.

const swimming = (game: Game) => game.page.evaluate(() => (window as any).__silly.runtime.players.get(0).swimming as boolean);

test('swim out of the lagoon, under the trestle, into the sea', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.teleport(0, -10, 1, 51); // in the lagoon, clear of the lighthouse island
  await game.seconds(0.5);
  expect(await swimming(game)).toBe(true);
  let highest = -9;
  await page.keyboard.down('KeyS');
  for (let i = 0; i < 20; i += 1) {
    await game.seconds(0.1);
    highest = Math.max(highest, (await game.player(0)).y);
  }
  await page.keyboard.up('KeyS');
  const p = await game.player(0);
  expect(p.z).toBeGreaterThan(58.5); // out past the trestle (at z 56)
  expect(highest).toBeLessThan(0.8); // swimming the whole way, never up on the deck
  expect(await swimming(game)).toBe(true);
  await game.screenshot('test-results/under-the-trestle.png');
  game.expectNoErrors();
});

test('wade up the river under the railway bridge', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.teleport(0, 21.6, 1, -16.5); // beside the tubes waiting at the jetty
  await game.seconds(0.5);
  let highest = -9;
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 26; i += 1) {
    await game.seconds(0.1);
    highest = Math.max(highest, (await game.player(0)).y);
  }
  await page.keyboard.up('KeyW');
  const p = await game.player(0);
  expect(p.z).toBeLessThan(-24.5); // under the bridge (at z -22) and out the other side
  expect(highest).toBeLessThan(0.8);
  await game.screenshot('test-results/under-the-railway-bridge.png');
  game.expectNoErrors();
});

test('the train runs up onto its bridges and down again', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const loco = () => page.evaluate(() => {
    const c = (window as any).__silly.runtime.debugInfo.train[0];
    return { x: c.x, y: c.y, z: c.z };
  });
  let overRiver = 0;
  let overSea = 0;
  let atStation = 9;
  for (let i = 0; i < 150; i += 1) {
    await game.seconds(0.5);
    const c = await loco();
    if (Math.abs(c.z + 22) < 0.5 && Math.abs(c.x - 22.5) < 3) overRiver = Math.max(overRiver, c.y);
    if (Math.abs(c.z - 56) < 0.5 && Math.abs(c.x) < 10) overSea = Math.max(overSea, c.y);
    if (Math.abs(c.x - 34) < 0.5 && c.z > 12 && c.z < 26) atStation = Math.min(atStation, c.y);
  }
  expect(overRiver).toBeGreaterThan(2.4);
  expect(overSea).toBeGreaterThan(2.4);
  expect(atStation).toBeLessThan(0.05);
  game.expectNoErrors();
});
