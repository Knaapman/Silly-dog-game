import { expect, test } from '@playwright/test';
import { Game } from './game';

// A robot "kid" per player mashing random buttons and running around, for minutes of game
// time, with surprises going on. Anything that throws, goes NaN or falls out of the world fails.

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KB1_MOVE = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
const KB1_ACT = ['Space', 'KeyE', 'KeyQ', 'KeyR', 'KeyF', 'KeyG', 'Digit1', 'Digit2'];
const KB2_MOVE = ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
const KB2_ACT = ['Enter', 'ShiftRight', 'ControlRight', 'Slash', 'Period', 'Quote', 'Comma', 'KeyM'];

const check = (game: Game) =>
  game.page.evaluate(() => {
    const s = (window as any).__silly;
    const bad: string[] = [];
    const ok = (v: number) => Number.isFinite(v);
    s.runtime.players.forEach((p: any) => {
      const { x, y, z } = p.position;
      if (![x, y, z].every(ok)) bad.push(`player ${p.slot} position ${x},${y},${z}`);
      else if (Math.abs(x) > 72 || Math.abs(z) > 72 || y < -12 || y > 80) bad.push(`player ${p.slot} out of the world at ${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)}`);
      if (!ok(p.size) || p.size < 0.5 || p.size > 3) bad.push(`player ${p.slot} size ${p.size}`);
    });
    s.runtime.props.forEach((p: any) => {
      const b = p.getBody?.();
      if (!b) return;
      const t = b.translation();
      if (![t.x, t.y, t.z].every(ok)) bad.push(`prop ${p.kind} ${p.id} NaN`);
    });
    return bad;
  });

/** Every park cat and bird flock somewhere sensible (inside the hedge, not fallen through). */
async function critterProblems(game: Game) {
  return game.page.evaluate(() => {
    const out: string[] = [];
    const { parkCats, flocks } = (window as any).__silly.chase;
    const bad = (x: number, y: number, z: number) => !Number.isFinite(x + y + z) || Math.abs(x) > 62 || Math.abs(z) > 62 || y < -2 || y > 40;
    parkCats.forEach((c: any, i: number) => bad(c.position.x, c.position.y, c.position.z) && out.push(`cat ${i} at ${c.position.toArray()} (${c.mode})`));
    flocks.forEach((f: any, i: number) => bad(f.center.x, f.center.y, f.center.z) && out.push(`flock ${i} at ${f.center.toArray()}`));
    return out;
  });
}

const SEEDS = (process.env.CHAOS_SEEDS ?? '42').split(',').map(Number);

