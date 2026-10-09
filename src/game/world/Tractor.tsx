import { CuboidCollider, RigidBody, type RapierCollider, type RapierRigidBody, useRapier } from '@react-three/rapier';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playBonk, playHonk, playPoof, playPutt } from '../audio';
import { gameNow, useGameFrame } from '../clock';
import { emit, poof } from '../fx';
import { getInput, rumble, type SourceId } from '../input';
import { isInFountain, TRACTOR } from '../layout';
import { lambert } from '../materials';
import { canBoard, debugInfo, players, rider, pushNoise, type Surface } from '../runtime';
import { earnSticker } from '../stickers';
import { isInWater, groundHeight } from '../terrain';
import { WORLD_HALF_X, WORLD_HALF_Z } from '../config';
import { useHint } from './common';
import { useSurface } from './surface';

// The farm tractor, with a trailer. Walk up to the seat to drive: push the stick where you want
// to go and the tractor turns and trundles that way (like walking, just bigger). Friends climb
// in the trailer and get bumped along. Jump to hop out. The horn is the noise button.
//
// It's moved by the game (not pushed about by physics): before every step it checks that
// neither it nor the trailer would end up inside something solid (a building, a tree, a
// hedge, the train), and stops instead. Balls, crates and animals in the way get shoved.

const MAX_SPEED = 7;
const ACCEL = 5;
const BRAKE = 9;
const TURN = 1.9;
/** From the tractor's middle back to the hitch, and from the hitch to the trailer's middle. */
const HITCH = 1.7;
const TONGUE = 1.9;
/** The trailer can swing this far out to either side (no jack-knifing into the tractor). */
const MAX_SWING = 1.35;
const BODY = { w: 1.7, l: 3.1, bottom: 0.45, top: 1.4 };
const BED = { w: 1.9, l: 2.8, floor: 0.7, wall: 0.45 };
/** Under the hood and the trailer's floor, solid down to this far off the ground (it's where the wheels are). */
const SKIRT = 0.12;
const SEAT: [number, number, number] = [0, 1.9, -0.55];
/** Left alone away from home this long (seconds), it pops back home. */
const HOME_AFTER = 90;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

type TractorState = {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  tx: number;
  tz: number;
  tyaw: number;
  driver: number | null;
  /** How far it has been driven this time (for the sticker). */
  driven: number;
  idle: number;
  putt: number;
  noise: number;
  /** The trailer's and the tractor's motion this frame, for whoever rides on them. */
  vx: number;
  vz: number;
  spin: number;
  bx: number;
  bz: number;
  bspin: number;
  bumped: Map<number, number>;
};

function makeState(): TractorState {
  const [hx, hz] = TRACTOR.home;
  const yaw = TRACTOR.yaw;
  return {
    x: hx,
    z: hz,
    yaw,
    speed: 0,
    tx: hx - Math.sin(yaw) * (HITCH + TONGUE),
    tz: hz - Math.cos(yaw) * (HITCH + TONGUE),
    tyaw: yaw,
    driver: null,
    driven: 0,
    idle: 0,
    putt: 0,
    noise: 0,
    vx: 0,
    vz: 0,
    spin: 0,
    bx: 0,
    bz: 0,
    bspin: 0,
    bumped: new Map()
  };
}

/** Pitch and roll to sit on the ground: front/back and left/right ground heights. */
function tilt(x: number, z: number, yaw: number, halfL: number, halfW: number, out: THREE.Euler) {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const front = groundHeight(x + fx * halfL, z + fz * halfL);
  const back = groundHeight(x - fx * halfL, z - fz * halfL);
  const left = groundHeight(x + fz * halfW, z - fx * halfW);
  const right = groundHeight(x - fz * halfW, z + fx * halfW);
  out.set(-Math.atan2(front - back, halfL * 2), yaw, Math.atan2(left - right, halfW * 2), 'YXZ');
  return (front + back + left + right) / 4;
}

function Wheel({ position, r, w = 0.3 }: { position: [number, number, number]; r: number; w?: number }) {
  return (
    <group position={position} rotation={[0, 0, Math.PI / 2]}>
      <mesh castShadow material={lambert('#1f2937')}>
        <cylinderGeometry args={[r, r, w, 16]} />
      </mesh>
      <mesh position={[0, 0.001, 0]} material={lambert('#ffd23f')}>
        <cylinderGeometry args={[r * 0.45, r * 0.45, w + 0.02, 10]} />
      </mesh>
    </group>
  );
}

