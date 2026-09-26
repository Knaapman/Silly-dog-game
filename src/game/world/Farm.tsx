import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playSpin, playWhoosh } from '../audio';
import { PARTY_POINTS } from '../config';
import { emit } from '../fx';
import { BARN, LAUNCH_PADS, MELON_PATCH, MUD, PASTURE, SILO, WINDMILL, type Vec3 } from '../layout';
import { barnTexture, lambert } from '../materials';
import { registerStatic, shakeCamera } from '../runtime';
import { useGame } from '../store';
import { Chickens } from './Chickens';
import { StaticBox, useHint } from './common';
import { Cows } from './Critters';
import { LaunchPad } from './Launchers';
import { Prop } from './Prop';
import { useGameFrame } from '../clock';

function Mud() {
  const bubbleTimer = useRef(0);
  useGameFrame((_, delta) => {
    bubbleTimer.current -= delta;
    if (bubbleTimer.current <= 0) {
      bubbleTimer.current = 0.4 + Math.random() * 0.8;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * MUD.radius * 0.8;
      emit('puff', [MUD.center[0] + Math.cos(a) * r, 0.05, MUD.center[1] + Math.sin(a) * r], { count: 1, color: '#7a5634', size: 0.18, speed: 0.1, up: 0.4, life: 0.6 });
    }
  });
  const blobs: [number, number, number][] = [
    [0, 0, MUD.radius],
    [1.8, 1.2, 2.2],
    [-1.9, -0.8, 2],
    [0.6, -1.8, 1.8]
  ];
  return (
    <group position={[MUD.center[0], 0, MUD.center[1]]}>
      {blobs.map(([x, z, r], i) => (
        <mesh key={i} receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02 + i * 0.002, z]}>
          <circleGeometry args={[r, 28]} />
          <meshStandardMaterial color="#6b4a2b" roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

function Barn() {
  const wallMat = useMemo(() => new THREE.MeshLambertMaterial({ map: barnTexture() }), []);
  const rise = BARN.ridgeHeight - BARN.wallHeight;
  const halfDepth = BARN.depth / 2;
  const slope = Math.atan2(rise, halfDepth);
  const roofLen = Math.hypot(rise, halfDepth) + 0.5;
  const gable = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-halfDepth, 0);
    shape.lineTo(halfDepth, 0);
    shape.lineTo(0, rise);
    shape.lineTo(-halfDepth, 0);
    return new THREE.ExtrudeGeometry(shape, { depth: BARN.width, bevelEnabled: false });
  }, [halfDepth, rise]);

  return (
    <group>
      <RigidBody type="fixed" colliders={false} position={[BARN.center[0], 0, BARN.center[1]]}>
        <CuboidCollider args={[BARN.width / 2, BARN.wallHeight / 2, BARN.depth / 2]} position={[0, BARN.wallHeight / 2, 0]} />
        {[-1, 1].map((side) => (
          <CuboidCollider
            key={side}
            args={[BARN.width / 2 + 0.3, 0.15, roofLen / 2]}
            position={[0, BARN.wallHeight + rise / 2, (side * halfDepth) / 2]}
            rotation={[side * slope, 0, 0]}
          />
        ))}
        <mesh castShadow receiveShadow position={[0, BARN.wallHeight / 2, 0]} material={wallMat}>
          <boxGeometry args={[BARN.width, BARN.wallHeight, BARN.depth]} />
        </mesh>
        <mesh castShadow position={[-BARN.width / 2, BARN.wallHeight, 0]} rotation={[0, Math.PI / 2, 0]} material={wallMat} geometry={gable} />
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            castShadow
            receiveShadow
            position={[0, BARN.wallHeight + rise / 2 + 0.1, (side * halfDepth) / 2]}
            rotation={[side * slope, 0, 0]}
            material={lambert('#5d4037')}
          >
            <boxGeometry args={[BARN.width + 0.6, 0.25, roofLen]} />
          </mesh>
        ))}
        {/* big door with a white X, facing the camera */}
        <group position={[0, 1.7, BARN.depth / 2 + 0.02]}>
          <mesh material={lambert('#8e2b28')}>
            <planeGeometry args={[3.4, 3.4]} />
          </mesh>
          {[1, -1].map((s) => (
            <mesh key={s} position={[0, 0, 0.01]} rotation={[0, 0, s * Math.PI / 4]} material={lambert('#ffffff')}>
              <planeGeometry args={[4.6, 0.25]} />
            </mesh>
          ))}
        </group>
        <mesh position={[0, BARN.wallHeight + 1.1, BARN.depth / 2 + 0.02]} material={lambert('#ffffff')}>
          <planeGeometry args={[1.4, 1.4]} />
        </mesh>
        <mesh position={[0, BARN.wallHeight + 1.1, BARN.depth / 2 + 0.03]} material={lambert('#f4c95d')}>
          <planeGeometry args={[1.1, 1.1]} />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed" colliders={false} position={[SILO.center[0], 0, SILO.center[1]]}>
        <CylinderCollider args={[SILO.height / 2, SILO.radius]} position={[0, SILO.height / 2, 0]} />
        <mesh castShadow receiveShadow position={[0, SILO.height / 2, 0]} material={lambert('#cfd8dc')}>
          <cylinderGeometry args={[SILO.radius, SILO.radius, SILO.height, 20]} />
        </mesh>
        <mesh castShadow position={[0, SILO.height, 0]} material={lambert('#e05a47')}>
          <sphereGeometry args={[SILO.radius, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      </RigidBody>
    </group>
  );
}


