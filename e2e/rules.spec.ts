import { expect, test } from '@playwright/test';
import { Game } from './game';

// The shared rules (docs/attractions.md): you get on a ride by walking into it, jump gets you off
// (also before it has set off), every ride has a bubble where you get on, and a bubble isn't shown
// to whoever is already on it.

type Shown = { id: number; action: string; slot: number | null };
const shown = (game: Game) => game.page.evaluate(() => (window as any).__silly.runtime.debugInfo.hintsShown.slice() as Shown[]);
/** The registered bubble of this kind nearest a spot. */
const hintNear = (game: Game, action: string, x: number, z: number) =>
  game.page.evaluate(
    ([action, x, z]) => {
      let best: { id: number; d: number; x: number; y: number; z: number } | null = null;
      (window as any).__silly.runtime.hints.forEach((h: any) => {
        if (h.action !== action) return;
        const d = Math.hypot(h.position.x - x, h.position.z - z);
        if (!best || d < best.d) best = { id: h.id, d, x: h.position.x, y: h.position.y, z: h.position.z };
      });
      return best as { id: number; d: number; x: number; y: number; z: number } | null;
    },
    [action, x, z] as const
  );
const isShown = async (game: Game, id: number) => (await shown(game)).some((s) => s.id === id);

const balloon = (game: Game) =>
  game.page.evaluate(() => {
    const b = (window as any).__silly.runtime.debugInfo.balloon;
    return { mode: b.mode as string, riders: [...b.riders] as (number | null)[], jumps: b.jumps as number };
  });

test('balloon: climbed in on the pad, a jump climbs straight back out, and an empty balloon waits instead of going up', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const [px, pz] = await page.evaluate(() => (window as any).__silly.layout.BALLOON.pad as [number, number]);
  await game.teleport(0, px, 0.1, pz + 2.2);
  await game.seconds(0.4);
  await game.hold('KeyW', 0.8);
  let b = await balloon(game);
  expect(b.riders).toContain(0);
  expect(b.mode).toBe('boarding');

  // changed my mind: jump, and out onto the grass beside the pad
  await game.tap('Space');
  await game.seconds(0.2);
  b = await balloon(game);
  expect(b.riders).not.toContain(0);
  expect(b.mode).toBe('wait');
  expect(b.jumps).toBe(0);
  await game.seconds(1.5);
  const me = await game.player();
  expect(me.launched).toBe(false);
  expect(Math.hypot(me.x - px, me.z - pz)).toBeGreaterThan(1.5);
  // nobody aboard: it stays on its pad
  await game.seconds(4);
  b = await balloon(game);
  expect(b.mode).toBe('wait');
  expect(b.riders.every((r) => r == null)).toBe(true);

  // and it still takes whoever climbs in next
  await game.teleport(0, px, 0.1, pz + 2.2);
  await game.seconds(0.4);
  await game.hold('KeyW', 0.8);
  expect((await balloon(game)).riders).toContain(0);
  for (let t = 0; t < 5 && (await balloon(game)).mode !== 'rise'; t += 0.5) await game.seconds(0.5);
  expect((await balloon(game)).mode).toBe('rise');
});

test('water slide: a bubble at the foot of the stairs, round the back of the tower', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const W = await page.evaluate(() => (window as any).__silly.layout.WATER_SLIDE as { tower: [number, number]; height: number; stairs: number });
  const [tx, tz] = W.tower;
  const foot = await hintNear(game, 'walk', tx, tz - 1.6 - W.stairs);
  expect(foot).not.toBeNull();
  expect(foot!.d).toBeLessThan(0.5);
  await game.teleport(0, tx + 6, 0.6, tz - 1.6 - W.stairs - 6);
  await game.seconds(0.6);
  expect(await isShown(game, foot!.id)).toBe(false);
  await game.teleport(0, tx, 0.6, tz - 1.6 - W.stairs - 1.2);
  await game.seconds(0.6);
  expect(await isShown(game, foot!.id)).toBe(true);
});

