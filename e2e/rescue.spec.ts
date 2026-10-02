import { expect, test } from '@playwright/test';
import { Game } from './game';

// "I'm stuck!": hold all four shoulder buttons (L, R, ZL, ZR) for five seconds and the animal pops
// out of wherever it was, onto clear ground next to a friend (or on its own spot in the plaza).

const chord = (game: Game, down: boolean) =>
  game.page.evaluate((down) => {
    for (const b of [4, 5, 6, 7]) (window as any).__press(0, b, down);
  }, down);
const spawn = (game: Game, slot: number) => game.page.evaluate((slot) => (window as any).__silly.layout.SPAWN_POINTS[slot] as [number, number, number], slot);
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

test('hold the four shoulder buttons for five seconds: out you pop, back in the plaza (letting go early starts again)', async ({ page }) => {
  const game = new Game(page);
  await game.withPads();
  await game.open();
  await page.evaluate(() => (window as any).__addPad(0, 'standard', 'Pad'));
  await game.start('pad0');
  // somewhere out of the way (pretend it's stuck there)
  await game.teleport(0, 40, 1, -30);
  await game.seconds(1);
  const stuck = await game.player();

  // not long enough: nothing happens, and it starts again from nothing
  await chord(game, true);
  await game.seconds(3.5);
  await chord(game, false);
  await game.seconds(0.5);
  await chord(game, true);
  await game.seconds(3.5, true);
  await game.screenshot('test-results/rescue-ring.png');
  expect(dist(await game.player(), stuck)).toBeLessThan(2);
  // held all the way: poof
  await game.seconds(1.7);
  const [sx, , sz] = await spawn(game, 0);
  const p = await game.player();
  expect(dist(p, { x: sx, z: sz })).toBeLessThan(1.5);
  // still holding: only once
  await game.seconds(6);
  expect(dist(await game.player(), { x: sx, z: sz })).toBeLessThan(3);
  await chord(game, false);
  game.expectNoErrors();
});

test('stuck on a ride (the zipline): it lets go, and you pop up next to a friend far away', async ({ page }) => {
  test.setTimeout(120_000);
  const game = new Game(page);
  await game.withPads();
  await game.open();
  await page.evaluate(() => (window as any).__addPad(0, 'standard', 'Pad'));
  await game.start('pad0');
  await game.join('kb2');
  // the friend is down in the park, south of the plaza
  await game.teleport(1, 2, 1, 20);
  const Z = await page.evaluate(() => (window as any).__silly.layout.ZIPLINE);
  await page.evaluate((Z) => {
    const s = (window as any).__silly;
    const b = s.runtime.players.get(0).getBody();
    b.setTranslation({ x: Z.from[0] + 0.8, y: s.terrain.groundHeight(Z.from[0], Z.from[1]) + Z.platform + 1, z: Z.from[1] }, true);
  }, Z);
  await game.seconds(1);
  const riding = () => page.evaluate(() => (window as any).__silly.runtime.debugInfo.zipline.handles.some((h: any) => h.mode === 'ride' && h.rider === 0) as boolean);
  expect(await riding()).toBe(true);
  await chord(game, true);
  await game.seconds(5.3);
  await chord(game, false);
  expect(await riding()).toBe(false);
  await game.seconds(1.5);
  const [p, friend] = [await game.player(0), await game.player(1)];
  expect(dist(p, friend)).toBeLessThan(5);
  expect(dist(p, friend)).toBeGreaterThan(1.5);
  // standing on the ground there, free to walk about
  const g = await page.evaluate(([x, z]) => (window as any).__silly.terrain.groundHeight(x, z) as number, [p.x, p.z] as const);
  expect(p.y - g).toBeLessThan(1);
  expect(p.launched).toBe(false);
  // and the handle went back up for the next one
  await game.seconds(4);
  expect(await page.evaluate(() => (window as any).__silly.runtime.debugInfo.zipline.handles.every((h: any) => h.rider !== 0))).toBe(true);
  game.expectNoErrors();
});

test('on a keyboard: hold flop and poop together (F and G)', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.teleport(0, 40, 1, -30);
  await game.seconds(1);
  await page.keyboard.down('KeyF');
  await page.keyboard.down('KeyG');
  await game.seconds(5.3);
  await page.keyboard.up('KeyF');
  await page.keyboard.up('KeyG');
  const [sx, , sz] = await spawn(game, 0);
  expect(dist(await game.player(), { x: sx, z: sz })).toBeLessThan(2);
  game.expectNoErrors();
});
