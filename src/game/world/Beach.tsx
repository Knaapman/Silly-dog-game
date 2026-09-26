import { useFrame } from '@react-three/fiber';
import { BallCollider, CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ISLAND, LAKE, LIGHTHOUSE, SANDCASTLES, SHIP, type Vec3 } from '../layout';
import { lambert, stripeTexture } from '../materials';
import { Breakable, type Piece } from './Breakable';
import { Ramp, StaticBox } from './common';
import { Cannon } from './Launchers';
import { Prop } from './Prop';

function Lake() {
  const water = useRef<THREE.Mesh>(null);
  const capAngle = Math.acos((ISLAND.sphereRadius - ISLAND.height) / ISLAND.sphereRadius);
  useFrame(({ clock }) => {
    const m = water.current?.material as THREE.MeshStandardMaterial | undefined;
    if (m) m.color.setHSL(0.56, 0.75, 0.58 + Math.sin(clock.elapsedTime * 1.5) * 0.025);
  });
  return (
    <group>
      <mesh ref={water} receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[LAKE.center[0], 0.04, LAKE.center[1]]}>
        <circleGeometry args={[LAKE.radius, 56]} />
        <meshStandardMaterial color="#4fc3f7" roughness={0.15} metalness={0.1} />
      </mesh>
      {[[5, -4, 0.8], [-6, 6, 0.9], [7, 6, 0.7], [-4, -7, 0.75]].map(([x, z, r], i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, i]} position={[LAKE.center[0] + x, 0.05, LAKE.center[1] + z]} material={lambert('#4caf50')}>
          <circleGeometry args={[r, 16, 0.3, Math.PI * 1.75]} />
        </mesh>
      ))}
      <RigidBody type="fixed" colliders={false} position={[ISLAND.center[0], ISLAND.height - ISLAND.sphereRadius, ISLAND.center[1]]}>
        <BallCollider args={[ISLAND.sphereRadius]} />
        <mesh receiveShadow castShadow material={lambert('#f2dc9b')}>
          <sphereGeometry args={[ISLAND.sphereRadius, 40, 12, 0, Math.PI * 2, 0, capAngle]} />
        </mesh>
      </RigidBody>
    </group>
  );
}

