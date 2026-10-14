import { useEffect, useState } from 'react';
import { useFinale } from '../game/finale';
import { useGame } from '../game/store';
import { wakeUp } from '../game/world/Finale';
import { PlayIcon } from './Icons';
import { SpeciesIcon } from './SpeciesIcon';

/** The night screen's "play again" shows up after this long (ms), small, for a grown-up's mouse. */
const PLAY_AGAIN_AFTER = 8000;

const STARS = Array.from({ length: 18 }, (_, i) => ({ x: (i * 53) % 100, y: (i * 37) % 55, d: (i % 5) * 0.4, s: 0.7 + (i % 3) * 0.35 }));

/**
 * The grand finale over the picture: the sky turning to sunset (bedtime) or gold (the full album)
 * during the show, night falling, and then the night screen: a moon, the stars, every animal
 * asleep, and (after a moment, small in the corner) a button to play again.
 */
export function FinaleOverlay() {
  const phase = useFinale((s) => s.phase);
  const kind = useFinale((s) => s.kind);
  const players = useGame((s) => s.players);
  const [canWake, setCanWake] = useState(false);
  useEffect(() => {
    setCanWake(false);
    if (phase !== 'night') return;
    const id = window.setTimeout(() => setCanWake(true), PLAY_AGAIN_AFTER);
    return () => window.clearTimeout(id);
  }, [phase]);
  if (phase === 'off') return null;

  const tint =
    phase === 'sleep' || phase === 'night'
      ? 'linear-gradient(to bottom, rgba(10,15,55,0.75), rgba(40,25,90,0.55))'
      : kind === 'bedtime'
        ? 'linear-gradient(to bottom, rgba(255,95,40,0.5), rgba(160,50,150,0.38))'
        : 'radial-gradient(circle at 50% 40%, rgba(255,215,90,0.05), rgba(255,190,40,0.45))';
  return (
    <div className="pointer-events-none absolute inset-0 z-40" data-testid="finale" data-phase={phase} data-kind={kind}>
      <div className="absolute inset-0 transition-[background] duration-[2000ms]" style={{ background: tint }} />
      {(phase === 'sleep' || phase === 'night') && (
        <>
          <span className="emoji absolute right-[8%] top-[6%] animate-pulse text-[14vmin] drop-shadow-[0_0_30px_rgba(255,240,170,0.8)]">🌙</span>
          {STARS.map((s, i) => (
            <span key={i} className="emoji absolute animate-pulse" style={{ left: `${s.x}%`, top: `${s.y}%`, fontSize: `${s.s * 3}vmin`, animationDelay: `${s.d}s` }}>
              ✨
            </span>
          ))}
        </>
      )}
      {phase === 'night' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-slate-950/60" data-testid="night-screen">
          <div className="flex flex-wrap justify-center gap-6">
            {players.map((p) => (
              <span key={p.slot} className="relative">
                <span className="emoji text-[12vmin] opacity-90 grayscale-[30%]">
                  <SpeciesIcon species={p.species} />
                </span>
                <span className="emoji absolute -right-4 -top-4 animate-pulse text-[6vmin]">💤</span>
              </span>
            ))}
          </div>
          {canWake && (
            <button
              className="pointer-events-auto absolute bottom-6 right-6 flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-emerald-500 text-white opacity-80 shadow-lg active:scale-90"
              onClick={wakeUp}
              title="Play again"
              aria-label="Play again"
              data-testid="play-again"
            >
              <PlayIcon size={28} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
