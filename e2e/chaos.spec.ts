import { expect, test } from '@playwright/test';
import { Game } from './game';

// A robot "kid" per player mashing random buttons and running around, for minutes of game
// time, with surprises going on, popping over to a random attraction every 20 s. Anything that
// throws, goes NaN, falls out of the world or under the ground, leaves the park, or ends up held
// or ridden by a player who isn't there fails.

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
    const under = (x: number, y: number, z: number, by: number) => y < s.terrain.groundHeight(x, z) - by;
    s.runtime.players.forEach((p: any) => {
      const { x, y, z } = p.position;
      if (![x, y, z].every(ok)) bad.push(`player ${p.slot} position ${x},${y},${z}`);
      else if (Math.abs(x) > 82 || Math.abs(z) > 68 || y < -12 || y > 80) bad.push(`player ${p.slot} out of the world at ${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)}`);
      else if (under(x, y, z, 1)) bad.push(`player ${p.slot} under the ground at ${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)}`);
      if (!ok(p.size) || p.size < 0.5 || p.size > 3) bad.push(`player ${p.slot} size ${p.size}`);
      if (p.grabbedBy != null && !s.runtime.players.get(p.grabbedBy)) bad.push(`player ${p.slot} held by player ${p.grabbedBy}, who isn't here`);
      if (p.ridingOn != null && !s.runtime.players.get(p.ridingOn)) bad.push(`player ${p.slot} riding player ${p.ridingOn}, who isn't here`);
      for (let k = p.ridingOn, n = 0; k != null && n < 8; n += 1, k = s.runtime.players.get(k)?.ridingOn ?? null) if (k === p.slot) bad.push(`player ${p.slot} rides itself (a circle of piggybacks)`);
    });
    // every rider, driver or seat in the rides' state is somebody who's in the game
    const seen = new Set<unknown>();
    const walk = (o: any, path: string, depth: number) => {
      if (!o || typeof o !== 'object' || seen.has(o) || depth > 4 || o.isVector3 || o.isQuaternion || o.isObject3D || o instanceof Map) return;
      seen.add(o);
      for (const k of Object.keys(o)) {
        const v = o[k];
        if ((k === 'rider' || k === 'driver') && typeof v === 'number' && !s.runtime.players.get(v)) bad.push(`${path}.${k} is player ${v}, who isn't here`);
        if (k === 'riders' && Array.isArray(v)) v.forEach((r: unknown, i: number) => typeof r === 'number' && !s.runtime.players.get(r) && bad.push(`${path}.riders[${i}] is player ${r}, who isn't here`));
        if (v && typeof v === 'object') walk(v, `${path}.${k}`, depth + 1);
      }
    };
    walk(s.runtime.debugInfo, 'debugInfo', 0);
    s.runtime.props.forEach((p: any) => {
      if (p.heldBy != null && !s.runtime.players.get(p.heldBy)) bad.push(`prop ${p.kind} ${p.id} held by player ${p.heldBy}, who isn't here`);
      const b = p.getBody?.();
      if (!b) return;
      const t = b.translation();
      if (![t.x, t.y, t.z].every(ok)) bad.push(`prop ${p.kind} ${p.id} NaN`);
      // (props are checked a few times a second: one can be a little way under for a moment)
      else if (p.enabled && p.heldBy == null && under(t.x, t.y, t.z, 1.5)) bad.push(`prop ${p.kind} ${p.id} under the ground at ${t.x.toFixed(1)},${t.y.toFixed(1)},${t.z.toFixed(1)}`);
      // (the park's walls stand at 80.5 and 65.5: nothing in play gets past them)
      else if (p.enabled && p.heldBy == null && (Math.abs(t.x) > 81 || Math.abs(t.z) > 66)) bad.push(`prop ${p.kind} ${p.id} outside the park at ${t.x.toFixed(1)},${t.y.toFixed(1)},${t.z.toFixed(1)}`);
    });
    return bad;
  });

