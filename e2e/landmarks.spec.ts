import { expect, test } from '@playwright/test';
import { Game } from './game';

const above = (game: Game, slot = 0) =>
  game.page.evaluate((slot) => {
    const s = (window as any).__silly;
    const p = s.runtime.players.get(slot).position;
    return p.y - s.terrain.groundHeight(p.x, p.z);
  }, slot);

test('the mesa: up the ramp from the mountainside onto the top, over the tunnel', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  // start on the slope behind it and run south: up the ramp, onto the grass on top
  await game.teleport(0, -14, 1, -41);
  await game.seconds(0.5);
  await game.hold('KeyS', 2.2);
  await game.seconds(0.5);
  const p = await game.player(0);
  expect(p.y).toBeGreaterThan(5.2);
  expect(p.z).toBeGreaterThan(-28);
  expect(p.z).toBeLessThan(-16);
  await game.screenshot('test-results/mesa-top.png');
  game.expectNoErrors();
});

test('the footbridge: up the ramp and along the deck over the west track', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.teleport(0, -20, 1, 36);
  await game.seconds(0.5);
  await game.hold('KeyA', 3.2);
  let p = await game.player(0);
  expect(p.y).toBeGreaterThan(4.3);
  expect(p.x).toBeLessThan(-30);
  await game.screenshot('test-results/footbridge.png');
  // the rail at the far end stops you
  await game.hold('KeyA', 2.5);
  p = await game.player(0);
  expect(p.y).toBeGreaterThan(4.3);
  expect(p.x).toBeGreaterThan(-39);
  expect(p.x).toBeLessThan(-37);
  game.expectNoErrors();
});

test('the hills: run up one side and down the other', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.teleport(0, -30, 1, -28);
  await game.seconds(0.5);
  let top = 0;
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 30; i += 1) {
    await game.seconds(0.1);
    top = Math.max(top, (await game.player(0)).y);
  }
  await page.keyboard.up('KeyW');
  expect(top).toBeGreaterThan(2.5);
  await game.seconds(1);
  const p = await game.player(0);
  expect(p.z).toBeLessThan(-42);
  expect(await above(game)).toBeLessThan(1.2);
  game.expectNoErrors();
});