for (const seed of SEEDS)
test(`chaos: four players mashing everything for three minutes (seed ${seed})`, async ({ page }) => {
  test.setTimeout(900_000);
  const game = new Game(page);
  await game.withPads();
  await game.open(11);
  await game.start();
  await game.join('kb2');
  await page.evaluate(() => {
    (window as any).__addPad(0, 'standard', 'Xbox Pad');
    (window as any).__addPad(1, '', 'HORIPAD S (Vendor: 0f0d Product: 00c1)');
  });
  await game.pad(0, 0);
  await game.pad(1, 1);
  await game.seconds(1.5);
  expect(await game.state<number>('(g) => g.players.length')).toBe(4);

  const r = rng(seed);
  const last = new Map<number, { x: number; z: number; since: number }>();
  const stuck: string[] = [];
  let simMs = 0;
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const held = new Set<string>();
  const problems: string[] = [];
  const surprises = ['chicken', 'present', 'rain'];
  const CHUNKS = 720; // x 0.25 s = 3 minutes
  for (let i = 0; i < CHUNKS; i += 1) {
    // keyboards: change direction now and then, tap a random action
    for (const [move, act] of [[KB1_MOVE, KB1_ACT], [KB2_MOVE, KB2_ACT]] as const) {
      if (r() < 0.3) {
        for (const k of move) if (held.has(k)) {
          await page.keyboard.up(k);
          held.delete(k);
        }
        if (r() < 0.8) {
          const k = pick([...move]);
          await page.keyboard.down(k);
          held.add(k);
        }
      }
      if (r() < 0.5) await page.keyboard.press(pick([...act]));
    }
    // controllers: random stick, random buttons (never the menu hold: taps only)
    await page.evaluate(
      ([ax, az, bx, bz, b0, b1]) => {
        const pads = (window as any).__pads;
        if (pads[0]) pads[0].axes = [ax, az, 0, 0];
        if (pads[1]) {
          pads[1].axes[0] = bx;
          pads[1].axes[1] = bz;
        }
        for (let b = 0; b < 18; b += 1) {
          (window as any).__press(0, b, b === b0);
          (window as any).__press(1, b, b === b1);
        }
      },
      [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, r() < 0.6 ? pick([0, 1, 2, 3, 4, 5, 6, 7, 17]) : -1, r() < 0.6 ? pick([0, 1, 2, 3, 4, 5, 6, 7, 13]) : -1] as const
    );
    // a surprise every 40 s; keep the album/menu closed if a pad opened them
    if (i % 160 === 20) await page.evaluate((k) => (window as any).__silly.events.useEvents.getState().start(k), surprises[(i / 160) | 0 % 3]);
    await page.evaluate(() => {
      const g = (window as any).__silly.useGame.getState();
      if (g.albumOpen) g.setAlbumOpen(false);
      if (g.menuOpen) g.setMenuOpen(false);
    });
    const t0 = Date.now();
    await game.seconds(0.25);
    simMs += Date.now() - t0;
    if (i % 8 === 0) {
      const pos = await page.evaluate(() => [...(window as any).__silly.runtime.players.values()].map((p: any) => ({ slot: p.slot, x: p.position.x, y: p.position.y, z: p.position.z, riding: p.ridingOn != null, flopped: p.flopped })));
      for (const p of pos) {
        const l = last.get(p.slot);
        if (!l || Math.hypot(p.x - l.x, p.z - l.z) > 0.6 || p.riding || p.flopped) last.set(p.slot, { x: p.x, z: p.z, since: i });
        else if (i - l.since >= 60) {
          stuck.push(`slot ${p.slot} at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)} (t=${(i * 0.25).toFixed(0)}s)`);
          last.set(p.slot, { x: p.x, z: p.z, since: i });
        }
      }
      const bad = await check(game);
      if (bad.length) problems.push(`t=${(i * 0.25).toFixed(1)}s: ${bad.join('; ')}`);
      if (problems.length > 5) break;
    }
  }
  for (const k of held) await page.keyboard.up(k);
  console.log(`seed ${seed}: ${((simMs / (CHUNKS * 15)) || 0).toFixed(2)} ms per simulated frame (4 players, no drawing)`);
  if (stuck.length) console.log(`seed ${seed} possibly stuck: ${stuck.join(' | ')}`);
  console.log(`seed ${seed} stickers: ${await page.evaluate(() => (window as any).__silly.useStickers.getState().got.length)}`);
  await game.seconds(1, true);
  await page.screenshot({ path: 'test-results/chaos-end.png' });
  expect(problems, problems.join('\n')).toEqual([]);
  expect(await critterProblems(game)).toEqual([]);
  game.expectNoErrors();
});

test('chaos: one child mashing everything, with the buddy along', async ({ page }) => {
  test.setTimeout(600_000);
  const game = new Game(page);
  await game.open(5);
  await game.start();
  await page.evaluate(() => ((window as any).__silly.buddyControl.auto = true));
  await game.seconds(5);
  expect(await game.state<number>('(g) => g.players.filter((p) => p.bot).length')).toBe(1);
  const r = rng(2024);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const held = new Set<string>();
  const problems: string[] = [];
  let farthest = 0;
  for (let i = 0; i < 360; i += 1) {
    if (r() < 0.3) {
      for (const k of KB1_MOVE) if (held.has(k)) {
        await page.keyboard.up(k);
        held.delete(k);
      }
      if (r() < 0.8) {
        const k = pick(KB1_MOVE);
        await page.keyboard.down(k);
        held.add(k);
      }
    }
    if (r() < 0.5) await page.keyboard.press(pick(KB1_ACT));
    if (i === 120) await page.evaluate(() => (window as any).__silly.events.useEvents.getState().start('rain'));
    await page.evaluate(() => {
      const g = (window as any).__silly.useGame.getState();
      if (g.albumOpen) g.setAlbumOpen(false);
      if (g.menuOpen) g.setMenuOpen(false);
    });
    await game.seconds(0.25);
    if (i % 8 === 0) {
      const bad = await check(game);
      const d = await page.evaluate(() => {
        const ps = [...(window as any).__silly.runtime.players.values()];
        const kid = ps.find((p: any) => !p.bot);
        const bot = ps.find((p: any) => p.bot);
        return kid && bot ? Math.hypot(kid.position.x - bot.position.x, kid.position.z - bot.position.z) : -1;
      });
      if (d < 0) bad.push('the buddy is gone');
      farthest = Math.max(farthest, d);
      if (bad.length) problems.push(`t=${(i * 0.25).toFixed(1)}s: ${bad.join('; ')}`);
      if (problems.length > 5) break;
    }
  }
  for (const k of held) await page.keyboard.up(k);
  console.log(`solo chaos: the buddy was at most ${farthest.toFixed(1)} m away; stickers ${await page.evaluate(() => (window as any).__silly.useStickers.getState().got.length)}`);
  expect(problems, problems.join('\n')).toEqual([]);
  // it never wanders off (it pops back when more than 24 m away)
  expect(farthest).toBeLessThan(30);
  expect(await critterProblems(game)).toEqual([]);
  game.expectNoErrors();
});
