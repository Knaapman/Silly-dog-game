import { expect, test } from '@playwright/test';
import { Game } from './game';

// Mirrors pegPosition() in HatRack.tsx: heads in unlock order along x, facing the plaza.
const RACK = { x: -4.85, z: -10.3, spacing: 0.85, count: 7 };
const pegX = (i: number) => RACK.x + (i - (RACK.count - 1) / 2) * RACK.spacing;

test('stars unlock hats: the finder wears the new one, the rack has the rest', async ({ page }) => {
  const game = new Game(page);
  await game.open();
  await game.start();
  const hat = () => game.state<string>('(g) => g.players[0].hat');

  // at first only the party hat: Start (2 on the keyboard) goes none -> party -> none
  expect(await hat()).toBe('none');
  await game.tap('Digit2');
  expect(await hat()).toBe('party');
  await game.tap('Digit2');
  expect(await hat()).toBe('none');

  // a locked hat on the rack (the propeller) can't be worn yet
  const walkInto = async (i: number) => {
    await game.teleport(0, pegX(i), 1, RACK.z + 2);
    await game.seconds(0.5);
    await game.hold('KeyW', 0.8);
    await game.seconds(0.3);
  };
  await walkInto(2);
  expect(await hat()).toBe('none');

  // the first star unlocks the crown, and whoever found it wears it
  await game.teleport(0, 0, 4.6, -2);
  await game.seconds(0.5);
  expect(await page.evaluate(() => (window as any).__silly.useProgress.getState().starsEver)).toBe(1);
  expect(await hat()).toBe('crown');
  await expect(page.getByTestId('hat-unlock')).toBeVisible();

  // the rack: walk into the party hat to wear it
  await walkInto(0);
  expect(await hat()).toBe('party');
  await game.teleport(0, pegX(3), 1, RACK.z + 3.5);
  await game.seconds(1);
  await game.screenshot('test-results/hat-rack.png');

  // Start now cycles none -> party -> crown
  await game.tap('Digit2');
  expect(await hat()).toBe('crown');
  game.expectNoErrors();
});