/** Every park cat and bird flock somewhere sensible (inside the hedge, not fallen through). */
async function critterProblems(game: Game) {
  return game.page.evaluate(() => {
    const out: string[] = [];
    const { parkCats, flocks } = (window as any).__silly.chase;
    const bad = (x: number, y: number, z: number) => !Number.isFinite(x + y + z) || Math.abs(x) > 82 || Math.abs(z) > 68 || y < -2 || y > 40;
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
  // (the bubble machine starts switched off in test mode: chaos has it on, like real play)
  await page.evaluate(() => (window as any).__silly.runtime.debugInfo.bubbles.setAuto(true));
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
  const surprises = ['chicken', 'present', 'rain', 'ball'];
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
    // every 20 s, each animal off to a random attraction's bubble (otherwise they'd mostly play
    // round the plaza, and the rides far away would never get mashed)
    if (i % 80 === 4) {
      const spots = await page.evaluate(() => {
        const out: [number, number, number][] = [];
        (window as any).__silly.runtime.hints.forEach((h: any) => out.push([h.position.x, h.position.y, h.position.z]));
        return out;
      });
      for (const slot of [0, 1, 2, 3]) {
        const [hx, hy, hz] = pick(spots);
        await page.evaluate(
          ([slot, x, y, z]) => {
            const p = (window as any).__silly.runtime.players.get(slot);
            if (!p || p.isLaunched()) return;
            p.getBody().setTranslation({ x: x + 0.3, y: y + 0.6, z: z + 0.3 }, true);
            p.getBody().setLinvel({ x: 0, y: 0, z: 0 }, true);
          },
          [slot, hx, hy, hz] as const
        );
      }
    }
    // a surprise every 40 s; keep the album/menu closed if a pad opened them
    if (i % 160 === 20) await page.evaluate((k) => (window as any).__silly.events.useEvents.getState().start(k), surprises[((i / 160) | 0) % surprises.length]);
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
  console.log(`seed ${seed} unstuck: ${await page.evaluate(() => JSON.stringify((window as any).__silly.runtime.debugInfo.unstuck))}`);
  console.log(`seed ${seed} lifted: ${await page.evaluate(() => JSON.stringify((window as any).__silly.runtime.debugInfo.lifted))}`);
  console.log(`seed ${seed} stickers: ${await page.evaluate(() => (window as any).__silly.useStickers.getState().got.length)}`);
  await game.seconds(1, true);
  await page.screenshot({ path: 'test-results/chaos-end.png' });
  expect(problems, problems.join('\n')).toEqual([]);
  expect(await critterProblems(game)).toEqual([]);
  game.expectNoErrors();
});

/** The solo run's button-mashing seeds (SOLO_SEEDS=1,2,3 for more). */
const SOLO_SEEDS = (process.env.SOLO_SEEDS ?? '2024').split(',').map(Number);

for (const soloSeed of SOLO_SEEDS)
test(`chaos: one child mashing everything, with the buddy along${soloSeed === 2024 ? '' : ` (seed ${soloSeed})`}`, async ({ page }) => {
  test.setTimeout(600_000);
  const game = new Game(page);
  await game.open(5);
  await game.start();
  await page.evaluate(() => ((window as any).__silly.buddyControl.auto = true));
  await page.evaluate(() => (window as any).__silly.runtime.debugInfo.bubbles.setAuto(true));
  await game.seconds(5);
  expect(await game.state<number>('(g) => g.players.filter((p) => p.bot).length')).toBe(1);
  const r = rng(soloSeed);
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
  console.log(`solo chaos${soloSeed === 2024 ? '' : ` (seed ${soloSeed})`}: the buddy was at most ${farthest.toFixed(1)} m away; stickers ${await page.evaluate(() => (window as any).__silly.useStickers.getState().got.length)}`);
  console.log(`solo chaos${soloSeed === 2024 ? '' : ` (seed ${soloSeed})`} unstuck: ${await page.evaluate(() => JSON.stringify((window as any).__silly.runtime.debugInfo.unstuck))}`);
  expect(problems, problems.join('\n')).toEqual([]);
  // it never wanders off (it pops back when more than 24 m away)
  expect(farthest).toBeLessThan(30);
  expect(await critterProblems(game)).toEqual([]);
  game.expectNoErrors();
});
