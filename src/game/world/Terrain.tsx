import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { WORLD_HALF } from '../config';
import { distXZ, FLOOR_PATCHES, LAKE, MAZE, PATH_WIDTH, PATHS, PLAZA, SIGNS, SNOW, ZONES, type Vec2 } from '../layout';
import { emojiSignTexture, grassTexture, lambert, speckleTexture, stripeTexture, tileTexture } from '../materials';
import { GroundPatch, HedgeSegment } from './common';
import { gameClock, useGameFrame } from '../clock';

function Ground() {
  const material = useMemo(() => new THREE.MeshLambertMaterial({ map: grassTexture() }), []);
  const h = WORLD_HALF;
  return (
    <RigidBody type="fixed" colliders={false} friction={1}>
      <CuboidCollider args={[h + 20, 0.5, h + 20]} position={[0, -0.5, 0]} />
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} material={material}>
        <planeGeometry args={[320, 320]} />
      </mesh>
      {/* Tall invisible walls so nothing escapes the park */}
      <CuboidCollider args={[h + 2, 30, 0.5]} position={[0, 30, -h - 1]} />
      <CuboidCollider args={[h + 2, 30, 0.5]} position={[0, 30, h + 1]} />
      <CuboidCollider args={[0.5, 30, h + 2]} position={[-h - 1, 30, 0]} />
      <CuboidCollider args={[0.5, 30, h + 2]} position={[h + 1, 30, 0]} />
    </RigidBody>
  );
}

function Border() {
  const h = WORLD_HALF + 0.6;
  return (
    <>
      <HedgeSegment from={[-h, -h]} to={[h, -h]} height={2.4} />
      <HedgeSegment from={[-h, h]} to={[h, h]} height={2.4} />
      <HedgeSegment from={[-h, -h]} to={[-h, h]} height={2.4} />
      <HedgeSegment from={[h, -h]} to={[h, h]} height={2.4} />
      {MAZE.walls.map(([x1, z1, x2, z2], i) => (
        <HedgeSegment key={i} from={[x1, z1]} to={[x2, z2]} height={1.4} thickness={0.9} />
      ))}
    </>
  );
}

function offsetMaterial(map: THREE.Texture, factor = -1) {
  const m = new THREE.MeshLambertMaterial({ map });
  m.polygonOffset = true;
  m.polygonOffsetFactor = factor;
  m.polygonOffsetUnits = factor;
  return m;
}

/** Each zone gets its own floor so it reads as a different place at a glance. */
function ZoneFloors() {
  const mats = useMemo(
    () => ({
      plaza: offsetMaterial(tileTexture('plaza', ['#f3e3c3', '#ead3a8'], '#d8bf8f', 6)),
      carnival: offsetMaterial(tileTexture('carnival', ['#ff8fb5', '#ffe07a', '#8fd3ff', '#b9f0a8'], '#ffffff', 7)),
      snow: offsetMaterial(speckleTexture('snow', '#f7fbff', ['#dcecff', '#ffffff', '#cfe3fa'], 8)),
      sand: offsetMaterial(speckleTexture('sand', '#f2dc9b', ['#e2c67d', '#fff0c2'], 10)),
      dirt: offsetMaterial(speckleTexture('dirt', '#caa06a', ['#b88a52', '#dab680'], 8)),
      dino: offsetMaterial(speckleTexture('dino', '#e7b97a', ['#d59f5c', '#f3cd96'], 9)),
      rubber: offsetMaterial(speckleTexture('rubber', '#58c9b9', ['#46b6a6', '#7fdccf', '#ffd23f'], 9)),
      forest: offsetMaterial(speckleTexture('forest', '#5ea64c', ['#4f9540', '#77bb5e', '#c9e59a'], 10))
    }),
    []
  );
  return (
    <group>
      {FLOOR_PATCHES.map((p) => (
        <GroundPatch key={p.kind} center={p.center} radius={p.radius} color="" material={mats[p.kind]} y={p.y} />
      ))}
    </group>
  );
}

