import { create } from 'zustand';
import { playPhotoBeep } from './audio';
import { gameNow } from './clock';
import { players } from './runtime';
import { idbAll, idbClear, idbDelete, idbPut } from './idb';
import { loadJson, removeKey } from './storage';
import { earnSticker } from './stickers';

// The camera button: a short countdown (everyone jumps for the picture), a flash, and a
// photo that is kept on this device for the grown-ups to look at and save.

/** Countdown beeps (seconds after the button), then the shutter. */
export const PHOTO_BEEPS = [0, 0.6, 1.2];
export const PHOTO_SHUTTER = 1.8;
/** Everyone hops this long before the shutter, so the picture catches them in the air. */
const HOP_BEFORE = 0.4;
/** How many photos are kept (the oldest go first). */
export const MAX_PHOTOS = 48;
/** Longest side of a saved photo, in pixels. */
export const PHOTO_SIZE = 960;

export type Photo = { id: number; at: number; url: string };

/** Where photos used to be kept (localStorage); moved to IndexedDB on first start. */
const OLD_KEY = 'photos:v1';

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

const isPhoto = (p: unknown): p is Photo => {
  const q = p as Photo | null;
  return !!q && typeof q.id === 'number' && typeof q.at === 'number' && typeof q.url === 'string' && q.url.startsWith('data:image/');
};

/** Load the kept photos (moving any old localStorage ones over first). */
async function loadPhotos() {
  const old = loadJson<unknown[]>(OLD_KEY);
  if (Array.isArray(old)) {
    await Promise.all(old.filter(isPhoto).map((p) => idbPut('photos', p)));
    removeKey(OLD_KEY);
  }
  const saved = (await idbAll<unknown>('photos')).filter(isPhoto).sort((a, b) => a.id - b.id);
  const extra = saved.slice(0, Math.max(0, saved.length - MAX_PHOTOS));
  extra.forEach((p) => void idbDelete('photos', p.id));
  const kept = saved.slice(extra.length);
  // photos taken while loading stay too
  usePhotos.setState((s) => ({ photos: [...kept, ...s.photos.filter((p) => !kept.some((k) => k.id === p.id))].slice(-MAX_PHOTOS) }));
}

export const usePhotos = create<PhotoStore>((set, get) => ({
  startedAt: null,
  beeps: 0,
  hopped: false,
  photos: [],
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
    const all = [...get().photos, photo];
    const photos = all.slice(-MAX_PHOTOS);
    all.slice(0, all.length - photos.length).forEach((p) => void idbDelete('photos', p.id));
    set({ photos, latest: { photo, at: gameNow() } });
    void idbPut('photos', photo);
    earnSticker('photo');
  },
  remove: (id) => {
    set({ photos: get().photos.filter((p) => p.id !== id) });
    void idbDelete('photos', id);
  },
  clear: () => {
    set({ photos: [], latest: null });
    void idbClear('photos');
  }
}));

void loadPhotos();

/** When the countdown is running: how far along it is (0..1), else null. */
export function photoCountdown(now = gameNow()) {
  const { startedAt } = usePhotos.getState();
  return startedAt == null ? null : Math.min(1, (now - startedAt) / 1000 / PHOTO_SHUTTER);
}
