import { expect, test } from '@playwright/test';
import { Game } from './game';

// Giant building blocks: lick one to carry it, lick again in front of the tower and it hops onto
// the top. Five high is a cheer and a sticker (a friend sticker when two children built it); a
// headbutt brings it all crashing down. Set down with no tower in reach, a block just sits there;
// left lying far away, it hops home after a while. Playing alone, the buddy fetches blocks.

type B = { holder: number | null; placedBy: number | null; height: number; above: number };
type S = { list: B[]; pos: { x: number; y: number; z: number }[]; tallest: number; snaps: number; buddySnaps: number; setDowns: number; towers: number; crashes: number; homes: number };
const blocks = (game: Game) =>
  game.page.evaluate(() => {
    const s = (window as any).__silly.runtime.debugInfo.blocks;
    return {
      list: s.list.map((b: B) => ({ holder: b.holder, placedBy: b.placedBy, height: b.height, above: b.above })),
      pos: s.pos.map((p: any) => ({ x: p.x, y: p.y, z: p.z })),
      tallest: s.tallest,
      snaps: s.snaps,
      buddySnaps: s.buddySnaps,
      setDowns: s.setDowns,
      towers: s.towers,
      crashes: s.crashes,
      homes: s.homes
    } as S;
  });
const layout = (game: Game) => game.page.evaluate(() => (window as any).__silly.layout.BLOCKS as { center: [number, number]; count: number; tower: number; ring: number });
const stickers = (game: Game) => game.page.evaluate(() => (window as any).__silly.useStickers.getState().got as string[]);

/** Pick up block `i` (it's lying loose on the ring): hop up to it from outside the ring and lick. */
async function pickUp(game: Game, i: number, cx: number, cz: number, slot = 0) {
  const p = (await blocks(game)).pos[i];
  const dx = p.x - cx;
  const dz = p.z - cz;
  const d = Math.hypot(dx, dz);
  await game.hopTo(slot, [p.x + (dx / d) * 3, p.z + (dz / d) * 3], [p.x + (dx / d) * 1.4, p.z + (dz / d) * 1.4]);
  await game.tap(slot ? 'ControlRight' : 'KeyQ');
  await game.seconds(0.2);
  expect((await blocks(game)).list[i].holder).toBe(slot);
}

/** Walk west (holding the key) until we're this close to x, then lick: onto the tower. */
async function walkWestAndPlace(game: Game, x: number, slot = 0) {
  const [walk, lick] = slot ? ['ArrowLeft', 'ControlRight'] : ['KeyA', 'KeyQ'];
  await game.page.keyboard.down(walk);
  for (let k = 0; k < 40 && (await game.player(slot)).x > x; k += 1) await game.seconds(0.05);
  await game.page.keyboard.up(walk);
  await game.seconds(0.3);
  await game.tap(lick);
  await game.seconds(0.4);
}

test('carry blocks onto the tower with your tongue: five high is a cheer and a sticker, and a headbutt brings it crashing down', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const L = await layout(game);
  const [cx, cz] = L.center;
  let s = await blocks(game);
  expect(s.tallest).toBe(L.tower);
  // the block on the ring due east, then the next one round: carry each to the tower
  for (const i of [L.tower, L.tower + 1]) {
    await pickUp(game, i, cx, cz);
    await game.teleport(0, cx + 3.6, 0.5, cz);
    await game.seconds(0.3);
    await walkWestAndPlace(game, cx + 1.7);
    s = await blocks(game);
    expect(s.list[i].holder).toBe(null);
    expect(s.list[i].height).toBe(s.tallest);
  }
  s = await blocks(game);
  expect(s.snaps).toBe(2);
  expect(s.tallest).toBe(5);
  expect(s.towers).toBe(1);
  expect(await stickers(game)).toContain('blocks');
  expect(await stickers(game)).not.toContain('blockfriends');
  // it stands up by itself
  await game.seconds(3);
  expect((await blocks(game)).tallest).toBe(5);
  await game.seconds(0.5, true);
  await game.screenshot('test-results/blocks.png');

  // headbutt the bottom: crash!
  await game.hopTo(0, [cx + 3.5, cz], [cx + 1.3, cz]);
  await game.tap('KeyE');
  await game.seconds(2.5);
  s = await blocks(game);
  expect(s.crashes).toBe(1);
  // (the blocks the headbutt reaches fly off together, and whether the one above them rides
  // along or tumbles off is down to how they spin)
  expect(s.tallest).toBeLessThanOrEqual(3);
  game.expectNoErrors();
});

