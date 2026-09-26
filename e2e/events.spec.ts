import { expect, test } from '@playwright/test';
import { Game } from './game';

type V = { x: number; y: number; z: number };
const ev = (game: Game) => game.page.evaluate(() => {
  const e = (window as any).__silly.events;
  const s = e.useEvents.getState();
  const v = (p: any) => ({ x: p.x, y: p.y, z: p.z });
  return { kind: s.kind as string | null, chicken: v(e.eventSpot.chicken) as V, present: v(e.eventSpot.present) as V, puddles: e.eventSpot.puddles.map(v) as V[], rain: e.weather.rain as number, rainbowUntil: s.rainbowUntil as number };
});
const start = (game: Game, kind: string) => game.page.evaluate((k) => (window as any).__silly.events.useEvents.getState().start(k), kind);
const stickers = (game: Game) => game.page.evaluate(() => [...(window as any).__silly.useStickers.getState().got] as string[]);
const now = (game: Game) => game.page.evaluate(() => (window as any).__silly.clock.gameClock.time * 1000);

test('surprise: a runaway golden chicken to catch (or it gets away)', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await start(game, 'chicken');
  await game.seconds(0.5, true);
  await expect(page.getByTestId('event-badge')).toContainText('🐔');

  // come close: it runs away
  let c = (await ev(game)).chicken;
  await game.teleport(0, c.x + 3, 1, c.z);
  await game.seconds(0.2);
  const d0 = Math.hypot((await game.player(0)).x - (await ev(game)).chicken.x, (await game.player(0)).z - (await ev(game)).chicken.z);
  await game.seconds(0.6);
  c = (await ev(game)).chicken;
  const p = await game.player(0);
  expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeGreaterThan(d0 + 1.5);
  await game.screenshot('test-results/event-chicken.png');

  // catch it
  await game.teleport(0, c.x, c.y + 0.3, c.z);
  await game.seconds(0.2);
  expect((await ev(game)).kind).toBeNull();
  expect(await stickers(game)).toContain('chicken');

  // left alone, it gets away after a while
  await start(game, 'chicken');
  await game.seconds(41);
  expect((await ev(game)).kind).toBeNull();
  game.expectNoErrors();
});

test('surprise: a present on a balloon gives everybody a new hat', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await start(game, 'present');
  await game.seconds(8);
  await game.screenshot('test-results/event-present.png');
  const pr = (await ev(game)).present;
  await game.teleport(0, pr.x, pr.y, pr.z);
  await game.seconds(0.2);
  expect((await ev(game)).kind).toBeNull();
  expect(await stickers(game)).toContain('present');
  expect(await game.state<string>('(g) => g.players[0].hat')).toBe('party');
  game.expectNoErrors();
});

test('surprise: rain with puddles to jump in, then a rainbow', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await start(game, 'rain');
  await game.seconds(7);
  const e = await ev(game);
  expect(e.rain).toBeGreaterThan(0.9);
  expect(e.puddles.length).toBeGreaterThan(0);
  await game.screenshot('test-results/event-rain.png');

  // jump into a puddle
  const pd = e.puddles[0];
  await game.teleport(0, pd.x, pd.y + 4, pd.z);
  await game.seconds(1.2);
  expect(await stickers(game)).toContain('puddle');

  // the rain stops: a rainbow; then the puddles dry up
  await game.seconds(34);
  const after = await ev(game);
  expect(after.rain).toBeLessThan(0.05);
  expect(after.rainbowUntil).toBeGreaterThan(await now(game));
  expect(await stickers(game)).toContain('rainbow');
  await game.seconds(3, true);
  await expect(page.getByTestId('rainbow')).toBeVisible();
  await game.screenshot('test-results/event-rainbow.png');
  await game.seconds(10);
  expect((await ev(game)).kind).toBeNull();
  game.expectNoErrors();
});
