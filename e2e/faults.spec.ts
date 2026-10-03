import { expect, test } from '@playwright/test';
import { Game } from './game';

// When something in the game throws (see faults.ts), only that part stops: the rest of the park
// keeps playing, and the error is reported once and kept in the play log.

test('one part of the park throwing every frame is switched off; everything else keeps playing', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  // break the kites: their per-frame code now throws every frame
  await page.evaluate(() => {
    const k = (window as any).__silly.runtime.debugInfo.kites;
    (window as any).__kiteList = k.list;
    k.list = null;
  });
  await page.evaluate(() => (window as any).__silly.playlog.tickPlayLog(0));
  const before = await game.player(0);
  await page.keyboard.down('KeyD');
  await game.seconds(1);
  await page.keyboard.up('KeyD');
  // the animal still runs, the clock still goes
  expect((await game.player(0)).x - before.x).toBeGreaterThan(1);
  const f = await page.evaluate(() => (window as any).__silly.faults);
  // reported twice: when it first threw, and when it was switched off (not every frame)
  expect(f.messages).toHaveLength(2);
  expect(f.messages[0]).toMatch(/^game frame: /);
  expect(f.messages[1]).toMatch(/switched off after 30 frames/);
  expect(f.count).toBe(30);
  // in the console once each, and in the play log
  expect(game.errors.filter((e) => e.includes('[silly park]'))).toHaveLength(2);
  await page.evaluate(() => (window as any).__silly.playlog.tickPlayLog(1000));
  const log = JSON.parse(await page.evaluate(() => (window as any).__silly.playlog.playLogFile()));
  expect(log.sessions[0].errors.some((e: string) => e.startsWith('game frame: '))).toBe(true);
  // nothing else went wrong
  expect(game.errors.filter((e) => !e.includes('[silly park]'))).toEqual([]);

  // mended while it rests: a few seconds later it runs again by itself (it sets kites.high each frame)
  await page.evaluate(() => {
    const k = (window as any).__silly.runtime.debugInfo.kites;
    k.list = (window as any).__kiteList;
    k.high = 99;
  });
  await game.seconds(1);
  expect(await page.evaluate(() => (window as any).__silly.runtime.debugInfo.kites.high)).toBe(99);
  await game.seconds(4.5);
  expect(await page.evaluate(() => (window as any).__silly.runtime.debugInfo.kites.high)).toBe(0);
  expect((await page.evaluate(() => (window as any).__silly.faults)).count).toBe(30);
});

test('a broken sticker album closes itself (the game isn\'t left paused behind it) and opens fine once mended', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await page.evaluate(() => {
    const s = (window as any).__silly;
    (window as any).__got = s.useStickers.getState().got;
    s.useStickers.setState({ got: null });
    s.useGame.getState().setAlbumOpen(true);
  });
  await game.seconds(0.5);
  const state = await page.evaluate(() => {
    const s = (window as any).__silly;
    return { open: s.useGame.getState().albumOpen, paused: s.clock.gameClock.paused, messages: s.faults.messages as string[] };
  });
  expect(state.open).toBe(false);
  expect(state.paused).toBe(false);
  expect(state.messages.some((m) => m.startsWith('sticker album was left out'))).toBe(true);
  // the park plays on
  const t0 = await page.evaluate(() => (window as any).__silly.clock.gameClock.time);
  await game.seconds(1);
  expect(await page.evaluate(() => (window as any).__silly.clock.gameClock.time)).toBeGreaterThan(t0 + 0.9);
  // mended, the album opens as usual
  await page.evaluate(() => {
    const s = (window as any).__silly;
    s.useStickers.setState({ got: (window as any).__got });
    s.useGame.getState().setAlbumOpen(true);
  });
  await game.seconds(0.5);
  expect(await page.evaluate(() => (window as any).__silly.useGame.getState().albumOpen)).toBe(true);
  await expect(page.getByLabel(/of \d+/).first()).toBeVisible();
});
