import { RigidBody } from '@react-three/rapier';

export function Bench({ position, rotation = 0 }: { position: [number, number, number], rotation?: number }) {
  return (
    <RigidBody type="fixed" position={position} rotation={[0, rotation, 0]} colliders="hull">
      <group>
        {/* Legs */}
        <mesh position={[-0.8, 0.25, 0.2]} castShadow>
          <boxGeometry args={[0.1, 0.5, 0.1]} />
          <meshStandardMaterial color="#3e2723" />
        </mesh>
        <mesh position={[0.8, 0.25, 0.2]} castShadow>
          <boxGeometry args={[0.1, 0.5, 0.1]} />
          <meshStandardMaterial color="#3e2723" />
        </mesh>
        <mesh position={[-0.8, 0.25, -0.2]} castShadow>
          <boxGeometry args={[0.1, 0.5, 0.1]} />
          <meshStandardMaterial color="#3e2723" />
        </mesh>
        <mesh position={[0.8, 0.25, -0.2]} castShadow>
          <boxGeometry args={[0.1, 0.5, 0.1]} />
          <meshStandardMaterial color="#3e2723" />
        </mesh>
        
        {/* Seat */}
        <mesh position={[0, 0.55, 0]} castShadow>
          <boxGeometry args={[2, 0.1, 0.6]} />
          <meshStandardMaterial color="#5d4037" />
        </mesh>
        
        {/* Backrest */}
        <mesh position={[0, 1, -0.25]} castShadow>
          <boxGeometry args={[2, 0.8, 0.1]} />
          <meshStandardMaterial color="#5d4037" />
        </mesh>
      </group>
    </RigidBody>
  );
}
