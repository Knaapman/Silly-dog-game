import { useFrame } from '@react-three/fiber';
import { CylinderCollider, RigidBody, type RapierCollider } from '@react-three/rapier';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { MUSHROOMS, ZONES } from '../layout';
import { lambert } from '../materials';
import type { Surface } from '../runtime';
import { useHint } from './common';
import { Prop } from './Prop';
import { useSurface } from './surface';

/** Giant mushroom: the cap is a trampoline. Hop from cap to cap up the spiral. */
function Mushroom({ index }: { index: number }) {
  const m = MUSHROOMS[index];
  const [x, z] = m.center;
  const col = useRef<RapierCollider>(null);
  const cap = useRef<THREE.Group>(null);
  const lastBounce = useRef(-1e9);
  const surface = useMemo<Surface>(() => ({ bounce: 13, onBounce: () => (lastBounce.current = performance.now()) }), []);
  useSurface(col, surface);
  useFrame(() => {
    if (!cap.current) return;
    const since = (performance.now() - lastBounce.current) / 1000;
    const squish = since < 0.5 ? Math.sin(since * 20) * Math.exp(-since * 7) * 0.2 : 0;
    cap.current.scale.set(1 + squish, 1 - squish, 1 + squish);
  });
  const spots = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 + index;
        const r = m.radius * 0.55;
        return new THREE.Vector3(Math.cos(a) * r, 0.62 * m.radius * 0.72, Math.sin(a) * r);
      }),
    [index, m.radius]
  );
  return (
    <group position={[x, 0, z]}>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[m.height / 2, 0.45]} position={[0, m.height / 2, 0]} />
        <CylinderCollider ref={col} args={[0.2, m.radius]} position={[0, m.height, 0]} restitution={0.9} />
      </RigidBody>
      <mesh castShadow position={[0, m.height / 2, 0]} material={lambert('#fff3dc')}>
        <cylinderGeometry args={[0.4, 0.55, m.height, 12]} />
      </mesh>
      <group ref={cap} position={[0, m.height - 0.1, 0]}>
        <mesh castShadow receiveShadow scale={[1, 0.72, 1]} material={lambert(m.color)}>
          <sphereGeometry args={[m.radius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={lambert('#fff3dc')}>
          <circleGeometry args={[m.radius, 24]} />
        </mesh>
        {spots.map((p, i) => (
          <mesh key={i} position={p} scale={[1, 0.4, 1]} material={lambert('#ffffff')}>
            <sphereGeometry args={[m.radius * 0.16, 8, 6]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Toadstools() {
  const caps = useRef<THREE.InstancedMesh>(null);
  const stems = useRef<THREE.InstancedMesh>(null);
  const items = useMemo(() => {
    const out: { x: number; z: number; s: number; color: string }[] = [];
    const colors = ['#ff4d5e', '#ffb020', '#a855f7', '#ff8fd8'];
    for (let i = 0; i < 40; i += 1) {
      const a = i * 2.39996;
      const r = 4 + ((i * 7) % 15);
      const x = ZONES.forest[0] + Math.cos(a) * r;
      const z = ZONES.forest[1] + Math.sin(a) * r;
      if (x < -41 && z < -38) continue; // keep the maze tidy
      if (MUSHROOMS.some((m) => Math.hypot(x - m.center[0], z - m.center[1]) < m.radius + 0.8)) continue;
      out.push({ x, z, s: 0.6 + ((i * 13) % 7) * 0.1, color: colors[i % colors.length] });
    }
    return out;
  }, []);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    items.forEach((it, i) => {
      o.scale.setScalar(it.s);
      o.position.set(it.x, 0.35 * it.s, it.z);
      o.updateMatrix();
      stems.current?.setMatrixAt(i, o.matrix);
      o.position.set(it.x, 0.62 * it.s, it.z);
      o.updateMatrix();
      caps.current?.setMatrixAt(i, o.matrix);
      caps.current?.setColorAt(i, c.set(it.color));
    });
    [caps.current, stems.current].forEach((m) => {
      if (!m) return;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    });
  }, [items]);
  return (
    <group>
      <instancedMesh ref={stems} args={[undefined, undefined, items.length]} material={lambert('#fff3dc')}>
        <cylinderGeometry args={[0.1, 0.13, 0.7, 6]} />
      </instancedMesh>
      <instancedMesh ref={caps} args={[undefined, undefined, items.length]} castShadow>
        <sphereGeometry args={[0.35, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshLambertMaterial />
      </instancedMesh>
    </group>
  );
}

function FallenLog() {
  return (
    <RigidBody type="fixed" colliders={false} position={[-30, 0.55, -27]} rotation={[0, 0.5, Math.PI / 2]}>
      <CylinderCollider args={[2.5, 0.55]} />
      <mesh castShadow receiveShadow material={lambert('#8b5a2b')}>
        <cylinderGeometry args={[0.55, 0.6, 5, 12]} />
      </mesh>
      {[-2.5, 2.5].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[y > 0 ? 0 : Math.PI, 0, 0]} material={lambert('#e6c28f')}>
          <circleGeometry args={[0.5, 12]} />
        </mesh>
      ))}
    </RigidBody>
  );
}

export function Forest() {
  useHint([MUSHROOMS[0].center[0], MUSHROOMS[0].height, MUSHROOMS[0].center[1]], 'jump', 5);
  return (
    <group>
      {MUSHROOMS.map((_, i) => (
        <Mushroom key={i} index={i} />
      ))}
      <Toadstools />
      <FallenLog />
      <Prop kind="ball" position={[-40, 0.5, -30]} color="#ffb020" />
    </group>
  );
}
