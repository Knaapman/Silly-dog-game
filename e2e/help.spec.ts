import { expect, test } from '@playwright/test';
import { Game } from './game';

// Help without words, only while it's needed: the kite (paw prints when standing still with it,
// "run!"; the jump bubble once it flies high, "jump!") and the swing (paw prints where a friend can
// stand to push, the headbutt bubble once there). Each goes away as soon as it has worked, isn't
// shown to whoever doesn't need it, and in split screen only the child it's for sees it.

const LAYER = (slot: number) => 1 << (20 + slot);
type Shown = { id: number; action: string; slot: number | null };
const shown = (game: Game) => game.page.evaluate(() => (window as any).__silly.runtime.debugInfo.hintsShown.slice() as Shown[]);
const kite = (game: Game) =>
  game.page.evaluate(() => {
    const k = (window as any).__silly.runtime.debugInfo.kites;
    return {
      h: k.list[0].h as number,
      holder: k.list[0].holder as number | null,
      paws: k.paws[0] as { shown: number; mask: number },
      ranHigh: k.ranHigh.slots as number[],
      glided: k.glided.slots as number[]
    };
  });
const swing = (game: Game, i: number) =>
  game.page.evaluate((i) => {
    const s = (window as any).__silly.runtime.debugInfo.swings;
    return {
      rider: s.seats[i].rider as number | null,
      help: s.help[i] as { shown: number; slots: number[]; mask: number },
      friendPushes: s.friendPushes as number,
      pushers: s.pushers.slots as number[]
    };
  }, i);
const swingsLayout = (game: Game) =>
  game.page.evaluate(() => (window as any).__silly.layout.SWINGS as { center: [number, number]; seats: number; spacing: number });
const seatX = (S: { center: [number, number]; seats: number; spacing: number }, i: number) => S.center[0] + (i - (S.seats - 1) / 2) * S.spacing;

async function pickUpKite(game: Game, slot = 0) {
  const spool = (await game.props('kite'))[0];
  await game.hopTo(slot, [spool.x, spool.z - 3.2], [spool.x, spool.z - 1.2]);
  await game.tap(slot ? 'ControlRight' : 'KeyQ');
  await game.seconds(0.2);
  expect((await kite(game)).holder).toBe(slot);
}

/** Run to and fro across the hill top, noting the most the paw prints showed. */
async function runAbout(game: Game, seconds: number) {
  let paws = 0;
  for (let t = 0; t < seconds; t += 1.2) {
    const key = Math.round(t / 1.2) % 2 ? 'KeyA' : 'KeyD';
    await game.page.keyboard.down(key);
    for (let k = 0; k < 4; k += 1) {
      await game.seconds(0.3);
      paws = Math.max(paws, (await kite(game)).paws.shown);
    }
    await game.page.keyboard.up(key);
  }
  return paws;
}

test('kite: standing still with it, paw prints say "run"; they go once you run, and for good once it has flown high', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  // next to the spools, the lick bubble shows; holding one, it doesn't any more
  const spool = (await game.props('kite'))[0];
  await game.teleport(0, spool.x, 0.1, spool.z - 1.4);
  await game.seconds(0.6);
  expect((await shown(game)).filter((h) => h.action === 'lick')).toHaveLength(1);
  await pickUpKite(game);
  await game.seconds(0.6);
  expect((await shown(game)).filter((h) => h.action === 'lick')).toHaveLength(0);

  // standing still: nothing at first (no hurry), then the paw prints, for this child's view
  await game.seconds(1.2);
  expect((await kite(game)).paws.shown).toBe(0);
  await game.seconds(2);
  let k = await kite(game);
  expect(k.paws.shown).toBeGreaterThan(0.9);
  expect(k.paws.mask).toBe(LAYER(0));
  await game.seconds(0.1, true);
  await game.screenshot('test-results/help-kite-paws.png');

  // running: they fade straight away
  await page.keyboard.down('KeyD');
  await game.seconds(0.8);
  await page.keyboard.up('KeyD');
  expect((await kite(game)).paws.shown).toBe(0);

  // run till it flies high: from then on no more paw prints, however long you stand still
  await runAbout(game, 7.2);
  k = await kite(game);
  expect(k.ranHigh).toContain(0);
  await game.seconds(5);
  expect((await kite(game)).paws.shown).toBe(0);
  game.expectNoErrors();
});

