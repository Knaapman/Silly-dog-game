import { CuboidCollider, RigidBody, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { playChuff, playToot } from '../audio';
import { emit } from '../fx';
import { GOLDEN_STARS, TRACK_LIFTS, TRAIN } from '../layout';
import { lambert } from '../materials';
import { debugInfo, players, type Surface } from '../runtime';
import { Ramp, StaticBox, useHint } from './common';
import { GoldenStar } from './Stars';
import { useSurface } from './surface';
import { gameNow, useGameFrame } from '../clock';
import { groundHeight } from '../terrain';
import { LIFTS, TRACK_LENGTH, trackAt, trackLift } from '../track';
import { nearAnyCamera } from '../views';

const [TX, TZ] = TRAIN.center;
const R = TRAIN.cornerRadius;
const CX = TRAIN.halfX - R;
const CZ = TRAIN.halfZ - R;
const ARC = (Math.PI / 2) * R;
const LENGTH = TRACK_LENGTH;
const CAR_GAP = 4.6;
const CARS = 4; // locomotive + 3 wagons
/** The loco's front stops at the far end of the platform (it heads north up the east straight). */
const STOP_S = 2 * CX + ARC + (TZ + CZ - TRAIN.station.from);
/** The platform: on the inside of the east straight. */
const PLATFORM_X = TX + TRAIN.halfX - 2.4;

export { trackAt };

/** A slab of bridge deck, tipped to follow the track (a StaticBox can only turn one way at a time). */
function DeckPiece({ x, y, z, yaw, pitch, len, width, color }: { x: number; y: number; z: number; yaw: number; pitch: number; len: number; width: number; color: string }) {
  const q = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')), [pitch, yaw]);
  return (
    <RigidBody type="fixed" colliders={false} position={[x, y, z]} quaternion={q}>
      <CuboidCollider args={[width / 2, TRACK_LIFTS.deckThickness / 2, len / 2]} />
      <mesh castShadow receiveShadow material={lambert(color)}>
        <boxGeometry args={[width, TRACK_LIFTS.deckThickness, len]} />
      </mesh>
    </RigidBody>
  );
}

/**
 * The railway's bridges: wherever the raised track (see TRACK_LIFTS) runs over a drop in the
 * ground (the river, the lagoon, the sea), a deck on posts carries it, high enough to float or
 * swim underneath. Over the river it is a stone bridge with low parapets; along the sea, a
 * wooden trestle.
 */
function Viaducts() {
  const pieces = useMemo(() => {
    const out: { x: number; y: number; z: number; yaw: number; pitch: number; len: number; drop: number; stone: boolean; post: boolean }[] = [];
    const p = { x: 0, z: 0, dx: 0, dz: 0 };
    const lift = { y: 0, grade: 0 };
    const STEP = 2.5;
    for (const l of LIFTS) {
      let n = 0;
      for (let s = l.sFrom - TRACK_LIFTS.ramp; s < l.sFrom + l.span + TRACK_LIFTS.ramp; s += STEP) {
        trackAt(s + STEP / 2, p);
        trackLift(s + STEP / 2, lift);
        const drop = lift.y - TRACK_LIFTS.deckThickness - groundHeight(p.x, p.z);
        if (lift.y < 0.5 || drop < 0.1) continue;
        out.push({ x: p.x, y: lift.y - TRACK_LIFTS.deckThickness / 2, z: p.z, yaw: Math.atan2(p.dx, p.dz), pitch: -Math.atan(lift.grade), len: STEP + 0.7, drop, stone: l.style === 'stone', post: n % 2 === 0 }); // overlapping, so the outside of a curve has no gaps
        n += 1;
      }
    }
    return out;
  }, []);
  return (
    <group>
      {pieces.map((d, i) => {
        const width = d.stone ? 3.6 : 3.2;
        const bottom = d.y - TRACK_LIFTS.deckThickness / 2;
        return (
          <group key={i}>
            <DeckPiece x={d.x} y={d.y} z={d.z} yaw={d.yaw} pitch={d.pitch} len={d.len} width={width} color={d.stone ? '#9e9689' : '#8d6e63'} />
            {d.stone &&
              [-1, 1].map((side) => (
                <DeckPiece key={side} x={d.x + Math.cos(d.yaw) * side * (width / 2 + 0.15)} y={d.y + 0.45} z={d.z - Math.sin(d.yaw) * side * (width / 2 + 0.15)} yaw={d.yaw} pitch={d.pitch} len={d.len} width={0.3} color="#b0a89a" />
              ))}
            {d.post &&
              (d.stone ? [0] : [-1.2, 1.2]).map((side) => (
                <mesh key={side} castShadow position={[d.x + Math.cos(d.yaw) * side, bottom - (d.drop + 0.8) / 2, d.z - Math.sin(d.yaw) * side]} rotation={[0, d.yaw + Math.PI / 2, 0]} material={lambert(d.stone ? '#b0a89a' : '#6d4c41')}>
                  {d.stone ? <boxGeometry args={[1.2, d.drop + 0.8, width - 0.4]} /> : <cylinderGeometry args={[0.16, 0.18, d.drop + 0.8, 8]} />}
                </mesh>
              ))}
          </group>
        );
      })}
    </group>
  );
}

function Track() {
  const ties = useRef<THREE.InstancedMesh>(null);
  const rails = useRef<THREE.InstancedMesh>(null);
  const tieCount = Math.floor(LENGTH / 0.9);
  const railCount = Math.floor(LENGTH / 1) * 2;
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    o.rotation.order = 'YXZ';
    const p = { x: 0, z: 0, dx: 0, dz: 0 };
    const lift = { y: 0, grade: 0 };
    for (let i = 0; i < tieCount; i += 1) {
      trackAt(i * 0.9, p);
      trackLift(i * 0.9, lift);
      o.position.set(p.x, lift.y + 0.04, p.z);
      o.rotation.set(-Math.atan(lift.grade), Math.atan2(p.dx, p.dz), 0);
      o.updateMatrix();
      ties.current?.setMatrixAt(i, o.matrix);
    }
    for (let i = 0; i < railCount / 2; i += 1) {
      trackAt(i + 0.5, p);
      trackLift(i + 0.5, lift);
      const yaw = Math.atan2(p.dx, p.dz);
      [-0.72, 0.72].forEach((side, k) => {
        // side offset perpendicular to the heading
        o.position.set(p.x + p.dz * side, lift.y + 0.13, p.z - p.dx * side);
        o.rotation.set(-Math.atan(lift.grade), yaw, 0);
        o.updateMatrix();
        rails.current?.setMatrixAt(i * 2 + k, o.matrix);
      });
    }
    [ties.current, rails.current].forEach((m) => {
      if (!m) return;
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    });
  }, [tieCount, railCount]);
  return (
    <group>
      <instancedMesh ref={ties} args={[undefined, undefined, tieCount]} receiveShadow material={lambert('#8d6e63')}>
        <boxGeometry args={[2.4, 0.08, 0.32]} />
      </instancedMesh>
      <instancedMesh ref={rails} args={[undefined, undefined, railCount]} material={lambert('#90a4ae')}>
        <boxGeometry args={[0.12, 0.12, 1.04]} />
      </instancedMesh>
    </group>
  );
}

