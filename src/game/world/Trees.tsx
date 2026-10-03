import { CylinderCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { playRustle } from '../audio';
import { emit } from '../fx';
import { TREES, type TreeKind, type Vec3 } from '../layout';
import { lambert } from '../materials';
import { players, registerStatic, spawners } from '../runtime';
import { treeShakeListeners } from '../chase';
import { groundHeight } from '../terrain';
import { Prop } from './Prop';
import { gameClock, useGameFrame } from '../clock';
import { randomStream } from '../rng';

const random = randomStream('trees');

// All trees are instanced (one draw call per tree part) but each one can still be
// headbutted: it wobbles and drops apples or coconuts.

type Part = { geometry: THREE.BufferGeometry; color: string; matrix: THREE.Matrix4; canopy: boolean; shadow: boolean };

const m4 = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

function buildParts(kind: TreeKind): Part[] {
  const blob = (r: number) => new THREE.IcosahedronGeometry(r, 1);
  const trunk = (h: number, rTop = 0.28, rBottom = 0.4) => new THREE.CylinderGeometry(rTop, rBottom, h, 8);
  switch (kind) {
    case 'round':
    case 'blossom': {
      const leaves = kind === 'round' ? ['#3fa34d', '#57bb5a', '#48ad50'] : ['#ff9ecb', '#ffb8d9', '#ff8fc0'];
      const parts: Part[] = [
        { geometry: trunk(2.2), color: '#8b5a2b', matrix: m4(0, 1.1, 0), canopy: false, shadow: true },
        { geometry: blob(1.6), color: leaves[0], matrix: m4(0, 2.9, 0), canopy: true, shadow: true },
        { geometry: blob(1.1), color: leaves[1], matrix: m4(-0.7, 3.5, 0.4), canopy: true, shadow: true },
        { geometry: blob(1.2), color: leaves[2], matrix: m4(0.7, 3.4, -0.4), canopy: true, shadow: true }
      ];
      if (kind === 'round') {
        const apple = new THREE.SphereGeometry(0.16, 8, 6);
        [[0.9, 2.7, 1.1], [-1.1, 3.0, 0.6], [0.2, 3.3, 1.45]].forEach(([x, y, z]) =>
          parts.push({ geometry: apple, color: '#e53935', matrix: m4(x, y, z), canopy: true, shadow: false })
        );
      }
      return parts;
    }
    case 'pine':
    case 'snowpine': {
      const parts: Part[] = [
        { geometry: trunk(1.6, 0.25, 0.35), color: '#7a4a24', matrix: m4(0, 0.8, 0), canopy: false, shadow: true },
        { geometry: new THREE.ConeGeometry(1.8, 2.3, 8), color: '#2f8f46', matrix: m4(0, 2.6, 0), canopy: true, shadow: true },
        { geometry: new THREE.ConeGeometry(1.35, 1.9, 8), color: '#3aa052', matrix: m4(0, 3.8, 0), canopy: true, shadow: true },
        { geometry: new THREE.ConeGeometry(0.9, 1.5, 8), color: '#2f8f46', matrix: m4(0, 4.8, 0), canopy: true, shadow: true }
      ];
      if (kind === 'snowpine') {
        parts.push(
          { geometry: new THREE.ConeGeometry(1.1, 0.8, 8), color: '#ffffff', matrix: m4(0, 3.35, 0), canopy: true, shadow: false },
          { geometry: new THREE.ConeGeometry(0.75, 0.7, 8), color: '#ffffff', matrix: m4(0, 4.4, 0), canopy: true, shadow: false },
          { geometry: new THREE.ConeGeometry(0.45, 0.6, 8), color: '#ffffff', matrix: m4(0, 5.35, 0), canopy: true, shadow: false }
        );
      }
      return parts;
    }
    case 'palm': {
      const parts: Part[] = [
        { geometry: trunk(1.6, 0.22, 0.3), color: '#a0784a', matrix: m4(0, 0.8, 0, 0, 0, 0.08), canopy: false, shadow: true },
        { geometry: trunk(1.6, 0.2, 0.24), color: '#b08a58', matrix: m4(0.2, 2.3, 0, 0, 0, 0.16), canopy: false, shadow: true },
        { geometry: trunk(1.4, 0.18, 0.21), color: '#a0784a', matrix: m4(0.55, 3.7, 0, 0, 0, 0.26), canopy: false, shadow: true }
      ];
      const leaf = new THREE.SphereGeometry(1, 8, 6);
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * Math.PI * 2;
        parts.push({
          geometry: leaf,
          color: i % 2 ? '#3fa34d' : '#4caf50',
          matrix: m4(0.75 + Math.cos(a) * 1.1, 4.3, Math.sin(a) * 1.1, 0, -a, -0.45, 1.5, 0.12, 0.4),
          canopy: true,
          shadow: true
        });
      }
      const nut = new THREE.SphereGeometry(0.2, 8, 6);
      [[0.95, 4.05, 0.25], [0.55, 4.05, -0.25], [0.8, 3.95, -0.05]].forEach(([x, y, z]) =>
        parts.push({ geometry: nut, color: '#6d4c2f', matrix: m4(x, y, z), canopy: true, shadow: false })
      );
      return parts;
    }
  }
}

