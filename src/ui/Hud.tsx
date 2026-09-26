import { useEffect, useState } from 'react';
import { getAudioState, playTap, setMuted, subscribeAudio, unlockAudio } from '../game/audio';
import { MAX_PLAYERS, PLAYER_COLORS, SPECIES_EMOJI, type HatId } from '../game/config';
import { getConnectedPads } from '../game/input';
import { isPartyTime, useGame } from '../game/store';
import { GamepadIcon, GearIcon, SpeakerIcon, StarIcon } from './Icons';
import { gameNow } from '../game/clock';

const HAT_EMOJI: Partial<Record<HatId, string>> = {
  party: '🥳',
  crown: '👑',
  tophat: '🎩',
  propeller: '🚁',
  flower: '🌸',
  cowboy: '🤠',
  duck: '🐤'
};

export function useAudioState() {
  const [state, setState] = useState(getAudioState);
  useEffect(() => subscribeAudio(() => setState(getAudioState())), []);
  return state;
}

function useNow(intervalMs: number) {
  // game time, so the party and star animations pause with the game
  const [now, setNow] = useState(gameNow());
  useEffect(() => {
    const id = window.setInterval(() => setNow(gameNow()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function PlayerBadges() {
  const players = useGame((s) => s.players);
  const cycleSpecies = useGame((s) => s.cycleSpecies);
  const [padCount, setPadCount] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setPadCount(getConnectedPads().length), 1000);
    return () => window.clearInterval(id);
  }, []);
  const joinedPads = players.filter((p) => p.source.startsWith('pad')).length;
  const waitingPads = Math.max(0, padCount - joinedPads);

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {Array.from({ length: MAX_PLAYERS }, (_, slot) => {
        const p = players.find((x) => x.slot === slot);
        if (!p) {
          const inviting = slot === players.length && waitingPads > 0;
          return (
            <div
              key={slot}
              className={`flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-dashed sm:h-12 sm:w-12 text-white/80 ${inviting ? 'animate-bounce' : 'opacity-40'}`}
              style={{ borderColor: PLAYER_COLORS[slot] }}
              title="Press any button on a controller to join"
            >
              <GamepadIcon size={26} />
            </div>
          );
        }
        return (
          <button
            key={slot}
            onClick={() => {
              cycleSpecies(slot);
              playTap();
            }}
            className="relative flex h-12 w-12 items-center justify-center rounded-full border-4 bg-white shadow-lg sm:h-14 sm:w-14 transition-transform active:scale-90"
            style={{ borderColor: p.color, boxShadow: `0 4px 0 ${p.color}` }}
            title="Change animal"
          >
            <span className={`emoji text-3xl leading-none ${p.asleep ? 'opacity-40' : ''}`}>{SPECIES_EMOJI[p.species]}</span>
            {HAT_EMOJI[p.hat] && <span className="emoji absolute -right-2 -top-2 text-xl">{HAT_EMOJI[p.hat]}</span>}
            {p.asleep && <span className="emoji absolute -bottom-2 -right-2 animate-pulse text-xl">💤</span>}
          </button>
        );
      })}
    </div>
  );
}

function PartyMeter() {
  const party = useGame((s) => s.party);
  const partyUntil = useGame((s) => s.partyUntil);
  const now = useNow(250);
  const active = now < partyUntil;
  const fill = active ? 1 : party;
  return (
    <div className={`flex items-center gap-2 ${active ? 'animate-wiggle' : ''}`}>
      <div className="relative h-7 w-[min(52vw,300px)] overflow-hidden rounded-full border-4 border-white bg-slate-900/35 shadow-lg">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-out"
          style={{
            width: `${Math.max(4, fill * 100)}%`,
            background: 'linear-gradient(90deg,#ff4d5e,#ff9f1c,#ffd23f,#22c55e,#3b82f6,#a855f7)',
            backgroundSize: active ? '200% 100%' : '100% 100%',
            animation: active ? 'rainbow 0.8s linear infinite' : undefined
          }}
        />
      </div>
      <span className={`emoji text-4xl drop-shadow ${fill > 0.8 || active ? 'animate-wiggle' : ''}`}>🎉</span>
    </div>
  );
}

function StarSlots() {
  const stars = useGame((s) => s.stars);
  const lastStarAt = useGame((s) => s.lastStarAt);
  const now = useNow(300);
  const fresh = now - lastStarAt < 1200;
  const newest = stars.lastIndexOf(true);
  return (
    <div className="flex flex-wrap justify-center gap-0.5 rounded-full bg-slate-900/25 px-2 py-1 sm:gap-1">
      {stars.map((got, i) => (
        <StarIcon key={i} size={22} filled={got} className={fresh && got && i === newest ? 'animate-pop' : ''} />
      ))}
    </div>
  );
}

export function Hud({ onOpenMenu }: { onOpenMenu: () => void }) {
  const audio = useAudioState();
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-2 p-3 md:flex-nowrap sm:p-4">
        <div className="pointer-events-auto order-1">
          <PlayerBadges />
        </div>
        <div className="order-3 flex w-full flex-col items-center gap-2 md:order-2 md:w-auto">
          <PartyMeter />
          <StarSlots />
          {!audio.running && (
            <button
              className="pointer-events-auto flex h-14 w-14 animate-pulse items-center justify-center rounded-full border-4 border-white bg-amber-400 text-slate-900 shadow-xl"
              onClick={() => unlockAudio()}
              title="Tap to turn the sound on"
            >
              <SpeakerIcon muted size={30} />
            </button>
          )}
        </div>
        <div className="pointer-events-auto order-2 flex gap-2 md:order-3">
          <button
            className="flex h-11 w-11 items-center justify-center rounded-full border-4 border-white bg-sky-500/80 text-white shadow-lg active:scale-90 sm:h-12 sm:w-12"
            onClick={() => {
              unlockAudio();
              setMuted(!audio.muted);
            }}
            title={audio.muted ? 'Sound on' : 'Sound off'}
          >
            <SpeakerIcon muted={audio.muted} size={24} />
          </button>
          <button
            className="flex h-11 w-11 items-center justify-center rounded-full border-4 border-white bg-slate-700/70 text-white shadow-lg active:scale-90 sm:h-12 sm:w-12"
            onClick={onOpenMenu}
            title="Grown-ups menu"
          >
            <GearIcon size={24} />
          </button>
        </div>
      </div>
      <PartyFlash />
    </>
  );
}

function PartyFlash() {
  const startedAt = useGame((s) => s.partyStartedAt);
  const now = useNow(200);
  if (!isPartyTime() || now - startedAt > 1800) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <span className="emoji animate-party text-[22vmin] drop-shadow-2xl">🎉</span>
    </div>
  );
}
