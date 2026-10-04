import { expect, test } from '@playwright/test';
import { Game } from './game';

// Every sticker can be earned by playing. Most are earned in the test for their own attraction;
// these are the rest, each got the way a child gets it (a headbutt, a jump, a poop, a tune...).
// Where a step is only waiting or repetition (a full party meter, eleven stars already found), the
// test starts from there and plays the last step.

let game: Game;
const got = () => game.page.evaluate(() => (window as any).__silly.useStickers.getState().got as string[]);
/** Run the game until sticker `id` is earned (or give up after `max` seconds). */
async function until(id: string, max: number) {
  for (let t = 0; t < max; t += 0.5) {
    if ((await got()).includes(id)) return true;
    await game.seconds(0.5);
  }
  return (await got()).includes(id);
}
const layout = <T>(name: string) => game.page.evaluate((n) => (window as any).__silly.layout[n], name) as Promise<T>;
/** The headbuttable thing (tree, statue, egg...) nearest a spot. */
const staticNear = (x: number, z: number) =>
  game.page.evaluate(
    ([x, z]) => {
      let best: { x: number; y: number; z: number; radius: number; d: number } | null = null;
      (window as any).__silly.runtime.statics.forEach((s: any) => {
        const d = Math.hypot(s.position.x - x, s.position.z - z);
        if (!best || d < best.d) best = { x: s.position.x, y: s.position.y, z: s.position.z, radius: s.radius, d };
      });
      return best as unknown as { x: number; y: number; z: number; radius: number; d: number };
    },
    [x, z] as const
  );
/** Hop in from the south so we face it, then headbutt. */
async function headbutt(x: number, z: number, radius: number) {
  await game.hopTo(0, [x, z + radius + 4], [x, z + radius + 1]);
  await game.tap('KeyE');
  await game.seconds(0.6);
}

test.beforeEach(async ({ page }) => {
  game = new Game(page);
  await game.open();
  await game.start();
});
test.afterEach(() => game.expectNoErrors());

test('goal: headbutt the football into the goal', async () => {
  const S = await layout<{ goalCenter: [number, number, number] }>('SOCCER');
  const [gx, , gz] = S.goalCenter;
  for (let k = 0; k < 10 && !(await got()).includes('goal'); k += 1) {
    const [b] = await game.props('soccer');
    // stand behind the ball, on the line from the goal through it, and headbutt it goalwards
    const dx = b.x - gx;
    const dz = b.z - gz;
    const d = Math.hypot(dx, dz) || 1;
    await game.hopTo(0, [b.x + (dx / d) * 4, b.z + (dz / d) * 4], [b.x + (dx / d) * 1.3, b.z + (dz / d) * 1.3]);
    await game.tap('KeyE');
    await game.seconds(2);
  }
  expect(await until('goal', 2)).toBe(true);
});

test('strike: headbutt the bowling ball down the lane into the pins', async () => {
  const [b] = await game.props('bowling');
  // the pins are up the lane to the north; stand behind the ball (in front of the hamster balls)
  await game.hopTo(0, [b.x, b.z + 2.6], [b.x, b.z + 1.3]);
  await game.tap('KeyE');
  expect(await until('strike', 8)).toBe(true);
});

test('bell: headbutt the high striker pad', async () => {
  const H = await layout<{ position: [number, number, number] }>('HIGH_STRIKER');
  const [x, , z] = H.position;
  const pad = await staticNear(x, z + 1);
  await headbutt(pad.x, pad.z, pad.radius);
  expect(await until('bell', 3)).toBe(true);
});

test('belly flop: land hard from high up', async () => {
  await game.teleport(0, 12, 14, -4);
  expect(await until('bellyflop', 4)).toBe(true);
});

test('roar: headbutt the T-rex', async () => {
  const T = await layout<{ position: [number, number, number] }>('TREX');
  const s = await staticNear(T.position[0], T.position[2]);
  await headbutt(s.x, s.z, s.radius);
  expect(await until('roar', 2)).toBe(true);
});

test('dino: headbutt an egg and a baby dino hatches', async () => {
  const N = await layout<{ center: [number, number] }>('EGG_NEST');
  const egg = await staticNear(N.center[0], N.center[1] + 2);
  await headbutt(egg.x, egg.z, egg.radius);
  expect(await until('dino', 2)).toBe(true);
});

test('windmill: headbutt the windmill', async () => {
  const W = await layout<{ position: [number, number, number] }>('WINDMILL');
  const s = await staticNear(W.position[0], W.position[2]);
  await headbutt(s.x, s.z, s.radius);
  expect(await until('windmill', 2)).toBe(true);
});

test('hat: walk into the present box', async () => {
  const H = await layout<{ position: [number, number, number]; size: number }>('HAT_BOX');
  await game.teleport(0, H.position[0], 0.6, H.position[2] + 4);
  await game.seconds(0.5);
  await game.hold('KeyW', 1.2);
  expect(await until('hat', 2)).toBe(true);
});

