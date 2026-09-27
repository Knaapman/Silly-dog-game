import { expect, test } from '@playwright/test';
import { Game } from './game';

const stickers = (game: Game) => game.page.evaluate(() => [...(window as any).__silly.useStickers.getState().got] as string[]);

test('the mesa: the launch pad puts you on top, and you can walk up the ramp', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();

  // step on the pad by the brontosaurus: off you fly, onto the grass on top
  await game.teleport(0, 42, 1, -19);
  let p = await game.player(0);
  for (let i = 0; i < 60; i += 1) {
    await game.seconds(0.1);
    p = await game.player(0);
    if (i > 10 && !p.launched && p.y > 5) break;
  }
  expect(p.launched).toBe(false);
  expect(p.y).toBeGreaterThan(5.2);
  expect(Math.abs(p.x - 56)).toBeLessThan(6);
  expect(Math.abs(p.z)).toBeLessThan(9);
  expect(await stickers(game)).toContain('pad');
  await game.screenshot('test-results/mesa-top.png');

  // the ramp on the north side gets you up there on foot
  await game.teleport(0, 51.3, 1, 22.5);
  await game.seconds(0.5);
  await game.hold('KeyW', 3.5);
  await game.seconds(0.5);
  p = await game.player(0);
  expect(p.y).toBeGreaterThan(5.2);
  expect(p.z).toBeLessThan(9);
  game.expectNoErrors();
});

test('the footbridge: up the ramp and along the deck over the north track', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.teleport(0, -18, 1, -40);
  await game.seconds(0.5);
  await game.hold('KeyW', 3.2);
  let p = await game.player(0);
  expect(p.y).toBeGreaterThan(4.3);
  expect(p.z).toBeLessThan(-51.5);
  await game.screenshot('test-results/footbridge.png');
  // the rail at the far end stops you
  await game.hold('KeyW', 2.5);
  p = await game.player(0);
  expect(p.y).toBeGreaterThan(4.3);
  expect(p.z).toBeGreaterThan(-60.5);
  expect(p.z).toBeLessThan(-58);
  game.expectNoErrors();
});

test('the hills: run up one side and down the other', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.teleport(0, -26, 1, -6);
  await game.seconds(0.5);
  let top = 0;
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 30; i += 1) {
    await game.seconds(0.1);
    top = Math.max(top, (await game.player(0)).y);
  }
  await page.keyboard.up('KeyW');
  expect(top).toBeGreaterThan(2.6);
  await game.seconds(1);
  const p = await game.player(0);
  expect(p.z).toBeLessThan(-20);
  expect(p.y).toBeLessThan(1.2);
  game.expectNoErrors();
});