test('set down with no tower in reach, a block just sits there; left lying far away, it hops home', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const L = await layout(game);
  const [cx, cz] = L.center;
  const i = L.tower + 2;
  await pickUp(game, i, cx, cz);
  // carry it off south-east, away from everything, and put it down
  await game.teleport(0, cx + 6, 0.5, cz + 5);
  await game.seconds(0.5);
  const before = (await blocks(game)).pos[i];
  await game.tap('KeyQ');
  await game.seconds(1.5);
  let s = await blocks(game);
  expect(s.setDowns).toBe(1);
  expect(s.snaps).toBe(0);
  expect(s.list[i].holder).toBe(null);
  expect(Math.hypot(s.pos[i].x - before.x, s.pos[i].z - before.z)).toBeLessThan(1); // not thrown
  // lying on the grass (it once sank straight through the ground, out of sight)
  const g = await page.evaluate(([x, z]) => (window as any).__silly.terrain.groundHeight(x, z) as number, [s.pos[i].x, s.pos[i].z] as const);
  expect(s.pos[i].y - g).toBeGreaterThan(0.4);
  expect(s.pos[i].y - g).toBeLessThan(0.8);
  await game.seconds(3);
  expect((await blocks(game)).pos[i].y - g).toBeGreaterThan(0.4);

  // now far away: it hops home after a while
  await page.evaluate(
    ([i, x, z]) => {
      const s = (window as any).__silly;
      const b = s.runtime.props.get([...s.runtime.props.values()].filter((p: any) => p.kind === 'block')[i].id).getBody();
      b.setTranslation({ x, y: s.terrain.groundHeight(x, z) + 0.5, z }, true);
    },
    [i, cx - 2, cz - 14] as const
  );
  await game.seconds(20);
  expect((await blocks(game)).homes).toBe(0);
  await game.seconds(25);
  s = await blocks(game);
  expect(s.homes).toBe(1);
  expect(Math.hypot(s.pos[i].x - cx, s.pos[i].z - cz)).toBeLessThan(L.ring + 0.5);
  game.expectNoErrors();
});

test('two friends building one tower together earn the friend sticker', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');
  const L = await layout(game);
  const [cx, cz] = L.center;
  for (const [slot, i] of [
    [0, L.tower],
    [1, L.tower + 1]
  ] as const) {
    await pickUp(game, i, cx, cz, slot);
    await game.teleport(slot, cx + 3.6, 0.5, cz);
    await game.seconds(0.3);
    await walkWestAndPlace(game, cx + 1.7, slot);
    // out of the way for the next one
    await game.teleport(slot, cx + 6, 0.5, cz + 4 + slot * 2);
  }
  const s = await blocks(game);
  expect(s.tallest).toBe(5);
  expect(await stickers(game)).toContain('blocks');
  expect(await stickers(game)).toContain('blockfriends');
  game.expectNoErrors();
});

test('playing alone, the buddy fetches blocks for your tower', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const L = await layout(game);
  const [cx, cz] = L.center;
  await page.evaluate(() => (window as any).__silly.useGame.getState().addBuddy());
  await game.seconds(1);
  // put one on the tower ourselves, then stand back and watch
  await pickUp(game, L.tower, cx, cz);
  await game.teleport(0, cx + 3.6, 0.5, cz);
  await game.seconds(0.3);
  await walkWestAndPlace(game, cx + 1.7);
  expect((await blocks(game)).tallest).toBe(L.tower + 1);
  await game.teleport(0, cx + 4, 0.5, cz - 3);
  for (let k = 0; k < 18 && (await blocks(game)).buddySnaps < 1; k += 1) await game.seconds(1);
  const s = await blocks(game);
  expect(s.buddySnaps).toBeGreaterThanOrEqual(1);
  expect(s.tallest).toBeGreaterThanOrEqual(L.tower + 2);
  game.expectNoErrors();
});
