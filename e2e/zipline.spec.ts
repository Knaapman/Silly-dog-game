import { expect, test } from '@playwright/test';
import { Game } from './game';

// The zipline: up on the mountain's south rim, grab a handle, whizz over the whole park and
// let go over the lagoon, splash. Jump lets go sooner. A handle for every child.

type Handle = { mode: string; t: number; v: number; rider: number | null };
const zip = (game: Game) =>
  game.page.evaluate(() => {
    const z = (window as any).__silly.runtime.debugInfo.zipline;
    return { handles: z.handles.map((h: Handle) => ({ ...h })) as Handle[], rides: z.rides as number, together: z.together as number };
  });
/** The handle this player is riding (if any). */
const ridden = async (game: Game, slot = 0) => (await zip(game)).handles.find((h) => h.rider === slot && h.mode === 'ride');
/** Put an animal up on the platform, `dx` along from the handle. */
const onPlatform = (game: Game, slot: number, dx: number) =>
  game.page.evaluate(
    ([slot, dx]) => {
      const s = (window as any).__silly;
      const Z = s.layout.ZIPLINE;
      const b = s.runtime.players.get(slot).getBody();
      b.setTranslation({ x: Z.from[0] + dx, y: s.terrain.groundHeight(Z.from[0], Z.from[1]) + Z.platform + 1, z: Z.from[1] }, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    },
    [slot, dx] as const
  );
const swimming = (game: Game) => game.page.evaluate(() => (window as any).__silly.runtime.players.get(0).swimming as boolean);

test('zipline: grab the handle on the mountain, fly over the park, splash into the lagoon', async ({ page }) => {
  test.setTimeout(120_000);
  const game = new Game(page);
  await game.open();
  await game.start();
  const Z = await page.evaluate(() => (window as any).__silly.layout.ZIPLINE);

  // nothing solid anywhere along the way a rider hangs (from just after the platform to the pole)
  const hits = await page.evaluate((Z) => {
    const s = (window as any).__silly;
    const R = s.rapier;
    const deck = s.terrain.groundHeight(Z.from[0], Z.from[1]) + Z.platform;
    const a = [Z.from[0], deck + Z.cable, Z.from[1]];
    const b = [Z.to[0], Z.endHeight, Z.to[1]];
    const out: string[] = [];
    for (let t = 0.04; t <= 0.97; t += 0.01) {
      const p = { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t - 1.35, z: a[2] + (b[2] - a[2]) * t };
      s.world.intersectionsWithShape(p, { x: 0, y: 0, z: 0, w: 1 }, new R.Ball(0.7), (c: any) => {
        const body = c.parent();
        if (body && body.isDynamic()) return true;
        out.push(`t ${t.toFixed(2)} at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`);
        return false;
      }, R.QueryFilterFlags.EXCLUDE_SENSORS);
    }
    return out;
  }, Z);
  expect(hits, hits.join('\n')).toEqual([]);

  // up on the platform, by the handle: off we go
  await onPlatform(game, 0, 1);
  await game.seconds(1);
  expect((await ridden(game))?.mode).toBe('ride');
  await game.seconds(3, true);
  const mid = await game.player();
  await game.screenshot('test-results/zipline.png');
  expect(mid.z).toBeGreaterThan(Z.from[1] + 10);
  expect(mid.y).toBeGreaterThan(4);
  // all the way down, and in with a splash
  for (let i = 0; i < 80 && (await ridden(game)); i += 1) await game.seconds(0.1);
  await game.seconds(1.5);
  const end = await game.player();
  expect(Math.hypot(end.x - Z.to[0], end.z - Z.to[1])).toBeLessThan(3);
  expect(await swimming(game)).toBe(true);
  expect(await page.evaluate(() => (window as any).__silly.useStickers.getState().got)).toContain('zipline');
  // the handle slides back up for the next one
  await game.seconds(6);
  expect((await zip(game)).handles.every((h) => h.mode === 'wait' && h.t === 0)).toBe(true);
  game.expectNoErrors();
});

test('zipline: jump to let go halfway (and fall wherever you are)', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await onPlatform(game, 0, 1);
  await game.seconds(3);
  expect((await ridden(game))?.mode).toBe('ride');
  await game.tap('Space');
  await game.seconds(0.2);
  expect(await ridden(game)).toBeUndefined();
  expect((await zip(game)).handles.map((h) => h.mode)).toContain('return');
  await game.seconds(3);
  const p = await game.player();
  const g = await page.evaluate(([x, z]) => (window as any).__silly.terrain.groundHeight(x, z) as number, [p.x, p.z] as const);
  expect(p.y - g).toBeLessThan(1.5);
  game.expectNoErrors();
});

