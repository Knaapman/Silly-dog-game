import { expect, test } from '@playwright/test';
import { Game } from './game';

// When something in the game throws (see faults.ts), only that part stops: the rest of the park
// keeps playing, and the error is reported once and kept in the play log.

test('one part of the park throwing every frame is switched off; everything else keeps playing', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  // break the kites: their per-frame code now throws every frame
  await page.evaluate(() => ((window as any).__silly.runtime.debugInfo.kites.list = null));
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
});