type CarState = { x: number; y: number; z: number; dx: number; dz: number; yaw: number; pitch: number; w: number; vy: number; speed: number };

const CAR_COLORS = ['#ff4d5e', '#ffd23f', '#3b82f6', '#22c55e'];

function Car({ index, cars, trainSpeed }: { index: number; cars: MutableRefObject<CarState[]>; trainSpeed: MutableRefObject<number> }) {
  const body = useRef<RapierRigidBody>(null);
  const deck = useRef<RapierCollider>(null);
  const roof = useRef<RapierCollider>(null);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const euler = useMemo(() => new THREE.Euler(), []);
  const surface = useMemo<Surface>(
    () => ({
      velocityAt: (p, out) => {
        const c = cars.current[index];
        const rx = p.x - c.x;
        const rz = p.z - c.z;
        return out.set(c.dx * trainSpeed.current + c.w * rz, c.vy, c.dz * trainSpeed.current - c.w * rx);
      }
    }),
    [cars, index, trainSpeed]
  );
  useSurface(deck, surface);
  useSurface(roof, surface);
  const start = useMemo(() => {
    const p = trackAt(STOP_S - index * CAR_GAP, { x: 0, z: 0, dx: 0, dz: 0 });
    return { pos: [p.x, trackLift(STOP_S - index * CAR_GAP).y, p.z] as [number, number, number], yaw: Math.atan2(p.dx, p.dz) };
  }, [index]);

  useGameFrame(() => {
    const rb = body.current;
    const c = cars.current[index];
    if (!rb || !c) return;
    rb.setNextKinematicTranslation({ x: c.x, y: c.y, z: c.z });
    rb.setNextKinematicRotation(q.setFromEuler(euler.set(c.pitch, c.yaw, 0, 'YXZ')));
  });

  const loco = index === 0;
  const color = CAR_COLORS[index % CAR_COLORS.length];
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={start.pos} rotation={[0, start.yaw, 0]}>
      <CuboidCollider ref={deck} args={[1.05, 0.12, 1.85]} position={[0, 0.83, 0]} />
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} castShadow position={[i < 2 ? -0.8 : 0.8, 0.4, i % 2 ? 1.2 : -1.2]} rotation={[0, 0, Math.PI / 2]} material={lambert('#263238')}>
          <cylinderGeometry args={[0.38, 0.38, 0.2, 14]} />
        </mesh>
      ))}
      <mesh castShadow receiveShadow position={[0, 0.83, 0]} material={lambert(loco ? '#37474f' : color)}>
        <boxGeometry args={[2.1, 0.24, 3.7]} />
      </mesh>
      {loco ? (
        <>
          <CuboidCollider args={[0.75, 0.75, 1.05]} position={[0, 1.7, 0.85]} />
          <CuboidCollider ref={roof} args={[1.0, 0.85, 0.75]} position={[0, 1.8, -1.05]} />
          <mesh castShadow position={[0, 1.7, 0.85]} rotation={[Math.PI / 2, 0, 0]} material={lambert('#ff4d5e')}>
            <cylinderGeometry args={[0.75, 0.75, 2.1, 18]} />
          </mesh>
          <mesh position={[0, 1.7, 1.91]} material={lambert('#cfd8dc')}>
            <circleGeometry args={[0.72, 20]} />
          </mesh>
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.26, 1.88, 1.93]}>
              <mesh material={lambert('#ffffff')}>
                <circleGeometry args={[0.17, 14]} />
              </mesh>
              <mesh position={[0, -0.03, 0.01]} material={lambert('#111111')}>
                <circleGeometry args={[0.08, 10]} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, 1.48, 1.93]} rotation={[0, 0, Math.PI]} material={lambert('#e53935')}>
            <ringGeometry args={[0.18, 0.25, 16, 1, 0, Math.PI]} />
          </mesh>
          <mesh castShadow position={[0, 2.75, 1.45]} material={lambert('#263238')}>
            <cylinderGeometry args={[0.28, 0.2, 0.9, 12]} />
          </mesh>
          <mesh castShadow position={[0, 1.8, -1.05]} material={lambert('#3b82f6')}>
            <boxGeometry args={[2.0, 1.7, 1.5]} />
          </mesh>
          <mesh castShadow position={[0, 2.72, -1.05]} material={lambert('#ffd23f')}>
            <boxGeometry args={[2.3, 0.15, 1.8]} />
          </mesh>
          <mesh position={[0, 0.7, 2.05]} rotation={[-0.5, 0, 0]} material={lambert('#ffd23f')}>
            <boxGeometry args={[1.9, 0.5, 0.2]} />
          </mesh>
        </>
      ) : (
        <>
          {/* low painted edges only: no walls, so you can walk straight on from the platform */}
          {[-1.02, 1.02].map((x) => (
            <mesh key={x} castShadow position={[x, 1.02, 0]} material={lambert('#ffffff')}>
              <boxGeometry args={[0.1, 0.14, 3.7]} />
            </mesh>
          ))}
        </>
      )}
    </RigidBody>
  );
}

