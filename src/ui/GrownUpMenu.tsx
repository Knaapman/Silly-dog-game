import { useEffect, useRef, useState, type ReactNode } from 'react';
import { setMusicEnabled, setMuted, setVolume, unlockAudio } from '../game/audio';
import { KEYMAPS, onUiNav, type ActionName } from '../game/input';
import { useGame } from '../game/store';
import { ACTION_UI, ButtonDiamond } from './actions';
import { useAudioState } from './Hud';
import { CloseIcon, FullscreenIcon, HomeIcon, MusicIcon, ResetIcon, SpeakerIcon } from './Icons';

function RoundButton({
  onClick,
  children,
  title,
  active = true,
  focused = false,
  color,
  buttonRef
}: {
  onClick: () => void;
  children: ReactNode;
  title: string;
  active?: boolean;
  focused?: boolean;
  color?: string;
  buttonRef?: (el: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={buttonRef}
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-white shadow-lg transition-transform active:scale-90 ${
        color ?? (active ? 'bg-sky-500 text-white' : 'bg-slate-500 text-white/80')
      } ${focused ? 'scale-110 ring-4 ring-amber-300' : ''}`}
    >
      {children}
    </button>
  );
}

const KEY_LABELS: Record<string, string> = {
  Space: '␣',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: '⏎',
  ShiftRight: '⇧',
  ControlRight: 'Ctrl',
  Slash: '/',
  Period: '.',
  Comma: ',',
  Digit1: '1',
  Digit2: '2',
  NumpadDecimal: 'Num .'
};

function keyLabel(code: string) {
  return KEY_LABELS[code] ?? code.replace(/^Key/, '').replace(/^Numpad/, 'Num ');
}

function KeyCap({ code }: { code: string }) {
  return <kbd className="inline-flex min-w-7 items-center justify-center rounded-md border-b-4 border-slate-400 bg-white px-1.5 py-0.5 text-xs font-black text-slate-800">{keyLabel(code)}</kbd>;
}

function KeyboardLegend({ source, color }: { source: 'kb1' | 'kb2'; color: string }) {
  const map = KEYMAPS[source];
  const rows: ActionName[] = ['jump', 'bonk', 'lick', 'noise', 'flop', 'species', 'hat'];
  return (
    <div className="rounded-2xl border-4 bg-white/10 p-3" style={{ borderColor: color }}>
      <div className="mb-2 flex gap-1">
        {[map.up[0], map.left[0], map.down[0], map.right[0]].map((c) => (
          <KeyCap key={c} code={c} />
        ))}
      </div>
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1">
        {rows.map((a) => (
          <div key={a} className="contents">
            <span className="flex h-7 w-7 items-center justify-center rounded-full text-sm text-white" style={{ background: ACTION_UI[a].color }} title={ACTION_UI[a].label}>
              <span className="scale-75">{ACTION_UI[a].icon}</span>
            </span>
            <span className="flex gap-1">
              {map.actions[a].slice(0, 2).map((c) => (
                <KeyCap key={c} code={c} />
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GrownUpMenu() {
  const setMenuOpen = useGame((s) => s.setMenuOpen);
  const resetPark = useGame((s) => s.resetPark);
  const backToTitle = useGame((s) => s.backToTitle);
  const audio = useAudioState();

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  // Controller navigation: D-pad / stick moves, A presses, B or Start closes.
  const BUTTONS = 6;
  const SLIDER = BUTTONS;
  const [focus, setFocus] = useState(BUTTONS - 1);
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const volumeRef = useRef(audio.volume);
  volumeRef.current = audio.volume;
  useEffect(
    () =>
      onUiNav((nav) => {
        const f = focusRef.current;
        if (nav === 'back') setMenuOpen(false);
        else if (nav === 'confirm') buttons.current[f]?.click();
        else if (nav === 'down') setFocus(SLIDER);
        else if (nav === 'up') setFocus(Math.min(f, BUTTONS - 1));
        else if (f === SLIDER) setVolume(volumeRef.current + (nav === 'right' ? 0.1 : -0.1));
        else setFocus((f + (nav === 'right' ? 1 : -1) + BUTTONS) % BUTTONS);
      }),
    [setMenuOpen, SLIDER]
  );
  const btnRef = (i: number) => (el: HTMLButtonElement | null) => {
    buttons.current[i] = el;
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" onClick={() => setMenuOpen(false)}>
      <div className="max-h-full w-full max-w-3xl overflow-auto rounded-[2rem] border-4 border-white bg-slate-800/95 p-5 text-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <RoundButton buttonRef={btnRef(0)} focused={focus === 0} onClick={() => { unlockAudio(); setMuted(!audio.muted); }} title={audio.muted ? 'Sound on' : 'Sound off'} active={!audio.muted}>
            <SpeakerIcon muted={audio.muted} size={30} />
          </RoundButton>
          <RoundButton buttonRef={btnRef(1)} focused={focus === 1} onClick={() => setMusicEnabled(!audio.music)} title={audio.music ? 'Music off' : 'Music on'} active={audio.music}>
            <MusicIcon off={!audio.music} size={30} />
          </RoundButton>
          <RoundButton buttonRef={btnRef(2)} focused={focus === 2} onClick={() => { resetPark(); setMenuOpen(false); }} title="Tidy up the park">
            <ResetIcon size={30} />
          </RoundButton>
          <RoundButton buttonRef={btnRef(3)} focused={focus === 3} onClick={toggleFullscreen} title="Full screen">
            <FullscreenIcon size={30} />
          </RoundButton>
          <RoundButton buttonRef={btnRef(4)} focused={focus === 4} onClick={backToTitle} title="Back to start (everyone leaves)">
            <HomeIcon size={30} />
          </RoundButton>
          <RoundButton buttonRef={btnRef(5)} focused={focus === 5} onClick={() => setMenuOpen(false)} title="Close" color="bg-emerald-500 text-white">
            <CloseIcon size={30} />
          </RoundButton>
        </div>
        <label className={`mx-auto mt-4 flex max-w-sm items-center gap-3 rounded-full px-3 py-1 ${focus === SLIDER ? 'ring-4 ring-amber-300' : ''}`}>
          <SpeakerIcon size={22} />
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(audio.volume * 100)}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
            className="w-full accent-amber-400"
            aria-label="Volume"
          />
        </label>

        <div className="mt-5 grid gap-4 sm:grid-cols-[auto_1fr_1fr]">
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/10 p-3">
            <ButtonDiamond size={36} />
            <div className="flex gap-2 text-xs">
              <span className="rounded-md bg-white/20 px-2 py-1" title="Shoulder buttons / triggers">LB RB LT RT = {ACTION_UI.flop.icon}</span>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="rounded-md bg-white/20 px-2 py-1" title="Back / Select / View (hold: leave)">⧉ = {ACTION_UI.species.icon}</span>
              <span className="rounded-md bg-white/20 px-2 py-1" title="Start / Menu / Options (hold: this menu)">☰ = {ACTION_UI.hat.icon}</span>
            </div>
          </div>
          <KeyboardLegend source="kb1" color="#ff4d5e" />
          <KeyboardLegend source="kb2" color="#3b82f6" />
        </div>
        <p className="mt-4 text-center text-sm text-white/75">
          Up to 4 players: every controller joins by pressing any button. Tap Select to change animal, tap Start to change hat. Hold Start to open this menu (D-pad to move, A to press, B to close); hold Select to leave. If a controller disconnects, its animal naps until it comes back. Keyboard can host two players; <kbd className="rounded bg-white/20 px-1">Esc</kbd> opens this menu.
        </p>
      </div>
    </div>
  );
}
