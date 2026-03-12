import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function DigSpot({ position, active }: { position: [number, number, number], active: boolean }) {
  const group = useRef<THREE.Group>(null);
  
  useFrame(({ clock }) => {
    if (group.current && active) {
      group.current.rotation.y = clock.elapsedTime * 2;
      group.current.position.y = Math.sin(clock.elapsedTime * 5) * 0.1 + 0.1;
    }
  });

  if (!active) {
    return (
      <group position={position}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <circleGeometry args={[0.8, 16]} />
          <meshStandardMaterial color="#3e2723" /> {/* Dark brown hole */}
        </mesh>
      </group>
    );
  }

  return (
    <group position={position}>
      {/* Subtle dirt patch, barely visible */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.8, 16]} />
        <meshStandardMaterial color="#556b2f" opacity={0.4} transparent={true} />
      </mesh>
    </group>
  );
}