/** Headbutt the windmill and its sails whirl round. */
function Windmill() {
  const [x, , z] = WINDMILL.position;
  const sails = useRef<THREE.Group>(null);
  const spin = useRef(0);
  useHint([x, 1, z + 2.2], 'bonk', 4);
  useEffect(
    () =>
      registerStatic({
        id: 9400,
        position: new THREE.Vector3(x, 1, z),
        radius: 1.8,
        onBonk: () => {
          spin.current = 4;
          playSpin([x, 6, z]);
          playWhoosh([x, 6, z]);
          emit('confetti', [x, 7, z + 1.5], { count: 20, color: ['#ffffff', '#ffd23f'], speed: 5, up: 2 });
          shakeCamera(0.15);
          useGame.getState().addParty(PARTY_POINTS.bonk * 2);
        }
      }),
    [x, z]
  );
  useGameFrame((_, delta) => {
    spin.current = Math.max(0, spin.current - delta);
    if (sails.current) sails.current.rotation.z -= delta * (0.4 + spin.current * 3);
  });
  return (
    <group position={[x, 0, z]}>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[3.5, 1.6]} position={[0, 3.5, 0]} />
      </RigidBody>
      <mesh castShadow receiveShadow position={[0, 3.5, 0]} material={lambert('#fff8e1')}>
        <cylinderGeometry args={[1.1, 1.7, 7, 12]} />
      </mesh>
      <mesh castShadow position={[0, 7.6, 0]} material={lambert('#e05a47')}>
        <coneGeometry args={[1.5, 1.6, 12]} />
      </mesh>
      <mesh position={[0, 1, 1.62]} material={lambert('#8b5a2b')}>
        <boxGeometry args={[0.9, 1.6, 0.1]} />
      </mesh>
      <group ref={sails} position={[0, 6.4, 1.3]}>
        <mesh material={lambert('#8b5a2b')} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.25, 0.25, 0.5, 10]} />
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <group key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
            <mesh position={[0, 2.1, 0.1]} material={lambert('#8b5a2b')}>
              <boxGeometry args={[0.15, 4, 0.1]} />
            </mesh>
            <mesh position={[0.45, 2.4, 0.12]} material={lambert(i % 2 ? '#ffffff' : '#ff8fb5')}>
              <boxGeometry args={[0.8, 3.1, 0.05]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

function Fence() {
  const [cx, cz] = PASTURE.center;
  const [w, d] = PASTURE.size;
  const posts = useRef<THREE.InstancedMesh>(null);
  const items = useMemo(() => {
    const out: [number, number][] = [];
    for (let x = -w / 2; x <= w / 2 + 0.01; x += 2) {
      out.push([cx + x, cz - d / 2], [cx + x, cz + d / 2]);
    }
    for (let z = -d / 2 + 2; z < d / 2; z += 2) {
      out.push([cx - w / 2, cz + z], [cx + w / 2, cz + z]);
    }
    return out;
  }, [cx, cz, w, d]);
  useLayoutEffect(() => {
    const m = posts.current;
    if (!m) return;
    const o = new THREE.Object3D();
    items.forEach(([x, z], i) => {
      o.position.set(x, 0.55, z);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  const rails: { p: Vec3; s: Vec3 }[] = [
    { p: [cx, 0, cz - d / 2], s: [w, 0, 0.12] },
    { p: [cx, 0, cz + d / 2], s: [w, 0, 0.12] },
    { p: [cx - w / 2, 0, cz], s: [0.12, 0, d] },
    { p: [cx + w / 2, 0, cz], s: [0.12, 0, d] }
  ];
  return (
    <group>
      <instancedMesh ref={posts} args={[undefined, undefined, items.length]} castShadow material={lambert('#8b5a2b')}>
        <boxGeometry args={[0.18, 1.1, 0.18]} />
      </instancedMesh>
      <RigidBody type="fixed" colliders={false}>
        {rails.map((r, i) => (
          <CuboidCollider key={i} args={[Math.max(r.s[0], 0.12) / 2, 0.5, Math.max(r.s[2], 0.12) / 2]} position={[r.p[0], 0.5, r.p[2]]} />
        ))}
      </RigidBody>
      {rails.map((r, i) =>
        [0.45, 0.85].map((y) => (
          <mesh key={`${i}-${y}`} castShadow position={[r.p[0], y, r.p[2]]} material={lambert('#c68642')}>
            <boxGeometry args={[Math.max(r.s[0], 0.1), 0.1, Math.max(r.s[2], 0.1)]} />
          </mesh>
        ))
      )}
    </group>
  );
}

function Tractor({ position }: { position: Vec3 }) {
  return (
    <group position={position} rotation={[0, 0.6, 0]}>
      <StaticBox position={[0, 1.1, 0]} size={[1.6, 1.0, 2.6]} color="#e53935" />
      <StaticBox position={[0, 2.0, -0.5]} size={[1.4, 1.0, 1.2]} color="#e53935" />
      <mesh position={[0, 2.2, -0.5]} material={lambert('#bde0ff')}>
        <boxGeometry args={[1.42, 0.5, 1.0]} />
      </mesh>
      {[[-0.95, 0.9, -0.7, 0.9], [0.95, 0.9, -0.7, 0.9], [-0.9, 0.55, 1.0, 0.55], [0.9, 0.55, 1.0, 0.55]].map(([x, y, z, r], i) => (
        <mesh key={i} castShadow position={[x, y, z]} rotation={[0, 0, Math.PI / 2]} material={lambert('#263238')}>
          <cylinderGeometry args={[r, r, 0.4, 16]} />
        </mesh>
      ))}
      <mesh position={[0.4, 2.2, 0.9]} material={lambert('#37474f')}>
        <cylinderGeometry args={[0.08, 0.08, 1, 8]} />
      </mesh>
    </group>
  );
}

function MelonPatch() {
  return (
    <group>
      {MELON_PATCH.map(([x, z], i) => (
        <group key={i}>
          <Prop kind="melon" position={[x, 0.5, z]} rotation={[0, i * 0.7, 0]} splatty />
          {[0, 1, 2].map((j) => {
            const a = i * 1.3 + j * 2.1;
            return (
              <mesh key={j} position={[x + Math.cos(a) * 0.9, 0.06, z + Math.sin(a) * 0.9]} rotation={[-Math.PI / 2, 0, a]} scale={[1, 0.6, 1]} material={lambert('#3f9b3a')}>
                <circleGeometry args={[0.4, 8]} />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}

const FARM_PROPS: { kind: 'hay' | 'barrel'; position: Vec3; rotation?: Vec3; color?: string }[] = [
  { kind: 'hay', position: [-40.5, 0.62, -14.5], rotation: [0, 0, Math.PI / 2] },
  { kind: 'hay', position: [-42.9, 0.62, -14.8], rotation: [0, 0.3, Math.PI / 2] },
  { kind: 'hay', position: [-38.5, 0.55, -9] },
  { kind: 'barrel', position: [-44, 0.5, -3.5] },
  { kind: 'barrel', position: [-45.2, 0.5, -4.3], color: '#3b82f6' },
  { kind: 'barrel', position: [-52, 0.5, -3], color: '#22c55e' }
];

export function Farm() {
  return (
    <group>
      <Barn />
      <Mud />
      <Windmill />
      <Fence />
      <Cows />
      <Chickens />
      <MelonPatch />
      <Tractor position={[-43, 0, -19]} />
      <LaunchPad pad={LAUNCH_PADS[0]} />
      {FARM_PROPS.map((p, i) => (
        <Prop key={i} kind={p.kind} position={p.position} rotation={p.rotation} color={p.color} />
      ))}
    </group>
  );
}
