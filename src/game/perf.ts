// Frame-rate measurement for the real-time loop: shown in the grown-ups menu and used by the
// automatic graphics setting. Measured over whole seconds, so one slow frame doesn't count.

export const perf = {
  /** Frames per second over the last full second (0 until measured). */
  fps: 0,
  frames: 0,
  windowStart: -1
};

/** Call once per drawn frame with the frame's timestamp (ms). Returns true when fps updated. */
export function recordFrame(now: number) {
  if (perf.windowStart < 0) {
    perf.windowStart = now;
    perf.frames = 0;
    return false;
  }
  perf.frames += 1;
  const elapsed = now - perf.windowStart;
  if (elapsed > 2500) {
    // the tab was hidden (or the machine slept): that second says nothing about speed
    perf.frames = 0;
    perf.windowStart = now;
    return false;
  }
  if (elapsed < 1000) return false;
  perf.fps = (perf.frames * 1000) / elapsed;
  perf.frames = 0;
  perf.windowStart = now;
  return true;
}

export function resetPerf() {
  perf.fps = 0;
  perf.frames = 0;
  perf.windowStart = -1;
}
