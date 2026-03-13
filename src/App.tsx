import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Scene } from './game3d/Scene';
import {
  getAudioSettings,
  playLevelStinger,
  setAudioMuted,
  setCategoryGain,
  setMasterVolume,
  subscribeAudioSettings
} from './game3d/audio';
import { readConnectedGamepads, type ConnectedGamepad } from './game3d/gamepad';
import { resolveLiveObjectiveGuide } from './game3d/guidance';
import { useGameStore, type UiActionType } from './game3d/store';
import { VirtualJoystick } from './game3d/VirtualJoystick';

type TouchButtonConfig = {
  action: UiActionType;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  shadow: string;
};

const TOUCH_BUTTONS: Record<UiActionType, Omit<TouchButtonConfig, 'subtitle'>> = {
  bark: { action: 'bark', title: 'Woof', icon: 'Woof', color: 'bg-blue-500', shadow: 'shadow-[0_8px_0_rgb(29,78,216)]' },
  dig: { action: 'dig', title: 'Dig', icon: 'Paw', color: 'bg-green-500', shadow: 'shadow-[0_8px_0_rgb(21,128,61)]' },
  lieDown: { action: 'lieDown', title: 'Rest', icon: 'Nap', color: 'bg-fuchsia-500', shadow: 'shadow-[0_8px_0_rgb(162,28,175)]' },
  poop: { action: 'poop', title: 'Poop', icon: 'Oops', color: 'bg-amber-700', shadow: 'shadow-[0_8px_0_rgb(146,64,14)]' },
  interact: { action: 'interact', title: 'Grab', icon: 'Toss', color: 'bg-rose-500', shadow: 'shadow-[0_8px_0_rgb(190,24,93)]' },
  eat: { action: 'eat', title: 'Eat', icon: 'Chomp', color: 'bg-orange-500', shadow: 'shadow-[0_8px_0_rgb(194,65,12)]' },
  jump: { action: 'jump', title: 'Jump', icon: 'Hop', color: 'bg-cyan-500', shadow: 'shadow-[0_8px_0_rgb(8,145,178)]' },
  sit: { action: 'sit', title: 'Sit', icon: 'Sit', color: 'bg-indigo-500', shadow: 'shadow-[0_8px_0_rgb(67,56,202)]' },
  roll: { action: 'roll', title: 'Roll', icon: 'Roll', color: 'bg-violet-500', shadow: 'shadow-[0_8px_0_rgb(109,40,217)]' },
  sniff: { action: 'sniff', title: 'Sniff', icon: 'Sniff', color: 'bg-emerald-500', shadow: 'shadow-[0_8px_0_rgb(5,150,105)]' }
};

const AUDIO_CATEGORIES = ['ui', 'action', 'world', 'reward'] as const;

function buildTouchButton(action: UiActionType, subtitle: string, title?: string): TouchButtonConfig {
  const base = TOUCH_BUTTONS[action];
  return {
    ...base,
    title: title ?? base.title,
    subtitle
  };
}

function getControllerSubtitle(gamepad: ConnectedGamepad | undefined) {
  if (!gamepad) {
    return 'No controller detected. Keyboard stays active.';
  }

  if (!gamepad.recognized) {
    return 'Controller connected, but mapping looks limited.';
  }

  if (gamepad.xinputLike && gamepad.mapping === 'standard') {
    return 'XInput / Standard mapping detected.';
  }

  if (gamepad.xinputLike) {
    return 'XInput-style controller detected.';
  }

  if (gamepad.mapping === 'standard') {
    return 'Standard mapping detected.';
  }

  return 'Controller connected.';
}

function PlayerControllerCard({ label, gamepad }: { label: string; gamepad?: ConnectedGamepad }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-slate-950/40 px-4 py-3">
      <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">{label}</p>
      <p className="mt-1 text-base font-bold text-white">{gamepad ? 'Controller connected' : 'No controller detected'}</p>
      <p className="mt-1 text-sm text-slate-300">{getControllerSubtitle(gamepad)}</p>
      <p className="mt-2 text-xs text-slate-400">{gamepad ? gamepad.label : 'Use keyboard controls as fallback.'}</p>
    </div>
  );
}

