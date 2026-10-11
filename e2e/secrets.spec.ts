import { expect, test } from '@playwright/test';
import { Game } from './game';

// The secrets: nothing points the way to them, and their stickers are a "?" until found. A whale
// out by the buoys, a frog on a lily pad, fireworks on the summit, and a nap with a butterfly.

const stickers = (game: Game) => game.page.evaluate(() => [...(window as any).__silly.useStickers.getState().got] as string[]);
const secrets = <T,>(game: Game, fn: string) => game.page.evaluate(`(${fn})(window.__silly.runtime.debugInfo.secrets)`) as Promise<T>;

async function park(page: import('@playwright/test').Page) {
  const game = new Game(page);
  await game.open(1, { off: ['cats', 'birds'], on: ['secrets'] });
  await game.start();
  return game;
}

test('the whale: swim right out to the buoys and it comes up under you and blows you back to the beach', async ({ page }) => {
  const game = await park(page);
  await game.teleport(0, 20, 1, 62);
  await game.seconds(0.5);
  expect(await page.evaluate(() => (window as any).__silly.runtime.players.get(0).swimming)).toBe(true);
  expect(await secrets<string>(game, '(s) => s.whale.mode')).toBe('rise');
  // up it comes, and whoosh
  await game.seconds(1.5);
  expect(await secrets<number>(game, '(s) => s.whale.blows')).toBe(1);
  expect((await game.player(0)).launched).toBe(true);
  await game.seconds(0.4, true);
  await game.screenshot('test-results/secret-whale.png');
  // all the way back to dry sand
  await game.seconds(5);
  const p = await game.player(0);
  expect(p.z).toBeLessThan(57);
  expect(await page.evaluate(() => (window as any).__silly.runtime.players.get(0).swimming)).toBe(false);
  expect(await stickers(game)).toContain('whale');
  // and back down it goes, for a while
  await game.seconds(3);
  expect(await secrets<string>(game, '(s) => s.whale.mode')).toBe('gone');
  game.expectNoErrors();
});

test('the frog: lick the frog on the lily pad and it rides on your head for a while, then hops home', async ({ page }) => {
  test.setTimeout(120_000);
  const game = await park(page);
  const pad = await page.evaluate(() => {
    const c = (window as any).__silly.layout.LAKE.center;
    return [c[0] + 5, c[1] - 4] as [number, number];
  });
  // swim up to it from the south (facing it), and lick
  await game.teleport(0, pad[0], 1, pad[1] + 1.6);
  await game.seconds(0.5);
  await game.hold('KeyW', 0.12);
  await game.tap('KeyQ');
  await game.seconds(0.6);
  expect(await secrets<number | null>(game, '(s) => s.frog.rider')).toBe(0);
  expect(await stickers(game)).toContain('frog');
  // up on our head, wherever we go
  await game.hold('KeyS', 1.5);
  await game.seconds(0.5);
  const at = await page.evaluate(() => {
    const s = (window as any).__silly;
    const p = s.runtime.players.get(0).position;
    return { mode: s.runtime.debugInfo.secrets.frog.mode, y: p.y };
  });
  expect(at.mode).toBe('ride');
  await game.seconds(0.2, true);
  await game.screenshot('test-results/secret-frog.png');
  // after a while it hops back home to its pad (and can be licked again)
  await game.seconds(31);
  expect(await secrets<string>(game, '(s) => s.frog.mode')).toBe('pad');
  expect(await secrets<number | null>(game, '(s) => s.frog.rider')).toBeNull();
  game.expectNoErrors();
});

test('the summit: stand by the flag on the very top for fireworks', async ({ page }) => {
  const game = await park(page);
  const [fx, fz] = await page.evaluate(() => (window as any).__silly.layout.SUMMIT_FLAG as [number, number]);
  const top = await page.evaluate(([x, z]) => (window as any).__silly.terrain.groundHeight(x, z), [fx, fz]);
  await game.teleport(0, fx + 1, top + 1, fz + 1);
  await game.seconds(1.5);
  expect(await secrets<number>(game, '(s) => s.summit.parties')).toBe(1);
  expect(await stickers(game)).toContain('summit');
  // (not over and over while you stand there)
  await game.seconds(3);
  expect(await secrets<number>(game, '(s) => s.summit.parties')).toBe(1);
  game.expectNoErrors();
});

test('the nap: stand still for a while and your animal dozes off, and a butterfly comes to sit on its head', async ({ page }) => {
  const game = await park(page);
  await game.teleport(0, 12, 1, -4);
  await game.seconds(4);
  expect(await secrets<string>(game, '(s) => s.naps.get(0).butterfly')).toBe('none');
  await game.seconds(8);
  expect(await secrets<string>(game, '(s) => s.naps.get(0).butterfly')).toBe('on');
  expect(await stickers(game)).toContain('nap');
  await game.seconds(0.2, true);
  await game.screenshot('test-results/secret-nap.png');
  // up and off: the butterfly flutters away
  await game.hold('KeyD', 0.3);
  expect(await secrets<string>(game, '(s) => s.naps.get(0).butterfly')).toBe('out');
  game.expectNoErrors();
});

test('in the album the secrets are a "?" until found (and there is no help to find them)', async ({ page }) => {
  const game = await park(page);
  await page.evaluate(() => (window as any).__silly.useGame.getState().setAlbumOpen(true));
  await game.seconds(0.2, true);
  const whale = page.locator('[data-sticker="whale"]').first();
  await expect(whale).toHaveAttribute('data-secret', '');
  await expect(whale).toContainText('❓');
  await expect(whale).not.toContainText('🐋');
  // picking it: no guide to it
  await whale.click();
  expect(await page.evaluate(() => (window as any).__silly.guide.useGuide.getState().sticker ?? null)).toBeNull();
  // found: the real sticker
  await page.evaluate(() => (window as any).__silly.useStickers.getState().earn('whale'));
  await page.evaluate(() => (window as any).__silly.useGame.getState().setAlbumOpen(true));
  await game.seconds(0.2, true);
  await expect(page.locator('[data-sticker="whale"]').first()).toContainText('🐋');
  game.expectNoErrors();
});
