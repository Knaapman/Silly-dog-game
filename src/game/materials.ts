import * as THREE from 'three';

// Shared matte "toy" materials. Lambert is cheap enough for older tablets.
const cache = new Map<string, THREE.MeshLambertMaterial>();

export function lambert(color: string) {
  let m = cache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    cache.set(color, m);
  }
  return m;
}

const basicCache = new Map<string, THREE.MeshBasicMaterial>();

export function basic(color: string) {
  let m = basicCache.get(color);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color });
    basicCache.set(color, m);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Procedural canvas textures (no image downloads)

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void, repeat = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  return tex;
}

const textures = new Map<string, THREE.Texture>();

function memo(key: string, make: () => THREE.Texture) {
  let t = textures.get(key);
  if (!t) {
    t = make();
    textures.set(key, t);
  }
  return t;
}

export const grassTexture = () =>
  memo('grass', () =>
    canvasTexture(
      256,
      (ctx, s) => {
        // mowed-lawn stripes with speckles
        for (let i = 0; i < 4; i += 1) {
          ctx.fillStyle = i % 2 === 0 ? '#79c257' : '#6fb84f';
          ctx.fillRect(0, (i * s) / 4, s, s / 4);
        }
        for (let i = 0; i < 900; i += 1) {
          ctx.fillStyle = Math.random() < 0.5 ? 'rgba(40,110,40,0.25)' : 'rgba(170,230,120,0.25)';
          ctx.fillRect(Math.random() * s, Math.random() * s, 2, 3);
        }
      },
      20
    )
  );

export const crateTexture = () =>
  memo('crate', () =>
    canvasTexture(128, (ctx, s) => {
      ctx.fillStyle = '#d99a4e';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = '#a8672a';
      ctx.lineWidth = 3;
      for (let i = 1; i < 4; i += 1) {
        ctx.beginPath();
        ctx.moveTo(0, (i * s) / 4);
        ctx.lineTo(s, (i * s) / 4);
        ctx.stroke();
      }
      ctx.fillStyle = '#8c5220';
      ctx.fillRect(0, 0, s, 14);
      ctx.fillRect(0, s - 14, s, 14);
      ctx.fillRect(0, 0, 14, s);
      ctx.fillRect(s - 14, 0, 14, s);
      ctx.save();
      ctx.translate(s / 2, s / 2);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-s * 0.7, -7, s * 1.4, 14);
      ctx.restore();
    })
  );

export const beachBallTexture = () =>
  memo('beachball', () =>
    canvasTexture(256, (ctx, s) => {
      const colors = ['#ff4d5e', '#ffffff', '#ffd23f', '#ffffff', '#3b82f6', '#ffffff'];
      colors.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect((i * s) / colors.length, 0, s / colors.length + 1, s);
      });
    })
  );

export const soccerTexture = () =>
  memo('soccer', () =>
    canvasTexture(256, (ctx, s) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#1f2937';
      const spots: [number, number][] = [
        [0.12, 0.2], [0.45, 0.15], [0.8, 0.22], [0.28, 0.55], [0.62, 0.5], [0.95, 0.55], [0.12, 0.85], [0.47, 0.88], [0.8, 0.85]
      ];
      spots.forEach(([x, y]) => {
        ctx.beginPath();
        for (let i = 0; i < 5; i += 1) {
          const a = (i / 5) * Math.PI * 2;
          ctx.lineTo(x * s + Math.cos(a) * 18, y * s + Math.sin(a) * 18);
        }
        ctx.fill();
      });
    })
  );

export const melonTexture = () =>
  memo('melon', () =>
    canvasTexture(256, (ctx, s) => {
      ctx.fillStyle = '#3f9b3a';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#1f6b24';
      for (let i = 0; i < 8; i += 1) {
        const x = (i / 8) * s;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        for (let y = 0; y <= s; y += 16) ctx.lineTo(x + Math.sin(y * 0.08 + i) * 6, y);
        ctx.lineTo(x + 12, s);
        for (let y = s; y >= 0; y -= 16) ctx.lineTo(x + 12 + Math.sin(y * 0.08 + i) * 6, y);
        ctx.fill();
      }
    })
  );

