import { expect, test } from '@playwright/test';
import { Game } from './game';

// The farm tractor: walk up to the seat, push the stick where you want to go. A friend rides in
// the trailer. Walls stop it (it never drives through anything). Jump to hop out.

const tractor = (game: Game) =>
  game.page.evaluate(() => {
    const t = (window as any).__silly.runtime.debugInfo.tractor;
    return { x: t.x as number, z: t.z as number, yaw: t.yaw as number, speed: t.speed as number, driver: t.driver as number | null, tx: t.tx as number, tz: t.tz as number };
  });
const stickers = (game: Game) => game.page.evaluate(() => [...(window as any).__silly.useStickers.getState().got] as string[]);

test('drive the tractor with a friend in the trailer; the barn wall stops it; jump out', async ({ page }) => {
  test.setTimeout(120_000);
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');
  const t0 = await tractor(game);
  expect(t0.driver).toBeNull();

  // walk up to the seat (just behind the middle, on the side)
  await game.teleport(0, t0.x - Math.sin(t0.yaw) * 0.55, 1, t0.z - Math.cos(t0.yaw) * 0.55 + 1.3);
  await game.seconds(0.5);
  expect((await tractor(game)).driver).toBe(0);

  // a friend climbs in the trailer
  await page.evaluate(([x, z]) => {
    const b = (window as any).__silly.runtime.players.get(1).getBody();
    b.setTranslation({ x, y: (window as any).__silly.terrain.groundHeight(x, z) + 1.5, z }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }, [t0.tx, t0.tz] as const);
  await game.seconds(1);

  // stick up: it turns north and trundles off, the driver and the friend come along
  await game.hold('KeyW', 2.2);
  await game.seconds(0.6);
  const t1 = await tractor(game);
  expect(t0.z - t1.z).toBeGreaterThan(5);
  const driver = await game.player(0);
  expect(Math.hypot(driver.x - t1.x, driver.z - t1.z)).toBeLessThan(1.5);
  expect(driver.y).toBeGreaterThan(1.3);
  const friend = await game.player(1);
  expect(Math.hypot(friend.x - t1.tx, friend.z - t1.tz)).toBeLessThan(1.6);
  expect(await stickers(game)).toContain('trailer');

  // stick left: west, straight at the barn. The wall stops it: it never goes through
  const barn = await page.evaluate(() => (window as any).__silly.layout.BARN);
  const wall = barn.center[0] + barn.width / 2;
  await game.hold('KeyA', 5);
  const t2 = await tractor(game);
  expect(t2.x).toBeLessThan(t1.x - 2);
  expect(t2.x).toBeGreaterThan(wall);
  expect(t2.speed).toBe(0);
  expect(await stickers(game)).toContain('tractor');
  await game.screenshot('test-results/tractor.png');

  // jump: hop out beside it
  await game.tap('Space');
  await game.seconds(1.5);
  expect((await tractor(game)).driver).toBeNull();
  const out = await game.player(0);
  expect(out.y - (await page.evaluate(([x, z]) => (window as any).__silly.terrain.groundHeight(x, z) as number, [out.x, out.z] as const))).toBeLessThan(1);
  game.expectNoErrors();
});

test('nothing small gets in under the parked tractor or its trailer (a chicken once wedged itself under the hood)', async ({ page }) => {
  const game = new Game(page);
  await game.open(1, { off: ['cats', 'birds', 'chickens'] });
  await game.start();
  // from 3 m out on every side, chicken height off the ground, straight at the middle: something solid on the way
  const misses = await page.evaluate(() => {
    const s = (window as any).__silly;
    const t = s.runtime.debugInfo.tractor;
    const out: string[] = [];
    for (const [x, z, name] of [
      [t.x, t.z, 'tractor'],
      [t.tx, t.tz, 'trailer']
    ] as [number, number, string][])
      for (let a = 0; a < 8; a += 1) {
        const dx = Math.sin((a * Math.PI) / 4);
        const dz = Math.cos((a * Math.PI) / 4);
        for (const h of [0.2, 0.35]) {
          const ox = x + dx * 3;
          const oz = z + dz * 3;
          const ray = new s.rapier.Ray({ x: ox, y: s.terrain.groundHeight(ox, oz) + h, z: oz }, { x: -dx, y: 0, z: -dz });
          const hit = s.world.castRay(ray, 3, true, s.rapier.QueryFilterFlags.EXCLUDE_SENSORS | s.rapier.QueryFilterFlags.EXCLUDE_DYNAMIC, undefined, undefined, undefined, (c: any) => c.shape.type !== s.rapier.ShapeType.HeightField);
          if (!hit) out.push(`${name} from ${a * 45}° at ${h} m`);
        }
      }
    return out;
  });
  expect(misses).toEqual([]);
  game.expectNoErrors();
});
