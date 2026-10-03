import type * as RAPIER from '@dimforge/rapier3d-compat';
import type { RapierRigidBody, useRapier } from '@react-three/rapier';
import * as THREE from 'three';
import { gameNow } from './clock';

// Mutable, non-reactive world registry. Everything that changes every frame lives here
// (never in zustand) so 60fps updates don't trigger React renders.

export type PropKind =
  | 'ball'
  | 'beachball'
  | 'soccer'
  | 'bowling'
  | 'crate'
  | 'barrel'
  | 'cone'
  | 'hay'
  | 'melon'
  | 'pin'
  | 'apple'
  | 'duck'
  | 'chicken'
  | 'cat'
  | 'bird'
  | 'cow'
  | 'dino'
  | 'snowball'
  | 'throwball'
  | 'pitball'
  | 'poop'
  | 'giantcarrot'
  | 'hamsterball'
  | 'fish'
  | 'block'
  | 'giantball'
  | 'kite';

export type PropEntry = {
  id: number;
  kind: PropKind;
  getBody: () => RapierRigidBody | null;
  /** Approximate radius used for headbutt / tongue hit tests. */
  radius: number;
  /** Speed a headbutt gives it (lighter things fly further). */
  launch: number;
  heavy: boolean;
  grabbable: boolean;
  enabled: boolean;
  heldBy: number | null;
  onBonk?: (slot: number, dir: THREE.Vector3) => void;
  onGrab?: (slot: number) => boolean | void;
  /** Let go of (`thrown`: by licking again, not dropped). Return true if it put itself somewhere (no throw then). */
  onRelease?: (thrown?: boolean) => boolean | void;
};

export const props = new Map<number, PropEntry>();
let nextPropId = 1;

export function allocPropId() {
  return nextPropId++;
}

export function registerProp(entry: PropEntry) {
  props.set(entry.id, entry);
  return () => {
    props.delete(entry.id);
  };
}

export function propPosition(entry: PropEntry, out: THREE.Vector3) {
  const body = entry.getBody();
  if (!body) return null;
  const t = body.translation();
  return out.set(t.x, t.y, t.z);
}

/**
 * Fixed bodies that code moves about (the giant carrot's handle): never put to sleep, so their
 * pictures keep following them. (Every other fixed body is put to sleep: see Scene.tsx.)
 */
export const keepAwake = new Set<number>();

/** How high each player's kite is flying (0..1), by slot: up high, a jump turns into a glide. */
export const kiteLift = new Map<number, number>();

/** Static things that react to a headbutt (trees, the hat box...). */
export type StaticBonkable = {
  id: number;
  position: THREE.Vector3;
  radius: number;
  onBonk: (slot: number, dir: THREE.Vector3) => void;
};

export const statics = new Map<number, StaticBonkable>();

export function registerStatic(entry: StaticBonkable) {
  statics.set(entry.id, entry);
  return () => {
    statics.delete(entry.id);
  };
}

export type PlayerRuntime = {
  slot: number;
  source: string;
  getBody: () => RapierRigidBody | null;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  facing: number;
  flopped: boolean;
  /** Controller unplugged: napping, ignored by the camera and the leash. */
  asleep: boolean;
  /** Timestamps (performance.now) of the last jump / noise, so followers can copy them. */
  jumpedAt: number;
  noiseAt: number;
  /** Last time the poop button did something (poop, toot or rocket). */
  poopAt: number;
  /** Called when another player headbutts this one. */
  bump: (dir: THREE.Vector3) => void;
  hop: (vy: number) => void;
  /** Fly in an arc that lands on `target`, peaking at absolute height `apex`. */
  launchTo: (target: THREE.Vector3, apex: number) => void;
  /** Pin the player at a point (e.g. inside a cannon, on a sled), hidden or not, facing a way. null releases. */
  hold: (position: THREE.Vector3 | null, hidden?: boolean, facing?: number) => void;
  isLaunched: () => boolean;
  /** Standing on something (not in the air). */
  grounded: boolean;
  /** Wet feet: in the river, the lagoon, the sea or the fountain. */
  swimming: boolean;
  /** Bites in the belly (0..BELLY_MAX). Each one comes back out with the poop button. */
  belly: number;
  /** Eat something: the belly grows (or, when already full, a big burp). */
  feed: () => void;
  /** Magic food effect currently running, if any. */
  power: PowerKind | null;
  powerUp: (kind: PowerKind) => void;
  /** 1 = normal, bigger while giant. */
  size: number;
  /** Slot of the friend this one is riding piggyback on. */
  ridingOn: number | null;
  /** The computer buddy (not a child): hints and a few other things ignore it. */
  bot: boolean;
  /** Slot of the friend whose tongue has got hold of this one (lick a friend!). */
  grabbedBy: number | null;
  /** Where that tongue is pulling us to (set by the friend every frame). */
  tug: THREE.Vector3;
  /** When (game time) this player last held the "I'm stuck" buttons and popped out somewhere safe. */
  rescuedAt: number;
};

/** Magic foods: beans = fart rocket, mushroom = giant, chili = fire breath + fast feet. */
export type PowerKind = 'beans' | 'giant' | 'chili';

export const players = new Map<number, PlayerRuntime>();

/** Rides let go of a rider who was rescued this recently. */
const RESCUE_LET_GO_MS = 250;

/**
 * The player on a ride (a sled, a bumper car, the zipline...), looked up every frame. Someone who
 * has just been rescued ("I'm stuck!") counts as gone, so the ride lets go of them just as it
 * does when a player leaves the game.
 */
