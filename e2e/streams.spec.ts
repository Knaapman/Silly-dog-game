import { expect, test, type Browser } from '@playwright/test';
import { Game } from './game';

// Each part of the park has a random stream of its own (in test mode, seeded from the test's seed
// and the part's name), and a test can leave parts out. So one part's random numbers don't depend
// on what else is in the park: the cats roam exactly the same with or without the birds and the
// chickens about.

async function catTrail(browser: Browser, off: ('birds' | 'chickens')[]) {
  const page = await browser.newPage();
  const game = new Game(page);
  await game.open(3, { off });
  await game.start();
  const trail: number[][] = [];
  for (let i = 0; i < 6; i += 1) {
    await game.seconds(1);
    trail.push(await page.evaluate(() => (window as any).__silly.chase.parkCats.flatMap((c: any) => c.position.toArray().map((v: number) => Math.round(v * 1000) / 1000))));
  }
  const flocks = await page.evaluate(() => (window as any).__silly.chase.flocks.length);
  await page.close();
  return { trail, flocks };
}

test('a part of the park left out changes nothing for the others: the cats roam the same without the birds and chickens', async ({ browser }) => {
  const all = await catTrail(browser, []);
  const fewer = await catTrail(browser, ['birds', 'chickens']);
  expect(all.flocks).toBeGreaterThan(0);
  expect(fewer.flocks).toBe(0);
  expect(all.trail[0].length).toBeGreaterThan(0);
  expect(fewer.trail).toEqual(all.trail);
});
