import { describe, expect, it } from 'vitest';
import { heardAt, updateListener } from '../../src/game/audio';

describe('sounds in split screen', () => {
  it('are heard where they happen when the screen is one view', () => {
    updateListener({ x: 5, y: 0, z: 5 });
    expect(heardAt({ x: 40, y: 1, z: -3 })).toEqual({ x: 40, y: 1, z: -3 });
  });

  it('sit as far from the ears as they are from the nearest view', () => {
    // two children 60 m apart: the ears are in between, where neither of them is
    updateListener({ x: 0, y: 0, z: 0 }, [
      { x: -30, y: 0, z: 0 },
      { x: 30, y: 2, z: 0 }
    ]);
    // a bark right next to the right-hand child is as close to the ears as it is to them
    expect(heardAt({ x: 32, y: 2, z: 1 })).toEqual({ x: 2, y: 0, z: 1 });
    expect(heardAt({ x: -29, y: 0, z: -1 })).toEqual({ x: 1, y: 0, z: -1 });
    updateListener({ x: 0, y: 0, z: 0 });
  });
});