function Paths() {
  const material = useMemo(() => {
    const m = new THREE.MeshLambertMaterial({ color: '#ecd29a' });
    m.polygonOffset = true;
    m.polygonOffsetFactor = -1;
    m.polygonOffsetUnits = -1;
    return m;
  }, []);
  return (
    <group>
      {PATHS.map(([a, b], i) => {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
        return (
          <group key={i}>
            <mesh receiveShadow rotation={[-Math.PI / 2, 0, -angle]} position={[(a[0] + b[0]) / 2, 0.009, (a[1] + b[1]) / 2]} material={material}>
              <planeGeometry args={[len, PATH_WIDTH]} />
            </mesh>
            <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[b[0], 0.009, b[1]]} material={material}>
              <circleGeometry args={[PATH_WIDTH / 2, 20]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** Keep decorations on plain grass. */
const BLOCKERS: { c: Vec2; r: number }[] = [
  { c: PLAZA.center, r: PLAZA.radius + 1 },
  { c: ZONES.forest, r: 21 },
  { c: ZONES.farm, r: 16 },
  { c: [40, 2], r: 18 },
  { c: [33, 37], r: 18 },
  { c: [0, -40], r: 16 },
  { c: SNOW.center, r: SNOW.radius + 1 },
  { c: LAKE.center, r: LAKE.radius + 3.5 },
  { c: [38, -40], r: 12 },
  { c: [51, -23], r: 10 }
];

function onTrack(x: number, z: number) {
  return Math.abs(Math.abs(x) - 56) < 2.5 || Math.abs(Math.abs(z) - 56) < 2.5;
}

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function Flowers() {
  const heads = useRef<THREE.InstancedMesh>(null);
  const stems = useRef<THREE.InstancedMesh>(null);
  const items = useMemo(() => {
    const rnd = seeded(7);
    const colors = ['#ff6f91', '#ffd23f', '#ffffff', '#b388ff', '#ff9e40', '#4fc3f7'];
    const out: { x: number; z: number; s: number; color: string }[] = [];
    let guard = 0;
    while (out.length < 420 && guard < 12000) {
      guard += 1;
      const x = (rnd() - 0.5) * (WORLD_HALF * 2 - 3);
      const z = (rnd() - 0.5) * (WORLD_HALF * 2 - 3);
      if (BLOCKERS.some((b) => distXZ(x, z, b.c[0], b.c[1]) < b.r) || onTrack(x, z)) continue;
      out.push({ x, z, s: 0.7 + rnd() * 0.6, color: colors[Math.floor(rnd() * colors.length)] });
    }
    return out;
  }, []);

  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    items.forEach((f, i) => {
      d.position.set(f.x, 0.28 * f.s, f.z);
      d.scale.setScalar(f.s);
      d.updateMatrix();
      heads.current?.setMatrixAt(i, d.matrix);
      heads.current?.setColorAt(i, c.set(f.color));
      d.position.set(f.x, 0.13 * f.s, f.z);
      d.updateMatrix();
      stems.current?.setMatrixAt(i, d.matrix);
    });
    if (heads.current) {
      heads.current.instanceMatrix.needsUpdate = true;
      if (heads.current.instanceColor) heads.current.instanceColor.needsUpdate = true;
      heads.current.computeBoundingSphere();
    }
    if (stems.current) {
      stems.current.instanceMatrix.needsUpdate = true;
      stems.current.computeBoundingSphere();
    }
  }, [items]);

  return (
    <group>
      <instancedMesh ref={heads} args={[undefined, undefined, items.length]}>
        <icosahedronGeometry args={[0.12, 0]} />
        <meshLambertMaterial />
      </instancedMesh>
      <instancedMesh ref={stems} args={[undefined, undefined, items.length]} material={lambert('#3d8b37')}>
        <cylinderGeometry args={[0.02, 0.02, 0.26, 4]} />
      </instancedMesh>
    </group>
  );
}

/** Text-free wayfinding: a picture of the place and an arrow pointing to it. */
function Signposts() {
  return (
    <group>
      {SIGNS.map((sign, i) => {
        const target = ZONES[sign.zone];
        const yaw = Math.atan2(target[0] - sign.position[0], target[1] - sign.position[1]);
        return (
          <group key={i} position={[sign.position[0], 0, sign.position[1]]}>
            <RigidBody type="fixed" colliders={false}>
              <CylinderCollider args={[1.3, 0.12]} position={[0, 1.3, 0]} />
            </RigidBody>
            <mesh castShadow position={[0, 1.3, 0]} material={lambert('#8b5a2b')}>
              <cylinderGeometry args={[0.1, 0.12, 2.6, 8]} />
            </mesh>
            <mesh position={[0, 2.35, 0.13]} rotation={[-0.35, 0, 0]}>
              <circleGeometry args={[0.62, 28]} />
              <meshBasicMaterial map={emojiSignTexture(sign.icon)} />
            </mesh>
            <mesh position={[0, 2.35, 0.1]} rotation={[-0.35, 0, 0]} material={lambert('#8b5a2b')}>
              <circleGeometry args={[0.72, 28]} />
            </mesh>
            {/* arrow board pointing at the zone */}
            <group position={[0, 1.55, 0]} rotation={[0, yaw, 0]}>
              <mesh castShadow position={[0, 0, 0.45]} material={lambert('#ffd23f')}>
                <boxGeometry args={[0.35, 0.22, 0.9]} />
              </mesh>
              <mesh castShadow position={[0, 0, 1.05]} rotation={[Math.PI / 2, 0, 0]} material={lambert('#ffd23f')}>
                <coneGeometry args={[0.35, 0.45, 3]} />
              </mesh>
            </group>
          </group>
        );
      })}
    </group>
  );
}

export function Clouds() {
  const group = useRef<THREE.Group>(null);
  const clouds = useMemo(() => {
    const rnd = seeded(42);
    return Array.from({ length: 14 }, () => ({
      x: (rnd() - 0.5) * 240,
      y: 30 + rnd() * 12,
      z: -90 + rnd() * 140,
      s: 2.5 + rnd() * 3,
      speed: 0.6 + rnd() * 0.8
    }));
  }, []);
  useGameFrame((_, delta) => {
    group.current?.children.forEach((c, i) => {
      c.position.x += clouds[i].speed * delta;
      if (c.position.x > 130) c.position.x = -130;
    });
  });
  return (
    <group ref={group}>
      {clouds.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]} scale={c.s}>
          {[[0, 0, 0, 1], [1.1, -0.2, 0.2, 0.75], [-1.1, -0.25, -0.1, 0.8], [0.4, 0.45, 0, 0.7]].map(([x, y, z, r], j) => (
            <mesh key={j} position={[x, y, z]} material={lambert('#ffffff')}>
              <icosahedronGeometry args={[r, 1]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Two hot-air balloons drifting over the park: landmarks in the sky. */
function HotAirBalloons() {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const balloons = useMemo(
    () => [
      { r: 45, y: 26, speed: 0.03, phase: 0, colors: ['#ff4d5e', '#ffd23f', '#ff4d5e', '#ffd23f', '#ff4d5e', '#ffd23f'] },
      { r: 30, y: 32, speed: -0.025, phase: 2.5, colors: ['#3b82f6', '#ffffff', '#22c55e', '#ffffff', '#3b82f6', '#ffffff'] }
    ],
    []
  );
  const mats = useMemo(() => balloons.map((b, i) => new THREE.MeshLambertMaterial({ map: stripeTexture(`hab${i}`, b.colors) })), [balloons]);
  useGameFrame(() => {
    const t = gameClock.time;
    balloons.forEach((b, i) => {
      const g = refs.current[i];
      if (!g) return;
      const a = b.phase + t * b.speed;
      g.position.set(Math.cos(a) * b.r, b.y + Math.sin(t * 0.4 + i) * 1.2, Math.sin(a) * b.r - 10);
      g.rotation.y = t * 0.1;
    });
  });
  return (
    <group>
      {balloons.map((b, i) => (
        <group
          key={i}
          ref={(g) => {
            refs.current[i] = g;
          }}
        >
          <mesh material={mats[i]} scale={[1, 1.15, 1]}>
            <sphereGeometry args={[3.2, 20, 14]} />
          </mesh>
          <mesh position={[0, -3.6, 0]} material={mats[i]}>
            <cylinderGeometry args={[1.6, 0.6, 1.4, 16, 1, true]} />
          </mesh>
          <mesh position={[0, -5.2, 0]} material={lambert('#8b5a2b')}>
            <boxGeometry args={[1.2, 0.9, 1.2]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Terrain() {
  return (
    <>
      <Ground />
      <Border />
      <ZoneFloors />
      <Paths />
      <Flowers />
      <Signposts />
    </>
  );
}

export function Sky() {
  return (
    <>
      <Clouds />
      <HotAirBalloons />
    </>
  );
}
