import { expect, test } from '@playwright/test';
import { Game } from './game';

// Every animal has a trick of its own, on the buttons it already has. Each one is checked
// against the dog doing the same thing.

const be = (game: Game, species: string) => game.page.evaluate((s) => (window as any).__silly.useGame.getState().setSpecies(0, s), species);
const stickers = (game: Game) => game.page.evaluate(() => [...(window as any).__silly.useStickers.getState().got] as string[]);
const ground = (game: Game, x: number, z: number) => game.page.evaluate(([x, z]) => (window as any).__silly.terrain.groundHeight(x, z) as number, [x, z] as const);

async function fresh(page: import('@playwright/test').Page) {
  const game = new Game(page);
  await game.open();
  await game.start();
  return game;
}

test('duck: swims fast, and glides down holding jump', async ({ page }) => {
  const game = await fresh(page);
  const swim = async (species: string) => {
    await be(game, species);
    await game.teleport(0, -10, 1, 51);
    await game.seconds(0.8);
    const z0 = (await game.player()).z;
    await game.hold('KeyS', 0.8);
    return (await game.player()).z - z0;
  };
  const dog = await swim('dog');
  const duck = await swim('duck');
  expect(duck).toBeGreaterThan(dog * 1.4);

  // off a height: the dog drops, the duck holding jump floats down
  const fall = async (species: string) => {
    await be(game, species);
    await game.teleport(0, 12, 10, -4);
    await page.keyboard.down('Space');
    await game.seconds(2);
    const y = (await game.player()).y - (await ground(game, 12, -4));
    await page.keyboard.up('Space');
    await game.seconds(2.5);
    return y;
  };
  expect(await fall('dog')).toBeLessThan(1.2);
  expect(await fall('duck')).toBeGreaterThan(4);
  expect(await stickers(game)).toContain('glide');
  game.expectNoErrors();
});

test('unicorn: a third jump; sheep: bouncy landings; pig: a fart jump', async ({ page }) => {
  const game = await fresh(page);
  const g = await ground(game, 12, -4);
  const jumps = async (species: string) => {
    await be(game, species);
    await game.teleport(0, 12, 1, -4);
    await game.seconds(1);
    let top = -9;
    for (let i = 0; i < 3; i += 1) {
      await game.tap('Space');
      for (let k = 0; k < 4; k += 1) {
        await game.seconds(0.08);
        top = Math.max(top, (await game.player()).y);
      }
    }
    top = Math.max(top, await game.maxY(0, 1));
    await game.seconds(1.5);
    return top - g;
  };
  const dog = await jumps('dog');
  const unicorn = await jumps('unicorn');
  expect(unicorn).toBeGreaterThan(dog + 1);
  expect(await stickers(game)).toContain('unijump');

  // dropped from 7 m: the sheep bounces back up, the dog stays down
  const bounce = async (species: string) => {
    await be(game, species);
    await game.teleport(0, 12, 7, -4);
    let low = 99;
    let after = -9;
    for (let i = 0; i < 25; i += 1) {
      await game.seconds(0.05);
      const y = (await game.player()).y - g;
      if (y < low) low = y;
      else if (low < 1) after = Math.max(after, y);
    }
    await game.seconds(2);
    return after - low;
  };
  expect(await bounce('dog')).toBeLessThan(0.5);
  expect(await bounce('sheep')).toBeGreaterThan(1.5);
  // (just dropping in doesn't earn the sticker: a double jump does)
  expect(await stickers(game)).not.toContain('sheepbounce');
  await game.teleport(0, 12, 1, -4);
  await game.seconds(1);
  await game.tap('Space');
  await game.seconds(0.35);
  await game.tap('Space');
  await game.seconds(2);
  expect(await stickers(game)).toContain('sheepbounce');

  // an empty tummy's toot: a little hop for the dog, a fart jump for the pig
  const toot = async (species: string) => {
    await be(game, species);
    await game.teleport(0, 12, 1, -4);
    await game.seconds(1);
    await game.tap('KeyG');
    const top = await game.maxY(0, 1);
    await game.seconds(1);
    return top - g;
  };
  expect(await toot('dog')).toBeLessThan(1.4);
  expect(await toot('pig')).toBeGreaterThan(2.4);
  expect(await stickers(game)).toContain('pigfart');
  game.expectNoErrors();
});

test('goat: a mighty headbutt; cow: a moo that knocks things over', async ({ page }) => {
  const game = await fresh(page);
  // a ball on the sports field, headbutted from the west
  const ball = await page.evaluate(() => {
    const p = [...(window as any).__silly.runtime.props.values()].find((p: any) => p.kind === 'ball');
    const t = p.getBody().translation();
    return { id: p.id, x: t.x, z: t.z };
  });
  const headbutt = async (species: string) => {
    await be(game, species);
    await page.evaluate(({ id, x, z }) => {
      const s = (window as any).__silly;
      const b = s.runtime.props.get(id).getBody();
      b.setTranslation({ x, y: s.terrain.groundHeight(x, z) + 0.6, z }, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }, ball);
    await game.teleport(0, ball.x - 2.2, 1, ball.z);
    await game.seconds(1);
    await game.hold('KeyD', 0.15);
    await game.tap('KeyE');
    let fastest = 0;
    for (let i = 0; i < 6; i += 1) {
      await game.seconds(0.05);
      fastest = Math.max(
        fastest,
        await page.evaluate((id) => {
          const v = (window as any).__silly.runtime.props.get(id).getBody().linvel();
          return Math.hypot(v.x, v.z);
        }, ball.id)
      );
    }
    await game.seconds(2);
    return fastest;
  };
  const dog = await headbutt('dog');
  const goat = await headbutt('goat');
  expect(dog).toBeGreaterThan(1);
  expect(goat).toBeGreaterThan(dog * 1.4);
  expect(await stickers(game)).toContain('goatbonk');

  // the cow moos next to the bowling pins: over they go
  const pins = () => game.props('pin');
  const before = await pins();
  const [px, pz] = [before[0].x, before[0].z];
  await be(game, 'cow');
  await game.teleport(0, px, 1, pz + 3);
  await game.seconds(1);
  await game.tap('KeyR');
  await game.seconds(1);
  const after = await pins();
  const moved = after.filter((p, i) => Math.hypot(p.x - before[i].x, p.z - before[i].z) > 0.3).length;
  expect(moved).toBeGreaterThanOrEqual(3);
  expect(await stickers(game)).toContain('moo');
  game.expectNoErrors();
});

test('cat: walk into a tree to climb it, jump to hop down', async ({ page }) => {
  const game = await fresh(page);
  const [tx, tz] = [13, -13]; // a tree by the lawn
  const g = await ground(game, tx, tz);
  // the dog just bumps into the trunk
  await game.teleport(0, tx, 1, tz + 1.6);
  await game.seconds(0.8);
  await game.hold('KeyW', 1);
  expect((await game.player()).y - g).toBeLessThan(1.2);

  await be(game, 'cat');
  await game.teleport(0, tx, 1, tz + 1.6);
  await game.seconds(0.8);
  await game.hold('KeyW', 1.2);
  await game.seconds(0.5);
  expect((await game.player()).y - g).toBeGreaterThan(1.5);
  expect(await stickers(game)).toContain('climb');
  // sits there happily...
  await game.seconds(2);
  expect((await game.player()).y - g).toBeGreaterThan(1.5);
  await game.screenshot('test-results/cat-in-a-tree.png');
  // ...until it jumps down
  await game.tap('Space');
  await game.seconds(2);
  expect((await game.player()).y - g).toBeLessThan(1);
  game.expectNoErrors();
});
