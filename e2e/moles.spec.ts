import { expect, test } from '@playwright/test';
import { Game } from './game';

// Whack-a-mole: moles pop out of the molehills while a child is near. Bonk them (a headbutt, a jump
// on one's head, or just bump into one); after ten a golden one comes up and waits, and bonking
// that is a cheer and a sticker (a friend sticker when two children bonked). Playing alone, the
// buddy bonks some too, but leaves the golden one for the child.

type M = { state: string; h: number; golden: boolean; t: number };
type S = { list: M[]; count: number; bonks: number; stomps: number; touches: number; buddyBonks: number; rounds: number };
const moles = (game: Game) =>
  game.page.evaluate(() => {
    const s = (window as any).__silly.runtime.debugInfo.moles;
    return { list: s.list.map((m: M) => ({ state: m.state, h: m.h, golden: m.golden, t: m.t })), count: s.count, bonks: s.bonks, stomps: s.stomps, touches: s.touches, buddyBonks: s.buddyBonks, rounds: s.rounds } as S;
  });
const layout = (game: Game) => game.page.evaluate(() => (window as any).__silly.layout.MOLES as { center: [number, number]; holes: [number, number][] });
const stickers = (game: Game) => game.page.evaluate(() => (window as any).__silly.useStickers.getState().got as string[]);

/** Wait (up to `max` seconds) for a mole to be up, matching `pick`; its hole's index. */
async function waitForMole(game: Game, pick: (m: M, i: number) => boolean = () => true, max = 12) {
  for (let k = 0; k < max * 10; k += 1) {
    const s = await moles(game);
    // (a fresh one: not one about to pop back down; the golden one waits)
    const i = s.list.findIndex((m, j) => m.state === 'up' && m.h > 0.6 && (m.golden || m.t < 1.2) && pick(m, j));
    if (i >= 0) return i;
    await game.seconds(0.1);
  }
  throw new Error('no mole came up');
}

/** Bump into the mole in hole `i` (stand right where it is). */
async function bump(game: Game, holes: [number, number][], i: number, slot = 0) {
  await game.teleport(slot, holes[i][0], 0.5, holes[i][1]);
  await game.seconds(0.1);
}

test('moles pop up while you are near: headbutt one, jump on one, bump into the rest; ten brings the golden one, and bonking that is a party', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const { center, holes } = await layout(game);
  const [cx, cz] = center;
  // nobody near: no moles
  await game.seconds(2);
  expect((await moles(game)).list.every((m) => m.state === 'down')).toBe(true);

  // hop into the middle facing east, and headbutt the mole in the hole just east of us
  await game.hopTo(0, [cx - 3, cz], [cx, cz]);
  const east = holes.findIndex(([x, z]) => x > cx + 1 && Math.abs(z - cz) < 0.1);
  await waitForMole(game, (_, j) => j === east, 30);
  // (one may have popped up right where we landed, and been bumped already)
  const before = (await moles(game)).bonks;
  await game.tap('KeyE');
  await game.seconds(0.2);
  let s = await moles(game);
  expect(s.bonks).toBe(before + 1);
  expect(s.touches + s.stomps).toBe(before);
  expect(s.list[east].state).toBe('bonked');
  await game.seconds(0.6, true);
  await game.screenshot('test-results/moles.png');

  // drop onto one from above: a stomp, and a bounce off its head
  const stomps = s.stomps;
  let i = await waitForMole(game);
  await game.teleport(0, holes[i][0], 2.5, holes[i][1]);
  let top = -Infinity;
  for (let k = 0; k < 15; k += 1) {
    await game.seconds(0.1);
    if ((await moles(game)).stomps > stomps) top = Math.max(top, (await game.player()).y);
  }
  s = await moles(game);
  expect(s.stomps).toBe(stomps + 1);
  expect(top).toBeGreaterThan(1.2); // bounced back up

  // bump into the rest
  while ((await moles(game)).bonks < 10) {
    i = await waitForMole(game, (m) => !m.golden);
    await bump(game, holes, i);
  }
  s = await moles(game);
  expect(s.count).toBe(10);
  expect(s.rounds).toBe(0);
  expect(s.touches + s.stomps).toBe(9); // and one headbutt

  // the golden one comes up, and waits for us
  i = await waitForMole(game, (m) => m.golden);
  await game.teleport(0, cx + 4, 0.5, cz);
  await game.seconds(4);
  s = await moles(game);
  expect(s.list[i].state).toBe('up');
  expect(s.list[i].golden).toBe(true);
  await game.seconds(0.1, true);
  await game.screenshot('test-results/moles-golden.png');
  await bump(game, holes, i);
  s = await moles(game);
  expect(s.rounds).toBe(1);
  expect(s.count).toBe(0);
  expect(await stickers(game)).toContain('moles');
  expect(await stickers(game)).not.toContain('molefriends');

  // everyone gone: they all pop down and stay down
  await game.teleport(0, cx + 20, 0.5, cz + 4);
  await game.seconds(1.5);
  s = await moles(game);
  expect(s.list.every((m) => m.state === 'down')).toBe(true);
  await game.seconds(3);
  expect((await moles(game)).list.every((m) => m.state === 'down')).toBe(true);
  game.expectNoErrors();
});

test('two friends bonking moles together earn the friend sticker', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');
  const { center, holes } = await layout(game);
  const [cx, cz] = center;
  await game.teleport(0, cx + 4, 0.5, cz);
  await game.teleport(1, cx - 4, 0.5, cz);
  await game.seconds(0.5);
  for (let n = 0; (await moles(game)).rounds === 0 && n < 30; n += 1) {
    const slot = n % 2;
    const i = await waitForMole(game);
    await bump(game, holes, i, slot);
    // step back out of the way
    await game.teleport(slot, cx + (slot ? -4 : 4), 0.5, cz);
    await game.seconds(0.1);
  }
  expect((await moles(game)).rounds).toBe(1);
  expect(await stickers(game)).toContain('molefriends');
  game.expectNoErrors();
});

test('playing alone, the buddy bonks moles too, but leaves the golden one for you', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const { center, holes } = await layout(game);
  const [cx, cz] = center;
  await game.teleport(0, cx + 4, 0.5, cz);
  await page.evaluate(() => (window as any).__silly.useGame.getState().addBuddy());
  await game.seconds(2);
  for (let k = 0; k < 20 && (await moles(game)).buddyBonks < 3; k += 1) await game.seconds(1);
  let s = await moles(game);
  expect(s.buddyBonks).toBeGreaterThanOrEqual(3);
  // (the child bonked none: the buddy did it all)
  expect(s.bonks).toBe(s.buddyBonks);

  // the golden one: the buddy leaves it alone
  await page.evaluate((n) => ((window as any).__silly.runtime.debugInfo.moles.count = n), 10);
  const i = await waitForMole(game, (m) => m.golden);
  await game.seconds(6);
  s = await moles(game);
  expect(s.list[i].golden).toBe(true);
  expect(s.list[i].state).toBe('up');
  expect(s.rounds).toBe(0);
  await bump(game, holes, i);
  expect((await moles(game)).rounds).toBe(1);
  game.expectNoErrors();
});
