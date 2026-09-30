import { CuboidCollider, CylinderCollider, RigidBody, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playBell, playCollect, playWhoosh } from '../audio';
import { gameClock, gameNow, useGameFrame } from '../clock';
import { PARTY_POINTS } from '../config';
import { burstConfetti, emit, ring } from '../fx';
import { distXZ, SKY_COURSE, SKY_FLAGS, type Vec2 } from '../layout';
import { lambert, stripeTexture } from '../materials';
import { players, shakeCamera, type Surface } from '../runtime';
import { flagAt, useSkyCourse } from '../skycourse';
import { earnSticker } from '../stickers';
import { useGame } from '../store';
import { groundHeight } from '../terrain';
import { StaticBox, StaticCylinder, useHint } from './common';
import { useSurface } from './surface';

// The sky course (see SKY_COURSE in layout.ts): stumps, a platform, a spinning disc, a platform,
// one that slides to and fro, a bouncy cloud up to a cloud, wobbly planks on balloons, and the top
// cloud with a bell. Four flags on the way: the pad at the start takes you back up to the highest
// one anyone has reached, so a fall only costs one bit. Falling is soft: it's grass underneath.

const C = SKY_COURSE;
const RAINBOW = ['#ff4d5e', '#ff9f1c', '#ffd23f', '#22c55e', '#3b82f6', '#a855f7'];

function Stump({ at, top }: { at: Vec2; top: number }) {
  const bottom = groundHeight(at[0], at[1]) - 0.3;
  const h = top - bottom;
  const r = C.stumpRadius;
  return (
    <>
      <StaticCylinder position={[at[0], bottom + h / 2, at[1]]} radius={r} radiusTop={r * 0.96} height={h} color="#8d5a36" segments={14} />
      <mesh position={[at[0], top + 0.006, at[1]]} rotation={[-Math.PI / 2, 0, 0]} material={lambert('#e8c08a')}>
        <circleGeometry args={[r * 0.92, 20]} />
      </mesh>
      <mesh position={[at[0], top + 0.01, at[1]]} rotation={[-Math.PI / 2, 0, 0]} material={lambert('#c9955a')}>
        <ringGeometry args={[r * 0.4, r * 0.48, 20]} />
      </mesh>
    </>
  );
}

/** A wooden platform on four posts. */
function Platform({ at, top, size }: { at: Vec2; top: number; size: Vec2 }) {
  const posts = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => [at[0] + sx * (size[0] / 2 - 0.3), at[1] + sz * (size[1] / 2 - 0.3)] as Vec2));
  return (
    <>
      <StaticBox position={[at[0], top - 0.2, at[1]]} size={[size[0], 0.4, size[1]]} color="#d6a064" />
      {posts.map(([px, pz]) => {
        const g = groundHeight(px, pz) - 0.2;
        const h = top - 0.4 - g;
        return <StaticCylinder key={`${px},${pz}`} position={[px, g + h / 2, pz]} radius={0.17} height={h} color="#8d5a36" segments={8} />;
      })}
    </>
  );
}

/** Puffy white (or pink) blobs round a flat top, so a flat collider looks like a cloud. */
function Puffs({ size, color = '#ffffff' }: { size: Vec2; color?: string }) {
  const puffs = useMemo(() => {
    const out: { p: [number, number, number]; r: number }[] = [];
    const [sx, sz] = size;
    const n = Math.max(4, Math.round((sx + sz) * 1.2));
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      out.push({ p: [Math.cos(a) * sx * 0.48, -0.35 - (i % 2) * 0.1, Math.sin(a) * sz * 0.48], r: 0.55 + (i % 3) * 0.12 });
    }
    out.push({ p: [0, -0.6, 0], r: Math.min(sx, sz) * 0.45 });
    return out;
  }, [size]);
  return (
    <>
      {puffs.map((b, i) => (
        <mesh key={i} position={b.p} scale={[1, 0.7, 1]} material={lambert(color)} castShadow>
          <sphereGeometry args={[b.r, 10, 8]} />
        </mesh>
      ))}
    </>
  );
}

