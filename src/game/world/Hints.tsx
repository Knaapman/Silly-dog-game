import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { hints, players, type Hint } from '../runtime';
import { gameClock, useGameFrame } from '../clock';

// Floating "press this button" bubbles above interactive things when a player is near.
// Colour + position match the controller face buttons, so no reading is needed.

const STYLE: Record<Hint['action'], { color: string; icon: string }> = {
  jump: { color: '#22c55e', icon: 'arrow' },
  bonk: { color: '#ff4d5e', icon: '💥' },
  lick: { color: '#3b82f6', icon: '👅' },
  noise: { color: '#fbbf24', icon: '📣' },
  flop: { color: '#a855f7', icon: '🌀' },
  poop: { color: '#8d5a36', icon: '💩' },
  walk: { color: '#ffffff', icon: '⬇️' }
};

const textures = new Map<Hint['action'], THREE.Texture>();

function hintTexture(action: Hint['action']) {
  let tex = textures.get(action);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const { color, icon } = STYLE[action];
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = action === 'walk' ? '#ffb020' : '#ffffff';
  ctx.stroke();
  if (icon === 'arrow') {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(64, 96);
    ctx.lineTo(64, 34);
    ctx.moveTo(38, 58);
    ctx.lineTo(64, 32);
    ctx.lineTo(90, 58);
    ctx.stroke();
  } else {
    ctx.font = '64px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, 64, 70);
  }
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  textures.set(action, tex);
  return tex;
}

const POOL = 12;

export function Hints() {
  const sprites = useRef<(THREE.Sprite | null)[]>([]);
  const fades = useMemo(() => new Map<number, number>(), []);
  const materials = useMemo(
    () => Array.from({ length: POOL }, () => new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false })),
    []
  );

  useGameFrame((_, delta) => {
    const t = gameClock.time;
    // Which hints have a player nearby?
    hints.forEach((h) => {
      let near = false;
      players.forEach((p) => {
        if (!near && !p.bot && !p.isLaunched() && p.position.distanceTo(h.position) < h.radius) near = true;
      });
      const f = fades.get(h.id) ?? 0;
      const next = THREE.MathUtils.clamp(f + (near ? delta * 4 : -delta * 3), 0, 1);
      if (next > 0) fades.set(h.id, next);
      else fades.delete(h.id);
    });
    let i = 0;
    fades.forEach((f, id) => {
      const h = hints.get(id);
      const s = sprites.current[i];
      if (!h || !s || i >= POOL) return;
      const m = materials[i];
      const tex = hintTexture(h.action);
      if (m.map !== tex) {
        m.map = tex;
        m.needsUpdate = true;
      }
      m.opacity = f;
      s.visible = true;
      s.position.set(h.position.x, h.position.y + 1.6 + Math.sin(t * 4 + id) * 0.15, h.position.z);
      s.scale.setScalar(1.1 * (0.6 + f * 0.4));
      i += 1;
    });
    for (; i < POOL; i += 1) {
      const s = sprites.current[i];
      if (s) s.visible = false;
    }
  });

  return (
    <group>
      {materials.map((m, i) => (
        <sprite
          key={i}
          ref={(s) => {
            sprites.current[i] = s;
          }}
          material={m}
          visible={false}
          renderOrder={10}
        />
      ))}
    </group>
  );
}
