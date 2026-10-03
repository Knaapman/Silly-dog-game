import { CuboidCollider, CylinderCollider, RigidBody, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playBell, playBoing, playBonk } from '../audio';
import { PARTY_POINTS } from '../config';
import { burstConfetti, emit } from '../fx';
import { BUNTING_POLES, CAROUSEL, FERRIS, HIGH_STRIKER, STALLS, type Vec3 } from '../layout';
import { lambert, stripeTexture } from '../materials';
import { canBoard, debugInfo, players, registerStatic, shakeCamera, type Surface } from '../runtime';
import { useGame } from '../store';
import { Ramp, StaticBox, useHint } from './common';
import { useSurface } from './surface';
import { gameClock, gameNow, useGameFrame } from '../clock';
import { ballistic } from '../player/physics';
import { earnSticker } from '../stickers';

// ---------------------------------------------------------------------------
// Ferris wheel: 8 gondolas you can jump into. The one at the top passes a golden star.

const GONDOLA_COLORS = ['#ff4d5e', '#ffd23f', '#3b82f6', '#22c55e', '#a855f7', '#ff8fd8', '#ff9f1c', '#14b8a6'];
const HANG = 1.6;
/** Standing at the front of the boarding deck, this close to the middle, a gondola at the bottom takes you in. */
const BOARD_FROM = { halfWidth: 1.4, near: 1.3, far: 2.8 };
/** How near the bottom a gondola has to be when you land in it (m along, from straight under the hub). */
const BOARD_WINDOW = 0.6;
/** No hopping straight back in after getting out of a gondola (ms). */
const BOARD_AGAIN = 3000;

/** Who is in a gondola now, and where to stand to be taken in (the buddy uses both). */
export const ferris = { hops: 0, riding: [] as number[], boardAt: [FERRIS.center[0], FERRIS.center[2] + 2] as [number, number] };

function Gondola({ index, angle }: { index: number; angle: { current: number } }) {
  const body = useRef<RapierRigidBody>(null);
  const floor = useRef<RapierCollider>(null);
  const [cx, cy, cz] = FERRIS.center;
  const phase = (index / FERRIS.gondolas) * Math.PI * 2;
  const surface = useMemo<Surface>(
    () => ({
      velocityAt: (_p, out) => {
        const a = angle.current + phase;
        const v = FERRIS.speed * FERRIS.radius;
        return out.set(-Math.sin(a) * v, Math.cos(a) * v, 0);
      }
    }),
    [angle, phase]
  );
  useSurface(floor, surface);
  const start = useMemo<Vec3>(() => [cx + Math.cos(phase) * FERRIS.radius, cy + Math.sin(phase) * FERRIS.radius - HANG, cz], [cx, cy, cz, phase]);
  const next = useMemo(() => new THREE.Vector3(), []);

  useGameFrame(() => {
    const rb = body.current;
    if (!rb) return;
    const a = angle.current + phase;
    next.set(cx + Math.cos(a) * FERRIS.radius, cy + Math.sin(a) * FERRIS.radius - HANG, cz);
    rb.setNextKinematicTranslation(next);
  });

  const color = GONDOLA_COLORS[index % GONDOLA_COLORS.length];
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={start}>
      <CuboidCollider ref={floor} args={[1.1, 0.1, 0.85]} />
      <CuboidCollider args={[1.1, 0.3, 0.06]} position={[0, 0.4, 0.85]} />
      <CuboidCollider args={[1.1, 0.3, 0.06]} position={[0, 0.4, -0.85]} />
      <CuboidCollider args={[0.06, 0.3, 0.85]} position={[1.1, 0.4, 0]} />
      <CuboidCollider args={[0.06, 0.3, 0.85]} position={[-1.1, 0.4, 0]} />
      <mesh castShadow receiveShadow material={lambert(color)}>
        <boxGeometry args={[2.2, 0.2, 1.7]} />
      </mesh>
      {[0.85, -0.85].map((z) => (
        <mesh key={z} castShadow position={[0, 0.4, z]} material={lambert(color)}>
          <boxGeometry args={[2.2, 0.6, 0.12]} />
        </mesh>
      ))}
      {[1.1, -1.1].map((x) => (
        <mesh key={x} castShadow position={[x, 0.4, 0]} material={lambert('#ffffff')}>
          <boxGeometry args={[0.12, 0.6, 1.7]} />
        </mesh>
      ))}
      {[1, -1].map((s) => (
        <mesh key={s} position={[s * 0.9, HANG / 2 + 0.3, 0]} rotation={[0, 0, s * 0.45]} material={lambert('#90a4ae')}>
          <cylinderGeometry args={[0.05, 0.05, HANG + 0.5, 6]} />
        </mesh>
      ))}
    </RigidBody>
  );
}