/** A cloud you can stand on (flat on top). */
function Cloud({ at, top, size }: { at: Vec2; top: number; size: Vec2 }) {
  return (
    <group>
      <StaticBox position={[at[0], top - 0.25, at[1]]} size={[size[0], 0.5, size[1]]} color="#ffffff" />
      <group position={[at[0], top, at[1]]}>
        <Puffs size={size} />
      </group>
    </group>
  );
}

/** A disc that turns slowly on a pole: it carries you round; jump off at the right moment. */
function Disc() {
  const { at, top, radius, speed } = C.disc;
  const [cx, cz] = at;
  const body = useRef<RapierRigidBody>(null);
  const deck = useRef<RapierCollider>(null);
  const angle = useRef(0);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const surface = useMemo<Surface>(() => ({ velocityAt: (p, out) => out.set(speed * (p.z - cz), 0, -speed * (p.x - cx)) }), [cx, cz, speed]);
  useSurface(deck, surface);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ map: stripeTexture('skydisc', RAINBOW) }), []);
  useGameFrame((_, delta) => {
    angle.current += Math.min(delta, 0.05) * speed;
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, angle.current);
    body.current?.setNextKinematicRotation(q);
  });
  const g = groundHeight(cx, cz) - 0.2;
  const poleH = top - 0.4 - g;
  return (
    <>
      <StaticCylinder position={[cx, g + poleH / 2, cz]} radius={0.3} height={poleH} color="#94a3b8" segments={10} />
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[cx, top - 0.2, cz]}>
        <CylinderCollider ref={deck} args={[0.2, radius]} />
        <mesh castShadow receiveShadow material={mat}>
          <cylinderGeometry args={[radius, radius, 0.4, 32]} />
        </mesh>
        <mesh position={[0, 0.21, 0]} rotation={[-Math.PI / 2, 0, 0]} material={lambert('#ffffff')}>
          <circleGeometry args={[0.35, 16]} />
        </mesh>
      </RigidBody>
    </>
  );
}

/** A platform that slides to and fro between the second flag and the bouncy cloud. */
function Slider() {
  const { z, from, to, top, size, period } = C.slider;
  const mid = (from + to) / 2;
  const amp = (to - from) / 2;
  const w = (Math.PI * 2) / period;
  // starts at the near end (by the second flag), so it's there to step onto
  const xAt = (t: number) => mid - amp * Math.cos(w * t);
  const body = useRef<RapierRigidBody>(null);
  const deck = useRef<RapierCollider>(null);
  const next = useMemo(() => new THREE.Vector3(), []);
  const surface = useMemo<Surface>(() => ({ velocityAt: (_p, out) => out.set(amp * w * Math.sin(w * gameClock.time), 0, 0) }), [amp, w]);
  useSurface(deck, surface);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ map: stripeTexture('skyslider', ['#ffd23f', '#ffffff', '#ffd23f', '#ffffff']) }), []);
  useGameFrame(() => {
    next.set(xAt(gameClock.time), top - 0.2, z);
    body.current?.setNextKinematicTranslation(next);
  });
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[xAt(0), top - 0.2, z]}>
      <CuboidCollider ref={deck} args={[size / 2, 0.2, size / 2]} />
      <mesh castShadow receiveShadow material={mat}>
        <boxGeometry args={[size, 0.4, size]} />
      </mesh>
      {/* little propellers keep it up */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (size / 2 - 0.2), -0.35, 0]}>
          <mesh material={lambert('#64748b')}>
            <cylinderGeometry args={[0.08, 0.08, 0.3, 6]} />
          </mesh>
        </group>
      ))}
    </RigidBody>
  );
}

