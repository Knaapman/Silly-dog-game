import { describe, expect, it } from 'vitest';
import { layoutRects, JOIN_AT, SPLIT_AT } from '../../src/game/views';

describe('split screen layout', () => {
  it('fills the whole screen with no overlaps, whatever the number of children', () => {
    for (let n = 1; n <= 4; n += 1) {
      const rects = layoutRects(n);
      expect(rects).toHaveLength(n);
      // every part on the screen, and together they cover it exactly
      let area = 0;
      rects.forEach((r) => {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
        expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9);
        area += r.w * r.h;
      });
      expect(area).toBeCloseTo(1, 9);
      for (let i = 0; i < n; i += 1)
        for (let j = i + 1; j < n; j += 1) {
          const a = rects[i];
          const b = rects[j];
          const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          expect(ox <= 1e-9 || oy <= 1e-9).toBe(true);
        }
    }
  });

  it('two side by side; four in a grid; three with the third along the bottom', () => {
    expect(layoutRects(2)).toEqual([
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 }
    ]);
    expect(layoutRects(3)[2]).toEqual({ x: 0, y: 0.5, w: 1, h: 0.5 });
    expect(new Set(layoutRects(4).map((r) => `${r.w}x${r.h}`))).toEqual(new Set(['0.5x0.5']));
  });

  it('joins up again closer than it splits (no flicking back and forth)', () => {
    expect(JOIN_AT).toBeLessThan(SPLIT_AT);
  });
});
