import { useCallback, useEffect, useRef, useState } from 'react';
import { onUiNav } from '../game/input';
import { STICKERS, stickerById, useStickers, type Sticker } from '../game/stickers';
import { FRIEND_STICKERS, hasGuide, useGuide } from '../game/guide';
import { useGame } from '../game/store';

/** One round sticker. Not found yet: a grey shadow of it, so kids can see what's still to do. */
export function StickerFace({ sticker, got = true, size = 64 }: { sticker: Sticker; got?: boolean; size?: number }) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center rounded-full border-4 shadow-md ${got ? 'border-white' : 'border-white/20'}`}
      style={{ width: size, height: size, background: got ? sticker.color : 'rgba(255,255,255,0.08)' }}
      data-sticker={sticker.id}
      data-got={got}
    >
      <span className="emoji leading-none" style={{ fontSize: size * 0.52, filter: got ? undefined : 'grayscale(1) brightness(0.35)', opacity: got ? 1 : 0.55 }}>
        {sticker.icon}
      </span>
      {sticker.badge && (
        <span className="emoji absolute -right-1 -top-1 leading-none" style={{ fontSize: size * 0.3, filter: got ? undefined : 'grayscale(1) brightness(0.35)', opacity: got ? 1 : 0.55 }}>
          {sticker.badge}
        </span>
      )}
    </div>
  );
}

export function AlbumIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4.5A1.5 1.5 0 015.5 3H19v15H5.5A1.5 1.5 0 004 19.5z" />
      <path d="M4 19.5A1.5 1.5 0 005.5 21H19v-3" />
      <path d="M11.5 7.2l1.1 2.2 2.4.3-1.8 1.7.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.7 2.4-.3z" fill="currentColor" />
    </svg>
  );
}

/** A new sticker: it slaps onto the screen, then flies off into the album. */
export function StickerPop({ now }: { now: number }) {
  const last = useStickers((s) => s.last);
  const sticker = last ? stickerById(last.id) : undefined;
  if (!last || !sticker || now - last.at > 2600) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center" data-testid="sticker-pop">
      <div key={`${last.id}-${last.at}`} className="animate-sticker">
        <StickerFace sticker={sticker} size={180} />
      </div>
    </div>
  );
}

/** How many stickers per row in the album (fixed, so a controller can move up and down). */
const COLS = 6;
const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  KeyD: [1, 0],
  KeyW: [0, -1],
  KeyS: [0, 1]
};
const PICK_KEYS = new Set(['Enter', 'Space', 'NumpadEnter', 'KeyK', 'Numpad0']);
const CLOSE_KEYS = new Set(['Escape', 'Backspace', 'KeyB', 'Numpad4']);

/**
 * The sticker album, big and picture-only. Move around it (D-pad, stick, arrow keys or a tap),
 * pick a sticker you haven't got to be shown where to earn it; B (or Esc, or a tap outside)
 * closes it.
 */
export function StickerAlbum() {
  const got = useStickers((s) => s.got);
  const setAlbumOpen = useGame((s) => s.setAlbumOpen);
  const [focus, setFocus] = useState(() => Math.max(0, STICKERS.findIndex((s) => !got.includes(s.id))));
  const [nope, setNope] = useState<string | null>(null);
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const grid = useRef<HTMLDivElement>(null);
  // keep the highlighted sticker in view on small screens (controller or keyboard moving)
  useEffect(() => {
    grid.current?.querySelector('[data-focused="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [focus]);

  const pick = useCallback(
    (i: number) => {
      const s = STICKERS[i];
      if (!s) return;
      if (useStickers.getState().got.includes(s.id)) return setAlbumOpen(false);
      if (!hasGuide(s.id)) {
        // nowhere in particular to go for this one (a party, a photo...): a little shake
        setNope(s.id);
        window.setTimeout(() => setNope(null), 450);
        return;
      }
      useGuide.getState().start(s.id);
      setAlbumOpen(false);
    },
    [setAlbumOpen]
  );

  useEffect(() => {
    const move = (dx: number, dy: number) =>
      setFocus((f) => {
        const next = f + dx + dy * COLS;
        return next < 0 || next >= STICKERS.length ? f : next;
      });
    const offNav = onUiNav((nav) => {
      if (nav === 'back') setAlbumOpen(false);
      else if (nav === 'confirm') pick(focusRef.current);
      else move(nav === 'left' ? -1 : nav === 'right' ? 1 : 0, nav === 'up' ? -1 : nav === 'down' ? 1 : 0);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (MOVE_KEYS[e.code]) move(...MOVE_KEYS[e.code]);
      else if (PICK_KEYS.has(e.code)) pick(focusRef.current);
      else if (CLOSE_KEYS.has(e.code)) setAlbumOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      offNav();
      window.removeEventListener('keydown', onKey);
    };
  }, [setAlbumOpen, pick]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3" onClick={() => setAlbumOpen(false)} data-testid="sticker-album">
      <div className="max-h-full w-full max-w-3xl overflow-auto rounded-[2rem] border-8 border-amber-300 bg-amber-50 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-center gap-3 text-amber-700">
          <AlbumIcon size={40} />
          <span className="flex flex-wrap gap-1" aria-label={`${got.length} of ${STICKERS.length}`}>
            {STICKERS.map((s) => (
              <span key={s.id} className={`h-2.5 w-2.5 rounded-full ${got.includes(s.id) ? 'bg-amber-500' : 'bg-amber-200'}`} />
            ))}
          </span>
        </div>
        <div ref={grid} className="grid place-items-center gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
          {STICKERS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => {
                setFocus(i);
                pick(i);
              }}
              className={`relative rounded-full p-1 transition-transform ${i === focus ? 'scale-110 ring-4 ring-amber-400' : ''} ${nope === s.id ? 'animate-wiggle' : ''}`}
              data-focused={i === focus}
              title={s.id}
            >
              <StickerFace sticker={s} got={got.includes(s.id)} size={64} />
              {FRIEND_STICKERS.includes(s.id) && (
                <span className="emoji absolute -bottom-1 -left-1 rounded-full bg-white px-0.5 text-base leading-none shadow" title="needs a friend">
                  👫
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The sticker being looked for (tap it to stop looking). */
export function GuideBadge() {
  const sticker = useGuide((s) => s.sticker);
  const s = sticker ? stickerById(sticker) : undefined;
  if (!s) return null;
  return (
    <button className="pointer-events-auto animate-breathe" onClick={() => useGuide.getState().stop()} data-testid="guide-badge" title="Stop looking">
      <StickerFace sticker={s} size={52} />
    </button>
  );
}
