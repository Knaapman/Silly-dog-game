import { expect, test } from '@playwright/test';
import { Game } from './game';

const species = (game: Game, slot = 0) => game.state<string>(`(g) => g.players.find((p) => p.slot === ${slot}).species`);
const earn = (game: Game, ids: string[]) => game.page.evaluate((ids) => ids.forEach((id) => (window as any).__silly.useStickers.getState().earn(id)), ids);
const picking = (game: Game, slot = 0) => game.state<boolean>(`(g) => !!g.players.find((p) => p.slot === ${slot})?.picking`);

test('new animals join as the sticker album fills up', async ({ page }) => {
  const game = new Game(page);
  await game.withPads();
  await game.open();
  await game.start();

  // Select (1 on the keyboard) brings up the animals to choose from, the animal as it was
  const picker = page.getByTestId('animal-picker-0');
  await game.tap('Digit1');
  expect(await picking(game)).toBe(true);
  await expect(picker).toBeVisible();
  expect(await species(game)).toBe('dog');
  // Select again: the next one. At first: dog, goat, pig, sheep, and round again
  const seen: string[] = [await species(game)];
  for (let i = 0; i < 4; i += 1) {
    await game.tap('Digit1');
    seen.push(await species(game));
  }
  expect(seen).toEqual(['dog', 'goat', 'pig', 'sheep', 'dog']);
  await expect(picker.locator('[data-species][data-selected="true"]')).toHaveAttribute('data-species', 'dog');
  // the ones still to earn are there, but can't be picked yet
  await expect(picker.locator('[data-species="cat"]')).toBeDisabled();

  // the stick looks through them too, one step per push either way; the animal waits meanwhile
  const x0 = (await game.player()).x;
  await game.tap('KeyA');
  expect(await species(game)).toBe('sheep');
  await game.tap('KeyD');
  await game.hold('KeyD', 0.8);
  await game.seconds(0.1);
  expect(await species(game)).toBe('goat');
  expect(Math.abs((await game.player()).x - x0)).toBeLessThan(0.3);
  await game.tap('KeyD');
  expect(await species(game)).toBe('pig');

  // any other button: that one! (and off it goes: jumping works again)
  await game.tap('Space');
  await game.seconds(0.2, true);
  expect(await picking(game)).toBe(false);
  await expect(picker).toBeHidden();
  expect(await species(game)).toBe('pig');
  await game.seconds(1.5);
  const x1 = (await game.player()).x;
  await game.hold('KeyD', 1);
  expect((await game.player()).x - x1).toBeGreaterThan(2);

  // player one comes back later: still the pig
  await page.evaluate(() => (window as any).__silly.useGame.getState().leave(0));
  await game.seconds(0.5);
  await game.join('kb1');
  expect(await species(game)).toBe('pig');

  // the third sticker brings the cat (and a big cat pops up); tapping a face picks it
  await earn(game, ['goal', 'strike', 'bell']);
  await game.seconds(2, true);
  await expect(page.getByTestId('animal-unlock')).toContainText('🐱');
  await page.getByTestId('player-badge-0').click();
  await expect(picker.locator('[data-species="cat"]')).toBeEnabled();
  await picker.locator('[data-species="cat"]').click();
  await game.seconds(0.2, true);
  expect(await species(game)).toBe('cat');
  expect(await picking(game)).toBe(false);

  // after a while without a choice, the faces go away by themselves
  await game.tap('Digit1');
  expect(await picking(game)).toBe(true);
  await game.seconds(11);
  expect(await picking(game)).toBe(false);

  // 18 stickers: all eight animals
  await earn(game, ['poop', 'toot', 'full', 'flower', 'flush', 'geyser', 'pad', 'cannon', 'volcano', 'seesaw', 'bellyflop', 'giant', 'rocket', 'fire', 'ride']);
  await game.tap('Digit1');
  const all: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    await game.tap('Digit1');
    all.push(await species(game));
  }
  expect(new Set(all)).toEqual(new Set(['dog', 'goat', 'pig', 'sheep', 'cat', 'duck', 'cow', 'unicorn']));
  await game.seconds(0.6);
  await game.tap('Space');

  // line up the new ones for a look, and let each make its noise
  await game.join('kb2');
  await game.join('touch');
  await page.evaluate(() => (window as any).__addPad(0, 'standard', 'Pad'));
  await game.pad(0, 0);
  await game.seconds(1.5);
  // (joining with a button brings up the animals: the same button again goes)
  expect(await picking(game, 3)).toBe(true);
  await game.pad(0, 0);
  expect(await picking(game, 3)).toBe(false);
  const want = ['cat', 'duck', 'cow', 'unicorn'];
  for (let slot = 0; slot < 4; slot += 1) {
    while ((await species(game, slot)) !== want[slot]) await page.evaluate((s) => (window as any).__silly.useGame.getState().cycleSpecies(s), slot);
    await game.teleport(slot, 10 + slot * 2.2, 1, -6);
  }
  await game.seconds(1.5);
  for (const key of ['KeyR', 'Slash']) await game.tap(key);
  await game.seconds(0.5);
  await game.screenshot('test-results/new-animals.png');
  game.expectNoErrors();
});

