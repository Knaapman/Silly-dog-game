import { expect, test } from '@playwright/test';
import { Game } from './game';

// Bumper cars: walk into one, push the stick, crash into the others.

const cars = (game: Game) => game.page.evaluate(() => ((window as any).__silly.runtime.debugInfo.bumperCars as any[]).map((c) => ({ x: c.x, z: c.z, vx: c.vx, vz: c.vz, driver: c.driver })));
const place = (game: Game, slot: number, x: number, z: number) =>
  game.page.evaluate(([slot, x, z]) => {
    const s = (window as any).__silly;
    const b = s.runtime.players.get(slot).getBody();
    b.setTranslation({ x, y: s.terrain.groundHeight(x, z) + 1, z }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }, [slot, x, z] as const);

test('bumper cars: hop in, crash into the next car, never out through the rail, hop out', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const B = await page.evaluate(() => (window as any).__silly.layout.BUMPER);
  const c0 = await cars(game);
  await place(game, 0, c0[0].x, c0[0].z);
  await game.seconds(0.5);
  expect((await cars(game))[0].driver).toBe(0);

  // east, into the next car in the row: it gets knocked on
  await game.hold('KeyD', 1.2);
  await game.seconds(0.4);
  const c1 = await cars(game);
  expect(c1[1].x - c0[1].x).toBeGreaterThan(0.5);
  expect(await page.evaluate(() => (window as any).__silly.useStickers.getState().got)).toContain('bumper');

  // keep going into the rail: bounce, never through
  await game.hold('KeyD', 3);
  await game.hold('KeyS', 2);
  for (const c of await cars(game)) {
    expect(Math.abs(c.x - B.center[0])).toBeLessThanOrEqual(B.size[0] / 2);
    expect(Math.abs(c.z - B.center[1])).toBeLessThanOrEqual(B.size[1] / 2);
  }
  const driver = await game.player(0);
  const mine = (await cars(game))[0];
  expect(Math.hypot(driver.x - mine.x, driver.z - mine.z)).toBeLessThan(0.5);
  await game.screenshot('test-results/bumper-cars.png');

  // jump: out
  await game.tap('Space');
  await game.seconds(1.5);
  expect((await cars(game))[0].driver).toBeNull();
  game.expectNoErrors();
});

test('playing alone: the buddy gets in a car too while you drive, and out when you do', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await page.evaluate(() => (window as any).__silly.useGame.getState().addBuddy());
  await game.seconds(1);
  const c0 = await cars(game);
  // nobody else driving: the buddy doesn't take a car
  await place(game, 1, c0[3].x, c0[3].z);
  await game.seconds(0.5);
  expect((await cars(game))[3].driver).toBeNull();
  // the child gets in: now the buddy does too
  await place(game, 0, c0[0].x, c0[0].z);
  await game.seconds(0.3);
  await place(game, 1, c0[3].x, c0[3].z);
  await game.seconds(0.5);
  const both = await cars(game);
  expect(both[0].driver).toBe(0);
  expect(both[3].driver).toBe(1);
  // the child hops out: so does the buddy
  await game.tap('Space');
  await game.seconds(1);
  const after = await cars(game);
  expect(after[0].driver).toBeNull();
  expect(after[3].driver).toBeNull();
  game.expectNoErrors();
});
