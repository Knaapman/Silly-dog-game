import { expect, test } from '@playwright/test';
import { Game } from './game';

const photos = (game: Game) => game.page.evaluate(() => (window as any).__silly.usePhotos.getState().photos.map((p: any) => p.url as string));

/** Spread of pixel brightness in a photo: a blank or black picture is ~0. */
const contrast = (game: Game, url: string) =>
  game.page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 36;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, 64, 36);
    const d = ctx.getImageData(0, 0, 64, 36).data;
    const lum: number[] = [];
    for (let i = 0; i < d.length; i += 4) lum.push(0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]);
    const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
    return Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length);
  }, url);

test('the camera button: countdown, everyone jumps, a real picture, kept in the gallery', async ({ page }) => {
  const game = new Game(page);
  await game.withPads();
  await game.open();
  await game.start();
  await game.join('kb2');
  await game.teleport(0, 18, 1, 8);
  await game.teleport(1, 20, 1, 8);
  await game.seconds(1);

  // keyboard T: three beeps, then the picture; everybody hops for it
  const y0 = (await game.player(1)).y;
  await game.tap('KeyT');
  await expect(page.getByTestId('photo-countdown')).toBeVisible();
  expect(await photos(game)).toHaveLength(0);
  expect(await game.maxY(1, 1.9)).toBeGreaterThan(y0 + 1);
  let urls = await photos(game);
  expect(urls).toHaveLength(1);
  expect(urls[0]).toMatch(/^data:image\/jpeg;base64,/);
  expect(await contrast(game, urls[0])).toBeGreaterThan(8);
  await game.seconds(0.3, true);
  await expect(page.getByTestId('photo-preview')).toBeVisible();
  await page.screenshot({ path: 'test-results/photo-preview.png' });
  await game.seconds(3.5);

  // the Capture button on a HORIPAD that hasn't joined: a photo, and nobody new joins
  await page.evaluate(() => (window as any).__addPad(0, '', 'HORIPAD S (Vendor: 0f0d Product: 00c1)'));
  await game.pad(0, 13);
  await game.seconds(2);
  expect(await photos(game)).toHaveLength(2);
  expect(await game.state<number>('(g) => g.players.length')).toBe(2);

  // the pink button on screen
  await page.getByTestId('camera-button').click();
  await game.seconds(2);
  urls = await photos(game);
  expect(urls).toHaveLength(3);

  // grown-ups menu: all three are there; delete one
  await page.keyboard.press('Escape');
  await game.seconds(0.1, true);
  await expect(page.getByTestId('photo-thumb')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/photo-gallery.png' });
  await page.getByTestId('photo-thumb').first().getByTitle('Delete').click();
  await expect(page.getByTestId('photo-thumb')).toHaveCount(2);
  game.expectNoErrors();
});
