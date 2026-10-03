// Frame-rate measurement for the real-time loop: shown in the grown-ups menu and used by the
// automatic graphics setting. Measured over whole seconds, so one slow frame doesn't count.

export const perf = {
  /** Frames per second over the last full second (0 until measured). */
  fps: 0,
  frames: 0,
  windowStart: -1,
  /** Draw calls and triangles in the last drawn frame (all views of a split screen together). */
  calls: 0,
  triangles: 0,
  /** Hitches: frames that took longer than HITCH_MS (a stutter a child sees), counted since the page loaded... */
  hitches: 0,
  /** ...and the longest frame so far (ms), and when the first frame was drawn (ms after the page started loading). */
  longestFrame: 0,
  firstFrameAt: -1,
  lastFrameAt: -1
};

/** A frame this long (ms) is a visible stutter. */
export const HITCH_MS = 100;

/** Call once per drawn frame with the frame's timestamp (ms). Returns true when fps updated. */
export function recordFrame(now: number) {
  if (perf.firstFrameAt < 0) perf.firstFrameAt = now;
  // (a gap over 2.5 s is the tab hidden or the machine asleep, not a stutter)
  const gap = perf.lastFrameAt < 0 ? 0 : now - perf.lastFrameAt;
  perf.lastFrameAt = now;
  if (gap > HITCH_MS && gap <= 2500) {
    perf.hitches += 1;
    perf.longestFrame = Math.max(perf.longestFrame, gap);
  }
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
  perf.hitches = 0;
  perf.longestFrame = 0;
  perf.firstFrameAt = -1;
  perf.lastFrameAt = -1;
}