function Station() {
  const x = PLATFORM_X;
  const [from, to] = [TRAIN.station.from, TRAIN.station.to];
  const mid = (from + to) / 2;
  useHint([x, 1.2, mid], 'walk', 5);
  return (
    <group>
      <StaticBox position={[x, 0.475, mid]} size={[2, 0.95, to - from]} color="#b0bec5" />
      <mesh position={[x + 0.85, 0.96, mid]} rotation={[-Math.PI / 2, 0, 0]} material={lambert('#ffd23f')}>
        <planeGeometry args={[0.2, to - from]} />
      </mesh>
      <Ramp from={[x, 0, from - 3.2]} to={[x, 0.95, from]} width={2} color="#b0bec5" />
      <Ramp from={[x, 0, to + 3.2]} to={[x, 0.95, to]} width={2} color="#b0bec5" />
      <mesh castShadow position={[x - 0.6, 2.1, mid]} material={lambert('#37474f')}>
        <cylinderGeometry args={[0.08, 0.08, 2.4, 8]} />
      </mesh>
      <mesh position={[x - 0.6, 3.3, mid]} rotation={[0, 0, Math.PI / 2]} material={lambert('#ffffff')}>
        <cylinderGeometry args={[0.45, 0.45, 0.12, 20]} />
      </mesh>
    </group>
  );
}

