import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playCollect, playTwinkle } from '../audio';
import { gameClock, gameNow, useGameFrame } from '../clock';
import { burstConfetti, emit, ring } from '../fx';
import { rumble, type SourceId } from '../input';
import { TREASURE_CHEST } from '../layout';
import { lambert } from '../materials';
import { players, shakeCamera } from '../runtime';
import { TREASURE_COLORS, TREASURES, treasurePosition, useHunt } from '../hunt';
import { earnSticker } from '../stickers';
import { useGame } from '../store';
import { groundHeight } from '../terrain';

// The treasure hunt in the park: a gem over a little mound with an X on it, in five places at
// a time. No beam of light like the stars: they're hidden. They twinkle now and then, and when
// you're close you can hear them ("ting... ting.ting.ting"), faster the closer you get.

/** How close you have to be to hear a treasure (metres). */
const HEAR = 14;
/** A dog that barked this recently and then finds a treasure sniffed it out (ms). */
const SNIFF_MEMORY = 30000;

const gemGeometry = new THREE.OctahedronGeometry(0.3, 0);
const gemMaterials = TREASURE_COLORS.map(
  (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.45, metalness: 0.2, roughness: 0.15, flatShading: true })
);

const probe = new THREE.Vector3();

function Treasure({ index }: { index: number }) {
  const spot = useHunt((s) => s.spots[index]);
  const found = useHunt((s) => s.found[index]);
  const gem = useRef<THREE.Mesh>(null);
  // (a new round moves it)
  const pos = useMemo(() => (spot ? treasurePosition(index, new THREE.Vector3()) : new THREE.Vector3()), [index, spot]);
  const twinkle = useRef(0.4 + index * 0.37);

  useGameFrame((_, delta) => {
    if (found || !gem.current) return;
    const t = gameClock.time;
    gem.current.position.y = 0.75 + Math.sin(t * 2.2 + index) * 0.1;
    gem.current.rotation.y = t * 1.6 + index;
    twinkle.current -= delta;
    if (twinkle.current <= 0) {
      twinkle.current = 1.3;
      emit('star', [pos.x, pos.y + 0.9, pos.z], { count: 3, color: [TREASURE_COLORS[index], '#ffffff'], speed: 1.4, up: 1.4, gravity: 0.4, size: 0.12, life: 0.9, spread: 0.3 });
    }
    if (useGame.getState().phase !== 'play') return;
    players.forEach((p) => {
      if (useHunt.getState().found[index] || p.asleep) return;
      probe.copy(p.position);
      if (Math.hypot(probe.x - pos.x, probe.z - pos.z) > 1.4 || Math.abs(probe.y - pos.y - 0.6) > 1.8) return;
      useHunt.getState().find(index);
      const at: [number, number, number] = [pos.x, pos.y + 0.8, pos.z];
      emit('star', at, { count: 22, color: [TREASURE_COLORS[index], '#ffffff', '#ffd23f'], speed: 6, up: 6 });
      burstConfetti(at, 30);
      ring([pos.x, pos.y + 0.1, pos.z], { color: TREASURE_COLORS[index], radius: 2.5, duration: 0.5 });
      playCollect(at);
      shakeCamera(0.2);
      rumble(p.source as SourceId, 0.5, 0.7, 250);
      p.hop(6);
      const me = useGame.getState().players.find((x) => x.slot === p.slot);
      if (me?.species === 'dog' && gameNow() - p.noiseAt < SNIFF_MEMORY) earnSticker('sniff');
    });
  });

  if (found) return null;
  return (
    <group position={pos.toArray()}>
      <mesh ref={gem} geometry={gemGeometry} material={gemMaterials[index]} scale={[1, 1.35, 1]} castShadow />
      {/* a little mound of fresh earth, and X marks the spot */}
      <mesh position={[0, 0.02, 0]} scale={[1, 0.28, 1]} material={lambert('#8d6e4c')}>
        <sphereGeometry args={[0.55, 12, 8]} />
      </mesh>
      {[Math.PI / 4, -Math.PI / 4].map((a) => (
        <mesh key={a} position={[0, 0.17, 0]} rotation={[0, a, 0]} material={lambert('#c62828')}>
          <boxGeometry args={[0.9, 0.04, 0.14]} />
        </mesh>
      ))}
    </group>
  );
}

