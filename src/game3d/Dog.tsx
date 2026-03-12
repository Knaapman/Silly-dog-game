import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, CuboidCollider, useRapier } from '@react-three/rapier';
import { useInput } from './useInput';
import { useGameStore } from './store';
import { playBarkSound, playPoopSound, playJumpSound, playDigSound, playEatSound, playDrinkSound, playSniffSound, playSleepSound, playPantSound } from './audio';
import * as THREE from 'three';
import { Text } from '@react-three/drei';

function lerpAngle(start: number, end: number, t: number) {
  let diff = end - start;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return start + diff * t;
}

export function Dog({ playerIndex, color, position }: { playerIndex: number, color: string, position: [number, number, number] }) {
  const { rapier, world } = useRapier();
  const rb = useRef<RapierRigidBody>(null);
  const group = useRef<THREE.Group>(null);
  const headGroup = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Mesh>(null);
  const legFL = useRef<THREE.Mesh>(null);
  const legFR = useRef<THREE.Mesh>(null);
  const legBL = useRef<THREE.Mesh>(null);
  const legBR = useRef<THREE.Mesh>(null);
  const earL = useRef<THREE.Mesh>(null);
  const earR = useRef<THREE.Mesh>(null);
  
  const getInput = useInput(playerIndex);
  
  const setDogPosition = useGameStore(s => s.setDogPosition);
  const addBark = useGameStore(s => s.addBark);
  const heldBalls = useGameStore(s => s.heldBalls);
  const ballPositions = useGameStore(s => s.ballPositions);
  const grabBall = useGameStore(s => s.grabBall);
  const dropBall = useGameStore(s => s.dropBall);
  const heldBones = useGameStore(s => s.heldBones);
  const bonePositions = useGameStore(s => s.bonePositions);
  const grabBone = useGameStore(s => s.grabBone);
  const dropBone = useGameStore(s => s.dropBone);
  const heldFrisbees = useGameStore(s => s.heldFrisbees);
  const frisbeePositions = useGameStore(s => s.frisbeePositions);
  const grabFrisbee = useGameStore(s => s.grabFrisbee);
  const dropFrisbee = useGameStore(s => s.dropFrisbee);
  const triggerThrow = useGameStore(s => s.triggerThrow);
  const removeFood = useGameStore(s => s.removeFood);
  const removeBone = useGameStore(s => s.removeBone);
  const addPoop = useGameStore(s => s.addPoop);
  const stars = useGameStore(s => s.stars);

  const [barking, setBarking] = useState(0);
  const [eating, setEating] = useState(0);
  const [isSitting, setIsSitting] = useState(false);
  const [isRolling, setIsRolling] = useState(false);
  const [isLyingDown, setIsLyingDown] = useState(false);
  const [isSniffing, setIsSniffing] = useState(false);
  const [isDigging, setIsDigging] = useState(false);
  const [isDrinking, setIsDrinking] = useState(false);
  const [digTimer, setDigTimer] = useState(0);
  const [sniffTimer, setSniffTimer] = useState(0);
  const [poopCooldown, setPoopCooldown] = useState(0);
  const [reaction, setReaction] = useState<string | null>(null);
  const [reactionTimer, setReactionTimer] = useState(0);
  const [zzzParticles, setZzzParticles] = useState<{id: number, time: number, x: number, y: number}[]>([]);
  const [digParticles, setDigParticles] = useState<{id: number, time: number, x: number, y: number, z: number, vx: number, vy: number, vz: number}[]>([]);
  const [dustParticles, setDustParticles] = useState<{id: number, time: number, x: number, y: number, z: number, scale: number}[]>([]);
  const [splashParticles, setSplashParticles] = useState<{id: number, time: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, scale: number}[]>([]);
  const wasSwimming = useRef(false);
  const sleepStartTime = useRef(0);
  const lastSleepStarTime = useRef(0);
  const lastProcessedUiActionTime = useRef(0);
  const animOffset = useRef(Math.random() * Math.PI * 2);
  const soundTimers = useRef({
    dig: 0,
    eat: 0,
    drink: 0,
    sniff: 0,
    sleep: 0,
    pant: 0
  });

  const addBone = useGameStore(s => s.addBone);

  // Animation Refs for smooth transitions
  const animState = useRef({
    legFL: 0, legFR: 0, legBL: 0, legBR: 0,
    headX: 0, headY: 0, headZ: 0,
    bodyY: 0, bodyRotZ: 0, bodyRotX: 0,
    tailZ: 0, tailY: 0,
    earX: 0, earZ: 0,
    time: 0
  });
  const idleTimer = useRef(0);

  useFrame((state, delta) => {
    if (!rb.current || !group.current) return;
    const input = getInput();
    
    // Handle UI Actions
    const uiAction = useGameStore.getState().uiAction;
    if (uiAction && uiAction.playerIndex === playerIndex && uiAction.time > lastProcessedUiActionTime.current) {
      lastProcessedUiActionTime.current = uiAction.time;
      if (uiAction.action === 'bark') input.justBarked = true;
      else if (uiAction.action === 'dig') input.justDug = true;
      else if (uiAction.action === 'sleep') input.justLayDown = true;
      else if (uiAction.action === 'poop') input.justPooped = true;
      else if (uiAction.action === 'throw') input.justInteracted = true;
      else if (uiAction.action === 'interact') input.justAte = true;
      else if (uiAction.action === 'jump') input.justJumped = true;
    }

    const pos = rb.current.translation();
    const currentPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    const distToPond = currentPos.distanceTo(new THREE.Vector3(0, 0, 0));
    const isSwimming = distToPond < 6;

    // Movement
    const speed = isSwimming ? 6 : (isSniffing ? 5 : (input.run ? 22 : 12));
    const vel = rb.current.linvel();
    
    if (isRolling) {
      // Cannot move while rolling
      // Rock on back
      // group.current.rotation.z handled in anim logic
    } else if (isSitting || isLyingDown || eating > 0 || isDigging || isDrinking) {
      // Cannot move while sitting, lying down, eating, digging, or drinking
      if (eating > 0 || isDigging || isDrinking) {
        // Eating/Digging/Drinking logic
      } else if (input.x !== 0 || input.z !== 0 || input.jump || input.justBarked) {
        setIsSitting(false);
        setIsLyingDown(false);
      }
    } else {
      const targetVelX = input.x * speed;
      const targetVelZ = input.z * speed;
      const lerpFactor = 1 - Math.exp(-15 * delta);
      const newVelX = THREE.MathUtils.lerp(vel.x, targetVelX, lerpFactor);
      const newVelZ = THREE.MathUtils.lerp(vel.z, targetVelZ, lerpFactor);
      rb.current.setLinvel({ x: newVelX, y: vel.y, z: newVelZ }, true);
      
      // Rotation
      if (input.x !== 0 || input.z !== 0) {
        const angle = Math.atan2(input.x, input.z);
        group.current.rotation.y = lerpAngle(group.current.rotation.y, angle, 1 - Math.exp(-15 * delta));
      }

      // Jump
      if (input.justJumped && !isSwimming) {
        // Ground check
        const rayOrigin = { x: currentPos.x, y: currentPos.y + 0.1, z: currentPos.z };
        const rayDir = { x: 0, y: -1, z: 0 };
        const ray = new rapier.Ray(rayOrigin, rayDir);
        const hit = world.castRay(ray, 0.5, true, undefined, undefined, undefined, rb.current);

        if (hit && (hit as any).toi < 0.3) {
          rb.current.applyImpulse({ x: 0, y: 10, z: 0 }, true); // Increased impulse for better jump height
          setIsSniffing(false); // Stop sniffing if jumping
          playJumpSound();
        }
      }
    }

    if (isSwimming) {
      // Buoyancy
      if (pos.y < 0.5) {
        rb.current.applyImpulse({ x: 0, y: (0.5 - pos.y) * 2, z: 0 }, true);
      }
      // Splash on enter/exit
      if (!wasSwimming.current || (isSwimming && Math.abs(vel.y) > 2)) {
        if (!wasSwimming.current) {
          // Big splash on enter
          for(let i=0; i<10; i++) {
            setSplashParticles(p => [...p, {
              id: Date.now() + Math.random(), time: 0.5 + Math.random() * 0.5,
              x: currentPos.x + (Math.random() - 0.5), y: 0.2, z: currentPos.z + (Math.random() - 0.5),
              vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 4, vz: (Math.random() - 0.5) * 4,
              scale: 0.2 + Math.random() * 0.4
            }]);
          }
        }
        wasSwimming.current = true;
      }
      // Small splashes while moving in water
      if ((input.x !== 0 || input.z !== 0) && Math.random() < 0.2) {
        setSplashParticles(p => [...p, {
          id: Date.now() + Math.random(), time: 0.3 + Math.random() * 0.3,
          x: currentPos.x + (Math.random() - 0.5), y: 0.2, z: currentPos.z + (Math.random() - 0.5),
          vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 2,
          scale: 0.1 + Math.random() * 0.2
        }]);
      }
    } else {
      if (wasSwimming.current) {
        wasSwimming.current = false;
      }
    }

    const t = state.clock.elapsedTime;

    // --- SOUND SYSTEM ---
    if (isDigging) {
      if (t - soundTimers.current.dig > 0.2) {
        playDigSound();
        soundTimers.current.dig = t;
      }
    }
    if (eating > 0) {
      if (t - soundTimers.current.eat > 0.3) {
        playEatSound();
        soundTimers.current.eat = t;
      }
    }
    if (isDrinking) {
      if (t - soundTimers.current.drink > 0.4) {
        playDrinkSound();
        soundTimers.current.drink = t;
      }
    }
    if (isSniffing) {
      if (t - soundTimers.current.sniff > 0.6) {
        playSniffSound();
        soundTimers.current.sniff = t;
      }
    }
    if (isLyingDown) {
      if (t - soundTimers.current.sleep > 2.5) {
        playSleepSound();
        soundTimers.current.sleep = t;
      }
    }
    if (isSitting) {
      if (t - soundTimers.current.pant > 1.5) {
        playPantSound();
        soundTimers.current.pant = t;
      }
    }

    // --- ANIMATION SYSTEM ---
    const currentSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    const isMoving = currentSpeed > 0.5 && eating <= 0 && !isSitting && !isLyingDown && !isRolling && !isDigging && !isDrinking;
    const isJumping = !isSwimming && (Math.abs(vel.y) > 0.5 || (rb.current && !world.castRay(new rapier.Ray({ x: currentPos.x, y: currentPos.y + 0.1, z: currentPos.z }, { x: 0, y: -1, z: 0 }), 0.5, true, undefined, undefined, undefined, rb.current)));
    const isRunning = currentSpeed > 8 && !isSniffing && isMoving && !isSwimming;
    const s = animState.current;

    const tAnim = t + animOffset.current;

    // Target values
    let target = {
      legFL: 0, legFR: 0, legBL: 0, legBR: 0,
      headX: 0, headY: 0, headZ: 0,
      bodyY: 0, bodyRotZ: 0, bodyRotX: 0,
      tailZ: 0, tailY: Math.PI / 4, // Default tail up
      earX: 0, earZ: 0
    };

    if (isRolling) {
      const wiggle = Math.sin(tAnim * 20) * 0.5;
      target.legFL = -Math.PI / 2 + wiggle;
      target.legFR = -Math.PI / 2 - wiggle;
      target.legBL = Math.PI / 2 + wiggle;
      target.legBR = Math.PI / 2 - wiggle;
      target.bodyRotZ = Math.PI + Math.sin(tAnim * 8) * 0.3;
      target.bodyY = 0.75; // Keep above ground when upside down
      target.tailZ = Math.sin(tAnim * 20) * 0.5;
      target.earX = Math.PI / 4;
    } else if (isLyingDown) {
      target.legFL = -Math.PI / 2;
      target.legFR = -Math.PI / 2;
      target.legBL = Math.PI / 2;
      target.legBR = Math.PI / 2;
      target.bodyY = -0.25; // Don't clip through ground
      target.headX = 0.2; // Rest head
      target.earX = -0.2; // Relaxed ears
    } else if (isSitting) {
      target.legFL = -Math.PI / 4;
      target.legFR = -Math.PI / 4;
      target.legBL = Math.PI / 2;
      target.legBR = Math.PI / 2;
      target.bodyY = -0.2;
      target.bodyRotX = -Math.PI / 8;
      
      // Lively sit: panting and looking around
      target.headY = Math.sin(tAnim * 0.8) * 0.2; // Look around
      target.headX = Math.sin(tAnim * 2) * 0.05; // Slight bob
      target.tailZ = Math.sin(tAnim * 8) * 0.4; // Happy tail wag while sitting
      target.earX = Math.sin(tAnim * 0.5) * 0.1;
    } else if (isDigging) {
      target.bodyRotX = 0.5; // Tilt down
      target.headX = 0.5; // Look down
      target.legBL = 0.2;
      target.legBR = 0.2;
      // Fast digging motion
      target.legFL = Math.sin(tAnim * 30) * 0.8 - 0.5;
      target.legFR = Math.sin(tAnim * 30 + Math.PI) * 0.8 - 0.5;
      target.tailZ = Math.sin(tAnim * 20) * 0.5; // Excited tail
      target.earX = 0.5; // Ears flop forward
    } else if (isDrinking) {
      target.bodyRotX = 0.3; // Lean down
      target.headX = 0.6 + Math.sin(tAnim * 15) * 0.1; // Head down, lapping motion
      target.legFL = 0.2;
      target.legFR = 0.2;
      target.legBL = Math.PI / 2;
      target.legBR = Math.PI / 2;
      target.bodyY = -0.1;
      target.tailZ = Math.sin(tAnim * 10) * 0.3; // Happy tail
      target.earX = 0.4; // Ears forward
    } else if (isSwimming) {
      target.bodyY = -0.4; // Lower in water
      target.headX = -0.2; // Head up to breathe
      target.tailZ = Math.sin(tAnim * 5) * 0.2; // Slow tail movement
      
      if (isMoving) {
        // Dog paddle
        target.legFL = Math.sin(tAnim * 15) * 0.8;
        target.legFR = Math.sin(tAnim * 15 + Math.PI) * 0.8;
        target.legBL = Math.sin(tAnim * 15 + Math.PI) * 0.8;
        target.legBR = Math.sin(tAnim * 15) * 0.8;
        target.bodyRotZ = Math.sin(tAnim * 15) * 0.1; // Body roll
      } else {
        // Treading water
        target.legFL = Math.sin(tAnim * 5) * 0.3;
        target.legFR = Math.sin(tAnim * 5 + Math.PI) * 0.3;
        target.legBL = Math.sin(tAnim * 5 + Math.PI) * 0.3;
        target.legBR = Math.sin(tAnim * 5) * 0.3;
      }
    } else if (eating > 0) {
      target.headX = 0.5 + Math.sin(tAnim * 20) * 0.1;
      target.legFL = 0.2;
      target.legFR = 0.2;
      target.tailZ = Math.sin(tAnim * 20) * 0.5;
      target.earX = Math.sin(tAnim * 10) * 0.1;
    } else if (isJumping) {
      // Smooth Jump Animation based on vertical velocity
      // Map vel.y from -5 (falling) to 5 (rising) to a 0 to 1 range
      const jumpPhase = THREE.MathUtils.clamp((vel.y + 5) / 10, 0, 1);
      
      // Rising (jumpPhase -> 1): Reach up/forward, kick back
      // Falling (jumpPhase -> 0): Reach down for landing, tuck hind legs
      target.legFL = THREE.MathUtils.lerp(0.6, -0.8, jumpPhase);
      target.legFR = THREE.MathUtils.lerp(0.6, -0.8, jumpPhase);
      target.legBL = THREE.MathUtils.lerp(-0.6, 0.6, jumpPhase);
      target.legBR = THREE.MathUtils.lerp(-0.6, 0.6, jumpPhase);
      
      target.bodyRotX = THREE.MathUtils.lerp(0.3, -0.5, jumpPhase); // Tilt down when falling, up when rising
      target.headX = THREE.MathUtils.lerp(0.2, -0.4, jumpPhase); // Look down when falling, up when rising
      target.tailY = THREE.MathUtils.lerp(Math.PI / 2, 0, jumpPhase); // Tail up when falling, down for balance when rising
      target.earX = THREE.MathUtils.lerp(-0.5, 0.5, jumpPhase); // Ears forward when falling, back when rising
      
      // Add a bit of body Y offset to stretch the dog out during the jump peak
      target.bodyY = 0.2 * Math.sin(jumpPhase * Math.PI);
    } else if (isMoving) {
      const freq = isSniffing ? 10 : (isRunning ? 25 : 15); // Faster frequency for running
      const amp = isSniffing ? 0.4 : (isRunning ? 0.9 : 0.6); // Larger amplitude for running
      
      // Dynamic run cycle: Gallop/Trot blend
      target.legFL = Math.sin(tAnim * freq) * amp;
      target.legBR = Math.sin(tAnim * freq - (isRunning ? Math.PI / 4 : 0)) * amp; // Slight offset for more dynamic feel when running
      target.legFR = Math.sin(tAnim * freq + Math.PI) * amp;
      target.legBL = Math.sin(tAnim * freq + Math.PI - (isRunning ? Math.PI / 4 : 0)) * amp;

      target.bodyY = Math.abs(Math.sin(tAnim * freq * 2)) * (isRunning ? 0.15 : 0.05); // More pronounced bob
      target.bodyRotX = Math.sin(tAnim * freq) * (isRunning ? 0.1 : 0.02); // Slight forward/back pitch
      target.headZ = Math.sin(tAnim * freq / 2) * (isRunning ? 0.08 : 0.03); // Head bob
      target.headX = Math.sin(tAnim * freq) * 0.05 - (isRunning ? 0.1 : 0); // Look slightly up while running
      
      // Crazy tail wag while running
      target.tailZ = Math.sin(tAnim * (isRunning ? 25 : 15)) * (isRunning ? 0.8 : 0.5);
      target.tailY = Math.PI / 4 + Math.sin(tAnim * 12) * (isRunning ? 0.2 : 0.1); // Tail held high and swaying
      
      // Bank into turns
      target.bodyRotZ = -input.x * (isRunning ? 0.2 : 0.1); // Deeper lean
      
      // Ears flop wildly while running
      target.earX = Math.sin(tAnim * freq * 1.5) * (isRunning ? 0.4 : 0.2) + (isRunning ? 0.3 : 0.1);
      target.earZ = Math.cos(tAnim * freq) * (isRunning ? 0.2 : 0.05);
    } else {
      // Idle
      idleTimer.current += delta;
      
      if (idleTimer.current > 6 && idleTimer.current < 9) {
        // Scratching ear with hind leg
        target.bodyY = Math.sin(tAnim * 2) * 0.02;
        target.bodyRotZ = 0.15; // Lean
        target.headZ = 0.2; // Look towards leg
        target.headY = 0.3;
        target.legBL = Math.sin(tAnim * 20) * 0.4 + 0.4; // Scratch!
        target.earZ = Math.sin(tAnim * 20) * 0.3; // Ear flops
        target.tailZ = Math.sin(tAnim * 2) * 0.1;
      } else if (idleTimer.current > 14 && idleTimer.current < 16) {
        // Shaking off
        const shake = Math.sin(tAnim * 40);
        target.headZ = shake * 0.2;
        target.bodyRotZ = shake * 0.1;
        target.tailZ = shake * 0.5;
        target.earX = shake * 0.3;
        target.earZ = shake * 0.3;
      } else if (idleTimer.current > 20) {
        idleTimer.current = 0; // Reset loop
      } else {
        // Normal Idle
        target.bodyY = Math.sin(tAnim * 2) * 0.02; // Breathe
        target.headY = Math.sin(tAnim * 0.5) * 0.1;
        target.headX = Math.sin(tAnim * 0.3) * 0.05;
        target.tailZ = Math.sin(tAnim * 3) * 0.2;
        
        // Occasional ear twitch
        if (Math.random() < 0.01) {
          target.earZ = (Math.random() - 0.5) * 0.5;
        } else {
          target.earZ = THREE.MathUtils.lerp(s.earZ || 0, 0, 0.05);
        }
      }
    }

    // Reset idle timer if doing anything else
    if (isMoving || isSitting || isLyingDown || isRolling || isDigging || isDrinking || eating > 0 || barking > 0) {
      idleTimer.current = 0;
    }

    // Sniffing override
    if (isSniffing && !isRolling && !isSitting && !isLyingDown && eating <= 0) {
      target.headX = 0.6 + Math.sin(tAnim * 10) * 0.05;
      target.earX = -0.2; // Ears forward
    }

    // Bark override
    if (barking > 0) {
      const barkIntensity = Math.min(barking / 0.5, 1); // 1 to 0
      target.headX -= 0.4 * barkIntensity; // Head tilts up
      target.headY += Math.sin(tAnim * 40) * 0.15 * barkIntensity; // Subtle head shake
      target.bodyY += 0.15 * barkIntensity; // Body jumps up slightly
      target.bodyRotX -= 0.15 * barkIntensity; // Body tilts up slightly
      target.tailZ += Math.sin(tAnim * 30) * 0.4 * barkIntensity; // Excited tail wag
      target.earX -= 0.3 * barkIntensity; // Ears perk up
    }

    // Dog-to-Dog Interaction Override
    const otherDogIndex = playerIndex === 0 ? 1 : 0;
    const otherDogPos = useGameStore.getState().dogPositions[otherDogIndex];
    
    if (otherDogPos && !isMoving && !isJumping && !isDigging && !isRolling && !isLyingDown && !isDrinking && eating <= 0 && barking <= 0) {
      const dist = currentPos.distanceTo(otherDogPos);
      if (dist < 3) {
        // Calculate relative angle to other dog
        const dx = otherDogPos.x - currentPos.x;
        const dz = otherDogPos.z - currentPos.z;
        const worldAngle = Math.atan2(dx, dz);
        let relativeAngle = worldAngle - group.current.rotation.y;
        
        // Normalize angle between -PI and PI
        while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
        while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;
        
        // Only interact if the other dog is somewhat in front of us
        if (Math.abs(relativeAngle) < Math.PI / 2) {
          // Look at the other dog
          target.headY = relativeAngle * 0.8;
          
          // Sniffing motion towards the other dog
          target.headX = 0.3 + Math.sin(tAnim * 5) * 0.1;
          
          // Happy tail wag
          target.tailZ = Math.sin(tAnim * 20) * 0.6;
          
          // Ears forward, attentive
          target.earX = -0.3;
          
          // Occasional playful nudge (small hop)
          if (Math.random() < 0.005 && Math.abs(vel.y) < 0.1) {
            rb.current.applyImpulse({ x: 0, y: 2, z: 0 }, true);
          }
          
          // Occasional heart reaction
          if (dist < 2 && Math.random() < 0.005 && reactionTimer <= 0) {
            setReaction("❤️");
            setReactionTimer(2);
          }
        }
      }
    }

    // Apply Smoothing (Lerp)
    const lerpSpeed = 1 - Math.exp(-15 * delta);
    
    s.legFL = THREE.MathUtils.lerp(s.legFL, target.legFL, lerpSpeed);
    s.legFR = THREE.MathUtils.lerp(s.legFR, target.legFR, lerpSpeed);
    s.legBL = THREE.MathUtils.lerp(s.legBL, target.legBL, lerpSpeed);
    s.legBR = THREE.MathUtils.lerp(s.legBR, target.legBR, lerpSpeed);
    
    s.headX = THREE.MathUtils.lerp(s.headX, target.headX, lerpSpeed);
    s.headY = THREE.MathUtils.lerp(s.headY, target.headY, lerpSpeed);
    s.headZ = THREE.MathUtils.lerp(s.headZ, target.headZ, lerpSpeed);
    
    s.bodyY = THREE.MathUtils.lerp(s.bodyY, target.bodyY, lerpSpeed);
    s.bodyRotZ = THREE.MathUtils.lerp(s.bodyRotZ, target.bodyRotZ, lerpSpeed);
    s.bodyRotX = THREE.MathUtils.lerp(s.bodyRotX, target.bodyRotX, lerpSpeed);
    
    s.tailZ = THREE.MathUtils.lerp(s.tailZ, target.tailZ, lerpSpeed);
    s.tailY = THREE.MathUtils.lerp(s.tailY, target.tailY, lerpSpeed);
    
    s.earX = THREE.MathUtils.lerp(s.earX || 0, target.earX, lerpSpeed);
    s.earZ = THREE.MathUtils.lerp(s.earZ || 0, target.earZ, lerpSpeed);

    // Apply to Meshes
    if (legFL.current) legFL.current.rotation.x = s.legFL;
    if (legFR.current) legFR.current.rotation.x = s.legFR;
    if (legBL.current) legBL.current.rotation.x = s.legBL;
    if (legBR.current) legBR.current.rotation.x = s.legBR;
    
    if (headGroup.current) {
      headGroup.current.rotation.x = s.headX;
      headGroup.current.rotation.y = s.headY;
      headGroup.current.rotation.z = s.headZ;
    }
    
    if (earL.current) {
      earL.current.rotation.x = s.earX;
      earL.current.rotation.z = s.earZ;
    }
    if (earR.current) {
      earR.current.rotation.x = s.earX;
      earR.current.rotation.z = -s.earZ;
    }
    
    if (tail.current) {
      tail.current.rotation.z = s.tailZ;
      tail.current.rotation.x = s.tailY;
    }

    if (group.current) {
      group.current.position.y = s.bodyY;
      group.current.rotation.z = s.bodyRotZ;
    }

    // Actions
    if (input.justSat) {
      setIsSitting(!isSitting);
      setIsLyingDown(false);
      setIsRolling(false);
    }

    if (input.justLayDown) {
      setIsLyingDown(!isLyingDown);
      setIsSitting(false);
      setIsRolling(false);
    }

    if (input.justSniffed) {
      setIsSniffing(!isSniffing);
      setSniffTimer(1); // Trigger immediately on start
    }

    if (isSniffing) {
      setSniffTimer(t => t + delta);
      if (sniffTimer > 1) {
        setSniffTimer(0);
        
        // Find nearest dig spot
        const digSpots = useGameStore.getState().digSpots;
        let nearestDist = Infinity;
        for (const spot of digSpots) {
          if (spot.active) {
            const spotPos = new THREE.Vector3(spot.pos[0], spot.pos[1], spot.pos[2]);
            const dist = currentPos.distanceTo(spotPos);
            if (dist < nearestDist) nearestDist = dist;
          }
        }
        
        if (nearestDist < 3) {
          setReaction("❗"); // Found it! Dig here!
          setReactionTimer(1);
        } else if (nearestDist < 10) {
          setReaction("🐾"); // Getting warm
          setReactionTimer(1);
        } else if (nearestDist < 25) {
          setReaction("🔎"); // Getting closer
          setReactionTimer(1);
        } else {
          setReaction("❓"); // Cold
          setReactionTimer(1);
        }
      }
    } else {
      setSniffTimer(0);
    }

    if (input.justRolled && !isSitting && !isLyingDown && eating <= 0) {
      const newRolling = !isRolling;
      setIsRolling(newRolling);
      setIsSniffing(false);
      if (newRolling) {
        rb.current.applyImpulse({ x: 0, y: 5, z: 0 }, true); // Little hop start
      } else {
        rb.current.applyImpulse({ x: 0, y: 5, z: 0 }, true); // Little hop end
      }
    }

    if (poopCooldown > 0) {
      setPoopCooldown(c => c - delta);
    }

    if (input.justPooped && !isJumping && !isMoving) {
      if (poopCooldown <= 0) {
        // Spawn poop behind dog
        const backDir = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), group.current.rotation.y);
        const poopPos = currentPos.clone().add(backDir.multiplyScalar(1.5));
        addPoop([poopPos.x, poopPos.y, poopPos.z]);
        setPoopCooldown(5); // 5 seconds cooldown
        playPoopSound();
      } else {
        setReaction("❌");
        setReactionTimer(1);
      }
    }

    if (input.justDug && !isJumping && !isMoving && !isSitting && !isLyingDown && !isRolling && !isDrinking) {
      setIsDigging(true);
      setDigTimer(2.0); // Dig for 2 seconds
    }

    if (isDigging) {
      if (digTimer > 0) {
        setDigTimer(t => t - delta);
        // Spawn dirt particles
        if (Math.random() < 0.3) {
          const forwardDir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), group.current.rotation.y);
          const pPos = currentPos.clone().add(forwardDir.multiplyScalar(0.5));
          setDigParticles(p => [...p, {
            id: Date.now() + Math.random(),
            time: 0.5 + Math.random() * 0.5,
            x: pPos.x + (Math.random() - 0.5) * 0.5,
            y: pPos.y,
            z: pPos.z + (Math.random() - 0.5) * 0.5,
            vx: (Math.random() - 0.5) * 4,
            vy: 2 + Math.random() * 3,
            vz: (Math.random() - 0.5) * 4
          }]);
        }
      } else {
        setIsDigging(false);
        
        // Check for dig spots
        const digSpots = useGameStore.getState().digSpots;
        const digSpot = useGameStore.getState().digSpot;
        
        const forwardDir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), group.current.rotation.y);
        const digPos = currentPos.clone().add(forwardDir.multiplyScalar(1.5));
        
        let foundSpot = false;
        for (const spot of digSpots) {
          if (spot.active) {
            const spotPos = new THREE.Vector3(spot.pos[0], spot.pos[1], spot.pos[2]);
            if (digPos.distanceTo(spotPos) < 2.5) {
              digSpot(spot.id);
              addBone([spotPos.x, spotPos.y + 1, spotPos.z]);
              useGameStore.getState().addStar(); // Good dog!
              foundSpot = true;
              break;
            }
          }
        }
        
        if (!foundSpot) {
          setReaction("?");
          setReactionTimer(1);
        }
      }
    }

    // Update Dig Particles
    setDigParticles(p => p.map(d => ({
      ...d,
      time: d.time - delta,
      x: d.x + d.vx * delta,
      y: d.y + d.vy * delta,
      z: d.z + d.vz * delta,
      vy: d.vy - 9.8 * delta // Gravity
    })).filter(d => d.time > 0));

    // Dust Particles when running
    if (isRunning && !isJumping) {
      if (Math.random() < 0.2) {
        setDustParticles(p => [...p, {
          id: Date.now() + Math.random(),
          time: 0.5,
          x: currentPos.x + (Math.random() - 0.5) * 0.5,
          y: currentPos.y - 0.4,
          z: currentPos.z + (Math.random() - 0.5) * 0.5,
          scale: 0.2 + Math.random() * 0.3
        }]);
      }
    }
    
    // Update Dust Particles
    setDustParticles(p => p.map(d => ({
      ...d,
      time: d.time - delta,
      y: d.y + delta * 0.5,
      scale: d.scale + delta * 0.5
    })).filter(d => d.time > 0));

    // Update Splash Particles
    setSplashParticles(p => p.map(d => ({
      ...d,
      time: d.time - delta,
      x: d.x + d.vx * delta,
      y: d.y + d.vy * delta,
      z: d.z + d.vz * delta,
      vy: d.vy - 15 * delta, // Gravity
      scale: d.scale * 0.95
    })).filter(d => d.time > 0 && d.y > 0));

    // Zzz Particles when sleeping
    if (isLyingDown) {
      if (Math.random() < 0.02) {
        setZzzParticles(p => [...p, { id: Date.now(), time: 2, x: (Math.random() - 0.5) * 0.5, y: 0 }]);
      }
    }
    setZzzParticles(p => p.map(z => ({ ...z, time: z.time - delta, y: z.y + delta * 0.5 })).filter(z => z.time > 0));

    // Barking
    if (input.justBarked) {
      addBark(currentPos);
      setBarking(0.5); // show bark bubble for 0.5s
      playBarkSound();
    }

    if (barking > 0) {
      setBarking(b => b - delta);
    }
    
    if (eating > 0) {
      setEating(e => e - delta);
    }
    
    if (isDrinking) {
      // Stop drinking if we move or jump
      if (input.x !== 0 || input.z !== 0 || input.jump) {
        setIsDrinking(false);
      }
    }

    // Interaction (Grab / Throw)
    if (input.justInteracted) {
      const heldBall = heldBalls[playerIndex];
      const heldBone = heldBones[playerIndex];
      const heldFrisbee = heldFrisbees[playerIndex];

      if (heldBall != null) {
        triggerThrow(playerIndex, 'ball', heldBall);
        dropBall(playerIndex);
      } else if (heldBone != null) {
        triggerThrow(playerIndex, 'bone', heldBone);
        dropBone(playerIndex);
      } else if (heldFrisbee != null) {
        triggerThrow(playerIndex, 'frisbee', heldFrisbee);
        dropFrisbee(playerIndex);
      } else {
        // Try to grab a ball, bone, or frisbee
        let nearestBallId: number | null = null;
        let minBallDist = 4; // grab radius
        for (const [idStr, bPos] of Object.entries(ballPositions)) {
          const id = Number(idStr);
          if (Object.values(heldBalls).includes(id)) continue;
          const dist = currentPos.distanceTo(bPos);
          if (dist < minBallDist) {
            minBallDist = dist;
            nearestBallId = id;
          }
        }
        
        let nearestBoneId: number | null = null;
        let minBoneDist = 4; // grab radius
        for (const [idStr, bPos] of Object.entries(bonePositions)) {
          const id = Number(idStr);
          if (Object.values(heldBones).includes(id)) continue;
          const dist = currentPos.distanceTo(bPos);
          if (dist < minBoneDist) {
            minBoneDist = dist;
            nearestBoneId = id;
          }
        }

        let nearestFrisbeeId: number | null = null;
        let minFrisbeeDist = 4; // grab radius
        for (const [idStr, bPos] of Object.entries(frisbeePositions)) {
          const id = Number(idStr);
          if (Object.values(heldFrisbees).includes(id)) continue;
          const dist = currentPos.distanceTo(bPos);
          if (dist < minFrisbeeDist) {
            minFrisbeeDist = dist;
            nearestFrisbeeId = id;
          }
        }

        // Find the absolute closest item
        let closestType: 'ball' | 'bone' | 'frisbee' | null = null;
        let closestDist = 4;
        
        if (nearestBallId != null && minBallDist < closestDist) {
          closestType = 'ball';
          closestDist = minBallDist;
        }
        if (nearestBoneId != null && minBoneDist < closestDist) {
          closestType = 'bone';
          closestDist = minBoneDist;
        }
        if (nearestFrisbeeId != null && minFrisbeeDist < closestDist) {
          closestType = 'frisbee';
          closestDist = minFrisbeeDist;
        }

        if (closestType === 'ball' && nearestBallId != null) {
          grabBall(playerIndex, nearestBallId);
        } else if (closestType === 'bone' && nearestBoneId != null) {
          grabBone(playerIndex, nearestBoneId);
        } else if (closestType === 'frisbee' && nearestFrisbeeId != null) {
          grabFrisbee(playerIndex, nearestFrisbeeId);
        }
      }
    }

    // Eating & Drinking
    if (input.justAte) {
      const heldBone = heldBones[playerIndex];
      if (heldBone != null) {
        // Eat held bone
        removeBone(heldBone);
        dropBone(playerIndex);
        setEating(1.5);
        setBarking(0);
        setIsSitting(false);
        useGameStore.getState().addStar(); // Good dog!
      } else {
        // Check for food on ground
        let ate = false;
        const currentFoods = useGameStore.getState().foods;
        for (const food of currentFoods) {
          const foodPos = new THREE.Vector3(food.pos[0], food.pos[1], food.pos[2]);
          if (currentPos.distanceTo(foodPos) < 2) {
            removeFood(food.id);
            ate = true;
            setEating(1.5);
            setBarking(0);
            setIsSitting(false);
            useGameStore.getState().addStar(); // Good dog!
            break;
          }
        }

        if (!ate) {
          // Check for bones on ground
          for (const [idStr, bPos] of Object.entries(bonePositions)) {
            const id = Number(idStr);
            if (Object.values(heldBones).includes(id)) continue;
            if (currentPos.distanceTo(bPos) < 2) {
              removeBone(id);
              ate = true;
              setEating(1.5);
              setBarking(0);
              setIsSitting(false);
              useGameStore.getState().addStar(); // Good dog!
              break;
            }
          }
        }

        if (!ate) {
          // Check for pond drinking
          const distToPond = currentPos.distanceTo(new THREE.Vector3(0, 0, 0));
          if (distToPond < 8.5 && distToPond > 6) {
            const angleToPond = Math.atan2(-currentPos.x, -currentPos.z);
            group.current.rotation.y = angleToPond;
            setIsDrinking(true);
            setIsSitting(false);
            setIsLyingDown(false);
          }
        }
      }
    }

    // Interaction with other dogs
    if (reactionTimer > 0) {
      setReactionTimer(t => t - delta);
    } else if (reaction !== null && !isSniffing) {
      setReaction(null);
    }

    const barks = useGameStore.getState().barks;
    
    if (otherDogPos) {
      const dist = currentPos.distanceTo(otherDogPos);
      if (dist < 5) {
        for (const bark of barks) {
          if (Date.now() - bark.time < 100 && bark.pos.distanceTo(otherDogPos) < 1) {
            setReaction("!");
            setReactionTimer(1);
          }
        }
      }
    }

    // Update store
    setDogPosition(playerIndex, currentPos, group.current.rotation.y);
  });

  return (
    <RigidBody ref={rb} position={position} colliders={false} lockRotations mass={2} friction={0}>
      <CuboidCollider args={[0.4, 0.4, 0.6]} position={[0, 0.4, 0]} />
      <group ref={group} position={[0, 0, 0]}>
        {/* Body */}
        <mesh position={[0, 0.5, 0]} castShadow>
          <boxGeometry args={[0.6, 0.5, 1]} />
          <meshStandardMaterial color={color} />
        </mesh>
        
        {zzzParticles.map(z => (
          <Text
            key={z.id}
            position={[z.x, 1.5 + z.y, 0.5]}
            fontSize={0.3}
            color="white"
            anchorX="center"
            anchorY="middle"
            material-opacity={z.time / 2}
            material-transparent
          >
            Z
          </Text>
        ))}

        {/* Head Group */}
        <group ref={headGroup} position={[0, 0.75, 0.5]}>
          {/* Head Main */}
          <mesh position={[0, 0.15, 0]} castShadow>
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshStandardMaterial color={color} />
          </mesh>
          {/* Collar */}
          <mesh position={[0, -0.15, -0.1]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[0.25, 0.06, 8, 16]} />
            <meshStandardMaterial 
              color={stars >= 30 ? "#00ffff" : stars >= 20 ? "#ffd700" : stars >= 10 ? "#0000ff" : "#ff0000"} 
              emissive={stars >= 30 ? "#00ffff" : "black"}
              emissiveIntensity={stars >= 30 ? 0.5 : 0}
            />
          </mesh>
          {/* Snout */}
          <mesh position={[0, 0.05, 0.3]} castShadow>
            <boxGeometry args={[0.3, 0.2, 0.3]} />
            <meshStandardMaterial color="#fff8dc" />
          </mesh>
          {/* Nose */}
          <mesh position={[0, 0.1, 0.46]} castShadow>
            <boxGeometry args={[0.1, 0.1, 0.1]} />
            <meshStandardMaterial color="black" />
          </mesh>
          {/* Ears */}
          <group position={[-0.2, 0.35, -0.1]}>
            <mesh ref={earL} position={[0, 0, 0]} castShadow>
              <boxGeometry args={[0.1, 0.3, 0.2]} />
              <meshStandardMaterial color="#8b4513" />
            </mesh>
          </group>
          <group position={[0.2, 0.35, -0.1]}>
            <mesh ref={earR} position={[0, 0, 0]} castShadow>
              <boxGeometry args={[0.1, 0.3, 0.2]} />
              <meshStandardMaterial color="#8b4513" />
            </mesh>
          </group>
        </group>

        {/* Legs - Pivoted at top */}
        <group position={[-0.2, 0.5, 0.3]}>
          <mesh ref={legFL} position={[0, -0.25, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.08, 0.5]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </group>
        <group position={[0.2, 0.5, 0.3]}>
          <mesh ref={legFR} position={[0, -0.25, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.08, 0.5]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </group>
        <group position={[-0.2, 0.5, -0.3]}>
          <mesh ref={legBL} position={[0, -0.25, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.08, 0.5]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </group>
        <group position={[0.2, 0.5, -0.3]}>
          <mesh ref={legBR} position={[0, -0.25, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.08, 0.5]} />
            <meshStandardMaterial color={color} />
          </mesh>
        </group>

        {/* Tail */}
        <mesh ref={tail} position={[0, 0.6, -0.5]} rotation={[Math.PI / 4, 0, 0]} castShadow>
          <coneGeometry args={[0.08, 0.4]} />
          <meshStandardMaterial color={color} />
        </mesh>
      </group>
      {barking > 0 && (
        <Text position={[0, 2, 0]} fontSize={0.5} color="white" outlineWidth={0.05} outlineColor="black">
          WOOF!
        </Text>
      )}
      {eating > 0 && (
        <Text position={[0, 2, 0]} fontSize={0.5} color="#ffeb3b" outlineWidth={0.05} outlineColor="black">
          YUM!
        </Text>
      )}
      {reaction && (
        <Text position={[0, 2.5, 0]} fontSize={0.8} color="#ff00ff" outlineWidth={0.05} outlineColor="black">
          {reaction}
        </Text>
      )}

      {/* Dust Particles */}
      {dustParticles.map(p => (
        <mesh key={p.id} position={[p.x, p.y, p.z]} scale={p.scale}>
          <sphereGeometry args={[0.5, 8, 8]} />
          <meshBasicMaterial color="#d7ccc8" transparent opacity={p.time * 2} />
        </mesh>
      ))}

      {/* Dig Particles */}
      {digParticles.map(p => (
        <mesh key={p.id} position={[p.x, p.y, p.z]}>
          <boxGeometry args={[0.2, 0.2, 0.2]} />
          <meshStandardMaterial color="#5d4037" />
        </mesh>
      ))}

      {/* Splash Particles */}
      {splashParticles.map(p => (
        <mesh key={p.id} position={[p.x, p.y, p.z]} scale={p.scale}>
          <sphereGeometry args={[0.3, 8, 8]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={p.time * 2} />
        </mesh>
      ))}
    </RigidBody>
  );
}
