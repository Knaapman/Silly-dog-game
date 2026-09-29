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

describe('and the coat it wore on each animal', () => {
  it('starts in the usual coat and remembers per player number and per animal', async () => {
    const { favouriteCoat, rememberCoat, saved } = await loadAnimals();
    expect(favouriteCoat(0, 'dog')).toBe(0);
    rememberCoat(1, 'pig', 3);
    rememberCoat(1, 'dog', 1);
    expect(favouriteCoat(1, 'pig')).toBe(3);
    expect(favouriteCoat(1, 'dog')).toBe(1);
    expect(favouriteCoat(0, 'pig')).toBe(0);
    expect(favouriteCoat(1, 'goat')).toBe(0);
    const stored = JSON.parse(saved.get('silly-park:coats:v1')!);
    expect(stored).toEqual([{}, { pig: 3, dog: 1 }]);
    const again = await loadAnimals({ 'coats:v1': stored });
    expect(again.favouriteCoat(1, 'pig')).toBe(3);
  });

  it('ignores junk in storage', async () => {
    const { favouriteCoat } = await loadAnimals({ 'coats:v1': [{ dog: 99, pig: -1, cat: 'blue', sheep: 2, dragon: 1 }, null, 'x'] });
    expect(favouriteCoat(0, 'dog')).toBe(0);
    expect(favouriteCoat(0, 'pig')).toBe(0);
    expect(favouriteCoat(0, 'cat')).toBe(0);
    expect(favouriteCoat(0, 'sheep')).toBe(2);
    expect(favouriteCoat(1, 'dog')).toBe(0);
  });

  it('has the same number of coats for every animal, the usual one first', async () => {
    const { COATS, COAT_COUNT, coatOf } = await import('../../src/game/coats');
    const { SPECIES } = await import('../../src/game/config');
    for (const sp of SPECIES) expect(COATS[sp]).toHaveLength(COAT_COUNT);
    expect(coatOf('dog', 0).fur).toBe('#c98a4b');
    expect(coatOf('dog', COAT_COUNT + 1)).toBe(COATS.dog[1]);
    // every coat looks different from the others of the same animal
    for (const sp of SPECIES) expect(new Set(COATS[sp].map((c) => c.fur)).size).toBe(COAT_COUNT);
  });
});
