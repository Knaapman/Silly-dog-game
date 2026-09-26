import { describe, expect, it } from 'vitest';
import { WORLD_HALF } from '../../src/game/config';
import { FOUNTAIN, GOLDEN_STARS, isInPond, isOnGrass, LAKE, PATHS, PLAZA, SNACKS, SNOW, TOILET, ZONES } from '../../src/game/layout';

describe('grass (where animals can nibble)', () => {
  it('is not on the plaza, the paths, the lake or the snow', () => {
    expect(isOnGrass(PLAZA.center[0], PLAZA.center[1])).toBe(false);
    const [a, b] = PATHS[0];
    expect(isOnGrass((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)).toBe(false);
    expect(isOnGrass(LAKE.center[0] + 3, LAKE.center[1])).toBe(false);
    expect(isOnGrass(SNOW.center[0], SNOW.center[1])).toBe(false);
  });

  it('is in open fields and on the forest floor', () => {
    expect(isOnGrass(18, 6)).toBe(true);
    expect(isOnGrass(ZONES.forest[0], ZONES.forest[1])).toBe(true);
  });
});

describe('park layout', () => {
  it('has 12 golden stars', () => {
    expect(GOLDEN_STARS).toHaveLength(12);
  });

  it('keeps food out of the water and inside the park', () => {
    for (const s of SNACKS) {
      expect(isInPond(s.position[0], s.position[2]), `${s.kind} at ${s.position}`).toBe(false);
      expect(Math.abs(s.position[0])).toBeLessThan(WORLD_HALF);
      expect(Math.abs(s.position[2])).toBeLessThan(WORLD_HALF);
    }
  });

  it('puts the toilet on the plaza, clear of the fountain', () => {
    const [x, , z] = TOILET.position;
    expect(Math.hypot(x - PLAZA.center[0], z - PLAZA.center[1])).toBeLessThan(PLAZA.radius);
    expect(Math.hypot(x - FOUNTAIN.center[0], z - FOUNTAIN.center[1])).toBeGreaterThan(FOUNTAIN.basinRadius + 3);
  });
});
