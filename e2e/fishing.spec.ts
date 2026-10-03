import { expect, test } from '@playwright/test';
import { Game } from './game';

// Fishing with your tongue: lick the water from the shore and a fish leaps out over your head
// onto the bank, where it flops about. Throw it back and it swims off; throw it at a friend: SLAP.

type F = { active: boolean; x: number; y: number; z: number; held: boolean };
const fishState = (game: Game) =>
  game.page.evaluate(() => {
    const s = (window as any).__silly;
    const f = s.runtime.debugInfo.fishing;
    const list = [...s.runtime.props.values()].filter((p: any) => p.kind === 'fish');
    return {
      bites: f.bites as number,
      licks: f.licks as number,
      slaps: f.slaps as number,
      swamOff: f.swamOff as number,
      fish: list.filter((p: any) => p.enabled).map((p: any) => {
        const t = p.getBody().translation();
        return { active: true, x: t.x, y: t.y, z: t.z, held: p.heldBy != null };
      }) as F[]
    };
  });
const spot = (game: Game) => game.page.evaluate(() => (window as any).__silly.layout.FISHING_SPOT as [number, number]);
const stickers = (game: Game) => game.page.evaluate(() => (window as any).__silly.useStickers.getState().got as string[]);
const wet = (game: Game, x: number, z: number) => game.page.evaluate(([x, z]) => (window as any).__silly.terrain.groundHeight(x, z) < -0.3, [x, z] as const);

/** Stand on the shore facing the water and lick until a fish leaps out (three licks at most). */
async function catchOne(game: Game) {
  const [sx, sz] = await spot(game);
  await game.hopTo(0, [sx, sz - 2.2], [sx, sz]);
  const before = (await fishState(game)).bites;
  for (let i = 0; i < 3 && (await fishState(game)).bites === before; i += 1) {
    await game.tap('KeyQ');
    await game.seconds(0.3);
  }
  expect((await fishState(game)).bites).toBe(before + 1);
  await game.seconds(1.5);
}

/** Face the fish (hop to just in front of it) and pick it up with the tongue (it flops: try again if it got away). */
async function pickUp(game: Game) {
  for (let tries = 0; tries < 3; tries += 1) {
    const f = (await fishState(game)).fish[0];
    await game.hopTo(0, [f.x, f.z + 2.4], [f.x, f.z + 0.9]);
    await game.tap('KeyQ');
    await game.seconds(0.1);
    if ((await fishState(game)).fish[0]?.held) return;
  }
  expect((await fishState(game)).fish[0].held).toBe(true);
}

test('lick the water: a fish leaps out over your head onto the bank and flops about (a sticker); throw it back and off it swims', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const [, sz] = await spot(game);
  await catchOne(game);
  let s = await fishState(game);
  expect(s.fish.length).toBe(1);
  const fish = s.fish[0];
  // behind us, on the dry bank
  expect(fish.z).toBeLessThan(sz);
  expect(await wet(game, fish.x, fish.z)).toBe(false);
  expect(await stickers(game)).toContain('fish');
  await game.seconds(0.2, true);
  await game.screenshot('test-results/fishing-caught.png');
  // flop, flop
  const ys: number[] = [];
  for (let i = 0; i < 20; i += 1) {
    await game.seconds(0.1);
    ys.push((await fishState(game)).fish[0].y);
  }
  expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.25);
  // pick it up, turn to the water (a step south) and throw it back in
  await pickUp(game);
  await game.hold('KeyS', 0.2);
  await game.tap('KeyQ');
  for (let i = 0; i < 30 && (await fishState(game)).swamOff === 0; i += 1) await game.seconds(0.1);
  s = await fishState(game);
  expect(s.swamOff).toBe(1);
  expect(s.fish.length).toBe(0);
  game.expectNoErrors();
});

test('throw a fish at a friend: SLAP (a friend sticker)', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');
  const [sx, sz] = await spot(game);
  await game.teleport(1, sx + 6, 0.1, sz - 6);
  await catchOne(game);
  await pickUp(game);
  // the friend stands just in front (to the north, on the grass)
  const me = await game.player(0);
  await game.teleport(1, me.x, 0.1, me.z - 3.2);
  await game.seconds(0.4);
  await game.tap('KeyQ');
  for (let i = 0; i < 20 && (await fishState(game)).slaps === 0; i += 1) await game.seconds(0.05);
  expect((await fishState(game)).slaps).toBe(1);
  expect(await stickers(game)).toContain('fishslap');
  game.expectNoErrors();
});
