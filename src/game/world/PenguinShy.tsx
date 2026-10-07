import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playBell, playCheer, playSqueak, playSquawk } from '../audio';
import { gameNow, useGameFrame } from '../clock';
import { PARTY_POINTS } from '../config';
import { burstConfetti, emit, ring } from '../fx';
import { PENGUIN_SHY } from '../layout';
import { lambert } from '../materials';
import { debugInfo, players, registerStatic } from '../runtime';
import { earnSticker } from '../stickers';
import { useGame } from '../store';
import { groundHeight } from '../terrain';
import { StaticBox } from './common';

// The penguin shy on the mountain top: five little penguins stand on a wooden counter facing the
// snow piles. Throw snowballs at them: a hit from a few steps away knocks one off backwards with a
// squawk (bump one up close and it only wobbles: this is a throwing game). Knock all five off for a
// cheer and a party (and a sticker); then they hop back up one after the other.

/** A penguin only falls for a hit from at least this far away (m): closer, it just wobbles. */
const THROW_FROM = 2.6;
/** All down: back up after this long (s); some down and nobody throwing: back up after a while. */
const BACK_ALL = 3;
const BACK_SOME = 12;
const BACK_GAP = 0.25;

type Penguin = { down: boolean; fall: number; wobble: number; upAt: number };

export function PenguinShy() {
  const [cx, cz] = PENGUIN_SHY.center;
  const g = groundHeight(cx, cz);
  const top = g + PENGUIN_SHY.height;
  const zs = useMemo(() => Array.from({ length: PENGUIN_SHY.count }, (_, i) => cz + (i - (PENGUIN_SHY.count - 1) / 2) * PENGUIN_SHY.spacing), [cz]);
  const st = useRef({ list: zs.map((): Penguin => ({ down: false, fall: 0, wobble: 0, upAt: 0 })), hits: 0, wobbles: 0, rounds: 0, lastHit: 0 });
  debugInfo.penguins = st.current;
  const groups = useRef<(THREE.Group | null)[]>([]);

  useEffect(() => {
    const offs = zs.map((z, i) =>
      registerStatic({
        id: 9900 + i,
        position: new THREE.Vector3(cx, top + 0.35, z),
        radius: 0.35,
        onBonk: (slot) => {
          const s = st.current;
          const p = s.list[i];
          if (p.down) return;
          const who = players.get(slot);
          const near = who ? Math.hypot(who.position.x - cx, who.position.z - z) < THROW_FROM : true;
          if (near) {
            // up close: a wobble and an indignant squeak
            p.wobble = 1;
            s.wobbles += 1;
            playSqueak([cx, top + 0.4, z]);
            return;
          }
          p.down = true;
          p.fall = 0;
          s.hits += 1;
          s.lastHit = gameNow();
          playSquawk([cx, top + 0.4, z]);
          emit('star', [cx, top + 0.6, z], { count: 10, color: ['#ffd23f', '#ffffff', '#38bdf8'], speed: 3, up: 2.5 });
          if (s.list.every((q) => q.down)) {
            s.rounds += 1;
            playCheer();
            playBell([cx, top + 1, cz]);
            burstConfetti([cx, top + 1.2, cz], 50, 6);
            ring([cx, g + 0.1, cz], { color: '#ffd23f', radius: 4, duration: 0.8 });
            useGame.getState().addParty(PARTY_POINTS.goal);
            earnSticker('penguins');
            const now = gameNow();
            s.list.forEach((q, k) => (q.upAt = now + (BACK_ALL + k * BACK_GAP) * 1000));
          }
        }
      })
    );
    return () => offs.forEach((off) => off());
  }, [zs, cx, top, g, cz]);

  useGameFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const s = st.current;
    const now = gameNow();
    // some knocked off and nobody throwing for a while: they climb back up anyway
    if (!s.list.every((q) => q.down) && s.list.some((q) => q.down && q.upAt === 0) && now - s.lastHit > BACK_SOME * 1000) {
      let k = 0;
      s.list.forEach((q) => {
        if (q.down && q.upAt === 0) q.upAt = now + k++ * BACK_GAP * 1000;
      });
    }
    s.list.forEach((p, i) => {
      if (p.down) {
        p.fall = Math.min(1, p.fall + dt * 4);
        if (p.upAt > 0 && now >= p.upAt) {
          p.down = false;
          p.upAt = 0;
          playSqueak([cx, top + 0.4, zs[i]]);
        }
      } else p.fall = Math.max(0, p.fall - dt * 3);
      p.wobble = Math.max(0, p.wobble - dt * 1.8);
      const gr = groups.current[i];
      if (gr) {
        // tipped over backwards off the counter (away from the throwers, to the east) and down onto
        // the snow behind it, or wobbling
        const back = Math.min(1, p.fall * 2);
        const drop = Math.max(0, p.fall * 2 - 1);
        gr.rotation.z = -p.fall * 1.6 + Math.sin(now / 45) * 0.25 * p.wobble;
        gr.position.set(cx + back * 0.75, top - drop * (PENGUIN_SHY.height - 0.2), zs[i]);
      }
    });
  });

  const length = PENGUIN_SHY.count * PENGUIN_SHY.spacing + 0.6;
  return (
    <group>
      {/* the counter, with a striped front (no board behind it: an animal that fell in between got stuck) */}
      <StaticBox position={[cx, g + PENGUIN_SHY.height / 2, cz]} size={[0.9, PENGUIN_SHY.height, length]} color="#b7793f" />
      {Array.from({ length: 6 }, (_, k) => (
        <mesh key={k} position={[cx - 0.46, g + PENGUIN_SHY.height / 2, cz + (k - 2.5) * (length / 6)]} material={lambert(k % 2 ? '#ffffff' : '#ef4444')}>
          <boxGeometry args={[0.02, PENGUIN_SHY.height * 0.9, length / 6]} />
        </mesh>
      ))}
      {zs.map((z, i) => (
        <group
          key={i}
          ref={(gr) => {
            groups.current[i] = gr;
          }}
          position={[cx, top, z]}
        >
          {/* a little penguin, looking west at the throwers */}
          <mesh castShadow position={[0, 0.32, 0]} scale={[1, 1.35, 1]} material={lambert('#1e293b')}>
            <sphereGeometry args={[0.24, 14, 10]} />
          </mesh>
          <mesh position={[-0.12, 0.3, 0]} scale={[0.6, 1.15, 0.85]} material={lambert('#ffffff')}>
            <sphereGeometry args={[0.22, 12, 9]} />
          </mesh>
          <mesh position={[-0.27, 0.48, 0]} rotation={[0, 0, Math.PI / 2]} material={lambert('#f97316')}>
            <coneGeometry args={[0.05, 0.12, 6]} />
          </mesh>
          {[-1, 1].map((sd) => (
            <mesh key={sd} position={[-0.2, 0.55, sd * 0.08]} material={lambert('#111111')}>
              <sphereGeometry args={[0.03, 6, 5]} />
            </mesh>
          ))}
          {[-1, 1].map((sd) => (
            <mesh key={`f${sd}`} position={[-0.05, 0.02, sd * 0.09]} material={lambert('#f97316')}>
              <boxGeometry args={[0.14, 0.04, 0.08]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
