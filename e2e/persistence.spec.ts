import { expect, test } from '@playwright/test';

// Test mode never touches storage, so this runs the normal game: what grown-ups set, the
// stars found and the photos taken must survive closing the browser.

const ready = (page: import('@playwright/test').Page) =>
  page.waitForFunction(() => (window as any).__silly?.runtime?.props.size > 50, null, { timeout: 60_000 });

test('settings, stars and photos are still there after a reload (old photos move to IndexedDB)', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  // a photo saved the old way (localStorage), from before photos moved to IndexedDB
  const tiny = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 4;
    return c.toDataURL('image/jpeg');
  });
  await page.evaluate((url) => localStorage.setItem('silly-park:photos:v1', JSON.stringify([{ id: 1, at: 1, url }])), tiny);

  await page.evaluate(() => {
    const s = (window as any).__silly;
    s.useSettings.getState().set({ speed: 2, together: 0 });
    s.useProgress.getState().addStar();
    s.useStickers.getState().earn('goal');
    s.useGame.getState().start('kb1');
    s.usePhotos.getState().request();
  });
  await page.waitForFunction(() => (window as any).__silly.usePhotos.getState().photos.length === 1, null, { timeout: 90_000 });

  await page.reload();
  await ready(page);
  await page.waitForFunction(() => (window as any).__silly.usePhotos.getState().photos.length === 2, null, { timeout: 10_000 });
  const state = await page.evaluate(() => {
    const s = (window as any).__silly;
    const set = s.useSettings.getState();
    return {
      speed: set.speed,
      together: set.together,
      stars: s.useProgress.getState().starsEver,
      stickers: s.useStickers.getState().got,
      photoIds: s.usePhotos.getState().photos.map((p: any) => p.id),
      oldKey: localStorage.getItem('silly-park:photos:v1')
    };
  });
  expect(state.speed).toBe(2);
  expect(state.together).toBe(0);
  expect(state.stars).toBe(1);
  // (the photo taken above earned the photo sticker)
  expect([...state.stickers].sort()).toEqual(['goal', 'photo']);
  expect(state.photoIds[0]).toBe(1);
  expect(state.oldKey).toBeNull();

  // deleting sticks too
  await page.evaluate(() => (window as any).__silly.usePhotos.getState().remove(1));
  await page.waitForTimeout(200);
  await page.reload();
  await ready(page);
  await page.waitForFunction(() => (window as any).__silly.usePhotos.getState().photos.length === 1, null, { timeout: 10_000 });
});