function FerrisWheel() {
  const [cx, cy, cz] = FERRIS.center;
  const R = FERRIS.radius;
  const angle = useRef(0);
  const wheel = useRef<THREE.Group>(null);
  const lights = useRef<THREE.InstancedMesh>(null);
  const LIGHTS = 32;
  const hopped = useRef(new Map<number, number>());
  const tmp = useMemo(() => ({ to: new THREE.Vector3(), v: new THREE.Vector3() }), []);
  debugInfo.ferris = ferris;
  // on the boarding deck (not shown to anyone already in a gondola, down at the bottom)
  useHint([cx, 1.2, cz + 2.4], 'walk', 3, (p) => p.position.z > cz + 1.2);

  /** Where gondola `i` is (its floor) `ahead` seconds from now. */
  const gondolaAt = (i: number, ahead: number, out: THREE.Vector3) => {
    const a = angle.current + FERRIS.speed * ahead + (i / FERRIS.gondolas) * Math.PI * 2;
    return out.set(cx + Math.cos(a) * R, cy + Math.sin(a) * R - HANG + 0.1, cz);
  };

  useLayoutEffect(() => {
    const m = lights.current;
    if (!m) return;
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    for (let side = 0; side < 2; side += 1) {
      for (let i = 0; i < LIGHTS; i += 1) {
        const a = (i / LIGHTS) * Math.PI * 2;
        d.position.set(Math.cos(a) * R, Math.sin(a) * R, side ? 1.35 : -1.35);
        d.updateMatrix();
        m.setMatrixAt(side * LIGHTS + i, d.matrix);
        m.setColorAt(side * LIGHTS + i, c.set(GONDOLA_COLORS[i % GONDOLA_COLORS.length]));
      }
    }
    m.instanceMatrix.needsUpdate = true;
  }, [R]);

  useGameFrame((_, delta) => {
    angle.current += Math.min(delta, 0.05) * FERRIS.speed;
    debugInfo.ferrisAngle = angle.current;
    // walk to the front of the deck: when a gondola comes down to the bottom, a little hop takes
    // you in (a jump from the deck would fly right over it)
    const now = gameNow();
    ferris.riding.length = 0;
    players.forEach((p) => {
      const { x, y, z } = p.position;
      // in a gondola (round the wheel where the gondolas are, off the ground): not hopped back in
      // straight after getting out
      const round = Math.abs(Math.hypot(x - cx, y - (cy - HANG + 0.6)) - R) < 1.2;
      if (round && Math.abs(z - cz) < 0.9 && y > 0.8 && !p.isLaunched()) {
        ferris.riding.push(p.slot);
        hopped.current.set(p.slot, now);
      }
    });
    const kidRiding = ferris.riding.some((slot) => !players.get(slot)?.bot);
    players.forEach((p) => {
      if (!canBoard(p) || now - (hopped.current.get(p.slot) ?? -1e9) < BOARD_AGAIN) return;
      // (the buddy goes up after a child, never on its own)
      if (p.bot && !kidRiding) return;
      const { x, y, z } = p.position;
      if (Math.abs(x - cx) > BOARD_FROM.halfWidth || z < cz + BOARD_FROM.near || z > cz + BOARD_FROM.far || y < 0.9 || y > 1.8) return;
      for (let i = 0; i < FERRIS.gondolas; i += 1) {
        // where it will be when we land in it (the hop's length depends on where that is: twice round)
        let t = 0.6;
        for (let k = 0; k < 2; k += 1) t = ballistic(p.position, gondolaAt(i, t, tmp.to), tmp.to.y + 1.4, tmp.v);
        if (Math.abs(tmp.to.x - cx) > BOARD_WINDOW || tmp.to.y > cy - R) continue;
        hopped.current.set(p.slot, now);
        ferris.hops += 1;
        p.launchTo(tmp.to.clone(), tmp.to.y + 1.4);
        playBoing(p.position, 1.2);
        break;
      }
    });
    if (wheel.current) wheel.current.rotation.z = angle.current;
    const m = lights.current;
    if (m && m.instanceColor) {
      const c = new THREE.Color();
      const t = gameClock.time;
      for (let i = 0; i < LIGHTS * 2; i += 1) {
        const on = Math.sin(t * 4 + i * 0.7) > 0;
        c.set(GONDOLA_COLORS[(i + Math.floor(t * 2)) % GONDOLA_COLORS.length]).multiplyScalar(on ? 1 : 0.45);
        m.setColorAt(i, c);
      }
      m.instanceColor.needsUpdate = true;
    }
  });

  const legs: { from: Vec3; to: Vec3 }[] = [];
  [-1.9, 1.9].forEach((z) => {
    legs.push({ from: [cx - 6, 0, cz + z], to: [cx, cy, cz + z] });
    legs.push({ from: [cx + 6, 0, cz + z], to: [cx, cy, cz + z] });
  });

  return (
    <group>
      {/* A-frame legs (solid) */}
      {legs.map((leg, i) => {
        const a = new THREE.Vector3(...leg.from);
        const b = new THREE.Vector3(...leg.to);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const len = a.distanceTo(b);
        const tilt = Math.atan2(b.x - a.x, b.y - a.y);
        return (
          <RigidBody key={i} type="fixed" colliders={false} position={mid} rotation={[0, 0, -tilt]}>
            <CylinderCollider args={[len / 2, 0.3]} />
            <mesh castShadow material={lambert('#eceff1')}>
              <cylinderGeometry args={[0.25, 0.35, len, 10]} />
            </mesh>
          </RigidBody>
        );
      })}
      <mesh position={[cx, cy, cz]} rotation={[Math.PI / 2, 0, 0]} material={lambert('#90a4ae')}>
        <cylinderGeometry args={[0.45, 0.45, 4.2, 14]} />
      </mesh>
      <group ref={wheel} position={[cx, cy, cz]}>
        {[-1.35, 1.35].map((z) => (
          <group key={z} position={[0, 0, z]}>
            <mesh castShadow material={lambert('#ff4d5e')}>
              <torusGeometry args={[R, 0.18, 8, 64]} />
            </mesh>
            <mesh material={lambert('#ffffff')}>
              <torusGeometry args={[R * 0.55, 0.1, 6, 48]} />
            </mesh>
            {Array.from({ length: FERRIS.gondolas }, (_, i) => (
              <mesh key={i} rotation={[0, 0, (i / FERRIS.gondolas) * Math.PI * 2]} position={[0, 0, 0]} material={lambert('#ffffff')}>
                <boxGeometry args={[R * 2, 0.12, 0.12]} />
              </mesh>
            ))}
          </group>
        ))}
        <mesh material={lambert('#ffd23f')} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.1, 1.1, 3, 20]} />
        </mesh>
        <instancedMesh ref={lights} args={[undefined, undefined, LIGHTS * 2]}>
          <sphereGeometry args={[0.18, 8, 6]} />
          <meshBasicMaterial />
        </instancedMesh>
      </group>
      {Array.from({ length: FERRIS.gondolas }, (_, i) => (
        <Gondola key={i} index={i} angle={angle} />
      ))}
      {/* boarding deck: walk up to the front, and a little hop takes you into the gondola at the bottom */}
      <StaticBox position={[cx, 0.3, cz + 3]} size={[6, 0.6, 3]} color="#8d6e63" />
      <Ramp from={[cx, 0, cz + 7.5]} to={[cx, 0.6, cz + 4.5]} width={3} color="#a1887f" />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Carousel: step on and go round and round.