test('kite: running with it straight away, no paw prints at all; flying high without jumping, the jump bubble, gone after one float', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await pickUpKite(game);
  // off at once: never any paw prints
  expect(await runAbout(game, 7.2)).toBe(0);
  // up high and still on the ground: the jump bubble, over this child, for this child
  await page.keyboard.down('KeyD');
  await game.seconds(0.8);
  expect((await kite(game)).h).toBeGreaterThan(0.6);
  let jump = (await shown(game)).filter((h) => h.action === 'jump');
  expect(jump).toHaveLength(1);
  expect(jump[0].slot).toBe(0);
  await game.seconds(0.1, true);
  await game.screenshot('test-results/help-kite-jump.png');
  // jump: it floats, and the bubble goes
  await game.tap('Space');
  await game.seconds(0.6);
  expect((await kite(game)).glided).toContain(0);
  expect((await shown(game)).filter((h) => h.action === 'jump')).toHaveLength(0);
  // and doesn't come back, however long the kite stays up
  await page.keyboard.up('KeyD');
  await runAbout(game, 4.8);
  await page.keyboard.down('KeyD');
  await game.seconds(0.6);
  await page.keyboard.up('KeyD');
  expect((await kite(game)).h).toBeGreaterThan(0.6);
  expect((await shown(game)).filter((h) => h.action === 'jump')).toHaveLength(0);
  game.expectNoErrors();
});

test('kite in split screen: the paw prints are only in the view of the child holding it', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');
  const farm = await page.evaluate(() => (window as any).__silly.layout.ZONES.farm as [number, number]);
  await game.teleport(1, farm[0], 1, farm[1]);
  await pickUpKite(game);
  await game.seconds(4);
  const k = await kite(game);
  expect(k.paws.shown).toBeGreaterThan(0.9);
  const cams = await page.evaluate(() => {
    const v = (window as any).__silly.views.views;
    return { split: v.split as boolean, list: v.list.map((x: any) => ({ slot: x.slot as number, mask: x.cam.layers.mask as number })) };
  });
  expect(cams.split).toBe(true);
  const mine = cams.list.find((c) => c.slot === 0)!;
  const theirs = cams.list.find((c) => c.slot === 1)!;
  // drawn where the prints' layer and the camera's layers meet
  expect(mine.mask & k.paws.mask).not.toBe(0);
  expect(theirs.mask & k.paws.mask).toBe(0);
  await game.seconds(0.1, true);
  await game.screenshot('test-results/help-kite-split.png');
  game.expectNoErrors();
});

