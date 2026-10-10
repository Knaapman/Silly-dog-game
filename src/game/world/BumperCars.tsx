import { CuboidCollider, CylinderCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playBoing, playSpin } from '../audio';
import { gameNow, useGameFrame } from '../clock';
import { PARTY_POINTS } from '../config';
import { emit } from '../fx';
import { getInput, rumble, type SourceId } from '../input';
import { BUMPER } from '../layout';
import { lambert } from '../materials';
import { canBoard, debugInfo, players, rider } from '../runtime';
import { earnSticker } from '../stickers';
import { useGame } from '../store';
import { groundHeight } from '../terrain';
import { StaticBox, useHint } from './common';
import { randomStream } from '../rng';
import { buddyMay } from '../settings';

const random = randomStream('bumperCars');

// Bumper cars at the carnival. Walk in through the gap in the rail and into a car: push the
// stick where you want to go and it zooms that way. Crash into the other cars (with or without
// someone in them) and the rail: boing, a spin, sparks from the pole. Jump to hop out. Playing
// alone, the buddy hops into a car too and chases yours.

const R = 0.9;
const ACCEL = 9;
const DRAG = 1.8;
const TURN = 3.5;
const BOUNCE = 0.9;
const COLORS = ['#ff4d5e', '#3b82f6', '#22c55e', '#fbbf24'];
/** All cars empty this long (seconds): they drift back to their places. */
const TIDY_AFTER = 30;