const KINDS: TreeKind[] = ['round', 'blossom', 'pine', 'palm', 'snowpine'];
const PIVOT_Y = 2;

/** Is this tree standing between the camera and a player (so it would hide them)? */
function occludes(x: number, z: number) {
  let hit = false;
  players.forEach((p) => {
    const dz = z - p.position.z;
    if (!hit && dz > 0.5 && dz < 11 && Math.abs(x - p.position.x) < 2.2 + dz * 0.15) hit = true;
  });
  return hit;
}

function TreeKindLayer({ kind, trees, wobble }: { kind: TreeKind; trees: { i: number; at: [number, number]; yaw: number; scale: number }[]; wobble: Float32Array }) {
  const parts = useMemo(() => buildParts(kind), [kind]);
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);
  const tmp = useMemo(() => ({ root: new THREE.Matrix4(), wob: new THREE.Matrix4(), out: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), s: new THREE.Matrix4() }), []);
  const dirty = useRef(new Set<number>());
  const fade = useMemo(() => new Float32Array(trees.length).fill(1), [trees]);

  const write = (k: number, wx: number, wz: number) => {
    const tree = trees[k];
    tmp.root.compose(
      new THREE.Vector3(tree.at[0], groundHeight(tree.at[0], tree.at[1]), tree.at[1]),
      tmp.q.setFromEuler(tmp.e.set(0, tree.yaw, 0)),
      new THREE.Vector3(tree.scale, tree.scale, tree.scale)
    );
    // wobble: rotate the canopy around a pivot up the trunk
    tmp.wob.makeTranslation(0, PIVOT_Y, 0).multiply(new THREE.Matrix4().makeRotationFromEuler(tmp.e.set(wx, 0, wz))).multiply(tmp.s.makeScale(fade[k], fade[k], fade[k])).multiply(new THREE.Matrix4().makeTranslation(0, -PIVOT_Y, 0));
    parts.forEach((part, p) => {
      const mesh = meshes.current[p];
      if (!mesh) return;
      tmp.out.copy(tmp.root);
      if (part.canopy) tmp.out.multiply(tmp.wob);
      tmp.out.multiply(part.matrix);
      mesh.setMatrixAt(k, tmp.out);
      mesh.instanceMatrix.needsUpdate = true;
    });
  };

  useLayoutEffect(() => {
    trees.forEach((_, k) => write(k, 0, 0));
    meshes.current.forEach((m) => m?.computeBoundingSphere());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trees, parts]);

  useGameFrame((_, delta) => {
    const t = gameClock.time;
    trees.forEach((tree, k) => {
      const w = wobble[tree.i];
      // shrink canopies that stand in front of a player, grow them back afterwards
      const want = occludes(tree.at[0], tree.at[1]) ? 0.05 : 1;
      if (Math.abs(fade[k] - want) > 0.001) {
        fade[k] = THREE.MathUtils.clamp(fade[k] + Math.sign(want - fade[k]) * delta * 4, 0.05, 1);
        dirty.current.add(k);
        write(k, 0, 0);
        return;
      }
      if (w > 0) {
        write(k, Math.cos(t * 22) * 0.12 * w, Math.sin(t * 25) * 0.18 * w);
        dirty.current.add(k);
      } else if (dirty.current.has(k)) {
        write(k, 0, 0);
        dirty.current.delete(k);
      }
    });
  });

  return (
    <>
      {parts.map((part, p) => (
        <instancedMesh
          key={p}
          ref={(m) => {
            meshes.current[p] = m;
          }}
          args={[part.geometry, lambert(part.color), trees.length]}
          castShadow={part.shadow}
          receiveShadow
        />
      ))}
    </>
  );
}

