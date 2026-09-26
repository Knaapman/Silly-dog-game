import { describe, expect, it } from 'vitest';
import { ADAPT, adaptQuality, newAdaptState } from '../../src/game/adaptive';
import type { Quality } from '../../src/game/settings';

/** Feed one measurement per second; returns the level after each. */
function run(start: Quality, ceiling: Quality, fps: number[], t0 = 10) {
  const st = newAdaptState(0);
  let level = start;
  const out: Quality[] = [];
  fps.forEach((f, i) => {
    level = adaptQuality(level, ceiling, f, t0 + i, st);
    out.push(level);
  });
  return { out, level, st };
}

describe('automatic graphics', () => {
  it('steps down after a few slow seconds, not after one slow second', () => {
    expect(run('ultra', 'ultra', [30, 60, 30, 60, 30]).level).toBe('ultra');
    const { out } = run('ultra', 'ultra', [40, 40, 40, 40]);
    expect(out).toEqual(['ultra', 'ultra', 'ultra', 'high']);
  });

  it('waits for things to settle after a change before judging again', () => {
    const slow = Array(ADAPT.slowSeconds + ADAPT.settleSeconds + ADAPT.slowSeconds).fill(20);
    const { out } = run('ultra', 'ultra', slow);
    expect(out[ADAPT.slowSeconds - 1]).toBe('high');
    // no second step until settled and slow for another few seconds
    expect(out[ADAPT.slowSeconds + ADAPT.settleSeconds - 1]).toBe('high');
    expect(out[out.length - 1]).toBe('low');
  });

  it('never goes below low or above what the graphics card was judged capable of', () => {
    expect(run('low', 'ultra', Array(30).fill(10)).level).toBe('low');
    expect(run('high', 'high', Array(60).fill(144)).level).toBe('high');
  });

  it('goes back up with plenty of headroom, but not straight back to a level that was too slow', () => {
    const st = newAdaptState(0);
    let level: Quality = 'ultra';
    let t = 10;
    const feed = (fps: number, seconds: number) => {
      for (let i = 0; i < seconds; i += 1) level = adaptQuality(level, 'ultra', fps, t++, st);
    };
    feed(30, ADAPT.slowSeconds);
    expect(level).toBe('high');
    feed(60, 60); // fast again, but ultra failed less than retryAfter ago
    expect(level).toBe('high');
    feed(60, ADAPT.retryAfter);
    expect(level).toBe('ultra');
  });

  it('ignores the first seconds after starting', () => {
    const st = newAdaptState(100);
    expect(adaptQuality('ultra', 'ultra', 5, 101, st)).toBe('ultra');
    expect(st.slowFor).toBe(0);
  });
});
