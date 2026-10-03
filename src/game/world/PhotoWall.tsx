import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { playTwinkle } from '../audio';
import { useGameFrame } from '../clock';
import { emit } from '../fx';
import { MESA, PHOTO_WALL } from '../layout';
import { lambert } from '../materials';
import { usePhotos } from '../photo';
import { debugInfo } from '../runtime';
import { groundHeight } from '../terrain';
import { useSeeThrough } from './seeThrough';

// The photo wall on the mesa's south face, looking out over the plaza: the last five photos from
// the camera button in big wooden frames, the newest on the left. A frame still waiting for a
// photo shows a camera, so the children know what goes there; a new photo arrives with a twinkle.

const [W, H] = PHOTO_WALL.size;
const BORDER = 0.16;

/** What an empty frame shows: a camera on cream paper. */
function emptyTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = Math.round((256 * H) / W);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f3ead8';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalAlpha = 0.55;
  ctx.font = '96px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('📷', c.width / 2, c.height / 2 + 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

type Loaded = { tex: THREE.Texture; aspect: number };

export function PhotoWall() {
  const photos = usePhotos((s) => s.photos);
  const latest = usePhotos((s) => s.latest);
  const ids = photos
    .slice(-PHOTO_WALL.frames)
    .reverse()
    .map((p) => p.id);
  const key = ids.join(',');
  const loaded = useRef(new Map<number, Loaded>());
  const [, bump] = useState(0);
  const empty = useMemo(() => emptyTexture(), []);
  const pictures = useRef<(THREE.Mesh | null)[]>([]);
  const boards = useRef<(THREE.Mesh | null)[]>([]);
  const whole = useRef<THREE.Group>(null);
  useSeeThrough(whole, MESA.center[0], MESA.center[1], MESA.halfLength + 2);
  const info = useRef({ shown: [] as number[], loaded: 0, arrivals: 0 });
  debugInfo.photoWall = info.current;
  const y = groundHeight(PHOTO_WALL.x, PHOTO_WALL.z + 1) + PHOTO_WALL.y;
  const frameX = (k: number) => PHOTO_WALL.x + (k - (PHOTO_WALL.frames - 1) / 2) * PHOTO_WALL.spacing;
  const latestId = latest?.photo.id ?? null;

  // load the photos on show (and let go of ones that have moved off the end)
  useEffect(() => {
    const keep = new Set(ids);
    for (const [id, l] of loaded.current) {
      if (keep.has(id)) continue;
      l.tex.dispose();
      loaded.current.delete(id);
    }
    let live = true;
    for (const p of photos) {
      if (!keep.has(p.id) || loaded.current.has(p.id)) continue;
      const img = new Image();
      img.onload = () => {
        if (!live || !keep.has(p.id)) return;
        const tex = new THREE.Texture(img);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        loaded.current.set(p.id, { tex, aspect: img.width / Math.max(1, img.height) });
        info.current.loaded = loaded.current.size;
        // the one just taken: up it goes, with a twinkle
        if (p.id === latestId) {
          info.current.arrivals += 1;
          const at: [number, number, number] = [frameX(0), y, PHOTO_WALL.z + 0.3];
          emit('star', at, { count: 16, color: ['#ffd23f', '#ffffff', '#ff8fd8'], speed: 3, up: 1.5 });
          playTwinkle(at, 1.2);
        }
        bump((n) => n + 1);
      };
      img.src = p.url;
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(
    () => () => {
      loaded.current.forEach((l) => l.tex.dispose());
      loaded.current.clear();
    },
    []
  );

  // each frame: its photo (or the camera), sized to the photo's shape. (Through the meshes'
  // own materials: the see-through swaps in copies of them.)
  useGameFrame(() => {
    info.current.shown = ids.filter((id) => loaded.current.has(id));
    for (let k = 0; k < PHOTO_WALL.frames; k += 1) {
      const pic = pictures.current[k];
      const board = boards.current[k];
      if (!pic || !board) continue;
      const l = ids[k] != null ? loaded.current.get(ids[k]) : undefined;
      const mat = pic.material as THREE.MeshBasicMaterial;
      const want = l?.tex ?? empty;
      if (mat.map !== want) {
        mat.map = want;
        mat.needsUpdate = true;
      }
      const aspect = l?.aspect ?? W / H;
      const w = aspect > W / H ? W : H * aspect;
      const h = aspect > W / H ? W / aspect : H;
      pic.scale.set(w, h, 1);
      board.scale.set(w + BORDER * 2, h + BORDER * 2, 1);
    }
  });

  return (
    <group ref={whole}>
      {Array.from({ length: PHOTO_WALL.frames }, (_, k) => (
        <group key={k} position={[frameX(k), y, PHOTO_WALL.z]}>
          {/* the wooden frame: a board behind the picture */}
          <mesh
            ref={(m) => {
              boards.current[k] = m;
            }}
            castShadow
            position={[0, 0, 0.06]}
            material={lambert('#8d5a36')}
          >
            <boxGeometry args={[1, 1, 0.1]} />
          </mesh>
          <mesh
            ref={(m) => {
              pictures.current[k] = m;
            }}
            position={[0, 0, 0.115]}
          >
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial map={empty} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
