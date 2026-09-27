import { expect, test } from '@playwright/test';
import { Game } from './game';

const settings = (game: Game) => game.page.evaluate(() => (window as any).__silly.useSettings.getState());

test('grown-ups settings: a controller changes them in the menu, and they change the game', async ({ page }) => {
  const game = new Game(page);
  await game.withPads();
  await game.open();
  await page.evaluate(() => (window as any).__addPad(0, 'standard', 'Pad'));
  await game.pad(0, 0, 0.1);
  await game.seconds(1.5);

  // hold Start for the menu; D-pad down: the volume, the zoom, then the first setting (running speed)
  await game.pad(0, 9, 1.2);
  await expect(page.getByTestId('grown-up-menu')).toBeVisible();
  await game.pad(0, 13);
  await game.pad(0, 13);
  await game.pad(0, 15); // right: a step further out
  expect((await settings(game)).zoom).toBeCloseTo(1.1, 5);
  await game.pad(0, 14);
  await game.pad(0, 13);
  await game.pad(0, 14); // left: calm
  expect((await settings(game)).speed).toBe(0);
  await game.pad(0, 15);
  await game.pad(0, 15); // right, right: zoomy
  expect((await settings(game)).speed).toBe(2);
  await game.screenshot('test-results/settings-menu.png');
  await game.pad(0, 1); // B closes
  await game.seconds(0.2);

  // zoomy vs calm: the same run covers clearly different ground
  const run = async () => {
    await game.teleport(0, 0, 1, 20);
    await game.seconds(0.6);
    const a = await game.player(0);
    await page.evaluate(() => (window as any).__press(0, 15, true));
    await game.seconds(1);
    await page.evaluate(() => (window as any).__press(0, 15, false));
    return (await game.player(0)).x - a.x;
  };
  const zoomy = await run();
  await page.evaluate(() => (window as any).__silly.useSettings.getState().set({ speed: 0 }));
  const calm = await run();
  expect(zoomy / calm).toBeGreaterThan(1.3);

  // the zoom slider: the camera stands further back (or closer), within limits
  const dist = async (zoom: number) => {
    await page.evaluate((z) => (window as any).__silly.useSettings.getState().set({ zoom: z }), zoom);
    await game.seconds(0.2);
    return page.evaluate(() => (window as any).__silly.runtime.camera.dist as number);
  };
  const normal = await dist(1);
  expect(await dist(1.6)).toBeCloseTo(normal * 1.6, 3);
  expect(await dist(0.6)).toBeCloseTo(normal * 0.6, 3);
  expect(await dist(9)).toBeCloseTo(normal * 1.6, 3);
  expect((await settings(game)).zoom).toBe(1.6);
  game.expectNoErrors();
});
