// Paint: buckets in the playground tip over and splash everyone near; a painted animal wears
// splotches of that colour (it washes off in the water, and dries and flakes off by itself after
// a while) and leaves a trail of coloured paw prints wherever it goes.

export const PAINT_COLORS = ['#ff4d5e', '#ffd23f', '#3b82f6', '#22c55e'];

/** Splashes waiting for each animal (slot → colour); the animal puts it on in its own frame. */
export const paintSplashes = new Map<number, number>();

export function paintAnimal(slot: number, color: number) {
  paintSplashes.set(slot, color);
}

/** How painted each animal is (for the tests): 0..1, its colour, and every colour since its last wash. */
export const paintOf = new Map<number, { amount: number; color: number; colors: number[] }>();

export type Footprint = { x: number; y: number; z: number; yaw: number; color: number; at: number };
export const FOOTPRINTS = 160;
/** Paw prints, newest last (a ring: the oldest are reused). */
export const footprints = { list: [] as Footprint[], cursor: 0, added: 0 };

export function addFootprint(p: Footprint) {
  if (footprints.list.length < FOOTPRINTS) footprints.list.push(p);
  else footprints.list[footprints.cursor] = p;
  footprints.cursor = (footprints.cursor + 1) % FOOTPRINTS;
  footprints.added += 1;
}
