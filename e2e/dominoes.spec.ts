import { expect, test } from '@playwright/test';
import { Game } from './game';

// Giant dominoes: bump into one and over it goes, knocking the next, all the way along the row;
// the last one lands on the big button and rings the bell. Knock one the other way and the chain
// runs back to the start (bonking anyone standing at the end). When it's all quiet they stand up.

type D = { x: number; z: number; tx: number; tz: number; mode: string; theta: number };
const dominoes = (game: Game) =>
  game.page.evaluate(() => {
    const d = (window as any).__silly.runtime.debugInfo.dominoes;
    return {
      list: d.list.map((x: D) => ({ x: x.x, z: x.z, tx: x.tx, tz: x.tz, mode: x.mode, theta: x.theta })) as D[],
      falls: d.falls as number,
      chains: d.chains as number,
      bells: d.bells as number,
      bumps: d.bumps as number,
      rises: d.rises as number
    };
  });
const stickers = (game: Game) => game.page.evaluate(() => (window as any).__silly.useStickers.getState().got as string[]);
/** The key that walks this way (the arrow keys of player one: W A S D). */
const keyFor = (dx: number, dz: number) => (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'KeyD' : 'KeyA') : dz > 0 ? 'KeyS' : 'KeyW');

test('walk into the first domino: the whole row topples, the last lands on the button and rings the bell; then up they get', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  let s = await dominoes(game);
  const n = s.list.length;
  expect(n).toBeGreaterThan(30);
  expect(s.list.every((d) => d.mode === 'up')).toBe(true);
  // walk into the first one from behind
  const d0 = s.list[0];
  await game.teleport(0, d0.x - d0.tx * 1.6, 0.1, d0.z - d0.tz * 1.6);
  await game.seconds(0.4);
  await game.hold(keyFor(d0.tx, d0.tz), 0.6);
  s = await dominoes(game);
  expect(s.list[0].mode).not.toBe('up');
  expect(s.list[0].theta).toBeGreaterThan(0);
  // off it goes along the row (move out of the way and watch)
  await game.teleport(0, d0.x - d0.tx * 3, 0.1, d0.z - d0.tz * 3);
  await game.seconds(3, true);
  s = await dominoes(game);
  const mid = s.list.filter((d) => d.mode !== 'up').length;
  expect(mid).toBeGreaterThan(5);
  expect(mid).toBeLessThan(n);
  await game.screenshot('test-results/dominoes-falling.png');
  for (let i = 0; i < 40 && (await dominoes(game)).bells === 0; i += 1) await game.seconds(0.5);
  s = await dominoes(game);
  expect(s.bells).toBe(1);
  expect(s.falls).toBe(n);
  expect(s.chains).toBe(1);
  expect(s.list.every((d) => d.mode === 'down')).toBe(true);
  expect(await stickers(game)).toContain('dominoes');
  await game.seconds(0.6, true);
  await game.screenshot('test-results/dominoes-bell.png');
  // all quiet: they stand back up, one after the other (after six seconds, then along the row)
  await game.seconds(5);
  expect((await dominoes(game)).list.every((d) => d.mode === 'down')).toBe(true);
  await game.seconds(5.5);
  s = await dominoes(game);
  expect(s.list.every((d) => d.mode === 'up')).toBe(true);
  expect(s.rises).toBe(n);

  // a ball rolling into one from the side knocks it over too: from there on to the end, and the bell again
  const k = 5;
  const dk = s.list[k];
  await game.seconds(1);
  await page.evaluate(([x, z, tx, tz]) => {
    const s = (window as any).__silly;
    const ball = [...s.runtime.props.values()].find((p: any) => p.kind === 'ball' && p.enabled);
    const b = ball.getBody();
    b.setTranslation({ x: x + tz * 1.5, y: s.terrain.groundHeight(x, z) + 0.5, z: z - tx * 1.5 }, true);
    b.setLinvel({ x: -tz * 5, y: 0, z: tx * 5 }, true);
  }, [dk.x, dk.z, dk.tx, dk.tz] as const);
  await game.seconds(1);
  s = await dominoes(game);
  expect(s.list[k].mode).not.toBe('up');
  expect(s.list[k - 1].mode).toBe('up');
  for (let i = 0; i < 40 && (await dominoes(game)).bells < 2; i += 1) await game.seconds(0.5);
  s = await dominoes(game);
  expect(s.bells).toBe(2);
  expect(s.list.slice(0, k).every((d) => d.mode === 'up')).toBe(true);
  game.expectNoErrors();
});

test('walk into the middle of the row from the side: it runs both ways, back to the start (bonking a friend there) and on to the bell', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');
  let s = await dominoes(game);
  const n = s.list.length;
  // a gap in the middle on a straight bit running east or west
  const k = s.list.findIndex((d, i) => i > 12 && i < n - 8 && Math.abs(d.tx) > 0.97 && Math.abs(s.list[i + 1].tx) > 0.97);
  expect(k).toBeGreaterThan(0);
  const a = s.list[k];
  const b = s.list[k + 1];
  const [mx, mz] = [(a.x + b.x) / 2, (a.z + b.z) / 2];
  const [nx, nz] = [-a.tz, a.tx];
  // the friend stands just before the first domino, in the way of it falling back
  const d0 = s.list[0];
  await game.teleport(1, d0.x - d0.tx * 1.05, 0.1, d0.z - d0.tz * 1.05);
  await game.teleport(0, mx + nx * 1.8, 0.1, mz + nz * 1.8);
  await game.seconds(0.5);
  expect((await dominoes(game)).falls).toBe(0);
  await game.hold(keyFor(-nx, -nz), 0.5);
  s = await dominoes(game);
  // the two either side of us go, away from us: one back, one on
  expect(s.list[k].mode).toBe('fall');
  expect(s.list[k + 1].mode).toBe('fall');
  // (step back out and watch)
  await game.teleport(0, mx + nx * 3, 0.1, mz + nz * 3);
  const rest = (await game.player(1)).y;
  let peak = -Infinity;
  for (let i = 0; i < 200; i += 1) {
    await game.seconds(0.1);
    peak = Math.max(peak, (await game.player(1)).y);
    const q = await dominoes(game);
    if (q.list.every((d) => d.mode === 'down') && q.bells > 0) break;
  }
  s = await dominoes(game);
  expect(s.list.every((d) => d.mode === 'down')).toBe(true);
  expect(s.falls).toBe(n);
  expect(s.chains).toBe(1);
  expect(s.bells).toBe(1);
  expect(s.bumps).toBe(1);
  expect(peak - rest).toBeGreaterThan(0.4);
  game.expectNoErrors();
});
