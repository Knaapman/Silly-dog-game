import { beforeEach, describe, expect, it } from 'vitest';
import { perf, recordFrame, resetPerf } from '../../src/game/perf';

beforeEach(() => resetPerf());

describe('frame rate', () => {
  it('measures frames per second over whole seconds', () => {
    let t = 0;
    for (let i = 0; i < 65; i += 1) recordFrame((t += 1000 / 60));
    expect(Math.round(perf.fps)).toBe(60);
  });

  it('ignores the time a hidden tab was not drawing', () => {
    let t = 0;
    for (let i = 0; i < 65; i += 1) recordFrame((t += 1000 / 60));
    // hidden for ten seconds, then back at 60 fps
    t += 10_000;
    expect(recordFrame(t)).toBe(false);
    expect(Math.round(perf.fps)).toBe(60);
    for (let i = 0; i < 65; i += 1) recordFrame((t += 1000 / 60));
    expect(Math.round(perf.fps)).toBe(60);
  });
});
