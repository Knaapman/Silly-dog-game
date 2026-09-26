import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import type { HatId } from '../config';
import { lambert } from '../materials';

// Hats sit on an anchor at the top of the head (y = 0 is the scalp).

function Propeller() {
  const blades = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (blades.current) blades.current.rotation.y += delta * 18;
  });
  return (
    <group>
      <mesh castShadow material={lambert('#ff4d5e')} position={[0, 0.02, 0]}>
        <sphereGeometry args={[0.17, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh material={lambert('#ffd23f')} position={[0, 0.02, 0]} rotation={[0, Math.PI / 4, 0]}>
        <sphereGeometry args={[0.171, 14, 8, 0, Math.PI / 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh material={lambert('#3b82f6')} position={[0, 0.02, 0]} rotation={[0, Math.PI + Math.PI / 4, 0]}>
        <sphereGeometry args={[0.171, 14, 8, 0, Math.PI / 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh material={lambert('#555555')} position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.1, 6]} />
      </mesh>
      <group ref={blades} position={[0, 0.29, 0]}>
        <mesh material={lambert('#22c55e')} position={[0.14, 0, 0]} rotation={[0.3, 0, 0]}>
          <boxGeometry args={[0.26, 0.015, 0.07]} />
        </mesh>
        <mesh material={lambert('#a855f7')} position={[-0.14, 0, 0]} rotation={[-0.3, 0, 0]}>
          <boxGeometry args={[0.26, 0.015, 0.07]} />
        </mesh>
      </group>
    </group>
  );
}

export function Hat({ hat }: { hat: HatId }) {
  switch (hat) {
    case 'none':
      return null;
    case 'party':
      return (
        <group rotation={[0, 0, 0.15]}>
          <mesh castShadow material={lambert('#a855f7')} position={[0, 0.18, 0]}>
            <coneGeometry args={[0.14, 0.38, 14]} />
          </mesh>
          <mesh material={lambert('#ffd23f')} position={[0, 0.1, 0]}>
            <torusGeometry args={[0.105, 0.02, 6, 16]} />
          </mesh>
          <mesh material={lambert('#ff8fd8')} position={[0, 0.39, 0]}>
            <sphereGeometry args={[0.06, 10, 8]} />
          </mesh>
        </group>
      );
    case 'crown':
      return (
        <group position={[0, 0.02, 0]}>
          <mesh castShadow material={lambert('#f5c542')} position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.16, 0.15, 0.12, 16, 1, true]} />
          </mesh>
          {Array.from({ length: 6 }).map((_, i) => {
            const a = (i / 6) * Math.PI * 2;
            return (
              <mesh key={i} material={lambert('#f5c542')} position={[Math.cos(a) * 0.15, 0.16, Math.sin(a) * 0.15]}>
                <coneGeometry args={[0.035, 0.1, 5]} />
              </mesh>
            );
          })}
          <mesh material={lambert('#ff4d5e')} position={[0, 0.07, 0.155]}>
            <sphereGeometry args={[0.03, 8, 6]} />
          </mesh>
          <mesh material={lambert('#3b82f6')} position={[0.11, 0.07, 0.11]}>
            <sphereGeometry args={[0.025, 8, 6]} />
          </mesh>
        </group>
      );
    case 'tophat':
      return (
        <group>
          <mesh castShadow material={lambert('#222222')} position={[0, 0.015, 0]}>
            <cylinderGeometry args={[0.25, 0.25, 0.03, 20]} />
          </mesh>
          <mesh castShadow material={lambert('#222222')} position={[0, 0.19, 0]}>
            <cylinderGeometry args={[0.15, 0.14, 0.33, 18]} />
          </mesh>
          <mesh material={lambert('#ff4d5e')} position={[0, 0.07, 0]}>
            <cylinderGeometry args={[0.145, 0.145, 0.05, 18]} />
          </mesh>
        </group>
      );
    case 'propeller':
      return <Propeller />;
    case 'flower':
      return (
        <group position={[0.12, 0.02, 0.05]} rotation={[0.3, 0, -0.5]}>
          {Array.from({ length: 5 }).map((_, i) => {
            const a = (i / 5) * Math.PI * 2;
            return (
              <mesh key={i} material={lambert('#ff8fd8')} position={[Math.cos(a) * 0.08, 0.02, Math.sin(a) * 0.08]} scale={[1, 0.4, 1]}>
                <sphereGeometry args={[0.065, 10, 8]} />
              </mesh>
            );
          })}
          <mesh material={lambert('#ffd23f')} position={[0, 0.04, 0]}>
            <sphereGeometry args={[0.05, 10, 8]} />
          </mesh>
        </group>
      );
    case 'cowboy':
      return (
        <group>
          <mesh castShadow material={lambert('#9a6232')} position={[0, 0.02, 0]} scale={[1, 0.25, 1]}>
            <torusGeometry args={[0.23, 0.07, 8, 20]} />
          </mesh>
          <mesh material={lambert('#9a6232')} position={[0, 0.01, 0]}>
            <cylinderGeometry args={[0.25, 0.25, 0.02, 20]} />
          </mesh>
          <mesh castShadow material={lambert('#9a6232')} position={[0, 0.11, 0]} scale={[1, 1, 0.85]}>
            <cylinderGeometry args={[0.12, 0.15, 0.2, 16]} />
          </mesh>
          <mesh material={lambert('#5a3515')} position={[0, 0.05, 0]}>
            <cylinderGeometry args={[0.152, 0.152, 0.04, 16]} />
          </mesh>
        </group>
      );
    case 'duck':
      return (
        <group position={[0, 0.02, 0]}>
          <mesh castShadow material={lambert('#ffd23f')} position={[0, 0.09, 0]} scale={[1, 0.8, 1.2]}>
            <sphereGeometry args={[0.12, 12, 10]} />
          </mesh>
          <mesh castShadow material={lambert('#ffd23f')} position={[0, 0.22, 0.08]}>
            <sphereGeometry args={[0.08, 12, 10]} />
          </mesh>
          <mesh material={lambert('#ff8a1f')} position={[0, 0.21, 0.17]} scale={[1, 0.4, 1]}>
            <sphereGeometry args={[0.045, 8, 6]} />
          </mesh>
          {[-1, 1].map((sx) => (
            <mesh key={sx} material={lambert('#111111')} position={[sx * 0.04, 0.25, 0.14]}>
              <sphereGeometry args={[0.015, 6, 4]} />
            </mesh>
          ))}
        </group>
      );
  }
}
