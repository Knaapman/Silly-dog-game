import { expect, test } from '@playwright/test';
import { Game } from './game';

type Cat = { x: number; y: number; z: number; mode: string; tree: number };
const cat = (game: Game, i: number) =>
  game.page.evaluate((i) => {
    const c = (window as any).__silly.chase.parkCats[i];
    return { x: c.position.x, y: c.position.y, z: c.position.z, mode: c.mode, tree: c.tree } as Cat;
  }, i);
const flock = (game: Game, i: number) =>
  game.page.evaluate((i) => {
    const f = (window as any).__silly.chase.flocks[i];
    return { x: f.center.x, y: f.center.y, z: f.center.z, landed: f.landed };
  }, i);
const tally = (game: Game) => game.page.evaluate(() => (window as any).__silly.chase.useChase.getState().tagged as boolean[]);
const stickers = (game: Game) => game.page.evaluate(() => [...(window as any).__silly.useStickers.getState().got] as string[]);

test('chase a cat: it runs, you catch it, it flees up a tree, and a bark brings it down', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();

  // run at the cat with the arrow keys, like a child would
  let c = await cat(game, 0);
  expect(c.mode).toBe('idle');
  await game.teleport(0, c.x - 8, 1, c.z);
  await game.seconds(0.5);
  // a bark wakes it (napping cats only notice you when you're right next to them)
  await game.tap('KeyR');
  await game.seconds(0.2);
  expect((await cat(game, 0)).mode).toBe('alert');
  let fled = false;
  for (let i = 0; i < 40; i += 1) {
    c = await cat(game, 0);
    if (c.mode === 'flee') fled = true;
    if (c.mode === 'tagged' || c.mode === 'toTree' || c.mode === 'tree') break;
    const k = await game.player(0);
    const dx = c.x - k.x;
    const dz = c.z - k.z;
    await game.hold(Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'KeyD' : 'KeyA') : dz > 0 ? 'KeyS' : 'KeyW', 0.3);
  }
  expect(fled).toBe(true);
  expect(['tagged', 'toTree', 'tree']).toContain(c.mode);
  expect((await tally(game))[0]).toBe(true);
  expect(await stickers(game)).toContain('cattag');
  await expect(page.getByTestId('cat-slots').locator('[data-got="true"]')).toHaveCount(1);

  // up the tree it goes (faster than you can run)
  for (let i = 0; i < 40 && c.mode !== 'tree'; i += 1) {
    await game.seconds(0.25);
    c = await cat(game, 0);
  }
  expect(c.mode).toBe('tree');
  expect(c.y).toBeGreaterThan(1.8);

  // stand under the tree and bark: down it tumbles, dizzy, and then it's off again
  await game.teleport(0, c.x, 1, c.z + 3);
  await game.seconds(0.5);
  await game.screenshot('test-results/chase-cat-tree.png');
  await game.tap('KeyR');
  await game.seconds(0.2);
  expect((await cat(game, 0)).mode).toBe('fall');
  await game.seconds(1.5);
  expect(['dizzy', 'flee']).toContain((await cat(game, 0)).mode);
  expect(await stickers(game)).toContain('cattree');

  // tag all four: a cheer, the gold cat sticker, and the tally starts again
  for (let i = 1; i < 4; i += 1) {
    c = await cat(game, i);
    await game.teleport(0, c.x, 1, c.z + 0.6);
    await game.seconds(0.4);
  }
  expect(await tally(game)).toEqual([true, true, true, true]);
  expect(await stickers(game)).toContain('allcats');
  await game.seconds(4);
  expect(await tally(game)).toEqual([false, false, false, false]);
  game.expectNoErrors();
});

test('birds: run at a flock and it flies off, then lands somewhere else', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const before = await flock(game, 0);
  expect(before.landed).toBe(true);
  await game.teleport(0, before.x, 1, before.z + 10);
  await game.seconds(1);
  expect((await flock(game, 0)).landed).toBe(true);
  await game.hold('KeyW', 0.8);
  expect((await flock(game, 0)).landed).toBe(false);
  expect(await stickers(game)).toContain('birds');
  await game.screenshot('test-results/chase-birds.png');
  let after = await flock(game, 0);
  for (let i = 0; i < 30 && !after.landed; i += 1) {
    await game.seconds(0.5);
    after = await flock(game, 0);
  }
  expect(after.landed).toBe(true);
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(10);

  // a bark scares them too
  const k = await game.player(0);
  await game.teleport(0, after.x, after.y + 1, after.z + 6);
  await game.seconds(1.2);
  expect((await flock(game, 0)).landed).toBe(true);
  await game.tap('KeyR');
  await game.seconds(0.2);
  expect((await flock(game, 0)).landed).toBe(false);
  expect(k).toBeTruthy();
  game.expectNoErrors();
});
