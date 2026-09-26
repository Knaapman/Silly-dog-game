import { create } from 'zustand';
import { playSticker } from './audio';
import { SPECIES, SPECIES_UNLOCKS, type Species } from './config';
import { gameNow } from './clock';
import { loadJson, removeKey, saveJson } from './storage';

// The sticker album: a picture for every silly thing there is to do. It doubles as a "things
// to try" list for kids who can't read: the stickers still to find are grey shadows.

export type Sticker = { id: string; icon: string; badge?: string; color: string };

const TUMMY = '#8d5a36';
const FLY = '#3b82f6';
const MAGIC = '#a855f7';
const PARK = '#f59e0b';
const MORE = '#14b8a6';
const SURPRISE = '#ec4899';

export const STICKERS = [
  // tummy
  { id: 'poop', icon: '💩', color: TUMMY },
  { id: 'golden', icon: '💩', badge: '✨', color: '#eab308' },
  { id: 'toot', icon: '💨', color: TUMMY },
  { id: 'full', icon: '🍽️', color: TUMMY },
  { id: 'flower', icon: '🌸', color: TUMMY },
  { id: 'flush', icon: '🚽', color: TUMMY },
  // flying
  { id: 'geyser', icon: '⛲', color: FLY },
  { id: 'pad', icon: '⏫', color: FLY },
  { id: 'cannon', icon: '🏴‍☠️', color: FLY },
  { id: 'volcano', icon: '🌋', color: FLY },
  { id: 'seesaw', icon: '⚖️', color: FLY },
  { id: 'bellyflop', icon: '💥', color: FLY },
  // magic food and friends
  { id: 'giant', icon: '🍄', color: MAGIC },
  { id: 'rocket', icon: '🚀', badge: '💨', color: MAGIC },
  { id: 'fire', icon: '🔥', color: MAGIC },
  { id: 'ride', icon: '🐴', color: MAGIC },
  { id: 'tower', icon: '🗼', color: MAGIC },
  { id: 'throw', icon: '👅', color: MAGIC },
  // park
  { id: 'star', icon: '⭐', color: PARK },
  { id: 'allstars', icon: '🌟', badge: '🌟', color: PARK },
  { id: 'party', icon: '🎉', color: PARK },
  { id: 'goal', icon: '⚽', color: PARK },
  { id: 'strike', icon: '🎳', color: PARK },
  { id: 'bell', icon: '🔔', color: PARK },
  // and more
  { id: 'dino', icon: '🦕', color: MORE },
  { id: 'balloon', icon: '🎈', color: MORE },
  { id: 'photo', icon: '📷', color: MORE },
  { id: 'hat', icon: '🎩', color: MORE },
  { id: 'swim', icon: '🏊', color: MORE },
  { id: 'roar', icon: '🦖', color: MORE },
  // surprises, and a few more things to find
  { id: 'chicken', icon: '🐔', badge: '✨', color: SURPRISE },
  { id: 'present', icon: '🎁', color: SURPRISE },
  { id: 'puddle', icon: '☔', color: SURPRISE },
  { id: 'rainbow', icon: '🌈', color: SURPRISE },
  { id: 'snowball', icon: '⛄', color: SURPRISE },
  { id: 'windmill', icon: '🌬️', color: SURPRISE }
] as const satisfies readonly Sticker[];

export type StickerId = (typeof STICKERS)[number]['id'];

const KEY = 'stickers:v1';
const IDS = new Set<string>(STICKERS.map((s) => s.id));

function load(): StickerId[] {
  const saved = loadJson<unknown>(KEY);
  return Array.isArray(saved) ? (saved.filter((id) => typeof id === 'string' && IDS.has(id)) as StickerId[]) : [];
}

type StickerStore = {
  got: StickerId[];
  /** The newest sticker and when (game ms), for the big "new sticker!" moment. */
  last: { id: StickerId; at: number } | null;
  /** An animal that just joined (enough stickers), and when (game ms). */
  newAnimal: { species: Species; at: number } | null;
  earn: (id: StickerId) => boolean;
  reset: () => void;
};

export const useStickers = create<StickerStore>((set, get) => ({
  got: load(),
  last: null,
  newAnimal: null,
  earn: (id) => {
    if (get().got.includes(id)) return false;
    const got = [...get().got, id];
    const joined = SPECIES.find((s) => SPECIES_UNLOCKS[s] === got.length);
    set({ got, last: { id, at: gameNow() }, newAnimal: joined ? { species: joined, at: gameNow() } : get().newAnimal });
    saveJson(KEY, got);
    playSticker();
    return true;
  },
  reset: () => {
    set({ got: [], last: null, newAnimal: null });
    removeKey(KEY);
  }
}));

/** Give the family a sticker (does nothing if it's already in the album). */
export function earnSticker(id: StickerId) {
  return useStickers.getState().earn(id);
}

export function stickerById(id: string) {
  return STICKERS.find((s) => s.id === id);
}

/** The animals you can be: the first four, plus the ones the stickers have brought. */
export function unlockedSpecies(count = useStickers.getState().got.length): Species[] {
  return SPECIES.filter((s) => SPECIES_UNLOCKS[s] == null || count >= SPECIES_UNLOCKS[s]!);
}
