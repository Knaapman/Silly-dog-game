import { expect, test } from '@playwright/test';
import { Game } from './game';

// The bubble machine: big bubbles swallow you and float you off over the park (jump to pop it,
// or a friend can); little ones pop when you touch them; the machine keeps blowing more.

type B = { alive: boolean; x: number; y: number; z: number; r: number; rider: number | null };
const state = (game: Game) =>
  game.page.evaluate(() => {
    const s = (window as any).__silly.runtime.debugInfo.bubbles.state;
    return { rides: s.rides as number, pops: s.pops as number, list: s.list.map((b: B) => ({ alive: b.alive, x: b.x, y: b.y, z: b.z, r: b.r, rider: b.rider })) as B[] };
  });
/** Machine off, every bubble popped: the test knows every bubble there is. */
const quiet = (game: Game) =>
  game.page.evaluate(() => {
    const b = (window as any).__silly.runtime.debugInfo.bubbles;
    b.setAuto(false);
    b.popAll();
  });
const blow = (game: Game, r: number, x: number, z: number) =>
  game.page.evaluate(([r, x, z]) => {
    const s = (window as any).__silly;
    return s.runtime.debugInfo.bubbles.blow(r, x, z, s.terrain.groundHeight(x, z) + Math.max(r + 0.25, 1.3)) as boolean;
  }, [r, x, z] as const);
const ground = (game: Game, x: number, z: number) => game.page.evaluate(([x, z]) => (window as any).__silly.terrain.groundHeight(x, z) as number, [x, z] as const);

test('walk into a big bubble: off you float, up over the park; jump and it pops, and down you plop', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await quiet(game);
  await game.teleport(0, 4, 1, 23);
  await game.seconds(0.5);
  expect(await blow(game, 1.15, 4, 20)).toBe(true);
  // walk north into it
  await game.hold('KeyW', 1.2);
  let s = await state(game);
  const mine = s.list.find((b) => b.alive && b.rider === 0);
  expect(mine).toBeDefined();
  expect(s.rides).toBe(1);
  expect(await page.evaluate(() => (window as any).__silly.useStickers.getState().got)).toContain('bubble');
  // up it goes, with us in it
  await game.seconds(3, true);
  await game.screenshot('test-results/bubble-ride.png');
  const up = await game.player();
  expect(up.y - (await ground(game, up.x, up.z))).toBeGreaterThan(3);
  // drift about with the stick
  await game.hold('KeyD', 1.5);
  expect((await game.player()).x).toBeGreaterThan(up.x + 1);
  // jump: pop! and down
  await game.tap('Space');
  await game.seconds(0.2);
  s = await state(game);
  expect(s.list.some((b) => b.alive)).toBe(false);
  expect(s.pops).toBeGreaterThanOrEqual(1);
  await game.seconds(2);
  const down = await game.player();
  expect(down.y - (await ground(game, down.x, down.z))).toBeLessThan(1.2);
  expect(down.launched).toBe(false);
  game.expectNoErrors();
});

test('a friend can pop your bubble; a little bubble pops when you jump at it; a ride ends by itself', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');
  await quiet(game);
  await game.teleport(0, 4, 1, 23);
  await game.teleport(1, 9, 1, 23);
  await game.seconds(0.5);
  await blow(game, 1.15, 4, 21.5);
  await game.hold('KeyW', 0.8);
  expect((await state(game)).list.find((b) => b.alive)?.rider).toBe(0);
  // the friend bumps into it (straight away, while it's still low): pop, and down comes player one
  const b = (await state(game)).list.find((x) => x.alive)!;
  await game.teleport(1, b.x + 0.4, b.y - (await ground(game, b.x, b.z)) - 0.3, b.z);
  await game.seconds(0.3);
  expect((await state(game)).list.some((x) => x.alive)).toBe(false);
  await game.seconds(2);
  expect((await game.player(0)).launched).toBe(false);
  // (and off out of the way, so the next bubbles are ours alone)
  await game.teleport(1, 14, 1, 26);

  // a little one, just over our heads: jump at it and it pops (no ride)
  await game.teleport(0, 4, 1, 23);
  await game.seconds(1.5);
  await blow(game, 0.5, 4, 23);
  await game.tap('Space');
  await game.seconds(0.8);
  let s = await state(game);
  expect(s.list.some((x) => x.alive)).toBe(false);
  expect(s.rides).toBe(1);

  // a ride that nobody ends: it pops by itself after a while
  await game.teleport(0, 4, 1, 23);
  await game.seconds(1.5);
  await blow(game, 1.15, 4, 21);
  await game.hold('KeyW', 1);
  expect((await state(game)).list.find((x) => x.alive)?.rider).toBe(0);
  await game.seconds(8);
  s = await state(game);
  expect(s.list.some((x) => x.alive)).toBe(false);
  game.expectNoErrors();
});

test('the machine keeps blowing bubbles, off towards the plaza', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const M = await page.evaluate(() => (window as any).__silly.layout.BUBBLE_MACHINE);
  await game.seconds(7, true);
  const s = await state(game);
  const alive = s.list.filter((b) => b.alive);
  expect(alive.length).toBeGreaterThanOrEqual(3);
  // drifting off from the wand, the way it points (north-west)
  const far = alive.filter((b) => Math.hypot(b.x - M.at[0], b.z - M.at[1]) > 2.5);
  expect(far.length).toBeGreaterThanOrEqual(2);
  for (const b of far) expect(b.z).toBeLessThan(M.at[1]);
  await game.teleport(0, M.at[0] - 4, 1, M.at[1] - 2);
  await game.seconds(0.5, true);
  await game.screenshot('test-results/bubble-machine.png');
  game.expectNoErrors();
});
