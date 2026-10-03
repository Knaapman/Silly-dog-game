import { expect, test } from '@playwright/test';
import { Game } from './game';

// The hot air balloon: climb in (friends too), up it goes, round a big loop high over the park,
// and back down, where everyone steps out. Jump to climb out on the way; an empty balloon comes
// home by itself. Playing alone, the buddy hops in too.

const balloon = (game: Game) =>
  game.page.evaluate(() => {
    const b = (window as any).__silly.runtime.debugInfo.balloon;
    return { mode: b.mode as string, riders: [...b.riders] as (number | null)[], y: b.pos.y as number, x: b.pos.x as number, z: b.pos.z as number, flights: b.flights as number, together: b.together as number, jumps: b.jumps as number };
  });
const pad = (game: Game) => game.page.evaluate(() => (window as any).__silly.layout.BALLOON as { pad: [number, number]; height: number });
const stickers = (game: Game) => game.page.evaluate(() => (window as any).__silly.useStickers.getState().got as string[]);
const ground = (game: Game, x: number, z: number) => game.page.evaluate(([x, z]) => (window as any).__silly.terrain.groundHeight(x, z) as number, [x, z] as const);

/** Run the game until the balloon is in this mode (or give up after `max` seconds). */
async function until(game: Game, mode: string, max: number) {
  for (let t = 0; t < max; t += 0.5) {
    if ((await balloon(game)).mode === mode) return true;
    await game.seconds(0.5);
  }
  return (await balloon(game)).mode === mode;
}

test('climb in with a friend: up it goes, round over the park, back down, and out you step (two stickers)', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');
  const B = await pad(game);
  const [px, pz] = B.pad;
  // walk in from the south, one after the other
  await game.teleport(0, px, 0.1, pz + 2.2);
  await game.teleport(1, px + 3, 0.1, pz + 2.2);
  await game.seconds(0.4);
  await game.hold('KeyW', 0.8);
  let b = await balloon(game);
  expect(b.riders).toContain(0);
  expect(b.mode).toBe('boarding');
  await game.teleport(1, px + 0.4, 0.1, pz + 0.4);
  await game.seconds(0.3);
  b = await balloon(game);
  expect(b.riders).toContain(1);
  // up!
  expect(await until(game, 'rise', 4)).toBe(true);
  expect(await until(game, 'fly', 9)).toBe(true);
  b = await balloon(game);
  expect(b.y).toBeGreaterThan(B.height - 0.5);
  const me = await game.player(0);
  expect(me.y - (await ground(game, me.x, me.z))).toBeGreaterThan(12);
  expect(me.launched).toBe(true);
  const got = await stickers(game);
  expect(got).toContain('hotair');
  expect(got).toContain('hotairfriends');
  // floating off round its loop, the riders with it
  await game.seconds(12);
  b = await balloon(game);
  expect(Math.hypot(b.x - px, b.z - pz)).toBeGreaterThan(20);
  const there = await game.player(1);
  expect(Math.hypot(there.x - b.x, there.z - b.z)).toBeLessThan(1);
  await game.seconds(0.2, true);
  await game.screenshot('test-results/balloon-flying.png');
  // all the way round and down again: everybody steps out
  expect(await until(game, 'rest', 60)).toBe(true);
  b = await balloon(game);
  expect(b.riders.every((r) => r == null)).toBe(true);
  await game.seconds(2);
  for (const slot of [0, 1]) {
    const p = await game.player(slot);
    expect(p.launched).toBe(false);
    expect(Math.hypot(p.x - px, p.z - pz)).toBeLessThan(5);
    expect(p.y - (await ground(game, p.x, p.z))).toBeLessThan(1.2);
  }
  // and it's ready to go again
  expect(await until(game, 'wait', 4)).toBe(true);
  game.expectNoErrors();
});

test('jump out on the way: down you drop; playing alone, the buddy rode along and jumps out after you', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const B = await pad(game);
  const [px, pz] = B.pad;
  await game.teleport(0, px + 2, 0.1, pz + 6);
  await page.evaluate(() => (window as any).__silly.useGame.getState().addBuddy());
  await game.seconds(1.5);
  const bot = await page.evaluate(() => [...(window as any).__silly.runtime.players.values()].find((p: any) => p.bot).slot as number);
  await game.teleport(0, px, 0.1, pz + 0.3);
  // the buddy boings over and climbs in too
  for (let i = 0; i < 12 && !(await balloon(game)).riders.includes(bot); i += 1) await game.seconds(0.25);
  let b = await balloon(game);
  expect(b.riders).toContain(0);
  expect(b.riders).toContain(bot);
  expect(await until(game, 'fly', 14)).toBe(true);
  await game.seconds(4);
  // jump!
  await game.tap('Space');
  await game.seconds(0.1);
  b = await balloon(game);
  expect(b.riders).not.toContain(0);
  expect(b.riders).not.toContain(bot);
  expect(b.jumps).toBe(2);
  // down we come (from way up high), and land
  for (let i = 0; i < 40 && (await game.player(0)).launched; i += 1) await game.seconds(0.25);
  await game.seconds(1);
  const me = await game.player(0);
  expect(me.launched).toBe(false);
  expect(me.y - (await ground(game, me.x, me.z))).toBeLessThan(1.5);
  // the empty balloon flies on round its loop and comes home by itself
  expect(await until(game, 'rest', 70)).toBe(true);
  b = await balloon(game);
  expect(Math.hypot(b.x - px, b.z - pz)).toBeLessThan(0.1);
  expect(b.flights).toBe(1);
  game.expectNoErrors();
});
