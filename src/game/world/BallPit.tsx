import { InstancedRigidBodies, type InstancedRigidBodyProps, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playBounce, playClack, playPoof } from '../audio';
import { gameNow, seededRandom, useGameFrame } from '../clock';
import { PARTY_POINTS } from '../config';
import { emit, poof } from '../fx';
import { BALL_PIT } from '../layout';
import { lambert } from '../materials';
import { allocPropId, debugInfo, players, registerProp } from '../runtime';
import { earnSticker } from '../stickers';
import { useGame } from '../store';
import { StaticBox, useHint } from './common';
import { randomStream } from '../rng';

const random = randomStream('ballPit');

// The ball pit: a tub full to the brim with little coloured balls (a "sea" of them, drawn as one
// instanced mesh with a spring on every ball) and some big real ones in among them. Wade through
// and the balls part and pile up round you; jump in and they splash up everywhere. Lick in it to
// pull out a big ball and throw it; one left lying about outside the pit rolls back in a while
// later.

const PIT_BALLS = 50;
const PIT_COLORS = ['#ff4d5e', '#ffd23f', '#3b82f6', '#22c55e', '#a855f7', '#ff8fd8', '#ff9f1c'];
const [CX, CZ] = BALL_PIT.center;
const HALF = BALL_PIT.size / 2;
/** The little balls of the sea. */
const SEA_R = 0.13;
const SEA_STEP = 0.27;
const SEA_N = Math.floor((BALL_PIT.size - 0.2) / SEA_STEP);
const SEA_COUNT = SEA_N * SEA_N;
/** Where the top of the sea is. */
const SEA_Y = 0.4;
/** Balls this close to an animal wading through get pushed aside. */
const PART_R = 0.85;
/** Falling in faster than this is a splash (and a sticker). */
const SPLASH_SPEED = 5;
/** A big ball left outside the pit rolls back in after this long (ms). */
const BACK_AFTER = 12000;

const inPit = (x: number, z: number, margin = 0) => Math.abs(x - CX) < HALF - margin && Math.abs(z - CZ) < HALF - margin;

/**
 * The sea's own dice, for where each little ball lies and its colour: drawing those from the game's
 * random numbers would shift everything random that comes after (a cat's run, a chicken's turn).
 */
const seaRandom = seededRandom(0xba11);

/** For tests: splashes so far, the last one, how far the sea is stirred up, big balls brought back. */
export const ballPit = { splashes: 0, last: null as null | { x: number; z: number; speed: number; slot: number }, stir: 0, back: 0 };

