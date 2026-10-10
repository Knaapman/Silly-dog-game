import { useEffect, useRef, useState, type ReactNode } from 'react';
import { setMusicEnabled, setMuted, setVolume, unlockAudio } from '../game/audio';
import { KEYMAPS, onUiNav, type ActionName } from '../game/input';
import { effectiveQuality, useSettings, type Level, type Quality, type Settings, ZOOM_MAX, ZOOM_MIN } from '../game/settings';
import { installApp, useInstall } from '../game/install';
import { perf } from '../game/perf';
import { clearPlayLog, loadSessions, playLogFile } from '../game/playlog';
import { MAX_PHOTOS, usePhotos } from '../game/photo';
import { HAT_UNLOCKS, useProgress } from '../game/progress';
import { STICKERS, useStickers } from '../game/stickers';
import { useGame } from '../game/store';
import { ACTION_UI, ButtonDiamond } from './actions';
import { useAudioState } from './Hud';
import { ControllerTester } from './ControllerTester';
import { AlbumIcon } from './Stickers';
import { CameraIcon, CloseIcon, FullscreenIcon, GamepadIcon, HomeIcon, MusicIcon, ResetIcon, SpeakerIcon, StarIcon } from './Icons';

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
  Quote: "'",
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
  const rows: ActionName[] = ['jump', 'bonk', 'lick', 'noise', 'flop', 'poop', 'species', 'hat'];
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

type ChoiceRow = {
  key: keyof Settings;
  icon: string;
  label: string;
  options: { value: Settings[keyof Settings]; label: string }[];
};

const LEVELS = (a: string, b: string, c: string) => [
  { value: 0 as Level, label: a },
  { value: 1 as Level, label: b },
  { value: 2 as Level, label: c }
];

function settingRows(autoLevel: Quality): ChoiceRow[] {
  const name = { low: 'Low', high: 'High', ultra: 'Ultra' };
  return [
    { key: 'speed', icon: '🏃', label: 'Running speed', options: LEVELS('Calm', 'Normal', 'Zoomy') },
    {
      key: 'split',
      icon: '📺',
      label: 'Split screen when far apart',
      options: [
        { value: false, label: 'Off' },
        { value: true, label: 'On' }
      ]
    },
    { key: 'together', icon: '🤝', label: 'Stay together (split screen off)', options: LEVELS('Close', 'Normal', 'Far') },
    {
      key: 'chase',
      icon: '🐈',
      label: 'Catching the cats',
      options: [
        { value: 'auto', label: 'Auto' },
        { value: 0 as Level, label: 'Easy' },
        { value: 1 as Level, label: 'Normal' },
        { value: 2 as Level, label: 'Tricky' }
      ]
    },
    { key: 'magic', icon: '✨', label: 'Magic food lasts', options: LEVELS('Short', 'Normal', 'Long') },
    { key: 'sprout', icon: '🌸', label: 'Poops turn into flowers', options: LEVELS('Soon', 'Normal', 'Late') },
    {
      key: 'surprises',
      icon: '🎁',
      label: 'Surprises (rain, runaway chicken, present balloon)',
      options: [
        { value: false, label: 'Off' },
        { value: true, label: 'On' }
      ]
    },
    {
      key: 'buddy',
      icon: '🐾',
      label: 'Buddy when playing alone',
      options: [
        { value: false, label: 'Off' },
        { value: true, label: 'On' }
      ]
    },
    { key: 'buddyHelp', icon: '🤲', label: 'What the buddy does', options: LEVELS('Just follows', 'Joins in', 'Helps') },
    {
      key: 'rumble',
      icon: '📳',
      label: 'Controller rumble',
      options: [
        { value: false, label: 'Off' },
        { value: true, label: 'On' }
      ]
    },
    {
      key: 'quality',
      icon: '🖥️',
      label: 'Graphics',
      options: [
        { value: 'auto', label: `Auto (${name[autoLevel]})` },
        { value: 'low', label: 'Low' },
        { value: 'high', label: 'High' },
        { value: 'ultra', label: 'Ultra' }
      ]
    }
  ];
}

