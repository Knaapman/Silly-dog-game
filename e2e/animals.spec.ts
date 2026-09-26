import { expect, test } from '@playwright/test';
import { Game } from './game';

const species = (game: Game, slot = 0) => game.state<string>(`(g) => g.players.find((p) => p.slot === ${slot}).species`);
const earn = (game: Game, ids: string[]) => game.page.evaluate((ids) => ids.forEach((id) => (window as any).__silly.useStickers.getState().earn(id)), ids);

test('new animals join as the sticker album fills up', async ({ page }) => {
  const game = new Game(page);
  await game.withPads();
  await game.open();
  await game.start();

  // at first: dog, goat, pig, sheep, and round again
  const seen: string[] = [await species(game)];
  for (let i = 0; i < 4; i += 1) {
    await game.tap('Digit1');
    seen.push(await species(game));
  }
  expect(seen).toEqual(['dog', 'goat', 'pig', 'sheep', 'dog']);

  // the third sticker brings the cat (and a big cat pops up)
  await earn(game, ['goal', 'strike', 'bell']);
  await game.seconds(2, true);
  await expect(page.getByTestId('animal-unlock')).toContainText('🐱');
  for (let i = 0; i < 4; i += 1) await game.tap('Digit1');
  expect(await species(game)).toBe('cat');

  // 18 stickers: all eight animals
  await earn(game, ['poop', 'toot', 'full', 'flower', 'flush', 'geyser', 'pad', 'cannon', 'volcano', 'seesaw', 'bellyflop', 'giant', 'rocket', 'fire', 'ride']);
  const all: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    await game.tap('Digit1');
    all.push(await species(game));
  }
  expect(new Set(all)).toEqual(new Set(['dog', 'goat', 'pig', 'sheep', 'cat', 'duck', 'cow', 'unicorn']));

  // line up the new ones for a look, and let each make its noise
  await game.join('kb2');
  await game.join('touch');
  await page.evaluate(() => (window as any).__addPad(0, 'standard', 'Pad'));
  await game.pad(0, 0);
  await game.seconds(1.5);
  const want = ['cat', 'duck', 'cow', 'unicorn'];
  for (let slot = 0; slot < 4; slot += 1) {
    while ((await species(game, slot)) !== want[slot]) await page.evaluate((s) => (window as any).__silly.useGame.getState().cycleSpecies(s), slot);
    await game.teleport(slot, 16 + slot * 2.2, 1, 10);
  }
  await game.seconds(1.5);
  for (const key of ['KeyR', 'Slash']) await game.tap(key);
  await game.seconds(0.5);
  await game.screenshot('test-results/new-animals.png');
  game.expectNoErrors();
});
