// The songbird's tunes for the giant xylophone: short melodies that wander up and down the
// eight keys in small steps (easy to follow by ear and by eye), and how a child's key compares
// with the tune so far.

export const KEYS = 8;
/** The first tune has this many notes; every tune copied makes the next one a note longer, up to the most. */
export const TUNE_START = 3;
export const TUNE_MOST = 7;
/** A tune this long earns the big sticker. */
export const TUNE_BIG = 6;

const STEPS = [-2, -1, -1, 1, 1, 2, 0];

export function makeTune(length: number, rand: () => number = Math.random): number[] {
  const tune = [Math.floor(rand() * KEYS)];
  while (tune.length < length) {
    let next = tune[tune.length - 1] + STEPS[Math.floor(rand() * STEPS.length)];
    // bounce off the ends
    if (next < 0) next = 1;
    if (next >= KEYS) next = KEYS - 2;
    // never the same note three times running
    if (tune.length >= 2 && next === tune[tune.length - 1] && next === tune[tune.length - 2]) next = next > 0 ? next - 1 : next + 1;
    tune.push(next);
  }
  return tune;
}

/** A key pressed while copying the tune: the right next note, the last one, or a wrong one. */
export function judge(tune: number[], progress: number, key: number): 'next' | 'done' | 'wrong' {
  if (tune[progress] !== key) return 'wrong';
  return progress + 1 >= tune.length ? 'done' : 'next';
}
