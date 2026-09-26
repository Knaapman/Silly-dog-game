import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { setTouchButton, setTouchStick, type ActionName } from '../game/input';
import { ACTION_UI } from './actions';

function capture(e: ReactPointerEvent) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    // The pointer may already be gone (very quick taps); the press still counts.
  }
}

// Floating joystick: put a thumb down anywhere on the left half and drag.
function Joystick() {
  const [stick, setStick] = useState<{ ox: number; oy: number; dx: number; dy: number } | null>(null);
  const pointer = useRef<number | null>(null);
  const MAX = 60;

  const update = (e: ReactPointerEvent, ox: number, oy: number) => {
    let dx = e.clientX - ox;
    let dy = e.clientY - oy;
    const len = Math.hypot(dx, dy);
    if (len > MAX) {
      dx = (dx / len) * MAX;
      dy = (dy / len) * MAX;
    }
    setStick({ ox, oy, dx, dy });
    setTouchStick(dx / MAX, dy / MAX);
  };

  const end = () => {
    pointer.current = null;
    setStick(null);
    setTouchStick(0, 0);
  };

  return (
    <div
      className="pointer-events-auto absolute bottom-0 left-0 top-24 w-1/2 touch-none"
      onPointerDown={(e) => {
        if (pointer.current != null) return;
        pointer.current = e.pointerId;
        capture(e);
        update(e, e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== pointer.current || !stick) return;
        update(e, stick.ox, stick.oy);
      }}
      onPointerUp={(e) => e.pointerId === pointer.current && end()}
      onPointerCancel={(e) => e.pointerId === pointer.current && end()}
    >
      {stick ? (
        <div className="fixed h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white/70 bg-white/25" style={{ left: stick.ox, top: stick.oy }}>
          <div
            className="absolute left-1/2 top-1/2 h-16 w-16 rounded-full border-4 border-white bg-sky-500 shadow-lg"
            style={{ transform: `translate(calc(-50% + ${stick.dx}px), calc(-50% + ${stick.dy}px))` }}
          />
        </div>
      ) : (
        <div className="absolute bottom-10 left-10 h-32 w-32 animate-pulse rounded-full border-4 border-dashed border-white/60 bg-white/10" />
      )}
    </div>
  );
}

function ActionButton({ action, size, className, style }: { action: ActionName; size: number; className?: string; style?: React.CSSProperties }) {
  const ui = ACTION_UI[action];
  const [down, setDown] = useState(false);
  const release = () => {
    setDown(false);
    setTouchButton(action, false);
  };
  return (
    <button
      className={`pointer-events-auto absolute flex touch-none select-none items-center justify-center rounded-full border-4 border-white text-white ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        background: ui.color,
        fontSize: size * 0.46,
        boxShadow: down ? `0 1px 0 ${ui.shadow}` : `0 7px 0 ${ui.shadow}`,
        transform: down ? 'translateY(6px) scale(0.95)' : undefined,
        ...style
      }}
      onPointerDown={(e) => {
        capture(e);
        setDown(true);
        setTouchButton(action, true);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={ui.label}
    >
      {ui.icon}
    </button>
  );
}

export function TouchControls() {
  const big = 84;
  const gap = 8;
  const span = big * 2.5;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none">
      <Joystick />
      <div className="absolute bottom-6 right-6" style={{ width: span, height: span }}>
        <ActionButton action="noise" size={big} style={{ left: (span - big) / 2, top: -gap }} />
        <ActionButton action="lick" size={big} style={{ left: -gap, top: (span - big) / 2 }} />
        <ActionButton action="bonk" size={big} style={{ right: -gap, top: (span - big) / 2 }} />
        <ActionButton action="jump" size={big + 8} style={{ left: (span - big - 8) / 2, bottom: -gap }} />
      </div>
      <div className="absolute right-6 flex gap-3" style={{ bottom: span + 40 }}>
        <ActionButton action="hat" size={54} className="!relative" />
        <ActionButton action="flop" size={54} className="!relative" />
        <ActionButton action="poop" size={64} className="!relative" />
      </div>
    </div>
  );
}
