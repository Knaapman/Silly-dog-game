import { RigidBody } from '@react-three/rapier';

export function Rock({ position, scale = 1 }: { position: [number, number, number], scale?: number }) {
  return (
    <RigidBody type="fixed" position={position} colliders="hull">
      <mesh castShadow receiveShadow position={[0, scale * 0.4, 0]} rotation={[Math.random(), Math.random(), Math.random()]}>
        <dodecahedronGeometry args={[scale, 0]} />
        <meshStandardMaterial color="#7f8c8d" roughness={0.8} />
      </mesh>
    </RigidBody>
  );
}
