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
const skill = (game: Game) => game.page.evaluate(() => (window as any).__silly.chase.useChase.getState().skill as number[]);
const setChase = (game: Game, chase: 'auto' | 0 | 1 | 2) => game.page.evaluate((v) => (window as any).__silly.useSettings.getState().set({ chase: v }), chase);
/** Bark at a cat from `d` metres, then run after it with the arrow keys for up to `steps` goes. */
async function chase(game: Game, i: number, d: number, steps: number) {
  let c = await cat(game, i);
  await game.teleport(0, c.x - d, 1, c.z);
  await game.seconds(0.5);
  await game.tap('KeyR');
  await game.seconds(0.2);
  const t0 = await game.page.evaluate(() => (window as any).__silly.clock.gameClock.time);
  for (let n = 0; n < steps; n += 1) {
    c = await cat(game, i);
    if (c.mode === 'tagged' || c.mode === 'toTree' || c.mode === 'tree' || c.mode === 'conga') break;
    const k = await game.player(0);
    const dx = c.x - k.x;
    const dz = c.z - k.z;
    await game.hold(Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'KeyD' : 'KeyA') : dz > 0 ? 'KeyS' : 'KeyW', 0.3);
  }
  const t1 = await game.page.evaluate(() => (window as any).__silly.clock.gameClock.time);
  return { cat: c, seconds: t1 - t0 };
}
/** How far a cat runs in the first 1.2 s after a bark (path length, so its zig-zags don't matter). */
async function fleeDistance(game: Game, i: number) {
  // the same cat from the same spot each time: the open soccer field, with a clear run east
  await game.page.evaluate((i) => {
    const b = (window as any).__silly.chase.parkCats[i].getBody();
    b.setTranslation({ x: 32, y: 1, z: -38 }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }, i);
  await game.teleport(0, 24.5, 1, -38);
  await game.seconds(0.2);
  await game.tap('KeyR');
  await game.seconds(0.6); // startled (a hop), then off
  let prev = await cat(game, i);
  let dist = 0;
  for (let n = 0; n < 12; n += 1) {
    await game.seconds(0.1);
    const now = await cat(game, i);
    dist += Math.hypot(now.x - prev.x, now.z - prev.z);
    prev = now;
  }
  expect(prev.mode).toBe('flee');
  return dist;
}
const tally = (game: Game) => game.page.evaluate(() => (window as any).__silly.chase.useChase.getState().tagged as boolean[]);
const stickers = (game: Game) => game.page.evaluate(() => [...(window as any).__silly.useStickers.getState().got] as string[]);

test('chase a cat: it runs, you catch it, it flees up a tree, and a bark brings it down', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();

  // run at the cat with the arrow keys, like a child would (out on the open soccer field, so the
  // chase is the same every time and nothing gets in the way)
  await game.page.evaluate(() => {
    const b = (window as any).__silly.chase.parkCats[0].getBody();
    b.setTranslation({ x: 32, y: 1, z: -38 }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
  });
  await game.seconds(0.3);
  let c = await cat(game, 0);
  expect(['idle', 'stalk']).toContain(c.mode);
  await game.teleport(0, c.x - 6, 1, c.z);
  await game.seconds(0.3);
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

test('catching the cats: easy, tricky, and auto that learns from each chase', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  // a grown-up can pick a level in the menu...
  await page.keyboard.press('Escape');
  const row = page.getByTestId('grown-up-menu').locator('[data-setting="chase"]');
  await expect(row).toBeVisible();
  await expect(row.locator('button')).toHaveCount(4);
  await row.getByRole('button', { name: 'Tricky' }).click();
  expect(await page.evaluate(() => (window as any).__silly.useSettings.getState().chase)).toBe(2);
  await page.keyboard.press('Escape');
  await game.seconds(0.3);

  // ...and a tricky cat runs clearly faster than an easy one
  const tricky = await fleeDistance(game, 1);
  await setChase(game, 0);
  const easy = await fleeDistance(game, 1);
  expect(tricky / easy).toBeGreaterThan(1.2);

  // auto: every child starts in the middle; a quick catch nudges it up, a cat that gets away nudges it down
  // (the quick one out on the open field, where nothing gets in the way of the chase)
  await setChase(game, 'auto');
  expect((await skill(game))[0]).toBe(0.5);
  await game.page.evaluate(() => {
    const b = (window as any).__silly.chase.parkCats[2].getBody();
    b.setTranslation({ x: 32, y: 1, z: -38 }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
  });
  await game.seconds(0.3);
  const quick = await chase(game, 2, 4, 30);
  expect(['tagged', 'toTree', 'tree']).toContain(quick.cat.mode);
  expect(quick.seconds).toBeLessThan(5);
  const up = (await skill(game))[0];
  expect(up).toBeGreaterThan(0.5);
  // chase cat 3 for a bit, then give up: it calms down and counts as an escape
  await chase(game, 3, 6, 9);
  await game.teleport(0, -40, 1, -40);
  await game.seconds(3.5);
  expect((await cat(game, 3)).mode).toBe('idle');
  expect((await skill(game))[0]).toBeLessThan(up);
  game.expectNoErrors();
});

test('the buddy running about does not spoil sneaking up on a cat', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await page.evaluate(() => ((window as any).__silly.buddyControl.auto = true));
  await game.seconds(5);
  const buddy = (await game.state<{ slot: number; bot: boolean }[]>('(g) => g.players.map((p) => ({ slot: p.slot, bot: !!p.bot }))')).find((p) => p.bot)!.slot;
  const c = await cat(game, 1);
  expect(c.mode).toBe('idle');
  await game.teleport(0, c.x - 9, 1, c.z);
  await game.teleport(buddy, c.x - 1.5, 1, c.z);
  for (let i = 0; i < 10; i += 1) {
    await game.seconds(0.1);
    expect(['idle', 'stalk']).toContain((await cat(game, 1)).mode);
  }
  game.expectNoErrors();
});

test('tag all four and the cats follow you in a line, then go home', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  for (let i = 0; i < 4; i += 1) {
    const c = await cat(game, i);
    await game.teleport(0, c.x, 1, c.z + 0.6);
    await game.seconds(0.4);
  }
  expect(await tally(game)).toEqual([true, true, true, true]);
  await game.seconds(2);
  for (let i = 0; i < 4; i += 1) expect((await cat(game, i)).mode).toBe('conga');
  await game.teleport(0, 0, 1, 20);
  await game.seconds(6);
  await game.screenshot('test-results/chase-conga.png');
  const k = await game.player(0);
  for (let i = 0; i < 4; i += 1) {
    const c = await cat(game, i);
    expect(c.mode).toBe('conga');
    expect(Math.hypot(c.x - k.x, c.z - k.z)).toBeLessThan(2.5 + i * 2.2);
  }
  // in the line nothing startles them and nobody can tag them
  await game.tap('KeyR');
  await game.seconds(0.3);
  expect((await cat(game, 0)).mode).toBe('conga');
  await game.seconds(16);
  for (let i = 0; i < 4; i += 1) expect((await cat(game, i)).mode).toBe('idle');
  game.expectNoErrors();
});
