import { RigidBody } from '@react-three/rapier';

export function Food({ id, position }: { id: number, position: [number, number, number] }) {
  return (
    <RigidBody type="fixed" position={position} colliders="hull">
      <group>
        {/* Bowl */}
        <mesh position={[0, 0.1, 0]} castShadow>
          <cylinderGeometry args={[0.4, 0.3, 0.2]} />
          <meshStandardMaterial color="#ef5350" />
        </mesh>
        <mesh position={[0, 0.15, 0]}>
          <cylinderGeometry args={[0.35, 0.25, 0.15]} />
          <meshStandardMaterial color="#5d4037" /> {/* Kibble color */}
        </mesh>
      </group>
    </RigidBody>
  );
}
