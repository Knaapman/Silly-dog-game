import { expect, test } from '@playwright/test';
import { Game } from './game';

// The giant carrot at the farm: grab the leaves with your tongue, push the stick away from it
// to pull; friends (or the buddy) make it come up much quicker; out it pops.

type Carrot = { phase: string; progress: number; pulling: number; pops: number; bites: number; pullers: [number, { spot: number; pulling: boolean }][] };
const carrot = (game: Game) =>
  game.page.evaluate(() => {
    const c = (window as any).__silly.runtime.debugInfo.carrot;
    return { phase: c.phase, progress: c.progress, pulling: c.pulling, pops: c.pops, bites: c.bites, pullers: [...c.pullers.entries()] } as Carrot;
  });
const at = (game: Game) => game.page.evaluate(() => (window as any).__silly.layout.GIANT_CARROT.at as [number, number]);
const stickers = (game: Game) => game.page.evaluate(() => (window as any).__silly.useStickers.getState().got as string[]);

test('pull the giant carrot out on your own: slow, but out it pops (then eat it, and it grows again)', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const [cx, cz] = await at(game);

  // up to it from the south, and lick the leaves: hanging on (no pulling yet, so nothing happens)
  await game.hopTo(0, [cx, cz + 7], [cx, cz + 3.2]);
  await game.tap('KeyQ');
  let c = await carrot(game);
  expect(c.pullers.map(([slot]) => slot)).toEqual([0]);
  await game.seconds(1);
  expect((await carrot(game)).progress).toBe(0);
  // the animal stays put while it hangs on (walking towards the carrot doesn't move it)
  const p0 = await game.player();
  await game.hold('KeyW', 0.5);
  expect(Math.abs((await game.player()).z - p0.z)).toBeLessThan(0.2);

  // pull (stick away from the carrot): it comes up, bit by bit
  await game.page.keyboard.down('KeyS');
  await game.seconds(4);
  c = await carrot(game);
  expect(c.pulling).toBe(1);
  expect(c.progress).toBeGreaterThan(0.25);
  expect(c.progress).toBeLessThan(0.45);
  await game.screenshot('test-results/carrot-pull.png');
  // ...let go of the stick and it sinks back a little; pull again and it pops
  await game.page.keyboard.up('KeyS');
  await game.seconds(1);
  expect((await carrot(game)).progress).toBeLessThan(c.progress);
  await game.page.keyboard.down('KeyS');
  for (let t = 0; t < 120 && (await carrot(game)).phase === 'stuck'; t += 1) await game.seconds(0.1);
  await game.page.keyboard.up('KeyS');
  c = await carrot(game);
  expect(c.phase).toBe('popped');
  expect(c.pops).toBe(1);
  expect(c.pullers).toEqual([]);
  expect(await stickers(game)).toContain('carrot');
  expect(await stickers(game)).not.toContain('carrotfriends');
  // ...and over you go, backwards
  await game.seconds(0.5);
  const flung = await game.player();
  expect(flung.z).toBeGreaterThan(cz + 3.2);
  await game.seconds(2);
  await game.screenshot('test-results/carrot-popped.png');

  // eat it: four big bites, and it's gone (it rolls a little as you bump into it, so aim each time)
  const food = () =>
    page.evaluate(() => {
      const s = (window as any).__silly;
      const f = [...s.runtime.foods.values()].find((f: any) => f.radius === 1.3);
      return f ? { x: f.position.x as number, z: f.position.z as number } : null;
    });
  let licks = 0;
  for (let f = await food(); f && licks < 10; f = await food(), licks += 1) {
    await game.hopTo(0, [f.x, f.z + 4.5], [f.x, f.z + 2.3]);
    await game.tap('KeyQ');
    await game.seconds(0.3);
  }
  c = await carrot(game);
  expect(c.bites).toBe(0);
  expect(c.phase).toBe('regrow');
  expect((await game.player()).belly).toBeGreaterThanOrEqual(4);
  // a new one grows in the mound
  await game.seconds(4.5);
  expect((await carrot(game)).phase).toBe('stuck');
  game.expectNoErrors();
});

test('with friends it comes out quickly, and the buddy hops over to help a child on their own', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');
  const [cx, cz] = await at(game);

  // two children, from opposite sides (south and north), pulling together (player two comes over
  // first: the leash keeps friends from getting too far apart)
  await game.teleport(1, cx, 1, cz - 6);
  await game.hopTo(0, [cx, cz + 7], [cx, cz + 3.2]);
  await game.hopTo(1, [cx, cz - 5.5], [cx, cz - 3.2]);
  await game.tap('KeyQ');
  await game.tap('ControlRight');
  expect((await carrot(game)).pullers).toHaveLength(2);
  await game.page.keyboard.down('KeyS');
  await game.page.keyboard.down('ArrowUp');
  let t = 0;
  for (; t < 100 && (await carrot(game)).phase === 'stuck'; t += 1) await game.seconds(0.1);
  await game.page.keyboard.up('KeyS');
  await game.page.keyboard.up('ArrowUp');
  // (alone it takes over twelve seconds)
  expect(t / 10).toBeLessThan(5);
  expect((await carrot(game)).phase).toBe('popped');
  expect(await stickers(game)).toContain('carrotfriends');

  // player two goes home; the buddy arrives, and helps when the child pulls
  await page.evaluate(() => (window as any).__silly.useGame.getState().leave(1));
  await page.evaluate(() => (window as any).__silly.useGame.getState().addBuddy());
  await game.seconds(1);
  await page.evaluate(() => {
    // (eat the carrot up quickly so a new one grows)
    const s = (window as any).__silly;
    const f = [...s.runtime.foods.values()].find((f: any) => f.radius === 1.3);
    for (let i = 0; i < 4; i += 1) f.eat(0);
  });
  await game.seconds(5);
  expect((await carrot(game)).phase).toBe('stuck');
  const buddySlot = await page.evaluate(() => (window as any).__silly.useGame.getState().players.find((p: any) => p.bot).slot as number);
  await game.teleport(buddySlot, cx + 3, 1, cz + 9);
  await game.hopTo(0, [cx, cz + 7], [cx, cz + 3.2]);
  await game.tap('KeyQ');
  await game.seconds(3);
  let c = await carrot(game);
  expect(c.pullers.map(([slot]) => slot).sort()).toEqual([0, buddySlot].sort());
  await game.page.keyboard.down('KeyS');
  for (t = 0; t < 100 && (await carrot(game)).phase === 'stuck'; t += 1) await game.seconds(0.1);
  await game.page.keyboard.up('KeyS');
  expect(t / 10).toBeLessThan(5);
  c = await carrot(game);
  expect(c.phase).toBe('popped');
  expect(c.pops).toBe(2);
  game.expectNoErrors();
});