export function rider(slot: number | null | undefined): PlayerRuntime | undefined {
  if (slot == null) return undefined;
  const p = players.get(slot);
  return p && gameNow() - p.rescuedAt < RESCUE_LET_GO_MS ? undefined : p;
}

/**
 * Free to get on a ride: not flying or held by another ride already (`isLaunched`), not flopped,
 * not on a friend's back and not on the end of a tongue. Rides that hold their rider check this.
 */
export function canBoard(p: PlayerRuntime) {
  return !p.isLaunched() && !p.flopped && p.ridingOn == null && p.grabbedBy == null;
}

/**
 * Where each animal last stepped onto a launch pad, into a cannon or onto a geyser (game ms), so
 * the buddy can follow a child the same way.
 */
export const launchSpots = new Map<number, { x: number; z: number; at: number }>();

/** Food that stays put (bowls, cakes, carrots...). Only the tongue looks at these. */
export type FoodEntry = {
  id: number;
  position: THREE.Vector3;
  radius: number;
  enabled: boolean;
  /** Called when licked; the food handles its own crumbs and regrowing. */
  eat: (slot: number) => void;
};

export const foods = new Map<number, FoodEntry>();
let nextFoodId = 1;

export function registerFood(entry: Omit<FoodEntry, 'id'>) {
  const full: FoodEntry = { ...entry, id: nextFoodId++ };
  foods.set(full.id, full);
  return {
    entry: full,
    unregister: () => {
      foods.delete(full.id);
    }
  };
}

/** Recent animal noises; critters listen to these. */
export const noises: { position: THREE.Vector3; time: number; slot: number }[] = [];

export function pushNoise(position: THREE.Vector3, slot: number) {
  const now = gameNow();
  noises.push({ position: position.clone(), time: now, slot });
  while (noises.length > 0 && now - noises[0].time > 2000) noises.shift();
}

export const trampolineBounces = new Map<number, number>();

export const camera = {
  focus: new THREE.Vector3(0, 0, 4),
  shake: 0,
  /** How far back the camera wants to be right now (after the zoom setting). */
  dist: 0,
  /** Test mode only: park the camera somewhere fixed (overhead map shots). */
  override: null as { position: [number, number, number]; lookAt: [number, number, number] } | null
};

const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function shakeCamera(amount: number) {
  if (reducedMotion) return;
  camera.shake = Math.min(1.2, Math.max(camera.shake, amount));
}

/** World spawners, filled in by the components that own those things. */
export const spawners = {
  apple: (_position: THREE.Vector3, _color?: string) => {},
  babyDino: (_ownerSlot: number, _position: THREE.Vector3) => {},
  /** size ~0.8 (one bite) .. 1.4 (full belly); golden is the rare shiny one. */
  poop: (_position: THREE.Vector3, _velocity: THREE.Vector3, _size: number, _golden: boolean) => {},
  /** A lick into the water at `at` (facing `fwd`): now and then a fish leaps out. */
  fishLick: (_slot: number, _at: THREE.Vector3, _fwd: THREE.Vector3) => {}
};

export function playersCentroid(out: THREE.Vector3, excludeSlot?: number) {
  let count = 0;
  out.set(0, 0, 0);
  players.forEach((p) => {
    if (p.slot === excludeSlot || p.asleep) return;
    out.add(p.position);
    count += 1;
  });
  if (count > 0) out.divideScalar(count);
  return count;
}

// ---------------------------------------------------------------------------
// Special ground surfaces, keyed by collider handle. The player looks up whatever it is
// standing on: trampolines & mushrooms bounce, slides & ice are slippery, and rides
// (carousel, ferris wheel, train) carry you along.

export type Surface = {
  /** Upward speed given on landing. */
  bounce?: number;
  /** Ground acceleration while standing on it (low = slidey). */
  slippery?: number;
  /** A slide: plays a "wheee" when you start sliding. */
  slide?: boolean;
  /** Snow: white footstep puffs. */
  snow?: boolean;
  /** Moving platform: velocity of the surface at a world point. */
  velocityAt?: (point: THREE.Vector3, out: THREE.Vector3) => THREE.Vector3;
  onBounce?: (slot: number) => void;
};

export const surfaces = new Map<number, Surface>();

export function registerSurface(handle: number, surface: Surface) {
  surfaces.set(handle, surface);
  return () => {
    if (surfaces.get(handle) === surface) surfaces.delete(handle);
  };
}

/** Things that react when a player walks close (used for floating button hints). */
export type Hint = {
  id: number;
  position: THREE.Vector3;
  radius: number;
  action: 'jump' | 'bonk' | 'lick' | 'noise' | 'flop' | 'poop' | 'walk';
  /** Only players who need it bring it up (e.g. not one already holding the thing). */
  wants?: (p: PlayerRuntime) => boolean;
  /** Meant for this one player: in split screen only their view shows it. */
  slot?: number;
};
export const hints = new Map<number, Hint>();

export function registerHint(hint: Hint) {
  hints.set(hint.id, hint);
  return () => {
    hints.delete(hint.id);
  };
}

/** Toilet bowls: while flushing, poops inside swirl away. */
export type Drain = { x: number; z: number; radius: number; top: number; flushingUntil: number };
export const drains = new Set<Drain>();

/** Live numbers some rides publish (read by automated checks / the dev console). */
export const debugInfo: Record<string, unknown> = {};

/** Which end of each see-saw rests low right now (+1 / -1 along its length, 0 = level). */
export const seesawLow: number[] = [];

/** The physics world, for code that runs outside it (the buddy looking where there's room). */
export const physics: { world: RAPIER.World | null; rapier: ReturnType<typeof useRapier>['rapier'] | null } = { world: null, rapier: null };
