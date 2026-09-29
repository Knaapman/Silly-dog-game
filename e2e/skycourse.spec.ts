import { expect, test, type Page } from '@playwright/test';
import { Game } from './game';

// The sky course, climbed the way a child does it: push the stick towards the next bit, press
// jump, steer. Every step has to be makeable like that (the bouncy cloud does the big one).

type Spot = { x: number; z: number; top: number };

async function course(page: Page) {
  return page.evaluate(() => {
    const C = (window as any).__silly.layout.SKY_COURSE;
    const at = (a: number[], top: number) => ({ x: a[0], z: a[1], top });
    return {
      stumps: C.stumps.map((s: any) => at(s.at, s.top)),
      p1: at(C.platforms[0].at, C.platforms[0].top),
      disc: at(C.disc.at, C.disc.top),
      p2: at(C.platforms[1].at, C.platforms[1].top),
      slider: { z: C.slider.z, from: C.slider.from, to: C.slider.to, top: C.slider.top, period: C.slider.period },
      bouncer: at(C.bouncer.at, C.bouncer.top),
      cloud: at(C.cloud.at, C.cloud.top),
      planks: C.planks.map((p: any) => at(p.at, p.top)),
      top: at(C.top.at, C.top.top),
      bell: { x: C.bell[0], z: C.bell[1] },
      pad: { x: C.pad[0], z: C.pad[1] },
      rainbowPad: { x: C.rainbowPad[0], z: C.rainbowPad[1] },
      rainbowTarget: { x: C.rainbowTarget[0], z: C.rainbowTarget[1] }
    } as Record<string, any>;
  });
}

