import { expect, test } from '@playwright/test';
import { Game } from './game';

// Snowball fight: lick a little snowball off a snow pile, lick again to throw it. A friend it hits
// gets a splat and a dusting of snow; hit the buddy and it throws one back. A snowball hits things
// like a headbutt does (here: tipping a paint bucket from afar).

const fight = (game: Game) =>
  game.page.evaluate(() => {
    const f = (window as any).__silly.runtime.debugInfo.snowballFight;
    return { hits: f.hits as number, buddyThrows: f.buddyThrows as number, held: f.balls.filter((b: any) => b.entry.heldBy != null).length as number };
  });
const paint = (game: Game, slot: number) => game.page.evaluate((slot) => (window as any).__silly.runtime.debugInfo.paintOf.get(slot) ?? null, slot);
const stickers = (game: Game) => game.page.evaluate(() => (window as any).__silly.useStickers.getState().got as string[]);
const SNOW = 4;

/** Up to the first snow pile from the south, facing it, and lick a snowball off it. */
async function pickUp(game: Game) {
  const [px, pz] = await game.page.evaluate(() => (window as any).__silly.layout.SNOW_PILES[0] as [number, number]);
  await game.hopTo(0, [px, pz + 3.2], [px, pz + 1.6]);
  await game.tap('KeyQ');
  await game.seconds(0.3);
  expect((await fight(game)).held).toBe(1);
  return [px, pz];
}

test('snowball fight: pick one up, throw it at a friend: splat, snowy (and a friend sticker)', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');
  await game.teleport(1, 30, 1, -62);
  await pickUp(game);
  // turn round to face south (the snowman's to the east), and a friend five metres away
  await game.hold('KeyS', 0.3);
  await game.seconds(0.3);
  const me = await game.player(0);
  await game.teleport(1, me.x, 1, me.z + 5);
  await game.seconds(0.6);
  expect((await stickers(game))).not.toContain('snowballfight');
  await game.tap('KeyQ');
  await game.seconds(1, true);
  await game.screenshot('test-results/snowball-hit.png');
  expect((await fight(game)).hits).toBe(1);
  const p = await paint(game, 1);
  expect(p.color).toBe(SNOW);
  expect(p.amount).toBeGreaterThan(0.5);
  expect(await stickers(game)).toContain('snowballfight');
  // (snow isn't paint: no paint stickers for it)
  expect(await stickers(game)).not.toContain('paint');
  // it melts away soon
  await game.seconds(14);
  expect((await paint(game, 1)).amount).toBe(0);
  game.expectNoErrors();
});

test('playing alone: hit the buddy with a snowball and it throws one back', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  // a snowball first, then the buddy comes along (called earlier, it hops over after us and our
  // own hop to the pile can land on its back)
  await pickUp(game);
  // (and stands still where we put it, as something to throw at: left to itself it trots over to
  // stand beside us)
  await page.evaluate(() => {
    const s = (window as any).__silly;
    s.buddyControl.think = false;
    s.useGame.getState().addBuddy();
  });
  await game.seconds(1.5);
  const bot = await page.evaluate(() => [...(window as any).__silly.runtime.players.values()].find((p: any) => p.bot).slot as number);
  await game.hold('KeyS', 0.3);
  await game.seconds(0.3);
  expect((await fight(game)).held).toBe(1);
  const me = await game.player(0);
  await game.teleport(bot, me.x, 1, me.z + 5);
  await game.seconds(0.6);
  await game.tap('KeyQ');
  await game.seconds(0.8);
  expect((await fight(game)).hits).toBe(1);
  expect((await paint(game, bot)).color).toBe(SNOW);
  // and back it comes
  await game.seconds(2.5);
  const f = await fight(game);
  expect(f.buddyThrows).toBe(1);
  expect(f.hits).toBe(2);
  expect((await paint(game, 0)).color).toBe(SNOW);
  game.expectNoErrors();
});

test('a snowball hits things like a headbutt: carry one over to the paint buckets and tip one from afar', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await pickUp(game);
  const B = await page.evaluate(() => (window as any).__silly.layout.PAINT_BUCKETS);
  const tips = () => page.evaluate(() => (window as any).__silly.runtime.debugInfo.paint.buckets.map((b: any) => b.tips as number) as number[]);
  // off to the playground with it (still held), four metres south of a bucket, facing it
  const x = B.center[0] - 0.5 * B.spacing;
  await game.teleport(0, x, 1, B.center[1] + 5.5);
  // (the snowball comes too: a tongue lets go of something left more than 7 m behind)
  await page.evaluate(([x, z]) => {
    const s = (window as any).__silly;
    const ball = s.runtime.debugInfo.snowballFight.balls.find((b: any) => b.entry.heldBy === 0);
    ball.body().setTranslation({ x, y: s.terrain.groundHeight(x, z) + 1.6, z: z - 1 }, true);
  }, [x, B.center[1] + 5.5] as const);
  await game.seconds(0.5);
  await game.hold('KeyW', 0.25);
  await game.seconds(0.3);
  expect((await fight(game)).held).toBe(1);
  expect((await tips()).reduce((a, b) => a + b, 0)).toBe(0);
  await game.tap('KeyQ');
  await game.seconds(1);
  expect((await tips()).reduce((a, b) => a + b, 0)).toBe(1);
  // and the snowball is back on its pile, growing again
  expect((await fight(game)).held).toBe(0);
  game.expectNoErrors();
});
