import { useFrame } from '@react-three/fiber';
import { BallCollider, CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { playRustle } from '../audio';
import { WORLD_HALF } from '../config';
import { emit } from '../fx';
import {
  BARN,
  distXZ,
  HILL,
  ISLAND,
  MAZE,
  MUD,
  PATHS,
  PLAZA,
  POND,
  SILO,
  TREES,
  type Vec2,
  type Vec3
} from '../layout';
import { barnTexture, grassTexture, lambert } from '../materials';
import { registerStatic, spawners } from '../runtime';
import { Prop } from './Prop';

function Ground() {
  const material = useMemo(() => new THREE.MeshLambertMaterial({ map: grassTexture() }), []);
  return (
    <RigidBody type="fixed" colliders={false} friction={1}>
      <CuboidCollider args={[70, 0.5, 70]} position={[0, -0.5, 0]} />
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} material={material}>
        <planeGeometry args={[200, 200]} />
      </mesh>
      {/* Tall invisible walls so nothing escapes the park */}
      <CuboidCollider args={[WORLD_HALF + 2, 25, 0.5]} position={[0, 25, -WORLD_HALF - 1]} />
      <CuboidCollider args={[WORLD_HALF + 2, 25, 0.5]} position={[0, 25, WORLD_HALF + 1]} />
      <CuboidCollider args={[0.5, 25, WORLD_HALF + 2]} position={[-WORLD_HALF - 1, 25, 0]} />
      <CuboidCollider args={[0.5, 25, WORLD_HALF + 2]} position={[WORLD_HALF + 1, 25, 0]} />
    </RigidBody>
  );
}

function HedgeSegment({ from, to, height = 1.8, thickness = 1.3 }: { from: Vec2; to: Vec2; height?: number; thickness?: number }) {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]) + thickness;
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const cx = (from[0] + to[0]) / 2;
  const cz = (from[1] + to[1]) / 2;
  return (
    <RigidBody type="fixed" colliders={false} position={[cx, 0, cz]} rotation={[0, -angle, 0]}>
      <CuboidCollider args={[len / 2, height / 2, thickness / 2]} position={[0, height / 2, 0]} />
      <mesh castShadow receiveShadow position={[0, height / 2 - 0.1, 0]} material={lambert('#3f9a3f')}>
        <boxGeometry args={[len, height - 0.2, thickness]} />
      </mesh>
      <mesh castShadow position={[0, height - 0.2, 0]} rotation={[0, 0, Math.PI / 2]} material={lambert('#4fae47')}>
        <cylinderGeometry args={[thickness / 2, thickness / 2, len, 10]} />
      </mesh>
    </RigidBody>
  );
}

