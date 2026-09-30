import { expect, test } from '@playwright/test';
import { Game } from './game';

// The treasure hunt: five treasures hidden in five different areas. Find them all: a party, a
// gem in the chest by the plaza, and five new ones somewhere else.

const hunt = (game: Game) => game.page.evaluate(() => {
  const h = (window as any).__silly.useHunt.getState();
  return { round: h.round as number, found: [...h.found] as boolean[], chest: h.chest as number, spots: h.spots.map((s: number[]) => [...s]) as number[][] };
});
const stickers = (game: Game) => game.page.evaluate(() => [...(window as any).__silly.useStickers.getState().got] as string[]);

test('find the five treasures: a party, a gem in the chest, and five new ones hidden', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');
  const h0 = await hunt(game);
  expect(h0.found).toEqual([false, false, false, false, false]);
  await expect(page.getByTestId('treasure-slots').locator('[data-got="true"]')).toHaveCount(0);

  // the dog barks near the first treasure (sniff!), then goes and finds it
  await game.teleport(0, h0.spots[0][0] - 5, 1, h0.spots[0][1]);
  await game.seconds(1);
  await game.tap('KeyR');
  await game.seconds(0.5, true);
  await game.teleport(0, h0.spots[0][0], 1, h0.spots[0][1]);
  await game.seconds(0.6, true);
  expect((await hunt(game)).found[0]).toBe(true);
  expect(await stickers(game)).toEqual(expect.arrayContaining(['treasure', 'sniff']));
  await expect(page.getByTestId('treasure-slots').locator('[data-got="true"]')).toHaveCount(1);

  // player two finds the rest
  for (let i = 1; i < 5; i += 1) {
    await game.teleport(1, h0.spots[i][0], 1, h0.spots[i][1]);
    await game.seconds(0.6);
  }
  const done = await hunt(game);
  expect(done.found.every(Boolean)).toBe(true);
  expect(done.chest).toBe(h0.chest + 1);
  expect(await stickers(game)).toContain('hunt');
  expect(await game.state<number>('(g) => g.partyUntil')).toBeGreaterThan(0);

  // after the party: a new round, somewhere else
  await game.seconds(9);
  const next = await hunt(game);
  expect(next.round).toBe(h0.round + 1);
  expect(next.found).toEqual([false, false, false, false, false]);
  expect(next.spots).not.toEqual(h0.spots);
  await game.teleport(0, -18, 1, 9);
  await game.seconds(1);
  await game.screenshot('test-results/treasure-chest.png');
  game.expectNoErrors();
});

test('every hiding place is open ground an animal can stand on', async ({ page }) => {
  test.setTimeout(240_000);
  const game = new Game(page);
  await game.open();
  await game.start();
  const spots = await page.evaluate(() => (window as any).__silly.layout.TREASURE_SPOTS.map((s: any) => s.at) as [number, number][]);
  const bad: string[] = [];
  for (const [x, z] of spots) {
    await game.teleport(0, x, 1, z);
    await game.seconds(1.2);
    const p = await game.player();
    const g = await page.evaluate(([x, z]) => (window as any).__silly.terrain.groundHeight(x, z) as number, [x, z] as const);
    // pushed off the spot by something solid, or standing on top of something
    if (Math.hypot(p.x - x, p.z - z) > 1 || p.y - g > 1.2) bad.push(`${x},${z}: ended at ${p.x.toFixed(1)},${(p.y - g).toFixed(1)},${p.z.toFixed(1)}`);
  }
  // and the harder ones, up high or across the water (the mushroom cap bounces you: just stay on it)
  const high = await page.evaluate(() => (window as any).__silly.layout.TREASURE_HIGH_SPOTS as { at: [number, number]; y: number }[]);
  for (const { at: [x, z], y } of high) {
    await page.evaluate(([x, y, z]) => {
      const b = (window as any).__silly.runtime.players.get(0).getBody();
      b.setTranslation({ x, y: y + 0.6, z }, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }, [x, y, z] as const);
    await game.seconds(1.2);
    const p = await game.player();
    if (Math.hypot(p.x - x, p.z - z) > 1 || p.y < y) bad.push(`high ${x},${z}: ended at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}`);
  }
  expect(bad, bad.join('\n')).toEqual([]);
  game.expectNoErrors();
});

test('every other round, one treasure is somewhere harder: up there it can be found too', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await page.evaluate(() => (window as any).__silly.useHunt.getState().setRound(1));
  const h = await hunt(game);
  const i = h.spots.findIndex((s) => s.length === 3);
  expect(i).toBeGreaterThanOrEqual(0);
  const [x, z, y] = h.spots[i] as unknown as [number, number, number];
  // walking about underneath doesn't find it...
  await game.teleport(0, x + 0.5, 1, z);
  await game.seconds(0.8);
  if (y > 2) expect((await hunt(game)).found[i]).toBe(false);
  // ...getting up there does
  await page.evaluate(([x, y, z]) => {
    const b = (window as any).__silly.runtime.players.get(0).getBody();
    b.setTranslation({ x, y: y + 0.6, z }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }, [x, y, z] as const);
  await game.seconds(0.8, true);
  expect((await hunt(game)).found[i]).toBe(true);
  game.expectNoErrors();
});
