import { useEffect, useRef, useState } from 'react';
import { discardPendingPresses, padSnapshots, type ActionName, type PadSnapshot } from '../game/input';
import { useGame } from '../game/store';
import { ACTION_UI } from './actions';
import { CameraIcon } from './Icons';

// For grown-ups: see exactly what each controller sends and what the game makes of it. The
// picture lights up by *game* meaning (standard positions after translation), and the row of
// numbers underneath shows the raw buttons, so a pad that reports its buttons in an unusual
// order is easy to spot. Hold the right face button (B on Xbox, A on Switch) to leave.

const EXIT_HOLD_MS = 1500;

/** Standard button -> what it does in the game. */
const MEANING: Record<number, { action?: ActionName; label: string }> = {
  0: { action: 'jump', label: 'bottom' },
  1: { action: 'bonk', label: 'right' },
  2: { action: 'lick', label: 'left' },
  3: { action: 'noise', label: 'top' },
  4: { action: 'flop', label: 'LB' },
  5: { action: 'flop', label: 'RB' },
  6: { action: 'poop', label: 'LT' },
  7: { action: 'poop', label: 'RT' },
  8: { action: 'species', label: 'Select' },
  9: { action: 'hat', label: 'Start' },
  10: { label: 'L stick' },
  11: { label: 'R stick' },
  16: { label: 'Home' },
  17: { label: 'Capture' }
};

function Btn({ pad, i, x, y, w = 26, h = 26, round = true }: { pad: PadSnapshot; i: number; x: number; y: number; w?: number; h?: number; round?: boolean }) {
  const lit = !!pad.buttons[i];
  const m = MEANING[i];
  const ui = m?.action ? ACTION_UI[m.action] : undefined;
  return (
    <div
      data-button={i}
      data-lit={lit}
      title={`${m?.label ?? i}${ui ? `: ${ui.label}` : ''}`}
      className={`absolute flex items-center justify-center border-2 text-[13px] text-white transition-transform ${round ? 'rounded-full' : 'rounded-md'} ${lit ? 'scale-125 border-amber-300 shadow-lg shadow-amber-300/60' : 'border-white/40 opacity-60'}`}
      style={{ left: x, top: y, width: w, height: h, background: ui?.color ?? '#64748b' }}
    >
      {i === 17 ? <CameraIcon size={14} /> : ui ? <span className="scale-[0.55]">{ui.icon}</span> : null}
    </div>
  );
}

function PadPicture({ pad }: { pad: PadSnapshot }) {
  const [sx, sy] = pad.stick;
  const [dx, dz] = pad.dpad;
  return (
    <div className="relative mx-auto h-[150px] w-[300px] rounded-[48px] bg-slate-600/80">
      {/* shoulders */}
      <Btn pad={pad} i={6} x={30} y={-22} w={48} h={18} round={false} />
      <Btn pad={pad} i={4} x={84} y={-10} w={40} h={14} round={false} />
      <Btn pad={pad} i={5} x={176} y={-10} w={40} h={14} round={false} />
      <Btn pad={pad} i={7} x={222} y={-22} w={48} h={18} round={false} />
      {/* left stick */}
      <div className="absolute left-[34px] top-[22px] h-[54px] w-[54px] rounded-full border-2 border-white/40 bg-slate-800" data-stick>
        <div className="absolute h-4 w-4 rounded-full bg-white" style={{ left: 19 + sx * 17, top: 19 + sy * 17 }} />
      </div>
      {/* d-pad */}
      {(
        [
          [0, -1, 12],
          [0, 1, 13],
          [-1, 0, 14],
          [1, 0, 15]
        ] as const
      ).map(([x, z, i]) => {
        const lit = (x !== 0 && Math.sign(dx) === x) || (z !== 0 && Math.sign(dz) === z);
        return (
          <div
            key={i}
            data-button={i}
            data-lit={lit}
            className={`absolute h-5 w-5 rounded-sm border-2 ${lit ? 'scale-125 border-amber-300 bg-amber-400' : 'border-white/40 bg-slate-800'}`}
            style={{ left: 84 + x * 20, top: 96 + z * 20 }}
          />
        );
      })}
      {/* middle */}
      <Btn pad={pad} i={8} x={118} y={40} w={22} h={14} />
      <Btn pad={pad} i={9} x={160} y={40} w={22} h={14} />
      <Btn pad={pad} i={17} x={118} y={66} w={22} h={18} round={false} />
      <Btn pad={pad} i={16} x={160} y={66} w={22} h={18} />
      {/* face buttons, by position */}
      <Btn pad={pad} i={3} x={222} y={16} />
      <Btn pad={pad} i={2} x={194} y={44} />
      <Btn pad={pad} i={1} x={250} y={44} />
      <Btn pad={pad} i={0} x={222} y={72} />
    </div>
  );
}

export function ControllerTester({ onDone }: { onDone: () => void }) {
  const [, setTick] = useState(0);
  const players = useGame((s) => s.players);
  const exitSince = useRef(new Map<number, number>());
  const [exitProgress, setExitProgress] = useState(0);
  // leaving: the buttons pressed while testing must not also do something in the menu
  const done = useRef(onDone);
  done.current = () => {
    discardPendingPresses();
    onDone();
  };

  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      // hold the "back" button to leave
      let most = 0;
      for (const pad of padSnapshots()) {
        if (pad.buttons[1]) {
          const since = exitSince.current.get(pad.index) ?? now;
          exitSince.current.set(pad.index, since);
          most = Math.max(most, (now - since) / EXIT_HOLD_MS);
        } else exitSince.current.delete(pad.index);
      }
      setExitProgress(Math.min(1, most));
      if (most >= 1) {
        done.current();
        return;
      }
      setTick((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.stopPropagation();
        done.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);

  const pads = padSnapshots();
  return (
    <div data-testid="controller-tester">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-bold">Controllers ({pads.length})</span>
        <button onClick={() => done.current()} className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold active:scale-90">
          Done
        </button>
      </div>
      {pads.length === 0 && <p className="text-sm text-white/70">No controller found. Plug one in and press any button on it (browsers only see a controller after a button press).</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {pads.map((pad) => {
          const player = players.find((p) => p.source === `pad${pad.index}`);
          return (
            <div key={pad.index} className="rounded-2xl bg-white/10 p-3 pt-8" data-pad={pad.index}>
              <PadPicture pad={pad} />
              <p className="mt-3 flex items-center gap-2 text-xs font-bold">
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: player?.color ?? 'transparent', border: '2px solid white' }} />
                Port {pad.index + 1}: {pad.standard ? 'recognised by the browser' : 'not recognised, read as a DirectInput/Switch-style pad'}
              </p>
              <p className="truncate text-[11px] text-white/60" title={pad.id}>
                {pad.id}
              </p>
              <div className="mt-2 flex flex-wrap gap-1" data-raw>
                {pad.raw.map((down, i) => (
                  <span key={i} data-raw-button={i} data-lit={down} className={`min-w-6 rounded px-1 text-center text-[11px] font-bold ${down ? 'bg-amber-400 text-slate-900' : 'bg-white/10 text-white/50'}`}>
                    {i}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-center text-xs text-white/60">
        Hold the right face button to go back
        <span className="ml-2 inline-block h-2 w-24 overflow-hidden rounded-full bg-white/15 align-middle">
          <span className="block h-full bg-amber-400" style={{ width: `${exitProgress * 100}%` }} />
        </span>
      </p>
    </div>
  );
}
