import { test, expect, type Browser } from '@playwright/test';
import { Game } from './game';

// Test mode must be repeatable: the same seed and the same button presses give exactly the
// same game, down to the last bit of every position. Anything that sneaks real time into the
// game (a timer, a shared random number, React finishing late) breaks this test.

async function play(browser: Browser) {
  const page = await browser.newPage();
  const game = new Game(page);
  await game.withPads();
  await game.open(7);
  await game.start();
  await game.join('kb2');
  // a HORIPAD joins too, and jumps, licks and poops along
  await page.evaluate(() => (window as any).__addPad(0, '', 'HORIPAD S (Vendor: 0f0d Product: 00c1)'));
  await game.pad(0, 1);
  await game.seconds(1);
  for (const b of [1, 0, 7, 2, 1]) {
    await game.pad(0, b, 0.2);
    await game.seconds(0.3);
  }
  const k = page.keyboard;
  const trace: unknown[] = [];
  const snap = async () =>
    trace.push(
      await page.evaluate(() => {
        const s = (window as any).__silly;
        const players = [...s.runtime.players.values()].map((p: any) => [p.position.toArray(), p.velocity.toArray(), p.facing, p.belly, p.power, p.size, p.ridingOn, p.flopped]);
        const props = [...s.runtime.props.values()]
          .filter((p: any) => p.enabled && p.getBody())
          .map((p: any) => {
            const t = p.getBody().translation();
            return [p.kind, t.x, t.y, t.z];
          });
        return { players, props, stars: s.useGame.getState().stars, random: Math.random() };
      })
    );

  await game.teleport(0, 18, 1, 8);
  await game.teleport(1, 20, 1, 8);
  await game.seconds(0.5);
  // run, double jump, lick, eat, headbutt, poop, noise, flop
  await k.down('KeyD');
  await game.seconds(0.6);
  await game.tap('Space');
  await game.seconds(0.2);
  await game.tap('Space');
  await k.up('KeyD');
  await game.seconds(0.8);
  await snap();
  await k.down('KeyW');
  await game.tap('KeyQ');
  await game.seconds(0.5);
  await game.tap('KeyQ');
  await game.seconds(0.4);
  await k.up('KeyW');
  await game.tap('KeyE');
  await game.seconds(0.6);
  await game.tap('KeyG');
  await game.seconds(0.8);
  await game.tap('KeyR');
  await game.seconds(0.5);
  await snap();
  await game.tap('KeyF');
  await game.seconds(1.2);
  await k.down('KeyA');
  await game.seconds(0.5);
  await k.up('KeyA');
  await game.tap('Space');
  await game.seconds(1);
  // the second player runs, jumps and headbutts
  await k.down('ArrowLeft');
  await game.seconds(0.7);
  await game.tap('Enter');
  await game.seconds(0.4);
  await k.up('ArrowLeft');
  await game.tap('ShiftRight');
  await game.seconds(0.8);
  await snap();
  // piggyback, hop off, get launched, wander
  await game.teleport(1, 18, 1, 8);
  await game.seconds(1);
  await game.teleport(0, 18, 2.2, 8);
  await game.seconds(1);
  await k.down('ArrowUp');
  await game.seconds(0.8);
  await k.up('ArrowUp');
  await game.tap('Space');
  await game.seconds(1);
  await page.evaluate(() => (window as any).__silly.runtime.players.get(0).launchTo({ x: 0, y: 0, z: 0, clone() { return this; } }, 8));
  await game.seconds(3);
  await snap();
  await k.down('KeyS');
  await k.down('KeyD');
  await game.seconds(3);
  await k.up('KeyS');
  await game.tap('KeyG');
  await game.seconds(2);
  await k.up('KeyD');
  await snap();
  game.expectNoErrors();
  await page.close();
  return trace;
}

test('the same seed and the same presses play out exactly the same twice', async ({ browser }) => {
  const first = await play(browser);
  const second = await play(browser);
  expect(second).toEqual(first);
});
