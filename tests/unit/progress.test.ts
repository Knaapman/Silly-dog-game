import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadProgress(stored?: string) {
  vi.resetModules();
  const saved = new Map<string, string>();
  if (stored != null) saved.set('silly-park:progress:v1', stored);
  vi.stubGlobal('window', {
    location: { search: '' },
    localStorage: {
      getItem: (k: string) => saved.get(k) ?? null,
      setItem: (k: string, v: string) => saved.set(k, v),
      removeItem: (k: string) => saved.delete(k)
    }
  });
  return { ...(await import('../../src/game/progress')), saved };
}

describe('hat unlocks', () => {
  it('starts with just the party hat, and each threshold unlocks the next', async () => {
    const { useProgress, unlockedHats, HAT_UNLOCKS } = await loadProgress();
    expect(unlockedHats()).toEqual(['none', 'party']);
    const got: (string | null)[] = [];
    for (let i = 0; i < 12; i += 1) got.push(useProgress.getState().addStar());
    expect(got.filter(Boolean)).toEqual(HAT_UNLOCKS.slice(1).map((u) => u.hat));
    expect(unlockedHats()).toHaveLength(8);
    expect(useProgress.getState().addStar()).toBeNull();
  });

  it('remembers stars between visits, and can be reset', async () => {
    const first = await loadProgress();
    for (let i = 0; i < 3; i += 1) first.useProgress.getState().addStar();
    const again = await loadProgress(first.saved.get('silly-park:progress:v1'));
    expect(again.useProgress.getState().starsEver).toBe(3);
    expect(again.isHatUnlocked('propeller')).toBe(true);
    expect(again.isHatUnlocked('flower')).toBe(false);
    again.useProgress.getState().reset();
    expect(again.saved.has('silly-park:progress:v1')).toBe(false);
    expect(again.unlockedHats()).toEqual(['none', 'party']);
  });

  it('ignores nonsense in storage', async () => {
    const { useProgress } = await loadProgress('{"starsEver":"lots"}');
    expect(useProgress.getState().starsEver).toBe(0);
  });
});
