import { useFrame, type RootState } from '@react-three/fiber';
import { useRef } from 'react';
import { reportFault } from './faults';

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
  due
    .sort((a, b) => a.at - b.at)
    .forEach((t) => {
      try {
        t.fn();
      } catch (e) {
        reportFault('timer', e);
      }
    });
}

/** For tests: back to time zero with no timers. */
export function resetGameClock() {
  gameClock.time = 0;
  gameClock.dt = 0;
  gameClock.paused = false;
  gameClock.frame = 0;
  timers = [];
}

/** After this many frames in a row with an error, a frame callback is switched off. */
export const GIVE_UP_FRAMES = 30;

/**
 * Runs one frame callback so that an error stays inside it: the rest of the frame (every other
 * part of the park, the drawing) still runs. One that keeps failing is switched off.
 */
function contained(fails: { current: number }, where: string, fn: () => void) {
  if (fails.current >= GIVE_UP_FRAMES) return;
  try {
    fn();
    fails.current = 0;
  } catch (e) {
    fails.current += 1;
    reportFault(fails.current >= GIVE_UP_FRAMES ? `${where}, switched off after ${GIVE_UP_FRAMES} frames in a row with errors` : where, e);
  }
}

/** useFrame for game logic: dt is game time (0 while paused, never more than MAX_STEP). */
export function useGameFrame(callback: (state: RootState, dt: number) => void, priority = 0) {
  const fails = useRef(0);
  useFrame((state) => contained(fails, 'game frame', () => callback(state, gameClock.dt)), priority);
}

/** useFrame with real time (the camera, the sky, sounds), with errors kept inside it too. */
export function useSafeFrame(callback: (state: RootState, delta: number) => void, priority = 0) {
  const fails = useRef(0);
  useFrame((state, delta) => contained(fails, 'frame', () => callback(state, delta)), priority);
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
