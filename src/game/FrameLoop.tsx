import { advance, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { unstable_IdlePriority, unstable_scheduleCallback } from 'scheduler';
import { gameClock, MAX_STEP, TEST_STEP, tickGameClock } from './clock';
import { setInputClock } from './input';
import { adaptQuality, newAdaptState } from './adaptive';
import { perf, recordFrame } from './perf';
import { useSettings } from './settings';
import { isPaused } from './store';
import { TEST_MODE } from './testMode';

/** Ticks the game clock before any other frame callback. */
function GameClockTick() {
  useFrame((_, delta) => {
    gameClock.paused = isPaused();
    tickGameClock(delta);
  }, -100);
  return null;
}

// advance() is the library's global one: it always drives the live root (a root captured in a
// component can be a stale one after React StrictMode's double mount).

/** Normal play: one frame per animation frame, never stepping more than MAX_STEP. */
function RealtimeDriver() {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let sim = 0;
    const adapt = newAdaptState(last / 1000);
    const loop = (now: number) => {
      sim += Math.min(Math.max(0, (now - last) / 1000), MAX_STEP);
      last = now;
      advance(sim);
      if (recordFrame(now) && !document.hidden) {
        // Auto graphics: follow the frame rate (see adaptive.ts)
        const s = useSettings.getState();
        if (s.quality === 'auto') {
          const next = adaptQuality(s.autoLevel, s.detected, perf.fps, now / 1000, adapt);
          if (next !== s.autoLevel) useSettings.setState({ autoLevel: next });
        } else adapt.ignoreUntil = now / 1000 + 5;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return null;
}

/** Test mode: frames only advance through window.__silly.step(), and only the last one is drawn. */
function TestDriver() {
  const draw = useRef(true);
  const get = useThree((state) => state.get);
  // Taking over rendering (priority > 0) lets steps skip the expensive draw.
  useFrame(({ gl, scene, camera }) => {
    if (draw.current) gl.render(scene, camera);
  }, 1);
  useEffect(() => {
    let sim = 0;
    setInputClock(() => sim * 1000);
    const w = window as unknown as { __silly?: Record<string, unknown> };
    w.__silly = w.__silly ?? {};
    // Like real frames, let React finish between steps: new things spawned in one frame (a
    // poop, a baby dino) must exist in the next. React renders in 5 ms slices of *real* time,
    // so a single yield isn't enough on a busy machine; an idle-priority callback only runs
    // once every render and effect React has queued is done.
    const reactIdle = () => new Promise<void>((resolve) => unstable_scheduleCallback(unstable_IdlePriority, () => resolve()));
    w.__silly.step = async (frames = 1, render = true) => {
      for (let i = 0; i < frames; i += 1) {
        draw.current = render && i === frames - 1;
        sim += TEST_STEP;
        advance(sim);
        await reactIdle();
      }
      return gameClock.time;
    };
    // Draw the scene once so the page isn't blank, without running a frame of the game:
    // that would happen at an unpredictable point during loading.
    const raf = requestAnimationFrame(() => {
      const { gl, scene, camera } = get();
      gl.render(scene, camera);
    });
    return () => {
      cancelAnimationFrame(raf);
      setInputClock(() => performance.now());
    };
  }, []);
  return null;
}

export function FrameLoop() {
  return (
    <>
      <GameClockTick />
      {TEST_MODE ? <TestDriver /> : <RealtimeDriver />}
    </>
  );
}