/** Ting... ting... the nearest hidden treasure to anyone, faster as they get closer. */
function TreasureChime() {
  const timer = useRef(0);
  const at = useMemo(() => new THREE.Vector3(), []);
  const near = useMemo(() => new THREE.Vector3(), []);
  useGameFrame((_, delta) => {
    if (useGame.getState().phase !== 'play') return;
    const { found } = useHunt.getState();
    let best = Infinity;
    for (let i = 0; i < TREASURES; i += 1) {
      if (found[i]) continue;
      treasurePosition(i, at);
      players.forEach((p) => {
        if (p.asleep) return;
        const d = Math.hypot(p.position.x - at.x, p.position.z - at.z);
        if (d < best) {
          best = d;
          near.copy(at);
        }
      });
    }
    timer.current -= delta;
    if (best > HEAR || timer.current > 0) return;
    const k = best / HEAR;
    timer.current = 0.28 + k * 1.3;
    playTwinkle([near.x, near.y + 0.8, near.z], 1.25 - k * 0.3);
  });
  return null;
}

/** The chest by the plaza: a gem for every round of the hunt ever finished. */
function TreasureChest() {
  const chest = useHunt((s) => s.chest);
  const [x, z] = TREASURE_CHEST.position;
  const y = useMemo(() => groundHeight(x, z), [x, z]);
  const shown = Math.min(chest, 45);
  const gems = useMemo(
    () =>
      Array.from({ length: shown }, (_, i) => {
        const layer = Math.floor(i / 15);
        const k = i % 15;
        const col = k % 5;
        const row = Math.floor(k / 5);
        return { pos: [-0.56 + col * 0.28 + (layer % 2) * 0.1, 0.62 + layer * 0.17, -0.26 + row * 0.26] as [number, number, number], m: gemMaterials[i % gemMaterials.length], yaw: i * 1.3 };
      }),
    [shown]
  );
  // a new gem in the chest: sparkles
  const last = useRef(chest);
  useEffect(() => {
    if (chest > last.current) {
      emit('star', [x, y + 1.4, z], { count: 30, color: ['#ffd23f', '#ffffff', ...TREASURE_COLORS], speed: 5, up: 6 });
      ring([x, y + 0.1, z], { color: '#ffd23f', radius: 3, duration: 0.6 });
    }
    last.current = chest;
  }, [chest, x, y, z]);

  const wood = lambert('#8d5a36');
  const gold = lambert('#ffd23f');
  return (
    <group position={[x, y, z]} rotation={[0, TREASURE_CHEST.yaw, 0]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[0.85, 0.45, 0.5]} position={[0, 0.45, 0]} />
      </RigidBody>
      {/* box (open at the top), gold bands */}
      <mesh position={[0, 0.3, 0]} material={wood} castShadow receiveShadow>
        <boxGeometry args={[1.7, 0.6, 1]} />
      </mesh>
      {[-0.86, 0.86].map((dx) => (
        <mesh key={dx} position={[dx * 0.5, 0.31, 0]} material={gold}>
          <boxGeometry args={[0.1, 0.62, 1.02]} />
        </mesh>
      ))}
      <mesh position={[0, 0.61, 0]} material={lambert('#5d3a22')}>
        <boxGeometry args={[1.6, 0.04, 0.9]} />
      </mesh>
      {/* the lid, flung open backwards */}
      <group position={[0, 0.62, -0.5]} rotation={[-1.9, 0, 0]}>
        <mesh position={[0, 0, 0.5]} material={wood} castShadow>
          <boxGeometry args={[1.7, 0.12, 1]} />
        </mesh>
        <mesh position={[0, 0.07, 0.5]} material={gold}>
          <boxGeometry args={[0.18, 0.02, 1.02]} />
        </mesh>
      </group>
      {gems.map((g, i) => (
        <mesh key={i} geometry={gemGeometry} material={g.m} position={g.pos} rotation={[0.3, g.yaw, 0]} scale={0.55} />
      ))}
    </group>
  );
}

export function Treasures() {
  return (
    <>
      {Array.from({ length: TREASURES }, (_, i) => (
        <Treasure key={i} index={i} />
      ))}
      <TreasureChime />
      <TreasureChest />
    </>
  );
}
