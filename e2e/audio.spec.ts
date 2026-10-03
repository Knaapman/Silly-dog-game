import { expect, test } from '@playwright/test';
import { Game } from './game';

// Sounds actually playing (a test browser normally keeps them switched off until someone clicks):
// a sound from somewhere that isn't a number (an animal flung into NaN) must neither throw nor
// keep its place in the voice limit, or after a while the whole park would go quiet.
test.use({
  launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] }
});

test('a sound from a NaN position plays without throwing, and every voice is freed afterwards', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await page.evaluate(() => (window as any).__silly.audio.unlockAudio());
  await page.waitForFunction(() => (window as any).__silly.audio.getAudioState().running, null, { timeout: 10_000 });
  const voices = () => page.evaluate(() => (window as any).__silly.audio.getAudioState().voices as number);
  await page.waitForFunction(() => (window as any).__silly.audio.getAudioState().voices === 0, null, { timeout: 15_000 });

  // a sound right here plays (takes a voice), and gives it back when it's done
  await page.evaluate(() => (window as any).__silly.audio.playBoing({ x: 1, y: 0, z: 1 }));
  expect(await voices()).toBe(1);
  await page.waitForFunction(() => (window as any).__silly.audio.getAudioState().voices === 0, null, { timeout: 5_000 });

  // and from nowhere: no error, and the voice is given back too
  await page.evaluate(() => {
    const a = (window as any).__silly.audio;
    a.playBoing({ x: Number.NaN, y: 0, z: 0 });
    a.playPoof([0, Number.POSITIVE_INFINITY, 0]);
  });
  expect(await voices()).toBeGreaterThanOrEqual(1);
  await page.waitForFunction(() => (window as any).__silly.audio.getAudioState().voices === 0, null, { timeout: 5_000 });
  game.expectNoErrors();
});
