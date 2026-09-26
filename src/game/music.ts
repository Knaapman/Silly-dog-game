import { getBus } from './audio';

// A tiny cheerful loop (I–vi–IV–V) played on a marimba-ish synth. Scheduled ahead on the
// AudioContext clock so it stays in time even when frames drop.

const BPM = 104;
const STEP = 60 / BPM / 2; // eighth notes
const STEPS_PER_BAR = 8;

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// C4 = 60. null = rest. Two 4-bar phrases: question, answer.
const MELODY: (number | null)[] = [
  76, null, 79, null, 76, 74, 72, null,
  69, null, 72, null, 76, null, 74, null,
  69, 72, 77, null, 76, 74, 72, null,
  74, null, 67, null, 71, null, 74, null,
  76, null, 79, null, 81, 79, 76, null,
  69, null, 72, 74, 76, null, 72, null,
  77, null, 76, null, 74, null, 72, 69,
  71, null, 74, null, 72, null, null, null
];

const BASS_ROOTS = [48, 45, 41, 43, 48, 45, 41, 43];

let timer: number | null = null;
let nextTime = 0;
let step = 0;

function note(freq: number, at: number, dur: number, gain: number, type: OscillatorType) {
  const bus = getBus('music');
  if (!bus) return;
  const { ctx, bus: out } = bus;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g);
  g.connect(out);
  o.start(at);
  o.stop(at + dur + 0.02);
  o.onended = () => {
    o.disconnect();
    g.disconnect();
  };
}

function tick(at: number, index: number) {
  const bar = Math.floor(index / STEPS_PER_BAR) % BASS_ROOTS.length;
  const inBar = index % STEPS_PER_BAR;
  const m = MELODY[index % MELODY.length];
  if (m != null) {
    note(midi(m), at, 0.32, 0.075, 'sine');
    note(midi(m + 12), at, 0.12, 0.025, 'triangle');
  }
  const root = BASS_ROOTS[bar];
  if (inBar === 0 || inBar === 4) note(midi(root), at, 0.35, 0.11, 'triangle');
  if (inBar === 6) note(midi(root + 12), at, 0.2, 0.07, 'triangle');
  // soft chord stab on the off-beats
  if (inBar === 2 || inBar === 6) {
    const third = bar % 4 === 1 ? 3 : 4; // the vi chord is minor
    [root + 24, root + 24 + third, root + 31].forEach((n) => note(midi(n), at, 0.14, 0.018, 'square'));
  }
}

export function startMusic() {
  if (timer != null) return;
  const bus = getBus('music');
  if (!bus || bus.ctx.state !== 'running') return;
  nextTime = bus.ctx.currentTime + 0.1;
  timer = window.setInterval(() => {
    const b = getBus('music');
    if (!b) return;
    // After the tab was hidden, skip ahead instead of firing a burst of stale notes.
    if (nextTime < b.ctx.currentTime - 0.2) nextTime = b.ctx.currentTime + 0.05;
    while (nextTime < b.ctx.currentTime + 0.15) {
      tick(nextTime, step);
      step = (step + 1) % MELODY.length;
      nextTime += STEP;
    }
  }, 30);
}

export function stopMusic() {
  if (timer != null) window.clearInterval(timer);
  timer = null;
}

export function isMusicScheduled() {
  return timer != null;
}
