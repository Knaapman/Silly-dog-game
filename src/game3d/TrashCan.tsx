import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RapierRigidBody } from '@react-three/rapier';
import { Html } from '@react-three/drei';
import { useGameStore } from './store';
import { playCrashSound } from './audio';
import * as THREE from 'three';

export function TrashCan({ id, position, knocked }: { id: number, position: [number, number, number], knocked: boolean }) {
  const rb = useRef<RapierRigidBody>(null);
  const knockTrashCan = useGameStore(s => s.knockTrashCan);
  const addBone = useGameStore(s => s.addBone);
  const addStar = useGameStore(s => s.addStar);
  const recordObjectiveEvent = useGameStore(s => s.recordObjectiveEvent);
  const hasLooted = useRef(false);
  const [showCrash, setShowCrash] = useState(false);

  useEffect(() => {
    if (!knocked && rb.current) {
      rb.current.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
      rb.current.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      rb.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rb.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
      hasLooted.current = false;
    }
  }, [knocked, position]);

  // We can check if it's knocked over by looking at its rotation
  useFrame(() => {
    if (!rb.current || knocked || hasLooted.current) return;
    const rot = rb.current.rotation();
    const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w));
    
    // If tilted more than 45 degrees
    if (Math.abs(euler.x) > Math.PI / 4 || Math.abs(euler.z) > Math.PI / 4) {
      knockTrashCan(id);
      hasLooted.current = true;
      setShowCrash(true);
      const pos = rb.current.translation();
      playCrashSound({ position: [pos.x, pos.y, pos.z] });
      setTimeout(() => setShowCrash(false), 2000);
      
      // Spawn some loot
      if (Math.random() > 0.5) {
        addBone([pos.x, pos.y + 1, pos.z]);
      }
      recordObjectiveEvent('trash');
      addStar([pos.x, pos.y, pos.z]); // Good job knocking it over! Or maybe bad dog? We'll give a star for fun.
    }
  });

  return (
    <RigidBody ref={rb} position={position} colliders="hull" mass={5}>
      <group position={[0, 0.5, 0]}>
        {/* Can Body */}
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[0.4, 0.3, 1, 16]} />
          <meshStandardMaterial color="#78909c" metalness={0.5} roughness={0.5} />
        </mesh>
        {/* Lid */}
        <mesh position={[0, 0.55, 0]} castShadow>
          <cylinderGeometry args={[0.45, 0.45, 0.1, 16]} />
          <meshStandardMaterial color="#546e7a" metalness={0.5} roughness={0.5} />
        </mesh>
        {/* Handle */}
        <mesh position={[0, 0.65, 0]} castShadow>
          <torusGeometry args={[0.1, 0.03, 8, 16]} />
          <meshStandardMaterial color="#455a64" />
        </mesh>
        
        {showCrash && (
          <Html position={[0, 1, 0]} center>
            <div className="text-6xl animate-bounce drop-shadow-lg select-none pointer-events-none">
              💥
            </div>
          </Html>
        )}
      </group>
    </RigidBody>
  );
}
