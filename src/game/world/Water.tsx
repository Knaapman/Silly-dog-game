import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { WORLD_HALF_X, WORLD_HALF_Z } from '../config';
import { RIVER, RIVER_HALF_WIDTH, WATER_LEVEL } from '../layout';
import { lambert } from '../materials';
import { props } from '../runtime';
import { isInWater, waterLevelAt } from '../terrain';
import { gameClock, useGameFrame } from '../clock';

// The water: one big sheet at WATER_LEVEL (the sea, the lagoon and the river all show through
// wherever the ground is cut below it), the stream tumbling down the mountain's face on its own
// sloping ribbon, a line of buoys where the park ends out at sea, and a nudge that keeps ducks,
// balls and crates floating instead of sinking to the bottom.

function waterMaterial() {
  return new THREE.MeshStandardMaterial({ color: '#4fc3f7', roughness: 0.15, metalness: 0.1 });
}

/** The stream down the mountain: a ribbon along the river's sloping stretches, 45 cm above the channel floor. */
function streamGeometry() {
  const pts = RIVER.filter((_, i) => i === 0 || RIVER[i - 1].level > -0.6);
  const w = RIVER_HALF_WIDTH + 0.4;
  const pos: number[] = [];
  const index: number[] = [];
  pts.forEach((p, i) => {
    const prev = pts[Math.max(0, i - 1)].p;
    const next = pts[Math.min(pts.length - 1, i + 1)].p;
    const dx = next[0] - prev[0];
    const dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    const y = Math.max(WATER_LEVEL, p.level + 0.45);
    pos.push(p.p[0] - (dz / len) * w, y, p.p[1] + (dx / len) * w, p.p[0] + (dz / len) * w, y, p.p[1] - (dx / len) * w);
    if (i > 0) {
      const k = (i - 1) * 2;
      index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function Sea() {
  const sheet = useMemo(waterMaterial, []);
  const stream = useMemo(() => {
    const m = waterMaterial();
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
    return m;
  }, []);
  const geometry = useMemo(streamGeometry, []);
  useGameFrame(() => {
    const l = 0.58 + Math.sin(gameClock.time * 1.5) * 0.025;
    sheet.color.setHSL(0.56, 0.75, l);
    stream.color.setHSL(0.56, 0.75, l + 0.04);
  });
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_LEVEL, 0]} material={sheet}>
        <planeGeometry args={[400, 400]} />
      </mesh>
      <mesh receiveShadow geometry={geometry} material={stream} />
    </group>
  );
}

/** Red and white buoys bobbing along the park's edge out at sea. */
function Buoys() {
  const group = useRef<THREE.Group>(null);
  const xs = useMemo(() => {
    const out: number[] = [];
    for (let x = -WORLD_HALF_X + 2; x <= WORLD_HALF_X - 2; x += 5) out.push(x);
    return out;
  }, []);
  useGameFrame(() => {
    group.current?.children.forEach((b, i) => {
      b.position.y = WATER_LEVEL + 0.15 + Math.sin(gameClock.time * 1.3 + i) * 0.08;
      b.rotation.z = Math.sin(gameClock.time * 0.9 + i * 1.7) * 0.15;
    });
  });
  return (
    <group ref={group}>
      {xs.map((x, i) => (
        <group key={i} position={[x, WATER_LEVEL, WORLD_HALF_Z - 1.5]}>
          <mesh castShadow material={lambert(i % 2 ? '#ff4d5e' : '#ffffff')}>
            <sphereGeometry args={[0.5, 12, 10]} />
          </mesh>
          <mesh position={[0, 0.7, 0]} material={lambert('#37474f')}>
            <cylinderGeometry args={[0.05, 0.05, 0.6, 6]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Light things float: a duck or a ball that ends up in the water bobs back up to the surface. */
function Buoyancy() {
  useGameFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    props.forEach((prop) => {
      if (prop.heavy || prop.heldBy != null || !prop.enabled) return;
      const rb = prop.getBody();
      if (!rb) return;
      const t = rb.translation();
      if (!isInWater(t.x, t.z)) return;
      const target = waterLevelAt(t.x, t.z) + prop.radius * 0.35;
      if (t.y > target + prop.radius) return;
      const v = rb.linvel();
      const lift = (target - t.y) * 14 - v.y * 4;
      rb.setLinvel({ x: v.x * (1 - 2 * dt), y: v.y + lift * dt, z: v.z * (1 - 2 * dt) }, true);
    });
  });
  return null;
}

export function Water() {
  return (
    <group>
      <Sea />
      <Buoys />
      <Buoyancy />
    </group>
  );
}
