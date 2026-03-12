import { RigidBody } from '@react-three/rapier';

export function Bush({ position }: { position: [number, number, number] }) {
  return (
    <RigidBody type="fixed" position={position} colliders="ball">
      <group position={[0, 0.5, 0]}>
        <mesh castShadow receiveShadow position={[0, 0, 0]}>
          <sphereGeometry args={[0.8, 8, 8]} />
          <meshStandardMaterial color="#3a5f27" roughness={0.9} />
        </mesh>
        <mesh castShadow receiveShadow position={[0.4, -0.2, 0.4]}>
          <sphereGeometry args={[0.5, 8, 8]} />
          <meshStandardMaterial color="#3a5f27" roughness={0.9} />
        </mesh>
        <mesh castShadow receiveShadow position={[-0.4, -0.1, -0.2]}>
          <sphereGeometry args={[0.6, 8, 8]} />
          <meshStandardMaterial color="#3a5f27" roughness={0.9} />
        </mesh>
      </group>
    </RigidBody>
  );
}