test('swing with a friend: paw prints show the friend where to stand, the headbutt bubble once there; gone after a push, and the rider jumps when they like', async ({
  page
}) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');
  const S = await swingsLayout(game);
  const [, cz] = S.center;
  const x = seatX(S, 2);
  // the friend far off; the first child sits down
  await game.teleport(1, x - 20, 0.1, cz - 6);
  await game.teleport(0, x, 0.1, cz + 1.6);
  await game.seconds(0.4);
  await game.hold('KeyW', 0.7);
  expect((await swing(game, 2)).rider).toBe(0);
  await game.seconds(3);
  // (the friend is too far away to be bothered)
  expect((await swing(game, 2)).help.shown).toBe(0);

  // the friend comes closer: after the rider has sat a moment, the paw prints, for the friend only
  await game.teleport(1, x + 5, 0.1, cz - 5);
  await game.seconds(1);
  let s = await swing(game, 2);
  expect(s.help.shown).toBeGreaterThan(0.9);
  expect(s.help.slots).toEqual([1]);
  expect(s.help.mask).toBe(LAYER(1));
  expect((await shown(game)).filter((h) => h.action === 'bonk')).toHaveLength(0);
  await game.seconds(0.1, true);
  await game.screenshot('test-results/help-swing-paws.png');

  // standing there: the headbutt bubble, just for the friend
  await game.hopTo(1, [x, cz - 4], [x, cz - 1.3]);
  await game.seconds(0.3);
  const bonk = (await shown(game)).filter((h) => h.action === 'bonk');
  expect(bonk).toHaveLength(1);
  expect(bonk[0].slot).toBe(1);
  await game.tap('ShiftRight');
  await game.seconds(0.1);
  s = await swing(game, 2);
  expect(s.friendPushes).toBe(1);
  expect(s.pushers).toEqual([1]);
  // pushed: the help goes
  await game.seconds(0.6);
  expect((await swing(game, 2)).help.shown).toBe(0);
  expect((await shown(game)).filter((h) => h.action === 'bonk')).toHaveLength(0);

  // the rider stays on, swinging, until they jump themselves
  await game.seconds(4);
  expect((await swing(game, 2)).rider).toBe(0);
  await game.tap('Space');
  await game.seconds(0.2);
  expect((await swing(game, 2)).rider).toBeNull();

  // sitting down again later: the friend knows how now, no more paw prints
  await game.seconds(2.5);
  await game.teleport(0, x, 0.1, cz + 1.6);
  await game.teleport(1, x + 5, 0.1, cz - 5);
  await game.seconds(1.5);
  await game.hold('KeyW', 0.7);
  expect((await swing(game, 2)).rider).toBe(0);
  await game.seconds(3);
  expect((await swing(game, 2)).help.shown).toBe(0);
  game.expectNoErrors();
});

test('swing playing alone: the buddy pushes, no paw prints for anyone, and the child jumps off when they choose', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const S = await swingsLayout(game);
  const [, cz] = S.center;
  const x = seatX(S, 3);
  await game.teleport(0, x, 0.1, cz + 1.6);
  await game.seconds(0.4);
  await page.evaluate(() => (window as any).__silly.useGame.getState().addBuddy());
  await game.seconds(1);
  await game.hold('KeyW', 0.7);
  expect((await swing(game, 3)).rider).toBe(0);
  let most = 0;
  for (let k = 0; k < 24; k += 1) {
    await game.seconds(0.5);
    const s = await swing(game, 3);
    most = Math.max(most, s.help.shown);
    expect(s.rider).toBe(0);
    expect((await shown(game)).filter((h) => h.action === 'bonk')).toHaveLength(0);
  }
  expect(most).toBe(0);
  expect(await page.evaluate(() => (window as any).__silly.runtime.debugInfo.swingHelp.pushes)).toBeGreaterThanOrEqual(2);
  await game.tap('Space');
  await game.seconds(0.2);
  expect((await swing(game, 3)).rider).toBeNull();
  game.expectNoErrors();
});

test('learned help belongs to the child, not the player number: a new child in the same slot gets it again', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  await game.join('kb2');
  // slot 1 learned the kite with a controller, then that child left and another took the slot on
  // the keyboard: the paw prints are back for them
  await page.evaluate(() => (window as any).__silly.runtime.debugInfo.kites.ranHigh.add({ slot: 1, source: 'pad0' }));
  await pickUpKite(game, 1);
  await game.seconds(4);
  expect((await kite(game)).paws.shown).toBeGreaterThan(0.9);
  expect((await kite(game)).paws.mask).toBe(LAYER(1));
  // but for the very child who learned it (this slot, this controller): none
  await page.evaluate(() => (window as any).__silly.runtime.debugInfo.kites.ranHigh.add({ slot: 1, source: 'kb2' }));
  await game.seconds(1);
  expect((await kite(game)).paws.shown).toBe(0);
  // and the buddy never "learns" for whoever comes after it
  await page.evaluate(() => (window as any).__silly.runtime.debugInfo.swings.pushers.add({ slot: 2, source: 'bot', bot: true }));
  expect(await page.evaluate(() => (window as any).__silly.runtime.debugInfo.swings.pushers.slots)).toEqual([]);
  game.expectNoErrors();
});
