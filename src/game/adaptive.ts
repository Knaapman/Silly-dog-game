import type { Quality } from './settings';

// Automatic graphics: with "Auto" chosen, the game watches its own frame rate and steps the
// graphics level down when it keeps stuttering, and back up (never above what the graphics
// card was judged capable of) when there is plenty of headroom.

export const LEVELS: Quality[] = ['low', 'high', 'ultra'];

export const ADAPT = {
  /** Below this for `slowSeconds` in a row: one level down. */
  slowFps: 48,
  slowSeconds: 4,
  /** At or above this for `fastSeconds` in a row: one level up. */
  fastFps: 57,
  fastSeconds: 20,
  /** A level that was too slow isn't tried again for this long (seconds). */
  retryAfter: 120,
  /** Measurements right after starting or changing level are ignored (shader and shadow set-up). */
  settleSeconds: 5
};

export type AdaptState = { slowFor: number; fastFor: number; ignoreUntil: number; failedAt: Partial<Record<Quality, number>> };

export function newAdaptState(now = 0): AdaptState {
  return { slowFor: 0, fastFor: 0, ignoreUntil: now + ADAPT.settleSeconds, failedAt: {} };
}

/**
 * Feed one frame-rate measurement per second (`now` in seconds). Returns the level to use,
 * which is `level` unless it is time to step.
 */
export function adaptQuality(level: Quality, ceiling: Quality, fps: number, now: number, st: AdaptState): Quality {
  if (now < st.ignoreUntil) return level;
  if (fps < ADAPT.slowFps) {
    st.slowFor += 1;
    st.fastFor = 0;
  } else if (fps >= ADAPT.fastFps) {
    st.fastFor += 1;
    st.slowFor = 0;
  } else {
    st.slowFor = 0;
    st.fastFor = 0;
  }
  const i = LEVELS.indexOf(level);
  const top = LEVELS.indexOf(ceiling);
  let next = level;
  if (i > top) next = ceiling;
  else if (st.slowFor >= ADAPT.slowSeconds && i > 0) {
    st.failedAt[level] = now;
    next = LEVELS[i - 1];
  } else if (st.fastFor >= ADAPT.fastSeconds && i < top) {
    const up = LEVELS[i + 1];
    const failed = st.failedAt[up];
    if (failed == null || now - failed >= ADAPT.retryAfter) next = up;
  }
  if (next !== level) {
    st.slowFor = 0;
    st.fastFor = 0;
    st.ignoreUntil = now + ADAPT.settleSeconds;
  }
  return next;
}
