import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { Game } from './game';

// The play log: each session's smoothness, draw calls, stuck animals, stickers and where in the
// park the animals were, kept on this computer; the grown-ups menu shows the draw calls and saves
// the log as a file.

test('the play log keeps track of a session, and the grown-ups menu saves it as a file', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');
  await game.seconds(0.5, true);
  // a frame has been drawn: its draw calls are counted
  expect(await page.evaluate(() => (window as any).__silly.perf.calls)).toBeGreaterThan(10);

  // a few seconds of play, ticked by hand (test mode doesn't run the log's timer)
  const tick = (ms: number) => page.evaluate((t) => (window as any).__silly.playlog.tickPlayLog(t), ms);
  await page.evaluate(() => ((window as any).__silly.perf.fps = 58));
  await tick(0);
  const farm = await page.evaluate(() => (window as any).__silly.layout.ZONES.farm as [number, number]);
  await game.teleport(0, farm[0], 1, farm[1]);
  await game.seconds(0.3, true);
  for (let s = 1; s <= 14; s += 1) await tick(s * 1000);
  await page.evaluate(() => (window as any).__silly.useStickers.getState().earn('photo'));
  await tick(15000);

  // the menu: draw calls by the frame rate, and the log
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('draws')).toContainText('draws');
  const download = page.waitForEvent('download');
  await page.getByTestId('playlog-save').click();
  const file = JSON.parse(readFileSync(await (await download).path(), 'utf8'));
  expect(file.sessions).toHaveLength(1);
  const s = file.sessions[0];
  expect(s.seconds).toBe(15);
  expect(s.maxPlayers).toBe(2);
  expect(s.animals.length).toBeGreaterThanOrEqual(1);
  expect(s.fps.avg).toBe(58);
  expect(s.fps.samples).toBe(6); // (from ten seconds in: warming up doesn't count)
  expect(s.draws.max).toBeGreaterThan(10);
  expect(s.zones.farm).toBeGreaterThanOrEqual(10);
  expect(s.stickers).toContain('photo');
  expect(s.unstuck).toEqual({ hops: 0, pops: 0, rescues: 0, under: 0, where: [] });
  expect(s.errors).toEqual([]);
  await expect(page.getByTestId('playlog')).toContainText('1 session');

  // clear it
  await page.getByTestId('playlog-clear').click();
  await expect(page.getByTestId('playlog')).toContainText('0 sessions');
  game.expectNoErrors();
});

test('the ground is drawn in chunks: only the part the camera can see', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');
  await page.evaluate(() => (window as any).__silly.useSettings.setState({ quality: 'low' }));
  await game.seconds(1, true);
  // (as one mesh, the ground alone was about 250k triangles in every frame; the whole hub view was ~360k)
  const triangles = await page.evaluate(() => (window as any).__silly.perf.triangles);
  expect(triangles).toBeGreaterThan(20_000);
  expect(triangles).toBeLessThan(260_000);
  game.expectNoErrors();
});
