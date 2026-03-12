import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RapierRigidBody } from '@react-three/rapier';
import { useGameStore } from './store';
import * as THREE from 'three';

export function Bird({ id, position }: { id: number, position: [number, number, number] }) {
  const rb = useRef<RapierRigidBody>(null);
  const group = useRef<THREE.Group>(null);
  const wings = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Mesh>(null);
  const dogs = useGameStore(s => s.dogPositions);
  const barks = useGameStore(s => s.barks);
  const cats = useGameStore(s => s.catPositions);
  const setBirdPosition = useGameStore(s => s.setBirdPosition);
  
  const [state, setState] = useState<'idle' | 'peck' | 'fly' | 'perch'>('idle');
  const [timer, setTimer] = useState(0);
  const [perchPos, setPerchPos] = useState<THREE.Vector3 | null>(null);
  const perchLookTimer = useRef(0);
  const perchLookTarget = useRef(0);

  const prevDogs = useRef<THREE.Vector3[]>([new THREE.Vector3(), new THREE.Vector3()]);

  useFrame((stateCtx, delta) => {
    if (!rb.current || !group.current) return;
    const pos = rb.current.translation();
    const currentPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    
    setBirdPosition(id, currentPos);

    let shouldFly = false;
    let flyDir = new THREE.Vector3();

    if (state === 'idle' || state === 'peck' || state === 'perch') {
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
          shouldFly = true;
          flyDir.add(currentPos.clone().sub(dog).normalize());
        }
      }
      
      // Check cats
      for (const catPos of Object.values(cats)) {
        if (currentPos.distanceTo(catPos) < 6) {
          shouldFly = true;
          flyDir.add(currentPos.clone().sub(catPos).normalize());
        }
      }

      // Check barks
      for (const bark of barks) {
        if (Date.now() - bark.time < 100 && currentPos.distanceTo(bark.pos) < 15) {
          shouldFly = true;
          flyDir.add(currentPos.clone().sub(bark.pos).normalize());
        }
      }

      if (shouldFly) {
        if (state === 'idle' || state === 'peck') {
          // No more score for scaring birds
        }
        setState('fly');
        flyDir.y = 1; // Fly up
        flyDir.normalize();
        rb.current.setLinvel({ x: flyDir.x * 10, y: 8, z: flyDir.z * 10 }, true);
        rb.current.setGravityScale(0, true); // Stop falling
        group.current.rotation.y = Math.atan2(flyDir.x, flyDir.z);
        
        // Pick a perch spot (elevated)
        setPerchPos(new THREE.Vector3(
          currentPos.x + (Math.random() - 0.5) * 20,
          10 + Math.random() * 5, // high up
          currentPos.z + (Math.random() - 0.5) * 20
        ));
      } else if (state === 'idle') {
        if (timer <= 0) {
          if (Math.random() < 0.4) {
            setState('peck');
            setTimer(Math.random() * 1.5 + 0.5); // peck for 0.5-2s
          } else {
            setTimer(Math.random() * 2 + 1); // idle for 1-3s
            group.current.rotation.y += (Math.random() - 0.5) * Math.PI; // Look around
          }
        } else {
          setTimer(timer - delta);
        }
        // Idle animation: stand up straight, maybe tiny head bobs
        group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, Math.sin(stateCtx.clock.elapsedTime * 2) * 0.05, 0.1);
        
        // Hop if turning significantly
        if (Math.random() < 0.05 && pos.y < 0.5) {
          rb.current.applyImpulse({ x: 0, y: 0.1, z: 0 }, true);
        }
      } else if (state === 'peck') {
        if (timer <= 0) {
          setState('idle');
          setTimer(Math.random() * 2 + 1);
        } else {
          setTimer(timer - delta);
        }
        // Pecking animation: bend down and bob rapidly
        const targetRotX = Math.abs(Math.sin(stateCtx.clock.elapsedTime * 15)) * 0.4 + 0.3;
        group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, targetRotX, 0.2);
        
        // Tiny hops while pecking
        if (Math.random() < 0.02 && pos.y < 0.5) {
          rb.current.applyImpulse({ x: (Math.random() - 0.5) * 0.05, y: 0.1, z: (Math.random() - 0.5) * 0.05 }, true);
        }
      } else if (state === 'perch') {
        // Just chill on the perch
        if (timer <= 0) {
          // Maybe fly back down to peck after a while
          if (Math.random() < 0.3) {
            setState('fly');
            setPerchPos(new THREE.Vector3(
              currentPos.x + (Math.random() - 0.5) * 20,
              0, // ground
              currentPos.z + (Math.random() - 0.5) * 20
            ));
          } else {
            setTimer(Math.random() * 5 + 2);
          }
        } else {
          setTimer(timer - delta);
        }

        // Subtle perch animations
        perchLookTimer.current -= delta;
        if (perchLookTimer.current <= 0) {
          perchLookTimer.current = Math.random() * 3 + 1;
          perchLookTarget.current = group.current.rotation.y + (Math.random() - 0.5) * Math.PI * 0.8;
        }

        let diff = perchLookTarget.current - group.current.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        group.current.rotation.y += diff * 0.1;

        // Breathing and weight shift
        group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, Math.sin(stateCtx.clock.elapsedTime * 3) * 0.03, 0.1);
        group.current.rotation.z = THREE.MathUtils.lerp(group.current.rotation.z, Math.sin(stateCtx.clock.elapsedTime * 1.5) * 0.05, 0.1);
        
        // Occasional footing adjustment
        if (Math.random() < 0.02) {
          group.current.position.y = 0.05;
        }
        group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, 0, 0.2);
      }
    } else if (state === 'fly') {
      // Flap wings
      if (wings.current) {
        wings.current.children[0].rotation.z = Math.sin(stateCtx.clock.elapsedTime * 30) * 0.5;
        wings.current.children[1].rotation.z = -Math.sin(stateCtx.clock.elapsedTime * 30) * 0.5;
      }
      
      // Tilt body forward while flying
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, 0.3, 0.1);
      if (tail.current) {
        tail.current.rotation.x = THREE.MathUtils.lerp(tail.current.rotation.x, 0.2, 0.1);
      }
      
      if (perchPos) {
        const dir = perchPos.clone().sub(currentPos);
        const dist = dir.length();
        
        if (dist < 1) {
          // Reached destination
          rb.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
          if (perchPos.y > 1) {
            setState('perch');
            setTimer(Math.random() * 5 + 2);
          } else {
            setState('idle');
            rb.current.setGravityScale(1, true);
          }
          if (wings.current) {
            wings.current.children[0].rotation.z = 0;
            wings.current.children[1].rotation.z = 0;
          }
          group.current.rotation.x = 0; // Reset tilt
        } else {
          dir.normalize();
          const speed = 8;
          rb.current.setLinvel({ x: dir.x * speed, y: dir.y * speed, z: dir.z * speed }, true);
          
          // Smoothly rotate towards target
          const targetRotation = Math.atan2(dir.x, dir.z);
          // Handle wrap-around for smooth rotation
          let diff = targetRotation - group.current.rotation.y;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          group.current.rotation.y += diff * 0.1;
        }
      } else {
        // Fallback if no perch pos
        const vel = rb.current.linvel();
        rb.current.setLinvel({ x: vel.x, y: 5, z: vel.z }, true);
        if (pos.y > 30) {
          setState('idle');
          rb.current.setGravityScale(1, true);
          rb.current.setTranslation({ x: (Math.random() - 0.5) * 40, y: 5, z: (Math.random() - 0.5) * 40 }, true);
          rb.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
          group.current.rotation.x = 0;
        }
      }
    }

    if (state !== 'perch') {
      group.current.rotation.z = THREE.MathUtils.lerp(group.current.rotation.z, 0, 0.1);
      group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, 0, 0.2);
    }

    if (state !== 'fly' && tail.current) {
      tail.current.rotation.x = THREE.MathUtils.lerp(tail.current.rotation.x, Math.sin(stateCtx.clock.elapsedTime * 5) * 0.1, 0.1);
    }
  });

  return (
    <RigidBody ref={rb} position={position} colliders="ball" lockRotations mass={0.1} friction={0.5}>
      <group ref={group}>
        <mesh position={[0, 0.15, 0]} castShadow>
          <sphereGeometry args={[0.15]} />
          <meshStandardMaterial color="#4169e1" />
        </mesh>
        <mesh position={[0, 0.2, 0.12]} castShadow>
          <coneGeometry args={[0.05, 0.15]} />
          <meshStandardMaterial color="#ffd700" />
        </mesh>
        <mesh ref={tail} position={[0, 0.1, -0.12]} rotation={[-Math.PI / 6, 0, 0]} castShadow>
          <coneGeometry args={[0.06, 0.2]} />
          <meshStandardMaterial color="#1e90ff" />
        </mesh>
        <group ref={wings}>
          <mesh position={[-0.15, 0.15, 0]} rotation={[0, 0, 0]} castShadow>
            <boxGeometry args={[0.2, 0.02, 0.15]} />
            <meshStandardMaterial color="#1e90ff" />
          </mesh>
          <mesh position={[0.15, 0.15, 0]} rotation={[0, 0, 0]} castShadow>
            <boxGeometry args={[0.2, 0.02, 0.15]} />
            <meshStandardMaterial color="#1e90ff" />
          </mesh>
        </group>
      </group>
    </RigidBody>
  );
}
