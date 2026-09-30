import { create } from 'zustand';
import { SKY_FLAGS } from './layout';

// How far up the sky course anyone has got this time (0 = nobody past the start; 4 = the top).
// Shared by everyone playing: when the big one gets to a flag, the little one can use the pad at
// the start to go straight there too.

export const useSkyCourse = create<{ reached: number; reach: (flag: number) => boolean; reset: () => void }>((set, get) => ({
  reached: 0,
  reach: (flag) => {
    if (flag <= get().reached || flag > SKY_FLAGS.length) return false;
    set({ reached: flag });
    return true;
  },
  reset: () => set({ reached: 0 })
}));

/** Which flag's platform (1-based) a point is standing on, or 0. */
export function flagAt(x: number, y: number, z: number) {
  for (let i = SKY_FLAGS.length - 1; i >= 0; i -= 1) {
    const f = SKY_FLAGS[i];
    if (Math.abs(x - f.at[0]) <= f.size[0] / 2 + 0.2 && Math.abs(z - f.at[1]) <= f.size[1] / 2 + 0.2 && y > f.top && y < f.top + 1.6) return i + 1;
  }
  return 0;
}