function Hedges() {
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
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[PLAZA.center[0], 0.01, PLAZA.center[1]]} material={material}>
        <circleGeometry args={[PLAZA.radius, 48]} />
      </mesh>
      {PATHS.map(([a, b], i) => {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
        return (
          <group key={i}>
            <mesh receiveShadow rotation={[-Math.PI / 2, 0, -angle]} position={[(a[0] + b[0]) / 2, 0.011, (a[1] + b[1]) / 2]} material={material}>
              <planeGeometry args={[len, 2.6]} />
            </mesh>
            <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[b[0], 0.011, b[1]]} material={material}>
              <circleGeometry args={[1.3, 20]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** Keep decorations off the play features. */
const BLOCKERS: { c: Vec2; r: number }[] = [
  { c: PLAZA.center, r: PLAZA.radius + 1 },
  { c: POND.center, r: POND.radius + 2.5 },
  { c: MUD.center, r: MUD.radius + 1 },
  { c: HILL.center, r: 11 },
  { c: BARN.center, r: 7 },
  { c: MAZE.center, r: 8 },
  { c: [15, -13], r: 8 },
  { c: [18, -27], r: 9 },
  { c: [27, 4], r: 4 },
  { c: [36, 18], r: 3 },
  { c: [8, 26], r: 5 }
];

function isBlocked(x: number, z: number) {
  return BLOCKERS.some((b) => distXZ(x, z, b.c[0], b.c[1]) < b.r);
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
    while (out.length < 260 && guard < 5000) {
      guard += 1;
      const x = (rnd() - 0.5) * (WORLD_HALF * 2 - 3);
      const z = (rnd() - 0.5) * (WORLD_HALF * 2 - 3);
      if (isBlocked(x, z)) continue;
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
    }
    if (stems.current) stems.current.instanceMatrix.needsUpdate = true;
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

// ---------------------------------------------------------------------------
// Trees: headbutt them and apples fall out.

const TREE_STYLES = [
  { trunk: '#8b5a2b', leaves: ['#3fa34d', '#57bb5a', '#48ad50'] },
  { trunk: '#7a4a24', leaves: ['#ff9ecb', '#ffb8d9', '#ff8fc0'] },
  { trunk: '#8b5a2b', leaves: ['#2f8f46', '#3aa052'] }
];

function Tree({ position, style, id }: { position: Vec2; style: number; id: number }) {
  const canopy = useRef<THREE.Group>(null);
  const wobble = useRef(0);
  const s = TREE_STYLES[style];
  const pine = style === 2;

  useEffect(
    () =>
      registerStatic({
        id: 5000 + id,
        position: new THREE.Vector3(position[0], 1, position[1]),
        radius: 0.6,
        onBonk: () => {
          wobble.current = 1;
          playRustle([position[0], 2, position[1]]);
          emit('confetti', [position[0], 3.2, position[1]], { count: 14, color: s.leaves, speed: 3, up: 1, size: 1.4 });
          const apples = 1 + Math.floor(Math.random() * 2);
          for (let i = 0; i < apples; i += 1) {
            const a = Math.random() * Math.PI * 2;
            spawners.apple(new THREE.Vector3(position[0] + Math.cos(a) * 1.1, 3.4, position[1] + Math.sin(a) * 1.1));
          }
        }
      }),
    [id, position, s.leaves]
  );

  useFrame(({ clock }, delta) => {
    if (!canopy.current) return;
    wobble.current = Math.max(0, wobble.current - delta * 1.5);
    const w = wobble.current;
    const t = clock.elapsedTime;
    canopy.current.rotation.z = Math.sin(t * 0.8 + id) * 0.03 + Math.sin(t * 25) * 0.18 * w;
    canopy.current.rotation.x = Math.cos(t * 0.7 + id) * 0.03 + Math.cos(t * 22) * 0.12 * w;
  });

  return (
    <RigidBody type="fixed" colliders={false} position={[position[0], 0, position[1]]}>
      <CylinderCollider args={[1.2, 0.4]} position={[0, 1.2, 0]} />
      <mesh castShadow position={[0, 1.1, 0]} material={lambert(s.trunk)}>
        <cylinderGeometry args={[0.28, 0.4, 2.2, 8]} />
      </mesh>
      <group ref={canopy} position={[0, 2, 0]}>
        {pine ? (
          <>
            <mesh castShadow position={[0, 0.8, 0]} material={lambert(s.leaves[0])}>
              <coneGeometry args={[1.7, 2.2, 8]} />
            </mesh>
            <mesh castShadow position={[0, 2, 0]} material={lambert(s.leaves[1])}>
              <coneGeometry args={[1.3, 1.8, 8]} />
            </mesh>
          </>
        ) : (
          <>
            <mesh castShadow position={[0, 0.9, 0]} material={lambert(s.leaves[0])}>
              <icosahedronGeometry args={[1.6, 1]} />
            </mesh>
            <mesh castShadow position={[-0.7, 1.5, 0.4]} material={lambert(s.leaves[1])}>
              <icosahedronGeometry args={[1.1, 1]} />
            </mesh>
            <mesh castShadow position={[0.7, 1.4, -0.4]} material={lambert(s.leaves[2])}>
              <icosahedronGeometry args={[1.2, 1]} />
            </mesh>
            {style === 0 &&
              [[0.9, 0.7, 1.1], [-1.1, 1, 0.5], [0.2, 1.2, 1.4]].map((p, i) => (
                <mesh key={i} position={p as Vec3} material={lambert('#e53935')}>
                  <sphereGeometry args={[0.16, 8, 6]} />
                </mesh>
              ))}
          </>
        )}
      </group>
    </RigidBody>
  );
}

const MAX_APPLES = 10;

function Orchard() {
  const [apples, setApples] = useState<{ id: number; pos: Vec3; color: string }[]>([]);
  const nextId = useRef(1);

  useEffect(() => {
    spawners.apple = (p) => {
      const id = nextId.current++;
      const color = Math.random() < 0.3 ? '#9ccc3c' : '#e53935';
      setApples((list) => [...list, { id, pos: [p.x, p.y, p.z] as Vec3, color }].slice(-MAX_APPLES));
    };
    return () => {
      spawners.apple = () => {};
    };
  }, []);

  return (
    <>
      {TREES.map((p, i) => (
        <Tree key={i} id={i} position={p} style={i % 3} />
      ))}
      {apples.map((a) => (
        <Prop
          key={a.id}
          kind="apple"
          position={a.pos}
          color={a.color}
          edible
          onEaten={() => setApples((list) => list.filter((x) => x.id !== a.id))}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------

function Pond() {
  const water = useRef<THREE.Mesh>(null);
  const capAngle = Math.acos((ISLAND.sphereRadius - ISLAND.height) / ISLAND.sphereRadius);
  useFrame(({ clock }) => {
    const m = water.current?.material as THREE.MeshStandardMaterial | undefined;
    if (m) m.color.setHSL(0.56, 0.75, 0.6 + Math.sin(clock.elapsedTime * 1.5) * 0.025);
  });
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[POND.center[0], 0.015, POND.center[1]]} material={lambert('#f2dc9b')}>
        <circleGeometry args={[POND.radius + 1.6, 48]} />
      </mesh>
      <mesh ref={water} receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[POND.center[0], 0.04, POND.center[1]]}>
        <circleGeometry args={[POND.radius, 48]} />
        <meshStandardMaterial color="#4fc3f7" roughness={0.15} metalness={0.1} />
      </mesh>
      {[[3.5, 2.8, 0.7], [-4.2, -3, 0.9], [4.8, -3.5, 0.6], [-2, 5, 0.75]].map(([x, z, r], i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, i]} position={[POND.center[0] + x, 0.05, POND.center[1] + z]} material={lambert('#4caf50')}>
          <circleGeometry args={[r, 16, 0.3, Math.PI * 1.75]} />
        </mesh>
      ))}
      <RigidBody type="fixed" colliders={false} position={[ISLAND.center[0], ISLAND.height - ISLAND.sphereRadius, ISLAND.center[1]]}>
        <BallCollider args={[ISLAND.sphereRadius]} />
        <mesh receiveShadow castShadow material={lambert('#7ccf5a')}>
          <sphereGeometry args={[ISLAND.sphereRadius, 40, 12, 0, Math.PI * 2, 0, capAngle]} />
        </mesh>
      </RigidBody>
    </group>
  );
}

function Mud() {
  const bubbleTimer = useRef(0);
  useFrame((_, delta) => {
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

function Hill() {
  const capAngle = Math.acos((HILL.sphereRadius - HILL.height) / HILL.sphereRadius);
  return (
    <RigidBody type="fixed" colliders={false} position={[HILL.center[0], HILL.height - HILL.sphereRadius, HILL.center[1]]}>
      <BallCollider args={[HILL.sphereRadius]} />
      <mesh receiveShadow castShadow material={lambert('#86d066')}>
        <sphereGeometry args={[HILL.sphereRadius, 48, 16, 0, Math.PI * 2, 0, capAngle]} />
      </mesh>
      {[[2, 2], [-3, 1], [1, -3], [-1, 3.5], [3.5, -1]].map(([x, z], i) => (
        <mesh key={i} position={[x, HILL.sphereRadius - 0.35, z]} material={lambert(['#ff6f91', '#ffd23f', '#ffffff'][i % 3])}>
          <icosahedronGeometry args={[0.16, 0]} />
        </mesh>
      ))}
    </RigidBody>
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

function Clouds() {
  const group = useRef<THREE.Group>(null);
  const clouds = useMemo(() => {
    const rnd = seeded(42);
    return Array.from({ length: 10 }, () => ({
      x: (rnd() - 0.5) * 180,
      y: 24 + rnd() * 10,
      z: -60 + rnd() * 90,
      s: 2 + rnd() * 2.5,
      speed: 0.6 + rnd() * 0.8
    }));
  }, []);
  useFrame((_, delta) => {
    group.current?.children.forEach((c, i) => {
      c.position.x += clouds[i].speed * delta;
      if (c.position.x > 100) c.position.x = -100;
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

export function Park() {
  return (
    <>
      <Ground />
      <Hedges />
      <Paths />
      <Flowers />
      <Orchard />
      <Pond />
      <Mud />
      <Hill />
      <Barn />
    </>
  );
}

export { Clouds };