function Choice({ row, focused }: { row: ChoiceRow; focused: boolean }) {
  const value = useSettings((s) => s[row.key]);
  const set = useSettings((s) => s.set);
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/10 px-3 py-2 ${focused ? 'ring-4 ring-amber-300' : ''}`} data-setting={row.key}>
      <span className="flex items-center gap-2 text-sm font-bold">
        <span className="emoji text-xl">{row.icon}</span>
        {row.label}
      </span>
      <span className="flex gap-1">
        {row.options.map((o) => (
          <button
            key={String(o.value)}
            onClick={() => set({ [row.key]: o.value } as Partial<Settings>)}
            className={`rounded-full px-3 py-1 text-sm font-bold transition-transform active:scale-90 ${o.value === value ? 'bg-amber-400 text-slate-900' : 'bg-white/15 text-white'}`}
          >
            {o.label}
          </button>
        ))}
      </span>
    </div>
  );
}

/** Move a setting one step left/right (controller navigation). */
function stepSetting(row: ChoiceRow, dir: number) {
  const state = useSettings.getState();
  const i = row.options.findIndex((o) => o.value === state[row.key]);
  const next = row.options[Math.max(0, Math.min(row.options.length - 1, i + dir))];
  state.set({ [row.key]: next.value } as Partial<Settings>);
}

function stamp(ms: number) {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}_${two(d.getHours())}-${two(d.getMinutes())}-${two(d.getSeconds())}`;
}

