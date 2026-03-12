import { RigidBody } from '@react-three/rapier';

export function Hedge({ position, rotation, length }: { position: [number, number, number], rotation: number, length: number }) {
  return (
    <RigidBody type="fixed" position={position} rotation={[0, rotation, 0]}>
      <mesh castShadow receiveShadow position={[0, 1, 0]}>
        <boxGeometry args={[length, 2, 1.5]} />
        <meshStandardMaterial color="#2d4c1e" roughness={0.9} />
      </mesh>
    </RigidBody>
  );
}
