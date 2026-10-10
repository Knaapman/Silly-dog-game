import { expect, test } from '@playwright/test';
import { Game } from './game';

// The swings: walk into a seat and sit; push the stick and it swings higher and higher; jump and
// you fly off the way it's going. A friend's headbutt is a big push; a seat swinging hard bonks
// whoever stands in its way; playing alone, the buddy sits on the swing next to you and swings along.

type SeatState = { theta: number; omega: number; rider: number | null };
const swings = (game: Game) =>
  game.page.evaluate(() => {
    const s = (window as any).__silly.runtime.debugInfo.swings;
    return {
      seats: s.seats.map((x: SeatState) => ({ theta: x.theta, omega: x.omega, rider: x.rider })) as SeatState[],
      rides: s.rides as number,
      flights: s.flights as number,
      pushes: s.pushes as number,
      friendPushes: s.friendPushes as number,
      knocks: s.knocks as number,
      last: s.last as { amp: number; along: number } | null
    };
  });
const layout = (game: Game) => game.page.evaluate(() => (window as any).__silly.layout.SWINGS as { center: [number, number]; seats: number; spacing: number });
const seatX = (S: { center: [number, number]; seats: number; spacing: number }, i: number) => S.center[0] + (i - (S.seats - 1) / 2) * S.spacing;
const stickers = (game: Game) => game.page.evaluate(() => (window as any).__silly.useStickers.getState().got as string[]);
/** How high it swings (rad), from where it is and how fast it goes (as the game works it out). */
const amp = (s: SeatState) => {
  const k = 22 / 2.5;
  return Math.acos(Math.max(-1, 1 - (0.5 * s.omega * s.omega + k * (1 - Math.cos(s.theta))) / k));
};

test('sit on a swing, hold the stick and it swings higher and higher; jump at the top and fly off (a sticker)', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const S = await layout(game);
  const [, cz] = S.center;
  const x = seatX(S, 1);
  // step onto it (without touching the stick)
  await game.teleport(0, x, 0.1, cz + 0.5);
  await game.seconds(0.5);
  let s = await swings(game);
  expect(s.seats[1].rider).toBe(0);
  expect(s.rides).toBe(1);
  expect((await game.player()).launched).toBe(true);
  // sitting still: it hardly moves
  await game.seconds(1);
  expect(amp((await swings(game)).seats[1])).toBeLessThan(0.1);
  // hold the stick (any way): higher and higher
  await page.keyboard.down('KeyD');
  await game.seconds(3);
  const early = amp((await swings(game)).seats[1]);
  await game.seconds(3);
  s = await swings(game);
  const late = amp(s.seats[1]);
  expect(early).toBeGreaterThan(0.5);
  expect(late).toBeGreaterThan(early);
  expect(late).toBeGreaterThan(1.1);
  expect(late).toBeLessThan(1.32);
  // (the rider goes up and down with it)
  const ys: number[] = [];
  for (let i = 0; i < 25; i += 1) {
    await game.seconds(0.1);
    ys.push((await game.player()).y);
  }
  expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(1);
  await game.seconds(0.5, true);
  await game.screenshot('test-results/swings-high.png');
  await page.keyboard.up('KeyD');
  // wait until it's on its way up forwards, then jump
  for (let i = 0; i < 200; i += 1) {
    const t = (await swings(game)).seats[1];
    if (t.omega > 0 && t.theta > 0.25 && t.theta < 0.6) break;
    await game.seconds(1 / 60);
  }
  await game.tap('Space');
  s = await swings(game);
  expect(s.seats[1].rider).toBeNull();
  expect(s.flights).toBe(1);
  expect(s.last!.amp).toBeGreaterThan(1);
  expect(s.last!.along).toBeGreaterThan(6);
  await game.seconds(0.3, true);
  await game.screenshot('test-results/swings-fly.png');
  await game.seconds(2);
  const me = await game.player();
  expect(me.launched).toBe(false);
  expect(me.z - cz).toBeGreaterThan(5);
  expect(await stickers(game)).toContain('swing');
  game.expectNoErrors();
});

