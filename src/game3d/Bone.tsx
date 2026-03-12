import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RapierRigidBody } from '@react-three/rapier';
import { useGameStore } from './store';
import * as THREE from 'three';

export function Bone({ id, position }: { id: number, position: [number, number, number] }) {
  const rb = useRef<RapierRigidBody>(null);
  
  const setBonePosition = useGameStore(s => s.setBonePosition);
  const heldBones = useGameStore(s => s.heldBones);
  const throwEvents = useGameStore(s => s.throwEvents);
  const dogPositions = useGameStore(s => s.dogPositions);
  const dogRotations = useGameStore(s => s.dogRotations);

  const [isHeld, setIsHeld] = useState(false);
  const [holdingDog, setHoldingDog] = useState<number | null>(null);

  useEffect(() => {
    let heldBy = null;
    for (const [dogIndexStr, boneId] of Object.entries(heldBones)) {
      if (boneId === id) {
        heldBy = Number(dogIndexStr);
        break;
      }
    }
    
    if (heldBy !== null && !isHeld) {
      setIsHeld(true);
      setHoldingDog(heldBy);
      if (rb.current) rb.current.setBodyType(2, true); // kinematic
    } else if (heldBy === null && isHeld) {
      setIsHeld(false);
      setHoldingDog(null);
      if (rb.current) rb.current.setBodyType(0, true); // dynamic
    }
  }, [heldBones, id, isHeld]);

  // Handle throws
  useEffect(() => {
    if (!rb.current) return;
    const lastThrow = throwEvents[throwEvents.length - 1];
    if (lastThrow && lastThrow.type === 'bone' && lastThrow.id === id && Date.now() - lastThrow.time < 100) {
      rb.current.setBodyType(0, true);
      rb.current.wakeUp();

      const dogRot = dogRotations[lastThrow.dogIndex];
      const throwDir = new THREE.Vector3(Math.sin(dogRot), 0.5, Math.cos(dogRot)).normalize();
      rb.current.applyImpulse({ x: throwDir.x * 15, y: throwDir.y * 15, z: throwDir.z * 15 }, true);
      rb.current.applyTorqueImpulse({ x: Math.random(), y: Math.random(), z: Math.random() }, true);
    }
  }, [throwEvents, id, dogRotations]);

  useFrame(() => {
    if (!rb.current) return;
    
    if (isHeld && holdingDog !== null) {
      const dogPos = dogPositions[holdingDog];
      const dogRot = dogRotations[holdingDog];
      
      // Position bone in dog's mouth
      const mouthOffset = new THREE.Vector3(Math.sin(dogRot) * 0.5, 0.6, Math.cos(dogRot) * 0.5);
      const targetPos = dogPos.clone().add(mouthOffset);
      
      rb.current.setTranslation(targetPos, true);
      
      // Rotate bone to be held horizontally in mouth
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, dogRot + Math.PI / 2, 0));
      rb.current.setRotation(q, true);
      
      rb.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rb.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    const pos = rb.current.translation();
    setBonePosition(id, new THREE.Vector3(pos.x, pos.y, pos.z));
  });

  return (
    <RigidBody ref={rb} position={position} colliders="hull" mass={0.5} restitution={0.2} friction={0.5}>
      <group scale={0.5}>
        {/* Main shaft */}
        <mesh castShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.8]} />
          <meshStandardMaterial color="#f0f0f0" roughness={0.8} />
        </mesh>
        {/* Ends */}
        <mesh position={[0, 0.4, 0.1]} castShadow>
          <sphereGeometry args={[0.15]} />
          <meshStandardMaterial color="#f0f0f0" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.4, -0.1]} castShadow>
          <sphereGeometry args={[0.15]} />
          <meshStandardMaterial color="#f0f0f0" roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.4, 0.1]} castShadow>
          <sphereGeometry args={[0.15]} />
          <meshStandardMaterial color="#f0f0f0" roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.4, -0.1]} castShadow>
          <sphereGeometry args={[0.15]} />
          <meshStandardMaterial color="#f0f0f0" roughness={0.8} />
        </mesh>
      </group>
    </RigidBody>
  );
}
