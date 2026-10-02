import { expect, test } from '@playwright/test';
import { Game } from './game';

// The giant xylophone: keys that play as you walk and jump on them, and a songbird that sings a
// tune for you to copy.

type Xylo = { phase: string; tune: number[]; progress: number; misses: number; length: number; copied: number; hint: number; struck: number[] };

test('walk along the keys, then copy the songbird’s tunes (it sings again when you slip up)', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const L = await page.evaluate(() => (window as any).__silly.layout.XYLOPHONE as { center: [number, number]; pitch: number });
  const keyX = (i: number) => L.center[0] + (i - 3.5) * L.pitch;
  const xylo = () => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__silly.runtime.debugInfo.xylophone)) as Xylo);
  const stickers = () => page.evaluate(() => (window as any).__silly.useStickers.getState().got as string[]);
  // drop onto a key from above (a jump onto it)
  const hit = async (i: number) => {
    await game.teleport(0, keyX(i), 1.6, L.center[1] + 0.5);
    await game.seconds(0.45);
  };
  const waitFor = async (phase: string, max = 12) => {
    for (let t = 0; t < max * 10 && (await xylo()).phase !== phase; t += 1) await game.seconds(0.1);
    expect((await xylo()).phase).toBe(phase);
  };

  // walk up onto the low end and along: every key in turn, low to high
  await game.hopTo(0, [keyX(0) - 6, L.center[1]], [keyX(0) - 2.5, L.center[1]]);
  const before = (await xylo()).struck.length;
  await game.hold('KeyD', 2.4);
  const walked = (await xylo()).struck.slice(before);
  expect(walked.slice(0, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);

  // the songbird has noticed: it sings a three-note tune, then listens
  await game.teleport(0, L.center[0], 1, L.center[1] + 4);
  await waitFor('listen');
  let s = await xylo();
  expect(s.tune).toHaveLength(3);
  expect(s.length).toBe(3);
  await game.screenshot('test-results/xylophone.png');
  // (and how it looks from the keys while it sings)
  await game.teleport(0, keyX(2), 1, L.center[1]);
  await game.seconds(9.5);
  await waitFor('sing');
  await game.seconds(0.8);
  await game.screenshot('test-results/xylophone-sing.png');
  await waitFor('listen');

  // copy it: a dance, a party, a sticker, and the next tune is a note longer
  for (const k of s.tune) await hit(k);
  s = await xylo();
  expect(s.phase).toBe('cheer');
  expect(s.copied).toBe(1);
  expect(s.length).toBe(4);
  expect(await stickers()).toContain('tune');
  await game.teleport(0, L.center[0], 1, L.center[1] + 4);
  await waitFor('listen');
  s = await xylo();
  expect(s.tune).toHaveLength(4);

  // a wrong key: "hm-mm?", and it sings it again
  const wrong = (s.tune[0] + 4) % 8;
  await hit(wrong);
  expect((await xylo()).phase).toBe('hmm');
  expect((await xylo()).misses).toBe(1);
  await game.teleport(0, L.center[0], 1, L.center[1] + 4);
  await waitFor('listen');
  // the first note right, then a wrong one: that's two tries, so now the next key glows
  await hit(s.tune[0]);
  expect((await xylo()).progress).toBe(1);
  await hit((s.tune[1] + 4) % 8);
  await game.teleport(0, L.center[0], 1, L.center[1] + 4);
  await waitFor('listen');
  s = await xylo();
  expect(s.misses).toBe(2);
  expect(s.hint).toBe(s.tune[0]);
  // the glow moves on to each next key as you go
  await hit(s.tune[0]);
  expect((await xylo()).hint).toBe(s.tune[1]);
  for (const k of s.tune.slice(1)) await hit(k);
  s = await xylo();
  expect(s.phase).toBe('cheer');
  expect(s.copied).toBe(2);
  expect(s.misses).toBe(2);
  game.expectNoErrors();
});