test('a friend headbutts the seat for a big push (a friend sticker); a seat swinging hard bonks whoever is in the way', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');
  const S = await layout(game);
  const [, cz] = S.center;
  const x = seatX(S, 2);
  await game.teleport(1, x + 6, 0.1, cz - 6);
  await game.teleport(0, x, 0.1, cz + 1.6);
  await game.seconds(0.4);
  await game.hold('KeyW', 0.7);
  expect((await swings(game)).seats[2].rider).toBe(0);
  await game.seconds(1);
  // the friend comes up behind, facing the seat, and headbutts it
  await game.hopTo(1, [x, cz - 4], [x, cz - 1.3]);
  await game.tap('ShiftRight');
  await game.seconds(0.1);
  let s = await swings(game);
  expect(s.pushes).toBe(1);
  expect(s.friendPushes).toBe(1);
  expect(s.seats[2].rider).toBe(0);
  expect(s.seats[2].omega).toBeGreaterThan(1);
  expect(amp(s.seats[2])).toBeGreaterThan(0.4);
  expect(await stickers(game)).toContain('swingpush');

  // swinging high, and the friend wanders into its way: boing
  await game.teleport(1, x + 6, 0.1, cz - 6);
  await page.keyboard.down('KeyA');
  await game.seconds(5);
  await page.keyboard.up('KeyA');
  expect(amp((await swings(game)).seats[2])).toBeGreaterThan(1);
  await game.teleport(1, x, 0.1, cz + 0.5);
  const before = await game.player(1);
  for (let i = 0; i < 30 && (await swings(game)).knocks === 0; i += 1) await game.seconds(0.1);
  s = await swings(game);
  expect(s.knocks).toBe(1);
  await game.seconds(0.5);
  const after = await game.player(1);
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(1);
  // (still swinging)
  expect(s.seats[2].rider).toBe(0);
  game.expectNoErrors();
});

test('playing alone: the buddy sits on the swing next to yours and swings along, and jumps off when you do', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const S = await layout(game);
  const [, cz] = S.center;
  const x = seatX(S, 3);
  await game.teleport(0, x, 0.1, cz + 1.6);
  await game.seconds(0.4);
  await page.evaluate(() => (window as any).__silly.useGame.getState().addBuddy());
  await game.seconds(1);
  await game.hold('KeyW', 0.7);
  expect((await swings(game)).seats[3].rider).toBe(0);
  // no stick: the child just sits there; the buddy comes and sits on the swing beside (the only one next to seat 3)
  let s = await swings(game);
  for (let k = 0; k < 24 && s.seats[2].rider == null; k += 1) {
    await game.seconds(0.5);
    s = await swings(game);
  }
  expect(s.seats[2].rider).toBe(1);
  // and swings: nicely high, though the child isn't swinging yet
  await game.seconds(6);
  s = await swings(game);
  expect(amp(s.seats[2])).toBeGreaterThan(0.4);
  expect(s.seats[3].rider).toBe(0);
  // (it got there without being bonked by a seat)
  expect(s.knocks).toBe(0);
  await game.seconds(0.2, true);
  await game.screenshot('test-results/swings-buddy.png');
  // the child jumps off: a moment later, so does the buddy
  await game.tap('Space');
  await game.seconds(0.1);
  expect((await swings(game)).seats[3].rider).toBeNull();
  await game.seconds(1);
  expect((await swings(game)).seats[2].rider).toBeNull();
  game.expectNoErrors();
});

test('changed my mind: a jump off a swing that is hardly moving lands clear of it, and standing there you stay off', async ({ page }) => {
  const game = new Game(page);
  await game.open(1, { off: ['cats', 'birds', 'chickens'] });
  await game.start();
  const S = await layout(game);
  const [, cz] = S.center;
  const x = seatX(S, 2);
  await game.teleport(0, x, 0.1, cz + 0.5);
  await game.seconds(0.5);
  expect((await swings(game)).seats[2].rider).toBe(0);
  await game.seconds(0.5);
  // jump, and then do nothing at all
  await game.tap('Space');
  await game.seconds(4);
  const s = await swings(game);
  expect(s.seats[2].rider).toBeNull();
  expect(s.flights).toBe(1);
  const me = await game.player();
  expect(me.launched).toBe(false);
  expect(Math.hypot(me.x - x, me.z - cz)).toBeGreaterThan(1.2);
  game.expectNoErrors();
});