test('ferris wheel: walk to the front of the deck and a hop takes you into the gondola at the bottom; round you go', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const [cx, , cz] = await page.evaluate(() => (window as any).__silly.layout.FERRIS.center as [number, number, number]);
  const deck = await hintNear(game, 'walk', cx, cz + 2.4);
  expect(deck).not.toBeNull();
  expect(deck!.d).toBeLessThan(0.5);
  // at the foot of the ramp: no bubble yet; up on the deck: the bubble
  await game.teleport(0, cx, 0.6, cz + 9);
  await game.seconds(0.5);
  expect(await isShown(game, deck!.id)).toBe(false);
  await game.teleport(0, cx, 1.2, cz + 2.0);
  await game.seconds(0.4);
  expect(await isShown(game, deck!.id)).toBe(true);
  // wait at the front: the next gondola down takes you in (one comes every few seconds)
  let inside = false;
  for (let t = 0; t < 7 && !inside; t += 0.25) {
    await game.seconds(0.25);
    const p = await game.player();
    inside = !p.launched && Math.abs(p.z - cz) < 0.85 && p.y > 0.8;
  }
  expect(inside).toBe(true);
  expect(await page.evaluate(() => (window as any).__silly.runtime.debugInfo.ferris.hops)).toBe(1);
  // in a gondola, no bubble; and up it goes
  expect(await isShown(game, deck!.id)).toBe(false);
  await game.seconds(8);
  const up = await game.player();
  expect(up.y).toBeGreaterThan(5);
  expect(Math.abs(up.z - cz)).toBeLessThan(0.85);
});

test('ferris wheel playing alone: the buddy waits at the front of the deck and comes up in a gondola behind you, and gets out after you', async ({ page }) => {
  test.setTimeout(120000);
  const game = new Game(page);
  await game.open();
  await game.start();
  await page.evaluate(() => ((window as any).__silly.buddyControl.auto = true));
  await game.seconds(5);
  const buddy = await page.evaluate(() => (window as any).__silly.useGame.getState().players.find((p: any) => p.bot).slot as number);
  const [cx, , cz] = await page.evaluate(() => (window as any).__silly.layout.FERRIS.center as [number, number, number]);
  const riding = () => page.evaluate(() => (window as any).__silly.runtime.debugInfo.ferris.riding.slice() as number[]);
  await game.teleport(buddy, cx + 4, 1, cz + 9);
  await game.teleport(0, cx, 1.2, cz + 2.0);
  // the child goes up, and the buddy gets in a gondola too (no boinging about at a moving gondola)
  const boings = () => page.evaluate(() => (window as any).__silly.buddyControl.boings as number);
  const boingsBefore = await boings();
  let both = false;
  for (let t = 0; t < 30 && !both; t += 0.5) {
    await game.seconds(0.5);
    const r = await riding();
    both = r.includes(0) && r.includes(buddy);
  }
  expect(both).toBe(true);
  expect(await page.evaluate(() => (window as any).__silly.runtime.debugInfo.ferris.hops)).toBe(2);
  // round they go (still no boinging); back at the bottom the child jumps out towards the deck, and the buddy, a
  // gondola or two behind, gets out once it's down at the bottom too
  for (let t = 0; t < 45; t += 0.5) {
    await game.seconds(0.5);
    const me = await game.player();
    if (me.y < 1.3 && Math.abs(me.x - cx) < 1.5 && t > 10) break;
  }
  expect(await boings()).toBe(boingsBefore);
  await page.keyboard.down('KeyS');
  await game.tap('Space');
  await game.seconds(0.6);
  await page.keyboard.up('KeyS');
  await game.seconds(1);
  expect(await riding()).not.toContain(0);
  let out = false;
  for (let t = 0; t < 30 && !out; t += 0.5) {
    await game.seconds(0.5);
    out = !(await riding()).includes(buddy);
  }
  expect(out).toBe(true);
  // (landed: on the deck or the ground, not still up in the wheel)
  await game.seconds(1.5);
  expect(await riding()).not.toContain(buddy);
  const b = await game.player(buddy);
  expect(b.y).toBeLessThan(2);
});

test('roundabout: the bubble for a child beside it, not for one riding it', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const { center } = await page.evaluate(() => (window as any).__silly.layout.ROUNDABOUT as { center: [number, number]; radius: number });
  const [cx, cz] = center;
  const bubble = await hintNear(game, 'walk', cx, cz);
  expect(bubble!.d).toBeLessThan(0.5);
  await game.teleport(0, cx + 1, 0.9, cz);
  await game.seconds(0.8);
  expect(await page.evaluate(() => (window as any).__silly.runtime.debugInfo.roundabout.riders.slice() as number[])).toContain(0);
  expect(await isShown(game, bubble!.id)).toBe(false);
  await game.teleport(0, cx, 0.6, cz + 3.1);
  await game.seconds(0.8);
  expect(await page.evaluate(() => (window as any).__silly.runtime.debugInfo.roundabout.riders.slice() as number[])).not.toContain(0);
  expect(await isShown(game, bubble!.id)).toBe(true);
});
