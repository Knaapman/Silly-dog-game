import { expect, test } from '@playwright/test';
import { Game } from './game';

const stickers = (game: Game) => game.page.evaluate(() => (window as any).__silly.useStickers.getState().got as string[]);

// Every golden star can be got the way a child gets there: the launcher, ride or climb that leads
// to it (the "show me where" guide points the same way). Moving a landmark, a launcher's target or
// a star must never leave one stranded out of reach (as the ferris wheel's once was: nobody could
// get into a gondola). The fountain (geyser) and barn roof (launch pad) stars are in rides.spec.ts.
// Where the climb itself isn't scripted (the maze, the train's cab roof, the mushroom tops), the
// test starts at the place a child climbs to and checks the star is in reach from there.

const stars = (game: Game) => game.page.evaluate(() => (window as any).__silly.useGame.getState().stars as boolean[]);
const layout = (game: Game) =>
  game.page.evaluate(() => {
    const l = (window as any).__silly.layout;
    return { FERRIS: l.FERRIS, SOCCER: l.SOCCER, VOLCANO: l.VOLCANO, SLIDE_TOWER: l.SLIDE_TOWER, SHIP: l.SHIP, LAUNCH_PADS: l.LAUNCH_PADS, MUSHROOMS: l.MUSHROOMS, MAZE: l.MAZE, BRONTO: l.BRONTO };
  });
/** Put player one at an absolute spot (not above the ground, like `teleport`). */
const place = (game: Game, x: number, y: number, z: number) =>
  game.page.evaluate(
    ([x, y, z]) => {
      const b = (window as any).__silly.runtime.players.get(0).getBody();
      b.setTranslation({ x, y, z }, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    },
    [x, y, z] as const
  );
/** Run the game until star `i` is found (or give up after `max` seconds). */
async function until(game: Game, i: number, max: number) {
  for (let t = 0; t < max; t += 0.5) {
    if ((await stars(game))[i]) return true;
    await game.seconds(0.5);
  }
  return (await stars(game))[i];
}

let game: Game;
test.beforeEach(async ({ page }) => {
  game = new Game(page);
  await game.open();
  await game.start();
  expect((await stars(game)).some(Boolean)).toBe(false);
});
test.afterEach(() => game.expectNoErrors());

test('ferris wheel: wait at the front of the deck, ride a gondola round, past the star at the top', async () => {
  test.setTimeout(120000);
  const { FERRIS } = await layout(game);
  await game.teleport(0, FERRIS.center[0], 1.2, FERRIS.center[2] + 2);
  expect(await until(game, 1, 45)).toBe(true);
});

test('soccer goal: run into the goal', async () => {
  const { SOCCER } = await layout(game);
  const [gx, , gz] = SOCCER.goalCenter;
  await game.teleport(0, gx, 0.5, gz + 4);
  await game.page.keyboard.down('KeyW');
  const got = await until(game, 2, 4);
  await game.page.keyboard.up('KeyW');
  expect(got).toBe(true);
});

test('volcano: jump into the crater and it erupts you up through the star', async () => {
  const { VOLCANO } = await layout(game);
  await place(game, VOLCANO.center[0], VOLCANO.height + 1.5, VOLCANO.center[1]);
  expect(await until(game, 3, 8)).toBe(true);
  expect(await stickers(game)).toContain('volcano');
});

test('slide tower: walk up the ramp onto the top', async () => {
  const { SLIDE_TOWER } = await layout(game);
  const [bx, , bz] = SLIDE_TOWER.base;
  // the ramp climbs from the north (rampAngle π, 10 m long) onto the 3.2 m platform
  await game.teleport(0, bx, 0.5, bz - 13);
  await game.page.keyboard.down('KeyS');
  const got = await until(game, 4, 6);
  await game.page.keyboard.up('KeyS');
  expect(got).toBe(true);
});

test('lighthouse: the pirate ship cannon fires you onto the balcony', async () => {
  const { SHIP } = await layout(game);
  // the cannon's bubble sits on its loading spot
  const spot = await game.page.evaluate(([sx, sz]) => {
    let best: { d: number; x: number; y: number; z: number } | null = null;
    (window as any).__silly.runtime.hints.forEach((h: any) => {
      if (h.action !== 'walk') return;
      const d = Math.hypot(h.position.x - sx, h.position.z - sz);
      if (!best || d < best.d) best = { d, x: h.position.x, y: h.position.y, z: h.position.z };
    });
    return best as unknown as { d: number; x: number; y: number; z: number };
  }, SHIP.center);
  expect(spot.d).toBeLessThan(SHIP.length);
  await place(game, spot.x, spot.y + 0.3, spot.z);
  expect(await until(game, 5, 8)).toBe(true);
  expect(await stickers(game)).toContain('cannon');
});

test('snowy summit: the launch pad at the mountain foot', async () => {
  const { LAUNCH_PADS } = await layout(game);
  const [px, , pz] = LAUNCH_PADS[1].position;
  await game.teleport(0, px, 1, pz);
  expect(await until(game, 6, 8)).toBe(true);
});

test('tallest mushroom: a bounce off its top', async () => {
  const { MUSHROOMS } = await layout(game);
  const m = MUSHROOMS[4];
  await place(game, m.center[0], m.height + 1, m.center[1]);
  let got = false;
  for (let k = 0; k < 6 && !got; k += 1) {
    await game.seconds(0.6);
    await game.tap('Space');
    got = await until(game, 8, 1);
  }
  expect(got).toBe(true);
});

test('hedge maze: the middle of it', async () => {
  const { MAZE } = await layout(game);
  await game.teleport(0, MAZE.center[0], 0.5, MAZE.center[1]);
  expect(await until(game, 9, 2)).toBe(true);
});

test('brontosaurus: up the stairs onto its back, then along it and up the neck to the head', async () => {
  const { BRONTO } = await layout(game);
  const [bx, bz] = BRONTO.center;
  // the stairs come up from the south onto the middle of its back (the tail is a slide: no way up)
  await game.teleport(0, bx, 0.5, bz + 10);
  await game.page.keyboard.down('KeyW');
  for (let t = 0; t < 6 && (await game.player()).z > bz + 0.3; t += 0.1) await game.seconds(0.1);
  await game.page.keyboard.up('KeyW');
  expect((await game.player()).y).toBeGreaterThan(4);
  // east along the back and up the neck
  await game.page.keyboard.down('KeyD');
  const got = await until(game, 10, 6);
  await game.page.keyboard.up('KeyD');
  expect(got).toBe(true);
});

test("train: up on the engine's cab roof, the star rides along with you", async () => {
  const c = await game.page.evaluate(() => {
    const c = (window as any).__silly.runtime.debugInfo.train[0];
    return { x: c.x as number, y: c.y as number, z: c.z as number, dx: c.dx as number, dz: c.dz as number };
  });
  await place(game, c.x - c.dx * 1.05, c.y + 3.3, c.z - c.dz * 1.05);
  expect(await until(game, 11, 2)).toBe(true);
});
