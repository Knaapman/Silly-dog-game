import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Scene } from './game3d/Scene';
import { getAudioSettings, playLevelStinger, setAudioMuted, setCategoryGain, setMasterVolume, subscribeAudioSettings } from './game3d/audio';
import { useGameStore, type UiActionType } from './game3d/store';
import { resolveLiveObjectiveGuide } from './game3d/guidance';
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

  const [isTouch, setIsTouch] = useState(false);
  const [uiNow, setUiNow] = useState(Date.now());
  const [activeFeedback, setActiveFeedback] = useState<typeof inputFeedback>(null);
  const [audioSettings, setAudioSettings] = useState(() => getAudioSettings());

  useEffect(() => {
    setIsTouch(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeAudioSettings((next) => setAudioSettings(next));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!inputFeedback) return;
    setActiveFeedback(inputFeedback);
    const timeout = window.setTimeout(() => {
      setActiveFeedback((current) => current?.time === inputFeedback.time ? null : current);
    }, 420);
    return () => window.clearTimeout(timeout);
  }, [inputFeedback]);

  useEffect(() => {
    if (!levelBeat) return;
    playLevelStinger(levelBeat.phase);
  }, [levelBeat?.phase, levelBeat?.startedAt]);

  useEffect(() => {
    if (!levelBeat && !currentObjective.bonus) return;
    const interval = window.setInterval(() => setUiNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [levelBeat, currentObjective.bonus]);

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

  return (
    <div className={`w-full h-screen overflow-hidden transition-colors duration-1000 ${isNight ? 'bg-[#0B1026]' : 'bg-[#87CEEB]'}`}>
      <Canvas shadows camera={{ position: [0, 20, 20], fov: 45 }}>
        <Scene />
      </Canvas>

      <div className="absolute top-5 left-5 right-5 flex justify-between items-start pointer-events-none gap-4">
        <div className="bg-white/80 backdrop-blur-md text-slate-800 p-4 rounded-3xl shadow-xl pointer-events-auto border-4 border-white max-w-sm">
          <h1 className="text-3xl font-black text-amber-600 mb-3 drop-shadow-sm">Happy Dog Park</h1>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={toggleNight}
              className="px-4 py-2 rounded-2xl font-bold text-lg transition-transform hover:scale-105 bg-indigo-500 text-white shadow-md active:scale-95"
            >
              {isNight ? 'Night' : 'Day'}
            </button>
            <button
              onClick={() => setTwoPlayer(!isTwoPlayer)}
              className={`px-4 py-2 rounded-2xl font-bold text-lg transition-transform hover:scale-105 shadow-md active:scale-95 ${isTwoPlayer ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-700'}`}
            >
              {isTwoPlayer ? '2 Dogs' : '1 Dog'}
            </button>
          </div>
          <div className="mt-4 rounded-2xl border-2 border-slate-200 bg-white/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Audio mix</p>
              <button
                onClick={() => setAudioMuted(!audioSettings.muted)}
                className={`rounded-xl px-3 py-1.5 text-sm font-black transition-transform hover:scale-105 active:scale-95 ${audioSettings.muted ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}
              >
                {audioSettings.muted ? 'Muted' : 'Sound on'}
              </button>
            </div>
            <label className="mt-3 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              Master volume
              <input
                className="mt-2 w-full accent-amber-500"
                type="range"
                min={0}
                max={100}
                value={Math.round(audioSettings.masterVolume * 100)}
                onChange={(event) => setMasterVolume(Number(event.target.value) / 100)}
              />
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {AUDIO_CATEGORIES.map((category) => (
                <label key={category} className="rounded-xl bg-slate-50 px-2 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  {category}
                  <input
                    className="mt-1.5 w-full accent-sky-500"
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

        <div className="bg-white/90 backdrop-blur-md p-4 rounded-3xl shadow-xl border-4 border-amber-300 flex flex-col items-center pointer-events-auto min-w-[17rem]">
          <h2 className="text-2xl font-black text-amber-500 mb-2">Level {currentLevel} Dog</h2>
          <div className="flex gap-1">
            {Array.from({ length: 10 }).map((_, index) => (
              <div
                key={index}
                className="text-4xl transition-all duration-300"
                style={{ transform: index < progress ? 'scale(1.2)' : 'scale(1)', opacity: index < progress ? 1 : 0.3 }}
              >
                {index < progress ? '\u2605' : '\u2606'}
              </div>
            ))}
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-700 mt-3">{levelModifier.label}</p>
          <p className="text-xs text-slate-600 mt-1 text-center">{levelModifier.tradeoff ?? levelModifier.description}</p>
        </div>
      </div>

      <div className="absolute top-36 left-5 pointer-events-none max-w-[30rem]">
        <div className="bg-white/88 backdrop-blur-md p-4 rounded-2xl border-2 border-emerald-300 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Live route objective</p>
              <p className="text-lg font-black text-slate-900 mt-1">{currentObjective.title}</p>
              <p className="text-sm text-slate-700 mt-1">{liveGuide.actionLabel}</p>
            </div>
            <div className="bg-emerald-100 text-emerald-800 rounded-2xl px-3 py-2 text-xs font-bold uppercase tracking-wide">
              Loop {currentObjective.loopIndex + 1}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs sm:text-sm">
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-3 py-2">
              <p className="font-bold uppercase tracking-wide text-emerald-700">Distance</p>
              <p className="mt-1 font-semibold text-slate-800">{liveGuide.immediateAction ? 'Ready now' : `${Math.round(liveGuide.distance)}m to ${liveGuide.targetLabel}`}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 border border-slate-200 px-3 py-2">
              <p className="font-bold uppercase tracking-wide text-slate-600">Do this</p>
              <p className="mt-1 font-semibold text-slate-800">{liveGuide.actionLabel}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-3 py-2">
              <p className="font-bold uppercase tracking-wide text-amber-700">Complete when</p>
              <p className="mt-1 font-semibold text-slate-800">{liveGuide.completionLabel}</p>
            </div>
          </div>

          <p className="text-xs text-slate-500 mt-3">{liveGuide.statusLabel}  •  Zone: {liveGuide.zoneLabel}</p>

          {currentObjective.bonus && (
            <div className={`mt-3 rounded-2xl px-3 py-2 border text-sm ${currentObjective.bonus.completed ? 'bg-amber-100 border-amber-300 text-amber-900' : bonusSecondsLeft > 0 ? 'bg-sky-100 border-sky-300 text-sky-900' : 'bg-slate-100 border-slate-300 text-slate-600'}`}>
              <span className="font-bold">{currentObjective.bonus.label}</span>
              <span className="ml-2">
                {currentObjective.bonus.progress}/{currentObjective.bonus.target}
                {currentObjective.bonus.completed ? '  +1 star' : bonusSecondsLeft > 0 ? `  ${bonusSecondsLeft}s left` : '  expired'}
              </span>
            </div>
          )}
        </div>
      </div>

      {activeFeedback && (
        <div className="absolute bottom-44 left-1/2 -translate-x-1/2 pointer-events-none z-40">
          <div className="rounded-full bg-white/92 border-2 border-slate-200 px-4 py-2 shadow-xl backdrop-blur-md animate-[ping_0.35s_ease-out_1]">
            <span className="text-xs font-black uppercase tracking-[0.28em] text-slate-500">{activeFeedback.source}</span>
            <span className="ml-3 text-sm font-black text-slate-900">{TOUCH_BUTTONS[activeFeedback.action].title}</span>
          </div>
        </div>
      )}

      {levelBeat && levelBeat.endsAt > uiNow && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50 bg-slate-950/25 backdrop-blur-[2px]">
          <div className="max-w-xl mx-4 bg-white/92 border-4 border-amber-300 rounded-[2rem] shadow-2xl px-6 py-5 text-center">
            <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-700">{levelBeat.phase === 'outro' ? 'Level break' : 'New loop variant'}</p>
            <h1 className="text-5xl font-black text-slate-900 mt-2">{levelBeat.title}</h1>
            <p className="text-base font-semibold text-slate-700 mt-2">{levelBeat.subtitle}</p>
            <div className="mt-4 rounded-[1.5rem] bg-emerald-50 border border-emerald-200 p-4 text-left">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Next objective</p>
              <p className="text-xl font-black text-slate-900 mt-1">{levelBeat.objectiveTitle}</p>
              <p className="text-sm text-slate-700 mt-1">{levelBeat.objectiveDescription}</p>
              <p className="text-xs text-slate-500 mt-3">{levelBeat.modifierLabel}: {levelBeat.modifierDescription}</p>
            </div>
          </div>
        </div>
      )}

      {isTouch ? (
        <div className="absolute bottom-8 left-8 right-8 flex justify-between items-end pointer-events-none gap-6">
          <div className="pointer-events-auto">
            <VirtualJoystick />
          </div>

          <div className="pointer-events-none flex w-[min(24rem,48vw)] flex-col gap-4">
            <p className="text-right text-xs font-black uppercase tracking-[0.22em] text-white/85 drop-shadow-[0_2px_6px_rgba(15,23,42,0.45)]">
              Touch actions adapt to nearby toys, snacks, and dig spots
            </p>
            {[touchButtons.primary, touchButtons.secondary].map((button, index) => {
              const isActive = activeFeedback?.source === 'touch' && activeFeedback.action === button.action;
              return (
                <button
                  key={`${button.action}-${index}`}
                  className={`pointer-events-auto rounded-[2rem] px-5 py-4 text-white border-4 border-white transition-all active:translate-y-2 active:shadow-none ${button.color} ${button.shadow} ${isActive ? 'scale-105 ring-4 ring-white/75' : ''}`}
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
      ) : (
        <div className="absolute bottom-8 right-8 bg-white/80 backdrop-blur-md p-4 rounded-3xl shadow-xl border-4 border-white pointer-events-auto text-slate-800">
          <h3 className="font-bold text-lg mb-2 border-b-2 border-slate-200 pb-1">Keyboard Controls</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">W A S D</kbd> Move</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">Shift</kbd> Run</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">Space</kbd> Jump</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">F</kbd> Bark</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">E</kbd> Eat/Drink</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">T</kbd> Throw/Grab</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">Q</kbd> Sit</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">C</kbd> Sleep</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">R</kbd> Roll</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">X</kbd> Dig</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">Z</kbd> Poop</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">V</kbd> Sniff</div>
          </div>
        </div>
      )}
    </div>
  );
}