export const hayTexture = () =>
  memo('hay', () =>
    canvasTexture(128, (ctx, s) => {
      ctx.fillStyle = '#e8c35a';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 260; i += 1) {
        ctx.strokeStyle = Math.random() < 0.5 ? '#c9a13b' : '#f7dc84';
        ctx.lineWidth = 1.5;
        const x = Math.random() * s;
        const y = Math.random() * s;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (Math.random() - 0.5) * 6, y + 10 + Math.random() * 10);
        ctx.stroke();
      }
    })
  );

export const barnTexture = () =>
  memo('barn', () =>
    canvasTexture(256, (ctx, s) => {
      ctx.fillStyle = '#d64541';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = '#a8322f';
      ctx.lineWidth = 4;
      for (let i = 0; i < 12; i += 1) {
        ctx.beginPath();
        ctx.moveTo((i * s) / 12, 0);
        ctx.lineTo((i * s) / 12, s);
        ctx.stroke();
      }
    })
  );

export const pathTexture = () =>
  memo('path', () =>
    canvasTexture(
      128,
      (ctx, s) => {
        ctx.fillStyle = '#ecd29a';
        ctx.fillRect(0, 0, s, s);
        for (let i = 0; i < 300; i += 1) {
          ctx.fillStyle = Math.random() < 0.5 ? 'rgba(190,150,90,0.35)' : 'rgba(255,245,210,0.4)';
          ctx.beginPath();
          ctx.arc(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      },
      1
    )
  );

export const tileTexture = (key: string, colors: string[], grout: string, repeat: number) =>
  memo(`tile-${key}`, () =>
    canvasTexture(
      128,
      (ctx, size) => {
        const n = 4;
        const cell = size / n;
        for (let y = 0; y < n; y += 1) {
          for (let x = 0; x < n; x += 1) {
            ctx.fillStyle = colors[(x + y) % colors.length];
            ctx.fillRect(x * cell, y * cell, cell, cell);
          }
        }
        ctx.strokeStyle = grout;
        ctx.lineWidth = 3;
        for (let i = 0; i <= n; i += 1) {
          ctx.beginPath();
          ctx.moveTo(i * cell, 0);
          ctx.lineTo(i * cell, size);
          ctx.moveTo(0, i * cell);
          ctx.lineTo(size, i * cell);
          ctx.stroke();
        }
      },
      repeat
    )
  );

export const speckleTexture = (key: string, base: string, dots: string[], repeat: number) =>
  memo(`speckle-${key}`, () =>
    canvasTexture(
      128,
      (ctx, size) => {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, size, size);
        for (let i = 0; i < 260; i += 1) {
          ctx.fillStyle = dots[i % dots.length];
          ctx.beginPath();
          ctx.arc(Math.random() * size, Math.random() * size, 0.8 + Math.random() * 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      },
      repeat
    )
  );

export const stripeTexture = (key: string, colors: string[], vertical = true) =>
  memo(`stripe-${key}`, () =>
    canvasTexture(128, (ctx, size) => {
      colors.forEach((c, i) => {
        ctx.fillStyle = c;
        if (vertical) ctx.fillRect((i * size) / colors.length, 0, size / colors.length + 1, size);
        else ctx.fillRect(0, (i * size) / colors.length, size, size / colors.length + 1);
      });
    })
  );

const emojiTextures = new Map<string, THREE.Texture>();
/** A round sign face with a big emoji on it (for text-free signposts). */
export function emojiSignTexture(emoji: string, background = '#fff8e1') {
  const key = emoji + background;
  let t = emojiTextures.get(key);
  if (!t) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.arc(64, 64, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '76px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 64, 70);
    t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    emojiTextures.set(key, t);
  }
  return t;
}
