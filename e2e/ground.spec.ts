import { expect, test } from '@playwright/test';
import { Game } from './game';

// Never under the ground (keepAboveGround for the animals, liftIfUnder for the things that roll and
// fly about). The floor under the park used to lie just under the sea and river beds, so a very hard
// landing could punch an animal (or a ball) through and leave it wedged there, half through the bed;
// and one that got under the ground anywhere walked about beneath the world. Now the floor is deep
// down, and anything under the ground is put straight back on top (the play log counts animals).

const state = (game: Game) =>
  game.page.evaluate(() => {
    const s = (window as any).__silly;
    const p = s.runtime.players.get(0);
    return { above: p.position.y - s.terrain.groundHeight(p.position.x, p.position.z), swimming: p.swimming as boolean, under: s.runtime.debugInfo.unstuck.under as number };
  });
/** Put player one at an absolute spot, moving this fast (m/s, up is +). */
const drop = (game: Game, x: number, y: number, z: number, vy = 0) =>
  game.page.evaluate(
    ([x, y, z, vy]) => {
      const b = (window as any).__silly.runtime.players.get(0).getBody();
      b.setTranslation({ x, y, z }, true);
      b.setLinvel({ x: 0, y: vy, z: 0 }, true);
    },
    [x, y, z, vy] as const
  );

test.beforeEach(async ({ page }) => {
  const game = new Game(page);
  await game.open(1, { off: ['cats', 'birds', 'chickens'] });
  await game.start();
});

test('a huge fall into the shallow sea ends up swimming on top, not stuck under the seabed', async ({ page }) => {
  const game = new Game(page);
  for (const [x, z] of [
    [0, 60],
    [40, 60]
  ]) {
    await drop(game, x, 40, z, -30);
    await game.seconds(4);
    const s = await state(game);
    expect(s.above).toBeGreaterThan(0.3);
    expect(s.swimming).toBe(true);
  }
});

test('the same fall into the river ends up swimming on top', async ({ page }) => {
  const game = new Game(page);
  await drop(game, 24, 40, -6, -30);
  await game.seconds(4);
  const s = await state(game);
  expect(s.above).toBeGreaterThan(0.3);
  expect(s.swimming).toBe(true);
});

test('an animal that gets under the ground is put straight back on top (and it is counted)', async ({ page }) => {
  const game = new Game(page);
  // inside the mountain, metres below its surface
  await drop(game, 0, 4, -45);
  await game.seconds(0.3);
  const s = await state(game);
  expect(s.above).toBeGreaterThan(0.3);
  expect(s.under).toBeGreaterThanOrEqual(1);
  // and it stays up there
  await game.seconds(2);
  expect((await state(game)).above).toBeGreaterThan(0.3);
  game.expectNoErrors();
});

test('an animal pushed just under the riverbed is not left wedged in it', async ({ page }) => {
  const game = new Game(page);
  // just below the bed (-0.6): nothing holds it there half in the bed; it's back on top, swimming
  await drop(game, 24, -0.95, -6);
  await game.seconds(1);
  const s = await state(game);
  expect(s.above).toBeGreaterThan(0.3);
  expect(s.swimming).toBe(true);
});

test('a ball that gets under the ground comes back up too (like crates, cats and the rest)', async ({ page }) => {
  const game = new Game(page);
  const lifted = () => page.evaluate(() => (window as any).__silly.runtime.debugInfo.lifted.count as number);
  // the football: just under the seabed, and inside the mountain
  for (const [x, y, z] of [
    [10, -1.2, 60],
    [0, 4, -45]
  ]) {
    await page.evaluate(
      ([x, y, z]) => {
        const p = [...(window as any).__silly.runtime.props.values()].find((p: any) => p.kind === 'soccer');
        const b = p.getBody();
        b.setTranslation({ x, y, z }, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.wakeUp();
      },
      [x, y, z] as const
    );
    await game.seconds(1);
    const [ball] = await game.props('soccer');
    const g = await page.evaluate(([x, z]) => (window as any).__silly.terrain.groundHeight(x, z) as number, [ball.x, ball.z] as const);
    expect(ball.y - g).toBeGreaterThan(0.2);
  }
  expect(await lifted()).toBeGreaterThanOrEqual(2);
});
