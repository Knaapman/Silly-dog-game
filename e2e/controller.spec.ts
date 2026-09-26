import { expect, test } from '@playwright/test';
import { Game } from './game';

const players = (game: Game) =>
  game.page.evaluate(() => (window as any).__silly.useGame.getState().players.map((p: any) => ({ slot: p.slot, source: p.source, asleep: !!p.asleep, species: p.species })));

test('a controller starts the game, joins, naps when unplugged and wakes when back', async ({ page }) => {
  const game = new Game(page);
  await game.withPads();
  await game.open();
  await page.evaluate(() => (window as any).__addPad(0, 'standard', 'Xbox Pad A'));
  await game.pad(0, 0, 0.1); // any button on the title screen starts
  await game.seconds(1.5);
  expect(await players(game)).toMatchObject([{ source: 'pad0' }]);

  // hold Start: the grown-ups menu; B closes it
  await game.pad(0, 9, 1.2);
  expect(await page.evaluate(() => (window as any).__silly.useGame.getState().menuOpen)).toBe(true);
  await game.pad(0, 1, 0.1);
  await game.seconds(0.2);
  expect(await page.evaluate(() => (window as any).__silly.useGame.getState().menuOpen)).toBe(false);

  // unplug: napping, not gone; the same pad in another port wakes the same animal
  await page.evaluate(() => (window as any).__unplug(0));
  await game.seconds(2);
  expect(await players(game)).toMatchObject([{ slot: 0, asleep: true }]);
  await page.evaluate(() => (window as any).__addPad(2, 'standard', 'Xbox Pad A'));
  await game.pad(2, 0, 0.1);
  await game.seconds(0.5);
  expect(await players(game)).toMatchObject([{ slot: 0, source: 'pad2', asleep: false }]);
  game.expectNoErrors();
});

test('HORI Pad Mini (Switch layout, not recognised by the browser): bottom button jumps', async ({ page }) => {
  const game = new Game(page);
  await game.withPads();
  await game.open();
  await page.evaluate(() => (window as any).__addPad(0, '', 'HORIPAD S (Vendor: 0f0d Product: 00c1)'));
  await game.pad(0, 1, 0.1); // B (bottom) starts the game
  await game.seconds(2);
  const y0 = (await game.player()).y;
  await game.pad(0, 1, 0.1); // B again: jump
  expect(await game.maxY(0, 0.6)).toBeGreaterThan(y0 + 1);

  // A (right) is the headbutt, not a jump
  await game.seconds(1);
  const y1 = (await game.player()).y;
  await game.pad(0, 2, 0.1);
  expect(await game.maxY(0, 0.5)).toBeLessThan(y1 + 0.3);
  game.expectNoErrors();
});
