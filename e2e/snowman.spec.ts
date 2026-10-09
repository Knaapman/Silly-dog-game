import { expect, test } from '@playwright/test';
import { Game } from './game';

// Build a snowman: snowballs grow as they roll through the snow; a big one rolled into the
// ring is the bottom, two more rolled against it hop up on top, and the last one gets a face.

test('build a snowman from three rolled snowballs, knock it down, build another', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const [BX, BZ] = await page.evaluate(() => (window as any).__silly.layout.SNOWMAN_BUILD.center as [number, number]);
  const ball = (i: number, call: string, ...args: number[]) =>
    page.evaluate(([i, call, args]) => (window as any).__silly.runtime.debugInfo.snowballs[i][call](...args), [i, call, args] as const);
  const radius = (i: number) => ball(i, 'radius') as Promise<number>;
  const snowman = () =>
    page.evaluate(() => {
      const s = (window as any).__silly;
      const st = s.useSnowman.getState();
      return { pieces: st.pieces.map((p: any) => p.r) as number[], builtAt: st.builtAt as number, ...(s.runtime.debugInfo.snowman as { wobbles: number; knocks: number }) };
    });
  const stickers = () => page.evaluate(() => (window as any).__silly.useStickers.getState().got as string[]);
  // roll it through the snow, over and over, until it's this big
  const grow = async (i: number, r: number) => {
    // (westwards, away from the snowman, and it stops when it's big enough)
    for (let k = 0; k < 30 && (await radius(i)) < r; k += 1) {
      await ball(i, 'place', 15.5, -56.5);
      await game.seconds(0.1);
      for (let j = 0; j < 3; j += 1) {
        await ball(i, 'roll', -6, 0);
        await game.seconds(0.4);
      }
    }
    await ball(i, 'roll', 0, 0);
    expect(await radius(i)).toBeGreaterThanOrEqual(r);
  };
  // roll it at the snowman from the west
  const rollIn = async (i: number, from: number) => {
    await ball(i, 'place', BX - from, BZ);
    await game.seconds(0.1);
    await ball(i, 'roll', 4, 0);
    await game.seconds(1.2);
  };

  // a small snowball in the ring: not big enough for the bottom
  expect(await radius(0)).toBeLessThan(0.5);
  await ball(0, 'place', BX, BZ);
  await game.seconds(0.5);
  expect((await snowman()).pieces).toEqual([]);

  // a big one: the bottom (and the snowball pops back up at home, small again)
  await grow(0, 0.95);
  await rollIn(0, 3);
  let st = await snowman();
  expect(st.pieces).toHaveLength(1);
  expect(st.pieces[0]).toBeGreaterThan(0.9);
  expect(await radius(0)).toBeLessThan(0.5);

  // a headbutt now only makes it wobble
  await game.hopTo(0, [BX - 5, BZ], [BX - st.pieces[0] - 1.1, BZ]);
  await game.tap('KeyE');
  await game.seconds(0.5);
  st = await snowman();
  expect(st.wobbles).toBe(1);
  expect(st.pieces).toHaveLength(1);
  await game.teleport(0, BX - 6, 1, BZ + 4);

  // the middle and the head, rolled against it: they hop up on top
  await grow(1, 0.75);
  await rollIn(1, 3.2);
  expect((await snowman()).pieces).toHaveLength(2);
  expect(await stickers()).not.toContain('snowman');
  // the head: dragged over on a tongue (it lets go as the snowball hops up)
  await grow(2, 0.55);
  await game.hopTo(0, [BX - 9, BZ], [BX - 6, BZ]);
  await ball(2, 'place', BX - 4.6, BZ);
  await game.seconds(0.3);
  await game.tap('KeyQ');
  const held = () => page.evaluate(() => [...(window as any).__silly.runtime.props.values()].some((p: any) => p.kind === 'snowball' && p.heldBy != null));
  expect(await held()).toBe(true);
  expect((await snowman()).pieces).toHaveLength(2);
  await game.hold('KeyD', 2);
  await game.seconds(1);
  expect(await held()).toBe(false);
  st = await snowman();
  expect(st.pieces).toHaveLength(3);
  // each piece smaller than the one below
  expect(st.pieces[1]).toBeLessThan(st.pieces[0]);
  expect(st.pieces[2]).toBeLessThan(st.pieces[1]);
  expect(st.builtAt).toBeGreaterThan(0);
  expect(await stickers()).toContain('snowman');
  await game.teleport(0, BX - 4, 1, BZ + 3);
  await game.seconds(1);
  await game.screenshot('test-results/snowman.png');

  // finished: one headbutt and down it goes, ready to build again
  await game.hopTo(0, [BX - 5, BZ], [BX - st.pieces[0] - 1.1, BZ]);
  await game.tap('KeyE');
  await game.seconds(0.3);
  st = await snowman();
  expect(st.knocks).toBe(1);
  expect(st.pieces).toEqual([]);
  expect(st.builtAt).toBe(-1);
  await game.screenshot('test-results/snowman-knocked.png');
  await game.teleport(0, BX - 6, 1, BZ + 4);
  await game.seconds(7);
  await grow(0, 0.95);
  await rollIn(0, 3);
  expect((await snowman()).pieces).toHaveLength(1);
  game.expectNoErrors();
});

test('playing alone, the buddy rolls the middle for your snowman (and leaves the head for you)', async ({ page }) => {
  test.setTimeout(150_000);
  const game = new Game(page);
  await game.open(1, { off: ['cats', 'birds'] });
  await game.start();
  await page.evaluate(() => (window as any).__silly.useGame.getState().addBuddy());
  const [BX, BZ] = await page.evaluate(() => (window as any).__silly.layout.SNOWMAN_BUILD.center as [number, number]);
  const ball = (i: number, call: string, ...args: number[]) =>
    page.evaluate(([i, call, args]) => (window as any).__silly.runtime.debugInfo.snowballs[i][call](...args), [i, call, args] as const);
  const pieces = () => page.evaluate(() => (window as any).__silly.useSnowman.getState().pieces.length as number);
  // the child puts the bottom in (rolled big off to the west, then into the ring)
  for (let k = 0; k < 30 && ((await ball(0, 'radius')) as number) < 0.95; k += 1) {
    await ball(0, 'place', 15.5, -56.5);
    await game.seconds(0.1);
    for (let j = 0; j < 3; j += 1) {
      await ball(0, 'roll', -6, 0);
      await game.seconds(0.4);
    }
  }
  await ball(0, 'place', BX - 3, BZ);
  await game.seconds(0.1);
  await ball(0, 'roll', 4, 0);
  await game.seconds(1.2);
  expect(await pieces()).toBe(1);
  // the child stands by and watches: the buddy fetches a snowball, rolls it big, brings it over.
  // (The other loose snowballs go off to one side: knocked rolling by a big carried one, a loose
  // snowball can end up on the snowman by accident, which isn't what this is about.)
  await ball(0, 'place', BX - 14, BZ - 6);
  await ball(1, 'place', BX - 14, BZ + 6);
  await game.teleport(0, BX - 3.5, 1, BZ + 2);
  await game.teleport(1, BX - 6, 1, BZ - 2);
  for (let k = 0; k < 60 && (await pieces()) < 2; k += 1) await game.seconds(1);
  expect(await pieces()).toBe(2);
  // but the head is the child's: it doesn't bring another
  await game.seconds(10);
  expect(await pieces()).toBe(2);
  expect(await page.evaluate(() => (window as any).__silly.useSnowman.getState().builtAt as number)).toBe(-1);
  game.expectNoErrors();
});
