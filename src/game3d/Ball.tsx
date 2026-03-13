import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RapierRigidBody } from '@react-three/rapier';
import { useGameStore } from './store';
import { playThrowSound, playToyBounceSound } from './audio';
import * as THREE from 'three';

export function Ball({ id, position, color }: { id: number, position: [number, number, number], color: string }) {
  const rb = useRef<RapierRigidBody>(null);
  
  const barks = useGameStore(s => s.barks);
  const setBallPosition = useGameStore(s => s.setBallPosition);
  const heldBalls = useGameStore(s => s.heldBalls);
  const throwEvents = useGameStore(s => s.throwEvents);
  const dogPositions = useGameStore(s => s.dogPositions);
  const dogRotations = useGameStore(s => s.dogRotations);

  const [isHeld, setIsHeld] = useState(false);
  const [holdingDog, setHoldingDog] = useState<number | null>(null);
  const bounceCooldown = useRef(0);

  useEffect(() => {
    let heldBy = null;
    for (const [dogIndexStr, ballId] of Object.entries(heldBalls)) {
      if (ballId === id) {
        heldBy = Number(dogIndexStr);
        break;
      }
    }
    
    if (heldBy !== null && !isHeld) {
      setIsHeld(true);
      setHoldingDog(heldBy);
      // Make kinematic so it can be moved manually
      if (rb.current) {
        rb.current.setBodyType(2, true); // 2 is kinematicPosition
      }
    } else if (heldBy === null && isHeld) {
      setIsHeld(false);
      setHoldingDog(null);
      // Make dynamic again
      if (rb.current) {
        rb.current.setBodyType(0, true); // 0 is dynamic
      }
    }
  }, [heldBalls, id, isHeld]);

  // Handle throws
  useEffect(() => {
    if (!rb.current) return;
    const lastThrow = throwEvents[throwEvents.length - 1];
    if (lastThrow && lastThrow.type === 'ball' && lastThrow.id === id && Date.now() - lastThrow.time < 100) {
      // Ensure body is dynamic before throwing
      rb.current.setBodyType(0, true);
      rb.current.wakeUp();
      const launchPos = dogPositions[lastThrow.dogIndex];

      // Apply throw impulse
      const dogRot = dogRotations[lastThrow.dogIndex];
      const throwDir = new THREE.Vector3(Math.sin(dogRot), 0.5, Math.cos(dogRot)).normalize();
      rb.current.applyImpulse({ x: throwDir.x * 20, y: throwDir.y * 20, z: throwDir.z * 20 }, true);
      rb.current.applyTorqueImpulse({ x: Math.random(), y: Math.random(), z: Math.random() }, true);
      playThrowSound({ position: launchPos, flavor: 'ball' });
    }
  }, [dogPositions, throwEvents, id, dogRotations]);

  useFrame((_, delta) => {
    if (!rb.current) return;
    bounceCooldown.current = Math.max(0, bounceCooldown.current - delta);
    
    if (isHeld && holdingDog !== null) {
      const dogPos = dogPositions[holdingDog];
      const dogRot = dogRotations[holdingDog];
      
      // Position ball in dog's mouth
      const mouthOffset = new THREE.Vector3(Math.sin(dogRot) * 0.5, 0.6, Math.cos(dogRot) * 0.5);
      const targetPos = dogPos.clone().add(mouthOffset);
      
      rb.current.setTranslation(targetPos, true);
      rb.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rb.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
    } else {
      const pos = rb.current.translation();
      const currentPos = new THREE.Vector3(pos.x, pos.y, pos.z);
      const vel = rb.current.linvel();
      const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);

      // Bark pushing
      for (const bark of barks) {
        if (Date.now() - bark.time < 100 && currentPos.distanceTo(bark.pos) < 8) {
          const dir = currentPos.clone().sub(bark.pos).normalize();
          rb.current.applyImpulse({ x: dir.x * 10, y: 5, z: dir.z * 10 }, true);
        }
      }

      if (bounceCooldown.current === 0 && pos.y < 0.65 && Math.abs(vel.y) > 1.8 && speed > 4) {
        bounceCooldown.current = 0.18;
        playToyBounceSound({
          position: currentPos,
          sharpness: Math.min(1, speed / 20)
        });
      }
    }

    // Update store position
    const pos = rb.current.translation();
    setBallPosition(id, new THREE.Vector3(pos.x, pos.y, pos.z));
  });

  return (
    <RigidBody 
      ref={rb} 
      position={position} 
      colliders="ball" 
      restitution={0.7} 
      friction={1} 
      linearDamping={0.5} 
      angularDamping={0.5}
      mass={0.5}
    >
      <mesh castShadow>
        <sphereGeometry args={[0.4]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </RigidBody>
  );
}
