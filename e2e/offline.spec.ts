import { expect, test } from '@playwright/test';
import { BUILT_PORT } from '../playwright.config';

// The built game (what `npm run play` serves) keeps all its files, so once it has been opened
// it starts again without the server or the internet: that's what the desktop icon relies on.
test('the built game installs its files and starts again offline', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const url = `http://127.0.0.1:${BUILT_PORT}/`;
  await page.goto(url);
  await page.waitForFunction(() => navigator.serviceWorker?.ready.then((r) => !!r.active), null, { timeout: 60_000 });
  // installable: a manifest with icons
  const manifest = await page.evaluate(async () => (await fetch('./manifest.webmanifest')).json());
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('canvas')).toHaveCount(1, { timeout: 60_000 });
  await expect(page).toHaveTitle('Silly Park');
  // the game itself runs: the title screen is up and the 3D view draws
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/offline.png' });
  expect(errors).toEqual([]);
});
