import { useEffect, useState } from 'react';
import { PLAYER_COLORS, SPECIES_EMOJI } from '../game/config';
import { unlockedSpecies, useStickers } from '../game/stickers';
import { getConnectedPads } from '../game/input';
import { ButtonDiamond } from './actions';
import { GamepadIcon, HandIcon, KeyboardIcon, PlayIcon } from './Icons';

function usePadCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const update = () => setCount(getConnectedPads().length);
    update();
    const id = window.setInterval(update, 400);
    window.addEventListener('gamepadconnected', update);
    window.addEventListener('gamepaddisconnected', update);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('gamepadconnected', update);
      window.removeEventListener('gamepaddisconnected', update);
    };
  }, []);
  return count;
}

export function TitleScreen({ onPlay }: { onPlay: () => void }) {
  const pads = usePadCount();
  const stickers = useStickers((s) => s.got.length);
  const animals = unlockedSpecies(stickers);
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 [@media(max-height:500px)]:gap-2 bg-gradient-to-b from-sky-400/30 via-transparent to-emerald-500/30 px-4 text-white">
      <div className="flex max-w-full flex-wrap justify-center gap-2 sm:gap-5">
        {animals.map((s, i) => (
          <span
            key={s}
            className={`emoji animate-hop drop-shadow-lg ${animals.length > 4 ? 'text-5xl sm:text-7xl' : 'text-6xl sm:text-8xl'} [@media(max-height:500px)]:text-4xl`}
            style={{ animationDelay: `${i * 0.18}s` }}
          >
            {SPECIES_EMOJI[s]}
          </span>
        ))}
      </div>
      <h1 className="title-logo -rotate-2 text-center text-6xl sm:text-8xl [@media(max-height:500px)]:text-5xl">Silly Park</h1>
      <button
        onClick={onPlay}
        className="flex h-36 w-36 animate-breathe items-center justify-center rounded-full border-8 border-white bg-amber-400 pl-3 text-slate-900 shadow-[0_12px_0_#b45309] transition-transform active:translate-y-2 active:shadow-[0_4px_0_#b45309] sm:h-44 sm:w-44 [@media(max-height:500px)]:h-28 [@media(max-height:500px)]:w-28"
        aria-label="Play"
      >
        <PlayIcon size={80} />
      </button>
      <div className="flex items-center gap-6 rounded-full bg-slate-900/35 px-6 py-3 text-white/95 backdrop-blur-sm [@media(max-height:500px)]:py-1">
        <div className="flex items-center gap-2">
          {pads === 0 ? (
            <GamepadIcon size={46} className="opacity-70" />
          ) : (
            Array.from({ length: Math.min(4, pads) }, (_, i) => (
              <span key={i} style={{ color: PLAYER_COLORS[i] }} className="animate-bounce" title="Controller connected">
                <GamepadIcon size={46} />
              </span>
            ))
          )}
          {/* any face button starts: all four pulse (no letters, they differ between pad brands) */}
          <span className="relative h-10 w-10 animate-pulse" aria-hidden>
            {[
              ['#fbbf24', 'left-[14px] top-0'],
              ['#3b82f6', 'left-0 top-[14px]'],
              ['#ff4d5e', 'left-[28px] top-[14px]'],
              ['#22c55e', 'left-[14px] top-[28px]']
            ].map(([c, pos]) => (
              <span key={pos} className={`absolute h-3 w-3 rounded-full border border-white ${pos}`} style={{ background: c }} />
            ))}
          </span>
        </div>
        <KeyboardIcon size={46} />
        <HandIcon size={38} />
      </div>
      <div className="hidden opacity-90 sm:block [@media(max-height:500px)]:hidden">
        <ButtonDiamond size={40} />
      </div>
    </div>
  );
}
