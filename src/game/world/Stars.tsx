import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playCollect } from '../audio';
import { burstConfetti, emit, ring } from '../fx';
import { GOLDEN_STARS } from '../layout';
import { players, shakeCamera } from '../runtime';
import { useGame } from '../store';
import { gameClock, useGameFrame } from '../clock';

let starGeometry: THREE.ExtrudeGeometry | null = null;
export function getStarGeometry() {
  if (starGeometry) return starGeometry;
  const shape = new THREE.Shape();
  for (let i = 0; i <= 10; i += 1) {
    const r = i % 2 === 0 ? 0.62 : 0.28;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  starGeometry = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2 });
  starGeometry.center();
  return starGeometry;
}

let starMaterial: THREE.MeshStandardMaterial | null = null;
export function getStarMaterial() {
  if (!starMaterial) {
    starMaterial = new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb300', emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.3 });
  }
  return starMaterial;
}

const probe = new THREE.Vector3();

/** Collects star `index` if any player touches `pos`. */
function checkCollect(index: number, pos: THREE.Vector3) {
  const state = useGame.getState();
  if (state.phase !== 'play' || state.stars[index]) return;
  players.forEach((p) => {
    if (useGame.getState().stars[index]) return;
    probe.copy(p.position);
    probe.y += 0.3;
    if (probe.distanceTo(pos) < 1.7) {
      useGame.getState().collectStar(index, p.slot);
      emit('star', pos, { count: 26, color: ['#ffd23f', '#fff3a8', '#ffffff'], speed: 7, up: 6 });
      burstConfetti(pos, 50);
      ring(pos, { color: '#ffd23f', radius: 3, duration: 0.5 });
      playCollect(pos);
      shakeCamera(0.3);
    }
  });
}

/**
 * One golden star. `getPosition` lets moving things (the train) carry a star; otherwise it
 * floats at `position`.
 */
export function GoldenStar({ index, position, getPosition }: { index: number; position?: THREE.Vector3; getPosition?: (out: THREE.Vector3) => void }) {
  const collected = useGame((s) => s.stars[index]);
  const group = useRef<THREE.Group>(null);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const sparkle = useRef(Math.random() * 0.3);

  useGameFrame((_, delta) => {
    const g = group.current;
    if (!g || collected) return;
    const t = gameClock.time;
    if (getPosition) getPosition(pos);
    else if (position) pos.copy(position);
    pos.y += Math.sin(t * 2 + index) * 0.18;
    g.position.copy(pos);
    g.rotation.y = t * 2 + index;
    sparkle.current -= delta;
    if (sparkle.current <= 0) {
      sparkle.current = 0.3;
      emit('star', pos, { count: 1, color: ['#fff3a8', '#ffffff'], speed: 1.2, up: 1, gravity: 0.5, size: 0.1, life: 0.8, spread: 0.6 });
    }
    checkCollect(index, pos);
  });

  if (collected) return null;
  return (
    <group ref={group}>
      <mesh castShadow geometry={getStarGeometry()} material={getStarMaterial()} />
      {/* light beam so kids can spot stars from far away */}
      <mesh position={[0, 8, 0]}>
        <cylinderGeometry args={[0.35, 0.6, 16, 12, 1, true]} />
        <meshBasicMaterial color="#fff3a8" transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export function GoldenStars() {
  return (
    <>
      {GOLDEN_STARS.map((p, i) =>
        p === 'train' ? null : <GoldenStar key={i} index={i} position={new THREE.Vector3(p[0], p[1], p[2])} />
      )}
    </>
  );
}
