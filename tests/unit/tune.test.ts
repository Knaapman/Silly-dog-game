import { describe, expect, it } from 'vitest';
import { seededRandom } from '../../src/game/clock';
import { judge, KEYS, makeTune, TUNE_MOST, TUNE_START } from '../../src/game/tune';

describe("the songbird's tunes", () => {
  it('are as long as asked, on the keys, in small steps, never one note three times running', () => {
    const rand = seededRandom(7);
    for (let n = 0; n < 300; n += 1) {
      const length = TUNE_START + (n % (TUNE_MOST - TUNE_START + 1));
      const tune = makeTune(length, rand);
      expect(tune).toHaveLength(length);
      tune.forEach((k, i) => {
        expect(Number.isInteger(k) && k >= 0 && k < KEYS).toBe(true);
        if (i > 0) expect(Math.abs(k - tune[i - 1])).toBeLessThanOrEqual(2);
        if (i > 1) expect(k === tune[i - 1] && k === tune[i - 2]).toBe(false);
      });
    }
  });

  it('use the whole keyboard over many tunes', () => {
    const rand = seededRandom(3);
    const seen = new Set<number>();
    for (let n = 0; n < 50; n += 1) makeTune(5, rand).forEach((k) => seen.add(k));
    expect(seen.size).toBe(KEYS);
  });

  it('judge each key against the tune so far', () => {
    const tune = [2, 3, 1];
    expect(judge(tune, 0, 2)).toBe('next');
    expect(judge(tune, 1, 3)).toBe('next');
    expect(judge(tune, 2, 1)).toBe('done');
    expect(judge(tune, 1, 2)).toBe('wrong');
    expect(judge(tune, 0, 7)).toBe('wrong');
  });
});