function Horse({ angle, color, index }: { angle: number; color: string; index: number }) {
  const g = useRef<THREE.Group>(null);
  useGameFrame(() => {
    if (g.current) g.current.position.y = 1.2 + Math.sin(gameClock.time * 2.5 + index * 1.3) * 0.35;
  });
  const r = CAROUSEL.radius - 1.3;
  return (
    <group position={[Math.cos(angle) * r, 0, Math.sin(angle) * r]} rotation={[0, -angle, 0]}>
      <mesh position={[0, 1.6, 0]} material={lambert('#ffd23f')}>
        <cylinderGeometry args={[0.05, 0.05, 3.2, 6]} />
      </mesh>
      <group ref={g}>
        <mesh castShadow material={lambert(color)} scale={[0.5, 0.5, 1]}>
          <capsuleGeometry args={[0.35, 0.5, 4, 10]} />
        </mesh>
        <mesh castShadow position={[0, 0.45, 0.45]} rotation={[0.6, 0, 0]} material={lambert(color)}>
          <boxGeometry args={[0.25, 0.6, 0.25]} />
        </mesh>
        <mesh castShadow position={[0, 0.72, 0.62]} material={lambert(color)}>
          <boxGeometry args={[0.28, 0.28, 0.45]} />
        </mesh>
        <mesh position={[0, 0.75, 0.35]} material={lambert('#ff4d5e')}>
          <boxGeometry args={[0.08, 0.35, 0.3]} />
        </mesh>
        {[[-0.12, 0.3], [0.12, 0.3], [-0.12, -0.3], [0.12, -0.3]].map(([x, z], i) => (
          <mesh key={i} position={[x, -0.4, z]} material={lambert(color)}>
            <cylinderGeometry args={[0.06, 0.05, 0.6, 6]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Carousel() {
  const [cx, cz] = CAROUSEL.center;
  const body = useRef<RapierRigidBody>(null);
  const deck = useRef<RapierCollider>(null);
  const angle = useRef(0);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const surface = useMemo<Surface>(
    () => ({
      velocityAt: (p, out) => out.set(CAROUSEL.speed * (p.z - cz), 0, -CAROUSEL.speed * (p.x - cx))
    }),
    [cx, cz]
  );
  useSurface(deck, surface);
  const deckMat = useMemo(
    () => new THREE.MeshLambertMaterial({ map: stripeTexture('carousel', ['#ff8fb5', '#fff3c4', '#8fd3ff', '#fff3c4', '#b9f0a8', '#fff3c4']) }),
    []
  );
  useHint([cx, 0.5, cz + CAROUSEL.radius], 'walk', 4);

  useGameFrame((_, delta) => {
    angle.current += Math.min(delta, 0.05) * CAROUSEL.speed;
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, angle.current);
    body.current?.setNextKinematicRotation(q);
  });

  return (
    <group>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[cx, 0, cz]}>
        <CylinderCollider ref={deck} args={[0.12, CAROUSEL.radius]} position={[0, 0.12, 0]} />
        <CylinderCollider args={[1.6, 0.6]} position={[0, 1.6, 0]} />
        <mesh receiveShadow castShadow position={[0, 0.12, 0]} material={deckMat}>
          <cylinderGeometry args={[CAROUSEL.radius, CAROUSEL.radius + 0.1, 0.24, 36]} />
        </mesh>
        <mesh castShadow position={[0, 1.6, 0]} material={lambert('#ffd23f')}>
          <cylinderGeometry args={[0.6, 0.6, 3.2, 16]} />
        </mesh>
        <mesh castShadow position={[0, 3.6, 0]} material={lambert('#ff4d5e')}>
          <coneGeometry args={[1.8, 1.1, 16]} />
        </mesh>
        <mesh position={[0, 4.3, 0]} material={lambert('#ffd23f')}>
          <sphereGeometry args={[0.25, 10, 8]} />
        </mesh>
        {Array.from({ length: 6 }, (_, i) => (
          <Horse key={i} index={i} angle={(i / 6) * Math.PI * 2} color={['#ffffff', '#ffb8d9', '#bde0ff', '#fff3a8', '#c8f7c5', '#e9d5ff'][i]} />
        ))}
      </RigidBody>
    </group>
  );
}

// ---------------------------------------------------------------------------
// High striker: headbutt the pad and the puck always rings the bell.

function HighStriker() {
  const [x, , z] = HIGH_STRIKER.position;
  const h = HIGH_STRIKER.height;
  const puck = useRef<THREE.Mesh>(null);
  const bell = useRef<THREE.Group>(null);
  const anim = useRef({ t: -1, cooldown: 0 });
  useHint([x, 0.6, z + 1], 'bonk', 4);

  useEffect(
    () =>
      registerStatic({
        id: 9100,
        position: new THREE.Vector3(x, 0.4, z + 0.6),
        radius: 1.1,
        onBonk: () => {
          if (anim.current.t >= 0) return;
          anim.current.t = 0;
          playBonk([x, 0.5, z], 0.7);
        }
      }),
    [x, z]
  );

  useGameFrame((_, delta) => {
    const a = anim.current;
    let y = 0.5;
    if (a.t >= 0) {
      a.t += delta;
      if (a.t < 0.45) y = 0.5 + (h - 1) * (1 - Math.pow(1 - a.t / 0.45, 3));
      else if (a.t < 0.5) {
        y = h - 0.5;
        if (a.cooldown === 0) {
          a.cooldown = 1;
          playBell([x, h, z]);
          burstConfetti([x, h + 0.5, z], 60, 7);
          emit('star', [x, h, z], { count: 16, color: ['#ffd23f', '#ffffff'], speed: 6, up: 4 });
          shakeCamera(0.2);
          useGame.getState().addParty(PARTY_POINTS.goal * 0.5);
          earnSticker('bell');
        }
      } else if (a.t < 1.6) y = h - 0.5 - (h - 1) * ((a.t - 0.5) / 1.1);
      else {
        a.t = -1;
        a.cooldown = 0;
      }
    }
    if (puck.current) puck.current.position.y = y;
    if (bell.current) bell.current.rotation.z = a.t > 0.45 && a.t < 1.5 ? Math.sin(a.t * 40) * 0.3 * (1.5 - a.t) : 0;
  });

  const bands = ['#22c55e', '#84cc16', '#ffd23f', '#ff9f1c', '#ff4d5e', '#a855f7'];
  return (
    <group position={[x, 0, z]}>
      <StaticBox position={[0, 0.15, 0.6]} size={[1.6, 0.3, 1.6]} color="#ff4d5e" />
      <mesh position={[0, 0.31, 0.6]} rotation={[-Math.PI / 2, 0, 0]} material={lambert('#ffffff')}>
        <ringGeometry args={[0.35, 0.55, 24]} />
      </mesh>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[0.3, h / 2, 0.2]} position={[0, h / 2, -0.4]} />
      </RigidBody>
      {bands.map((c, i) => (
        <mesh key={i} castShadow position={[0, (h / bands.length) * (i + 0.5), -0.4]} material={lambert(c)}>
          <boxGeometry args={[0.6, h / bands.length, 0.35]} />
        </mesh>
      ))}
      <mesh ref={puck} position={[0, 0.5, -0.15]} material={lambert('#ffffff')}>
        <boxGeometry args={[0.5, 0.25, 0.2]} />
      </mesh>
      <group ref={bell} position={[0, h + 0.3, -0.4]}>
        <mesh castShadow position={[0, -0.2, 0]} material={lambert('#ffd23f')}>
          <cylinderGeometry args={[0.2, 0.55, 0.6, 16, 1, true]} />
        </mesh>
        <mesh position={[0, 0.15, 0]} material={lambert('#ffd23f')}>
          <sphereGeometry args={[0.22, 12, 8]} />
        </mesh>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Decorations: bunting and stalls


function Bunting() {
  const flags = useRef<THREE.InstancedMesh>(null);
  const items = useMemo(() => {
    const out: { p: THREE.Vector3; yaw: number; color: string }[] = [];
    for (let i = 0; i < BUNTING_POLES.length - 1; i += 1) {
      const [ax, az] = BUNTING_POLES[i];
      const [bx, bz] = BUNTING_POLES[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.floor(len / 0.9);
      for (let k = 1; k < n; k += 1) {
        const t = k / n;
        const sag = Math.sin(t * Math.PI) * 1.2;
        out.push({
          p: new THREE.Vector3(ax + (bx - ax) * t, 4.2 - sag, az + (bz - az) * t),
          yaw: Math.atan2(bx - ax, bz - az) + Math.PI / 2,
          color: GONDOLA_COLORS[(i * 7 + k) % GONDOLA_COLORS.length]
        });
      }
    }
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = flags.current;
    if (!m) return;
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    items.forEach((f, i) => {
      d.position.copy(f.p);
      d.rotation.set(0, f.yaw, Math.PI);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      m.setColorAt(i, c.set(f.color));
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  const flagGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.3, 0, 0, 0.3, 0, 0, 0, 0.55, 0], 3));
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <group>
      {BUNTING_POLES.map(([x, z], i) => (
        <mesh key={i} castShadow position={[x, 2.2, z]} material={lambert('#ffffff')}>
          <cylinderGeometry args={[0.08, 0.1, 4.4, 8]} />
        </mesh>
      ))}
      <instancedMesh ref={flags} args={[flagGeo, undefined, items.length]}>
        <meshBasicMaterial side={THREE.DoubleSide} />
      </instancedMesh>
    </group>
  );
}

function Stall({ position, colors }: { position: Vec3; colors: string[] }) {
  const awning = useMemo(() => new THREE.MeshLambertMaterial({ map: stripeTexture(`awning-${colors.join()}`, colors) }), [colors]);
  return (
    <group position={position}>
      <StaticBox position={[0, 0.6, 0]} size={[2.4, 1.2, 1.4]} color={colors[0]} />
      {[[-1.1, -0.6], [1.1, -0.6]].map(([x, z], i) => (
        <mesh key={i} castShadow position={[x, 1.9, z]} material={lambert('#ffffff')}>
          <cylinderGeometry args={[0.06, 0.06, 1.4, 6]} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 2.7, 0.1]} rotation={[0.35, 0, 0]} material={awning}>
        <boxGeometry args={[2.8, 0.1, 1.8]} />
      </mesh>
      <mesh position={[0, 1.35, 0.1]} material={lambert('#fff3c4')}>
        <sphereGeometry args={[0.35, 10, 8]} />
      </mesh>
    </group>
  );
}

export function Carnival() {
  return (
    <group>
      <FerrisWheel />
      <Carousel />
      <HighStriker />
      <Bunting />
      {STALLS.map((s, i) => (
        <Stall key={i} position={s.position} colors={s.colors} />
      ))}
    </group>
  );
}
