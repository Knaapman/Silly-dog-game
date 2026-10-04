import { expect, test } from '@playwright/test';
import { Game } from './game';

const stickers = (game: Game) => game.page.evaluate(() => (window as any).__silly.useStickers.getState().got as string[]);

test.describe('eating and pooping', () => {
  test('food fills the belly, every bite comes out as a poop, an empty tummy toots', async ({ page }) => {
    const game = new Game(page);
    await game.open();
    await game.start();

    // the dog bowl next to the spawn: 4 bites
    await game.hopTo(0, [-11, 11], [-11, 8.8]);
    for (let i = 0; i < 4; i += 1) {
      await game.tap('KeyQ');
      await game.seconds(0.2);
    }
    expect((await game.player()).belly).toBe(4);

    // the plaza is not grass: licking the empty bowl area eats nothing
    await game.tap('KeyQ');
    await game.seconds(0.2);
    expect((await game.player()).belly).toBe(4);

    // grass anywhere: the 5th bite; then a burp keeps it at 5
    await game.hopTo(0, [12, -6], [12, -4]);
    await game.tap('KeyQ');
    await game.seconds(0.2);
    expect((await game.player()).belly).toBe(5);
    await game.tap('KeyQ');
    await game.seconds(0.2);
    expect((await game.player()).belly).toBe(5);

    // five quick presses: five poops, empty tummy
    for (let i = 0; i < 5; i += 1) await game.tap('KeyG');
    await game.seconds(3);
    expect((await game.poopStats()).poops).toBe(5);
    expect((await game.player()).belly).toBe(0);
    expect(await stickers(game)).toEqual(expect.arrayContaining(['full', 'poop']));

    // empty: a toot hops a little and makes no poop
    const y0 = (await game.player()).y;
    await game.tap('KeyG');
    expect(await game.maxY(0, 0.6)).toBeGreaterThan(y0 + 0.15);
    expect((await game.poopStats()).poops).toBe(5);

    // tidy up the park: all gone
    await page.evaluate(() => (window as any).__silly.useGame.getState().resetPark());
    await game.seconds(0.5);
    expect(await game.poopStats()).toMatchObject({ poops: 0, flowers: 0 });
    game.expectNoErrors();
  });

  test('running over a poop makes you slip, licking one is "bleh"', async ({ page }) => {
    const game = new Game(page);
    await game.open();
    await game.start();
    await page.evaluate(() => (window as any).__silly.runtime.spawners.poop({ x: 13, y: 0.4, z: -6 }, { x: 0, y: 0, z: 0 }, 1, false));
    await game.seconds(1.5);

    // lick it: flicked away, never carried, not eaten
    await game.hopTo(0, [13, -2.5], [13, -4.75]);
    const before = (await game.props('poop'))[0];
    await game.tap('KeyQ');
    await game.seconds(0.5);
    const after = (await game.props('poop'))[0];
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(0.5);
    expect((await game.player()).belly).toBe(0);

    // run straight over it: whoops!
    const p = (await game.props('poop'))[0];
    await game.hopTo(0, [p.x - 7, p.z], [p.x - 4, p.z]);
    await page.keyboard.down('KeyD');
    const top = await game.maxY(0, 1.5);
    await page.keyboard.up('KeyD');
    expect((await game.poopStats()).poops).toBe(0);
    expect(top).toBeGreaterThan(1.2);
    game.expectNoErrors();
  });

  test('old poops grow into flowers', async ({ page }) => {
    const game = new Game(page);
    await game.open();
    await game.start();
    await page.evaluate(() => (window as any).__silly.runtime.spawners.poop({ x: 12, y: 0.4, z: -4 }, { x: 0, y: 0, z: 0 }, 1, false));
    await game.seconds(34);
    expect(await game.poopStats()).toMatchObject({ poops: 1, flowers: 0 });
    await game.seconds(2);
    expect(await game.poopStats()).toMatchObject({ poops: 0, flowers: 1 });
    expect(await stickers(game)).toContain('flower');
  });
});