/** The bouncy cloud: step on and it throws you high, up to the next cloud. */
function Bouncer() {
  const { at, top, radius, bounce } = C.bouncer;
  const col = useRef<RapierCollider>(null);
  const puff = useRef<THREE.Group>(null);
  const lastBounce = useRef(-1e9);
  const surface = useMemo<Surface>(() => ({ bounce, onBounce: () => (lastBounce.current = gameNow()) }), [bounce]);
  useSurface(col, surface);
  useGameFrame(() => {
    if (!puff.current) return;
    const since = (gameNow() - lastBounce.current) / 1000;
    const dip = since < 0.6 ? Math.sin(since * 22) * Math.exp(-since * 6) * 0.2 : 0;
    puff.current.scale.set(1 + Math.abs(dip), 1 - dip, 1 + Math.abs(dip));
  });
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider ref={col} args={[0.25, radius]} position={[at[0], top - 0.25, at[1]]} />
      </RigidBody>
      <group ref={puff} position={[at[0], top, at[1]]}>
        <mesh position={[0, -0.2, 0]} scale={[1, 0.45, 1]} material={lambert('#ffb8d9')} castShadow>
          <sphereGeometry args={[radius + 0.1, 16, 10]} />
        </mesh>
        <Puffs size={[radius * 2, radius * 2]} color="#ff8fc7" />
      </group>
    </group>
  );
}

/** A plank hanging from two balloons, bobbing gently up and down. */
function Plank({ at, top, index }: { at: Vec2; top: number; index: number }) {
  const [sx, sz] = C.plankSize;
  const body = useRef<RapierRigidBody>(null);
  const deck = useRef<RapierCollider>(null);
  const next = useMemo(() => new THREE.Vector3(), []);
  const w = 1.6;
  const phase = index * 2.1;
  const yAt = (t: number) => top - 0.15 + C.plankBob * Math.sin(w * t + phase);
  const surface = useMemo<Surface>(() => ({ velocityAt: (_p, out) => out.set(0, C.plankBob * w * Math.cos(w * gameClock.time + phase), 0) }), [phase]);
  useSurface(deck, surface);
  useGameFrame(() => {
    next.set(at[0], yAt(gameClock.time), at[1]);
    body.current?.setNextKinematicTranslation(next);
  });
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[at[0], yAt(0), at[1]]}>
      <CuboidCollider ref={deck} args={[sx / 2, 0.15, sz / 2]} />
      <mesh castShadow receiveShadow material={lambert('#b7793f')}>
        <boxGeometry args={[sx, 0.3, sz]} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * (sx / 2 - 0.15), 0, -sz / 2 + 0.1]}>
          <mesh position={[0, 1.1, 0]} material={lambert('#e2e8f0')}>
            <cylinderGeometry args={[0.012, 0.012, 2.2, 4]} />
          </mesh>
          <mesh position={[0, 2.5, 0]} scale={[1, 1.2, 1]} material={lambert(RAINBOW[(index * 2 + (s > 0 ? 1 : 0)) % RAINBOW.length])} castShadow>
            <sphereGeometry args={[0.38, 12, 10]} />
          </mesh>
        </group>
      ))}
    </RigidBody>
  );
}

/** A flag on each checkpoint: grey until someone gets there, then it shoots up and turns golden. */
function Flag({ index }: { index: number }) {
  const f = SKY_FLAGS[index];
  const reached = useSkyCourse((s) => s.reached > index);
  const cloth = useRef<THREE.Mesh>(null);
  const x = f.at[0] + f.size[0] / 2 - 0.35;
  const z = f.at[1] - f.size[1] / 2 + 0.35;
  useGameFrame(() => {
    const m = cloth.current;
    if (!m) return;
    const targetY = reached ? 1.75 : 0.95;
    m.position.y += (targetY - m.position.y) * 0.12;
    m.rotation.y = Math.sin(gameClock.time * 3 + index) * 0.25;
  });
  return (
    <group position={[x, f.top, z]}>
      <mesh position={[0, 1.05, 0]} material={lambert('#e2e8f0')}>
        <cylinderGeometry args={[0.05, 0.05, 2.1, 6]} />
      </mesh>
      <mesh ref={cloth} position={[0.35, 0.95, 0]} material={lambert(reached ? '#ffd23f' : '#94a3b8')}>
        <boxGeometry args={[0.7, 0.45, 0.04]} />
      </mesh>
      <mesh position={[0, 2.12, 0]} material={lambert('#ffd23f')}>
        <sphereGeometry args={[0.09, 8, 6]} />
      </mesh>
    </group>
  );
}

