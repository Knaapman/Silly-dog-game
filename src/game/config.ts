export const MAX_PLAYERS = 4;

export const PLAYER_COLORS = ['#ff4d5e', '#3b82f6', '#22c55e', '#fbbf24'] as const;

export const SPECIES = ['dog', 'goat', 'pig', 'sheep'] as const;
export type Species = (typeof SPECIES)[number];

export const SPECIES_EMOJI: Record<Species, string> = {
  dog: '🐶',
  goat: '🐐',
  pig: '🐷',
  sheep: '🐑'
};

export const HATS = ['none', 'party', 'crown', 'tophat', 'propeller', 'flower', 'cowboy', 'duck'] as const;
export type HatId = (typeof HATS)[number];

export const GRAVITY = -22;

/** Half size of the fenced play area (hedges sit on this line). */
export const WORLD_HALF = 62;

export const MOVE = {
  speed: 9,
  swimSpeed: 5,
  mudSpeed: 7,
  groundAccel: 14,
  airAccel: 5,
  jumpVelocity: 9.5,
  doubleJumpVelocity: 9,
  trampolineVelocity: 17,
  bonkDashSpeed: 13,
  bonkDuration: 0.28,
  bonkCooldown: 0.45,
  flopDuration: 2.6,
  leashRadius: 30
} as const;

/** How much each silly thing fills the shared party meter (full = 1). */
export const PARTY_POINTS = {
  bonk: 0.025,
  bonkCritter: 0.05,
  bounce: 0.015,
  launch: 0.04,
  pop: 0.05,
  splat: 0.06,
  goal: 0.2,
  strike: 0.2,
  star: 0.12,
  duet: 0.05,
  bellyFlop: 0.04,
  hat: 0.03,
  eat: 0.03,
  splash: 0.02,
  poop: 0.04,
  goldenPoop: 0.15,
  fart: 0.015
} as const;

/** Bites a belly holds. Every bite comes back out as one poop. */
export const BELLY_MAX = 5;

export const PARTY_DURATION_MS = 7000;