function TractorModel() {
  const red = lambert('#e53935');
  return (
    <group>
      {/* body and bonnet */}
      <mesh castShadow position={[0, 0.95, 0.3]} material={red}>
        <boxGeometry args={[1.2, 0.8, 2.2]} />
      </mesh>
      {/* the seat's floor, and the seat */}
      <mesh castShadow position={[0, 0.9, -0.95]} material={red}>
        <boxGeometry args={[BODY.w, 0.7, 1.1]} />
      </mesh>
      <mesh position={[0, 1.4, -1.2]} material={lambert('#374151')}>
        <boxGeometry args={[0.8, 0.5, 0.15]} />
      </mesh>
      {/* steering wheel */}
      <mesh position={[0, 1.65, -0.15]} rotation={[-0.9, 0, 0]} material={lambert('#1f2937')}>
        <torusGeometry args={[0.22, 0.04, 6, 16]} />
      </mesh>
      {/* chimney and headlights */}
      <mesh castShadow position={[0.35, 1.7, 0.9]} material={lambert('#374151')}>
        <cylinderGeometry args={[0.08, 0.1, 0.8, 8]} />
      </mesh>
      {[-0.4, 0.4].map((x) => (
        <mesh key={x} position={[x, 1.1, 1.41]} material={lambert('#fff3a8')}>
          <sphereGeometry args={[0.12, 8, 6]} />
        </mesh>
      ))}
      <Wheel position={[-0.95, 0.72, -0.85]} r={0.72} w={0.42} />
      <Wheel position={[0.95, 0.72, -0.85]} r={0.72} w={0.42} />
      <Wheel position={[-0.75, 0.42, 1.0]} r={0.42} />
      <Wheel position={[0.75, 0.42, 1.0]} r={0.42} />
    </group>
  );
}

function TrailerModel() {
  const wood = lambert('#d6a064');
  const dark = lambert('#8d5a36');
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, BED.floor - 0.1, 0]} material={wood}>
        <boxGeometry args={[BED.w, 0.2, BED.l]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[(s * BED.w) / 2, BED.floor + BED.wall / 2, 0]} material={dark}>
          <boxGeometry args={[0.1, BED.wall, BED.l]} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={s} castShadow position={[0, BED.floor + BED.wall / 2, (s * BED.l) / 2]} material={dark}>
          <boxGeometry args={[BED.w, BED.wall, 0.1]} />
        </mesh>
      ))}
      {/* the tongue to the hitch */}
      <mesh position={[0, 0.45, BED.l / 2 + 0.25]} material={lambert('#374151')}>
        <boxGeometry args={[0.15, 0.12, 0.6]} />
      </mesh>
      <Wheel position={[-(BED.w / 2 + 0.12), 0.38, 0]} r={0.38} w={0.25} />
      <Wheel position={[BED.w / 2 + 0.12, 0.38, 0]} r={0.38} w={0.25} />
    </group>
  );
}

