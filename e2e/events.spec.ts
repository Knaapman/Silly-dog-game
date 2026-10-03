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

test('the golden chicken runs round water, not back towards whoever chases it', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const fountain = await page.evaluate(() => (window as any).__silly.layout.FOUNTAIN as { center: [number, number]; basinRadius: number });
  const geysers = await page.evaluate(() => (window as any).__silly.layout.GEYSERS as [number, number][]);
  const [fx, fz] = fountain.center;
  // three times over, from different sides: wait for one to turn up near the fountain (it comes out
  // somewhere different every time), then come at it from the far side, so running straight away
  // means running into the water
  let k = 0;
  for (let round = 0; round < 3; round += 1) {
    let c = (await ev(game)).chicken;
    for (; k < 120; k += 1) {
      await game.teleport(0, fx + 13 * Math.cos(k), 1, fz + 13 * Math.sin(k));
      await start(game, 'chicken');
      await game.seconds(0.1);
      c = (await ev(game)).chicken;
      const d = Math.hypot(c.x - fx, c.z - fz);
      if (d < fountain.basinRadius + 0.5 || d > fountain.basinRadius + 3) continue;
      // (and not where we'd stand right by one of the fountain's geysers: it would throw us up
      // onto the fountain, straight at the chicken)
      const me = [c.x + ((c.x - fx) / d) * 3, c.z + ((c.z - fz) / d) * 3];
      if (geysers.every(([gx, gz]) => Math.hypot(me[0] - gx, me[1] - gz) > 2.5)) break;
    }
    k += 1;
    const d0 = Math.hypot(c.x - fx, c.z - fz);
    expect(d0).toBeLessThan(fountain.basinRadius + 3);
    const ux = (c.x - fx) / d0;
    const uz = (c.z - fz) / d0;
    await game.teleport(0, c.x + ux * 3, 1, c.z + uz * 3);
    const gaps: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      await game.seconds(0.1);
      c = (await ev(game)).chicken;
      const p = await game.player(0);
      gaps.push(Math.hypot(p.x - c.x, p.z - c.z));
      // never into the water
      expect(Math.hypot(c.x - fx, c.z - fz)).toBeGreaterThan(fountain.basinRadius - 0.3);
    }
    // it gets away: never back towards you (skirting the curved rim can close the gap by a few
    // centimetres for a moment; turning back used to close it by half a metre)
    for (let i = 1; i < gaps.length; i += 1) expect(gaps[i]).toBeGreaterThan(gaps[i - 1] - 0.2);
    expect(gaps[gaps.length - 1]).toBeGreaterThan(gaps[0] + 3);
  }
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

test('surprise: a giant beach ball drops in: headbutt it, bounce on it, and after a minute it pops', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await start(game, 'ball');
  const ball = () => page.evaluate(() => {
    const s = (window as any).__silly;
    const b = s.events.eventSpot.ball;
    return { x: b.x, y: b.y, z: b.z, ...s.runtime.debugInfo.giantBall } as { x: number; y: number; z: number; landed: boolean; bonks: number; bounces: number; popped: boolean };
  });
  // down it comes out of the sky, somewhere near
  expect((await ball()).y).toBeGreaterThan(15);
  for (let k = 0; k < 40 && !(await ball()).landed; k += 1) await game.seconds(0.1);
  expect((await ball()).landed).toBe(true);
  await game.seconds(4);
  let b = await ball();
  await game.teleport(0, b.x + 1, 0.5, b.z + 6);
  await game.seconds(1, true);
  await game.screenshot('test-results/event-ball.png');
  b = await ball();

  // headbutt it: off it goes (and a sticker)
  await game.hopTo(0, [b.x + 6, b.z], [b.x + 3.2, b.z]);
  await game.tap('KeyE');
  await game.seconds(0.3);
  expect((await ball()).bonks).toBe(1);
  expect(await stickers(game)).toContain('giantball');
  await game.seconds(4);

  // drop onto the top of it: boing!
  b = await ball();
  // (teleport takes the height above the ground: the ball is 4.4 m tall, drop from 2.5 m over it)
  await game.teleport(0, b.x, 2 * 2.2 + 2.5, b.z);
  const top = await game.maxY(0, 1.5);
  expect((await ball()).bounces).toBeGreaterThanOrEqual(1);
  expect(top).toBeGreaterThan(b.y + 4);

  // a minute after it came: POP, and the surprise is over
  await game.seconds(55);
  expect((await ball()).popped).toBe(true);
  expect((await ev(game)).kind).toBeNull();
  game.expectNoErrors();
});