/** Put the animal somewhere at an absolute height (the platforms float). */
const place = (game: Game, x: number, y: number, z: number) =>
  game.page.evaluate(
    ([x, y, z]) => {
      const b = (window as any).__silly.runtime.players.get(0).getBody();
      b.setTranslation({ x, y, z }, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    },
    [x, y, z] as const
  );
const reached = (game: Game) => game.page.evaluate(() => (window as any).__silly.useSkyCourse.getState().reached as number);
const time = (game: Game) => game.page.evaluate(() => (window as any).__silly.clock.gameClock.time as number);

/**
 * Run at `to` and jump: jump once close enough, steer while in the air, let go of the stick over
 * the target. `double`: a second jump on the way (small kids mash jump anyway).
 */
async function jumpTo(game: Game, to: { x: number; z: number }, { jumpAt = 2.4, double = false, noJump = false } = {}) {
  const page = game.page;
  const held = new Set<string>();
  const steer = async (dx: number, dz: number) => {
    const len = Math.hypot(dx, dz) || 1;
    const want = new Set<string>();
    if (dx / len > 0.38) want.add('KeyD');
    if (dx / len < -0.38) want.add('KeyA');
    if (dz / len > 0.38) want.add('KeyS');
    if (dz / len < -0.38) want.add('KeyW');
    if (Math.hypot(dx, dz) < 0.3) want.clear();
    for (const k of [...held]) if (!want.has(k)) {
      await page.keyboard.up(k);
      held.delete(k);
    }
    for (const k of want) if (!held.has(k)) {
      await page.keyboard.down(k);
      held.add(k);
    }
  };
  let jumped = noJump;
  let doubled = false;
  let air = 0;
  for (let i = 0; i < 70; i += 1) {
    const p = await game.player();
    // a pad or the bouncy cloud took over: hands off until it's done
    if (p.launched) break;
    const d = Math.hypot(to.x - p.x, to.z - p.z);
    await steer(to.x - p.x, to.z - p.z);
    if (!jumped && d < jumpAt) {
      await game.tap('Space');
      jumped = true;
    } else if (jumped && double && !doubled && air > 0.3) {
      await game.tap('Space');
      doubled = true;
    }
    await game.seconds(0.05);
    air += 0.05;
    if (jumped && air > 0.9 && d < 0.6) break;
  }
  await steer(0, 0);
  for (let i = 0; i < 60 && (await game.player()).launched; i += 1) await game.seconds(0.1);
  await game.seconds(0.6);
  return game.player();
}

const on = (p: { x: number; y: number; z: number }, s: Spot, half = 1.2) => Math.abs(p.x - s.x) < half + 0.3 && Math.abs(p.z - s.z) < half + 0.3 && p.y > s.top && p.y < s.top + 1.3;

test('climb the sky course with the stick and the jump button, ring the bell, rainbow back down', async ({ page }) => {
  test.setTimeout(240_000);
  const game = new Game(page);
  await game.open();
  await game.start();
  const c = await course(page);
  const [s1, s2, s3] = c.stumps as Spot[];

  // up the stumps (little hops) to the first platform
  await place(game, s1.x, s1.top + 0.6, s1.z);
  await game.seconds(0.8);
  expect(on(await jumpTo(game, s2), s2, 0.9)).toBe(true);
  expect(on(await jumpTo(game, s3), s3, 0.9)).toBe(true);
  expect(on(await jumpTo(game, c.p1, { jumpAt: 2.6 }), c.p1, 1.5)).toBe(true);
  expect(await reached(game)).toBe(1);

  // onto the spinning disc, and off it to the second platform
  expect(on(await jumpTo(game, { x: c.disc.x, z: c.disc.z + 1 }, { jumpAt: 3.4 }), c.disc, 2.2)).toBe(true);
  expect(on(await jumpTo(game, c.p2, { jumpAt: 3.2 }), c.p2, 1.5)).toBe(true);
  expect(await reached(game)).toBe(2);

  // wait for the sliding platform to come to this end, hop on, ride it over
  const period = c.slider.period;
  const t = await time(game);
  await game.seconds(period - (t % period) - 0.2);
  const aboard = await jumpTo(game, { x: c.slider.from + 0.6, z: c.slider.z }, { jumpAt: 3 });
  // (on the slider: at its height, east of the second platform, and it carries us along)
  expect(aboard.y).toBeGreaterThan(c.slider.top);
  expect(aboard.x).toBeGreaterThan(c.p2.x + 1.6);
  // ride it to the far end
  const t2 = await time(game);
  await game.seconds((((period / 2 - (t2 % period)) % period) + period) % period);
  const ride = await game.player();
  expect(ride.x).toBeGreaterThan(c.slider.to - 1);
  // step onto the bouncy cloud and steer north: up onto the cloud
  await page.keyboard.down('KeyD');
  let bounced = false;
  for (let i = 0; i < 40 && !bounced; i += 1) {
    await game.seconds(0.05);
    bounced = (await game.player()).y > c.bouncer.top + 1.5;
  }
  await page.keyboard.up('KeyD');
  expect(bounced).toBe(true);
  // up we go: steer onto the cloud
  const onCloud = await jumpTo(game, { x: c.cloud.x, z: c.cloud.z }, { noJump: true });
  expect(on(onCloud, c.cloud, 1.5), JSON.stringify(onCloud)).toBe(true);
  expect(await reached(game)).toBe(3);

  // the wobbly planks, and up onto the top
  for (const plank of c.planks as Spot[]) {
    const p = await jumpTo(game, plank, { jumpAt: 2.6 });
    expect(on(p, { ...plank, top: plank.top - 0.3 }, 0.9), `plank ${JSON.stringify(plank)}: ${JSON.stringify(p)}`).toBe(true);
  }
  expect(on(await jumpTo(game, c.top, { jumpAt: 3 }), c.top, 1.8)).toBe(true);
  expect(await reached(game)).toBe(4);
  await game.screenshot('test-results/sky-course-top.png');

  // ring the bell
  await jumpTo(game, { x: c.bell.x, z: c.bell.z + 0.6 }, { noJump: true });
  await game.seconds(0.5);
  expect(await page.evaluate(() => (window as any).__silly.useStickers.getState().got)).toContain('course');

  // the rainbow pad flies you down, over the whole course
  await jumpTo(game, c.rainbowPad, { noJump: true });
  await game.seconds(4);
  const down = await game.player();
  expect(Math.hypot(down.x - c.rainbowTarget.x, down.z - c.rainbowTarget.z)).toBeLessThan(2.5);
  expect(down.y).toBeLessThan(2.5);
  game.expectNoErrors();
});

test('fell off? the pad at the start flies you back up to the highest flag', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const c = await course(page);
  // nobody has got anywhere yet: the pad does nothing
  await game.teleport(0, c.pad.x, 1, c.pad.z);
  await game.seconds(2);
  expect((await game.player()).y).toBeLessThan(2.5);

  // someone reaches the second flag, then falls off
  await place(game, c.p2.x, c.p2.top + 0.6, c.p2.z);
  await game.seconds(1);
  expect(await reached(game)).toBe(2);
  await game.teleport(0, c.pad.x + 3, 1, c.pad.z);
  await game.seconds(1);
  await jumpTo(game, c.pad, { noJump: true });
  await game.seconds(3);
  expect(on(await game.player(), c.p2, 1.5)).toBe(true);
  game.expectNoErrors();
});

test('you can jump off anything that moves: the carousel, a wobbly plank', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const [cx, cz] = await page.evaluate(() => (window as any).__silly.layout.CAROUSEL.center as [number, number]);
  const plank = (await course(page)).planks[0] as Spot;
  for (const [x, y, z] of [[cx + 3.5, 1, cz], [plank.x, plank.top + 0.6, plank.z]]) {
    await place(game, x, y, z);
    await game.seconds(1);
    const y0 = (await game.player()).y;
    await game.tap('Space');
    expect(await game.maxY(0, 0.6)).toBeGreaterThan(y0 + 1.5);
    await game.seconds(1);
  }
  game.expectNoErrors();
});
