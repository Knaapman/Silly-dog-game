import type { ReactNode } from 'react';
import type { ActionName } from '../game/input';
import { ArrowUpIcon } from './Icons';

// Colours follow the classic controller face buttons (A green, B red, X blue, Y yellow),
// so the same picture works on screen, in the legend and on the pad in a child's hands.
export const ACTION_UI: Record<ActionName, { color: string; shadow: string; icon: ReactNode; label: string }> = {
  jump: { color: '#22c55e', shadow: '#15803d', icon: <ArrowUpIcon size={34} />, label: 'Jump' },
  bonk: { color: '#ff4d5e', shadow: '#be123c', icon: <span className="emoji">💥</span>, label: 'Headbutt' },
  lick: { color: '#3b82f6', shadow: '#1d4ed8', icon: <span className="emoji">👅</span>, label: 'Lick & grab' },
  noise: { color: '#fbbf24', shadow: '#b45309', icon: <span className="emoji">📣</span>, label: 'Animal noise' },
  flop: { color: '#a855f7', shadow: '#7e22ce', icon: <span className="emoji">🌀</span>, label: 'Flop' },
  poop: { color: '#8d5a36', shadow: '#5d3a22', icon: <span className="emoji">💩</span>, label: 'Poop' },
  species: { color: '#14b8a6', shadow: '#0f766e', icon: <span className="emoji">🔄</span>, label: 'Change animal' },
  hat: { color: '#ec4899', shadow: '#be185d', icon: <span className="emoji">🎩</span>, label: 'Change hat' }
};

/** Controller "diamond" picture: shows which face button does what, by position + colour. */
export function ButtonDiamond({ size = 44 }: { size?: number }) {
  const cell = (action: ActionName, style: React.CSSProperties) => (
    <div
      className="absolute flex items-center justify-center rounded-full border-2 border-white/80 text-white shadow-md"
      style={{ width: size, height: size, background: ACTION_UI[action].color, fontSize: size * 0.5, ...style }}
      title={ACTION_UI[action].label}
    >
      {ACTION_UI[action].icon}
    </div>
  );
  const span = size * 2.6;
  return (
    <div className="relative" style={{ width: span, height: span }}>
      {cell('noise', { left: (span - size) / 2, top: 0 })}
      {cell('lick', { left: 0, top: (span - size) / 2 })}
      {cell('bonk', { right: 0, top: (span - size) / 2 })}
      {cell('jump', { left: (span - size) / 2, bottom: 0 })}
    </div>
  );
}
