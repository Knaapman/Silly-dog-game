import { advance, useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { gameClock, MAX_STEP, TEST_STEP, tickGameClock } from './clock';
import { setInputClock } from './input';
import { useGame } from './store';
import { TEST_MODE } from './testMode';

/** Ticks the game clock before any other frame callback. */
function GameClockTick() {
  useFrame((_, delta) => {
    gameClock.paused = useGame.getState().menuOpen;
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
    const loop = (now: number) => {
      sim += Math.min(Math.max(0, (now - last) / 1000), MAX_STEP);
      last = now;
      advance(sim);
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
  // Taking over rendering (priority > 0) lets steps skip the expensive draw.
  useFrame(({ gl, scene, camera }) => {
    if (draw.current) gl.render(scene, camera);
  }, 1);
  useEffect(() => {
    let sim = 0;
    setInputClock(() => sim * 1000);
    const w = window as unknown as { __silly?: Record<string, unknown> };
    w.__silly = w.__silly ?? {};
    // Like real frames (each its own browser task), let React commit between steps: new
    // things spawned in one frame (a poop, a baby dino) must exist in the next.
    const yieldToReact = () =>
      new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => resolve();
        channel.port2.postMessage(null);
      });
    w.__silly.step = async (frames = 1, render = true) => {
      for (let i = 0; i < frames; i += 1) {
        draw.current = render && i === frames - 1;
        sim += TEST_STEP;
        advance(sim);
        await yieldToReact();
      }
      return gameClock.time;
    };
    // draw a first frame (after mounting has settled) so screenshots aren't blank
    const raf = requestAnimationFrame(() => {
      sim += TEST_STEP;
      advance(sim);
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
