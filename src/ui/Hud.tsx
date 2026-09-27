import { useEffect, useState } from 'react';
import { getAudioState, playTap, setMuted, subscribeAudio, unlockAudio } from '../game/audio';
import { MAX_PLAYERS, PLAYER_COLORS, PLAYER_SHAPES, SPECIES_EMOJI, type HatId } from '../game/config';
import { PlayerShapeIcon } from './PlayerShapeIcon';
import { getConnectedPads } from '../game/input';
import { isPartyTime, useGame } from '../game/store';
import { CameraIcon, GamepadIcon, GearIcon, SpeakerIcon, StarIcon } from './Icons';
import { gameNow } from '../game/clock';
import { useProgress } from '../game/progress';
import { PHOTO_BEEPS, usePhotos } from '../game/photo';
import { useStickers } from '../game/stickers';
import { EVENT_ICON, RAINBOW_TIME, useEvents } from '../game/world/Events';
import { AlbumIcon, GuideBadge, StickerPop } from './Stickers';

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
            {p.bot && <span className="emoji absolute -bottom-2 -right-2 text-lg" title="Buddy">💛</span>}
            <span className="absolute -bottom-1.5 -left-1.5" data-shape={PLAYER_SHAPES[slot]}>
              <PlayerShapeIcon shape={PLAYER_SHAPES[slot]} color={p.color} size={20} />
            </span>
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
          <div className="flex items-center gap-3">
            <EventBadge />
            <GuideBadge />
          </div>
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
            className="flex h-11 w-11 items-center justify-center rounded-full border-4 border-white bg-pink-500/85 text-white shadow-lg active:scale-90 sm:h-12 sm:w-12"
            onClick={() => {
              unlockAudio();
              usePhotos.getState().request();
            }}
            title="Take a photo"
            data-testid="camera-button"
          >
            <CameraIcon size={24} />
          </button>
          <AlbumButton />
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
      <RainbowSky />
      <PartyFlash />
      <UnlockFlash />
      <AnimalFlash />
      <PhotoOverlay />
      <StickerPopNow />
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

/** A new hat was unlocked: it pops up big in the middle of the screen. */
function UnlockFlash() {
  const unlock = useProgress((s) => s.lastUnlock);
  const now = useNow(200);
  if (!unlock || now - unlock.at > 2200 || !HAT_EMOJI[unlock.hat]) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" data-testid="hat-unlock">
      <span className="emoji animate-party text-[26vmin] drop-shadow-2xl">{HAT_EMOJI[unlock.hat]}</span>
    </div>
  );
}

/** Taking a photo: three dots count down, a white flash, then the picture pops up. */
function PhotoOverlay() {
  const startedAt = usePhotos((s) => s.startedAt);
  const beeps = usePhotos((s) => s.beeps);
  const latest = usePhotos((s) => s.latest);
  const now = useNow(100);
  const showing = latest && now - latest.at < 3400;
  return (
    <>
      {startedAt != null && (
        <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-4" data-testid="photo-countdown">
          <span className="animate-breathe text-white drop-shadow-2xl">
            <CameraIcon size={120} />
          </span>
          <div className="flex gap-4">
            {PHOTO_BEEPS.map((_, i) => (
              <span key={i} className={`h-8 w-8 rounded-full border-4 border-white shadow-lg transition-colors ${i < beeps ? 'bg-amber-400' : 'bg-white/20'}`} />
            ))}
          </div>
        </div>
      )}
      {showing && (
        <>
          <div key={`flash-${latest.photo.id}`} className="animate-flash pointer-events-none absolute inset-0 z-40 bg-white" />
          <div key={`photo-${latest.photo.id}`} className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
            <div className="animate-polaroid rounded-md bg-white p-3 pb-10 shadow-2xl" data-testid="photo-preview">
              <img src={latest.photo.url} alt="" className="block max-h-[55vh] max-w-[70vw] rounded-sm" />
            </div>
          </div>
        </>
      )}
    </>
  );
}

function AlbumButton() {
  const count = useStickers((s) => s.got.length);
  const open = useGame((s) => s.setAlbumOpen);
  return (
    <button
      className="relative flex h-11 w-11 items-center justify-center rounded-full border-4 border-white bg-amber-500/90 text-white shadow-lg active:scale-90 sm:h-12 sm:w-12"
      onClick={() => open(true)}
      title="Sticker album"
      data-testid="album-button"
    >
      <AlbumIcon size={24} />
      {count > 0 && <span className="absolute -bottom-1 -right-1 rounded-full bg-white px-1.5 text-[11px] font-black text-amber-600 shadow">{count}</span>}
    </button>
  );
}

function StickerPopNow() {
  const now = useNow(100);
  return <StickerPop now={now} />;
}

/** Enough stickers: a new animal joins the park (it pops up big, and Select can now pick it). */
function AnimalFlash() {
  const joined = useStickers((s) => s.newAnimal);
  const now = useNow(200);
  // after the sticker itself has had its moment
  const age = joined ? now - joined.at : Infinity;
  if (!joined || age < 1800 || age > 4400) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center" data-testid="animal-unlock">
      <span className="emoji animate-party text-[30vmin] drop-shadow-2xl">{SPECIES_EMOJI[joined.species]}</span>
    </div>
  );
}

/** Something is happening in the park: its picture bounces under the stars. */
function EventBadge() {
  const kind = useEvents((s) => s.kind);
  if (!kind) return null;
  return (
    <span className="emoji animate-hop text-4xl drop-shadow-lg" data-testid="event-badge">
      {EVENT_ICON[kind]}
    </span>
  );
}

const RAINBOW_BANDS = ['#a855f7', '#3b82f6', '#22c55e', '#ffd23f', '#ff9f1c', '#ff4d5e'];

/**
 * After the rain: a rainbow over the park. The camera looks down at the ground and never sees
 * the sky, so the rainbow is drawn over the top of the picture instead.
 */
function RainbowSky() {
  const until = useEvents((s) => s.rainbowUntil);
  const now = useNow(100);
  const left = (until - now) / 1000;
  if (left <= 0) return null;
  const k = Math.max(0, Math.min(1, (RAINBOW_TIME - left) / 3, left / 4));
  const stops = RAINBOW_BANDS.map((c, i) => `${c} ${56 + i * 3}% ${59 + i * 3}%`).join(', ');
  return (
    <div
      className="pointer-events-none absolute left-1/2 z-[5] aspect-[2/1] w-[130vw] -translate-x-1/2"
      style={{ top: '-18vw', opacity: 0.55 * k, background: `radial-gradient(circle at 50% 100%, transparent 56%, ${stops}, transparent 74%)` }}
      data-testid="rainbow"
    />
  );
}
