import { RigidBody } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

export function Tree({ position }: { position: [number, number, number] }) {
  const leavesRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (leavesRef.current) {
      const t = state.clock.elapsedTime;
      // Use position to offset the animation so trees don't sway in unison
      const offset = position[0] + position[2];
      leavesRef.current.rotation.x = Math.sin(t + offset) * 0.05;
      leavesRef.current.rotation.z = Math.cos(t * 0.8 + offset) * 0.05;
    }
  });

  return (
    <RigidBody type="fixed" position={position} colliders="hull">
      <group>
        <mesh position={[0, 1, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.4, 2]} />
          <meshStandardMaterial color="#8b4513" />
        </mesh>
        <group ref={leavesRef}>
          <mesh position={[0, 2.5, 0]} castShadow>
            <sphereGeometry args={[1.5]} />
            <meshStandardMaterial color="#228b22" />
          </mesh>
          <mesh position={[-0.5, 3, 0.5]} castShadow>
            <sphereGeometry args={[1.2]} />
            <meshStandardMaterial color="#32cd32" />
          </mesh>
          <mesh position={[0.5, 2.8, -0.5]} castShadow>
            <sphereGeometry args={[1.3]} />
            <meshStandardMaterial color="#228b22" />
          </mesh>
        </group>
      </group>
    </RigidBody>
  );
}
