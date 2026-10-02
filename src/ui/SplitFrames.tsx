import { PLAYER_COLORS, PLAYER_SHAPES } from '../game/config';
import { layoutRects, useViews } from '../game/views';
import { PlayerShapeIcon } from './PlayerShapeIcon';

/**
 * Split screen: a frame in each child's colour round their part of the screen (with white lines
 * between them), and their shape in the corner, so everybody can see which view is theirs.
 */
export function SplitFrames() {
  const split = useViews((s) => s.split);
  const slots = useViews((s) => s.slots);
  if (!split || slots.length < 2) return null;
  const rects = layoutRects(slots.length);
  return (
    <div className="pointer-events-none absolute inset-0 z-[5]" data-testid="split-frames" data-slots={slots.join(',')}>
      {slots.map((slot, i) => {
        const r = rects[i];
        const color = PLAYER_COLORS[slot];
        return (
          <div
            key={slot}
            className="absolute"
            data-testid={`split-view-${slot}`}
            style={{
              left: `${r.x * 100}%`,
              top: `${r.y * 100}%`,
              width: `${r.w * 100}%`,
              height: `${r.h * 100}%`,
              boxShadow: `inset 0 0 0 3px #ffffff, inset 0 0 0 9px ${color}`
            }}
          >
            <span className="absolute bottom-3 left-3 drop-shadow">
              <PlayerShapeIcon shape={PLAYER_SHAPES[slot]} color={color} size={30} />
            </span>
          </div>
        );
      })}
    </div>
  );
}