/** The pad at the start: glows once someone has reached a flag, and flies you up to the highest one. */
function ReturnPad() {
  const [x, z] = C.pad;
  const y = groundHeight(x, z);
  const reached = useSkyCourse((s) => s.reached);
  const cooldown = useRef(new Map<number, number>());
  const glow = useRef<THREE.Mesh>(null);
  const target = useMemo(() => new THREE.Vector3(), []);
  useHint([x, y + 0.5, z], 'walk', 4);
  useGameFrame(() => {
    const on = useSkyCourse.getState().reached;
    if (glow.current) (glow.current.material as THREE.MeshBasicMaterial).color.setHSL((gameClock.time * 0.3) % 1, on ? 0.9 : 0, on ? 0.6 : 0.55);
    if (!on) return;
    const now = gameNow();
    players.forEach((p) => {
      if ((cooldown.current.get(p.slot) ?? 0) > now || p.isLaunched() || p.flopped) return;
      if (distXZ(p.position.x, p.position.z, x, z) > 1.3 || p.position.y > y + 1.6) return;
      cooldown.current.set(p.slot, now + 2500);
      const f = SKY_FLAGS[on - 1];
      target.set(f.at[0] - 0.4, f.top, f.at[1] + 0.3);
      p.launchTo(target, f.top + 4);
      playWhoosh(p.position);
      emit('star', [x, y + 0.3, z], { count: 16, color: RAINBOW, speed: 3, up: 5 });
    });
  });
  return (
    <group position={[x, y + 0.03, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={lambert(reached ? '#0ea5e9' : '#94a3b8')}>
        <circleGeometry args={[1.35, 32]} />
      </mesh>
      <mesh ref={glow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <ringGeometry args={[1.0, 1.35, 32]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {/* a little cloud on the pad: this one goes up to the clouds */}
      <mesh position={[0, 0.12, 0]} scale={[1, 0.35, 0.7]} material={lambert('#ffffff')}>
        <sphereGeometry args={[0.55, 12, 8]} />
      </mesh>
    </group>
  );
}

/** At the top: a big bell to ring (a party!), and a rainbow pad that flies you back down. */
function Summit() {
  const top = C.top.top;
  const [bx, bz] = C.bell;
  const [rx, rz] = C.rainbowPad;
  const bell = useRef<THREE.Group>(null);
  const swing = useRef({ t: -1, cooldown: 0 });
  const padCooldown = useRef(new Map<number, number>());
  const target = useMemo(() => new THREE.Vector3(C.rainbowTarget[0], groundHeight(...C.rainbowTarget), C.rainbowTarget[1]), []);
  useGameFrame((_, delta) => {
    const sw = swing.current;
    sw.cooldown -= delta;
    if (sw.t >= 0) sw.t += delta;
    if (bell.current) bell.current.rotation.z = sw.t >= 0 && sw.t < 2.5 ? Math.sin(sw.t * 9) * 0.6 * Math.exp(-sw.t * 1.4) : 0;
    const now = gameNow();
    players.forEach((p) => {
      if (p.position.y < top) return;
      // ring the bell (walk into it, or jump at it)
      if (sw.cooldown <= 0 && distXZ(p.position.x, p.position.z, bx, bz) < 1.3) {
        sw.cooldown = 2.5;
        sw.t = 0;
        playBell([bx, top + 2, bz]);
        burstConfetti([bx, top + 2.4, bz], 60);
        emit('star', [bx, top + 2.2, bz], { count: 30, color: ['#ffd23f', '#fff3a8', '#ffffff'], speed: 6, up: 5 });
        ring([bx, top + 0.1, bz], { color: '#ffd23f', radius: 3, duration: 0.6 });
        shakeCamera(0.25);
        earnSticker('course');
        useGame.getState().addParty(PARTY_POINTS.goal);
      }
      // the rainbow pad: whee, all the way back down over the course
      if ((padCooldown.current.get(p.slot) ?? 0) > now || p.isLaunched() || p.flopped) return;
      if (distXZ(p.position.x, p.position.z, rx, rz) > 0.95 || p.position.y > top + 1.6) return;
      padCooldown.current.set(p.slot, now + 3000);
      p.launchTo(target, top + 5);
      playWhoosh(p.position);
      emit('star', [rx, top + 0.3, rz], { count: 24, color: RAINBOW, speed: 4, up: 5 });
    });
  });
  const postH = 2.6;
  return (
    <>
      {/* the bell on its frame */}
      <group position={[bx, top, bz]}>
        {[-0.7, 0.7].map((dx) => (
          <mesh key={dx} position={[dx, postH / 2, 0]} material={lambert('#8d5a36')} castShadow>
            <cylinderGeometry args={[0.08, 0.1, postH, 8]} />
          </mesh>
        ))}
        <mesh position={[0, postH, 0]} rotation={[0, 0, Math.PI / 2]} material={lambert('#8d5a36')}>
          <cylinderGeometry args={[0.08, 0.08, 1.6, 8]} />
        </mesh>
        <group ref={bell} position={[0, postH - 0.05, 0]}>
          <mesh position={[0, -0.45, 0]} material={lambert('#ffd23f')} castShadow>
            <cylinderGeometry args={[0.22, 0.45, 0.7, 16, 1, true]} />
          </mesh>
          <mesh position={[0, -0.1, 0]} material={lambert('#ffd23f')}>
            <sphereGeometry args={[0.23, 12, 8]} />
          </mesh>
          <mesh position={[0, -0.85, 0]} material={lambert('#b45309')}>
            <sphereGeometry args={[0.1, 8, 6]} />
          </mesh>
        </group>
      </group>
      {/* the rainbow pad */}
      <group position={[rx, top + 0.02, rz]}>
        {RAINBOW.map((c, i) => (
          <mesh key={c} rotation={[-Math.PI / 2, 0, 0]} position={[0, i * 0.002, 0]} material={lambert(c)}>
            <ringGeometry args={[0.85 - (i + 1) * 0.13, 0.85 - i * 0.13, 28]} />
          </mesh>
        ))}
      </group>
    </>
  );
}

/** Who is standing on which flag's platform: the course remembers the highest one reached. */
function Checkpoints() {
  useGameFrame(() => {
    if (useGame.getState().phase !== 'play') return;
    players.forEach((p) => {
      if (!p.grounded || p.isLaunched()) return;
      const flag = flagAt(p.position.x, p.position.y, p.position.z);
      if (!flag || !useSkyCourse.getState().reach(flag)) return;
      const f = SKY_FLAGS[flag - 1];
      const at: [number, number, number] = [f.at[0] + f.size[0] / 2 - 0.35, f.top + 2, f.at[1] - f.size[1] / 2 + 0.35];
      playCollect(at);
      emit('star', at, { count: 20, color: ['#ffd23f', '#fff3a8', '#ffffff'], speed: 4, up: 4 });
      useGame.getState().addParty(PARTY_POINTS.trick);
    });
  });
  return null;
}

export function SkyCourse() {
  useHint([C.stumps[0].at[0], C.stumps[0].top + 0.3, C.stumps[0].at[1]], 'jump', 3.5);
  return (
    <>
      {C.stumps.map((s, i) => (
        <Stump key={i} at={s.at} top={s.top} />
      ))}
      {C.platforms.map((p, i) => (
        <Platform key={i} at={p.at} top={p.top} size={p.size} />
      ))}
      <Disc />
      <Slider />
      <Bouncer />
      <Cloud at={C.cloud.at} top={C.cloud.top} size={C.cloud.size} />
      {C.planks.map((p, i) => (
        <Plank key={i} at={p.at} top={p.top} index={i} />
      ))}
      <Cloud at={C.top.at} top={C.top.top} size={C.top.size} />
      {SKY_FLAGS.map((_, i) => (
        <Flag key={i} index={i} />
      ))}
      <ReturnPad />
      <Summit />
      <Checkpoints />
    </>
  );
}
