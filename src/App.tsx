import { Canvas } from '@react-three/fiber';
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { getAudioSettings, playLevelStinger, setAudioMuted, setCategoryGain, setMasterVolume, subscribeAudioSettings } from './game3d/audio';
import { useGameStore, type UiActionType } from './game3d/store';
import { resolveLiveObjectiveGuide } from './game3d/guidance';
import { VirtualJoystick } from './game3d/VirtualJoystick';

const Scene = lazy(async () => import('./game3d/Scene').then((module) => ({ default: module.Scene })));

type TouchButtonConfig = {
  action: UiActionType;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  shadow: string;
};

const TOUCH_BUTTONS: Record<UiActionType, Omit<TouchButtonConfig, 'subtitle'>> = {
  bark: { action: 'bark', title: 'Blaf', icon: 'Bla', color: 'bg-blue-500', shadow: 'shadow-[0_8px_0_rgb(29,78,216)]' },
  dig: { action: 'dig', title: 'Graaf', icon: 'Poot', color: 'bg-green-500', shadow: 'shadow-[0_8px_0_rgb(21,128,61)]' },
  lieDown: { action: 'lieDown', title: 'Lig', icon: 'Rust', color: 'bg-fuchsia-500', shadow: 'shadow-[0_8px_0_rgb(162,28,175)]' },
  poop: { action: 'poop', title: 'Poep', icon: 'Oeps', color: 'bg-amber-700', shadow: 'shadow-[0_8px_0_rgb(146,64,14)]' },
  interact: { action: 'interact', title: 'Pak', icon: 'Gooi', color: 'bg-rose-500', shadow: 'shadow-[0_8px_0_rgb(190,24,93)]' },
  eat: { action: 'eat', title: 'Eet', icon: 'Hap', color: 'bg-orange-500', shadow: 'shadow-[0_8px_0_rgb(194,65,12)]' },
  jump: { action: 'jump', title: 'Spring', icon: 'Hop', color: 'bg-cyan-500', shadow: 'shadow-[0_8px_0_rgb(8,145,178)]' },
  sit: { action: 'sit', title: 'Zit', icon: 'Zit', color: 'bg-indigo-500', shadow: 'shadow-[0_8px_0_rgb(67,56,202)]' },
  roll: { action: 'roll', title: 'Rol', icon: 'Rol', color: 'bg-violet-500', shadow: 'shadow-[0_8px_0_rgb(109,40,217)]' },
  sniff: { action: 'sniff', title: 'Snuf', icon: 'Snuf', color: 'bg-emerald-500', shadow: 'shadow-[0_8px_0_rgb(5,150,105)]' }
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

    let primary = buildTouchButton('jump', 'Altijd paraat');
    let secondary = buildTouchButton('bark', 'Snelle reactie');

    if (isHoldingThrowable) {
      primary = buildTouchButton('interact', heldBone != null ? 'Gooi of laat het bot vallen' : 'Gooi wat je draagt', heldBone != null ? 'Gooi' : 'Werp');
      secondary = heldBone != null
        ? buildTouchButton('eat', 'Kauw nu op het bot', 'Kauw')
        : buildTouchButton('jump', 'Blijf bewegen');
    } else if (canEat) {
      primary = canDrink
        ? buildTouchButton('eat', 'Drink bij de vijver', 'Drink')
        : buildTouchButton('eat', heldBone != null ? 'Kauw op wat je vasthoudt' : 'Eet wat dichtbij ligt', heldBone != null ? 'Kauw' : 'Hap');
      secondary = nearbyPickup
        ? buildTouchButton('interact', `Pak een ${nearbyPickup.type} in de buurt`)
        : buildTouchButton('jump', 'Blijf speels');
    } else if (nearbyPickup) {
      primary = buildTouchButton('interact', `Pak een ${nearbyPickup.type} in de buurt`);
      secondary = buildTouchButton('jump', 'Spring al bewegend');
    } else if (nearDigSpot) {
      primary = buildTouchButton('dig', 'Hier kan een schat liggen');
      secondary = buildTouchButton('sniff', 'Controleer het geurspoor');
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
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>

      <div className="absolute top-5 left-5 right-5 flex justify-between items-start pointer-events-none gap-4">
        <div className="bg-white/80 backdrop-blur-md text-slate-800 p-4 rounded-3xl shadow-xl pointer-events-auto border-4 border-white max-w-sm">
          <h1 className="text-3xl font-black text-amber-600 mb-3 drop-shadow-sm">Blije Hondenpark</h1>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={toggleNight}
              className="px-4 py-2 rounded-2xl font-bold text-lg transition-transform hover:scale-105 bg-indigo-500 text-white shadow-md active:scale-95"
            >
              {isNight ? 'Nacht' : 'Dag'}
            </button>
            <button
              onClick={() => setTwoPlayer(!isTwoPlayer)}
              className={`px-4 py-2 rounded-2xl font-bold text-lg transition-transform hover:scale-105 shadow-md active:scale-95 ${isTwoPlayer ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-700'}`}
            >
              {isTwoPlayer ? '2 Honden' : '1 Hond'}
            </button>
          </div>
          <div className="mt-4 rounded-2xl border-2 border-slate-200 bg-white/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">Audiomix</p>
              <button
                onClick={() => setAudioMuted(!audioSettings.muted)}
                className={`rounded-xl px-3 py-1.5 text-sm font-black transition-transform hover:scale-105 active:scale-95 ${audioSettings.muted ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'}`}
              >
                {audioSettings.muted ? 'Gedempt' : 'Geluid aan'}
              </button>
            </div>
            <label className="mt-3 block text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              Hoofdvolume
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
          <h2 className="text-2xl font-black text-amber-500 mb-2">Level {currentLevel} Hond</h2>
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
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Actieve routeopdracht</p>
              <p className="text-lg font-black text-slate-900 mt-1">{currentObjective.title}</p>
              <p className="text-sm text-slate-700 mt-1">{liveGuide.actionLabel}</p>
            </div>
            <div className="bg-emerald-100 text-emerald-800 rounded-2xl px-3 py-2 text-xs font-bold uppercase tracking-wide">
              Ronde {currentObjective.loopIndex + 1}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs sm:text-sm">
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-3 py-2">
              <p className="font-bold uppercase tracking-wide text-emerald-700">Afstand</p>
              <p className="mt-1 font-semibold text-slate-800">{liveGuide.immediateAction ? 'Nu klaar' : `${Math.round(liveGuide.distance)} m tot ${liveGuide.targetLabel}`}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 border border-slate-200 px-3 py-2">
              <p className="font-bold uppercase tracking-wide text-slate-600">Doe dit</p>
              <p className="mt-1 font-semibold text-slate-800">{liveGuide.actionLabel}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-3 py-2">
              <p className="font-bold uppercase tracking-wide text-amber-700">Klaar wanneer</p>
              <p className="mt-1 font-semibold text-slate-800">{liveGuide.completionLabel}</p>
            </div>
          </div>

          <p className="text-xs text-slate-500 mt-3">{liveGuide.statusLabel}  •  Zone: {liveGuide.zoneLabel}</p>

          {currentObjective.bonus && (
            <div className={`mt-3 rounded-2xl px-3 py-2 border text-sm ${currentObjective.bonus.completed ? 'bg-amber-100 border-amber-300 text-amber-900' : bonusSecondsLeft > 0 ? 'bg-sky-100 border-sky-300 text-sky-900' : 'bg-slate-100 border-slate-300 text-slate-600'}`}>
              <span className="font-bold">{currentObjective.bonus.label}</span>
              <span className="ml-2">
                {currentObjective.bonus.progress}/{currentObjective.bonus.target}
                {currentObjective.bonus.completed ? '  +1 ster' : bonusSecondsLeft > 0 ? `  nog ${bonusSecondsLeft}s` : '  verlopen'}
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
            <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-700">{levelBeat.phase === 'outro' ? 'Levelpauze' : 'Nieuwe routevariant'}</p>
            <h1 className="text-5xl font-black text-slate-900 mt-2">{levelBeat.title}</h1>
            <p className="text-base font-semibold text-slate-700 mt-2">{levelBeat.subtitle}</p>
            <div className="mt-4 rounded-[1.5rem] bg-emerald-50 border border-emerald-200 p-4 text-left">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Volgende opdracht</p>
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
              Touch-acties passen zich aan speelgoed, snacks en graafplekken in de buurt aan
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
                      <p className="text-xs font-black uppercase tracking-[0.24em] text-white/70">{index === 0 ? 'Primair' : 'Secundair'}</p>
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
          <h3 className="font-bold text-lg mb-2 border-b-2 border-slate-200 pb-1">Controller Eerst</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">Left Stick</kbd> Bewegen</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">RT</kbd> Rennen</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">A</kbd> Springen</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">B</kbd> Blaffen</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">X</kbd> Pakken / Gooien</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">Y</kbd> Eten / Drinken</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">LB</kbd> Snuffelen</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">RB</kbd> Graven</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">D-Pad Up</kbd> Zitten</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">D-Pad Right</kbd> Rollen</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">LT</kbd> Liggen</div>
            <div><kbd className="bg-slate-200 px-1.5 py-0.5 rounded border border-slate-300 shadow-sm font-mono text-xs">D-Pad Down</kbd> Poepen</div>
          </div>
          <p className="mt-3 text-xs text-slate-600">Toetsenbord blijft beschikbaar als fallback voor debuggen en een tweede speler.</p>
        </div>
      )}
    </div>
  );
}