function Lighthouse() {
  const [lx, lz] = LIGHTHOUSE.center;
  const h = LIGHTHOUSE.height;
  const beam = useRef<THREE.Group>(null);
  const stripes = useMemo(() => {
    const t = stripeTexture('lighthouse', ['#ff4d5e', '#ffffff', '#ff4d5e', '#ffffff'], false).clone();
    t.needsUpdate = true;
    return new THREE.MeshLambertMaterial({ map: t });
  }, []);
  useFrame((_, delta) => {
    if (beam.current) beam.current.rotation.y += delta * 0.8;
  });
  const base = ISLAND.height - 0.1;
  const towerH = h - base;
  const railSegments = 14;
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[towerH / 2, LIGHTHOUSE.radius]} position={[lx, base + towerH / 2, lz]} />
        <CylinderCollider args={[0.15, LIGHTHOUSE.balcony]} position={[lx, h - 0.15, lz]} />
        <CylinderCollider args={[0.8, 0.8]} position={[lx, h + 0.8, lz]} />
        {Array.from({ length: railSegments }, (_, i) => {
          const a = (i / railSegments) * Math.PI * 2;
          const len = (2 * Math.PI * LIGHTHOUSE.balcony) / railSegments + 0.05;
          return (
            <CuboidCollider
              key={i}
              args={[len / 2, 0.3, 0.06]}
              position={[lx + Math.cos(a) * LIGHTHOUSE.balcony, h + 0.3, lz + Math.sin(a) * LIGHTHOUSE.balcony]}
              rotation={[0, -a + Math.PI / 2, 0]}
            />
          );
        })}
      </RigidBody>
      <mesh castShadow position={[lx, base + towerH / 2, lz]} material={stripes}>
        <cylinderGeometry args={[LIGHTHOUSE.radius * 0.8, LIGHTHOUSE.radius, towerH, 20]} />
      </mesh>
      <mesh castShadow receiveShadow position={[lx, h - 0.15, lz]} material={lambert('#37474f')}>
        <cylinderGeometry args={[LIGHTHOUSE.balcony, LIGHTHOUSE.balcony, 0.3, 24]} />
      </mesh>
      <mesh position={[lx, h + 0.55, lz]} rotation={[Math.PI / 2, 0, 0]} material={lambert('#ffffff')}>
        <torusGeometry args={[LIGHTHOUSE.balcony, 0.05, 6, 32]} />
      </mesh>
      <mesh position={[lx, h + 0.8, lz]}>
        <cylinderGeometry args={[0.75, 0.75, 1.6, 16]} />
        <meshStandardMaterial color="#fff6c9" emissive="#ffe082" emissiveIntensity={0.8} transparent opacity={0.85} />
      </mesh>
      <mesh castShadow position={[lx, h + 1.95, lz]} material={lambert('#ff4d5e')}>
        <coneGeometry args={[1, 0.9, 16]} />
      </mesh>
      <group ref={beam} position={[lx, h + 0.8, lz]}>
        <mesh position={[5, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <coneGeometry args={[1.4, 10, 16, 1, true]} />
          <meshBasicMaterial color="#fff6c9" transparent opacity={0.18} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

function PirateShip() {
  const [sx, sz] = SHIP.center;
  const L = SHIP.length;
  const W = SHIP.width;
  const deck = SHIP.deck;
  const flag = useRef<THREE.Mesh>(null);
  const sail = useMemo(() => new THREE.MeshLambertMaterial({ map: stripeTexture('sail', ['#ffffff', '#ff4d5e', '#ffffff', '#ff4d5e'], false), side: THREE.DoubleSide }), []);
  useFrame(({ clock }) => {
    if (flag.current) flag.current.rotation.y = Math.sin(clock.elapsedTime * 3) * 0.3;
  });
  const [lx, lz] = LIGHTHOUSE.center;
  const cannonAt: Vec3 = [sx + L / 2 - 1.3, deck, sz];
  return (
    <group>
      {/* hull */}
      <StaticBox position={[sx, deck / 2 - 0.2, sz]} size={[L, deck + 0.4, W]} color="#8b5a2b" />
      <mesh castShadow position={[sx + L / 2 + 0.9, deck / 2 - 0.1, sz]} rotation={[0, Math.PI / 4, 0]} material={lambert('#8b5a2b')}>
        <boxGeometry args={[W / 1.42, deck + 0.2, W / 1.42]} />
      </mesh>
      <mesh receiveShadow position={[sx, deck + 0.01, sz]} rotation={[-Math.PI / 2, 0, 0]} material={lambert('#c9a36b')}>
        <planeGeometry args={[L - 0.2, W - 0.2]} />
      </mesh>
      <mesh position={[sx, 0.6, sz]} material={lambert('#ffd23f')}>
        <boxGeometry args={[L + 0.02, 0.25, W + 0.02]} />
      </mesh>
      {/* low railings (gap on the shore side for the gangplank) */}
      <StaticBox position={[sx, deck + 0.3, sz + W / 2 - 0.1]} size={[L, 0.6, 0.2]} color="#6d4c41" />
      <StaticBox position={[sx - L / 4 - 0.8, deck + 0.3, sz - W / 2 + 0.1]} size={[L / 2 - 1.6, 0.6, 0.2]} color="#6d4c41" />
      <StaticBox position={[sx + L / 4 + 0.8, deck + 0.3, sz - W / 2 + 0.1]} size={[L / 2 - 1.6, 0.6, 0.2]} color="#6d4c41" />
      <StaticBox position={[sx - L / 2 + 0.1, deck + 0.3, sz]} size={[0.2, 0.6, W]} color="#6d4c41" />
      {/* mast + sail + flag */}
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[3, 0.18]} position={[sx - 1, deck + 3, sz]} />
      </RigidBody>
      <mesh castShadow position={[sx - 1, deck + 3, sz]} material={lambert('#6d4c41')}>
        <cylinderGeometry args={[0.15, 0.2, 6, 10]} />
      </mesh>
      <mesh castShadow position={[sx - 1, deck + 3.4, sz + 0.25]} rotation={[0, Math.PI / 2, 0]} material={sail}>
        <planeGeometry args={[3, 3.2, 4, 4]} />
      </mesh>
      <mesh ref={flag} position={[sx - 1, deck + 6.2, sz]}>
        <planeGeometry args={[1.2, 0.7]} />
        <meshLambertMaterial color="#3b82f6" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[sx - 1, deck + 6.2, sz + 0.01]}>
        <circleGeometry args={[0.22, 16]} />
        <meshBasicMaterial color="#ffd23f" />
      </mesh>
      {/* gangplank from the beach */}
      <Ramp from={[sx, 0, sz - W / 2 - 6]} to={[sx, deck, sz - W / 2 + 0.1]} width={1.6} color="#a1887f" railColor="#6d4c41" railHeight={0.4} />
      <Cannon position={cannonAt} target={[lx, LIGHTHOUSE.height, lz + 1.6]} apex={LIGHTHOUSE.height + 4} />
    </group>
  );
}

