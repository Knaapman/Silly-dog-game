import { expect, test } from '@playwright/test';
import { Game } from './game';

const roster = (game: Game) => game.state<{ slot: number; bot: boolean }[]>('(g) => g.players.map((p) => ({ slot: p.slot, bot: !!p.bot }))');
const stickers = (game: Game) => game.page.evaluate(() => [...(window as any).__silly.useStickers.getState().got] as string[]);
const rt = (game: Game, slot: number) =>
  game.page.evaluate((s) => {
    const p = (window as any).__silly.runtime.players.get(s);
    return { x: p.position.x, y: p.position.y, z: p.position.z, jumpedAt: p.jumpedAt, ridingOn: p.ridingOn, grabbedBy: p.grabbedBy, launched: p.isLaunched() };
  }, slot);

test('a buddy keeps a child playing alone company', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await page.evaluate(() => ((window as any).__silly.buddyControl.auto = true));

  // after a few seconds alone, a buddy arrives
  await game.seconds(5);
  const list = await roster(game);
  expect(list.length).toBe(2);
  const buddy = list.find((p) => p.bot)!.slot;

  // it follows the child
  await game.teleport(0, 12, 1, -4);
  await game.seconds(4);
  let b = await rt(game, buddy);
  expect(Math.hypot(b.x - 12, b.z + 4)).toBeLessThan(6);

  // it copies a jump
  await game.teleport(buddy, 16, 1, -4);
  await game.seconds(0.5);
  const before = (await rt(game, buddy)).jumpedAt;
  await game.tap('Space');
  await game.seconds(0.6);
  expect((await rt(game, buddy)).jumpedAt).not.toBe(before);

  // ride it, and steer it with the stick
  await game.seconds(1.5);
  b = await rt(game, buddy);
  await game.teleport(0, b.x, b.y + 1.6, b.z);
  await game.seconds(1);
  expect((await rt(game, 0)).ridingOn).toBe(buddy);
  expect(await stickers(game)).toContain('ride');
  const b0 = await rt(game, buddy);
  await game.hold('KeyD', 1);
  const b1 = await rt(game, buddy);
  expect(b1.x - b0.x).toBeGreaterThan(3);
  expect((await rt(game, 0)).ridingOn).toBe(buddy);
  await game.tap('Space');
  await game.seconds(1.5);

  // lick it and throw it
  await game.teleport(buddy, 10.6, 1, -3);
  await game.hopTo(0, [7, -3], [9, -3]);
  await game.teleport(buddy, 10.6, 1, -3);
  await game.seconds(0.1);
  await game.tap('KeyQ');
  expect((await rt(game, buddy)).grabbedBy).toBe(0);
  await game.tap('KeyQ');
  expect((await rt(game, buddy)).launched).toBe(true);
  expect(await stickers(game)).toContain('throw');
  await game.seconds(3);

  // near a see-saw it waits on the far end, and gets flung when the child lands on the near end
  await game.teleport(0, 47.5, 1, 48);
  await game.teleport(buddy, 51, 1, 52);
  await game.seconds(7);
  b = await rt(game, buddy);
  // (on the far end, which it has pushed down)
  expect(Math.hypot(b.x - 55.3, b.z - 48)).toBeLessThan(1);
  expect(await page.evaluate(() => (window as any).__silly.runtime.seesawLow[0])).toBe(1);
  await game.teleport(0, 50.8, 7, 48.3); // drop onto the raised near end
  let top = 0;
  for (let i = 0; i < 30; i += 1) {
    await game.seconds(0.1);
    top = Math.max(top, (await rt(game, buddy)).y);
  }
  expect(top).toBeGreaterThan(4);
  expect(await stickers(game)).toContain('seesaw');
  await game.screenshot('test-results/buddy.png');

  // a real friend joins: the buddy makes room
  await game.join('kb2');
  const after = await roster(game);
  expect(after.some((p) => p.bot)).toBe(false);
  expect(after.length).toBe(2);
  game.expectNoErrors();
});