test('every animal comes in coats: stick up and down, remembered per animal', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const coat = (slot = 0) => game.state<number>(`(g) => g.players.find((p) => p.slot === ${slot}).coat`);
  expect(await coat()).toBe(0);

  await game.tap('Digit1');
  const coats = page.getByTestId('coat-picker-0');
  await expect(coats).toBeVisible();
  await expect(coats.locator('[data-coat]')).toHaveCount(5);
  // down for the next coat, up for the one before (one step per push), round and round
  await game.tap('KeyS');
  expect(await coat()).toBe(1);
  await game.hold('KeyS', 0.6);
  expect(await coat()).toBe(2);
  await game.tap('KeyW');
  expect(await coat()).toBe(1);
  await game.tap('KeyW');
  await game.tap('KeyW');
  expect(await coat()).toBe(4);
  await game.tap('KeyS');
  expect(await coat()).toBe(0);
  await game.tap('KeyS');
  expect(await species(game)).toBe('dog');
  await expect(coats.locator('[data-selected="true"]')).toHaveAttribute('data-coat', '1');
  await game.screenshot('test-results/coat-picker.png');

  // another animal starts in its usual coat; back to the dog, and it's the black dog again
  await game.tap('KeyD');
  expect(await species(game)).toBe('goat');
  expect(await coat()).toBe(0);
  await game.tap('KeyS');
  await game.tap('KeyS');
  await game.tap('KeyS');
  await game.tap('KeyA');
  expect(await species(game)).toBe('dog');
  expect(await coat()).toBe(1);
  // a tap on a blob works too
  await coats.locator('[data-coat="3"]').click();
  expect(await coat()).toBe(3);
  await game.seconds(0.6);
  await game.tap('Space');
  await game.seconds(0.2, true);
  expect(await picking(game)).toBe(false);

  // next time: the blue dog (and the purple goat is waiting)
  await page.evaluate(() => (window as any).__silly.useGame.getState().leave(0));
  await game.seconds(0.5);
  await game.join('kb1');
  expect(await species(game)).toBe('dog');
  expect(await coat()).toBe(3);
  await page.evaluate(() => (window as any).__silly.useGame.getState().setSpecies(0, 'goat'));
  expect(await coat()).toBe(3);

  // the whole wardrobe, for a look
  await earn(game, ['goal', 'strike', 'bell', 'poop', 'toot', 'full', 'flower', 'flush', 'geyser', 'pad', 'cannon', 'volcano', 'seesaw', 'bellyflop', 'giant', 'rocket', 'fire', 'ride']);
  await game.join('kb2');
  await game.join('touch');
  await game.seconds(1);
  const lineup: [string, number][] = [
    ['unicorn', 3],
    ['cow', 3],
    ['pig', 4],
    ['cat', 3]
  ];
  for (let slot = 0; slot < 3; slot += 1) {
    const [sp, c] = lineup[slot];
    await page.evaluate(([s, sp, c]) => {
      const g = (window as any).__silly.useGame.getState();
      g.setSpecies(s, sp);
      g.setCoat(s, c);
    }, [slot, sp, c] as const);
    await game.teleport(slot, 10 + slot * 2.2, 1, -6);
  }
  await game.seconds(1.5);
  await game.screenshot('test-results/coats.png');
  game.expectNoErrors();
});
