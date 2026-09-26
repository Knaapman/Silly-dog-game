import {
  CuboidCollider,
  CylinderCollider,
  InstancedRigidBodies,
  RigidBody,
  useRevoluteJoint,
  type InstancedRigidBodyProps,
  type RapierCollider,
  type RapierRigidBody
} from '@react-three/rapier';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playBoing } from '../audio';
import { MOVE } from '../config';
import { emit } from '../fx';
import { BALL_PIT, BOUNCY_CASTLE, SEESAWS, SLIDE_TOWER, TRAMPOLINES } from '../layout';
import { lambert } from '../materials';
import { debugInfo, players, type Surface } from '../runtime';
import { SlideTower, StaticBox, useHint } from './common';
import { Prop } from './Prop';
import { useSurface } from './surface';
import { Trampoline } from './Toys';
import { gameClock, gameNow, useGameFrame } from '../clock';

const CASTLE_COLORS = ['#ff4d5e', '#ffd23f', '#3b82f6', '#22c55e'];

/** Inflatable castle: the floor bounces you all the time. */
function BouncyCastle() {
  const [cx, cz] = BOUNCY_CASTLE.center;
  const size = BOUNCY_CASTLE.size;
  const half = size / 2;
  const floorCol = useRef<RapierCollider>(null);
  const floorMesh = useRef<THREE.Mesh>(null);
  const lastBounce = useRef(-1e9);
  const surface = useMemo<Surface>(() => ({ bounce: 12, onBounce: () => (lastBounce.current = gameNow()) }), []);
  useSurface(floorCol, surface);
  useHint([cx, 1, cz + half], 'jump', 5);

  useGameFrame(() => {
    const m = floorMesh.current;
    if (!m) return;
    const since = (gameNow() - lastBounce.current) / 1000;
    const dip = since < 0.5 ? Math.sin(since * 20) * Math.exp(-since * 6) * 0.12 : 0;
    m.scale.y = 1 - Math.abs(dip) * 2;
    m.position.y = 0.25 + Math.sin(gameClock.time * 3) * 0.02;
  });

  const wall = (x: number, z: number, w: number, d: number, color: string, key: string) => (
    <group key={key}>
      <StaticBox position={[x, 0.95, z]} size={[w, 1.4, d]} color={color} restitution={0.9} />
      <mesh castShadow position={[x, 1.65, z]} rotation={w > d ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]} material={lambert('#ffffff')}>
        <cylinderGeometry args={[Math.min(w, d) / 2 + 0.05, Math.min(w, d) / 2 + 0.05, Math.max(w, d), 12]} />
      </mesh>
    </group>
  );
  const gap = 1.3;
  return (
    <group>
      <RigidBody type="fixed" colliders={false} position={[cx, 0, cz]}>
        <CuboidCollider ref={floorCol} args={[half, 0.25, half]} position={[0, 0.25, 0]} restitution={0.8} />
      </RigidBody>
      <mesh ref={floorMesh} receiveShadow castShadow position={[cx, 0.25, cz]} material={lambert('#8fd3ff')}>
        <boxGeometry args={[size, 0.5, size]} />
      </mesh>
      {wall(cx, cz - half + 0.3, size, 0.6, CASTLE_COLORS[0], 'back')}
      {wall(cx - half + 0.3, cz, 0.6, size, CASTLE_COLORS[2], 'left')}
      {wall(cx + half - 0.3, cz, 0.6, size, CASTLE_COLORS[2], 'right')}
      {wall(cx - (half + gap) / 2, cz + half - 0.3, half - gap, 0.6, CASTLE_COLORS[0], 'fl')}
      {wall(cx + (half + gap) / 2, cz + half - 0.3, half - gap, 0.6, CASTLE_COLORS[0], 'fr')}
      {[
        [-half, -half],
        [half, -half],
        [-half, half],
        [half, half]
      ].map(([dx, dz], i) => (
        <group key={i} position={[cx + dx * 0.95, 0, cz + dz * 0.95]}>
          <RigidBody type="fixed" colliders={false}>
            <CylinderCollider args={[1.3, 0.65]} position={[0, 1.3, 0]} />
          </RigidBody>
          <mesh castShadow position={[0, 1.3, 0]} material={lambert(CASTLE_COLORS[(i + 1) % 4])}>
            <cylinderGeometry args={[0.65, 0.7, 2.6, 14]} />
          </mesh>
          <mesh castShadow position={[0, 3, 0]} material={lambert(CASTLE_COLORS[(i + 2) % 4])}>
            <coneGeometry args={[0.8, 1, 14]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const seesawTmp = new THREE.Vector3();
const seesawQuat = new THREE.Quaternion();

/** See-saw on a real hinge: land on one end to fling whatever is on the other. */
function SeeSaw({ index }: { index: number }) {
  const { center, angle } = SEESAWS[index];
  const fulcrum = useRef<RapierRigidBody>(null);
  const plank = useRef<RapierRigidBody>(null);
  const joint = useRevoluteJoint(fulcrum, plank, [
    [0, 0.9, 0],
    [0, 0, 0],
    [0, 0, 1],
    [-0.38, 0.38]
  ]);
  // Jointed bodies collide by default: the fulcrum block would prop the plank level.
  useEffect(() => {
    joint.current?.setContactsEnabled(false);
  }, [joint]);
  useHint([center[0], 1, center[1]], 'jump', 4);
  const colors = index === 0 ? ['#ff4d5e', '#ffd23f'] : ['#3b82f6', '#22c55e'];

  // Real physics only lifts a friend on the other end by ~half a metre. Exaggerate it: when a
  // resting see-saw is slammed, whoever was already standing on the rising end gets flung.
  // Who that is gets decided at the start of the swing, from how things were just before it
  // (the jolt itself shakes everyone). The slammer's own end bounces back up right after it
  // touches down; that rebound doesn't count, because that end hasn't been resting low.
  const swing = useRef({ until: 0, dir: 0 });
  const low = useRef({ end: 0, since: 0 });
  const settled = useRef(new Map<number, { end: number; since: number }>());
  const flung = useRef(new Map<number, number>());
  useGameFrame(() => {
    const body = plank.current;
    if (!body) return;
    const now = gameNow();
    const w = body.angvel();
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    // hinge = the group's local z axis in world space; ω > 0 raises the local +x end
    const omega = w.x * sin + w.z * cos;
    const q = body.rotation();
    const tilt = seesawTmp.set(1, 0, 0).applyQuaternion(seesawQuat.set(q.x, q.y, q.z, q.w)).y; // > 0: +x end up
    const lowEnd = tilt < -0.08 ? 1 : tilt > 0.08 ? -1 : 0;

    // 1. A new swing that lifts an end which was resting low: fling whoever was settled on it.
    if (Math.abs(omega) > 0.9) {
      const dir = Math.sign(omega);
      const fresh = dir !== swing.current.dir || now > swing.current.until;
      if (fresh && low.current.end === dir && now - low.current.since > 400) {
        players.forEach((p) => {
          const was = settled.current.get(p.slot);
          if (!was || was.end !== dir || now - was.since < 400 || now < (flung.current.get(p.slot) ?? 0)) return;
          flung.current.set(p.slot, now + 900);
          settled.current.delete(p.slot);
          debugInfo.seesawFlings = ((debugInfo.seesawFlings as number | undefined) ?? 0) + 1;
          p.hop(MOVE.trampolineVelocity * 0.85);
          playBoing(p.position, 0.8);
          emit('star', [p.position.x, p.position.y, p.position.z], { count: 8, color: ['#ffd23f', '#ffffff', colors[0]], speed: 4, up: 3 });
        });
      }
      swing.current.until = now + 180;
      swing.current.dir = dir;
    }
    if (lowEnd !== low.current.end) low.current = { end: lowEnd, since: now };

    // 2. Who is calmly standing on which end (for the next swing).
    for (const p of players.values()) {
      // read the body, not p.position: players may not have run their frame yet
      const rb = p.getBody();
      if (!rb) continue;
      const t = rb.translation();
      const dx = t.x - center[0];
      const dz = t.z - center[1];
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      const onPlank = Math.abs(lz) < 0.9 && Math.abs(lx) > 0.8 && Math.abs(lx) < 3.3 && t.y < 2.8;
      // riding the plank up or down is fine; falling onto it is not
      const steady = onPlank && Math.abs(rb.linvel().y - omega * lx) < 1.5 && !p.isLaunched() && !p.asleep;
      const end = Math.sign(lx);
      const was = settled.current.get(p.slot);
      if (!steady) settled.current.delete(p.slot);
      else if (!was || was.end !== end) settled.current.set(p.slot, { end, since: now });
    }
  });
  return (
    <group position={[center[0], 0, center[1]]} rotation={[0, angle, 0]}>
      <RigidBody ref={fulcrum} type="fixed" colliders={false}>
        <CuboidCollider args={[0.3, 0.42, 0.45]} position={[0, 0.42, 0]} />
        <mesh castShadow position={[0, 0.42, 0]} material={lambert('#90a4ae')}>
          <cylinderGeometry args={[0.15, 0.5, 0.84, 4]} />
        </mesh>
      </RigidBody>
      <RigidBody ref={plank} colliders={false} position={[0, 0.9, 0]} angularDamping={0.4} canSleep={false}>
        <CuboidCollider args={[3, 0.1, 0.55]} density={0.45} />
        <mesh castShadow receiveShadow material={lambert(colors[0])}>
          <boxGeometry args={[6, 0.2, 1.1]} />
        </mesh>
        {[-2.6, 2.6].map((x) => (
          <mesh key={x} castShadow position={[x, 0.35, 0]} material={lambert(colors[1])}>
            <boxGeometry args={[0.12, 0.5, 0.9]} />
          </mesh>
        ))}
      </RigidBody>
    </group>
  );
}

const PIT_BALLS = 50;
const PIT_COLORS = ['#ff4d5e', '#ffd23f', '#3b82f6', '#22c55e', '#a855f7', '#ff8fd8'];

function BallPit() {
  const [cx, cz] = BALL_PIT.center;
  const half = BALL_PIT.size / 2;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const instances = useMemo<InstancedRigidBodyProps[]>(
    () =>
      Array.from({ length: PIT_BALLS }, (_, i) => ({
        key: `pit-${i}`,
        position: [cx + ((i % 7) - 3) * 0.75, 0.3 + Math.floor(i / 49) * 0.5 + (i % 3) * 0.12, cz + (Math.floor(i / 7) % 7 - 3) * 0.75] as [number, number, number]
      })),
    [cx, cz]
  );
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const c = new THREE.Color();
    for (let i = 0; i < PIT_BALLS; i += 1) m.setColorAt(i, c.set(PIT_COLORS[i % PIT_COLORS.length]));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, []);
  useHint([cx, 1, cz + half], 'jump', 4.5);
  const wall = 0.3;
  return (
    <group>
      <mesh position={[cx, 0.02, cz]} rotation={[-Math.PI / 2, 0, 0]} material={lambert('#ffffff')}>
        <planeGeometry args={[BALL_PIT.size, BALL_PIT.size]} />
      </mesh>
      <StaticBox position={[cx, 0.4, cz - half]} size={[BALL_PIT.size + wall, 0.8, wall]} color="#ff8fd8" />
      <StaticBox position={[cx, 0.4, cz + half]} size={[BALL_PIT.size + wall, 0.8, wall]} color="#ff8fd8" />
      <StaticBox position={[cx - half, 0.4, cz]} size={[wall, 0.8, BALL_PIT.size + wall]} color="#8fd3ff" />
      <StaticBox position={[cx + half, 0.4, cz]} size={[wall, 0.8, BALL_PIT.size + wall]} color="#8fd3ff" />
      <InstancedRigidBodies instances={instances} colliders="ball" restitution={0.5} friction={0.4} linearDamping={0.3} angularDamping={0.3}>
        <instancedMesh ref={mesh} args={[undefined, undefined, PIT_BALLS]} castShadow frustumCulled={false}>
          <sphereGeometry args={[0.24, 10, 8]} />
          <meshLambertMaterial />
        </instancedMesh>
      </InstancedRigidBodies>
    </group>
  );
}

export function Playground() {
  return (
    <group>
      <SlideTower
        base={SLIDE_TOWER.base}
        height={SLIDE_TOWER.height}
        rampAngle={Math.PI}
        rampLength={10}
        slideAngle={Math.PI / 2}
        slideLength={9.5}
        colors={{ tower: '#ffd23f', ramp: '#3b82f6', slide: '#ff4d5e', rail: '#ffffff' }}
      />
      <BouncyCastle />
      {SEESAWS.map((_, i) => (
        <SeeSaw key={i} index={i} />
      ))}
      <BallPit />
      {TRAMPOLINES.map((t, i) => (
        <Trampoline key={i} position={t.position} radius={t.radius} color={i} />
      ))}
      <Prop kind="beachball" position={[30, 1.8, 46]} />
      <Prop kind="beachball" position={[40, 1, 36]} />
      <Prop kind="ball" position={[36, 1.5, 40]} color="#ffd23f" />
    </group>
  );
}
