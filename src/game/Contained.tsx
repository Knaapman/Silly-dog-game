import { useThree } from '@react-three/fiber';
import { Children, Component, isValidElement, useEffect, type ReactNode } from 'react';
import { reportFault } from './faults';

// Keeping a failure small (see faults.ts). A part of the park that throws while it's being built
// or drawn is left out, instead of React taking the whole picture down with it.

/** One part on its own: if it throws while being built or drawn, it's left out (and `onFail` runs). */
export class Safe extends Component<{ name: string; onFail?: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    reportFault(`${this.props.name} was left out`, error);
    this.props.onFail?.();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Each child on its own: one that fails is left out, and the rest of the park stays. */
export function Contained({ children }: { children: ReactNode }) {
  return (
    <>
      {Children.map(children, (child, i) => {
        if (!child) return child;
        const type = isValidElement(child) ? (child.type as { name?: string }) : undefined;
        return <Safe name={type?.name || `part ${i + 1}`}>{child}</Safe>;
      })}
    </>
  );
}

/** Seconds to wait for the graphics to come back after they drop out, before starting afresh. */
const RELOAD_AFTER = 3;
/** At most one such fresh start in this many seconds. */
const REPEAT_RELOAD = 120;
const RELOAD_KEY = 'silly-park:graphics-reload';
function lastReload() {
  try {
    return Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * The graphics card can drop out (a driver update or reset, waking from sleep): the picture goes
 * black. three.js picks up again when the browser brings it back; if it doesn't come back soon,
 * the page reloads (stickers, stars and settings are saved, the children just join again), at most
 * once every two minutes.
 */
export function GraphicsWatch() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    let timer = 0;
    const lost = () => {
      reportFault('graphics', new Error('the graphics card dropped out'), 'warn');
      window.clearTimeout(timer);
      // (not again and again, if the graphics keep dropping out straight after starting)
      if (Date.now() - lastReload() < REPEAT_RELOAD * 1000) return;
      timer = window.setTimeout(() => {
        try {
          sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        } catch {
          // no session storage: reload anyway
        }
        window.location.reload();
      }, RELOAD_AFTER * 1000);
    };
    const restored = () => window.clearTimeout(timer);
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    return () => {
      window.clearTimeout(timer);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
    };
  }, [gl]);
  return null;
}
