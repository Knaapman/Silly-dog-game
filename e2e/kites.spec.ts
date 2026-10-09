import { expect, test } from '@playwright/test';
import { Game } from './game';

// Kites on the hill: lick a spool to pick it up and run, and the kite climbs on its string; with it
// up high, a jump floats down slowly. A kite way up is a sticker; two friends' kites up high together,
// a friend sticker. A spool left lying far away goes home after a while.

type K = { holder: number | null; h: number };
const kites = (game: Game) =>
  game.page.evaluate(() => {
    const s = (window as any).__silly.runtime.debugInfo.kites;
    return { list: s.list.map((k: K) => ({ holder: k.holder, h: k.h })) as K[], together: s.together as number, homes: s.homes as number };
  });
const hill = (game: Game) => game.page.evaluate(() => (window as any).__silly.layout.KITES.hill as [number, number]);
const stickers = (game: Game) => game.page.evaluate(() => (window as any).__silly.useStickers.getState().got as string[]);

/** Pick up spool `i`: hop up to it from the north and lick. */
async function pickUp(game: Game, i: number, slot = 0) {
  const spool = (await game.props('kite'))[i];
  await game.hopTo(slot, [spool.x, spool.z - 3.2], [spool.x, spool.z - 1.2]);
  await game.tap(slot ? 'ControlRight' : 'KeyQ');
  await game.seconds(0.2);
  expect((await kites(game)).list[i].holder).toBe(slot);
}

/** Run to and fro across the hill top for a while. */
async function runAbout(game: Game, seconds: number, keys: [string, string][]) {
  for (let t = 0; t < seconds; t += 1.2) {
    const leg = Math.round(t / 1.2) % 2;
    for (const k of keys) await game.page.keyboard.down(k[leg]);
    await game.seconds(1.2);
    for (const k of keys) await game.page.keyboard.up(k[leg]);
  }
}

test('pick up a kite and run: up it climbs (a sticker), and with it high a jump floats down slowly', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await pickUp(game, 0);
  expect((await kites(game)).list[0].h).toBeLessThan(0.3);
  await runAbout(game, 7.2, [['KeyD', 'KeyA']]);
  // keep running while we look
  await page.keyboard.down('KeyD');
  await game.seconds(0.8);
  expect((await kites(game)).list[0].h).toBeGreaterThan(0.85);
  expect(await stickers(game)).toContain('kite');
  await game.seconds(0.2, true);
  await game.screenshot('test-results/kites.png');

  // jump: and float back down
  await page.keyboard.down('Space');
  await game.seconds(1 / 60);
  await page.keyboard.up('Space');
  // (how fast we come down while in the air: not running down the hill afterwards)
  let worst = 0;
  let airborne = 0;
  for (let k = 0; k < 30; k += 1) {
    await game.seconds(0.05);
    const p = await page.evaluate(() => {
      const me = (window as any).__silly.runtime.players.get(0);
      return { vy: me.velocity.y as number, grounded: me.grounded as boolean };
    });
    if (p.grounded) continue;
    airborne += 1;
    worst = Math.max(worst, -p.vy);
  }
  await page.keyboard.up('KeyD');
  expect(airborne).toBeGreaterThan(8);
  expect(worst).toBeLessThan(3);
  game.expectNoErrors();
});

test('two friends with their kites up high together earn a friend sticker', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');
  await pickUp(game, 0, 0);
  await pickUp(game, 1, 1);
  await runAbout(game, 6, [
    ['KeyD', 'KeyA'],
    ['ArrowLeft', 'ArrowRight']
  ]);
  const k = await kites(game);
  expect(k.together).toBe(1);
  expect(await stickers(game)).toContain('kitefriends');
  game.expectNoErrors();
});

test('a spool left lying far away goes home after a while', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const [hx, hz] = await hill(game);
  await page.evaluate(
    ([x, z]) => {
      const s = (window as any).__silly;
      const spool = [...s.runtime.props.values()].find((p: any) => p.kind === 'kite');
      spool.getBody().setTranslation({ x, y: s.terrain.groundHeight(x, z) + 0.5, z }, true);
    },
    [hx + 20, hz + 6] as const
  );
  await game.seconds(25);
  expect((await kites(game)).homes).toBe(0);
  await game.seconds(20);
  expect((await kites(game)).homes).toBe(1);
  const spool = (await game.props('kite'))[0];
  expect(Math.hypot(spool.x - hx, spool.z - hz)).toBeLessThan(2.5);
  game.expectNoErrors();
});

test('playing alone, the buddy picks up another kite and runs round you with it, and puts it down when you do', async ({ page }) => {
  test.setTimeout(120_000);
  const game = new Game(page);
  await game.open(1, { off: ['cats', 'birds'] });
  await game.start();
  await page.evaluate(() => (window as any).__silly.useGame.getState().addBuddy());
  await game.seconds(1);
  const [hx, hz] = await hill(game);
  await game.teleport(1, hx + 3, 3, hz + 3);
  await pickUp(game, 0);
  // the child stands still on the hill; the buddy fetches a spool and gets its kite way up
  let buddyKite = -1;
  let top = 0;
  for (let k = 0; k < 40 && top < 0.7; k += 1) {
    await game.seconds(0.5);
    const s = await kites(game);
    buddyKite = s.list.findIndex((x) => x.holder === 1);
    top = buddyKite >= 0 ? s.list[buddyKite].h : 0;
  }
  expect(buddyKite).toBeGreaterThan(0);
  expect(top).toBeGreaterThan(0.7);
  // still the child's own kite, and no friend sticker for flying with the buddy
  expect((await kites(game)).list[0].holder).toBe(0);
  expect(await stickers(game)).not.toContain('kitefriends');
  // the child puts theirs down: the buddy puts its kite down too
  await game.tap('KeyQ');
  for (let k = 0; k < 10 && (await kites(game)).list.some((x) => x.holder != null); k += 1) await game.seconds(0.5);
  expect((await kites(game)).list.every((x) => x.holder == null)).toBe(true);
  game.expectNoErrors();
});
