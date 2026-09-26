import { useFrame, type RootState } from '@react-three/fiber';

// One clock for the whole game.
//
// The frame loop (see FrameDriver) feeds React Three Fiber a timeline that never jumps more
// than MAX_STEP per frame, so physics and game logic always see the same delta: on a slow
// tablet the game turns into slow motion instead of falling apart.
//
// gameClock is that timeline minus the time the grown-ups menu was open. Everything that
// "happens later" (food growing back, poops sprouting, respawns) is scheduled on it with
// after(), and game logic runs in useGameFrame, which gets a delta of 0 while paused.

export const MAX_STEP = 1 / 20;
/** Fixed step used by the automated-test mode (?test). */
export const TEST_STEP = 1 / 60;

export const gameClock = { time: 0, dt: 0, paused: false, frame: 0 };

/** Game time in milliseconds: use this instead of performance.now() in game logic. */
export function gameNow() {
  return gameClock.time * 1000;
}

type Timer = { at: number; fn: () => void; cancelled: boolean };
let timers: Timer[] = [];

/** Run fn after this many seconds of game time. Returns a cancel function. */
export function after(seconds: number, fn: () => void) {
  const timer: Timer = { at: gameClock.time + seconds, fn, cancelled: false };
  timers.push(timer);
  return () => {
    timer.cancelled = true;
  };
}

/** Advance the game clock by one frame and run the timers that are due. */
export function tickGameClock(delta: number) {
  gameClock.dt = gameClock.paused ? 0 : Math.min(Math.max(delta, 0), MAX_STEP);
  gameClock.time += gameClock.dt;
  gameClock.frame += 1;
  if (timers.length === 0) return;
  const due: Timer[] = [];
  const later: Timer[] = [];
  for (const t of timers) {
    if (t.cancelled) continue;
    (t.at <= gameClock.time ? due : later).push(t);
  }
  timers = later;
  due.sort((a, b) => a.at - b.at).forEach((t) => t.fn());
}

/** For tests: back to time zero with no timers. */
export function resetGameClock() {
  gameClock.time = 0;
  gameClock.dt = 0;
  gameClock.paused = false;
  gameClock.frame = 0;
  timers = [];
}

/** useFrame for game logic: dt is game time (0 while paused, never more than MAX_STEP). */
export function useGameFrame(callback: (state: RootState, dt: number) => void, priority = 0) {
  useFrame((state) => callback(state, gameClock.dt), priority);
}

/** A small seeded random generator (mulberry32), so test runs are repeatable. */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
