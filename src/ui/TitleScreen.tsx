import { SPECIES, SPECIES_EMOJI } from '../game/config';
import { ButtonDiamond } from './actions';
import { GamepadIcon, HandIcon, KeyboardIcon, PlayIcon } from './Icons';

export function TitleScreen({ onPlay }: { onPlay: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-sky-400/30 via-transparent to-emerald-500/30 px-4 text-white">
      <div className="flex gap-3 sm:gap-6">
        {SPECIES.map((s, i) => (
          <span key={s} className="emoji animate-hop text-6xl drop-shadow-lg sm:text-8xl" style={{ animationDelay: `${i * 0.18}s` }}>
            {SPECIES_EMOJI[s]}
          </span>
        ))}
      </div>
      <h1 className="title-logo -rotate-2 text-center text-6xl sm:text-8xl">Silly Park</h1>
      <button
        onClick={onPlay}
        className="flex h-36 w-36 animate-breathe items-center justify-center rounded-full border-8 border-white bg-amber-400 pl-3 text-slate-900 shadow-[0_12px_0_#b45309] transition-transform active:translate-y-2 active:shadow-[0_4px_0_#b45309] sm:h-44 sm:w-44"
        aria-label="Play"
      >
        <PlayIcon size={80} />
      </button>
      <div className="flex items-center gap-6 rounded-full bg-slate-900/35 px-6 py-3 text-white/95 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <GamepadIcon size={46} />
          <span className="flex h-8 w-8 animate-pulse items-center justify-center rounded-full border-2 border-white bg-green-500 text-sm font-black">A</span>
        </div>
        <KeyboardIcon size={46} />
        <HandIcon size={38} />
      </div>
      <div className="hidden opacity-90 sm:block">
        <ButtonDiamond size={40} />
      </div>
    </div>
  );
}
