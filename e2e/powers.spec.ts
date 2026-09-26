import { expect, test } from '@playwright/test';
import { Game } from './game';

test.describe('magic food', () => {
  test('the red spotty mushroom makes you a giant', async ({ page }) => {
    const game = new Game(page);
    await game.open();
    await game.start();
    await game.hopTo(0, [-6.5, -2], [-9.5, -2]); // facing the magic table
    await game.tap('KeyQ');
    await game.seconds(2);
    const p = await game.player();
    expect(p.power).toBe('giant');
    expect(p.size).toBeGreaterThan(2);
    expect(p.y).toBeGreaterThan(0.9); // the bigger ball stands on the ground, not in it
    game.expectNoErrors();
  });

  test('beans turn the poop button into a rocket', async ({ page }) => {
    const game = new Game(page);
    await game.open();
    await game.start();
    await page.evaluate(() => (window as any).__silly.runtime.players.get(0).powerUp('beans'));
    await game.teleport(0, 18, 1, 8);
    await game.seconds(1);
    const y0 = (await game.player()).y;
    let top = y0;
    for (let i = 0; i < 6; i += 1) {
      await game.tap('KeyG');
      top = Math.max(top, await game.maxY(0, 0.3));
    }
    expect(top).toBeGreaterThan(y0 + 5); // several toots in a row keep climbing
    expect((await game.poopStats()).poops).toBe(0);
    game.expectNoErrors();
  });

  test('chili: the noise button breathes fire and a friend jumps', async ({ page }) => {
    const game = new Game(page);
    await game.open();
    await game.start();
    await game.join('kb2');
    await page.evaluate(() => (window as any).__silly.runtime.players.get(0).powerUp('chili'));
    await game.hopTo(0, [20, 3], [20, 6]); // lands facing +z
    await game.teleport(1, 20, 1, 9); // friend 3 m in front
    await game.seconds(1);
    const y0 = (await game.player(1)).y;
    await game.tap('KeyR');
    expect(await game.maxY(1, 1)).toBeGreaterThan(y0 + 1);
    game.expectNoErrors();
  });
});