test('zipline: friends ride it together, one just behind the other, and both splash down', async ({ page }) => {
  test.setTimeout(120_000);
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');
  const Z = await page.evaluate(() => (window as any).__silly.layout.ZIPLINE);

  // both up by the handles at once: off they go, a moment apart, each on a handle of their own
  await onPlatform(game, 0, 0.8);
  await onPlatform(game, 1, -0.8);
  await game.seconds(2);
  const [a, b] = [await ridden(game, 0), await ridden(game, 1)];
  expect(a).toBeDefined();
  expect(b).toBeDefined();
  const z = await zip(game);
  expect(z.together).toBe(1);
  // the one who went first stays ahead (nobody bumps into anybody)
  const [first, second] = a!.t > b!.t ? [0, 1] : [1, 0];
  for (let i = 0; i < 20; i += 1) {
    await game.seconds(0.2);
    const [p, q] = [await ridden(game, first), await ridden(game, second)];
    if (!p || !q) break;
    expect(p.t).toBeGreaterThan(q.t);
    const [pp, qp] = [await game.player(first), await game.player(second)];
    expect(Math.hypot(pp.x - qp.x, pp.y - qp.y, pp.z - qp.z)).toBeGreaterThan(2);
  }
  await game.screenshot('test-results/zipline-friends.png');

  // all the way down, both of them
  for (let i = 0; i < 100 && ((await ridden(game, 0)) || (await ridden(game, 1))); i += 1) await game.seconds(0.1);
  await game.seconds(1.5);
  for (const slot of [0, 1]) {
    const p = await game.player(slot);
    expect(Math.hypot(p.x - Z.to[0], p.z - Z.to[1])).toBeLessThan(4);
  }
  expect((await zip(game)).rides).toBe(2);
  game.expectNoErrors();
});

test('playing alone, the buddy grabs the next handle after you and whizzes down behind you', async ({ page }) => {
  test.setTimeout(120_000);
  const game = new Game(page);
  await game.open(1, { off: ['cats', 'birds'] });
  await game.start();
  await page.evaluate(() => (window as any).__silly.useGame.getState().addBuddy());
  await game.seconds(1);
  const Z = await page.evaluate(() => (window as any).__silly.layout.ZIPLINE);
  // the buddy on the ground a few steps from the platform; the child grabs a handle
  await game.teleport(1, Z.from[0] + 3, 1, Z.from[1] - 3);
  await onPlatform(game, 0, 1);
  await game.seconds(1);
  expect((await ridden(game, 0))?.mode).toBe('ride');
  // up the buddy comes, and off it goes too
  let theirs = await ridden(game, 1);
  for (let k = 0; k < 30 && !theirs; k += 1) {
    await game.seconds(0.5);
    theirs = await ridden(game, 1);
  }
  expect(theirs?.mode).toBe('ride');
  // all the way down (it doesn't let go halfway), and it doesn't count as the child's ride
  let t = 0;
  for (let k = 0; k < 40 && (await ridden(game, 1)); k += 1) {
    t = (await ridden(game, 1))!.t;
    await game.seconds(0.5);
  }
  expect(t).toBeGreaterThan(0.9);
  expect((await zip(game)).rides).toBe(1);
  game.expectNoErrors();
});
