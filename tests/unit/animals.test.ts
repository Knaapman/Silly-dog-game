import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadAnimals(stored: Record<string, unknown> = {}) {
  vi.resetModules();
  const saved = new Map<string, string>(Object.entries(stored).map(([k, v]) => [`silly-park:${k}`, JSON.stringify(v)]));
  vi.stubGlobal('window', {
    location: { search: '' },
    localStorage: {
      getItem: (k: string) => saved.get(k) ?? null,
      setItem: (k: string, v: string) => saved.set(k, v),
      removeItem: (k: string) => saved.delete(k)
    }
  });
  return { ...(await import('../../src/game/animals')), saved };
}

describe('each player number remembers its animal', () => {
  it('starts with the usual animal per player', async () => {
    const { favouriteSpecies } = await loadAnimals();
    expect([0, 1, 2, 3].map(favouriteSpecies)).toEqual(['dog', 'goat', 'pig', 'sheep']);
  });

  it('keeps a pick for next time, for that player number only', async () => {
    const { favouriteSpecies, rememberSpecies, saved } = await loadAnimals();
    rememberSpecies(1, 'pig');
    expect(favouriteSpecies(1)).toBe('pig');
    expect(favouriteSpecies(0)).toBe('dog');
    expect(JSON.parse(saved.get('silly-park:animals:v1')!)).toEqual([null, 'pig']);
    // after a reload
    const again = await loadAnimals({ 'animals:v1': [null, 'pig'] });
    expect(again.favouriteSpecies(1)).toBe('pig');
  });

  it('falls back when the remembered animal is not in the park (album reset, or junk in storage)', async () => {
    const stickers = ['goal', 'strike', 'bell'];
    const withCat = await loadAnimals({ 'animals:v1': ['cat', 'dragon', 42], 'stickers:v1': stickers });
    expect([0, 1, 2].map(withCat.favouriteSpecies)).toEqual(['cat', 'goat', 'pig']);
    const reset = await loadAnimals({ 'animals:v1': ['cat'] });
    expect(reset.favouriteSpecies(0)).toBe('dog');
  });
});
