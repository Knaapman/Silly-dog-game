import { expect, test } from '@playwright/test';
import { Game } from './game';

// The zipline: up on the mountain's south rim, grab the handle, whizz over the whole park and
// let go over the lagoon, splash. Jump lets go sooner.

const zip = (game: Game) => game.page.evaluate(() => ({ ...(window as any).__silly.runtime.debugInfo.zipline }) as { mode: string; t: number; v: number; rider: number | null });
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
  await page.evaluate((Z) => {
    const s = (window as any).__silly;
    const b = s.runtime.players.get(0).getBody();
    b.setTranslation({ x: Z.from[0] + 1, y: s.terrain.groundHeight(Z.from[0], Z.from[1]) + Z.platform + 1, z: Z.from[1] }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }, Z);
  await game.seconds(1);
  expect((await zip(game)).mode).toBe('ride');
  await game.seconds(3, true);
  const mid = await game.player();
  await game.screenshot('test-results/zipline.png');
  expect(mid.z).toBeGreaterThan(Z.from[1] + 10);
  expect(mid.y).toBeGreaterThan(4);
  // all the way down, and in with a splash
  for (let i = 0; i < 80 && (await zip(game)).mode === 'ride'; i += 1) await game.seconds(0.1);
  await game.seconds(1.5);
  const end = await game.player();
  expect(Math.hypot(end.x - Z.to[0], end.z - Z.to[1])).toBeLessThan(3);
  expect(await swimming(game)).toBe(true);
  expect(await page.evaluate(() => (window as any).__silly.useStickers.getState().got)).toContain('zipline');
  // the handle slides back up for the next one
  await game.seconds(6);
  expect(await zip(game)).toMatchObject({ mode: 'wait', t: 0 });
  game.expectNoErrors();
});

test('zipline: jump to let go halfway (and fall wherever you are)', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const Z = await page.evaluate(() => (window as any).__silly.layout.ZIPLINE);
  await page.evaluate((Z) => {
    const s = (window as any).__silly;
    const b = s.runtime.players.get(0).getBody();
    b.setTranslation({ x: Z.from[0] + 1, y: s.terrain.groundHeight(Z.from[0], Z.from[1]) + Z.platform + 1, z: Z.from[1] }, true);
  }, Z);
  await game.seconds(3);
  expect((await zip(game)).mode).toBe('ride');
  await game.tap('Space');
  await game.seconds(0.2);
  expect((await zip(game)).mode).toBe('return');
  await game.seconds(3);
  const p = await game.player();
  const g = await page.evaluate(([x, z]) => (window as any).__silly.terrain.groundHeight(x, z) as number, [p.x, p.z] as const);
  expect(p.y - g).toBeLessThan(1.5);
  game.expectNoErrors();
});
