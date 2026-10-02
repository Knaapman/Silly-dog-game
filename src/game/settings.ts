import { create } from 'zustand';
import { setRumbleEnabled } from './input';
import { loadJson, saveJson } from './storage';

// Grown-ups settings: remembered on this device, changed in the grown-ups menu.

export type Quality = 'low' | 'high' | 'ultra';
export type Level = 0 | 1 | 2;

export type Settings = {
  /** How fast the animals run: calm, normal, zoomy. */
  speed: Level;
  /** How long magic food lasts: short, normal, long. */
  magic: Level;
  /** How soon a poop turns into a flower: soon, normal, late. */
  sprout: Level;
  /** How far apart friends can wander before they're gently pulled together (only without split screen). */
  together: Level;
  /** Split the screen when friends wander far apart (instead of pulling them back together). */
  split: boolean;
  rumble: boolean;
  /** Park surprises now and then: rain, a runaway golden chicken, a present balloon. */
  surprises: boolean;
  /** A computer buddy keeps a child playing alone company. */
  buddy: boolean;
  /** How hard the park cats are to catch; 'auto' adapts to each child as they play. */
  chase: Level | 'auto';
  /** 'auto' picks from the graphics card. */
  quality: Quality | 'auto';
  /** How far the camera stands back: 1 is normal, less is closer, more shows more of the park. */
  zoom: number;
};

export const ZOOM_MIN = 0.6;
export const ZOOM_MAX = 1.6;

export const SPEED_FACTOR = [0.8, 1, 1.15] as const;
export const MAGIC_FACTOR = [0.5, 1, 2] as const;
/** Seconds before a poop sprouts into a flower. */
export const SPROUT_SECONDS = [15, 35, 90] as const;
export const LEASH_RADIUS = [20, 30, 42] as const;

export const DEFAULT_SETTINGS: Settings = { speed: 1, magic: 1, sprout: 1, together: 1, split: true, rumble: true, surprises: true, buddy: true, chase: 'auto', quality: 'auto', zoom: 1 };

const KEY = 'settings:v1';

function sanitize(raw: Partial<Settings> | undefined): Settings {
  const level = (v: unknown, d: Level): Level => (v === 0 || v === 1 || v === 2 ? v : d);
  const quality = raw?.quality;
  return {
    speed: level(raw?.speed, DEFAULT_SETTINGS.speed),
    magic: level(raw?.magic, DEFAULT_SETTINGS.magic),
    sprout: level(raw?.sprout, DEFAULT_SETTINGS.sprout),
    together: level(raw?.together, DEFAULT_SETTINGS.together),
    split: typeof raw?.split === 'boolean' ? raw.split : DEFAULT_SETTINGS.split,
    rumble: typeof raw?.rumble === 'boolean' ? raw.rumble : DEFAULT_SETTINGS.rumble,
    surprises: typeof raw?.surprises === 'boolean' ? raw.surprises : DEFAULT_SETTINGS.surprises,
    buddy: typeof raw?.buddy === 'boolean' ? raw.buddy : DEFAULT_SETTINGS.buddy,
    chase: raw?.chase === 'auto' ? 'auto' : level(raw?.chase, 1) === raw?.chase ? (raw.chase as Level) : DEFAULT_SETTINGS.chase,
    quality: quality === 'low' || quality === 'high' || quality === 'ultra' || quality === 'auto' ? quality : DEFAULT_SETTINGS.quality,
    zoom: typeof raw?.zoom === 'number' && Number.isFinite(raw.zoom) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, raw.zoom)) : DEFAULT_SETTINGS.zoom
  };
}

type SettingsStore = Settings & {
  /** What 'auto' turned out to be on this machine, and the graphics card it saw. */
  detected: Quality;
  gpu: string;
  /** What 'auto' is using right now: starts at `detected`, lowered/raised by the frame rate. */
  autoLevel: Quality;
  set: (patch: Partial<Settings>) => void;
  setDetected: (quality: Quality, gpu: string) => void;
};

export const useSettings = create<SettingsStore>((set, get) => ({
  ...sanitize(loadJson<Partial<Settings>>(KEY)),
  detected: 'high',
  gpu: '',
  autoLevel: 'high',
  set: (patch) => {
    set(sanitize({ ...get(), ...patch }));
    const { speed, magic, sprout, together, split, rumble, surprises, buddy, chase, quality, zoom } = get();
    saveJson(KEY, { speed, magic, sprout, together, split, rumble, surprises, buddy, chase, quality, zoom });
  },
  setDetected: (detected, gpu) => set({ detected, gpu, autoLevel: detected })
}));

setRumbleEnabled(useSettings.getState().rumble);
useSettings.subscribe((s) => setRumbleEnabled(s.rumble));

export function settings() {
  return useSettings.getState();
}

export function effectiveQuality(s: Pick<SettingsStore, 'quality' | 'autoLevel'> = useSettings.getState()): Quality {
  return s.quality === 'auto' ? s.autoLevel : s.quality;
}

/** Guess a sensible graphics level from the WebGL renderer name. */
export function detectQuality(renderer: string, coarsePointer: boolean): Quality {
  if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer)) return 'low';
  if (coarsePointer) return 'high';
  if (/rtx|radeon rx [5-9]\d{3}|arc a[57]\d{2}|apple m[2-9]/i.test(renderer)) return 'ultra';
  return 'high';
}

/** Per-level shadow settings. */
export const QUALITY = {
  low: { shadowMap: 1024, shadowExtent: 26 },
  high: { shadowMap: 2048, shadowExtent: 30 },
  ultra: { shadowMap: 4096, shadowExtent: 42 }
} as const;

/**
 * Render resolution (device pixel ratio). High follows the screen (up to 1.75). Ultra
 * supersamples: it draws up to a 4K-wide picture and scales it down, which is what makes
 * edges smooth on a 1080p or 1440p screen, but never less sharp than the screen itself.
 */
export function qualityDpr(quality: Quality, screenRatio: number, cssWidth: number): number | [number, number] {
  if (quality === 'low') return 1;
  if (quality === 'high') return [1, 1.75];
  const native = Math.min(screenRatio || 1, 2);
  return Math.max(native, Math.min(2, 3840 / Math.max(1, cssWidth)));
}
