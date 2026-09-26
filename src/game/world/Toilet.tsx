import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playFlush, playPlop } from '../audio';
import { PARTY_POINTS } from '../config';
import { burstConfetti, emit, ring } from '../fx';
import { BALL_PIT, BOUNCY_CASTLE, distXZ, ICE, LAKE, TOILET } from '../layout';
import { lambert } from '../materials';
import { drains, players, shakeCamera, type Drain } from '../runtime';
import { useGame } from '../store';
import { Ramp, useHint } from './common';
import { gameNow, useGameFrame } from '../clock';

// A giant toilet on the plaza. Sit on it and poop (or toot): FLUSH! Everything swirls away,
// confetti pops, and whoever is sitting there gets flushed into the sky, landing somewhere fun.

const BOWL_R = 0.95;
const TOP = 1.0;
/** Soft landings: splash in the lake, the ball pit, the bouncy castle, a slide on the ice. */
const LANDINGS: THREE.Vector3[] = [
  new THREE.Vector3(LAKE.center[0] - 4, 0, LAKE.center[1] - 3),
  new THREE.Vector3(BALL_PIT.center[0], 0, BALL_PIT.center[1]),
  new THREE.Vector3(BOUNCY_CASTLE.center[0], 0.4, BOUNCY_CASTLE.center[1]),
  new THREE.Vector3(ICE.center[0], 0, ICE.center[1])
];

