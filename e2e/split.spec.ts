import { expect, test } from '@playwright/test';
import { Game } from './game';

type Views = { split: boolean; slots: number[]; foci: { x: number; z: number }[] };
const views = (game: Game) =>
  game.page.evaluate((): Views => {
    const v = (window as any).__silly.views.views;
    return { split: v.split, slots: v.list.map((x: any) => x.slot), foci: v.list.map((x: any) => ({ x: x.focus.x, z: x.focus.z })) };
  });
const apart = async (game: Game, a: number, b: number) => {
  const [p, q] = [await game.player(a), await game.player(b)];
  return Math.hypot(p.x - q.x, p.z - q.z);
};

test('split screen: far apart, a view each that follows its animal; back together, one view again', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');

  // together: the one shared view
  await game.teleport(0, -6, 1, 6);
  await game.teleport(1, -3, 1, 6);
  await game.seconds(1);
  expect((await views(game)).split).toBe(false);
  await expect(page.getByTestId('split-frames')).toHaveCount(0);

  // player two runs off: the screen splits, two views side by side, each over its own animal
  await game.teleport(1, 34, 1, 6);
  await game.seconds(2, true);
  let v = await views(game);
  expect(v.split).toBe(true);
  expect(v.slots).toEqual([0, 1]);
  for (const [i, slot] of v.slots.entries()) {
    const p = await game.player(slot);
    expect(Math.hypot(v.foci[i].x - p.x, v.foci[i].z - p.z)).toBeLessThan(1.5);
  }
  await expect(page.getByTestId('split-frames')).toHaveAttribute('data-slots', '0,1');
  await expect(page.getByTestId('split-view-0')).toBeVisible();
  await expect(page.getByTestId('split-view-1')).toBeVisible();
  await game.screenshot('test-results/split-two.png');

  // nobody gets pulled back: with a view each, children can go where they like
  const far = await apart(game, 0, 1);
  await game.seconds(4);
  expect(await apart(game, 0, 1)).toBeGreaterThan(far - 1);
  expect((await views(game)).split).toBe(true);

  // a little closer, but not close enough: still split (it doesn't flick back and forth)
  await game.teleport(1, 14, 1, 6);
  await game.seconds(1.5);
  expect((await views(game)).split).toBe(true);

  // back together: one view
  await game.teleport(1, -2, 1, 6);
  await game.seconds(1.5, true);
  v = await views(game);
  expect(v.split).toBe(false);
  expect(v.slots).toEqual([]);
  await expect(page.getByTestId('split-frames')).toHaveCount(0);
  game.expectNoErrors();
});

test('split screen: three children get two views on top and one along the bottom; the buddy never gets one', async ({ page }) => {
  const game = new Game(page);
  await game.withPads();
  await game.open();
  await page.evaluate(() => (window as any).__addPad(0, 'standard', 'Pad'));
  await game.start();
  await game.join('kb2');
  await game.join('pad0');
  await game.teleport(0, -6, 1, 6);
  await game.teleport(1, 34, 1, 6);
  await game.teleport(2, 2, 1, 24);
  await game.seconds(2, true);
  const v = await views(game);
  expect(v.slots).toEqual([0, 1, 2]);
  for (const [i, slot] of v.slots.entries()) {
    const p = await game.player(slot);
    expect(Math.hypot(v.foci[i].x - p.x, v.foci[i].z - p.z)).toBeLessThan(1.5);
  }
  await expect(page.getByTestId('split-frames')).toHaveAttribute('data-slots', '0,1,2');
  const box = async (slot: number) => (await page.getByTestId(`split-view-${slot}`).boundingBox())!;
  const [a, b, c] = [await box(0), await box(1), await box(2)];
  expect(a.y).toBeCloseTo(b.y, 0);
  expect(c.y).toBeGreaterThan(a.y + a.height - 2);
  expect(c.width).toBeCloseTo(a.width + b.width, 0);
  await game.screenshot('test-results/split-three.png');

  // the two others leave: on their own with the buddy, far apart, it's one view
  await page.evaluate(() => {
    const g = (window as any).__silly.useGame.getState();
    g.leave(1);
    g.leave(2);
    g.addBuddy();
  });
  await game.seconds(1.5);
  const bot = await page.evaluate(() => [...(window as any).__silly.runtime.players.values()].find((p: any) => p.bot)?.slot as number | undefined);
  expect(bot).toBeDefined();
  await game.teleport(bot!, 34, 1, 6);
  await game.seconds(1);
  expect((await views(game)).split).toBe(false);
  game.expectNoErrors();
});

test('split screen off (grown-ups menu): one view, and friends are gently pulled back together', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await page.evaluate(() => (window as any).__silly.useSettings.getState().set({ split: false }));
  await game.start();
  await game.join('kb2');
  await game.teleport(0, -6, 1, 6);
  await game.teleport(1, 34, 1, 6);
  await game.seconds(1 / 60);
  const far = await apart(game, 0, 1);
  await game.seconds(4);
  expect((await views(game)).split).toBe(false);
  expect(await apart(game, 0, 1)).toBeLessThan(far - 6);
  game.expectNoErrors();
});