const FALLS: Record<TreeKind, { item: 'apple' | 'coconut' | null; leaves: string[] }> = {
  round: { item: 'apple', leaves: ['#3fa34d', '#57bb5a'] },
  blossom: { item: null, leaves: ['#ff9ecb', '#ffb8d9', '#ffffff'] },
  pine: { item: null, leaves: ['#2f8f46', '#3aa052'] },
  palm: { item: 'coconut', leaves: ['#3fa34d', '#4caf50'] },
  snowpine: { item: null, leaves: ['#ffffff', '#e6f4ff'] }
};

const MAX_APPLES = 10;

export function Trees() {
  const wobble = useMemo(() => new Float32Array(TREES.length), []);
  const byKind = useMemo(() => {
    const map = new Map<TreeKind, { i: number; at: [number, number]; yaw: number; scale: number }[]>();
    TREES.forEach((t, i) => {
      const list = map.get(t.kind) ?? [];
      list.push({ i, at: t.at, yaw: (i * 2.39996) % (Math.PI * 2), scale: 0.9 + ((i * 7) % 5) * 0.06 });
      map.set(t.kind, list);
    });
    return map;
  }, []);

  const [apples, setApples] = useState<{ id: number; pos: Vec3; color: string }[]>([]);
  const nextId = useRef(1);

  useEffect(() => {
    spawners.apple = (p, color = random() < 0.3 ? '#9ccc3c' : '#e53935') => {
      const id = nextId.current++;
      setApples((list) => [...list, { id, pos: [p.x, p.y, p.z] as Vec3, color }].slice(-MAX_APPLES));
    };
    const cleanups = TREES.map((tree, i) =>
      registerStatic({
        id: 5000 + i,
        position: new THREE.Vector3(tree.at[0], groundHeight(tree.at[0], tree.at[1]) + 1, tree.at[1]),
        radius: 0.6,
        onBonk: () => {
          wobble[i] = 1;
          treeShakeListeners.forEach((listener) => listener(i));
          const fall = FALLS[tree.kind];
          playRustle([tree.at[0], 2, tree.at[1]]);
          emit('confetti', [tree.at[0], 3.2, tree.at[1]], { count: 14, color: fall.leaves, speed: 3, up: 1, size: 1.4 });
          if (tree.kind === 'snowpine') emit('puff', [tree.at[0], 3, tree.at[1]], { count: 16, color: '#ffffff', speed: 3, up: -1, size: 0.35 });
          if (!fall.item) return;
          const n = 1 + Math.floor(random() * 2);
          for (let k = 0; k < n; k += 1) {
            const a = random() * Math.PI * 2;
            spawners.apple(
              new THREE.Vector3(tree.at[0] + Math.cos(a) * 1.1, 3.6, tree.at[1] + Math.sin(a) * 1.1),
              fall.item === 'coconut' ? '#6d4c2f' : undefined
            );
          }
        }
      })
    );
    return () => {
      cleanups.forEach((c) => c());
      spawners.apple = () => {};
    };
  }, [wobble]);

  useGameFrame((_, delta) => {
    for (let i = 0; i < wobble.length; i += 1) if (wobble[i] > 0) wobble[i] = Math.max(0, wobble[i] - delta * 1.5);
  });

  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        {TREES.map((t, i) => (
          <CylinderCollider key={i} args={[1.4, t.kind === 'palm' ? 0.3 : 0.4]} position={[t.at[0], groundHeight(t.at[0], t.at[1]) + 1.4, t.at[1]]} />
        ))}
      </RigidBody>
      {KINDS.map((kind) => {
        const trees = byKind.get(kind);
        return trees && trees.length > 0 ? <TreeKindLayer key={kind} kind={kind} trees={trees} wobble={wobble} /> : null;
      })}
      {apples.map((a) => (
        <Prop key={a.id} kind="apple" position={a.pos} color={a.color} edible onEaten={() => setApples((list) => list.filter((x) => x.id !== a.id))} />
      ))}
    </>
  );
}
