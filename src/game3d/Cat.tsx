import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RapierRigidBody } from '@react-three/rapier';
import { useGameStore } from './store';
import * as THREE from 'three';

export function Cat({ id, position, color }: { id: number, position: [number, number, number], color: string }) {
  const rb = useRef<RapierRigidBody>(null);
  const group = useRef<THREE.Group>(null);
  const headGroup = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Mesh>(null);
  const legFL = useRef<THREE.Mesh>(null);
  const legFR = useRef<THREE.Mesh>(null);
  const legBL = useRef<THREE.Mesh>(null);
  const legBR = useRef<THREE.Mesh>(null);
  const dogs = useGameStore(s => s.dogPositions);
  const barks = useGameStore(s => s.barks);
  const birds = useGameStore(s => s.birdPositions);
  const setCatPosition = useGameStore(s => s.setCatPosition);
  
  const [state, setState] = useState<'idle' | 'wander' | 'flee' | 'chase' | 'sleeping' | 'grooming' | 'playing'>('idle');
  const [timer, setTimer] = useState(0);
  const [target, setTarget] = useState(new THREE.Vector3());
  const prevDogs = useRef<THREE.Vector3[]>([new THREE.Vector3(), new THREE.Vector3()]);

  useFrame((_, delta) => {
    if (!rb.current || !group.current) return;
    const pos = rb.current.translation();
    const currentPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    
    setCatPosition(id, currentPos);

    let fleeDir = new THREE.Vector3();
    let shouldFlee = false;
    let chaseTarget: THREE.Vector3 | null = null;

    // Check dogs
    for (let i = 0; i < dogs.length; i++) {
      const dog = dogs[i];
      const prevDog = prevDogs.current[i];
      const speed = delta > 0 ? dog.distanceTo(prevDog) / delta : 0;
      prevDogs.current[i].copy(dog);

      // Scare radius depends on dog speed. 
      // If standing still (speed < 1), radius is 2.
      // If running (speed > 10), radius is 10.
      const scareRadius = Math.max(2, Math.min(10, speed));

      if (currentPos.distanceTo(dog) < scareRadius) {
        shouldFlee = true;
        fleeDir.add(currentPos.clone().sub(dog).normalize());
      }
    }

    // Check barks
    for (const bark of barks) {
      if (Date.now() - bark.time < 100 && currentPos.distanceTo(bark.pos) < 15) {
        shouldFlee = true;
        fleeDir.add(currentPos.clone().sub(bark.pos).normalize());
        // Jump!
        if (pos.y < 1) {
          rb.current.applyImpulse({ x: 0, y: 5, z: 0 }, true);
        }
      }
    }

    // Check birds if not fleeing
    if (!shouldFlee) {
      let closestBirdDist = 10;
      for (const birdPos of Object.values(birds)) {
        const dist = currentPos.distanceTo(birdPos);
        if (dist < closestBirdDist && birdPos.y < 2) { // Only chase birds that are low
          closestBirdDist = dist;
          chaseTarget = birdPos;
        }
      }
    }

    let newTimer = timer - delta;
    let newState = state;

    if (shouldFlee) {
      if (state !== 'flee') {
        // No more score for scaring cats
      }
      newState = 'flee';
      newTimer = 1;
      fleeDir.normalize();
      rb.current.setLinvel({ x: fleeDir.x * 12, y: rb.current.linvel().y, z: fleeDir.z * 12 }, true);
      group.current.rotation.y = Math.atan2(fleeDir.x, fleeDir.z);
    } else if (chaseTarget) {
      newState = 'chase';
      const dir = chaseTarget.clone().sub(currentPos);
      dir.y = 0;
      dir.normalize();
      rb.current.setLinvel({ x: dir.x * 8, y: rb.current.linvel().y, z: dir.z * 8 }, true);
      group.current.rotation.y = Math.atan2(dir.x, dir.z);
    } else if (state === 'flee' && newTimer <= 0) {
      newState = 'idle';
      newTimer = Math.random() * 2 + 1;
    } else if (state === 'chase' && !chaseTarget) {
      newState = 'idle';
      newTimer = Math.random() * 2 + 1;
    } else if (state === 'idle' && newTimer <= 0) {
      const rand = Math.random();
      if (rand < 0.3) {
        newState = 'wander';
        newTimer = Math.random() * 3 + 2;
        setTarget(new THREE.Vector3(currentPos.x + (Math.random() - 0.5) * 10, 0, currentPos.z + (Math.random() - 0.5) * 10));
      } else if (rand < 0.6) {
        newState = 'sleeping';
        newTimer = Math.random() * 5 + 5; // Sleep for 5-10s
      } else if (rand < 0.8) {
        newState = 'grooming';
        newTimer = Math.random() * 3 + 2;
      } else {
        newState = 'playing';
        newTimer = Math.random() * 3 + 2;
      }
    } else if ((state === 'sleeping' || state === 'grooming' || state === 'playing') && newTimer <= 0) {
      newState = 'idle';
      newTimer = Math.random() * 2 + 1;
    } else if (state === 'wander') {
      const dir = target.clone().sub(currentPos);
      dir.y = 0;
      if (dir.length() < 0.5 || newTimer <= 0) {
        newState = 'idle';
        newTimer = Math.random() * 2 + 1;
      } else {
        dir.normalize();
        rb.current.setLinvel({ x: dir.x * 4, y: rb.current.linvel().y, z: dir.z * 4 }, true);
        group.current.rotation.y = Math.atan2(dir.x, dir.z);
      }
    }

    if (!shouldFlee && !chaseTarget && state !== 'wander') {
      // Slow down
      const vel = rb.current.linvel();
      rb.current.setLinvel({ x: vel.x * 0.9, y: vel.y, z: vel.z * 0.9 }, true);
    }

    // Animations
    const t = _.clock.elapsedTime;
    let targetBodyRotZ = 0;
    let targetBodyY = 0;
    let targetHeadRotX = 0;
    let targetHeadRotY = 0;
    let targetTailRotX = -Math.PI / 4;
    let targetTailRotZ = 0;
    let targetLegFL = 0;
    let targetLegFR = 0;
    let targetLegBL = 0;
    let targetLegBR = 0;

    if (state === 'sleeping') {
      targetBodyRotZ = Math.PI / 2;
      targetBodyY = -0.15;
      targetHeadRotX = 0.2;
      targetTailRotX = -Math.PI / 2;
      targetLegFL = Math.PI / 4;
      targetLegFR = Math.PI / 4;
      targetLegBL = Math.PI / 4;
      targetLegBR = Math.PI / 4;
    } else if (state === 'grooming') {
      targetHeadRotX = Math.sin(t * 8) * 0.3 + 0.3;
      targetBodyY = Math.sin(t * 8) * 0.02;
    } else if (state === 'playing') {
      targetHeadRotX = Math.sin(t * 15) * 0.2;
      targetTailRotZ = Math.sin(t * 20) * 0.5;
      if (Math.random() < 0.02 && pos.y < 1) {
        rb.current.applyImpulse({ x: 0, y: 2, z: 0 }, true);
      }
    } else if (state === 'flee') {
      targetTailRotX = 0;
      targetBodyY = Math.abs(Math.sin(t * 20)) * 0.1;
      // Fast run cycle
      targetLegFL = Math.sin(t * 20) * 0.8;
      targetLegBR = Math.sin(t * 20) * 0.8;
      targetLegFR = Math.sin(t * 20 + Math.PI) * 0.8;
      targetLegBL = Math.sin(t * 20 + Math.PI) * 0.8;
    } else if (state === 'chase') {
      targetTailRotX = -Math.PI / 8;
      targetBodyY = Math.abs(Math.sin(t * 15)) * 0.08;
      // Run cycle
      targetLegFL = Math.sin(t * 15) * 0.6;
      targetLegBR = Math.sin(t * 15) * 0.6;
      targetLegFR = Math.sin(t * 15 + Math.PI) * 0.6;
      targetLegBL = Math.sin(t * 15 + Math.PI) * 0.6;
    } else if (state === 'wander') {
      targetTailRotZ = Math.sin(t * 5) * 0.2;
      targetBodyY = Math.abs(Math.sin(t * 10)) * 0.05;
      // Walk cycle
      targetLegFL = Math.sin(t * 10) * 0.4;
      targetLegBR = Math.sin(t * 10) * 0.4;
      targetLegFR = Math.sin(t * 10 + Math.PI) * 0.4;
      targetLegBL = Math.sin(t * 10 + Math.PI) * 0.4;
    } else {
      // Idle
      targetBodyY = Math.sin(t * 2) * 0.02; // Breathe
      targetHeadRotX = Math.sin(t * 0.5) * 0.05;
      targetHeadRotY = Math.sin(t * 0.3) * 0.1;
      targetTailRotZ = Math.sin(t * 3) * 0.1;
    }

    group.current.rotation.z = THREE.MathUtils.lerp(group.current.rotation.z, targetBodyRotZ, 0.1);
    group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, targetBodyY, 0.1);
    
    if (headGroup.current) {
      headGroup.current.rotation.x = THREE.MathUtils.lerp(headGroup.current.rotation.x, targetHeadRotX, 0.2);
      headGroup.current.rotation.y = THREE.MathUtils.lerp(headGroup.current.rotation.y, targetHeadRotY, 0.2);
    }
    if (tail.current) {
      tail.current.rotation.x = THREE.MathUtils.lerp(tail.current.rotation.x, targetTailRotX, 0.2);
      tail.current.rotation.z = THREE.MathUtils.lerp(tail.current.rotation.z, targetTailRotZ, 0.2);
    }
    if (legFL.current) legFL.current.rotation.x = THREE.MathUtils.lerp(legFL.current.rotation.x, targetLegFL, 0.2);
    if (legFR.current) legFR.current.rotation.x = THREE.MathUtils.lerp(legFR.current.rotation.x, targetLegFR, 0.2);
    if (legBL.current) legBL.current.rotation.x = THREE.MathUtils.lerp(legBL.current.rotation.x, targetLegBL, 0.2);
    if (legBR.current) legBR.current.rotation.x = THREE.MathUtils.lerp(legBR.current.rotation.x, targetLegBR, 0.2);

    setState(newState);
    setTimer(newTimer);
  });

  return (
    <RigidBody ref={rb} position={position} colliders="cuboid" lockRotations mass={1} friction={0}>
      <group ref={group}>
        {/* Body */}
        <mesh position={[0, 0.3, 0]} castShadow>
          <boxGeometry args={[0.25, 0.25, 0.5]} />
          <meshStandardMaterial color={color} />
        </mesh>
        
        {/* Head */}
        <group ref={headGroup} position={[0, 0.45, 0.25]}>
          <mesh position={[0, 0.05, 0]} castShadow>
            <boxGeometry args={[0.2, 0.2, 0.2]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[-0.08, 0.18, 0]} castShadow>
            <coneGeometry args={[0.04, 0.12]} />
            <meshStandardMaterial color={color} />
          </mesh>
          <mesh position={[0.08, 0.18, 0]} castShadow>
            <coneGeometry args={[0.04, 0.12]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </group>

        {/* Tail */}
        <mesh ref={tail} position={[0, 0.4, -0.25]} rotation={[-Math.PI / 4, 0, 0]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 0.3]} />
          <meshStandardMaterial color={color} />
        </mesh>

        {/* Legs */}
        <group position={[-0.1, 0.3, 0.15]}>
          <mesh ref={legFL} position={[0, -0.15, 0]} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 0.3]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </group>
        <group position={[0.1, 0.3, 0.15]}>
          <mesh ref={legFR} position={[0, -0.15, 0]} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 0.3]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </group>
        <group position={[-0.1, 0.3, -0.15]}>
          <mesh ref={legBL} position={[0, -0.15, 0]} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 0.3]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </group>
        <group position={[0.1, 0.3, -0.15]}>
          <mesh ref={legBR} position={[0, -0.15, 0]} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 0.3]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </group>
      </group>
    </RigidBody>
  );
}