type Car = { x: number; z: number; vx: number; vz: number; yaw: number; spin: number; driver: number | null; hx: number; hz: number; spark: number };

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function BumperCars() {
  const [cx, cz] = BUMPER.center;
  const [sx, sz] = BUMPER.size;
  const floor = groundHeight(cx, cz) + 0.12;
  const cars = useRef<Car[]>(
    Array.from({ length: BUMPER.cars }, (_, i) => {
      const hx = cx - sx / 2 + 1.6 + (i * (sx - 3.2)) / (BUMPER.cars - 1);
      const hz = cz - sz / 2 + 1.6;
      return { x: hx, z: hz, vx: 0, vz: 0, yaw: 0, spin: 0, driver: null, hx, hz, spark: 0 };
    })
  );
  debugInfo.bumperCars = cars.current;
  const bodies = useRef<(RapierRigidBody | null)[]>([]);
  const tidy = useRef(0);
  const tmp = useMemo(() => ({ q: new THREE.Quaternion(), v: new THREE.Vector3() }), []);
  useHint([cx, floor + 0.6, cz + sz / 2], 'walk', 4);

  useGameFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    if (dt <= 0) return;
    const list = cars.current;
    const now = gameNow();
    const game = useGame.getState();
    const kidDriving = list.some((c) => c.driver != null && !players.get(c.driver)?.bot);

    // getting in
    list.forEach((c) => {
      if (c.driver != null) return;
      players.forEach((p) => {
        if (c.driver != null || !canBoard(p)) return;
        if (p.bot && (!kidDriving || !buddyMay('join'))) return;
        if (list.some((o) => o.driver === p.slot)) return;
        if (Math.hypot(p.position.x - c.x, p.position.z - c.z) > R + 0.2 || p.position.y > floor + 1.8) return;
        c.driver = p.slot;
        playBoing(p.position, 1.4);
      });
    });

    list.forEach((c, i) => {
      const p = rider(c.driver);
      if (c.driver != null && (!p || (p.bot && !kidDriving))) {
        // gone (or the buddy, once nobody else is driving): out of the car
        p?.hold(null);
        p?.hop(6);
        c.driver = null;
      }
      if (p && c.driver != null) {
        const input = getInput(p.source as SourceId);
        const mag = Math.min(1, Math.hypot(input.x, input.z));
        if (mag > 0.2) {
          const d = wrap(Math.atan2(input.x, input.z) - c.yaw);
          c.yaw += THREE.MathUtils.clamp(d, -TURN * dt, TURN * dt);
          const push = ACCEL * mag * Math.max(0.2, Math.cos(d));
          c.vx += Math.sin(c.yaw) * push * dt;
          c.vz += Math.cos(c.yaw) * push * dt;
        }
        if (input.pressed.jump) {
          // hop out, sideways
          p.hold(null);
          tmp.v.set(c.x + Math.cos(c.yaw) * 1.8, 0, c.z - Math.sin(c.yaw) * 1.8);
          tmp.v.y = floor;
          p.launchTo(tmp.v, floor + 1.5);
          c.driver = null;
        }
      }
      const drag = Math.exp(-(c.driver != null ? DRAG : 2.5) * dt);
      c.vx *= drag;
      c.vz *= drag;
      c.yaw = wrap(c.yaw + c.spin * dt);
      c.spin *= Math.exp(-3 * dt);
      c.x += c.vx * dt;
      c.z += c.vz * dt;
      c.spark -= dt;
      // the rail: bounce off it
      const lx = sx / 2 - R;
      const lz = sz / 2 - R;
      let hitWall = 0;
      if (c.x > cx + lx || c.x < cx - lx) {
        hitWall = Math.abs(c.vx);
        c.x = THREE.MathUtils.clamp(c.x, cx - lx, cx + lx);
        c.vx = -c.vx * BOUNCE;
      }
      if (c.z > cz + lz || c.z < cz - lz) {
        hitWall = Math.max(hitWall, Math.abs(c.vz));
        c.z = THREE.MathUtils.clamp(c.z, cz - lz, cz + lz);
        c.vz = -c.vz * BOUNCE;
      }
      if (hitWall > 1.5) bumped(c, i, hitWall, now);
    });

    // car into car: they bounce apart (the same weight: they swap what they had along the hit)
    for (let i = 0; i < list.length; i += 1)
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        const d = Math.hypot(dx, dz);
        if (d >= 2 * R || d < 1e-4) continue;
        const nx = dx / d;
        const nz = dz / d;
        const overlap = 2 * R - d;
        a.x += (nx * overlap) / 2;
        a.z += (nz * overlap) / 2;
        b.x -= (nx * overlap) / 2;
        b.z -= (nz * overlap) / 2;
        const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (rel >= 0) continue;
        const j2 = (-(1 + BOUNCE) * rel) / 2;
        a.vx += j2 * nx;
        a.vz += j2 * nz;
        b.vx -= j2 * nx;
        b.vz -= j2 * nz;
        a.spin += (random() - 0.5) * j2 * 2.5;
        b.spin += (random() - 0.5) * j2 * 2.5;
        bumped(a, i, -rel, now);
        bumped(b, j, -rel, now);
        if (-rel > 1.5 && (a.driver != null || b.driver != null)) {
          earnSticker('bumper');
          game.addParty(PARTY_POINTS.bonk);
        }
      }

    // everyone not in a car who's standing in the way of a fast one gets bumped
    list.forEach((c) => {
      const speed = Math.hypot(c.vx, c.vz);
      if (speed < 2.5) return;
      players.forEach((p) => {
        if (list.some((o) => o.driver === p.slot) || p.isLaunched()) return;
        if (Math.hypot(p.position.x - c.x, p.position.z - c.z) > R + 0.55 || p.position.y > floor + 1.8) return;
        tmp.v.set(p.position.x - c.x, 0, p.position.z - c.z).normalize();
        p.bump(tmp.v);
      });
    });

    // nobody driving for a while: they tidy themselves back into a row
    tidy.current = list.every((c) => c.driver == null) ? tidy.current + dt : 0;
    if (tidy.current > TIDY_AFTER) {
      list.forEach((c) => {
        const k = 1 - Math.exp(-1.5 * dt);
        c.x += (c.hx - c.x) * k;
        c.z += (c.hz - c.z) * k;
        c.yaw += wrap(0 - c.yaw) * k;
        c.vx = c.vz = c.spin = 0;
      });
    }

    // move the bodies, sit the drivers in their seats
    list.forEach((c, i) => {
      const b = bodies.current[i];
      tmp.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, c.yaw);
      b?.setNextKinematicTranslation({ x: c.x, y: floor, z: c.z });
      b?.setNextKinematicRotation(tmp.q);
      const p = c.driver != null ? players.get(c.driver) : undefined;
      if (p) p.hold(tmp.v.set(c.x - Math.sin(c.yaw) * 0.15, floor + 0.95, c.z - Math.cos(c.yaw) * 0.15), false, c.yaw);
    });
  });

  /** A bump: boing, sparks from the pole, a buzz in the driver's hands. */
  function bumped(c: Car, i: number, strength: number, now: number) {
    if (c.spark > 0) return;
    c.spark = 0.25;
    const y = floor + 2.2;
    playBoing(tmp.v.set(c.x, floor + 0.5, c.z), 0.8 + Math.min(0.6, strength * 0.08));
    if (strength > 3) playSpin(tmp.v);
    emit('star', [c.x, y, c.z], { count: 8 + Math.round(strength * 2), color: ['#ffd23f', '#ffffff', COLORS[i % COLORS.length]], speed: 3 + strength * 0.4, up: 2 });
    const p = c.driver != null ? players.get(c.driver) : undefined;
    if (p) rumble(p.source as SourceId, Math.min(1, 0.3 + strength * 0.1), 0.5, 140);
    void now;
  }

  const rail = lambert('#fbbf24');
  const railH = 0.6;
  const gap = BUMPER.gate;
  const sideLen = (sx - gap) / 2;
  return (
    <>
      {/* the floor, and the rail round it (a gap in the south side to walk in) */}
      <StaticBox position={[cx, floor - 0.06, cz]} size={[sx, 0.12, sz]} color="#475569" />
      <StaticBox position={[cx, floor + railH / 2, cz - sz / 2]} size={[sx, railH, 0.2]} color="#fbbf24" material={rail} />
      <StaticBox position={[cx - sx / 2, floor + railH / 2, cz]} size={[0.2, railH, sz]} color="#fbbf24" material={rail} />
      <StaticBox position={[cx + sx / 2, floor + railH / 2, cz]} size={[0.2, railH, sz]} color="#fbbf24" material={rail} />
      {[-1, 1].map((s) => (
        <StaticBox key={s} position={[cx + s * (gap / 2 + sideLen / 2), floor + railH / 2, cz + sz / 2]} size={[sideLen, railH, 0.2]} color="#fbbf24" material={rail} />
      ))}
      {cars.current.map((c, i) => (
        <RigidBody key={i} ref={(b) => { bodies.current[i] = b; }} type="kinematicPosition" colliders={false} position={[c.x, floor, c.z]}>
          <CylinderCollider args={[0.3, R]} position={[0, 0.35, 0]} />
          <CuboidCollider args={[0.35, 0.25, 0.12]} position={[0, 0.9, -0.55]} />
          <CarModel color={COLORS[i % COLORS.length]} />
        </RigidBody>
      ))}
    </>
  );
}

