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
  await game.teleport(0, 20, 1, 4);
  await game.seconds(4);
  let b = await rt(game, buddy);
  expect(Math.hypot(b.x - 20, b.z - 4)).toBeLessThan(6);

  // it copies a jump
  await game.teleport(buddy, 24, 1, 4);
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
  await game.teleport(buddy, 23.6, 1, 10);
  await game.hopTo(0, [20, 10], [22, 10]);
  await game.teleport(buddy, 23.6, 1, 10);
  await game.seconds(0.1);
  await game.tap('KeyQ');
  expect((await rt(game, buddy)).grabbedBy).toBe(0);
  await game.tap('KeyQ');
  expect((await rt(game, buddy)).launched).toBe(true);
  expect(await stickers(game)).toContain('throw');
  await game.seconds(3);

  // near a see-saw it waits on the far end, and gets flung when the child lands on the near end
  await game.teleport(0, 25.5, 1, 46);
  await game.teleport(buddy, 29, 1, 50);
  await game.seconds(7);
  b = await rt(game, buddy);
  // (on the far end, which it has pushed down)
  expect(Math.hypot(b.x - 33.3, b.z - 46)).toBeLessThan(1);
  expect(await page.evaluate(() => (window as any).__silly.runtime.seesawLow[0])).toBe(1);
  await game.teleport(0, 28.8, 7, 46.3); // drop onto the raised near end
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
