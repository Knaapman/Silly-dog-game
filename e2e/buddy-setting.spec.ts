import { expect, test } from '@playwright/test';
import { Game } from './game';

// The grown-ups' "What the buddy does": just follows / joins in (rides, kites, pushes) / helps
// (with the games too). Here: a kite (joining in) and tickling the brontosaurus (helping).

const kites = (game: Game) => game.page.evaluate(() => ((window as any).__silly.runtime.debugInfo.kites.list as { holder: number | null }[]).map((k) => k.holder));
const sneezes = (game: Game) => game.page.evaluate(() => (window as any).__silly.runtime.debugInfo.bronto.sneezes as number);
const setHelp = (game: Game, v: 0 | 1 | 2) => game.page.evaluate((v) => (window as any).__silly.useSettings.getState().set({ buddyHelp: v }), v);

/** The child picks up kite 0 (from the north, a lick), with the buddy close by. */
async function kiteUp(game: Game) {
  const spool = (await game.props('kite'))[0];
  await game.hopTo(0, [spool.x, spool.z - 3.2], [spool.x, spool.z - 1.2]);
  // (the buddy behind the child, not where the tongue would get it instead of the spool)
  await game.teleport(1, spool.x - 2, 3, spool.z - 5);
  await game.tap('KeyQ');
  await game.seconds(0.2);
  expect((await kites(game))[0]).toBe(0);
}

/** A tickle every two seconds from the child: never a sneeze on their own. */
async function slowTickles(game: Game) {
  const [bx, bz] = await game.page.evaluate(() => (window as any).__silly.layout.BRONTO.center as [number, number]);
  await game.teleport(1, bx - 4, 0.5, bz + 6);
  await game.hopTo(0, [bx + 0.5, bz + 5.5], [bx + 0.5, bz + 3]);
  for (let k = 0; k < 5; k += 1) {
    await game.tap('KeyE');
    await game.seconds(2);
  }
}

test('"joins in": the buddy flies a kite with you, but leaves the brontosaurus to you', async ({ page }) => {
  test.setTimeout(120_000);
  const game = new Game(page);
  await game.open(1, { off: ['cats', 'birds'] });
  await game.start();
  await page.evaluate(() => (window as any).__silly.useGame.getState().addBuddy());
  await setHelp(game, 1);
  await game.seconds(1);
  await slowTickles(game);
  expect(await sneezes(game)).toBe(0);
  await kiteUp(game);
  let theirs = false;
  for (let k = 0; k < 30 && !theirs; k += 1) {
    await game.seconds(0.5);
    theirs = (await kites(game)).includes(1);
  }
  expect(theirs).toBe(true);
  game.expectNoErrors();
});

test('"just follows": no kite for the buddy either', async ({ page }) => {
  const game = new Game(page);
  await game.open(1, { off: ['cats', 'birds'] });
  await game.start();
  await page.evaluate(() => (window as any).__silly.useGame.getState().addBuddy());
  await setHelp(game, 0);
  await game.seconds(1);
  await kiteUp(game);
  await game.seconds(10);
  expect((await kites(game)).includes(1)).toBe(false);
  // (and it's still there, keeping the child company)
  const [a, b] = [await game.player(0), await game.player(1)];
  expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(8);
  game.expectNoErrors();
});
