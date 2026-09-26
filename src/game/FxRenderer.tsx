import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PARTICLE_KINDS, pools, rings, stepPool, type ParticleKind } from './fx';
import { useGameFrame } from './clock';

function starShape(points = 5, outer = 1, inner = 0.45) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= points * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  return shape;
}

function heartShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.9);
  s.bezierCurveTo(-0.2, -0.6, -1, -0.2, -1, 0.3);
  s.bezierCurveTo(-1, 0.8, -0.4, 1, 0, 0.55);
  s.bezierCurveTo(0.4, 1, 1, 0.8, 1, 0.3);
  s.bezierCurveTo(1, -0.2, 0.2, -0.6, 0, -0.9);
  return s;
}

function createGeometry(kind: ParticleKind): THREE.BufferGeometry {
  switch (kind) {
    case 'puff':
      return new THREE.IcosahedronGeometry(1, 1);
    case 'star': {
      const g = new THREE.ExtrudeGeometry(starShape(), { depth: 0.35, bevelEnabled: false });
      g.center();
      return g;
    }
    case 'heart': {
      const g = new THREE.ExtrudeGeometry(heartShape(), { depth: 0.35, bevelEnabled: false });
      g.center();
      return g;
    }
    case 'confetti':
      return new THREE.PlaneGeometry(0.17, 0.1);
    case 'feather':
      return new THREE.PlaneGeometry(0.1, 0.26);
    case 'drop':
      return new THREE.SphereGeometry(1, 7, 5);
    case 'chunk':
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

function createMaterial(kind: ParticleKind): THREE.Material {
  if (kind === 'confetti' || kind === 'feather') return new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  if (kind === 'star' || kind === 'heart') return new THREE.MeshBasicMaterial();
  return new THREE.MeshLambertMaterial();
}

function scaleFor(kind: ParticleKind, t: number, size: number) {
  switch (kind) {
    case 'puff':
      return size * (0.6 + 0.9 * t) * (t > 0.65 ? Math.max(0, 1 - (t - 0.65) / 0.35) : 1);
    case 'star':
    case 'heart':
      return size * Math.min(1, t * 8) * (1 - t * t * t);
    case 'confetti':
    case 'feather':
      return size * (t > 0.85 ? (1 - t) / 0.15 : 1);
    default:
      return size * (1 - t * t);
  }
}

const dummy = new THREE.Object3D();
const color = new THREE.Color();

function ParticleLayer({ kind }: { kind: ParticleKind }) {
  const pool = pools[kind];
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => createGeometry(kind), [kind]);
  const material = useMemo(() => createMaterial(kind), [kind]);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    m.setColorAt(0, color.set('#ffffff'));
    m.count = 0;
  }, []);

  useGameFrame((_, delta) => {
    const m = mesh.current;
    if (!m) return;
    const dt = Math.min(delta, 0.05);
    stepPool(pool, dt);
    for (let i = 0; i < pool.count; i += 1) {
      const t = 1 - pool.life[i] / pool.maxLife[i];
      dummy.position.set(pool.px[i], pool.py[i], pool.pz[i]);
      if (kind === 'star' || kind === 'heart') dummy.rotation.set(0, pool.ry[i], 0);
      else if (kind === 'feather') dummy.rotation.set(Math.sin(pool.rx[i]) * 0.8, pool.ry[i], Math.sin(pool.rz[i] * 0.5) * 0.8);
      else dummy.rotation.set(pool.rx[i], pool.ry[i], pool.rz[i]);
      dummy.scale.setScalar(scaleFor(kind, t, pool.size[i]));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      color.setRGB(pool.r[i], pool.g[i], pool.b[i]);
      m.setColorAt(i, color);
    }
    m.count = pool.count;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geometry, material, pool.max]} frustumCulled={false} />;
}

function Rings() {
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const geometry = useMemo(() => new THREE.RingGeometry(0.82, 1, 48), []);

  useGameFrame((_, delta) => {
    rings.forEach((r, i) => {
      const m = meshes.current[i];
      if (!m) return;
      if (!r.active) {
        m.visible = false;
        return;
      }
      r.age += Math.min(delta, 0.05);
      const t = r.age / r.duration;
      if (t >= 1) {
        r.active = false;
        m.visible = false;
        return;
      }
      const eased = 1 - Math.pow(1 - t, 3);
      m.visible = true;
      m.position.set(r.x, r.y, r.z);
      m.scale.setScalar(0.2 + eased * r.radius);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.85 * (1 - t);
      mat.color.set(r.color);
    });
  });

  return (
    <group>
      {rings.map((_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          geometry={geometry}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
          renderOrder={2}
        >
          <meshBasicMaterial transparent depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

export function FxRenderer() {
  return (
    <group>
      {PARTICLE_KINDS.map((kind) => (
        <ParticleLayer key={kind} kind={kind} />
      ))}
      <Rings />
    </group>
  );
}
