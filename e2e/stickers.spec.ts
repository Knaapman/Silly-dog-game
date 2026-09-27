import { expect, test } from '@playwright/test';
import { Game } from './game';

const got = (game: Game) => game.page.evaluate(() => [...(window as any).__silly.useStickers.getState().got].sort() as string[]);

test('stickers: earned by playing, shown big, collected in an album that pauses the game', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  expect(await got(game)).toEqual([]);

  // an empty tummy: the poop button toots (away from the birds, or the toot would scare them)
  await game.teleport(0, 14, 1, -6);
  await game.seconds(0.5);
  await game.tap('KeyG');
  expect(await got(game)).toEqual(['toot']);
  await game.seconds(0.3, true);
  await expect(page.getByTestId('sticker-pop')).toBeVisible();
  await page.screenshot({ path: 'test-results/sticker-pop.png' });

  // a geyser throws you onto the fountain, where the first star is
  await game.teleport(0, -14.5, 1, 5);
  await game.seconds(7);
  expect(await got(game)).toEqual(['geyser', 'star', 'toot']);
  await expect(page.getByTestId('album-button')).toContainText('3');

  // the album: found stickers in colour, the rest as shadows; the game waits meanwhile
  await page.getByTestId('album-button').click();
  const album = page.getByTestId('sticker-album');
  await expect(album).toBeVisible();
  await expect(album.locator('[data-got="true"]')).toHaveCount(3);
  await expect(album.locator('[data-sticker="toot"]')).toHaveAttribute('data-got', 'true');
  await expect(album.locator('[data-sticker="flush"]')).toHaveAttribute('data-got', 'false');
  const t0 = await page.evaluate(() => (window as any).__silly.clock.gameClock.time);
  await game.seconds(1, true);
  expect(await page.evaluate(() => (window as any).__silly.clock.gameClock.time)).toBe(t0);
  await page.screenshot({ path: 'test-results/sticker-album.png' });

  // Esc closes it, and the game goes on
  await page.keyboard.press('Escape');
  await expect(album).toBeHidden();
  await game.seconds(0.5);
  expect(await page.evaluate(() => (window as any).__silly.clock.gameClock.time)).toBeGreaterThan(t0);
  game.expectNoErrors();
});
