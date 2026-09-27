import { expect, test } from '@playwright/test';
import { Game } from './game';

test('the ground: physics, picture and placement agree, and round-number spots are still ground', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.seconds(0.5);

  // the physics heightfield and groundHeight() (which places trees, flowers, cats...) agree everywhere
  const { worst, misses, samples } = await page.evaluate(() => {
    const s = (window as any).__silly;
    const R = s.rapier;
    const rayY = (x: number, z: number) => {
      const hit = s.world.castRay(new R.Ray({ x, y: 40, z }, { x: 0, y: -1, z: 0 }), 60, true, undefined, undefined, undefined, undefined, (c: any) => c.shape.type === R.ShapeType.HeightField);
      return hit ? 40 - hit.timeOfImpact : NaN;
    };
    let worst = 0;
    let misses = 0;
    let samples = 0;
    for (let x = -58.013; x <= 58; x += 4.3)
      for (let z = -57.017; z <= 58; z += 3.9) {
        const r = rayY(x, z);
        if (Number.isNaN(r)) {
          misses += 1;
          continue;
        }
        worst = Math.max(worst, Math.abs(r - s.terrain.groundHeight(x, z)));
        samples += 1;
      }
    return { worst, misses, samples };
  });
  expect(samples).toBeGreaterThan(600);
  expect(misses).toBe(0);
  expect(worst).toBeLessThan(0.06); // the steepest hill slope, sampled every half metre

  // a vertical ray exactly on a grid line slips through the heightfield: the animal's ground
  // probe tries again a little to the side, so standing on a round-number spot (every test
  // teleport) still counts as standing on the ground: you can jump from it
  await game.teleport(0, -26, 4, -10);
  await game.seconds(1.2);
  const standing = await game.player(0);
  expect(standing.y).toBeGreaterThan(1.1); // on the hill's slope, not at ground level
  expect(standing.y).toBeLessThan(1.8);
  await game.tap('Space');
  await game.seconds(0.3);
  expect((await game.player(0)).y).toBeGreaterThan(standing.y + 0.5);
  game.expectNoErrors();
});