export function Tractor() {
  const { world, rapier } = useRapier();
  const body = useRef<RapierRigidBody>(null);
  const cart = useRef<RapierRigidBody>(null);
  const bed = useRef<RapierCollider>(null);
  const hood = useRef<RapierCollider>(null);
  const st = useRef<TractorState>(makeState());
  debugInfo.tractor = st.current;
  const tmp = useMemo(
    () => ({ e: new THREE.Euler(), q: new THREE.Quaternion(), v: new THREE.Vector3(), seat: new THREE.Vector3(), side: new THREE.Vector3(), rot: new THREE.Quaternion() }),
    []
  );
  const bodyShape = useMemo(() => new rapier.Cuboid(BODY.w / 2, (BODY.top - BODY.bottom) / 2, BODY.l / 2), [rapier]);
  const bedShape = useMemo(() => new rapier.Cuboid(BED.w / 2, 0.35, BED.l / 2), [rapier]);
  // whoever stands in the trailer (or on the tractor) is carried along, turning with it
  const bedSurface = useMemo<Surface>(
    () => ({
      velocityAt: (p, out) => {
        const s = st.current;
        return out.set(s.vx + s.spin * (p.z - s.tz), 0, s.vz - s.spin * (p.x - s.tx));
      }
    }),
    []
  );
  const hoodSurface = useMemo<Surface>(
    () => ({
      velocityAt: (p, out) => {
        const s = st.current;
        return out.set(s.bx + s.bspin * (p.z - s.z), 0, s.bz - s.bspin * (p.x - s.x));
      }
    }),
    []
  );
  useSurface(bed, bedSurface);
  useSurface(hood, hoodSurface);
  useHint([TRACTOR.home[0], groundHeight(...TRACTOR.home) + 1.5, TRACTOR.home[1]], 'walk', 4);

  /** Would the tractor (or the trailer) at this pose be inside something solid? */
  const blocked = (x: number, z: number, yaw: number, tx: number, tz: number, tyaw: number) => {
    if (Math.abs(x) > WORLD_HALF_X - 2 || Math.abs(z) > WORLD_HALF_Z - 2) return true;
    const fx = x + Math.sin(yaw) * (BODY.l / 2 + 0.2);
    const fz = z + Math.cos(yaw) * (BODY.l / 2 + 0.2);
    if (isInWater(fx, fz) || isInFountain(fx, fz) || isInWater(x, z)) return true;
    const own = [body.current?.handle, cart.current?.handle];
    const solid = (c: import('@dimforge/rapier3d-compat').Collider) => {
      if (c.shape.type === rapier.ShapeType.HeightField) return false;
      const b = c.parent();
      if (b && (own.includes(b.handle) || b.isDynamic())) return false;
      return !(c.shape.type === rapier.ShapeType.Cuboid && (c.shape as import('@dimforge/rapier3d-compat').Cuboid).halfExtents.x > 40); // the safety floor
    };
    let hit = false;
    const check = (cx: number, cz: number, cyaw: number, lift: number, shape: InstanceType<typeof rapier.Cuboid>) => {
      tmp.rot.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, cyaw);
      world.intersectionsWithShape(
        { x: cx, y: groundHeight(cx, cz) + lift, z: cz },
        { x: tmp.rot.x, y: tmp.rot.y, z: tmp.rot.z, w: tmp.rot.w },
        shape,
        (c) => {
          if (!solid(c)) return true;
          hit = true;
          return false;
        },
        rapier.QueryFilterFlags.EXCLUDE_SENSORS | rapier.QueryFilterFlags.EXCLUDE_DYNAMIC
      );
    };
    check(x, z, yaw, (BODY.top + BODY.bottom) / 2, bodyShape);
    if (!hit) check(tx, tz, tyaw, BED.floor + 0.1, bedShape);
    return hit;
  };

  useGameFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const s = st.current;
    if (dt <= 0) return;
    const now = gameNow();

    // who's driving?
    let driver = rider(s.driver);
    if (s.driver != null && !driver) s.driver = null;
    if (s.driver == null) {
      tmp.seat.set(SEAT[0], SEAT[1], SEAT[2]).applyEuler(tmp.e.set(0, s.yaw, 0)).add(tmp.v.set(s.x, groundHeight(s.x, s.z), s.z));
      players.forEach((p) => {
        if (s.driver != null || p.bot || !canBoard(p)) return;
        if (Math.hypot(p.position.x - tmp.seat.x, p.position.z - tmp.seat.z) > 1.5 || p.position.y > tmp.seat.y + 0.8) return;
        s.driver = p.slot;
        s.driven = 0;
        driver = p;
        playHonk(tmp.seat);
        rumble(p.source as SourceId, 0.5, 0.5, 200);
      });
    }

    // the stick: turn towards where it points, and go
    let wantSpeed = 0;
    let turn = 0;
    if (driver) {
      const input = getInput(driver.source as SourceId);
      const mag = Math.min(1, Math.hypot(input.x, input.z));
      if (mag > 0.2) {
        const d = wrap(Math.atan2(input.x, input.z) - s.yaw);
        turn = THREE.MathUtils.clamp(d, -TURN * dt, TURN * dt);
        // facing the wrong way: turn round slowly first
        wantSpeed = MAX_SPEED * mag * (Math.cos(d) > 0.3 ? Math.cos(d) : 0.25);
      }
      if (input.pressed.noise) {
        playHonk(driver.position);
        pushNoise(driver.position, driver.slot);
      }
      if (input.pressed.jump) {
        // hop out, to the left
        const slot = driver.slot;
        driver.hold(null);
        tmp.side.set(Math.cos(s.yaw), 0, -Math.sin(s.yaw)).multiplyScalar(2.3).add(tmp.v.set(s.x, 0, s.z));
        tmp.side.y = groundHeight(tmp.side.x, tmp.side.z);
        driver.launchTo(tmp.side, driver.position.y + 1.2);
        s.driver = null;
        driver = undefined;
        s.bumped.set(slot, now + 1500);
      }
    }
    s.speed += THREE.MathUtils.clamp(wantSpeed - s.speed, -BRAKE * dt, ACCEL * dt);

    // where it would go, and the trailer after it
    const yaw = s.yaw + (s.speed > 0.2 || driver ? turn : 0);
    const x = s.x + Math.sin(yaw) * s.speed * dt;
    const z = s.z + Math.cos(yaw) * s.speed * dt;
    const hx = x - Math.sin(yaw) * HITCH;
    const hz = z - Math.cos(yaw) * HITCH;
    let tyaw = Math.atan2(hx - s.tx, hz - s.tz);
    const swing = wrap(tyaw - yaw);
    if (Math.abs(swing) > MAX_SWING) tyaw = yaw + Math.sign(swing) * MAX_SWING;
    const tx = hx - Math.sin(tyaw) * TONGUE;
    const tz = hz - Math.cos(tyaw) * TONGUE;

    const moving = Math.abs(s.speed) > 0.05 || turn !== 0;
    if (moving && blocked(x, z, yaw, tx, tz, tyaw)) {
      if (s.speed > 2.5) {
        playBonk(tmp.v.set(x, groundHeight(x, z) + 1, z), 0.6);
        emit('star', [x + Math.sin(yaw) * 1.8, groundHeight(x, z) + 1.2, z + Math.cos(yaw) * 1.8], { count: 8, color: ['#ffd23f', '#ffffff'], speed: 3, up: 2 });
        if (driver) rumble(driver.source as SourceId, 0.7, 0.4, 150);
      }
      s.speed = 0;
      s.vx = s.vz = s.spin = s.bx = s.bz = s.bspin = 0;
    } else if (moving) {
      s.vx = (tx - s.tx) / dt;
      s.vz = (tz - s.tz) / dt;
      s.spin = wrap(tyaw - s.tyaw) / dt;
      s.bx = (x - s.x) / dt;
      s.bz = (z - s.z) / dt;
      s.bspin = wrap(yaw - s.yaw) / dt;
      s.driven += Math.hypot(x - s.x, z - s.z);
      s.x = x;
      s.z = z;
      s.yaw = yaw;
      s.tx = tx;
      s.tz = tz;
      s.tyaw = tyaw;
    } else {
      s.vx = s.vz = s.spin = s.bx = s.bz = s.bspin = 0;
    }

    // onto the ground, tilted with it
    const y = tilt(s.x, s.z, s.yaw, BODY.l / 2, BODY.w / 2, tmp.e);
    tmp.q.setFromEuler(tmp.e);
    body.current?.setNextKinematicTranslation({ x: s.x, y, z: s.z });
    body.current?.setNextKinematicRotation(tmp.q);
    const ty = tilt(s.tx, s.tz, s.tyaw, BED.l / 2, BED.w / 2, tmp.e);
    tmp.q.setFromEuler(tmp.e);
    cart.current?.setNextKinematicTranslation({ x: s.tx, y: ty, z: s.tz });
    cart.current?.setNextKinematicRotation(tmp.q);

    if (driver) {
      tmp.seat.set(SEAT[0], SEAT[1], SEAT[2]).applyEuler(tmp.e.set(0, s.yaw, 0)).add(tmp.v.set(s.x, y, s.z));
      driver.hold(tmp.seat, false, s.yaw);
      s.idle = 0;
      if (s.driven > 12) earnSticker('tractor');
      // someone else in the trailer while it's going: a friend sticker
      if (s.speed > 2) {
        players.forEach((p) => {
          if (p.slot === driver!.slot) return;
          const lx = p.position.x - s.tx;
          const lz = p.position.z - s.tz;
          const along = lx * Math.sin(s.tyaw) + lz * Math.cos(s.tyaw);
          const across = lx * Math.cos(s.tyaw) - lz * Math.sin(s.tyaw);
          if (Math.abs(along) < BED.l / 2 && Math.abs(across) < BED.w / 2 && p.position.y > ty + BED.floor) earnSticker('trailer');
        });
      }
    } else {
      s.idle += dt;
      if (s.idle > HOME_AFTER && Math.hypot(s.x - TRACTOR.home[0], s.z - TRACTOR.home[1]) > 3) {
        const home = makeState();
        poof([s.x, y + 1, s.z], '#ffffff', 20);
        Object.assign(s, { ...home, bumped: s.bumped });
        playPoof([s.x, y, s.z]);
      }
    }

    // engine: putt-putt and a puff from the chimney, faster the faster it goes
    if (driver || s.speed > 0.1) {
      s.putt -= dt * (2 + s.speed * 1.2);
      if (s.putt <= 0) {
        s.putt = 1;
        tmp.v.set(0.35, 2.15, 0.9).applyEuler(tmp.e.set(0, s.yaw, 0)).add(tmp.side.set(s.x, y, s.z));
        emit('puff', [tmp.v.x, tmp.v.y, tmp.v.z], { count: 1, color: ['#9ca3af', '#d1d5db'], size: 0.3, speed: 0.5, up: 1.5, life: 1 });
        playPutt(tmp.v);
      }
      // a noisy thing: the cats keep out of its way
      s.noise -= dt;
      if (s.noise <= 0 && driver) {
        s.noise = 1.5;
        pushNoise(driver.position, driver.slot);
      }
    }

    // anyone in front of a moving tractor gets bumped out of the way (boing!)
    if (s.speed > 2.5) {
      const fx = s.x + Math.sin(s.yaw) * (BODY.l / 2 + 0.5);
      const fz = s.z + Math.cos(s.yaw) * (BODY.l / 2 + 0.5);
      players.forEach((p) => {
        if (p.slot === s.driver || (s.bumped.get(p.slot) ?? 0) > now || p.isLaunched()) return;
        if (Math.hypot(p.position.x - fx, p.position.z - fz) > 1.3 || Math.abs(p.position.y - y - 0.5) > 1.5) return;
        s.bumped.set(p.slot, now + 1000);
        tmp.side.set(p.position.x - s.x, 0, p.position.z - s.z).normalize();
        p.bump(tmp.side);
      });
    }
  });

  const s0 = st.current;
  return (
    <>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[s0.x, groundHeight(s0.x, s0.z), s0.z]} rotation={[0, s0.yaw, 0]}>
        <CuboidCollider ref={hood} args={[BODY.w / 2 - 0.25, (BODY.top - BODY.bottom) / 2, BODY.l / 2]} position={[0, (BODY.top + BODY.bottom) / 2, 0]} />
        {/* down to the wheels' feet: a chicken that runs at it can't wedge itself in under the hood */}
        <CuboidCollider args={[BODY.w / 2 - 0.25, (BODY.bottom - SKIRT) / 2, BODY.l / 2 - 0.1]} position={[0, (BODY.bottom + SKIRT) / 2, 0]} />
        <TractorModel />
      </RigidBody>
      <RigidBody ref={cart} type="kinematicPosition" colliders={false} position={[s0.tx, groundHeight(s0.tx, s0.tz), s0.tz]} rotation={[0, s0.tyaw, 0]}>
        <CuboidCollider ref={bed} args={[BED.w / 2, 0.1, BED.l / 2]} position={[0, BED.floor - 0.1, 0]} />
        <CuboidCollider args={[BED.w / 2 - 0.1, (BED.floor - 0.2 - SKIRT) / 2, BED.l / 2 - 0.1]} position={[0, (BED.floor - 0.2 + SKIRT) / 2, 0]} />
        {[-1, 1].map((sd) => (
          <CuboidCollider key={`s${sd}`} args={[0.05, BED.wall / 2, BED.l / 2]} position={[(sd * BED.w) / 2, BED.floor + BED.wall / 2, 0]} />
        ))}
        {[-1, 1].map((sd) => (
          <CuboidCollider key={`e${sd}`} args={[BED.w / 2, BED.wall / 2, 0.05]} position={[0, BED.floor + BED.wall / 2, (sd * BED.l) / 2]} />
        ))}
        <TrailerModel />
      </RigidBody>
    </>
  );
}
