import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { PLAYER_COLORS, PLAYER_SHAPES } from '../game/config';
import { players } from '../game/runtime';
import { useGame } from '../game/store';
import { layoutRects, useViews, views } from '../game/views';
import { PlayerShapeIcon } from './PlayerShapeIcon';

/**
 * Where are my friends? A friend who's off the edge of your view (or behind the camera) gets a
 * little arrow at the edge of it, in their colour with their shape on it, pointing the way to
 * them, like a compass. In split screen each view has its own arrows; in the shared view (which
 * frames everybody) they only show when somebody is out of the picture anyway. Not for the buddy:
 * it always comes to you.
 */
export function FriendArrows() {
  const kids = useGame((s) => s.players).filter((p) => p.source !== 'bot');
  const split = useViews((s) => s.split);
  const slots = useViews((s) => s.slots);
  const shown = split && slots.length >= 2 ? slots : [-1];
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const at = new THREE.Vector3();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const root = box.current;
      if (!root) return;
      const W = root.clientWidth;
      const H = root.clientHeight;
      const rects = layoutRects(views.split ? views.list.length : 1);
      root.querySelectorAll<HTMLElement>('[data-arrow]').forEach((el) => {
        const view = Number(el.dataset.view);
        const friend = players.get(Number(el.dataset.friend));
        const i = view < 0 ? 0 : views.list.findIndex((v) => v.slot === view);
        const cam = view < 0 ? views.shared : views.list[i]?.cam;
        const r = rects[i];
        if (!friend || !cam || !r) {
          el.dataset.visible = 'false';
          return;
        }
        at.copy(friend.position);
        at.y += 0.4;
        at.project(cam);
        // behind the camera the projection comes out mirrored: turn it round
        const behind = at.z > 1;
        let x = behind ? -at.x : at.x;
        let y = behind ? -at.y : at.y;
        if (!behind && Math.abs(x) < EDGE_X && Math.abs(y) < EDGE_Y) {
          el.dataset.visible = 'false';
          return;
        }
        // onto the edge of the view, in the friend's direction from the middle of it
        if (Math.abs(x) < 1e-4 && Math.abs(y) < 1e-4) y = -1;
        const k = Math.max(Math.abs(x) / EDGE_X, Math.abs(y) / EDGE_Y);
        x /= k;
        y /= k;
        const px = (r.x + ((x + 1) / 2) * r.w) * W;
        const py = (r.y + ((1 - y) / 2) * r.h) * H;
        const angle = Math.atan2(-y, x);
        el.dataset.visible = 'true';
        el.dataset.angle = angle.toFixed(3);
        el.style.transform = `translate(${px}px, ${py}px) translate(-50%, -50%)`;
        const pointer = el.firstElementChild as HTMLElement | null;
        if (pointer) pointer.style.transform = `rotate(${angle}rad)`;
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (kids.length < 2) return null;
  return (
    <div ref={box} className="pointer-events-none absolute inset-0 z-[6] overflow-hidden" data-testid="friend-arrows">
      {shown.flatMap((view) =>
        kids
          .filter((p) => p.slot !== view)
          .map((p) => (
            <div key={`${view}:${p.slot}`} data-arrow="" data-view={view} data-friend={p.slot} data-visible="false" data-testid={`friend-arrow-${view}-${p.slot}`} className="friend-arrow absolute left-0 top-0" style={{ width: SIZE, height: SIZE }}>
              {/* the pointer (turned to face the friend), round the friend's shape */}
              <svg className="absolute inset-0" viewBox="-30 -30 60 60" width={SIZE} height={SIZE} aria-hidden>
                <path d="M 29 0 L 14 -11 L 14 11 Z" fill={PLAYER_COLORS[p.slot]} stroke="#ffffff" strokeWidth={3} strokeLinejoin="round" />
                <circle r={15} fill={PLAYER_COLORS[p.slot]} stroke="#ffffff" strokeWidth={3} />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center">
                <PlayerShapeIcon shape={PLAYER_SHAPES[p.slot]} color="#ffffff" size={16} />
              </span>
            </div>
          ))
      )}
    </div>
  );
}

/** Size of an arrow (px). */
const SIZE = 60;
/** A friend this far towards the edge of a view (screen units, -1..1) counts as out of sight; it's where the arrow sits. */
const EDGE_X = 0.88;
const EDGE_Y = 0.82;
