import * as THREE from 'three';
import { RigidBody } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';

export function Zwemmeer({ position }: { position: [number, number, number] }) {
  const waterRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (waterRef.current) {
      const t = clock.elapsedTime;
      const material = waterRef.current.material as THREE.MeshStandardMaterial;
      material.color.setHSL(0.55, 0.8, 0.5 + Math.sin(t * 2) * 0.05);
    }
  });

  return (
    <group position={position}>
      {/* Main Water Body */}
      <mesh ref={waterRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <circleGeometry args={[25, 64]} />
        <meshStandardMaterial color="#4fc3f7" roughness={0.1} metalness={0.8} transparent opacity={0.8} />
      </mesh>
      
      {/* Pond Bottom */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <circleGeometry args={[25, 64]} />
        <meshStandardMaterial color="#1a4b6e" roughness={1} />
      </mesh>

      {/* Sand Beach (Hinderstrand) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
        <ringGeometry args={[25, 30, 64]} />
        <meshStandardMaterial color="#e6c280" roughness={0.9} />
      </mesh>

      {/* Central Island */}
      <RigidBody type="fixed" colliders="trimesh">
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} receiveShadow castShadow>
          <circleGeometry args={[8, 32]} />
          <meshStandardMaterial color="#689f38" roughness={0.8} />
        </mesh>
      </RigidBody>

      {/* Bridges to Island */}
      <group position={[-12, 0, 0]}>
        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[0, 0.5, 0]} receiveShadow castShadow>
            <boxGeometry args={[10, 0.2, 3]} />
            <meshStandardMaterial color="#8b4513" />
          </mesh>
        </RigidBody>
      </group>
      <group position={[12, 0, 0]}>
        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[0, 0.5, 0]} receiveShadow castShadow>
            <boxGeometry args={[10, 0.2, 3]} />
            <meshStandardMaterial color="#8b4513" />
          </mesh>
        </RigidBody>
      </group>

      {/* Slide into water */}
      <group position={[0, 0, 15]} rotation={[0, Math.PI, 0]}>
        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[0, 2, -4]} receiveShadow castShadow>
            <boxGeometry args={[2, 4, 2]} />
            <meshStandardMaterial color="#ff9900" />
          </mesh>
        </RigidBody>
        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[0, 1, 0]} rotation={[-Math.PI / 6, 0, 0]} receiveShadow castShadow>
            <boxGeometry args={[2, 0.2, 8]} />
            <meshStandardMaterial color="#4444ff" />
          </mesh>
        </RigidBody>
      </group>
    </group>
  );
}

export function AgilityCourse({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Sand Base */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[40, 30]} />
        <meshStandardMaterial color="#e6c280" roughness={0.9} />
      </mesh>

      {/* Tunnel */}
      <RigidBody type="fixed" colliders="trimesh">
        <mesh position={[-10, 1.5, -5]} rotation={[0, Math.PI / 4, 0]} receiveShadow castShadow>
          <cylinderGeometry args={[2, 2, 8, 16, 1, true, 0, Math.PI]} />
          <meshStandardMaterial color="#ff4444" side={THREE.DoubleSide} />
        </mesh>
      </RigidBody>

      {/* A-Frame Ramp */}
      <group position={[10, 0, -5]}>
        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[0, 1.5, 2]} rotation={[-Math.PI / 4, 0, 0]} receiveShadow castShadow>
            <boxGeometry args={[3, 0.2, 6]} />
            <meshStandardMaterial color="#deb887" />
          </mesh>
        </RigidBody>
        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[0, 1.5, -2]} rotation={[Math.PI / 4, 0, 0]} receiveShadow castShadow>
            <boxGeometry args={[3, 0.2, 6]} />
            <meshStandardMaterial color="#deb887" />
          </mesh>
        </RigidBody>
      </group>

      {/* Ball Pit */}
      <group position={[0, 0, 8]}>
        <RigidBody type="fixed" colliders="cuboid">
          <mesh position={[0, 0.5, 0]} receiveShadow castShadow>
            <boxGeometry args={[8, 1, 8]} />
            <meshStandardMaterial color="#8b4513" />
          </mesh>
        </RigidBody>
        <mesh position={[0, 1.01, 0]} receiveShadow>
          <boxGeometry args={[7.6, 0.1, 7.6]} />
          <meshStandardMaterial color="#ff00ff" />
        </mesh>
      </group>
    </group>
  );
}

export function Graafduinen({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Big Sand Pit */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <circleGeometry args={[20, 32]} />
        <meshStandardMaterial color="#d2b48c" roughness={1} />
      </mesh>
      
      {/* Climbing Wall */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[-10, 3, -5]} rotation={[0, Math.PI / 6, 0]} receiveShadow castShadow>
          <boxGeometry args={[12, 6, 2]} />
          <meshStandardMaterial color="#808080" />
        </mesh>
      </RigidBody>
    </group>
  );
}

export function Snuffeltuin({ position }: { position: [number, number, number] }) {
  // A simple hedge maze
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#556b2f" roughness={0.9} />
      </mesh>
      
      {/* Hedges */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, 1, -10]} receiveShadow castShadow>
          <boxGeometry args={[20, 2, 1]} />
          <meshStandardMaterial color="#228b22" />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[-10, 1, 0]} receiveShadow castShadow>
          <boxGeometry args={[1, 2, 20]} />
          <meshStandardMaterial color="#228b22" />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[5, 1, 0]} receiveShadow castShadow>
          <boxGeometry args={[1, 2, 10]} />
          <meshStandardMaterial color="#228b22" />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, 1, 5]} receiveShadow castShadow>
          <boxGeometry args={[10, 2, 1]} />
          <meshStandardMaterial color="#228b22" />
        </mesh>
      </RigidBody>
    </group>
  );
}

