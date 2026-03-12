import { RigidBody } from '@react-three/rapier';

export function Poop({ position }: { position: [number, number, number] }) {
  return (
    <RigidBody position={position} colliders="ball" friction={1} linearDamping={1}>
      <group>
        <mesh castShadow>
          <coneGeometry args={[0.15, 0.2]} />
          <meshStandardMaterial color="#3e2723" />
        </mesh>
        <mesh position={[0, -0.1, 0]} castShadow>
          <sphereGeometry args={[0.15]} />
          <meshStandardMaterial color="#3e2723" />
        </mesh>
      </group>
    </RigidBody>
  );
}
