import { useFrame } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useRef } from 'react';
import * as THREE from 'three';
import { emit } from '../fx';
import { FOUNTAIN, GEYSERS, type Vec3 } from '../layout';
import { lambert } from '../materials';
import { Geyser } from './Launchers';
import { HatBox, RedButton } from './Toys';

function Fountain() {
  const [cx, cz] = FOUNTAIN.center;
  const r = FOUNTAIN.basinRadius;
  const water = useRef<THREE.Mesh>(null);
  const drip = useRef(0);
  const segments = 20;
  useFrame(({ clock }, delta) => {
    const m = water.current?.material as THREE.MeshStandardMaterial | undefined;
    if (m) m.color.setHSL(0.55, 0.8, 0.62 + Math.sin(clock.elapsedTime * 2) * 0.03);
    drip.current -= delta;
    if (drip.current <= 0) {
      drip.current = 0.05;
      const a = Math.random() * Math.PI * 2;
      emit('drop', [cx + Math.cos(a) * 0.3, FOUNTAIN.topHeight + 0.9, cz + Math.sin(a) * 0.3], {
        count: 1,
        color: ['#bfe9ff', '#ffffff'],
        speed: 2.2,
        up: 3,
        size: 0.09,
        life: 1.2
      });
    }
  });
  return (
    <group>
      {/* low rim you can hop over */}
      <RigidBody type="fixed" colliders={false} position={[cx, 0, cz]}>
        {Array.from({ length: segments }, (_, i) => {
          const a = (i / segments) * Math.PI * 2;
          const len = (2 * Math.PI * (r + 0.3)) / segments + 0.05;
          return (
            <CuboidCollider
              key={i}
              args={[len / 2, 0.15, 0.3]}
              position={[Math.cos(a) * (r + 0.3), 0.15, Math.sin(a) * (r + 0.3)]}
              rotation={[0, -a + Math.PI / 2, 0]}
            />
          );
        })}
        {/* tiers: stand on them, the top one is where the geysers throw you */}
        <CylinderCollider args={[0.8, 0.9]} position={[0, 0.8, 0]} />
        <CylinderCollider args={[0.12, 2.5]} position={[0, 1.72, 0]} />
        <CylinderCollider args={[0.8, 0.45]} position={[0, 2.5, 0]} />
        <CylinderCollider args={[0.1, 1.4]} position={[0, FOUNTAIN.topHeight - 0.1, 0]} />
      </RigidBody>
      <mesh receiveShadow position={[cx, 0.15, cz]} rotation={[Math.PI / 2, 0, 0]} material={lambert('#d7ccc8')}>
        <torusGeometry args={[r + 0.3, 0.3, 8, 40]} />
      </mesh>
      <mesh ref={water} receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.12, cz]}>
        <circleGeometry args={[r + 0.1, 40]} />
        <meshStandardMaterial color="#4fc3f7" roughness={0.15} metalness={0.1} />
      </mesh>
      <group position={[cx, 0, cz]}>
        <mesh castShadow position={[0, 0.8, 0]} material={lambert('#e0d6cc')}>
          <cylinderGeometry args={[0.7, 0.9, 1.6, 16]} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 1.72, 0]} material={lambert('#e0d6cc')}>
          <cylinderGeometry args={[2.6, 1.8, 0.35, 28]} />
        </mesh>
        <mesh position={[0, 1.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[2.35, 28]} />
          <meshStandardMaterial color="#7fd3ff" roughness={0.15} />
        </mesh>
        <mesh castShadow position={[0, 2.5, 0]} material={lambert('#e0d6cc')}>
          <cylinderGeometry args={[0.35, 0.45, 1.6, 12]} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, FOUNTAIN.topHeight - 0.1, 0]} material={lambert('#e0d6cc')}>
          <cylinderGeometry args={[1.5, 1.0, 0.3, 24]} />
        </mesh>
        <mesh position={[0, FOUNTAIN.topHeight + 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.3, 24]} />
          <meshStandardMaterial color="#7fd3ff" roughness={0.15} />
        </mesh>
        <mesh position={[0, FOUNTAIN.topHeight + 0.45, 0]} material={lambert('#ffd23f')}>
          <sphereGeometry args={[0.25, 12, 10]} />
        </mesh>
      </group>
    </group>
  );
}

function LampPost({ position }: { position: Vec3 }) {
  return (
    <group position={position}>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[1.6, 0.12]} position={[0, 1.6, 0]} />
      </RigidBody>
      <mesh castShadow position={[0, 1.6, 0]} material={lambert('#37474f')}>
        <cylinderGeometry args={[0.08, 0.12, 3.2, 8]} />
      </mesh>
      <mesh position={[0, 3.35, 0]}>
        <sphereGeometry args={[0.3, 12, 10]} />
        <meshBasicMaterial color="#fff6c9" />
      </mesh>
    </group>
  );
}

export function Hub() {
  const top: Vec3 = [FOUNTAIN.center[0], FOUNTAIN.topHeight, FOUNTAIN.center[1]];
  return (
    <group>
      <Fountain />
      {GEYSERS.map((g, i) => (
        <Geyser key={i} at={g} target={top} apex={FOUNTAIN.topHeight + 5.5} period={5} offset={i * 1.66} />
      ))}
      <HatBox />
      <RedButton />
      {[
        [-11, 0, 3],
        [11, 0, 3],
        [-6, 0, -12],
        [6, 0, -12]
      ].map((p, i) => (
        <LampPost key={i} position={p as Vec3} />
      ))}
    </group>
  );
}