function BallSea() {
  // per ball: where it lies, and how far it's pushed away from there (and how fast it's flying)
  const sea = useMemo(() => {
    const bx = new Float32Array(SEA_COUNT);
    const by = new Float32Array(SEA_COUNT);
    const bz = new Float32Array(SEA_COUNT);
    for (let i = 0; i < SEA_COUNT; i += 1) {
      const gx = i % SEA_N;
      const gz = Math.floor(i / SEA_N);
      bx[i] = CX - (SEA_N - 1) * SEA_STEP * 0.5 + gx * SEA_STEP + (seaRandom() - 0.5) * 0.08;
      bz[i] = CZ - (SEA_N - 1) * SEA_STEP * 0.5 + gz * SEA_STEP + (seaRandom() - 0.5) * 0.08;
      by[i] = SEA_Y - SEA_R + (seaRandom() - 0.5) * 0.1;
    }
    return { bx, by, bz, ox: new Float32Array(SEA_COUNT), oy: new Float32Array(SEA_COUNT), oz: new Float32Array(SEA_COUNT), vy: new Float32Array(SEA_COUNT) };
  }, []);
  // made here with every ball placed and coloured: instance colours only show if they're there
  // the first time the mesh is drawn
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.SphereGeometry(SEA_R, 8, 6), new THREE.MeshLambertMaterial(), SEA_COUNT);
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    for (let i = 0; i < SEA_COUNT; i += 1) {
      d.position.set(sea.bx[i], sea.by[i], sea.bz[i]);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      m.setColorAt(i, c.set(PIT_COLORS[Math.floor(seaRandom() * PIT_COLORS.length)]));
    }
    m.receiveShadow = true;
    return m;
  }, [sea]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const st = useRef({ above: new Map<number, boolean>(), resting: true });

  const splash = (x: number, z: number, speed: number, slot: number) => {
    ballPit.splashes += 1;
    ballPit.last = { x, z, speed, slot };
    const reach = 1.4 + speed * 0.08;
    for (let i = 0; i < SEA_COUNT; i += 1) {
      const d = Math.hypot(sea.bx[i] - x, sea.bz[i] - z);
      if (d > reach) continue;
      sea.vy[i] += (1 - d / reach) * speed * (0.5 + seaRandom() * 0.5);
    }
    emit('chunk', [x, SEA_Y + 0.2, z], { count: 18 + Math.round(speed * 2), color: PIT_COLORS, speed: 2 + speed * 0.4, up: 3 + speed * 0.4, size: 0.16 });
    playBounce([x, SEA_Y, z], 0.8);
    playClack([x, SEA_Y, z], 0.3);
    useGame.getState().addParty(PARTY_POINTS.splat);
    st.current.resting = false;
  };

  useGameFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const s = st.current;
    // who's wading (or falling in)?
    const waders: { x: number; z: number }[] = [];
    players.forEach((p) => {
      const { x, y, z } = p.position;
      const inside = inPit(x, z, 0.1) && y < 3;
      const wasAbove = s.above.get(p.slot) ?? true;
      const above = !inside || y > SEA_Y + 0.75;
      // splashing down into it
      if (inside && wasAbove && !above && p.velocity.y < -SPLASH_SPEED) {
        splash(x, z, -p.velocity.y, p.slot);
        if (!p.bot) earnSticker('ballpit');
      }
      s.above.set(p.slot, above);
      if (inside && y < SEA_Y + 1) waders.push({ x, z });
    });
    if (!waders.length && s.resting) return;

    let stir = 0;
    for (let i = 0; i < SEA_COUNT; i += 1) {
      // pushed aside (and up into a little heap) by anyone close
      let tx = 0;
      let tz = 0;
      let ty = 0;
      for (const w of waders) {
        const dx = sea.bx[i] - w.x;
        const dz = sea.bz[i] - w.z;
        const d = Math.hypot(dx, dz);
        if (d > PART_R || d < 1e-4) continue;
        const k = (PART_R - d) / PART_R;
        tx += (dx / d) * k * 0.4;
        tz += (dz / d) * k * 0.4;
        ty += k * 0.3;
      }
      const ease = Math.min(1, dt * 10);
      sea.ox[i] += (tx - sea.ox[i]) * ease;
      sea.oz[i] += (tz - sea.oz[i]) * ease;
      // flying (from a splash) falls back down; otherwise a soft spring to where it's pushed
      const acc = sea.oy[i] > ty + 0.02 && sea.vy[i] > -0.5 ? -18 : (ty - sea.oy[i]) * 70 - sea.vy[i] * 9;
      sea.vy[i] += acc * dt;
      sea.oy[i] = Math.max(-0.15, sea.oy[i] + sea.vy[i] * dt);
      stir = Math.max(stir, Math.abs(sea.oy[i]) + Math.abs(sea.vy[i]) * 0.1);
      dummy.position.set(sea.bx[i] + sea.ox[i], sea.by[i] + sea.oy[i], sea.bz[i] + sea.oz[i]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    ballPit.stir = stir;
    s.resting = !waders.length && stir < 0.01;
  });

  return <primitive object={mesh} />;
}

