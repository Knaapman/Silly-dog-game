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

test('a fish on the grass: a cat comes running and eats it (a sticker)', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await catchOne(game);
  // put the fish down a few steps from the nearest cat, and walk well away
  const placed = await page.evaluate(() => {
    const s = (window as any).__silly;
    const fish = [...s.runtime.props.values()].find((p: any) => p.kind === 'fish' && p.enabled);
    const ft = fish.getBody().translation();
    let best: any = null;
    let bestD = Infinity;
    for (const c of s.chase.parkCats) {
      if (!c || c.mode === 'tree') continue;
      const d = Math.hypot(c.position.x - ft.x, c.position.z - ft.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    const x = best.position.x + 3;
    const z = best.position.z;
    fish.getBody().setTranslation({ x, y: s.terrain.groundHeight(x, z) + 0.4, z }, true);
    fish.getBody().setLinvel({ x: 0, y: 0, z: 0 }, true);
    return { x, z };
  });
  await game.teleport(0, placed.x - 25, 0.1, placed.z);
  for (let i = 0; i < 60 && (await page.evaluate(() => (window as any).__silly.runtime.debugInfo.fishing.eaten)) === 0; i += 1) await game.seconds(0.25);
  expect(await page.evaluate(() => (window as any).__silly.runtime.debugInfo.fishing.eaten)).toBe(1);
  expect((await fishState(game)).fish.length).toBe(0);
  expect(await stickers(game)).toContain('catfish');
  game.expectNoErrors();
});

test('a cat only eats a fish once it has landed, not one flying past overhead', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await catchOne(game);
  // drop the fish from high up, right over the nearest cat (the child well away)
  await page.evaluate(() => {
    const s = (window as any).__silly;
    const fish = [...s.runtime.props.values()].find((p: any) => p.kind === 'fish' && p.enabled);
    let best: any = null;
    let bestD = Infinity;
    const ft = fish.getBody().translation();
    for (const c of s.chase.parkCats) {
      if (!c || c.mode === 'tree') continue;
      const d = Math.hypot(c.position.x - ft.x, c.position.z - ft.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    const { x, z } = best.position;
    fish.getBody().setTranslation({ x: x + 0.3, y: s.terrain.groundHeight(x, z) + 3.2, z }, true);
    fish.getBody().setLinvel({ x: 0, y: 0, z: 0 }, true);
    s.runtime.players.get(0).getBody().setTranslation({ x: x - 25, y: s.terrain.groundHeight(x - 25, z) + 1, z }, true);
  });
  const eaten = () => page.evaluate(() => (window as any).__silly.runtime.debugInfo.fishing.eaten as number);
  // still up in the air: not eaten
  await game.seconds(0.3);
  expect(await eaten()).toBe(0);
  expect((await fishState(game)).fish[0].y).toBeGreaterThan(1);
  // down on the ground: gobbled up
  for (let i = 0; i < 40 && (await eaten()) === 0; i += 1) await game.seconds(0.1);
  expect(await eaten()).toBe(1);
  game.expectNoErrors();
});
