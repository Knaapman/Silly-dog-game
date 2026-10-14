import { expect, test } from '@playwright/test';
import { Game } from './game';

// The grand finale: a grown-up's "time to stop" (or the play timer) brings everyone to the fountain
// for fireworks, then night falls and the park sleeps until "play again"; the very last sticker
// brings the same show, with a golden crown for everyone.

const finale = (game: Game) => game.page.evaluate(() => {
  const f = (window as any).__silly.finale.useFinale.getState();
  return { phase: f.phase as string, kind: f.kind as string, shows: f.shows as number };
});
const nearFountain = (game: Game, slot: number) =>
  game.page.evaluate((slot) => {
    const s = (window as any).__silly;
    const [fx, fz] = s.layout.FOUNTAIN.center;
    const p = s.runtime.players.get(slot).position;
    return Math.hypot(p.x - fx, p.z - fz);
  }, slot);

test('time to stop: everyone gathers at the fountain for fireworks, night falls, and the park sleeps until play again', async ({ page }) => {
  test.setTimeout(180_000);
  const game = new Game(page);
  await game.open(1, { off: ['cats', 'birds'] });
  await game.start();
  await game.join('kb2');
  await game.teleport(0, 30, 1, 20);
  await game.teleport(1, -30, 1, -20);
  await game.seconds(1);
  // the moon button in the grown-ups menu
  await game.tap('Escape');
  await game.seconds(0.2, true);
  await page.getByTestId('bedtime-button').click();
  await game.seconds(0.5);
  expect(await page.getByTestId('grown-up-menu').count()).toBe(0);
  expect((await finale(game)).phase).toBe('gather');
  // both children over at the fountain, held there (pushing the stick does nothing)
  await game.seconds(1.5);
  expect(await nearFountain(game, 0)).toBeLessThan(9);
  expect(await nearFountain(game, 1)).toBeLessThan(9);
  expect((await finale(game)).phase).toBe('show');
  const before = await game.player(0);
  await game.hold('KeyD', 1);
  const after = await game.player(0);
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.5);
  // fireworks, then sleepy, then the night screen
  await game.seconds(11);
  expect((await finale(game)).phase).toBe('sleep');
  await game.seconds(5);
  expect((await finale(game)).phase).toBe('night');
  await expect(page.getByTestId('night-screen')).toBeVisible();
  await game.screenshot('test-results/finale-night.png');
  // the park sleeps: game time stands still
  const t0 = await page.evaluate(() => (window as any).__silly.clock.gameClock.time);
  await game.seconds(2);
  expect(await page.evaluate(() => (window as any).__silly.clock.gameClock.time)).toBe(t0);
  // after a moment, a small button for a grown-up: play again, and everyone is free
  await expect(page.getByTestId('play-again')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('play-again').click();
  await game.seconds(0.5);
  expect((await finale(game)).phase).toBe('off');
  await expect(page.getByTestId('finale')).toHaveCount(0);
  const a = await game.player(0);
  await game.hold('KeyD', 1);
  expect((await game.player(0)).x - a.x).toBeGreaterThan(2);
  game.expectNoErrors();
});

test('the play timer brings the goodnight show by itself', async ({ page }) => {
  const game = new Game(page);
  await game.open(1, { off: ['cats', 'birds'] });
  await game.start();
  await page.evaluate(() => (window as any).__silly.useSettings.getState().set({ bedtime: 15 }));
  await game.seconds(1);
  expect((await finale(game)).phase).toBe('off');
  // (fast-forward: nearly fifteen minutes played)
  await page.evaluate(() => ((window as any).__silly.runtime.debugInfo.finale.played.current = 15 * 60 - 1));
  await game.seconds(1.5);
  expect(await finale(game)).toMatchObject({ phase: 'gather', kind: 'bedtime' });
  await page.evaluate(() => (window as any).__silly.useSettings.getState().set({ bedtime: 0 }));
  game.expectNoErrors();
});

test('the very last sticker: fireworks at the fountain and a golden crown for everyone, then play goes on', async ({ page }) => {
  test.setTimeout(120_000);
  const game = new Game(page);
  await game.open(1, { off: ['cats', 'birds'] });
  await game.start();
  await game.join('kb2');
  await page.evaluate(() => {
    const s = (window as any).__silly;
    const all = s.stickers.STICKERS.map((x: any) => x.id) as string[];
    all.slice(0, -1).forEach((id) => s.useStickers.getState().earn(id));
  });
  await game.seconds(1);
  expect((await finale(game)).phase).toBe('off');
  await page.evaluate(() => {
    const s = (window as any).__silly;
    const all = s.stickers.STICKERS.map((x: any) => x.id) as string[];
    s.useStickers.getState().earn(all[all.length - 1]);
  });
  await game.seconds(0.5);
  expect(await finale(game)).toMatchObject({ phase: 'gather', kind: 'album' });
  await game.seconds(14);
  expect((await finale(game)).phase).toBe('crowns');
  expect(await game.state<string[]>('(g) => g.players.map((p) => p.hat)')).toEqual(['crown', 'crown']);
  await game.seconds(3.5);
  expect((await finale(game)).phase).toBe('off');
  game.expectNoErrors();
});
