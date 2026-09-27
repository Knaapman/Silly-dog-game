import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('window', { location: { search: '?test=1' } });
const { adaptSkill, CHASE_LEVELS, paramsForSkill } = await import('../../src/game/chase');

describe('adaptive chase difficulty', () => {
  it('blends between the fixed levels', () => {
    expect(paramsForSkill(0)).toEqual(CHASE_LEVELS[0]);
    expect(paramsForSkill(0.5)).toEqual(CHASE_LEVELS[1]);
    expect(paramsForSkill(1)).toEqual(CHASE_LEVELS[2]);
    const mid = paramsForSkill(0.25);
    expect(mid.speed[0]).toBeCloseTo((CHASE_LEVELS[0].speed[0] + CHASE_LEVELS[1].speed[0]) / 2);
    expect(mid.notice[1]).toBeCloseTo((CHASE_LEVELS[0].notice[1] + CHASE_LEVELS[1].notice[1]) / 2);
    expect(paramsForSkill(-3)).toEqual(CHASE_LEVELS[0]);
    expect(paramsForSkill(9)).toEqual(CHASE_LEVELS[2]);
  });

  it('the levels get harder in every way', () => {
    for (let i = 1; i < CHASE_LEVELS.length; i += 1) {
      expect(CHASE_LEVELS[i].speed[0]).toBeGreaterThan(CHASE_LEVELS[i - 1].speed[0]);
      expect(CHASE_LEVELS[i].speed[1]).toBeGreaterThan(CHASE_LEVELS[i - 1].speed[1]);
      expect(CHASE_LEVELS[i].notice[0]).toBeGreaterThan(CHASE_LEVELS[i - 1].notice[0]);
      expect(CHASE_LEVELS[i].tag).toBeLessThan(CHASE_LEVELS[i - 1].tag);
      // a tired cat is always slower than a fresh one, and never faster than the child
      expect(CHASE_LEVELS[i].speed[1]).toBeLessThan(CHASE_LEVELS[i].speed[0]);
      expect(CHASE_LEVELS[i].speed[0]).toBeLessThan(1);
    }
  });

  it('quick catches make the cats trickier, escapes make them easier', () => {
    let s = 0.5;
    for (let i = 0; i < 5; i += 1) s = adaptSkill(s, 'tagged', 3);
    expect(s).toBe(1);
    for (let i = 0; i < 9; i += 1) s = adaptSkill(s, 'escaped', 20);
    expect(s).toBe(0);
    expect(adaptSkill(0.5, 'tagged', 8)).toBeGreaterThan(0.5);
    expect(adaptSkill(0.5, 'tagged', 8)).toBeLessThan(adaptSkill(0.5, 'tagged', 3));
    expect(adaptSkill(0.5, 'tagged', 20)).toBeLessThan(0.5);
    expect(adaptSkill(0.5, 'escaped', 20)).toBeLessThan(adaptSkill(0.5, 'tagged', 20));
  });
});
