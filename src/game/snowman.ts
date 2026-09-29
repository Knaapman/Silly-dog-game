import { create } from 'zustand';
import { gameNow } from './clock';
import { distXZ, SNOWMAN_BUILD, type Vec3 } from './layout';

// Building a snowman: roll a snowball big, roll it into the ring (the bottom), then roll two
// more onto it (the middle, then the head). The last one on: a face, a hat and a scarf, and a
// party. A headbutt knocks the finished snowman down, ready to build again.

/** How big a snowball has to be (radius, m) for the bottom, the middle and the head. */
export const SNOWMAN_MIN = [0.9, 0.7, 0.5] as const;
/** How long a snowball takes to hop onto the snowman (seconds). */
export const SNOWMAN_FLY = 0.5;

export type SnowPiece = { r: number; from: Vec3; at: number };

export const useSnowman = create<{
  pieces: SnowPiece[];
  /** Game time (ms) the head lands: the snowman is finished from then on. -1 while building. */
  builtAt: number;
  add: (piece: SnowPiece) => void;
  reset: () => void;
}>((set) => ({
  pieces: [],
  builtAt: -1,
  add: (piece) =>
    set((s) => {
      const pieces = [...s.pieces, piece];
      return { pieces, builtAt: pieces.length === 3 ? piece.at + SNOWMAN_FLY * 1000 : s.builtAt };
    }),
  reset: () => set({ pieces: [], builtAt: -1 })
}));

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** How big a snowball of radius `r` ends up as piece `n` on top of `below` (the bottom caps the rest). */
export function pieceSize(n: number, r: number, below?: number) {
  if (n === 0 || below == null) return clamp(r, SNOWMAN_MIN[0], 1.5);
  return n === 1 ? clamp(r, 0.6, below * 0.8) : clamp(r, 0.42, below * 0.75);
}

/** Heights (above the snow) of the pieces' centres. */
export function pieceHeights(sizes: number[]) {
  const out: number[] = [];
  sizes.forEach((r, i) => {
    out.push(i === 0 ? r * 0.85 : out[i - 1] + sizes[i - 1] * 0.75 + r * 0.8);
  });
  return out;
}

/** The sizes the snowman will have: the pieces on it so far, and the usual sizes for the rest. */
export function plannedSizes(pieces: { r: number }[]) {
  const sizes: number[] = [];
  for (let n = 0; n < 3; n += 1) sizes.push(pieces[n]?.r ?? pieceSize(n, n === 0 ? 1 : 9, sizes[n - 1]));
  return sizes;
}

/**
 * A snowball rolling about asks whether the snowman wants it: into the ring for the bottom, or
 * touching the bottom for the rest, and big enough. True: it's on (the snowball goes home).
 */
export function offerSnowball(p: { x: number; y: number; z: number }, r: number): boolean {
  const st = useSnowman.getState();
  const n = st.pieces.length;
  if (n >= 3 || r < SNOWMAN_MIN[n]) return false;
  const d = distXZ(p.x, p.z, SNOWMAN_BUILD.center[0], SNOWMAN_BUILD.center[1]);
  // (the ring is a little bigger than it looks)
  if (n === 0 ? d > SNOWMAN_BUILD.radius + 0.5 : d > st.pieces[0].r + r + 0.35) return false;
  st.add({ r: pieceSize(n, r, st.pieces[n - 1]?.r), from: [p.x, p.y, p.z], at: gameNow() });
  return true;
}
