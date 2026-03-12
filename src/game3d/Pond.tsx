import * as THREE from 'three';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

export function Pond({ position, radius = 8 }: { position: [number, number, number], radius?: number }) {
  const waterRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (waterRef.current) {
      const t = clock.elapsedTime;
      const material = waterRef.current.material as THREE.MeshStandardMaterial;
      // Simulate slight water movement by shifting the normal map or just animating color slightly
      // Here we just do a simple color pulse for a stylized look
      material.color.setHSL(0.55, 0.8, 0.5 + Math.sin(t * 2) * 0.05);
    }
  });

  return (
    <group position={position}>
      {/* Water */}
      <mesh ref={waterRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <circleGeometry args={[radius, 32]} />
        <meshStandardMaterial color="#4fc3f7" roughness={0.1} metalness={0.8} transparent opacity={0.8} />
      </mesh>
      
      {/* Pond Bottom (gives depth) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <circleGeometry args={[radius, 32]} />
        <meshStandardMaterial color="#1a4b6e" roughness={1} />
      </mesh>

      {/* Stone Border */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
        <ringGeometry args={[radius, radius + 0.8, 32]} />
        <meshStandardMaterial color="#78909c" roughness={0.9} />
      </mesh>
      
      {/* Lilypads */}
      <group position={[radius * 0.4, 0.025, radius * 0.3]} rotation={[0, Math.PI / 4, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.6, 16, 0, Math.PI * 1.8]} />
          <meshStandardMaterial color="#4caf50" />
        </mesh>
      </group>
      <group position={[-radius * 0.5, 0.025, radius * 0.2]} rotation={[0, Math.PI / 2, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.8, 16, 0, Math.PI * 1.8]} />
          <meshStandardMaterial color="#4caf50" />
        </mesh>
      </group>
      <group position={[radius * 0.2, 0.025, -radius * 0.6]} rotation={[0, -Math.PI / 3, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.5, 16, 0, Math.PI * 1.8]} />
          <meshStandardMaterial color="#4caf50" />
        </mesh>
      </group>
    </group>
  );
}
