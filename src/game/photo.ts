import { create } from 'zustand';
import { playPhotoBeep } from './audio';
import { gameNow } from './clock';
import { players } from './runtime';
import { loadJson, saveJson } from './storage';

// The camera button: a short countdown (everyone jumps for the picture), a flash, and a
// photo that is kept on this device for the grown-ups to look at and save.

/** Countdown beeps (seconds after the button), then the shutter. */
export const PHOTO_BEEPS = [0, 0.6, 1.2];
export const PHOTO_SHUTTER = 1.8;
/** Everyone hops this long before the shutter, so the picture catches them in the air. */
const HOP_BEFORE = 0.4;
/** How many photos are kept (the oldest go first). */
export const MAX_PHOTOS = 12;
/** Longest side of a saved photo, in pixels. */
export const PHOTO_SIZE = 960;

export type Photo = { id: number; at: number; url: string };

const KEY = 'photos:v1';

type PhotoStore = {
  /** Game ms when the camera button was pressed; null when no photo is being taken. */
  startedAt: number | null;
  beeps: number;
  hopped: boolean;
  photos: Photo[];
  /** The photo just taken (shown big for a moment), with the game ms it was taken. */
  latest: { photo: Photo; at: number } | null;
  request: () => void;
  /** Runs the countdown; returns true on the frame the picture should be taken. */
  tick: () => boolean;
  add: (url: string) => void;
  remove: (id: number) => void;
  clear: () => void;
};

function loadPhotos(): Photo[] {
  const saved = loadJson<Photo[]>(KEY);
  if (!Array.isArray(saved)) return [];
  return saved.filter((p) => p && typeof p.url === 'string' && p.url.startsWith('data:image/') && typeof p.id === 'number').slice(-MAX_PHOTOS);
}

/** Save as many of the newest photos as fit in storage. */
function persist(photos: Photo[]) {
  for (let from = 0; from <= photos.length; from += 1) {
    if (saveJson(KEY, photos.slice(from))) return;
  }
}

export const usePhotos = create<PhotoStore>((set, get) => ({
  startedAt: null,
  beeps: 0,
  hopped: false,
  photos: loadPhotos(),
  latest: null,
  request: () => {
    if (get().startedAt != null) return;
    set({ startedAt: gameNow(), beeps: 0, hopped: false });
  },
  tick: () => {
    const { startedAt, beeps, hopped } = get();
    if (startedAt == null) return false;
    const t = (gameNow() - startedAt) / 1000;
    if (beeps < PHOTO_BEEPS.length && t >= PHOTO_BEEPS[beeps]) {
      playPhotoBeep(beeps === PHOTO_BEEPS.length - 1);
      set({ beeps: beeps + 1 });
    }
    if (!hopped && t >= PHOTO_SHUTTER - HOP_BEFORE) {
      players.forEach((p) => {
        if (!p.asleep && p.ridingOn == null) p.hop(9);
      });
      set({ hopped: true });
    }
    if (t < PHOTO_SHUTTER) return false;
    set({ startedAt: null });
    return true;
  },
  add: (url) => {
    const photo = { id: Date.now(), at: Date.now(), url };
    const photos = [...get().photos, photo].slice(-MAX_PHOTOS);
    set({ photos, latest: { photo, at: gameNow() } });
    persist(photos);
  },
  remove: (id) => {
    const photos = get().photos.filter((p) => p.id !== id);
    set({ photos });
    persist(photos);
  },
  clear: () => {
    set({ photos: [], latest: null });
    persist([]);
  }
}));

/** When the countdown is running: how far along it is (0..1), else null. */
export function photoCountdown(now = gameNow()) {
  const { startedAt } = usePhotos.getState();
  return startedAt == null ? null : Math.min(1, (now - startedAt) / 1000 / PHOTO_SHUTTER);
}