const SAND_PIECES: Piece[] = [
  { shape: 'box', size: 0.8, color: '#e8c77d', offset: [0, 0.4, 0] },
  { shape: 'box', size: 0.6, color: '#f2d493', offset: [0.7, 0.3, 0.5] },
  { shape: 'box', size: 0.6, color: '#e8c77d', offset: [-0.7, 0.3, 0.5] },
  { shape: 'box', size: 0.5, color: '#f2d493', offset: [0.6, 0.3, -0.6] },
  { shape: 'box', size: 0.5, color: '#e8c77d', offset: [-0.6, 0.3, -0.6] },
  { shape: 'box', size: 0.45, color: '#f2d493', offset: [0, 1.1, 0] }
];

function Sandcastle({ at }: { at: [number, number] }) {
  return (
    <Breakable position={[at[0], 0, at[1]]} radius={1.1} height={1.8} pieces={SAND_PIECES} dust={['#f2dc9b', '#e8c77d']}>
      <mesh castShadow position={[0, 0.45, 0]} material={lambert('#e8c77d')}>
        <boxGeometry args={[1.6, 0.9, 1.6]} />
      </mesh>
      {[[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh castShadow position={[0, 0.65, 0]} material={lambert('#f2d493')}>
            <cylinderGeometry args={[0.3, 0.35, 1.3, 10]} />
          </mesh>
          <mesh castShadow position={[0, 1.45, 0]} material={lambert('#e8c77d')}>
            <coneGeometry args={[0.35, 0.4, 10]} />
          </mesh>
        </group>
      ))}
      <mesh castShadow position={[0, 1.2, 0]} material={lambert('#f2d493')}>
        <cylinderGeometry args={[0.4, 0.45, 0.6, 10]} />
      </mesh>
      <mesh position={[0, 1.8, 0]} material={lambert('#8b5a2b')}>
        <cylinderGeometry args={[0.02, 0.02, 0.6, 4]} />
      </mesh>
      <mesh position={[0.15, 1.95, 0]} material={lambert('#ff4d5e')}>
        <boxGeometry args={[0.3, 0.18, 0.02]} />
      </mesh>
    </Breakable>
  );
}

function Umbrella({ position, colors }: { position: Vec3; colors: string[] }) {
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ map: stripeTexture(`umb-${colors.join()}`, colors) }), [colors]);
  return (
    <group position={position}>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[1.2, 0.08]} position={[0, 1.2, 0]} />
      </RigidBody>
      <mesh castShadow position={[0, 1.2, 0]} material={lambert('#ffffff')}>
        <cylinderGeometry args={[0.05, 0.05, 2.4, 6]} />
      </mesh>
      <mesh castShadow position={[0, 2.4, 0]} material={mat}>
        <coneGeometry args={[1.5, 0.6, 12, 1, true]} />
      </mesh>
      <mesh position={[0.8, 0.02, 0.9]} rotation={[-Math.PI / 2, 0, 0.3]} material={lambert(colors[0])}>
        <planeGeometry args={[0.9, 1.8]} />
      </mesh>
    </group>
  );
}

export function Beach() {
  return (
    <group>
      <Lake />
      <Lighthouse />
      <PirateShip />
      {SANDCASTLES.map((at, i) => (
        <Sandcastle key={i} at={at} />
      ))}
      <Umbrella position={[-3, 0, 25.2]} colors={['#ff4d5e', '#ffffff']} />
      <Umbrella position={[13.5, 0, 33]} colors={['#3b82f6', '#ffd23f']} />
      <StaticBox position={[0, 0.3, 50.8]} size={[0.3, 0.6, 0.3]} color="#8b5a2b" />
      <Prop kind="beachball" position={[2, 1, 25]} />
      <Prop kind="beachball" position={[-13, 1, 40]} />
      <Prop kind="duck" position={[4, 0.35, 33]} />
      <Prop kind="duck" position={[6, 0.35, 42]} color="#ff8fd8" />
      <Prop kind="duck" position={[-5, 0.35, 44]} />
      <Prop kind="duck" position={[3, 0.35, 47]} color="#8fd3ff" />
    </group>
  );
}
