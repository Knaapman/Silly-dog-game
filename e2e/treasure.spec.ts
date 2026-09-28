import { expect, test } from '@playwright/test';
import { Game } from './game';

// The treasure hunt: five treasures hidden in five different areas. Find them all: a party, a
// gem in the chest by the plaza, and five new ones somewhere else.

const hunt = (game: Game) => game.page.evaluate(() => {
  const h = (window as any).__silly.useHunt.getState();
  return { round: h.round as number, found: [...h.found] as boolean[], chest: h.chest as number, spots: h.spots.map((s: number[]) => [...s]) as [number, number][] };
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
  expect(bad, bad.join('\n')).toEqual([]);
  game.expectNoErrors();
});
