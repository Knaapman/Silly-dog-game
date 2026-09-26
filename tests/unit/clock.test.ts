import { beforeEach, describe, expect, it } from 'vitest';
import { after, gameClock, gameNow, MAX_STEP, resetGameClock, seededRandom, tickGameClock } from '../../src/game/clock';

beforeEach(() => resetGameClock());

describe('game clock', () => {
  it('never steps more than MAX_STEP, and not at all while paused', () => {
    tickGameClock(0.5);
    expect(gameClock.time).toBeCloseTo(MAX_STEP);
    gameClock.paused = true;
    tickGameClock(0.016);
    expect(gameClock.dt).toBe(0);
    expect(gameClock.time).toBeCloseTo(MAX_STEP);
    expect(gameNow()).toBeCloseTo(MAX_STEP * 1000);
  });

  it('runs timers in order once they are due, and not before', () => {
    const log: string[] = [];
    after(0.1, () => log.push('b'));
    after(0.05, () => log.push('a'));
    tickGameClock(0.04);
    expect(log).toEqual([]);
    tickGameClock(0.04);
    tickGameClock(0.04);
    expect(log).toEqual(['a', 'b']);
  });

  it('can cancel a timer', () => {
    let ran = false;
    const cancel = after(0.01, () => (ran = true));
    cancel();
    tickGameClock(0.05);
    expect(ran).toBe(false);
  });

  it('holds timers while paused (food does not grow back with the menu open)', () => {
    let ran = false;
    after(0.02, () => (ran = true));
    gameClock.paused = true;
    for (let i = 0; i < 10; i += 1) tickGameClock(0.05);
    expect(ran).toBe(false);
    gameClock.paused = false;
    tickGameClock(0.05);
    expect(ran).toBe(true);
  });

  it('seeded random is repeatable', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});
