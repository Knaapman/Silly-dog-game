import { RigidBody } from '@react-three/rapier';
import * as THREE from 'three';

export function Playground() {
  return (
    <group>
      {/* Slide */}
      <group position={[-15, 0, -15]}>
        {/* Stairs */}
        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[0, 0.5, 2]} castShadow receiveShadow>
            <boxGeometry args={[2, 1, 1]} />
            <meshStandardMaterial color="#8B4513" />
          </mesh>
        </RigidBody>
        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[0, 1.5, 3]} castShadow receiveShadow>
            <boxGeometry args={[2, 3, 1]} />
            <meshStandardMaterial color="#8B4513" />
          </mesh>
        </RigidBody>
        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[0, 2.5, 4]} castShadow receiveShadow>
            <boxGeometry args={[2, 5, 1]} />
            <meshStandardMaterial color="#8B4513" />
          </mesh>
        </RigidBody>
        
        {/* Platform */}
        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[0, 3, 5.5]} castShadow receiveShadow>
            <boxGeometry args={[3, 0.5, 2]} />
            <meshStandardMaterial color="#A0522D" />
          </mesh>
        </RigidBody>

        {/* Slide Ramp */}
        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[0, 1.5, 8.5]} rotation={[-Math.PI / 6, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[2, 0.2, 7]} />
            <meshStandardMaterial color="#FF4500" />
          </mesh>
        </RigidBody>
        {/* Slide Walls */}
        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[-1, 1.8, 8.5]} rotation={[-Math.PI / 6, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.2, 0.5, 7]} />
            <meshStandardMaterial color="#FF4500" />
          </mesh>
        </RigidBody>
        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[1, 1.8, 8.5]} rotation={[-Math.PI / 6, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.2, 0.5, 7]} />
            <meshStandardMaterial color="#FF4500" />
          </mesh>
        </RigidBody>
      </group>

      {/* Bridge */}
      <group position={[15, 0, -10]}>
        {/* Ramp Up */}
        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[0, 1, -3]} rotation={[Math.PI / 6, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[3, 0.2, 6]} />
            <meshStandardMaterial color="#CD853F" />
          </mesh>
        </RigidBody>
        
        {/* Flat Bridge part */}
        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[0, 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[3, 0.2, 4]} />
            <meshStandardMaterial color="#CD853F" />
          </mesh>
        </RigidBody>

        {/* Ramp Down */}
        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[0, 1, 3]} rotation={[-Math.PI / 6, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[3, 0.2, 6]} />
            <meshStandardMaterial color="#CD853F" />
          </mesh>
        </RigidBody>
      </group>

      {/* Tunnel */}
      <group position={[0, 0, -20]}>
        <RigidBody type="fixed" colliders="trimesh">
          <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[2, 2, 6, 16, 1, true, 0, Math.PI]} />
            <meshStandardMaterial color="#4169E1" side={THREE.DoubleSide} /> {/* DoubleSide */}
          </mesh>
        </RigidBody>
      </group>

      {/* Stepping Stones */}
      <group position={[-10, 0, 15]}>
        {[0, 1, 2, 3, 4].map((i) => (
          <RigidBody key={i} type="fixed" colliders="hull">
            <mesh position={[i * 2.5, 0.2 + i * 0.2, Math.sin(i) * 2]} castShadow receiveShadow>
              <cylinderGeometry args={[1, 1.2, 0.4 + i * 0.4]} />
              <meshStandardMaterial color="#808080" />
            </mesh>
          </RigidBody>
        ))}
      </group>

      {/* Trampoline */}
      <group position={[10, 0, 15]}>
        {/* Base */}
        <RigidBody type="fixed" colliders="hull">
          <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[3, 3, 0.5, 16]} />
            <meshStandardMaterial color="#2F4F4F" />
          </mesh>
        </RigidBody>
        {/* Bouncy Surface */}
        <RigidBody type="fixed" colliders="hull" restitution={2.5}>
          <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[2.8, 2.8, 0.1, 16]} />
            <meshStandardMaterial color="#000000" />
          </mesh>
        </RigidBody>
      </group>

      {/* Doghouse */}
      <group position={[20, 0, 20]}>
        {/* Base Floor */}
        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[0, 0.1, 0]} castShadow receiveShadow>
            <boxGeometry args={[4, 0.2, 5]} />
            <meshStandardMaterial color="#8B4513" />
          </mesh>
        </RigidBody>
        {/* Left Wall */}
        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[-1.9, 1.2, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.2, 2, 5]} />
            <meshStandardMaterial color="#A0522D" />
          </mesh>
        </RigidBody>
        {/* Right Wall */}
        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[1.9, 1.2, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.2, 2, 5]} />
            <meshStandardMaterial color="#A0522D" />
          </mesh>
        </RigidBody>
        {/* Back Wall */}
        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[0, 1.2, -2.4]} castShadow receiveShadow>
            <boxGeometry args={[4, 2, 0.2]} />
            <meshStandardMaterial color="#A0522D" />
          </mesh>
        </RigidBody>
        {/* Roof Left */}
        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[-1.2, 2.8, 0]} rotation={[0, 0, -Math.PI / 4]} castShadow receiveShadow>
            <boxGeometry args={[3, 0.2, 5.5]} />
            <meshStandardMaterial color="#8B0000" />
          </mesh>
        </RigidBody>
        {/* Roof Right */}
        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[1.2, 2.8, 0]} rotation={[0, 0, Math.PI / 4]} castShadow receiveShadow>
            <boxGeometry args={[3, 0.2, 5.5]} />
            <meshStandardMaterial color="#8B0000" />
          </mesh>
        </RigidBody>
      </group>

      {/* Weave Poles */}
      <group position={[-20, 0, 0]}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <RigidBody key={i} type="fixed" colliders="hull">
            <mesh position={[0, 1.5, i * 2 - 5]} castShadow receiveShadow>
              <cylinderGeometry args={[0.1, 0.1, 3]} />
              <meshStandardMaterial color={i % 2 === 0 ? "#FFD700" : "#FF0000"} />
            </mesh>
          </RigidBody>
        ))}
      </group>
    </group>
  );
}
