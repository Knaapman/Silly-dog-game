import { expect, test } from '@playwright/test';
import { Game } from './game';

const guide = (game: Game) =>
  game.page.evaluate(() => {
    const g = (window as any).__silly.guide;
    return { sticker: g.useGuide.getState().sticker as string | null, arrow: g.guideDebug.arrows[0] as { visible: boolean; yaw: number }, beam: g.guideDebug.beams[0] as { visible: boolean; x: number; z: number } };
  });

test('sticker guide: pick a sticker in the album and an arrow shows the way there', async ({ page }) => {
  const game = new Game(page);
  await game.withPads();
  await game.open();
  await game.start();
  await game.teleport(0, -10, 1, 20);
  await game.seconds(0.5);

  // B opens the album; stickers that need a friend are marked
  await game.tap('KeyB');
  const album = page.getByTestId('sticker-album');
  await expect(album).toBeVisible();
  await expect(album.getByTitle('needs a friend')).toHaveCount(15);
  // a sticker with nowhere in particular to go (the party) just wiggles
  await album.getByTitle('party').click();
  await expect(album).toBeVisible();
  expect((await guide(game)).sticker).toBeNull();

  // from the party (row 4, third) up to the toilet sticker (row 1, sixth) and pick it
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowUp');
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowRight');
  await expect(album.locator('[data-focused="true"]')).toHaveAttribute('title', 'flush');
  await page.keyboard.press('Enter');
  await expect(album).toBeHidden();
  await game.seconds(0.3, true);
  await expect(page.getByTestId('guide-badge')).toBeVisible();
  // (Enter is also player two's join key: picking a sticker must not bring in a second player)
  expect(await game.state<number>('(g) => g.players.length')).toBe(1);
  let g = await guide(game);
  expect(g.sticker).toBe('flush');
  // the arrow points from the dog (-10, 20) to the toilet (4.8, -2): north-east
  expect(g.arrow.visible).toBe(true);
  expect(g.arrow.yaw).toBeCloseTo(Math.atan2(4.8 + 10, -2 - 20), 1);
  expect(g.beam).toMatchObject({ visible: true });
  expect(g.beam.x).toBeCloseTo(4.8, 1);
  await game.screenshot('test-results/guide.png');

  // once there, the arrow goes away (the beam stays)
  await game.teleport(0, 2, 1, 0);
  await game.seconds(0.5);
  g = await guide(game);
  expect(g.arrow.visible).toBe(false);
  expect(g.beam.visible).toBe(true);

  // earning the sticker ends the guide
  await page.evaluate(() => (window as any).__silly.useStickers.getState().earn('flush'));
  await game.seconds(0.2, true);
  expect((await guide(game)).sticker).toBeNull();
  await expect(page.getByTestId('guide-badge')).toBeHidden();

  // with a controller: Home for the album, D-pad to move, A to pick, B to close (pressing the
  // sticks in, as small hands do all the time while steering, doesn't open it)
  await page.evaluate(() => (window as any).__addPad(0, 'standard', 'Pad'));
  await game.pad(0, 10);
  await game.pad(0, 11);
  await game.seconds(0.2, true);
  await expect(album).toBeHidden();
  await game.pad(0, 16);
  await expect(album).toBeVisible();
  // (it opens on the first sticker still to find: tag a cat; one row down is the first poop)
  await game.pad(0, 13);
  await game.pad(0, 15);
  await game.pad(0, 15);
  await game.pad(0, 0);
  await expect(album).toBeHidden();
  expect((await guide(game)).sticker).toBe('toot');
  await game.pad(0, 16);
  await expect(album).toBeVisible();
  await game.pad(0, 1);
  await expect(album).toBeHidden();
  game.expectNoErrors();
});