export function GezondheidsCentrum({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[40, 20]} />
        <meshStandardMaterial color="#a0a0a0" roughness={0.8} />
      </mesh>
      
      {/* Hydrotherapy Pool */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-10, 0.03, 0]} receiveShadow>
        <circleGeometry args={[6, 32]} />
        <meshStandardMaterial color="#00bcd4" roughness={0.2} metalness={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-10, 0.04, 0]} receiveShadow>
        <ringGeometry args={[6, 6.5, 32]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>

      {/* Massage Tent */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[5, 2, -5]} receiveShadow castShadow>
          <boxGeometry args={[8, 4, 6]} />
          <meshStandardMaterial color="#f5f5dc" />
        </mesh>
      </RigidBody>
      <mesh position={[5, 4.5, -5]} rotation={[0, 0, 0]} receiveShadow castShadow>
        <coneGeometry args={[5, 2, 4]} />
        <meshStandardMaterial color="#f5f5dc" />
      </mesh>

      {/* Dog Hotel */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[15, 2, 0]} receiveShadow castShadow>
          <boxGeometry args={[8, 4, 12]} />
          <meshStandardMaterial color="#d2b48c" />
        </mesh>
      </RigidBody>
    </group>
  );
}

export function WereldwijdeWandeling({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[40, 20]} />
        <meshStandardMaterial color="#8fbc8f" roughness={0.9} />
      </mesh>

      {/* Eiffel Tower Miniature */}
      <RigidBody type="fixed" colliders="hull">
        <group position={[-10, 0, 0]}>
          <mesh position={[0, 2, 0]} castShadow>
            <cylinderGeometry args={[0.1, 2, 4, 4]} />
            <meshStandardMaterial color="#708090" wireframe />
          </mesh>
        </group>
      </RigidBody>

      {/* Pyramid Miniature */}
      <RigidBody type="fixed" colliders="hull">
        <mesh position={[0, 1.5, 0]} castShadow>
          <cylinderGeometry args={[0, 3, 3, 4]} />
          <meshStandardMaterial color="#eedd82" />
        </mesh>
      </RigidBody>

      {/* Pagoda Miniature */}
      <RigidBody type="fixed" colliders="hull">
        <group position={[10, 0, 0]}>
          <mesh position={[0, 1, 0]} castShadow>
            <boxGeometry args={[2, 2, 2]} />
            <meshStandardMaterial color="#cd5c5c" />
          </mesh>
          <mesh position={[0, 2.5, 0]} castShadow>
            <coneGeometry args={[2.5, 1, 4]} />
            <meshStandardMaterial color="#2f4f4f" />
          </mesh>
          <mesh position={[0, 3.5, 0]} castShadow>
            <boxGeometry args={[1.5, 1, 1.5]} />
            <meshStandardMaterial color="#cd5c5c" />
          </mesh>
          <mesh position={[0, 4.5, 0]} castShadow>
            <coneGeometry args={[2, 1, 4]} />
            <meshStandardMaterial color="#2f4f4f" />
          </mesh>
        </group>
      </RigidBody>
    </group>
  );
}

export function InnovatiePark({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[30, 20]} />
        <meshStandardMaterial color="#b0c4de" roughness={0.7} />
      </mesh>

      {/* Drone Pad */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-5, 0.03, 0]} receiveShadow>
        <circleGeometry args={[4, 32]} />
        <meshStandardMaterial color="#778899" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-5, 0.04, 0]} receiveShadow>
        <ringGeometry args={[3.5, 4, 32]} />
        <meshStandardMaterial color="#ffd700" />
      </mesh>

      {/* Paw Print Scanner */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[8, 0.5, 0]} receiveShadow castShadow>
          <boxGeometry args={[6, 1, 6]} />
          <meshStandardMaterial color="#4682b4" />
        </mesh>
      </RigidBody>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[8, 1.01, 0]} receiveShadow>
        <planeGeometry args={[4, 4]} />
        <meshStandardMaterial color="#00fa9a" />
      </mesh>
    </group>
  );
}

export function Bezoekerscentrum({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, 3, 0]} receiveShadow castShadow>
          <boxGeometry args={[16, 6, 10]} />
          <meshStandardMaterial color="#8fbc8f" />
        </mesh>
      </RigidBody>
      <mesh position={[0, 7.5, 0]} rotation={[0, 0, 0]} receiveShadow castShadow>
        <coneGeometry args={[12, 3, 4]} />
        <meshStandardMaterial color="#708090" />
      </mesh>
    </group>
  );
}

export function EntranceGate({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[-4, 3, 0]} receiveShadow castShadow>
          <boxGeometry args={[1, 6, 1]} />
          <meshStandardMaterial color="#8b4513" />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[4, 3, 0]} receiveShadow castShadow>
          <boxGeometry args={[1, 6, 1]} />
          <meshStandardMaterial color="#8b4513" />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders="cuboid">
        <mesh position={[0, 6.5, 0]} receiveShadow castShadow>
          <boxGeometry args={[10, 1.5, 1]} />
          <meshStandardMaterial color="#deb887" />
        </mesh>
      </RigidBody>
    </group>
  );
}
