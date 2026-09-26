import { BallCollider, CuboidCollider, RigidBody } from '@react-three/rapier';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playBonk } from '../audio';
import { gameClock, gameNow, useGameFrame } from '../clock';
import { PARTY_POINTS, type HatId } from '../config';
import { burstConfetti } from '../fx';
import { distXZ, HAT_RACK } from '../layout';
import { lambert } from '../materials';
import { Hat } from '../player/Hat';
import { HAT_UNLOCKS, isHatUnlocked, useProgress } from '../progress';
import { players } from '../runtime';
import { useGame } from '../store';
import { useHint } from './common';
import { getStarGeometry, getStarMaterial } from './Stars';
import { earnSticker } from '../stickers';

// Every hat the stars can unlock, on its own wooden head. Walk into one to wear it. Hats that
// are still locked are dark shadows with a little golden star: find more stars!

const HAT_SCALE = 2.1;
const WOOD = '#b7793f';
const SILHOUETTE = new THREE.MeshLambertMaterial({ color: '#2b2f3a' });

export function pegPosition(i: number): [number, number, number] {
  const [cx, cz] = HAT_RACK.center;
  return [cx + (i - (HAT_UNLOCKS.length - 1) / 2) * HAT_RACK.spacing, HAT_RACK.headHeight, cz];
}

function RackHat({ hat, unlocked }: { hat: HatId; unlocked: boolean }) {
  const group = useRef<THREE.Group>(null);
  // Locked hats become a flat dark shadow of themselves.
  useLayoutEffect(() => {
    group.current?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!unlocked) {
        mesh.userData.material ??= mesh.material;
        mesh.material = SILHOUETTE;
      } else if (mesh.userData.material) mesh.material = mesh.userData.material;
    });
  }, [unlocked]);
  return (
    <group ref={group} scale={HAT_SCALE}>
      <Hat hat={hat} />
    </group>
  );
}

export function HatRack() {
  const starsEver = useProgress((s) => s.starsEver);
  const heads = useRef<(THREE.Group | null)[]>([]);
  const lockStars = useRef<(THREE.Mesh | null)[]>([]);
  const wiggle = useRef<number[]>(HAT_UNLOCKS.map(() => 0));
  const cooldown = useRef(new Map<string, number>());
  const pegs = useMemo(() => HAT_UNLOCKS.map((_, i) => pegPosition(i)), []);
  const [cx, cz] = HAT_RACK.center;
  const width = (HAT_UNLOCKS.length - 1) * HAT_RACK.spacing + 1;
  useHint([cx, 2.6, cz], 'walk', 4);

  useGameFrame((_, dt) => {
    const t = gameClock.time;
    const now = gameNow();
    players.forEach((p) => {
      if (p.position.y > HAT_RACK.headHeight + 2) return;
      // the nearest head within reach (the shelf keeps you ~0.7 m away)
      let i = -1;
      let best = 0.95;
      pegs.forEach(([x, , z], k) => {
        const d = distXZ(p.position.x, p.position.z, x, z);
        if (d < best) {
          best = d;
          i = k;
        }
      });
      if (i < 0) return;
      const { hat } = HAT_UNLOCKS[i];
      const [x, y, z] = pegs[i];
      const key = `${p.slot}:${i}`;
      if ((cooldown.current.get(key) ?? 0) > now) return;
      cooldown.current.set(key, now + 1500);
      if (!isHatUnlocked(hat)) {
        // not yet: the shadow wobbles "nuh-uh"
        wiggle.current[i] = 1;
        playBonk(p.position, 0.7);
        return;
      }
      const player = useGame.getState().players.find((q) => q.slot === p.slot);
      if (!player || player.hat === hat) return;
      useGame.getState().setHat(p.slot, hat);
      earnSticker('hat');
      useGame.getState().addParty(PARTY_POINTS.hat);
      burstConfetti([x, y + 0.8, z], 24, 4);
    });
    heads.current.forEach((g, i) => {
      if (!g) return;
      wiggle.current[i] = Math.max(0, wiggle.current[i] - dt * 2);
      const w = wiggle.current[i];
      g.rotation.z = Math.sin(t * 30) * 0.3 * w;
      // unlocked hats bob a little so they look alive
      g.position.y = HAT_RACK.headHeight + 0.22 + (isHatUnlocked(HAT_UNLOCKS[i].hat, starsEver) ? Math.sin(t * 2 + i) * 0.04 : 0);
    });
    lockStars.current.forEach((m, i) => {
      if (!m) return;
      m.rotation.y = t * 1.5 + i;
    });
  });

  return (
    <group>
      <RigidBody type="fixed" colliders={false} position={[cx, 0, cz]}>
        {/* the shelf the heads stand on */}
        <CuboidCollider args={[width / 2, 0.3, 0.3]} position={[0, 0.3, -0.1]} />
        {pegs.map((p, i) => (
          <BallCollider key={i} args={[0.28]} position={[p[0] - cx, p[1], 0]} />
        ))}
      </RigidBody>
      <mesh castShadow receiveShadow position={[cx, 0.3, cz - 0.1]} material={lambert(WOOD)}>
        <boxGeometry args={[width, 0.6, 0.6]} />
      </mesh>
      <mesh position={[cx, 0.62, cz - 0.1]} material={lambert('#ec4899')}>
        <boxGeometry args={[width + 0.1, 0.06, 0.66]} />
      </mesh>
      {pegs.map((p, i) => {
        const { hat, stars } = HAT_UNLOCKS[i];
        const unlocked = starsEver >= stars;
        return (
          <group key={hat}>
            {/* a little wooden stick and a round wooden head */}
            <mesh castShadow position={[p[0], (p[1] + 0.6) / 2, p[2]]} material={lambert('#8a5a2b')}>
              <cylinderGeometry args={[0.05, 0.06, p[1] - 0.6, 8]} />
            </mesh>
            <mesh castShadow position={p} material={lambert('#f0d2a8')}>
              <sphereGeometry args={[0.24, 16, 12]} />
            </mesh>
            <group
              ref={(g) => {
                heads.current[i] = g;
              }}
              position={[p[0], p[1] + 0.22, p[2]]}
            >
              <RackHat hat={hat} unlocked={unlocked} />
            </group>
            {!unlocked && (
              <mesh
                ref={(m) => {
                  lockStars.current[i] = m;
                }}
                geometry={getStarGeometry()}
                material={getStarMaterial()}
                position={[p[0], p[1] + 1.35, p[2]]}
                scale={0.35}
              />
            )}
          </group>
        );
      })}
    </group>
  );
}