/** The big balls: real ones (to kick about, or pull out with your tongue and throw). */
function BigBalls() {
  const bodies = useRef<RapierRigidBody[]>(null);
  const mesh = useRef<THREE.InstancedMesh>(null);
  const awaySince = useRef(new Float64Array(PIT_BALLS).fill(-1));
  const ids = useMemo(() => Array.from({ length: PIT_BALLS }, () => allocPropId()), []);
  const instances = useMemo<InstancedRigidBodyProps[]>(
    () =>
      Array.from({ length: PIT_BALLS }, (_, i) => ({
        key: `pit-${i}`,
        position: [CX + ((i % 7) - 3) * 0.75, 0.3 + Math.floor(i / 49) * 0.5 + (i % 3) * 0.12, CZ + ((Math.floor(i / 7) % 7) - 3) * 0.75] as [number, number, number]
      })),
    []
  );
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const c = new THREE.Color();
    for (let i = 0; i < PIT_BALLS; i += 1) m.setColorAt(i, c.set(PIT_COLORS[i % PIT_COLORS.length]));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, []);

  useEffect(() => {
    const offs = ids.map((id, i) =>
      registerProp({
        id,
        kind: 'pitball',
        getBody: () => bodies.current?.[i] ?? null,
        radius: 0.3,
        launch: 12,
        heavy: false,
        grabbable: true,
        enabled: true,
        heldBy: null
      })
    );
    return () => offs.forEach((off) => off());
  }, [ids]);

  // one lying about outside the pit for a while rolls back in (with a poof)
  useGameFrame(() => {
    const list = bodies.current;
    if (!list) return;
    const now = gameNow();
    for (let i = 0; i < list.length; i += 1) {
      const b = list[i];
      if (!b) continue;
      const t = b.translation();
      const v = b.linvel();
      const out = !inPit(t.x, t.z, 0.2) || t.y < -2;
      if (!out || Math.hypot(v.x, v.y, v.z) > 0.5) {
        awaySince.current[i] = -1;
        continue;
      }
      if (awaySince.current[i] < 0) awaySince.current[i] = now;
      else if (now - awaySince.current[i] > BACK_AFTER) {
        awaySince.current[i] = -1;
        poof([t.x, t.y, t.z], PIT_COLORS[i % PIT_COLORS.length], 6);
        b.setTranslation({ x: CX + (random() - 0.5) * (BALL_PIT.size - 1.5), y: 1.2, z: CZ + (random() - 0.5) * (BALL_PIT.size - 1.5) }, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        playPoof([CX, 0.5, CZ]);
        ballPit.back += 1;
      }
    }
  });

  return (
    <InstancedRigidBodies ref={bodies} instances={instances} colliders="ball" restitution={0.5} friction={0.4} linearDamping={0.3} angularDamping={0.3}>
      <instancedMesh ref={mesh} args={[undefined, undefined, PIT_BALLS]} castShadow frustumCulled={false}>
        <sphereGeometry args={[0.24, 10, 8]} />
        <meshLambertMaterial />
      </instancedMesh>
    </InstancedRigidBodies>
  );
}

export function BallPit() {
  useHint([CX, 1, CZ + HALF], 'jump', 4.5);
  useEffect(() => {
    debugInfo.ballPit = ballPit;
  }, []);
  const wall = 0.3;
  return (
    <group>
      <mesh position={[CX, 0.02, CZ]} rotation={[-Math.PI / 2, 0, 0]} material={lambert('#ffffff')}>
        <planeGeometry args={[BALL_PIT.size, BALL_PIT.size]} />
      </mesh>
      <StaticBox position={[CX, 0.4, CZ - HALF]} size={[BALL_PIT.size + wall, 0.8, wall]} color="#ff8fd8" />
      <StaticBox position={[CX, 0.4, CZ + HALF]} size={[BALL_PIT.size + wall, 0.8, wall]} color="#ff8fd8" />
      <StaticBox position={[CX - HALF, 0.4, CZ]} size={[wall, 0.8, BALL_PIT.size + wall]} color="#8fd3ff" />
      <StaticBox position={[CX + HALF, 0.4, CZ]} size={[wall, 0.8, BALL_PIT.size + wall]} color="#8fd3ff" />
      <BallSea />
      <BigBalls />
    </group>
  );
}
