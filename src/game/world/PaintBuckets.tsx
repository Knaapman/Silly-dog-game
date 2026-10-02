import { CylinderCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { playPoof, playSplat } from '../audio';
import { gameNow, useGameFrame } from '../clock';
import { PARTY_POINTS } from '../config';
import { emit, poof } from '../fx';
import { distXZ, PAINT_BUCKETS } from '../layout';
import { lambert } from '../materials';
import { FOOTPRINTS, footprints, PAINT_COLORS, paintAnimal, paintColor, paintOf } from '../paint';
import { RADIUS } from '../player/constants';
import { debugInfo, players, registerStatic } from '../runtime';
import { useGame } from '../store';
import { groundHeight } from '../terrain';
import { useHint } from './common';

// Paint buckets: headbutt one and over it goes, splashing everyone near with paint and leaving
// a puddle (walk through it to get painted too). A painted animal leaves paw prints everywhere it
// goes. A while later the bucket stands itself back up, full again.

const [PX, PZ] = PAINT_BUCKETS.center;
const BUCKETS = PAINT_COLORS.map((_, i) => {
  const x = PX + (i - (PAINT_COLORS.length - 1) / 2) * PAINT_BUCKETS.spacing;
  return { x, z: PZ, y: groundHeight(x, PZ) };
});
/** Everyone this close when it tips gets splashed. */
const SPLASH = 3;
const PUDDLE_R = 1.6;
const PUDDLE_FOR = 25;
const UPRIGHT_AFTER = 6;
/** Paw prints last this long (shrinking away at the end). */
const PRINT_FOR = 22;

type Bucket = { tippedAt: number; dir: number; puddle: { x: number; z: number; at: number } | null; tips: number };

/** A little paw: a pad and three toes. */
function pawGeometry() {
  const pad = new THREE.CircleGeometry(0.09, 10);
  const toes = [-1, 0, 1].map((k) => {
    const g = new THREE.CircleGeometry(0.04, 8);
    g.translate(k * 0.07, 0.1 + (k === 0 ? 0.025 : 0), 0);
    return g;
  });
  const paw = mergeGeometries([pad, ...toes])!;
  paw.rotateX(-Math.PI / 2);
  return paw;
}

export function PaintBuckets() {
  const state = useRef<Bucket[]>(BUCKETS.map(() => ({ tippedAt: -1e9, dir: 0, puddle: null, tips: 0 })));
  const groups = useRef<(THREE.Group | null)[]>([]);
  const puddles = useRef<(THREE.Mesh | null)[]>([]);
  // (made here, with every print hidden and a colour already set: the colours only show if the
  // mesh has them the first time it's drawn)
  const prints = useMemo(() => {
    const m = new THREE.InstancedMesh(pawGeometry(), new THREE.MeshBasicMaterial({ color: '#ffffff', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), FOOTPRINTS);
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    const white = new THREE.Color('#ffffff');
    for (let k = 0; k < FOOTPRINTS; k += 1) {
      m.setMatrixAt(k, hidden);
      m.setColorAt(k, white);
    }
    m.frustumCulled = false;
    return m;
  }, []);
  const puddleMats = useMemo(() => PAINT_COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  useHint([PX, BUCKETS[0].y + 1.4, PZ], 'bonk', 3.5);

  useEffect(() => {
    debugInfo.paint = { buckets: state.current, footprints };
    debugInfo.paintOf = paintOf;
  }, []);

  const tip = (i: number, dir: THREE.Vector3) => {
    const b = state.current[i];
    const now = gameNow();
    if (now - b.tippedAt < UPRIGHT_AFTER * 1000) return;
    const at = BUCKETS[i];
    b.tippedAt = now;
    b.tips += 1;
    b.dir = Math.atan2(dir.x, dir.z);
    // it pours out the way it was knocked
    b.puddle = { x: at.x + Math.sin(b.dir) * 1.3, z: at.z + Math.cos(b.dir) * 1.3, at: now };
    emit('drop', [at.x, at.y + 0.6, at.z], { count: 50, color: [PAINT_COLORS[i], PAINT_COLORS[i], '#ffffff'], speed: 5, up: 6, size: 0.16 });
    emit('chunk', [b.puddle.x, at.y + 0.2, b.puddle.z], { count: 20, color: PAINT_COLORS[i], speed: 3, up: 4, size: 0.18 });
    playSplat([at.x, at.y, at.z]);
    useGame.getState().addParty(PARTY_POINTS.splat);
    players.forEach((p) => {
      if (distXZ(p.position.x, p.position.z, at.x, at.z) < SPLASH && p.position.y - at.y < 3) paintAnimal(p.slot, i);
    });
  };

  useEffect(() => {
    const offs = BUCKETS.map((at, i) =>
      registerStatic({ id: 9600 + i, position: new THREE.Vector3(at.x, at.y + 0.5, at.z), radius: 0.55, onBonk: (_slot, dir) => tip(i, dir) })
    );
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useGameFrame(() => {
    const now = gameNow();
    state.current.forEach((b, i) => {
      const at = BUCKETS[i];
      const since = (now - b.tippedAt) / 1000;
      const g = groups.current[i];
      if (g) {
        // over it goes (quickly), lies there, then stands back up with a poof
        const down = since < UPRIGHT_AFTER ? Math.min(1, since / 0.25) : 0;
        g.rotation.set(Math.cos(b.dir) * down * 1.45, 0, -Math.sin(b.dir) * down * 1.45);
      }
      if (since >= UPRIGHT_AFTER && since < UPRIGHT_AFTER + 0.05) {
        poof([at.x, at.y + 0.5, at.z], PAINT_COLORS[i], 10);
        playPoof([at.x, at.y, at.z]);
        b.tippedAt -= 100;
      }
      // the puddle: walk through it and you're painted too
      const pd = b.puddle;
      const m = puddles.current[i];
      if (pd) {
        const age = (now - pd.at) / 1000;
        if (age > PUDDLE_FOR) b.puddle = null;
        else {
          const grow = Math.min(1, age / 0.4) * Math.min(1, (PUDDLE_FOR - age) / 3);
          if (m) {
            m.visible = true;
            m.position.set(pd.x, groundHeight(pd.x, pd.z) + 0.02, pd.z);
            m.scale.setScalar(Math.max(0.01, grow));
          }
          players.forEach((p) => {
            if (distXZ(p.position.x, p.position.z, pd.x, pd.z) < PUDDLE_R * grow && p.position.y - groundHeight(pd.x, pd.z) < RADIUS + 0.4) paintAnimal(p.slot, i);
          });
        }
      }
      if (m && !b.puddle) m.visible = false;
    });

    // paw prints
    const ip = prints;
    {
      for (let k = 0; k < FOOTPRINTS; k += 1) {
        const f = footprints.list[k];
        const age = f ? (now - f.at) / 1000 : Infinity;
        if (!f || age > PRINT_FOR) {
          dummy.scale.setScalar(0);
          dummy.position.set(0, -100, 0);
        } else {
          dummy.position.set(f.x, f.y, f.z);
          dummy.rotation.set(0, f.yaw, 0);
          dummy.scale.setScalar(Math.min(1, (PRINT_FOR - age) / 4));
          ip.setColorAt(k, color.set(paintColor(f.color)));
        }
        dummy.updateMatrix();
        ip.setMatrixAt(k, dummy.matrix);
      }
      ip.instanceMatrix.needsUpdate = true;
      if (ip.instanceColor) ip.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      {BUCKETS.map((at, i) => (
        <group key={i} position={[at.x, at.y, at.z]}>
          <RigidBody type="fixed" colliders={false}>
            <CylinderCollider args={[0.35, 0.45]} position={[0, 0.35, 0]} />
          </RigidBody>
          <group
            ref={(g) => {
              groups.current[i] = g;
            }}
          >
            <mesh position={[0, 0.35, 0]} castShadow material={lambert('#e5e7eb')}>
              <cylinderGeometry args={[0.45, 0.38, 0.7, 16, 1, true]} />
            </mesh>
            <mesh position={[0, 0.02, 0]} material={lambert('#d1d5db')}>
              <cylinderGeometry args={[0.38, 0.38, 0.04, 16]} />
            </mesh>
            {/* full to the top with paint, dribbles down the side */}
            <mesh position={[0, 0.64, 0]} material={lambert(PAINT_COLORS[i])}>
              <cylinderGeometry args={[0.43, 0.43, 0.04, 16]} />
            </mesh>
            {[0.3, 2.2, 4.1].map((a) => (
              <mesh key={a} position={[Math.sin(a) * 0.43, 0.5, Math.cos(a) * 0.43]} material={lambert(PAINT_COLORS[i])}>
                <capsuleGeometry args={[0.04, 0.2, 3, 6]} />
              </mesh>
            ))}
            <mesh position={[0, 0.72, 0]} rotation={[0, 0, 0]} material={lambert('#6b7280')}>
              <torusGeometry args={[0.45, 0.02, 4, 16, Math.PI]} />
            </mesh>
          </group>
          {/* a splat of its colour on the ground, so you can tell them apart from afar */}
          <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, i]} material={puddleMats[i]}>
            <circleGeometry args={[0.75, 7]} />
          </mesh>
        </group>
      ))}
      {PAINT_COLORS.map((_, i) => (
        <mesh
          key={`p${i}`}
          visible={false}
          rotation={[-Math.PI / 2, 0, 0]}
          ref={(m) => {
            puddles.current[i] = m;
          }}
          material={puddleMats[i]}
        >
          <circleGeometry args={[PUDDLE_R, 14]} />
        </mesh>
      ))}
      <primitive object={prints} />
    </group>
  );
}