function StartOverlay({
  hasEverStarted,
  onStart,
  onOpenSettings,
  playerOnePad,
  playerTwoPad,
  showPlayerTwo
}: {
  hasEverStarted: boolean;
  onStart: () => void;
  onOpenSettings: () => void;
  playerOnePad?: ConnectedGamepad;
  playerTwoPad?: ConnectedGamepad;
  showPlayerTwo: boolean;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/62 px-5 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-[2rem] border border-white/15 bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(30,41,59,0.9))] p-6 text-white shadow-2xl md:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-300">Simple start screen</p>
            <h1 className="mt-3 text-4xl font-black text-white md:text-6xl">Happy Dog Park</h1>
            <p className="mt-3 max-w-xl text-base text-slate-200 md:text-lg">
              Jump in fast, keep the HUD light, and let the park breathe. Start when you are ready and the compact play HUD will take over.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={onStart}
                className="rounded-2xl bg-amber-400 px-6 py-3 text-lg font-black text-slate-950 shadow-[0_10px_30px_rgba(251,191,36,0.35)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                {hasEverStarted ? 'Resume' : 'Start'}
              </button>
              <button
                onClick={onOpenSettings}
                className="rounded-2xl border border-white/20 bg-white/8 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-white/14"
              >
                Settings
              </button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">Keyboard</p>
                <p className="mt-2 text-sm text-slate-100">`WASD` move, `Shift` run, `Space` jump, `F` bark, `E` eat, `T` grab.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">Controller</p>
                <p className="mt-2 text-sm text-slate-100">First connected pad becomes Dog 1. Second connected pad becomes Dog 2.</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <PlayerControllerCard label="Dog 1" gamepad={playerOnePad} />
            {showPlayerTwo && <PlayerControllerCard label="Dog 2" gamepad={playerTwoPad} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({
  isOpen,
  onClose,
  audioSettings,
  isTwoPlayer,
  setTwoPlayer,
  isNight,
  toggleNight
}: {
  isOpen: boolean;
  onClose: () => void;
  audioSettings: ReturnType<typeof getAudioSettings>;
  isTwoPlayer: boolean;
  setTwoPlayer: (value: boolean) => void;
  isNight: boolean;
  toggleNight: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="absolute right-4 top-4 z-40 w-[min(25rem,calc(100vw-2rem))] rounded-[1.75rem] border border-white/15 bg-slate-950/88 p-4 text-white shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-400">Settings</p>
          <p className="mt-1 text-lg font-black text-white">Audio and match setup</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-xl border border-white/15 bg-white/8 px-3 py-2 text-sm font-bold text-white hover:bg-white/14"
        >
          Close
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={toggleNight}
          className={`rounded-2xl px-4 py-3 text-sm font-black transition-transform hover:scale-[1.01] active:scale-[0.99] ${
            isNight ? 'bg-indigo-500 text-white' : 'bg-amber-300 text-slate-950'
          }`}
        >
          {isNight ? 'Night mode' : 'Day mode'}
        </button>
        <button
          onClick={() => setTwoPlayer(!isTwoPlayer)}
          className={`rounded-2xl px-4 py-3 text-sm font-black transition-transform hover:scale-[1.01] active:scale-[0.99] ${
            isTwoPlayer ? 'bg-sky-500 text-white' : 'bg-white/10 text-white'
          }`}
        >
          {isTwoPlayer ? '2 Dogs' : '1 Dog'}
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Audio</p>
          <button
            onClick={() => setAudioMuted(!audioSettings.muted)}
            className={`rounded-xl px-3 py-2 text-sm font-black ${
              audioSettings.muted ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-slate-950'
            }`}
          >
            {audioSettings.muted ? 'Muted' : 'Sound on'}
          </button>
        </div>

        <label className="mt-4 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
          Master volume
          <input
            className="mt-2 w-full accent-amber-400"
            type="range"
            min={0}
            max={100}
            value={Math.round(audioSettings.masterVolume * 100)}
            onChange={(event) => setMasterVolume(Number(event.target.value) / 100)}
          />
        </label>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {AUDIO_CATEGORIES.map((category) => (
            <label key={category} className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-300">
              {category}
              <input
                className="mt-2 w-full accent-sky-400"
                type="range"
                min={0}
                max={140}
                value={Math.round(audioSettings.categoryGains[category] * 100)}
                onChange={(event) => setCategoryGain(category, Number(event.target.value) / 100)}
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function GameHud({
  currentLevel,
  progress,
  levelModifierLabel,
  levelModifierTradeoff,
  objectiveTitle,
  objectiveLoopIndex,
  actionLabel,
  statusLabel,
  zoneLabel,
  bonusLabel,
  bonusProgress,
  bonusTarget,
  bonusState,
  playerOnePad,
  playerTwoPad,
  showPlayerTwo,
  onOpenSettings,
  onOpenMenu
}: {
  currentLevel: number;
  progress: number;
  levelModifierLabel: string;
  levelModifierTradeoff: string;
  objectiveTitle: string;
  objectiveLoopIndex: number;
  actionLabel: string;
  statusLabel: string;
  zoneLabel: string;
  bonusLabel: string | null;
  bonusProgress: number;
  bonusTarget: number;
  bonusState: string | null;
  playerOnePad?: ConnectedGamepad;
  playerTwoPad?: ConnectedGamepad;
  showPlayerTwo: boolean;
  onOpenSettings: () => void;
  onOpenMenu: () => void;
}) {
  return (
    <>
      <div className="absolute left-4 top-4 z-20 max-w-[24rem] rounded-[1.75rem] border border-white/15 bg-slate-950/62 p-4 text-white shadow-xl backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-amber-300">Level {currentLevel}</p>
            <h2 className="mt-1 text-2xl font-black">Happy Dog Park</h2>
          </div>
          <div className="rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-slate-200">
            Loop {objectiveLoopIndex + 1}
          </div>
        </div>

        <div className="mt-4 flex gap-1.5">
          {Array.from({ length: 10 }).map((_, index) => (
            <div
              key={index}
              className={`h-2.5 flex-1 rounded-full ${index < progress ? 'bg-amber-300' : 'bg-white/10'}`}
            />
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/6 p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-300">Objective</p>
          <p className="mt-1 text-lg font-black text-white">{objectiveTitle}</p>
          <p className="mt-1 text-sm text-slate-200">{actionLabel}</p>
          <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-400">{statusLabel} · {zoneLabel}</p>
        </div>

        <div className="mt-3 grid grid-cols-[1fr,auto] gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/6 p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-sky-300">Modifier</p>
            <p className="mt-1 text-sm font-bold text-white">{levelModifierLabel}</p>
            <p className="mt-1 text-xs text-slate-300">{levelModifierTradeoff}</p>
          </div>
          {bonusLabel && bonusState && (
            <div className="rounded-2xl border border-white/10 bg-white/6 px-3 py-3 text-right">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-amber-300">Bonus</p>
              <p className="mt-1 text-sm font-bold text-white">{bonusLabel}</p>
              <p className="mt-1 text-xs text-slate-300">{bonusProgress}/{bonusTarget} · {bonusState}</p>
            </div>
          )}
        </div>
      </div>

      <div className="absolute right-4 top-4 z-20 flex items-start gap-2">
        <div className="rounded-[1.5rem] border border-white/15 bg-slate-950/62 px-4 py-3 text-white shadow-xl backdrop-blur-xl">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">Controllers</p>
          <p className="mt-1 text-sm font-bold text-white">
            P1: {playerOnePad ? 'Connected' : 'Keyboard'}
            {showPlayerTwo ? `  |  P2: ${playerTwoPad ? 'Connected' : 'Keyboard'}` : ''}
          </p>
          <p className="mt-1 text-xs text-slate-300">{getControllerSubtitle(playerOnePad)}</p>
        </div>
        <button
          onClick={onOpenSettings}
          className="rounded-2xl border border-white/15 bg-slate-950/62 px-4 py-3 text-sm font-black text-white shadow-xl backdrop-blur-xl hover:bg-slate-950/72"
        >
          Settings
        </button>
        <button
          onClick={onOpenMenu}
          className="rounded-2xl border border-white/15 bg-slate-950/62 px-4 py-3 text-sm font-black text-white shadow-xl backdrop-blur-xl hover:bg-slate-950/72"
        >
          Menu
        </button>
      </div>
    </>
  );
}

function KeyboardHint() {
  return (
    <div className="absolute bottom-6 right-6 z-20 rounded-[1.5rem] border border-white/15 bg-slate-950/58 px-4 py-3 text-white shadow-lg backdrop-blur-xl">
      <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">Keyboard</p>
      <p className="mt-1 text-sm font-semibold text-white">`WASD` move, `Shift` run, `Space` jump</p>
      <p className="mt-1 text-xs text-slate-300">`F` bark, `E` eat, `T` grab, `X` dig, `V` sniff</p>
    </div>
  );
}

export default function App() {
  const stars = useGameStore((state) => state.stars);
  const triggerUiAction = useGameStore((state) => state.triggerUiAction);
  const isTwoPlayer = useGameStore((state) => state.isTwoPlayer);
  const setTwoPlayer = useGameStore((state) => state.setTwoPlayer);
  const isNight = useGameStore((state) => state.isNight);
  const toggleNight = useGameStore((state) => state.toggleNight);
  const currentLevel = useGameStore((state) => state.currentLevel);
  const currentObjective = useGameStore((state) => state.currentObjective);
  const levelModifier = useGameStore((state) => state.levelModifier);
  const levelBeat = useGameStore((state) => state.levelBeat);
  const inputFeedback = useGameStore((state) => state.inputFeedback);
  const dogPositions = useGameStore((state) => state.dogPositions);
  const heldBalls = useGameStore((state) => state.heldBalls);
  const heldBones = useGameStore((state) => state.heldBones);
  const heldFrisbees = useGameStore((state) => state.heldFrisbees);
  const ballPositions = useGameStore((state) => state.ballPositions);
  const bonePositions = useGameStore((state) => state.bonePositions);
  const frisbeePositions = useGameStore((state) => state.frisbeePositions);
  const foods = useGameStore((state) => state.foods);
  const digSpots = useGameStore((state) => state.digSpots);
  const trashCans = useGameStore((state) => state.trashCans);
  const connectedGamepads = useGameStore((state) => state.connectedGamepads);
  const setConnectedGamepads = useGameStore((state) => state.setConnectedGamepads);
  const hasStarted = useGameStore((state) => state.hasStarted);
  const setHasStarted = useGameStore((state) => state.setHasStarted);

  const [isTouch, setIsTouch] = useState(false);
  const [uiNow, setUiNow] = useState(Date.now());
  const [activeFeedback, setActiveFeedback] = useState<typeof inputFeedback>(null);
  const [audioSettings, setAudioSettings] = useState(() => getAudioSettings());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [hasEverStarted, setHasEverStarted] = useState(false);

  useEffect(() => {
    setIsTouch(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  useEffect(() => {
    const sync = () => {
      setConnectedGamepads(readConnectedGamepads());
    };

    sync();
    const interval = window.setInterval(sync, 350);
    window.addEventListener('gamepadconnected', sync);
    window.addEventListener('gamepaddisconnected', sync);
    window.addEventListener('focus', sync);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('gamepadconnected', sync);
      window.removeEventListener('gamepaddisconnected', sync);
      window.removeEventListener('focus', sync);
    };
  }, [setConnectedGamepads]);

  useEffect(() => {
    const unsubscribe = subscribeAudioSettings((next) => setAudioSettings(next));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!inputFeedback || !hasStarted) return;
    setActiveFeedback(inputFeedback);
    const timeout = window.setTimeout(() => {
      setActiveFeedback((current) => current?.time === inputFeedback.time ? null : current);
    }, 420);
    return () => window.clearTimeout(timeout);
  }, [hasStarted, inputFeedback]);

  useEffect(() => {
    if (!levelBeat || !hasStarted) return;
    playLevelStinger(levelBeat.phase);
  }, [hasStarted, levelBeat?.phase, levelBeat?.startedAt]);

  useEffect(() => {
    if ((!levelBeat && !currentObjective.bonus) || !hasStarted) return;
    const interval = window.setInterval(() => setUiNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [currentObjective.bonus, hasStarted, levelBeat]);

  const progress = stars % 10;
  const bonusSecondsLeft = currentObjective.bonus && !currentObjective.bonus.completed
    ? Math.max(0, Math.ceil((currentObjective.bonus.expiresAt - uiNow) / 1000))
    : 0;

  const liveGuide = useMemo(() => resolveLiveObjectiveGuide({
    objective: currentObjective,
    dogPosition: dogPositions[0] ?? new THREE.Vector3(),
    foods,
    digSpots,
    trashCans,
    bonePositions,
    heldBoneId: heldBones[0],
    idleOrStuck: false
  }), [bonePositions, currentObjective, digSpots, dogPositions, foods, heldBones, trashCans]);

  const touchButtons = useMemo(() => {
    const dogPos = dogPositions[0] ?? new THREE.Vector3();
    const heldBall = heldBalls[0];
    const heldBone = heldBones[0];
    const heldFrisbee = heldFrisbees[0];
    const isHoldingThrowable = heldBall != null || heldBone != null || heldFrisbee != null;

    const nearbyPickup = (() => {
      let best: { type: 'ball' | 'bone' | 'frisbee'; distance: number } | null = null;
      const consider = (type: 'ball' | 'bone' | 'frisbee', entries: [string, THREE.Vector3][], heldIds: Array<number | null>) => {
        entries.forEach(([idStr, pos]) => {
          const id = Number(idStr);
          if (heldIds.includes(id)) return;
          const distance = dogPos.distanceTo(pos);
          if (distance > 4) return;
          if (!best || distance < best.distance) {
            best = { type, distance };
          }
        });
      };

      consider('ball', Object.entries(ballPositions), Object.values(heldBalls));
      consider('bone', Object.entries(bonePositions), Object.values(heldBones));
      consider('frisbee', Object.entries(frisbeePositions), Object.values(heldFrisbees));
      return best;
    })();

    const nearFood = foods.some((food) => dogPos.distanceTo(new THREE.Vector3(food.pos[0], food.pos[1], food.pos[2])) < 2);
    const nearLooseBone = Object.entries(bonePositions).some(([idStr, pos]) => {
      const id = Number(idStr);
      return !Object.values(heldBones).includes(id) && dogPos.distanceTo(pos) < 2;
    });
    const pondDistance = dogPos.distanceTo(new THREE.Vector3(0, 0, 0));
    const canDrink = pondDistance < 8.5 && pondDistance > 6;
    const canEat = heldBone != null || nearFood || nearLooseBone || canDrink;
    const nearDigSpot = digSpots.some((spot) => spot.active && dogPos.distanceTo(new THREE.Vector3(spot.pos[0], spot.pos[1], spot.pos[2])) < 3.5);

    let primary = buildTouchButton('jump', 'Always ready');
    let secondary = buildTouchButton('bark', 'Quick signal');

    if (isHoldingThrowable) {
      primary = buildTouchButton('interact', heldBone != null ? 'Throw or drop the bone' : 'Throw what you are carrying', heldBone != null ? 'Toss' : 'Throw');
      secondary = heldBone != null
        ? buildTouchButton('eat', 'Chew the bone now', 'Chew')
        : buildTouchButton('jump', 'Keep moving');
    } else if (canEat) {
      primary = canDrink
        ? buildTouchButton('eat', 'Drink at the pond', 'Drink')
        : buildTouchButton('eat', heldBone != null ? 'Chew what you are holding' : 'Eat what is nearby', heldBone != null ? 'Chew' : 'Chomp');
      secondary = nearbyPickup
        ? buildTouchButton('interact', `Grab nearby ${nearbyPickup.type}`)
        : buildTouchButton('jump', 'Stay playful');
    } else if (nearbyPickup) {
      primary = buildTouchButton('interact', `Grab nearby ${nearbyPickup.type}`);
      secondary = buildTouchButton('jump', 'Hop while moving');
    } else if (nearDigSpot) {
      primary = buildTouchButton('dig', 'Treasure might be here');
      secondary = buildTouchButton('sniff', 'Check the scent trail');
    }

    return { primary, secondary };
  }, [
    ballPositions,
    bonePositions,
    digSpots,
    dogPositions,
    foods,
    frisbeePositions,
    heldBalls,
    heldBones,
    heldFrisbees
  ]);

  const playerOnePad = connectedGamepads.find((gamepad) => gamepad.playerIndex === 0);
  const playerTwoPad = connectedGamepads.find((gamepad) => gamepad.playerIndex === 1);
  const bonusState = currentObjective.bonus
    ? currentObjective.bonus.completed
      ? '+1 star'
      : bonusSecondsLeft > 0
        ? `${bonusSecondsLeft}s left`
        : 'expired'
    : null;

  const handleStart = () => {
    setHasStarted(true);
    setHasEverStarted(true);
  };

  const handleOpenMenu = () => {
    setHasStarted(false);
  };

  return (
    <div className={`relative h-screen w-full overflow-hidden ${isNight ? 'bg-[#07101f]' : 'bg-[#8ec5ff]'}`}>
      <Canvas shadows camera={{ position: [0, 20, 20], fov: 45 }}>
        <Scene />
      </Canvas>

      {hasStarted && (
        <GameHud
          currentLevel={currentLevel}
          progress={progress}
          levelModifierLabel={levelModifier.label}
          levelModifierTradeoff={levelModifier.tradeoff ?? levelModifier.description}
          objectiveTitle={currentObjective.title}
          objectiveLoopIndex={currentObjective.loopIndex}
          actionLabel={liveGuide.actionLabel}
          statusLabel={liveGuide.statusLabel}
          zoneLabel={liveGuide.zoneLabel}
          bonusLabel={currentObjective.bonus?.label ?? null}
          bonusProgress={currentObjective.bonus?.progress ?? 0}
          bonusTarget={currentObjective.bonus?.target ?? 0}
          bonusState={bonusState}
          playerOnePad={playerOnePad}
          playerTwoPad={playerTwoPad}
          showPlayerTwo={isTwoPlayer}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenMenu={handleOpenMenu}
        />
      )}

      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        audioSettings={audioSettings}
        isTwoPlayer={isTwoPlayer}
        setTwoPlayer={setTwoPlayer}
        isNight={isNight}
        toggleNight={toggleNight}
      />

      {!hasStarted && (
        <StartOverlay
          hasEverStarted={hasEverStarted}
          onStart={handleStart}
          onOpenSettings={() => setIsSettingsOpen(true)}
          playerOnePad={playerOnePad}
          playerTwoPad={playerTwoPad}
          showPlayerTwo={isTwoPlayer}
        />
      )}

      {hasStarted && activeFeedback && (
        <div className="absolute bottom-40 left-1/2 z-40 -translate-x-1/2 pointer-events-none">
          <div className="rounded-full border border-white/35 bg-white/90 px-4 py-2 shadow-xl backdrop-blur-md animate-[ping_0.35s_ease-out_1]">
            <span className="text-xs font-black uppercase tracking-[0.28em] text-slate-500">{activeFeedback.source}</span>
            <span className="ml-3 text-sm font-black text-slate-900">{TOUCH_BUTTONS[activeFeedback.action].title}</span>
          </div>
        </div>
      )}

      {hasStarted && levelBeat && levelBeat.endsAt > uiNow && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 backdrop-blur-[2px] pointer-events-none">
          <div className="max-w-xl rounded-[2rem] border-4 border-amber-300 bg-white/92 px-6 py-5 text-center shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-700">
              {levelBeat.phase === 'outro' ? 'Level break' : 'New loop variant'}
            </p>
            <h1 className="mt-2 text-5xl font-black text-slate-900">{levelBeat.title}</h1>
            <p className="mt-2 text-base font-semibold text-slate-700">{levelBeat.subtitle}</p>
            <div className="mt-4 rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-4 text-left">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Next objective</p>
              <p className="mt-1 text-xl font-black text-slate-900">{levelBeat.objectiveTitle}</p>
              <p className="mt-1 text-sm text-slate-700">{levelBeat.objectiveDescription}</p>
              <p className="mt-3 text-xs text-slate-500">{levelBeat.modifierLabel}: {levelBeat.modifierDescription}</p>
            </div>
          </div>
        </div>
      )}

      {hasStarted && isTouch ? (
        <div className="absolute bottom-6 left-6 right-6 z-20 flex items-end justify-between gap-6 pointer-events-none">
          <div className="pointer-events-auto">
            <VirtualJoystick />
          </div>

          <div className="pointer-events-none flex w-[min(22rem,48vw)] flex-col gap-3">
            <p className="text-right text-[11px] font-black uppercase tracking-[0.22em] text-white/80 drop-shadow-[0_2px_6px_rgba(15,23,42,0.45)]">
              Touch actions adapt to nearby toys, snacks, and dig spots
            </p>
            {[touchButtons.primary, touchButtons.secondary].map((button, index) => {
              const isActive = activeFeedback?.source === 'touch' && activeFeedback.action === button.action;
              return (
                <button
                  key={`${button.action}-${index}`}
                  className={`pointer-events-auto rounded-[1.75rem] border-4 border-white px-5 py-4 text-white transition-all active:translate-y-2 active:shadow-none ${button.color} ${button.shadow} ${isActive ? 'scale-105 ring-4 ring-white/75' : ''}`}
                  onClick={() => triggerUiAction(button.action)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-left">
                      <p className="text-xs font-black uppercase tracking-[0.24em] text-white/70">{index === 0 ? 'Primary' : 'Secondary'}</p>
                      <p className="mt-1 text-2xl font-black">{button.title}</p>
                      <p className="mt-1 text-sm font-semibold text-white/85">{button.subtitle}</p>
                    </div>
                    <div className="min-w-20 text-center">
                      <p className="text-3xl font-black">{button.icon}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : hasStarted ? (
        <KeyboardHint />
      ) : null}
    </div>
  );
}
