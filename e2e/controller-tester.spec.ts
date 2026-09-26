import { expect, test } from '@playwright/test';
import { Game } from './game';

test('controller tester: shows what a HORIPAD sends and what the game makes of it', async ({ page }) => {
  const game = new Game(page);
  await game.withPads();
  await game.open();
  await game.start();
  await page.evaluate(() => (window as any).__addPad(0, '', 'HORIPAD S (Vendor: 0f0d Product: 00c1)'));
  await page.keyboard.press('Escape');
  await page.getByTitle('Test controllers').click();
  const tester = page.getByTestId('controller-tester');
  await expect(tester).toBeVisible();
  const pad = tester.locator('[data-pad="0"]');
  await expect(pad).toContainText('not recognised');

  const press = (b: number, down: boolean) => page.evaluate(([b, down]) => (window as any).__press(0, b, down), [b, down] as const);
  // DirectInput button 1 is the bottom button: the game's "jump" (standard 0)
  await press(1, true);
  await expect(pad.locator('[data-button="0"]')).toHaveAttribute('data-lit', 'true');
  await expect(pad.locator('[data-raw-button="1"]')).toHaveAttribute('data-lit', 'true');
  await press(1, false);
  await expect(pad.locator('[data-button="0"]')).toHaveAttribute('data-lit', 'false');
  // Capture (DirectInput 13) is the camera button (standard 17)
  await press(13, true);
  await expect(pad.locator('[data-button="17"]')).toHaveAttribute('data-lit', 'true');
  await page.screenshot({ path: 'test-results/controller-tester.png' });
  await press(13, false);

  // Esc leaves the tester but keeps the menu open
  await page.keyboard.press('Escape');
  await expect(tester).toBeHidden();
  await expect(page.getByTestId('grown-up-menu')).toBeVisible();

  // so does holding the right face button (DirectInput 2), which doesn't close the menu
  await page.getByTitle('Test controllers').click();
  await expect(tester).toBeVisible();
  await press(2, true);
  await expect(tester).toBeHidden({ timeout: 5000 });
  await press(2, false);
  await game.seconds(0.2);
  await expect(page.getByTestId('grown-up-menu')).toBeVisible();
  game.expectNoErrors();
});