function CarModel({ color }: { color: string }) {
  return (
    <group>
      <mesh castShadow position={[0, 0.35, 0]} material={lambert(color)}>
        <cylinderGeometry args={[R - 0.1, R - 0.05, 0.45, 20]} />
      </mesh>
      {/* the fat rubber ring all round */}
      <mesh position={[0, 0.25, 0]} rotation={[Math.PI / 2, 0, 0]} material={lambert('#1f2937')}>
        <torusGeometry args={[R - 0.05, 0.14, 8, 28]} />
      </mesh>
      {/* seat back, steering wheel */}
      <mesh castShadow position={[0, 0.85, -0.55]} material={lambert(color)}>
        <boxGeometry args={[0.7, 0.5, 0.24]} />
      </mesh>
      <mesh position={[0, 0.85, 0.45]} rotation={[-0.8, 0, 0]} material={lambert('#1f2937')}>
        <torusGeometry args={[0.18, 0.035, 6, 14]} />
      </mesh>
      {/* the pole with its spark on top */}
      <mesh position={[0, 1.35, -0.62]} material={lambert('#94a3b8')}>
        <cylinderGeometry args={[0.03, 0.03, 1.5, 5]} />
      </mesh>
      <mesh position={[0, 2.12, -0.62]} material={lambert('#ffd23f')}>
        <sphereGeometry args={[0.1, 8, 6]} />
      </mesh>
    </group>
  );
}