export function Toilet() {
  const [cx, , cz] = TOILET.position;
  const water = useRef<THREE.Mesh>(null);
  const bowl = useRef<THREE.Group>(null);
  const spin = useRef(0);
  const cooldown = useRef(0);
  const launch = useRef<{ at: number; slot: number } | null>(null);
  const seen = useRef(new Map<number, number>());
  const seated = useRef(new Set<number>());
  const drain = useMemo<Drain>(() => ({ x: cx, z: cz, radius: BOWL_R + 0.25, top: TOP, flushingUntil: 0 }), [cx, cz]);
  useHint([cx, TOP + 1, cz], 'poop', 3.2);

  useEffect(() => {
    drains.add(drain);
    return () => {
      drains.delete(drain);
    };
  }, [drain]);

  const flush = (slot: number) => {
    const now = gameNow();
    if (now < cooldown.current) return;
    cooldown.current = now + 3500;
    drain.flushingUntil = now + 1800;
    spin.current = 1.8;
    launch.current = { at: now + 1000, slot };
    playFlush([cx, TOP, cz]);
    burstConfetti([cx, TOP + 1.5, cz], 70, 7);
    ring([cx, 0.05, cz], { color: '#7fd3ff', radius: 4, duration: 0.8 });
    shakeCamera(0.2);
    useGame.getState().addParty(PARTY_POINTS.goal);
  };

  useGameFrame((_, delta) => {
    const now = gameNow();
    // Who is sitting on the seat, and did they just press the poop button?
    players.forEach((p) => {
      const onSeat = distXZ(p.position.x, p.position.z, cx, cz) < BOWL_R - 0.1 && p.position.y > TOP && p.position.y < TOP + 1.4 * p.size;
      // Running up the ramp would fly you right over the seat: it catches you instead. Plop!
      // (Only when arriving; walking off again is free.)
      if (onSeat && !seated.current.has(p.slot) && !p.isLaunched() && p.ridingOn == null) {
        const rb = p.getBody();
        if (rb) {
          const v = rb.linvel();
          rb.setLinvel({ x: v.x * 0.1, y: Math.min(v.y, 0), z: v.z * 0.1 }, true);
          playPlop([cx, TOP, cz], 1.2);
          emit('drop', [cx, TOP + 0.2, cz], { count: 10, color: ['#7fd3ff', '#ffffff'], speed: 2, up: 3, size: 0.12 });
        }
      }
      if (onSeat) seated.current.add(p.slot);
      else seated.current.delete(p.slot);
      const last = seen.current.get(p.slot) ?? p.poopAt;
      if (onSeat && p.poopAt > last) flush(p.slot);
      seen.current.set(p.slot, p.poopAt);
    });

    // Swirling water, and the bowl wobbling with excitement.
    const w = water.current;
    if (spin.current > 0) {
      spin.current -= delta;
      if (w) w.rotation.z += delta * 14 * Math.min(1, spin.current);
      if (Math.random() < 0.6) {
        const a = now * 0.012;
        emit('drop', [cx + Math.cos(a) * 0.5, TOP, cz + Math.sin(a) * 0.5], { count: 2, color: ['#7fd3ff', '#bfe9ff', '#ffffff'], speed: 1.5, up: 2.5, size: 0.12 });
      }
    }
    if (bowl.current) {
      const k = Math.max(0, spin.current);
      bowl.current.scale.set(1 + Math.sin(now * 0.03) * 0.04 * k, 1 - Math.sin(now * 0.03) * 0.04 * k, 1 + Math.sin(now * 0.03) * 0.04 * k);
    }

    // ...and whoosh, off they go.
    const l = launch.current;
    if (l && now >= l.at) {
      launch.current = null;
      const p = players.get(l.slot);
      if (p && distXZ(p.position.x, p.position.z, cx, cz) < BOWL_R + 0.6 && p.position.y < TOP + 2.5 * p.size) {
        const target = LANDINGS[Math.floor(Math.random() * LANDINGS.length)];
        // pop up out of the bowl first (clear of the seat rim), then fly
        const rb = p.getBody();
        const t = rb?.translation();
        if (rb && t) {
          rb.setTranslation({ x: t.x, y: TOP + 0.9 * p.size + 0.7, z: t.z }, true);
          rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
        }
        p.launchTo(target, 17);
        emit('drop', [p.position.x, p.position.y, p.position.z], { count: 30, color: ['#7fd3ff', '#ffffff'], speed: 4, up: 9 });
      }
    }
  });

  return (
    <group>
      <RigidBody type="fixed" colliders={false} position={[cx, 0, cz]}>
        {/* the bowl top is a solid seat you can stand (sit) on */}
        <CylinderCollider args={[TOP / 2, BOWL_R]} position={[0, TOP / 2, 0]} />
        {/* a low lip round the far half of the seat: walk up the ramp and you stop sitting on it */}
        {[-1.2, -0.6, 0, 0.6, 1.2].map((a) => (
          <CuboidCollider key={a} args={[0.08, 0.2, 0.3]} position={[Math.cos(a) * (BOWL_R - 0.05), TOP + 0.2, Math.sin(a) * (BOWL_R - 0.05)]} rotation={[0, -a, 0]} />
        ))}
        {/* tank on the north side: every landing spot is south, so launches never hit it */}
        <CuboidCollider args={[0.8, 0.8, 0.3]} position={[0, 1.3, -(BOWL_R + 0.05)]} />
      </RigidBody>
      <group position={[cx, 0, cz]}>
        <group ref={bowl}>
          <mesh castShadow receiveShadow position={[0, 0.48, 0]} material={lambert('#ffffff')}>
            <cylinderGeometry args={[BOWL_R, 0.62, 0.96, 28]} />
          </mesh>
          <mesh ref={water} position={[0, TOP - 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[BOWL_R - 0.2, 24]} />
            <meshLambertMaterial color="#6ec6ff" />
          </mesh>
          {/* swirl marks on the water */}
          <mesh position={[0, TOP - 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={lambert('#bfe9ff')}>
            <ringGeometry args={[0.2, 0.28, 16, 1, 0, Math.PI * 1.3]} />
          </mesh>
          {/* seat */}
          <mesh castShadow position={[0, TOP + 0.04, 0]} rotation={[Math.PI / 2, 0, 0]} material={lambert('#8fd3ff')}>
            <torusGeometry args={[BOWL_R - 0.12, 0.13, 10, 32]} />
          </mesh>
        </group>
        {/* tank, lid and the big pink handle */}
        <mesh castShadow receiveShadow position={[0, 1.3, -(BOWL_R + 0.05)]} material={lambert('#ffffff')}>
          <boxGeometry args={[1.6, 1.6, 0.6]} />
        </mesh>
        <mesh castShadow position={[0, 2.15, -(BOWL_R + 0.05)]} material={lambert('#e6f4ff')}>
          <boxGeometry args={[1.72, 0.12, 0.72]} />
        </mesh>
        <mesh castShadow position={[0, 1.75, -(BOWL_R - 0.3)]} rotation={[Math.PI / 2 + 0.18, 0, 0]} scale={[0.9, 1, 1]} material={lambert('#8fd3ff')}>
          <cylinderGeometry args={[BOWL_R - 0.05, BOWL_R - 0.05, 0.08, 28]} />
        </mesh>
        <mesh castShadow position={[-0.62, 1.95, -(BOWL_R - 0.3)]} rotation={[0.3, 0, 0]} material={lambert('#ff4f9a')}>
          <boxGeometry args={[0.12, 0.1, 0.45]} />
        </mesh>
      </group>
      {/* a ramp up to the seat, so nobody has to jump */}
      <Ramp from={[cx - 3.4, 0, cz]} to={[cx - BOWL_R + 0.05, TOP, cz]} width={1.3} color="#8fd3ff" railColor="#ffffff" />
    </group>
  );
}