export function Train() {
  const cars = useRef<CarState[]>(Array.from({ length: CARS }, () => ({ x: 0, y: 0, z: 0, dx: 0, dz: 1, yaw: 0, pitch: 0, w: 0, vy: 0, speed: 0 })));
  const speed = useRef(0);
  const state = useRef({ s: STOP_S, dwell: 3, stopped: true, smoke: 0, tootCooldown: 0, bumpCooldown: new Map<number, number>() });
  const p = useMemo(() => ({ x: 0, z: 0, dx: 0, dz: 0 }), []);
  const lift = useMemo(() => ({ y: 0, grade: 0 }), []);
  const starOffset = useMemo(() => new THREE.Vector3(), []);
  const starIndex = GOLDEN_STARS.indexOf('train');

  useGameFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const st = state.current;
    // Speed profile: cruise, brake into the station, wait, pull away with a toot.
    const toStop = (((STOP_S - st.s) % LENGTH) + LENGTH) % LENGTH;
    if (st.dwell > 0) {
      st.dwell -= dt;
      speed.current = 0;
      if (st.dwell <= 0) playToot([cars.current[0].x, 2, cars.current[0].z]);
    } else if (!st.stopped && toStop < (speed.current * speed.current) / 3 + 0.3) {
      speed.current = Math.max(0.4, Math.sqrt(1.5 * 2 * toStop));
      if (toStop < 0.15) {
        st.s = STOP_S;
        st.dwell = 4;
        st.stopped = true;
        speed.current = 0;
      }
    } else {
      speed.current = Math.min(TRAIN.speed, speed.current + dt * 1.4);
      if (st.stopped && toStop > 20 && toStop < LENGTH - 5) st.stopped = false;
    }
    st.s = (st.s + speed.current * dt) % LENGTH;
    debugInfo.train = cars.current;

    cars.current.forEach((c, i) => {
      trackAt(st.s - i * CAR_GAP, p);
      trackLift(st.s - i * CAR_GAP, lift);
      const yaw = Math.atan2(p.dx, p.dz);
      let dy = yaw - c.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      c.w = dt > 0 ? dy / dt : 0;
      c.x = p.x;
      c.z = p.z;
      c.dx = p.dx;
      c.dz = p.dz;
      c.yaw = yaw;
      c.y = lift.y;
      c.pitch = -Math.atan(lift.grade);
      c.vy = lift.grade * speed.current;
    });

    const loco = cars.current[0];
    const near = nearAnyCamera(loco.x, loco.z, 45);
    st.smoke -= dt;
    if (near && st.smoke <= 0 && speed.current > 0.5) {
      st.smoke = 0.35;
      emit('puff', [loco.x + loco.dx * 1.45, loco.y + 3.3, loco.z + loco.dz * 1.45], { count: 2, color: ['#eceff1', '#cfd8dc'], size: 0.5, speed: 0.6, up: 2.5, gravity: -1.2, life: 1.6 });
      playChuff([loco.x, 2, loco.z]);
    }

    // Friendly bump for anyone standing on the track in front of the train.
    st.tootCooldown -= dt;
    const now = gameNow();
    if (speed.current > 1) {
      const fx = loco.x + loco.dx * 2.4;
      const fz = loco.z + loco.dz * 2.4;
      players.forEach((pl) => {
        if (pl.position.y - loco.y > 1.6 || pl.position.y < loco.y - 1 || (st.bumpCooldown.get(pl.slot) ?? 0) > now) return;
        if (Math.hypot(pl.position.x - fx, pl.position.z - fz) > 1.7) return;
        const side = Math.sign((pl.position.x - loco.x) * loco.dz - (pl.position.z - loco.z) * loco.dx) || 1;
        pl.bump(new THREE.Vector3(loco.dz * side + loco.dx * 0.4, 0, -loco.dx * side + loco.dz * 0.4).normalize());
        st.bumpCooldown.set(pl.slot, now + 1500);
        if (st.tootCooldown <= 0) {
          st.tootCooldown = 2;
          playToot([loco.x, 2, loco.z]);
        }
      });
    }
  });

  return (
    <group>
      <Track />
      <Viaducts />
      <Station />
      {Array.from({ length: CARS }, (_, i) => (
        <Car key={i} index={i} cars={cars} trainSpeed={speed} />
      ))}
      {starIndex >= 0 && (
        <GoldenStar
          index={starIndex}
          getPosition={(out) => {
            const c = cars.current[0];
            starOffset.set(-c.dx * 1.05, 0, -c.dz * 1.05);
            out.set(c.x + starOffset.x, c.y + 3.85, c.z + starOffset.z);
          }}
        />
      )}
    </group>
  );
}
