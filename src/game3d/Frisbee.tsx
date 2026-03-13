import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RapierRigidBody } from '@react-three/rapier';
import { useGameStore } from './store';
import { playThrowSound, playToyBounceSound } from './audio';
import * as THREE from 'three';

export function Frisbee({ id, position, color }: { id: number, position: [number, number, number], color: string }) {
  const rb = useRef<RapierRigidBody>(null);
  
  const setFrisbeePosition = useGameStore(s => s.setFrisbeePosition);
  const heldFrisbees = useGameStore(s => s.heldFrisbees);
  const throwEvents = useGameStore(s => s.throwEvents);
  const dogPositions = useGameStore(s => s.dogPositions);
  const dogRotations = useGameStore(s => s.dogRotations);

  const [isHeld, setIsHeld] = useState(false);
  const [holdingDog, setHoldingDog] = useState<number | null>(null);
  const bounceCooldown = useRef(0);

  useEffect(() => {
    let heldBy = null;
    for (const [dogIndexStr, frisbeeId] of Object.entries(heldFrisbees)) {
      if (frisbeeId === id) {
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
  }, [heldFrisbees, id, isHeld]);

  // Handle throws
  useEffect(() => {
    if (!rb.current) return;
    const lastThrow = throwEvents[throwEvents.length - 1];
    if (lastThrow && lastThrow.type === 'frisbee' && lastThrow.id === id && Date.now() - lastThrow.time < 100) {
      rb.current.setBodyType(0, true);
      rb.current.wakeUp();
      const launchPos = dogPositions[lastThrow.dogIndex];

      const dogRot = dogRotations[lastThrow.dogIndex];
      const throwDir = new THREE.Vector3(Math.sin(dogRot), 0.2, Math.cos(dogRot)).normalize();
      
      // Frisbee is thrown flatter and spins
      rb.current.applyImpulse({ x: throwDir.x * 25, y: throwDir.y * 25, z: throwDir.z * 25 }, true);
      rb.current.applyTorqueImpulse({ x: 0, y: 50, z: 0 }, true);
      playThrowSound({ position: launchPos, flavor: 'frisbee' });
    }
  }, [dogPositions, throwEvents, id, dogRotations]);

  useFrame((_, delta) => {
    if (!rb.current) return;
    bounceCooldown.current = Math.max(0, bounceCooldown.current - delta);
    
    if (isHeld && holdingDog !== null) {
      const dogPos = dogPositions[holdingDog];
      const dogRot = dogRotations[holdingDog];
      
      // Position frisbee in dog's mouth
      const mouthOffset = new THREE.Vector3(Math.sin(dogRot) * 0.5, 0.6, Math.cos(dogRot) * 0.5);
      const targetPos = dogPos.clone().add(mouthOffset);
      
      rb.current.setTranslation(targetPos, true);
      
      // Rotate frisbee to be held horizontally
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, dogRot, 0));
      rb.current.setRotation(q, true);
      
      rb.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rb.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
    } else {
      // Simulate lift/glide
      const vel = rb.current.linvel();
      const speedSq = vel.x * vel.x + vel.z * vel.z;
      if (speedSq > 1) {
        // Apply upward force proportional to horizontal speed
        rb.current.applyImpulse({ x: 0, y: Math.min(speedSq * 0.02, 0.4), z: 0 }, true);
      }

      const pos = rb.current.translation();
      const speed = Math.sqrt(speedSq + vel.y * vel.y);
      if (bounceCooldown.current === 0 && pos.y < 0.35 && Math.abs(vel.y) > 1.2 && speed > 5) {
        bounceCooldown.current = 0.16;
        playToyBounceSound({
          position: [pos.x, pos.y, pos.z],
          sharpness: 0.6 + Math.min(0.4, speed / 24)
        });
      }
    }

    const pos = rb.current.translation();
    setFrisbeePosition(id, new THREE.Vector3(pos.x, pos.y, pos.z));
  });

  return (
    <RigidBody ref={rb} position={position} colliders="hull" mass={0.2} restitution={0.4} friction={0.5}>
      <mesh castShadow>
        <cylinderGeometry args={[0.4, 0.4, 0.05, 16]} />
        <meshStandardMaterial color={color} roughness={0.3} />
      </mesh>
      {/* Inner ring for detail */}
      <mesh position={[0, 0.03, 0]} castShadow>
        <ringGeometry args={[0.2, 0.35, 16]} />
        <meshStandardMaterial color="#ffffff" roughness={0.3} />
      </mesh>
    </RigidBody>
  );
}
