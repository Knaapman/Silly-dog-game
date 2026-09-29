import { expect, test } from '@playwright/test';
import { Game } from './game';

// The sled run's challenges: star hoops to steer through (each one makes you faster), and how far
// you fly off the hill (faster = further, and further still with a jump right at the top).

const sled = (game: Game) => game.page.evaluate(() => {
  const d = (window as any).__silly.runtime.debugInfo.sleds[0];
  return { x: d.x as number, z: d.z as number, v: d.v as number, mode: d.mode as string, hoops: [...d.hoops] as boolean[] };
});
const stickers = (game: Game) => game.page.evaluate(() => [...(window as any).__silly.useStickers.getState().got] as string[]);
const best = (game: Game) => game.page.evaluate(() => (window as any).__silly.useSledding.getState().best as number | null);

async function board(game: Game) {
  await game.teleport(0, -4, 1, -55);
  await game.seconds(0.5);
  await game.hold('KeyA', 0.4);
  expect((await sled(game)).mode).toBe('ride');
}

async function landing(game: Game) {
  for (let i = 0; i < 40 && (await game.player()).launched; i += 1) await game.seconds(0.1);
  await game.seconds(0.3);
  return game.player();
}

test('sledding: a plain run lands by the green line; hoops and a jump at the top fly past the red one', async ({ page }) => {
  test.setTimeout(180_000);
  const game = new Game(page);
  await game.open();
  await game.start();
  const run = await page.evaluate(() => (window as any).__silly.layout.SLED_RUN);
  expect(await best(game)).toBeNull();

  // just sit there: no hoops, no jump
  await board(game);
  for (let i = 0; i < 60 && (await sled(game)).mode === 'ride'; i += 1) await game.seconds(0.1);
  const plain = await landing(game);
  expect(plain.x).toBeLessThan(run.markers[0] + 1.5);
  expect(plain.x).toBeGreaterThan(run.markers[1]);
  expect(await best(game)).toBeCloseTo(plain.x, 0);
  expect(await stickers(game)).not.toContain('hoops');
  await game.seconds(3);

  // steer through every hoop, jump at the top of the hill
  await board(game);
  const held = new Set<string>();
  const hold = async (key: string | null) => {
    for (const k of [...held]) if (k !== key) {
      await page.keyboard.up(k);
      held.delete(k);
    }
    if (key && !held.has(key)) {
      await page.keyboard.down(key);
      held.add(key);
    }
  };
  let jumped = false;
  for (let i = 0; i < 200; i += 1) {
    const s = await sled(game);
    if (s.mode !== 'ride') break;
    const next = (run.hoops as [number, number][]).find(([hx], k) => !s.hoops[k] && hx < s.x);
    const dz = next ? next[1] - s.z : 0;
    await hold(Math.abs(dz) < 0.15 ? null : dz > 0 ? 'KeyS' : 'KeyW');
    if (!jumped && s.x < run.kickX + 2.5) {
      await game.tap('Space');
      jumped = true;
    }
    await game.seconds(1 / 30);
  }
  await hold(null);
  const far = await landing(game);
  expect(await stickers(game)).toEqual(expect.arrayContaining(['hoops', 'farfly']));
  expect(far.x).toBeLessThan(run.markers[2]);
  expect(far.x).toBeGreaterThan(run.furthestX - 1);
  // the golden flag moved out to the new record
  expect(await best(game)).toBeLessThan(plain.x - 4);
  await game.screenshot('test-results/sled-landing.png');
  game.expectNoErrors();
});
