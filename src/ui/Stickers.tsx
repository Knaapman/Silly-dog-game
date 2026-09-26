import { useEffect } from 'react';
import { onUiNav } from '../game/input';
import { STICKERS, stickerById, useStickers, type Sticker } from '../game/stickers';
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

/** The sticker album, big and picture-only. Any button or tap closes it. */
export function StickerAlbum() {
  const got = useStickers((s) => s.got);
  const setAlbumOpen = useGame((s) => s.setAlbumOpen);
  useEffect(() => {
    const close = () => setAlbumOpen(false);
    const offNav = onUiNav(() => close());
    const onKey = (e: KeyboardEvent) => {
      if (!e.repeat) close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      offNav();
      window.removeEventListener('keydown', onKey);
    };
  }, [setAlbumOpen]);
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3" onClick={() => setAlbumOpen(false)} data-testid="sticker-album">
      <div className="max-h-full w-full max-w-3xl overflow-auto rounded-[2rem] border-8 border-amber-300 bg-amber-50 p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-center gap-3 text-amber-700">
          <AlbumIcon size={40} />
          <span className="flex flex-wrap gap-1" aria-label={`${got.length} of ${STICKERS.length}`}>
            {STICKERS.map((s) => (
              <span key={s.id} className={`h-2.5 w-2.5 rounded-full ${got.includes(s.id) ? 'bg-amber-500' : 'bg-amber-200'}`} />
            ))}
          </span>
        </div>
        <div className="grid grid-cols-5 place-items-center gap-3 sm:grid-cols-6">
          {STICKERS.map((s) => (
            <StickerFace key={s.id} sticker={s} got={got.includes(s.id)} size={72} />
          ))}
        </div>
      </div>
    </div>
  );
}
