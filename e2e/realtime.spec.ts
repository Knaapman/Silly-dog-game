import { expect, test } from '@playwright/test';

// Everything else runs in test mode; this checks the normal, real-time game loop too.
test('real-time play: the animal walks, and the grown-ups menu pauses the game', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__silly?.runtime?.props.size > 50, null, { timeout: 60_000 });
  // A software-rendered test browser draws only a few frames a second and the game runs in
  // slow motion then (by design), so wait for game time, not wall time.
  const clock = () => page.evaluate(() => (window as any).__silly.clock.gameClock.time as number);
  const waitGame = async (seconds: number) => {
    const until = (await clock()) + seconds;
    await page.waitForFunction((t) => (window as any).__silly.clock.gameClock.time >= t, until, { timeout: 60_000 });
  };
  await page.evaluate(() => (window as any).__silly.useGame.getState().start('kb1'));
  await waitGame(1.5);
  const x0 = await page.evaluate(() => (window as any).__silly.runtime.players.get(0).position.x);
  await page.keyboard.down('KeyD');
  await waitGame(0.8);
  await page.keyboard.up('KeyD');
  const x1 = await page.evaluate(() => (window as any).__silly.runtime.players.get(0).position.x);
  expect(x1 - x0).toBeGreaterThan(1);

  await page.evaluate(() => (window as any).__silly.useGame.getState().setMenuOpen(true));
  await page.waitForFunction(() => (window as any).__silly.clock.gameClock.paused);
  const paused = await clock();
  const frame = await page.evaluate(() => (window as any).__silly.clock.gameClock.frame as number);
  await page.waitForFunction((f) => (window as any).__silly.clock.gameClock.frame > f + 5, frame);
  expect(await clock()).toBe(paused);
  expect(errors).toEqual([]);
});
