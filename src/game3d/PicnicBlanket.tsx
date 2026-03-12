import { RigidBody } from '@react-three/rapier';

export function PicnicBlanket({ position }: { position: [number, number, number] }) {
  return (
    <RigidBody type="fixed" position={position} colliders="cuboid">
      <mesh receiveShadow position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6, 6]} />
        <meshStandardMaterial color="#cc4444" />
      </mesh>
      {/* Checkerboard pattern approximation */}
      <mesh receiveShadow position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5.8, 5.8]} />
        <meshStandardMaterial color="#ffffff" wireframe />
      </mesh>
      {/* Basket */}
      <mesh castShadow position={[2, 0.5, 2]}>
        <boxGeometry args={[1, 1, 1.5]} />
        <meshStandardMaterial color="#d4a373" />
      </mesh>
    </RigidBody>
  );
}
