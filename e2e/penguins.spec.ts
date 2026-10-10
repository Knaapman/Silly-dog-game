import { expect, test } from '@playwright/test';
import { Game } from './game';

// The penguin shy: throw snowballs at the five penguins on the counter (from a few steps away) and
// each one tumbles off backwards; all five off is a cheer and a sticker, then they hop back up. A
// bump up close only makes one wobble.

type P = { down: boolean };
const shy = (game: Game) =>
  game.page.evaluate(() => {
    const s = (window as any).__silly.runtime.debugInfo.penguins;
    return { list: s.list.map((p: P) => ({ down: p.down })) as P[], hits: s.hits as number, wobbles: s.wobbles as number, rounds: s.rounds as number };
  });
const layout = (game: Game) => game.page.evaluate(() => (window as any).__silly.layout.PENGUIN_SHY as { center: [number, number]; count: number; spacing: number });
const stickers = (game: Game) => game.page.evaluate(() => (window as any).__silly.useStickers.getState().got as string[]);

/** A snowball from the pile, straight into the mouth (we're facing the counter already). */
async function snowballInMouth(game: Game) {
  await game.page.evaluate(() => {
    const s = (window as any).__silly;
    const me = s.runtime.players.get(0).position;
    const ball = [...s.runtime.props.values()].find((p: any) => p.kind === 'throwball' && p.enabled && p.heldBy == null);
    ball.getBody().setTranslation({ x: me.x + 0.9, y: me.y + 0.3, z: me.z }, true);
    ball.getBody().setLinvel({ x: 0, y: 0, z: 0 }, true);
  });
  await game.seconds(1 / 60);
  await game.tap('KeyQ');
  await game.seconds(0.15);
}

test('snowballs from a few steps away knock the penguins off one by one: all five is a cheer (a sticker), and up they hop again', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const S = await layout(game);
  const [cx, cz] = S.center;
  for (let i = 0; i < S.count; i += 1) {
    const z = cz + (i - (S.count - 1) / 2) * S.spacing;
    // stand six steps back, facing the counter (east), and throw
    await game.hopTo(0, [cx - 8, z], [cx - 6, z]);
    await snowballInMouth(game);
    await game.tap('KeyQ');
    for (let k = 0; k < 20 && !(await shy(game)).list[i].down; k += 1) await game.seconds(0.05);
    expect((await shy(game)).list[i].down).toBe(true);
    if (i === 2) {
      await game.seconds(0.3, true);
      await game.screenshot('test-results/penguins.png');
    }
  }
  let s = await shy(game);
  expect(s.hits).toBe(S.count);
  expect(s.rounds).toBe(1);
  expect(await stickers(game)).toContain('penguins');
  // a few seconds later they're all back up
  await game.seconds(4.6);
  s = await shy(game);
  expect(s.list.every((p) => !p.down)).toBe(true);

  // walk right up and bump one: it only wobbles
  await game.hopTo(0, [cx - 3.2, cz], [cx - 1.3, cz]);
  await game.tap('KeyE');
  await game.seconds(0.3);
  s = await shy(game);
  expect(s.wobbles).toBeGreaterThanOrEqual(1);
  expect(s.list.every((p) => !p.down)).toBe(true);
  game.expectNoErrors();
});

test('playing alone, the buddy throws at the penguins too, and leaves the last one for the child', async ({ page }) => {
  const game = new Game(page);
  await game.open(1, { off: ['cats', 'birds'] });
  await game.start();
  await page.evaluate(() => (window as any).__silly.useGame.getState().addBuddy());
  await game.seconds(1);
  const S = await layout(game);
  const [cx, cz] = S.center;
  // one throw from the child, then they just watch (the buddy out of the tongue's way behind them)
  const z = cz + S.spacing * 2;
  await game.hopTo(0, [cx - 8, z], [cx - 6, z]);
  await game.teleport(1, cx - 10, 1, cz - 3);
  await snowballInMouth(game);
  await game.tap('KeyQ');
  await game.seconds(14);
  const s = await shy(game);
  const buddyThrows = await page.evaluate(() => (window as any).__silly.runtime.debugInfo.snowballFight.buddyThrows as number);
  expect(s.hits).toBeGreaterThanOrEqual(3);
  // the last one standing is the child's to knock off
  expect(s.list.filter((p) => !p.down).length).toBe(1);
  expect(s.rounds).toBe(0);
  expect(buddyThrows).toBeGreaterThanOrEqual(2);
  game.expectNoErrors();
});
