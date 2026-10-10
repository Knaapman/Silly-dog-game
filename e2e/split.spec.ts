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

test('split screen: an arrow at the edge of each view points the way to the friend; together again, no arrows', async ({ page }) => {
  const game = new Game(page);
  await game.open(1, { off: ['cats', 'birds'] });
  await game.start();
  await game.join('kb2');
  const arrow = (view: number, friend: number) => page.getByTestId(`friend-arrow-${view}-${friend}`);
  // together: everybody's on screen, so no arrows
  await game.teleport(0, -6, 1, 6);
  await game.teleport(1, -3, 1, 6);
  await game.seconds(1, true);
  await expect(arrow(-1, 0)).toHaveAttribute('data-visible', 'false');
  await expect(arrow(-1, 1)).toHaveAttribute('data-visible', 'false');
  // far apart: a view each, and in each an arrow pointing to the other child
  await game.teleport(1, 34, 1, 6);
  await game.seconds(2, true);
  expect((await views(game)).split).toBe(true);
  await expect(arrow(0, 1)).toHaveAttribute('data-visible', 'true');
  await expect(arrow(1, 0)).toHaveAttribute('data-visible', 'true');
  // (the two point opposite ways, and each sits on the side of its view the friend is on)
  const angle = async (view: number, friend: number) => Number(await arrow(view, friend).getAttribute('data-angle'));
  const [a, b] = [await angle(0, 1), await angle(1, 0)];
  expect(Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))).toBeGreaterThan(Math.PI - 0.6);
  const W = page.viewportSize()!.width;
  const box0 = (await arrow(0, 1).boundingBox())!;
  const box1 = (await arrow(1, 0).boundingBox())!;
  expect(box0.x + box0.width / 2).toBeLessThan(W / 2); // in the left view
  expect(box1.x + box1.width / 2).toBeGreaterThan(W / 2); // in the right view
  expect(Math.cos(await angle(0, 1))).toBeGreaterThan(0.3); // the friend is off to the east: pointing right
  expect(Math.cos(await angle(1, 0))).toBeLessThan(-0.3); // and back west: pointing left
  await game.screenshot('test-results/friend-arrows.png');
  // back together: one view, no arrows
  await game.teleport(1, -3, 1, 6);
  await game.seconds(2, true);
  expect((await views(game)).split).toBe(false);
  await expect(arrow(-1, 1)).toHaveAttribute('data-visible', 'false');
  game.expectNoErrors();
});
