import { expect, test } from '@playwright/test';
import { Game } from './game';

// The chicken round-up: herd the farm's chickens into the coop. In they stay; all of them in is a
// party, and after a while the gate opens and out they wander again.

const coop = (game: Game) => game.page.evaluate(() => {
  const c = (window as any).__silly.useCoop.getState();
  return { penned: [...c.penned] as boolean[], doneAt: c.doneAt as number };
});
const chickens = (game: Game) =>
  game.page.evaluate(() =>
    [...(window as any).__silly.runtime.props.values()]
      .filter((p: any) => p.kind === 'chicken')
      .map((p: any) => ({ id: p.id as number, ...p.getBody().translation() }))
  );
const putChicken = (game: Game, id: number, x: number, z: number) =>
  game.page.evaluate(([id, x, z]) => {
    const s = (window as any).__silly;
    const b = s.runtime.props.get(id).getBody();
    b.setTranslation({ x, y: s.terrain.groundHeight(x, z) + 0.4, z }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }, [id, x, z] as const);

test('walk at a chicken by the gate: in it runs, and stays in', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const C = await page.evaluate(() => (window as any).__silly.layout.CHICKEN_COOP);
  const [cx, cz] = C.center;
  const half = C.size / 2;
  const [first] = await chickens(game);
  await putChicken(game, first.id, cx + 0.3, cz - half - 1.8);
  await game.teleport(0, cx, 1, cz - half - 5);
  await game.seconds(0.3);
  await game.hold('KeyS', 1.6);
  await game.seconds(1.5);
  expect((await coop(game)).penned.filter(Boolean).length).toBe(1);
  // it stays in while we stand at the gate
  await game.seconds(5);
  expect((await coop(game)).penned.filter(Boolean).length).toBe(1);
  await game.screenshot('test-results/chicken-coop.png');
  game.expectNoErrors();
});

test('all the chickens in: a party; later the gate opens and they wander home', async ({ page }) => {
  test.setTimeout(180_000);
  const game = new Game(page);
  await game.open();
  await game.start();
  const C = await page.evaluate(() => (window as any).__silly.layout.CHICKEN_COOP);
  const [cx, cz] = C.center;
  const all = await chickens(game);
  for (let i = 0; i < all.length; i += 1) await putChicken(game, all[i].id, cx - 1.5 + (i % 4), cz - 0.5 + Math.floor(i / 4));
  await game.seconds(1.5);
  const done = await coop(game);
  expect(done.penned.every(Boolean)).toBe(true);
  expect(done.doneAt).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(() => (window as any).__silly.useStickers.getState().got)).toContain('chickens');
  expect(await game.state<number>('(g) => g.partyUntil')).toBeGreaterThan(0);
  // 45 s later: out they come (through the gate, not stuck at the fence)
  await game.seconds(47);
  expect((await coop(game)).penned.some(Boolean)).toBe(false);
  await game.seconds(25);
  const out = (await chickens(game)).filter((c) => Math.abs(c.x - cx) > C.size / 2 || Math.abs(c.z - cz) > C.size / 2);
  expect(out.length).toBeGreaterThanOrEqual(6);
  game.expectNoErrors();
});

test('playing alone by the coop, the buddy walks the chickens in', async ({ page }) => {
  test.setTimeout(240_000);
  const game = new Game(page);
  await game.open(1, { off: ['cats', 'birds'] });
  await game.start();
  await page.evaluate(() => (window as any).__silly.useGame.getState().addBuddy());
  await game.seconds(5);
  // the child stands by the coop and watches; the buddy does the rounding up (the gate helps it along)
  const C = await page.evaluate(() => (window as any).__silly.layout.CHICKEN_COOP);
  await game.teleport(0, C.center[0] - 9, 0.5, C.center[1] - 6);
  for (let k = 0; k < 18 && (await coop(game)).doneAt < 0; k += 1) await game.seconds(10);
  const done = await coop(game);
  expect(done.penned.every(Boolean)).toBe(true);
  expect(done.doneAt).toBeGreaterThanOrEqual(0);
  game.expectNoErrors();
});

test('a chicken thrown up on the mountain picks itself up and wanders off again', async ({ page }) => {
  const game = new Game(page);
  await game.open(1, { off: ['birds', 'cats'] });
  await game.start();
  const [x, z] = [12, -56];
  await game.teleport(0, x - 8, 0.5, z);
  const mode = () => game.page.evaluate(() => (window as any).__silly.runtime.debugInfo.chickens[0].mode as string);
  await page.evaluate(([x, z]) => {
    const s = (window as any).__silly;
    const e = [...s.runtime.props.values()].filter((p: any) => p.kind === 'chicken')[0];
    const b = e.getBody();
    b.setTranslation({ x, y: s.terrain.groundHeight(x, z) + 1, z }, true);
    b.setLinvel({ x: 1, y: 3, z: 0 }, true);
    // (what letting go of it after carrying it with the tongue does)
    e.onRelease?.();
  }, [x, z] as const);
  await game.seconds(0.2);
  expect(await mode()).toBe('tumble');
  await game.seconds(4);
  expect(['dizzy', 'wander', 'peck', 'flee']).toContain(await mode());
  game.expectNoErrors();
});
