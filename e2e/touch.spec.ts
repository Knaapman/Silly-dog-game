import { expect, test } from '@playwright/test';
import { Game } from './game';

test.use({ hasTouch: true });

test('tablet: touch to play, drag to move, tap the big buttons (even while moving)', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  // a touch anywhere switches the game to touch controls; the big play button starts
  await page.touchscreen.tap(480, 500);
  await page.getByLabel('Play').tap({ force: true }); // (it never stops breathing, so don't wait for it to be still)
  await game.seconds(1.5, true);
  expect(await game.state<string>('(g) => g.players[0]?.source')).toBe('touch');
  await expect(page.getByLabel('Jump')).toBeVisible();
  await game.teleport(0, 18, 1, 8);
  await game.seconds(0.5);

  // thumb down on the left half and drag right: the animal walks right
  const x0 = (await game.player(0)).x;
  await page.mouse.move(200, 380);
  await page.mouse.down();
  await page.mouse.move(260, 380, { steps: 3 });
  await game.seconds(1);
  expect((await game.player(0)).x - x0).toBeGreaterThan(4);

  // a second finger on jump while the first still holds the stick
  const box = (await page.getByLabel('Jump').boundingBox())!;
  const jumpAt = await page.evaluate(() => (window as any).__silly.runtime.players.get(0).jumpedAt);
  await page.getByLabel('Jump').dispatchEvent('pointerdown', { pointerId: 7, isPrimary: false, clientX: box.x + 10, clientY: box.y + 10 });
  await game.seconds(0.1);
  await page.getByLabel('Jump').dispatchEvent('pointerup', { pointerId: 7, isPrimary: false });
  await game.seconds(0.3, true);
  expect(await page.evaluate(() => (window as any).__silly.runtime.players.get(0).jumpedAt)).not.toBe(jumpAt);
  await page.screenshot({ path: 'test-results/touch.png' });
  await page.mouse.up();
  await game.seconds(0.8);

  // the poop button (empty tummy: a toot)
  await page.getByLabel('Poop').dispatchEvent('pointerdown', { pointerId: 8 });
  await game.seconds(0.1);
  await page.getByLabel('Poop').dispatchEvent('pointerup', { pointerId: 8 });
  await game.seconds(0.2);
  expect(await page.evaluate(() => (window as any).__silly.useStickers.getState().got)).toContain('toot');

  // the hat button
  await page.getByLabel('Change hat').dispatchEvent('pointerdown', { pointerId: 9 });
  await game.seconds(0.1);
  await page.getByLabel('Change hat').dispatchEvent('pointerup', { pointerId: 9 });
  await game.seconds(0.1);
  expect(await game.state<string>('(g) => g.players[0].hat')).toBe('party');
  game.expectNoErrors();
});