test('the buddy follows the child up high: the same way, or with a big boing', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await page.evaluate(() => ((window as any).__silly.buddyControl.auto = true));
  await game.seconds(5);
  const buddy = (await roster(game)).find((p) => p.bot)!.slot;

  // the child rides a geyser onto the top of the fountain...
  await game.teleport(0, 2.5, 1, 5);
  await game.teleport(buddy, 9, 1, 12);
  let kidUp = false;
  for (let i = 0; i < 80 && !kidUp; i += 1) {
    await game.seconds(0.1);
    const k = await rt(game, 0);
    kidUp = !k.launched && k.y > 3.5 && Math.hypot(k.x + 6, k.z + 2) < 1.5;
  }
  expect(kidUp).toBe(true);
  // ...and the buddy goes to the same geyser and flies up after it (not a boing, not a pop)
  const spot = () => page.evaluate((s) => (window as any).__silly.runtime.launchSpots.get(s) ?? null, buddy);
  for (let i = 0; i < 150 && !(await spot()); i += 1) await game.seconds(0.1);
  expect(await spot()).toMatchObject({ x: 2.5, z: 5 });
  await game.seconds(3);
  let b = await rt(game, buddy);
  expect(b.y).toBeGreaterThan(3.5);
  expect(Math.hypot(b.x + 6, b.z + 2)).toBeLessThan(2.5);

  // somewhere with no way up (the top of the lighthouse): a big boing up next to the child
  await game.teleport(0, -4, 10.8, 48.6);
  await game.teleport(buddy, -4, 1, 28.5);
  await game.seconds(8);
  const k = await rt(game, 0);
  b = await rt(game, buddy);
  expect(k.y).toBeGreaterThan(8.5);
  expect(b.y).toBeGreaterThan(8.5);
  expect(Math.hypot(b.x - k.x, b.z - k.z)).toBeLessThan(3);
  await game.screenshot('test-results/buddy-up-high.png');

  // back down on the grass, a buddy riding on the child's back still hops off after a while
  await game.teleport(0, 12, 1, -4);
  // (it comes down too: wait till it's on the ground again)
  for (let i = 0; i < 20; i += 1) {
    await game.seconds(0.5);
    b = await rt(game, buddy);
    if (!b.launched && b.y < 1.5 && b.ridingOn == null) break;
  }
  expect(b.y).toBeLessThan(1.5);
  await game.seconds(1);
  const kid = await rt(game, 0);
  await game.teleport(buddy, kid.x, kid.y + 1.6, kid.z);
  await game.seconds(1);
  expect((await rt(game, buddy)).ridingOn).toBe(0);
  await game.seconds(7);
  b = await rt(game, buddy);
  expect(b.ridingOn).toBeNull();
  // (and is back on the grass: give a silly hop it might be in the middle of time to come down)
  for (let i = 0; i < 12 && (b.launched || b.y >= 1.5); i += 1) {
    await game.seconds(0.25);
    b = await rt(game, buddy);
  }
  expect(b.y).toBeLessThan(1.5);
  game.expectNoErrors();
});

test('the buddy never heads for a spot inside a wall: out of the tunnel to the child, without getting stuck', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await page.evaluate(() => ((window as any).__silly.buddyControl.auto = true));
  await game.seconds(5);
  const buddy = (await roster(game)).find((p) => p.bot)!.slot;
  // the child stands just past the east end of the mesa, by the wall beside the tunnel; the buddy
  // is in the tunnel mouth. (Its "trot beside the child" spot used to land inside that wall, and
  // it pushed against the wall till it was popped out.)
  const M = await page.evaluate(() => (window as any).__silly.layout.MESA);
  const east = M.center[0] + M.halfLength;
  const kid = { x: east + 0.5, z: M.center[1] - 3.8 };
  const inTunnel = (x: number, z: number) => x < east && Math.abs(z - M.center[1]) < M.opening / 2;
  const unstuck0 = await page.evaluate(() => (window as any).__silly.runtime.debugInfo.unstuck.where.length);
  for (let round = 0; round < 6; round += 1) {
    await game.teleport(0, kid.x, 0.5, kid.z);
    await game.teleport(buddy, east - 1.5, 0.5, M.center[1] - 1.7);
    await game.seconds(4);
    const b = await rt(game, buddy);
    expect(inTunnel(b.x, b.z)).toBe(false);
    expect(Math.hypot(b.x - kid.x, b.z - kid.z)).toBeLessThan(4.5);
  }
  expect(await page.evaluate(() => (window as any).__silly.runtime.debugInfo.unstuck.where.length)).toBe(unstuck0);
  game.expectNoErrors();
});
