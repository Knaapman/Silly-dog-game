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
    s.useGame.getState().setSpecies(0, 'sheep');
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
      oldKey: localStorage.getItem('silly-park:photos:v1'),
      // player one picked the sheep last time; player two never chose
      animals: (() => {
        s.useGame.getState().start('kb1');
        s.useGame.getState().join('kb2');
        return s.useGame.getState().players.map((p: any) => p.species);
      })()
    };
  });
  expect(state.speed).toBe(2);
  expect(state.together).toBe(0);
  expect(state.stars).toBe(1);
  // (the photo taken above earned the photo sticker)
  expect([...state.stickers].sort()).toEqual(['goal', 'photo']);
  expect(state.photoIds[0]).toBe(1);
  expect(state.oldKey).toBeNull();
  expect(state.animals).toEqual(['sheep', 'goat']);

  // deleting sticks too
  await page.evaluate(() => (window as any).__silly.usePhotos.getState().remove(1));
  await page.waitForTimeout(200);
  await page.reload();
  await ready(page);
  await page.waitForFunction(() => (window as any).__silly.usePhotos.getState().photos.length === 1, null, { timeout: 10_000 });
});

test('a broken save never stops the game: junk in every saved thing, and it starts and plays as new', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await ready(page);
  // every key the game saves, filled with something it didn't write: half-written JSON, wrong types, nulls
  const keys = ['animals:v1', 'coats:v1', 'hunt:v1', 'photos:v1', 'playlog:v1', 'progress:v1', 'settings:v1', 'sled:v1', 'stickers:v1'];
  const junk = ['{"half', 'null', '42', '"text"', '[null,{"start":5},[1,2]]', '{"round":"x","found":7,"starsEver":-3,"best":"far","speed":9,"quality":"max"}'];
  await page.evaluate(
    ([keys, junk]) => keys.forEach((k, i) => localStorage.setItem('silly-park:' + k, junk[i % junk.length])),
    [keys, junk] as const
  );
  await page.reload();
  await ready(page);
  await page.evaluate(() => {
    const s = (window as any).__silly;
    s.useGame.getState().start('kb1');
  });
  await page.waitForTimeout(3000);
  const state = await page.evaluate(() => {
    const s = (window as any).__silly;
    s.playlog.tickPlayLog(performance.now());
    return {
      players: s.useGame.getState().players.length,
      stars: s.useProgress.getState().starsEver,
      stickers: s.useStickers.getState().got.length,
      speed: s.useSettings.getState().speed,
      quality: s.useSettings.getState().quality,
      log: JSON.parse(s.playlog.playLogFile()).sessions.length
    };
  });
  expect(state.players).toBe(1);
  expect(state.stars).toBe(0);
  expect(state.stickers).toBe(0);
  expect(state.speed).toBe(1);
  expect(state.quality).toBe('auto');
  expect(state.log).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
