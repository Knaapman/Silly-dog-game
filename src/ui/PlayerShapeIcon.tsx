import type { PlayerShape } from '../game/config';

/** The player's shape as a small picture (for badges), matching the one over the animal. */
export function PlayerShapeIcon({ shape, color, size = 16 }: { shape: PlayerShape; color: string; size?: number }) {
  const path = {
    triangle: 'M3 5h18L12 20z',
    circle: 'M12 3a9 9 0 110 18 9 9 0 010-18z',
    diamond: 'M12 2l10 10-10 10L2 12z',
    star: 'M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.2 6.1 20.4l1.3-6.5L2.5 9.3l6.6-.8z'
  }[shape];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d={path} fill={color} stroke="#ffffff" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}