test('balloon: jump into a floating balloon', async () => {
  const B = await layout<[number, number, number][]>('BALLOONS');
  const [x, , z] = B[0];
  await game.teleport(0, x, 0.6, z);
  await game.seconds(0.6);
  await game.tap('Space');
  expect(await until('balloon', 2)).toBe(true);
});

test('golden: a full tummy sometimes makes a golden poop', async () => {
  for (let k = 0; k < 12 && !(await got()).includes('golden'); k += 1) {
    await game.page.evaluate(() => {
      const p = (window as any).__silly.runtime.players.get(0);
      for (let i = 0; i < 5; i += 1) p.feed();
    });
    await game.seconds(0.3);
    for (let i = 0; i < 5; i += 1) await game.tap('KeyG');
    await game.seconds(2);
    await game.page.evaluate(() => (window as any).__silly.useGame.getState().resetPark());
    await game.seconds(0.5);
  }
  expect(await got()).toContain('golden');
});

test('party: the party meter fills up', async () => {
  // nearly full already (every silly thing fills it a little); one more headbutt does it
  await game.page.evaluate(() => (window as any).__silly.useGame.setState({ party: 0.99 }));
  await game.tap('KeyE');
  expect(await until('party', 2)).toBe(true);
});

test('all the stars: find the last one', async () => {
  // eleven found already: the last is in the middle of the maze
  await game.page.evaluate(() => {
    const g = (window as any).__silly.useGame;
    g.setState({ stars: g.getState().stars.map((_: boolean, i: number) => i !== 9) });
  });
  const M = await layout<{ center: [number, number] }>('MAZE');
  await game.teleport(0, M.center[0], 0.5, M.center[1]);
  expect(await until('allstars', 3)).toBe(true);
});

test('snowball: a big rolled snowball, headbutted to bits', async () => {
  const ball = (call: string, ...args: number[]) =>
    game.page.evaluate(([call, args]) => (window as any).__silly.runtime.debugInfo.snowballs[0][call](...args), [call, args] as const);
  // roll it through the snow until it's big (like pushing it about)
  for (let k = 0; k < 40 && ((await ball('radius')) as number) < 1.15; k += 1) {
    await ball('place', 15.5, -56.5);
    await game.seconds(0.1);
    for (let j = 0; j < 3; j += 1) {
      await ball('roll', -6, 0);
      await game.seconds(0.4);
    }
  }
  await ball('roll', 0, 0);
  await game.seconds(1);
  expect((await ball('radius')) as number).toBeGreaterThanOrEqual(1.1);
  const p = (await ball('position')) as { x: number; z: number };
  const r = (await ball('radius')) as number;
  await headbutt(p.x, p.z, r);
  expect(await until('snowball', 2)).toBe(true);
});

test('bird bonk: jump into a flock as it takes off', async () => {
  test.setTimeout(120000);
  for (let k = 0; k < 12 && !(await got()).includes('birdbonk'); k += 1) {
    const f = await game.page.evaluate(() => {
      const fl = (window as any).__silly.chase.flocks.filter((f: any) => f && f.landed);
      const f = fl[0];
      return f ? { x: f.center.x as number, z: f.center.z as number } : null;
    });
    if (!f) {
      await game.seconds(2);
      continue;
    }
    // land right in among them, and jump as they burst up
    await game.teleport(0, f.x, 0.6, f.z);
    await game.seconds(0.15);
    await game.tap('Space');
    await game.seconds(1.2);
  }
  expect(await got()).toContain('birdbonk');
});

test('poop birds: leave a poop lying about, and a flock comes to peck at it while you watch', async () => {
  test.setTimeout(240000);
  await game.page.evaluate(() => (window as any).__silly.runtime.players.get(0).feed());
  await game.teleport(0, 12, 0.6, -4);
  await game.seconds(0.5);
  await game.tap('KeyG');
  await game.seconds(1);
  // step back (birds won't come while you stand right by it) and watch from nearby
  await game.teleport(0, 12, 0.6, 8);
  expect(await until('poopbirds', 200)).toBe(true);
});

test('big tune: copy the songbird all the way up to a six-note tune', async () => {
  test.setTimeout(240000);
  const L = await layout<{ center: [number, number]; pitch: number }>('XYLOPHONE');
  const keyX = (i: number) => L.center[0] + (i - 3.5) * L.pitch;
  const xylo = () => game.page.evaluate(() => JSON.parse(JSON.stringify((window as any).__silly.runtime.debugInfo.xylophone)) as { phase: string; tune: number[] });
  const hit = async (i: number) => {
    await game.teleport(0, keyX(i), 1.6, L.center[1] + 0.5);
    await game.seconds(0.45);
  };
  await game.teleport(0, L.center[0], 1, L.center[1] + 4);
  for (let round = 0; round < 4; round += 1) {
    for (let t = 0; t < 300 && (await xylo()).phase !== 'listen'; t += 1) await game.seconds(0.1);
    const s = await xylo();
    expect(s.phase).toBe('listen');
    expect(s.tune).toHaveLength(3 + round);
    for (const k of s.tune) await hit(k);
    await game.teleport(0, L.center[0], 1, L.center[1] + 4);
    await game.seconds(1);
  }
  expect(await got()).toContain('bigtune');
});
