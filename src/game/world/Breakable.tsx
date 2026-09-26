import { BallCollider, CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { playCrumble, playPoof } from '../audio';
import { PARTY_POINTS } from '../config';
import { emit, poof } from '../fx';
import type { Vec3 } from '../layout';
import { lambert } from '../materials';
import { registerStatic } from '../runtime';
import { useGame } from '../store';
import { useHint } from './common';

export type Piece = { shape: 'box' | 'ball'; size: number; color: string; offset: Vec3 };

let breakableId = 12000;

/**
 * Something that stands still until you headbutt it, then flies apart into physics pieces
 * and builds itself back up a little later (sandcastles, snowmen...).
 */
export function Breakable({
  position,
  radius,
  height,
  pieces,
  dust,
  children,
  respawnMs = 14000
}: {
  position: Vec3;
  radius: number;
  height: number;
  pieces: Piece[];
  dust: string[];
  children: ReactNode;
  respawnMs?: number;
}) {
  const id = useMemo(() => breakableId++, []);
  const [broken, setBroken] = useState<{ at: number; velocities: { v: Vec3; w: Vec3 }[] } | null>(null);
  const brokenRef = useRef(false);
  const resetToken = useGame((s) => s.resetToken);
  const center = useMemo(() => new THREE.Vector3(position[0], position[1] + height / 2, position[2]), [position, height]);
  useHint([position[0], position[1] + height, position[2]], 'bonk', 4);

  useEffect(
    () =>
      registerStatic({
        id,
        position: center,
        radius,
        onBonk: (_slot, dir) => {
          if (brokenRef.current) return;
          brokenRef.current = true;
          setBroken({
            at: performance.now(),
            velocities: pieces.map((p) => {
              const spread = new THREE.Vector3(p.offset[0], 0, p.offset[2]).normalize().multiplyScalar(3);
              return {
                v: [dir.x * 6 + spread.x + (Math.random() - 0.5) * 3, 5 + Math.random() * 4, dir.z * 6 + spread.z + (Math.random() - 0.5) * 3] as Vec3,
                w: [Math.random() * 8, Math.random() * 8, Math.random() * 8] as Vec3
              };
            })
          });
          playCrumble(center);
          emit('puff', center, { count: 14, color: dust, speed: 3, up: 2, size: 0.4 });
          useGame.getState().addParty(PARTY_POINTS.splat);
        }
      }),
    [id, center, radius, dust, pieces]
  );

  useEffect(() => {
    if (!broken) return;
    const t = window.setTimeout(() => {
      brokenRef.current = false;
      setBroken(null);
      poof(center, dust[0], 12);
      playPoof(center);
    }, respawnMs);
    return () => window.clearTimeout(t);
  }, [broken, center, dust, respawnMs]);

  const lastReset = useRef(resetToken);
  useEffect(() => {
    if (lastReset.current === resetToken) return;
    lastReset.current = resetToken;
    brokenRef.current = false;
    setBroken(null);
  }, [resetToken]);

  if (broken) {
    return (
      <group>
        {pieces.map((p, i) => {
          return (
            <RigidBody
              key={`${broken.at}-${i}`}
              position={[position[0] + p.offset[0], position[1] + p.offset[1], position[2] + p.offset[2]]}
              linearVelocity={broken.velocities[i].v}
              angularVelocity={broken.velocities[i].w}
              colliders={false}
            >
              {p.shape === 'box' ? <CuboidCollider args={[p.size / 2, p.size / 2, p.size / 2]} density={0.4} /> : <BallCollider args={[p.size]} density={0.4} />}
              <mesh castShadow material={lambert(p.color)}>
                {p.shape === 'box' ? <boxGeometry args={[p.size, p.size, p.size]} /> : <sphereGeometry args={[p.size, 12, 10]} />}
              </mesh>
            </RigidBody>
          );
        })}
      </group>
    );
  }

  return (
    <group position={position}>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[height / 2, radius]} position={[0, height / 2, 0]} />
      </RigidBody>
      {children}
    </group>
  );
}