/** Photos taken with the camera button: save them, or delete them. */
function PhotoGallery() {
  const photos = usePhotos((s) => s.photos);
  const remove = usePhotos((s) => s.remove);
  const clear = usePhotos((s) => s.clear);
  return (
    <div className="mt-4 rounded-2xl bg-white/10 p-3" data-testid="photo-gallery">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-bold">
          <CameraIcon size={20} /> Photos ({photos.length}/{MAX_PHOTOS})
        </span>
        {photos.length > 0 && (
          <button onClick={clear} className="rounded-full bg-rose-500/80 px-3 py-1 text-xs font-bold active:scale-90">
            Delete all
          </button>
        )}
      </div>
      {photos.length === 0 ? (
        <p className="text-xs text-white/60">
          The pink camera button on screen, Capture on a Switch-style controller, or T / Numpad 8 on the keyboard takes a photo. The newest {MAX_PHOTOS} are kept on this device.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos
            .slice()
            .reverse()
            .map((p) => (
              <div key={p.id} className="relative overflow-hidden rounded-lg bg-black/30" data-testid="photo-thumb">
                <img src={p.url} alt="" className="aspect-video w-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-black/40 p-1">
                  <a href={p.url} download={`silly-park-${stamp(p.at)}.jpg`} title="Save" className="rounded-full bg-sky-500 px-2 py-0.5 text-xs font-bold">
                    Save
                  </a>
                  <button onClick={() => remove(p.id)} title="Delete" className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold">
                    Delete
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/** Put the game on the desktop (when the browser offers it), and whether it works offline. */
function InstallRow() {
  const { canInstall, installed, offlineReady } = useInstall();
  if (!canInstall && !installed && !offlineReady) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm font-bold" data-testid="install-row">
      <span>{installed ? '🖥️ Installed as an app' : offlineReady ? '✈️ Works without internet' : '🖥️ Can be installed'}</span>
      {canInstall && (
        <button onClick={() => void installApp()} className="rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-slate-900 active:scale-90">
          Put it on the desktop
        </button>
      )}
    </div>
  );
}

/** Stars found so far and the hats they unlocked, with a (two-step) reset. */
function ProgressRow() {
  const starsEver = useProgress((s) => s.starsEver);
  const stickers = useStickers((s) => s.got.length);
  const reset = () => {
    useProgress.getState().reset();
    useStickers.getState().reset();
  };
  const [sure, setSure] = useState(false);
  const unlocked = HAT_UNLOCKS.filter((u) => starsEver >= u.stars).length;
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm font-bold">
      <span className="flex items-center gap-2">
        <StarIcon size={20} /> {starsEver} stars found · {unlocked}/{HAT_UNLOCKS.length} hats · {stickers}/{STICKERS.length} stickers
      </span>
      <button
        onClick={() => {
          if (!sure) return setSure(true);
          reset();
          setSure(false);
        }}
        className={`rounded-full px-3 py-1 text-xs font-bold active:scale-90 ${sure ? 'bg-rose-500' : 'bg-white/15'}`}
      >
        {sure ? 'Sure? Tap again' : 'Start over'}
      </button>
    </div>
  );
}

export function GrownUpMenu() {
  const setMenuOpen = useGame((s) => s.setMenuOpen);
  const resetPark = useGame((s) => s.resetPark);
  const backToTitle = useGame((s) => s.backToTitle);
  const audio = useAudioState();
  const autoLevel = useSettings((s) => s.autoLevel);
  const gpu = useSettings((s) => s.gpu);
  const quality = useSettings(effectiveQuality);
  const zoom = useSettings((s) => s.zoom);
  const rows = settingRows(autoLevel);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  };

  // Controller navigation, row by row: the round buttons, the volume, then each setting.
  // D-pad / stick up-down picks a row, left-right moves (or changes the setting), A presses,
  // B or Start closes.
  const BUTTONS = 8;
  const SLIDER_ROW = 1;
  const ZOOM_ROW = 2;
  const FIRST_SETTING = 3;
  const ROWS = FIRST_SETTING + rows.length;
  const [focus, setFocus] = useState({ row: 0, col: BUTTONS - 1 });
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const volumeRef = useRef(audio.volume);
  volumeRef.current = audio.volume;
  useEffect(
    () =>
      onUiNav((nav) => {
        if (testerRef.current) return; // the controller tester uses every button itself
        const { row, col } = focusRef.current;
        const setting = rowsRef.current[row - FIRST_SETTING];
        if (nav === 'back') setMenuOpen(false);
        else if (nav === 'up' || nav === 'down') setFocus({ row: Math.max(0, Math.min(ROWS - 1, row + (nav === 'down' ? 1 : -1))), col });
        else if (nav === 'confirm') {
          if (row === 0) buttons.current[col]?.click();
          else if (setting) stepSetting(setting, 1);
        } else {
          const dir = nav === 'right' ? 1 : -1;
          if (row === 0) setFocus({ row, col: (col + dir + BUTTONS) % BUTTONS });
          else if (row === SLIDER_ROW) setVolume(volumeRef.current + dir * 0.1);
          else if (row === ZOOM_ROW) useSettings.getState().set({ zoom: useSettings.getState().zoom + dir * 0.1 });
          else if (setting) stepSetting(setting, dir);
        }
      }),
    [setMenuOpen, ROWS]
  );
  const btnRef = (i: number) => (el: HTMLButtonElement | null) => {
    buttons.current[i] = el;
  };
  const focused = (i: number) => focus.row === 0 && focus.col === i;
  const [tester, setTester] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.querySelector(`[data-menu-row="${focus.row}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [focus.row]);
  const testerRef = useRef(tester);
  testerRef.current = tester;
  const fps = useFps();
  const draws = useDraws();

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" onClick={() => setMenuOpen(false)}>
      <div className="max-h-full w-full max-w-3xl overflow-auto rounded-[2rem] border-4 border-white bg-slate-800/95 p-5 text-white shadow-2xl" onClick={(e) => e.stopPropagation()} data-testid="grown-up-menu" ref={panel}>
        {tester ? (
          <ControllerTester onDone={() => setTester(false)} />
        ) : (
        <>
        <div className="flex flex-wrap items-center justify-center gap-3" data-menu-row={0}>
          <RoundButton buttonRef={btnRef(0)} focused={focused(0)} onClick={() => { unlockAudio(); setMuted(!audio.muted); }} title={audio.muted ? 'Sound on' : 'Sound off'} active={!audio.muted}>
            <SpeakerIcon muted={audio.muted} size={30} />
          </RoundButton>
          <RoundButton buttonRef={btnRef(1)} focused={focused(1)} onClick={() => setMusicEnabled(!audio.music)} title={audio.music ? 'Music off' : 'Music on'} active={audio.music}>
            <MusicIcon off={!audio.music} size={30} />
          </RoundButton>
          <RoundButton buttonRef={btnRef(2)} focused={focused(2)} onClick={() => { resetPark(); setMenuOpen(false); }} title="Tidy up the park">
            <ResetIcon size={30} />
          </RoundButton>
          <RoundButton buttonRef={btnRef(3)} focused={focused(3)} onClick={toggleFullscreen} title="Full screen">
            <FullscreenIcon size={30} />
          </RoundButton>
          <RoundButton buttonRef={btnRef(4)} focused={focused(4)} onClick={backToTitle} title="Back to start (everyone leaves)">
            <HomeIcon size={30} />
          </RoundButton>
          <RoundButton buttonRef={btnRef(5)} focused={focused(5)} onClick={() => setTester(true)} title="Test controllers">
            <GamepadIcon size={30} />
          </RoundButton>
          <RoundButton buttonRef={btnRef(6)} focused={focused(6)} onClick={() => useGame.getState().setAlbumOpen(true)} title="Sticker album" color="bg-amber-500 text-white">
            <AlbumIcon size={30} />
          </RoundButton>
          <RoundButton buttonRef={btnRef(7)} focused={focused(7)} onClick={() => setMenuOpen(false)} title="Close" color="bg-emerald-500 text-white">
            <CloseIcon size={30} />
          </RoundButton>
        </div>
        <label className={`mx-auto mt-4 flex max-w-sm items-center gap-3 rounded-full px-3 py-1 ${focus.row === SLIDER_ROW ? 'ring-4 ring-amber-300' : ''}`} data-menu-row={SLIDER_ROW}>
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
        <label className={`mx-auto mt-2 flex max-w-sm items-center gap-3 rounded-full px-3 py-1 ${focus.row === ZOOM_ROW ? 'ring-4 ring-amber-300' : ''}`} data-menu-row={ZOOM_ROW} data-setting="zoom">
          <span className="emoji text-xl" title="Camera: close up or far away">
            🔍
          </span>
          <input
            type="range"
            min={ZOOM_MIN * 100}
            max={ZOOM_MAX * 100}
            step={5}
            value={Math.round(zoom * 100)}
            onChange={(e) => useSettings.getState().set({ zoom: Number(e.target.value) / 100 })}
            className="w-full accent-amber-400"
            aria-label="Zoom"
          />
        </label>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {rows.map((row, i) => (
            <div key={row.key} data-menu-row={FIRST_SETTING + i}>
              <Choice row={row} focused={focus.row === FIRST_SETTING + i} />
            </div>
          ))}
        </div>
        {gpu && (
          <p className="mt-1 text-center text-xs text-white/50" title={gpu}>
            Graphics: {quality}
            {fps > 0 && <span data-testid="fps"> · {Math.round(fps)} fps</span>}
            {draws.calls > 0 && (
              <span data-testid="draws">
                {' '}· {draws.calls} draws · {Math.round(draws.triangles / 1000)}k triangles
              </span>
            )}{' '}
            · {gpu.replace(/^ANGLE \((.*)\)$/, '$1').slice(0, 80)}
          </p>
        )}

        <PlayLogRow />
        <ProgressRow />
        <InstallRow />
        <PhotoGallery />

        <div className="mt-5 grid gap-4 sm:grid-cols-[auto_1fr_1fr]">
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/10 p-3">
            <ButtonDiamond size={36} />
            <div className="flex gap-2 text-xs">
              <span className="rounded-md bg-white/20 px-2 py-1" title="Shoulder buttons (bumpers)">LB RB = {ACTION_UI.flop.icon}</span>
              <span className="rounded-md bg-white/20 px-2 py-1" title="Triggers">LT RT = {ACTION_UI.poop.icon}</span>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="rounded-md bg-white/20 px-2 py-1" title="Back / Select / View (hold: leave)">⧉ = {ACTION_UI.species.icon}</span>
              <span className="rounded-md bg-white/20 px-2 py-1" title="Start / Menu / Options (hold: this menu)">☰ = {ACTION_UI.hat.icon}</span>
            </div>
            <span className="rounded-md bg-white/20 px-2 py-1 text-xs" title="Stuck? Hold all four shoulder buttons for 5 seconds to pop out somewhere safe" data-testid="rescue-legend">
              LB RB LT RT ⏱5 = <span className="emoji">🆘</span>
            </span>
          </div>
          <KeyboardLegend source="kb1" color="#ff4d5e" />
          <KeyboardLegend source="kb2" color="#3b82f6" />
        </div>
        <p className="mt-4 text-center text-sm text-white/75">
          Up to 4 players: every controller joins by pressing any button. Tap Select to change animal, tap Start to change hat. Hold Start to open this menu (D-pad to move, A to press, B to close); hold Select to leave. If a controller disconnects, its animal naps until it comes back. Magic food on the plaza table: beans (poop button = rocket), mushroom (giant), chili (noise button = fire). Sit on the big toilet and poop to get flushed. Land on a friend's back to ride piggyback. Lick a friend to drag them along, lick again to throw them; jump to wriggle free. Golden stars unlock new hats: walk into one on the hat rack to wear it. Every silly thing earns a sticker, and new animals join at 3, 7, 12 and 18 stickers. Now and then there's a surprise: catch the golden chicken, jump into the floating present, splash in the rain puddles. Keyboard can host two players; <kbd className="rounded bg-white/20 px-1">Esc</kbd> opens this menu.
        </p>
        </>
        )}
      </div>
    </div>
  );
}

/** Draw calls and triangles in the last frame, refreshed twice a second. */
function useDraws() {
  const [d, setD] = useState({ calls: perf.calls, triangles: perf.triangles });
  useEffect(() => {
    const id = window.setInterval(() => setD({ calls: perf.calls, triangles: perf.triangles }), 500);
    return () => window.clearInterval(id);
  }, []);
  return d;
}

/**
 * The play log (see playlog.ts): how many sessions it holds, a button to save it as a file to send
 * along, and one to clear it.
 */
function PlayLogRow() {
  const [count, setCount] = useState(() => loadSessions().length);
  const saveFile = () => {
    const blob = new Blob([playLogFile()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `silly-park-play-log-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setCount(loadSessions().length);
  };
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-white/60" data-testid="playlog">
      <span title="A small record of each play session on this computer (smoothness, stuck animals, controllers, what got played): nothing leaves this computer unless you save it and send it">
        📋 Play log: {count} {count === 1 ? 'session' : 'sessions'}
      </span>
      <button className="rounded-full bg-white/15 px-3 py-1 hover:bg-white/25" onClick={saveFile} data-testid="playlog-save">
        Save
      </button>
      <button
        className="rounded-full bg-white/15 px-3 py-1 hover:bg-white/25"
        onClick={() => {
          clearPlayLog();
          setCount(0);
        }}
        data-testid="playlog-clear"
      >
        Clear
      </button>
    </div>
  );
}

/** Frames per second of the real game loop, refreshed twice a second. */
function useFps() {
  const [fps, setFps] = useState(perf.fps);
  useEffect(() => {
    const id = window.setInterval(() => setFps(perf.fps), 500);
    return () => window.clearInterval(id);
  }, []);
  return fps;
}
