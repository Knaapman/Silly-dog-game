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

test('auto graphics steps down by itself when the frame rate is low', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__silly?.runtime?.props.size > 50, null, { timeout: 60_000 });
  // pretend the graphics card looked strong: this software-rendered browser can't keep up
  await page.evaluate(() => (window as any).__silly.useSettings.getState().setDetected('ultra', 'test'));
  await page.waitForFunction(() => (window as any).__silly.useSettings.getState().autoLevel === 'low', null, { timeout: 90_000 });
  expect(await page.evaluate(() => (window as any).__silly.perf.fps)).toBeLessThan(48);
});

const ready = (page: import('@playwright/test').Page) => page.waitForFunction(() => (window as any).__silly?.runtime?.props.size > 50, null, { timeout: 60_000 });
const gameTime = (page: import('@playwright/test').Page) => page.evaluate(() => (window as any).__silly.clock.gameClock.time as number);

test('a part of the park that keeps throwing never stops the real-time game', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.evaluate(() => (window as any).__silly.useGame.getState().start('kb1'));
  // break the kites: their per-frame code now throws every frame
  await page.evaluate(() => ((window as any).__silly.runtime.debugInfo.kites.list = null));
  const t0 = await gameTime(page);
  await page.waitForFunction((t) => (window as any).__silly.clock.gameClock.time > t + 1.5, t0, { timeout: 60_000 });
  const f = await page.evaluate(() => (window as any).__silly.faults);
  expect(f.messages.length).toBeGreaterThanOrEqual(1);
  expect(f.messages[0]).toContain('game frame');
});

test('the graphics card dropping out: the picture comes back, or the game starts afresh', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await page.evaluate(() => {
    const w = window as any;
    w.__lose = w.__silly.gl.getContext().getExtension('WEBGL_lose_context');
    w.__marker = 'still the same page';
  });
  // it drops out and the browser brings it back: drawing picks up again, no reload
  await page.evaluate(() => (window as any).__lose.loseContext());
  await page.waitForTimeout(500);
  await page.evaluate(() => (window as any).__lose.restoreContext());
  const t0 = await gameTime(page);
  await page.waitForFunction((t) => (window as any).__silly.clock.gameClock.time > t + 1, t0, { timeout: 60_000 });
  await page.waitForFunction(() => (window as any).__silly.perf.calls > 10, null, { timeout: 10_000 });
  await page.waitForTimeout(3500);
  expect(await page.evaluate(() => (window as any).__marker)).toBe('still the same page');

  // it drops out for good: after a few seconds the page reloads and the park is back
  const reloaded = page.waitForEvent('load', { timeout: 20_000 });
  await page.evaluate(() => (window as any).__lose.loseContext());
  await reloaded;
  await ready(page);
  expect(await page.evaluate(() => (window as any).__marker)).toBeUndefined();
});
