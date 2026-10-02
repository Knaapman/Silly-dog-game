import { describe, expect, it } from 'vitest';
import { amplitude, fling, pushSwing, stepSwing, SWING_MAX, type Swing } from '../../src/game/swing';

const deg = (r: number) => (r * 180) / Math.PI;
const run = (s: Swing, seconds: number, pump: boolean, ridden = true) => {
  for (let t = 0; t < seconds; t += 1 / 60) stepSwing(s, 1 / 60, pump, ridden);
};

describe('swings', () => {
  it('holding the stick pumps a swing from standstill up high in a few seconds, never over the top', () => {
    const s: Swing = { theta: 0, omega: 0 };
    let reached60 = -1;
    let most = 0;
    for (let t = 0; t < 15; t += 1 / 60) {
      stepSwing(s, 1 / 60, true, true);
      most = Math.max(most, Math.abs(s.theta));
      if (reached60 < 0 && amplitude(s) > (60 * Math.PI) / 180) reached60 = t;
    }
    console.info('60 degrees after', reached60.toFixed(1), 's; most', deg(most).toFixed(1));
    expect(reached60).toBeGreaterThan(2.5);
    expect(reached60).toBeLessThan(8);
    expect(most).toBeLessThanOrEqual(SWING_MAX + 1e-6);
    expect(most).toBeGreaterThan(SWING_MAX - 0.05);
  });

  it('left alone it slowly dies down; an empty one stops within a few seconds', () => {
    const s: Swing = { theta: 1, omega: 0 };
    run(s, 10, false);
    expect(amplitude(s)).toBeGreaterThan(0.4);
    expect(amplitude(s)).toBeLessThan(0.8);
    const e: Swing = { theta: 1, omega: 0 };
    run(e, 12, false, false);
    expect(amplitude(e)).toBeLessThan(0.05);
  });

  it('a push always adds swing, the way it was pushed', () => {
    const s: Swing = { theta: 0, omega: 0 };
    pushSwing(s, 1);
    expect(s.omega).toBeGreaterThan(0);
    const a1 = amplitude(s);
    expect(deg(a1)).toBeGreaterThan(20);
    expect(deg(a1)).toBeLessThan(40);
    // pushed against the way it's going: it turns round, and swings more than before
    pushSwing(s, -1);
    expect(s.omega).toBeLessThan(0);
    expect(amplitude(s)).toBeGreaterThan(a1);
    for (let i = 0; i < 10; i += 1) pushSwing(s, 1);
    expect(amplitude(s)).toBeLessThanOrEqual(SWING_MAX + 1e-6);
  });

  it('jumping off on the way up forwards flies furthest forwards; on the way back, backwards', () => {
    const fwd = fling({ theta: 0.5, omega: 3 }, 1.2);
    const bottom = fling({ theta: 0, omega: 3.5 }, 0.6);
    const back = fling({ theta: -0.5, omega: -3 }, 1.2);
    const still = fling({ theta: 0, omega: 0 }, 0.6);
    console.info('fwd', fwd, 'bottom', bottom, 'back', back);
    expect(fwd.along).toBeGreaterThan(7);
    expect(fwd.along).toBeLessThan(14);
    expect(back.along).toBeLessThan(-7);
    expect(Math.abs(still.along)).toBeLessThan(0.01);
    expect(fwd.apex).toBeGreaterThan(2);
  });
});
