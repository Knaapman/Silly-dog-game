import { CoefficientCombineRule } from '@dimforge/rapier3d-compat';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playButton, playCollect, playPop, playPoof } from '../audio';
import { PARTY_POINTS } from '../config';
import { burstConfetti, emit, ring } from '../fx';
import { BALLOONS, distXZ, GOLDEN_STARS, HAT_BOX, LAUNCH_PADS, RED_BUTTON, TRAMPOLINE_TOP, TRAMPOLINES } from '../layout';
import { basic, lambert } from '../materials';
import { players, registerStatic, shakeCamera, trampolineBounces } from '../runtime';
import { useGame } from '../store';

const TRAMP_COLORS = ['#3b82f6', '#ff4d5e', '#22c55e'];

function Trampoline({ index }: { index: number }) {
  const { position, radius } = TRAMPOLINES[index];
  const mat = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!mat.current) return;
    const since = (performance.now() - (trampolineBounces.get(index) ?? -1e9)) / 1000;
    const dip = since < 0.6 ? Math.sin(since * 22) * Math.exp(-since * 6) * 0.25 : 0;
    mat.current.position.y = TRAMPOLINE_TOP - 0.04 - Math.max(0, dip);
    mat.current.scale.setScalar(1 + Math.abs(dip) * 0.15);
  });
  return (
    <group position={position}>
      <RigidBody type="fixed" colliders={false}>
        {/* Bouncy top so balls and crates boing too */}
        <CylinderCollider
          args={[TRAMPOLINE_TOP / 2, radius]}
          position={[0, TRAMPOLINE_TOP / 2, 0]}
          restitution={1.05}
          restitutionCombineRule={CoefficientCombineRule.Max}
        />
      </RigidBody>
      <mesh castShadow position={[0, TRAMPOLINE_TOP / 2, 0]} material={lambert(TRAMP_COLORS[index % 3])}>
        <cylinderGeometry args={[radius + 0.25, radius + 0.35, TRAMPOLINE_TOP, 28, 1, true]} />
      </mesh>
      <mesh position={[0, TRAMPOLINE_TOP, 0]} rotation={[Math.PI / 2, 0, 0]} material={lambert(TRAMP_COLORS[index % 3])}>
        <torusGeometry args={[radius + 0.1, 0.22, 8, 32]} />
      </mesh>
      <group ref={mat}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={lambert('#1f2937')}>
          <circleGeometry args={[radius, 32]} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} material={lambert('#ffffff')}>
          <ringGeometry args={[radius * 0.45, radius * 0.55, 32]} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} material={lambert('#ffd23f')}>
          <circleGeometry args={[radius * 0.18, 20]} />
        </mesh>
      </group>
    </group>
  );
}

function LaunchPad({ index }: { index: number }) {
  const pad = LAUNCH_PADS[index];
  const chevrons = useRef<THREE.Group>(null);
  const angle = Math.atan2(pad.target[0] - pad.position[0], pad.target[2] - pad.position[2]);
  const sparkle = useRef(Math.random());
  useFrame(({ clock }, delta) => {
    chevrons.current?.children.forEach((c, i) => {
      const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
      const phase = (clock.elapsedTime * 2.5 - i * 0.35) % 1;
      m.color.setHSL(0.13, 1, 0.5 + Math.max(0, Math.sin(phase * Math.PI)) * 0.4);
    });
    sparkle.current -= delta;
    if (sparkle.current <= 0) {
      sparkle.current = 0.25;
      emit('star', [pad.position[0] + (Math.random() - 0.5) * 1.6, 0.2, pad.position[2] + (Math.random() - 0.5) * 1.6], {
        count: 1,
        color: ['#fff3a8', '#ffffff'],
        speed: 0.3,
        up: 3,
        gravity: -1,
        size: 0.12,
        life: 1
      });
    }
  });
  return (
    <group position={[pad.position[0], 0.03, pad.position[2]]} rotation={[0, angle, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={lambert('#ff8a1f')}>
        <circleGeometry args={[1.35, 32]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} material={lambert('#ffd23f')}>
        <ringGeometry args={[1.05, 1.35, 32]} />
      </mesh>
      <group ref={chevrons}>
        {[-0.55, 0, 0.55].map((z, i) => (
          <mesh key={i} position={[0, 0.01, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <shapeGeometry args={[chevronShape()]} />
            <meshBasicMaterial color="#fff3a8" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

let chevronCache: THREE.Shape | null = null;
function chevronShape() {
  if (chevronCache) return chevronCache;
  const s = new THREE.Shape();
  s.moveTo(-0.6, 0.1);
  s.lineTo(0, -0.35);
  s.lineTo(0.6, 0.1);
  s.lineTo(0.6, 0.35);
  s.lineTo(0, -0.1);
  s.lineTo(-0.6, 0.35);
  s.lineTo(-0.6, 0.1);
  chevronCache = s;
  return s;
}

const BALLOON_COLORS = ['#ff4d5e', '#ffd23f', '#3b82f6', '#22c55e', '#a855f7', '#ff8fd8'];

function Balloons() {
  const groups = useRef<(THREE.Group | null)[]>([]);
  const state = useMemo(() => BALLOONS.map(() => ({ popped: false, respawnAt: 0, grow: 1, pos: new THREE.Vector3() })), []);
  const probe = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const cleanups = BALLOONS.map((_, i) =>
      registerStatic({
        id: 7000 + i,
        position: state[i].pos,
        radius: 0.6,
        onBonk: () => pop(i)
      })
    );
    return () => cleanups.forEach((c) => c());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pop = (i: number) => {
    const s = state[i];
    if (s.popped) return;
    s.popped = true;
    s.respawnAt = performance.now() + 7000;
    const color = BALLOON_COLORS[i % BALLOON_COLORS.length];
    emit('confetti', s.pos, { count: 36, color: [color, '#ffffff', '#ffd23f'], speed: 6, up: 4 });
    ring(s.pos, { color, radius: 1.8, duration: 0.3 });
    playPop(s.pos);
    useGame.getState().addParty(PARTY_POINTS.pop);
  };

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const now = performance.now();
    BALLOONS.forEach(([x, y, z], i) => {
      const g = groups.current[i];
      const s = state[i];
      if (!g) return;
      s.pos.set(x + Math.sin(t * 0.7 + i) * 0.15, y + Math.sin(t * 1.4 + i * 2) * 0.22, z);
      if (s.popped) {
        g.visible = false;
        if (now > s.respawnAt) {
          s.popped = false;
          s.grow = 0;
          playPoof(s.pos);
        }
        return;
      }
      s.grow = Math.min(1, s.grow + delta * 2);
      g.visible = true;
      g.position.copy(s.pos);
      g.rotation.z = Math.sin(t * 1.1 + i) * 0.12;
      g.scale.setScalar(s.grow);
      players.forEach((p) => {
        probe.copy(p.position);
        probe.y += 0.4;
        if (probe.distanceTo(s.pos) < 1.15) pop(i);
      });
    });
  });

  return (
    <group>
      {BALLOONS.map((_, i) => (
        <group
          key={i}
          ref={(g) => {
            groups.current[i] = g;
          }}
        >
          <mesh castShadow scale={[1, 1.2, 1]} material={lambert(BALLOON_COLORS[i % BALLOON_COLORS.length])}>
            <sphereGeometry args={[0.55, 18, 14]} />
          </mesh>
          <mesh position={[-0.18, 0.25, 0.4]} material={basic('#ffffff')}>
            <sphereGeometry args={[0.08, 8, 6]} />
          </mesh>
          <mesh position={[0, -0.7, 0]} material={lambert(BALLOON_COLORS[i % BALLOON_COLORS.length])}>
            <coneGeometry args={[0.1, 0.14, 8]} />
          </mesh>
          <mesh position={[0, -1.35, 0]} material={lambert('#ffffff')}>
            <cylinderGeometry args={[0.01, 0.01, 1.2, 4]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

let starGeometry: THREE.ExtrudeGeometry | null = null;
function getStarGeometry() {
  if (starGeometry) return starGeometry;
  const shape = new THREE.Shape();
  for (let i = 0; i <= 10; i += 1) {
    const r = i % 2 === 0 ? 0.62 : 0.28;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  starGeometry = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2 });
  starGeometry.center();
  return starGeometry;
}

function GoldenStars() {
  const collected = useGame((s) => s.stars);
  const groups = useRef<(THREE.Group | null)[]>([]);
  const probe = useMemo(() => new THREE.Vector3(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const sparkle = useRef(0);
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb300', emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.3 }),
    []
  );

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const state = useGame.getState();
    sparkle.current -= delta;
    const doSparkle = sparkle.current <= 0;
    if (doSparkle) sparkle.current = 0.3;
    GOLDEN_STARS.forEach(([x, y, z], i) => {
      const g = groups.current[i];
      if (!g || state.stars[i]) return;
      pos.set(x, y + Math.sin(t * 2 + i) * 0.18, z);
      g.position.copy(pos);
      g.rotation.y = t * 2 + i;
      if (doSparkle) emit('star', pos, { count: 1, color: ['#fff3a8', '#ffffff'], speed: 1.2, up: 1, gravity: 0.5, size: 0.1, life: 0.8, spread: 0.6 });
      if (state.phase !== 'play') return;
      players.forEach((p) => {
        probe.copy(p.position);
        probe.y += 0.3;
        if (probe.distanceTo(pos) < 1.6) {
          useGame.getState().collectStar(i);
          emit('star', pos, { count: 26, color: ['#ffd23f', '#fff3a8', '#ffffff'], speed: 7, up: 6 });
          burstConfetti(pos, 50);
          ring(pos, { color: '#ffd23f', radius: 3, duration: 0.5 });
          playCollect(pos);
          shakeCamera(0.3);
        }
      });
    });
  });

  return (
    <group>
      {GOLDEN_STARS.map((_, i) =>
        collected[i] ? null : (
          <group
            key={i}
            ref={(g) => {
              groups.current[i] = g;
            }}
          >
            <mesh castShadow geometry={getStarGeometry()} material={material} />
            {/* light beam so kids can spot stars from far away */}
            <mesh position={[0, 7, 0]}>
              <cylinderGeometry args={[0.35, 0.6, 14, 12, 1, true]} />
              <meshBasicMaterial color="#fff3a8" transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
          </group>
        )
      )}
    </group>
  );
}

function HatBox() {
  const lid = useRef<THREE.Group>(null);
  const lidState = useRef({ y: 0, v: 0 });
  const cooldowns = useRef(new Map<number, number>());
  const [x, , z] = HAT_BOX.position;
  const size = HAT_BOX.size;

  const giveHat = (slot: number) => {
    const now = performance.now();
    if ((cooldowns.current.get(slot) ?? 0) > now) return;
    cooldowns.current.set(slot, now + 2500);
    useGame.getState().randomHat(slot);
    useGame.getState().addParty(PARTY_POINTS.hat);
    lidState.current.v = 9;
    burstConfetti([x, size + 0.3, z], 40, 5);
  };

  useEffect(
    () =>
      registerStatic({
        id: 9000,
        position: new THREE.Vector3(x, size / 2, z),
        radius: size * 0.6,
        onBonk: (slot) => giveHat(slot)
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useFrame((_, delta) => {
    const ls = lidState.current;
    ls.v -= 30 * delta;
    ls.y = Math.max(0, ls.y + ls.v * delta);
    if (ls.y === 0) ls.v = Math.max(0, ls.v);
    if (lid.current) {
      lid.current.position.y = size + 0.1 + ls.y;
      lid.current.rotation.z = ls.y * 0.3;
    }
    players.forEach((p) => {
      if (distXZ(p.position.x, p.position.z, x, z) < size * 0.5 + 1.0 && p.position.y < size + 1.2) giveHat(p.slot);
    });
  });

  return (
    <group position={[x, 0, z]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[size / 2, size / 2, size / 2]} position={[0, size / 2, 0]} />
      </RigidBody>
      <mesh castShadow receiveShadow position={[0, size / 2, 0]} material={lambert('#a855f7')}>
        <boxGeometry args={[size, size, size]} />
      </mesh>
      <mesh position={[0, size / 2, 0]} material={lambert('#ffd23f')}>
        <boxGeometry args={[size + 0.02, size + 0.02, 0.28]} />
      </mesh>
      <mesh position={[0, size / 2, 0]} material={lambert('#ffd23f')}>
        <boxGeometry args={[0.28, size + 0.02, size + 0.02]} />
      </mesh>
      <group ref={lid}>
        <mesh castShadow material={lambert('#c084fc')}>
          <boxGeometry args={[size + 0.2, 0.25, size + 0.2]} />
        </mesh>
        <mesh material={lambert('#ffd23f')}>
          <boxGeometry args={[size + 0.22, 0.26, 0.3]} />
        </mesh>
        <mesh material={lambert('#ffd23f')}>
          <boxGeometry args={[0.3, 0.26, size + 0.22]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.25, 0.32, 0]} rotation={[Math.PI / 2, s * 0.5, 0]} material={lambert('#ffd23f')}>
            <torusGeometry args={[0.22, 0.07, 8, 16]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function RedButton() {
  const cap = useRef<THREE.Mesh>(null);
  const pressedUntil = useRef(0);
  const [x, , z] = RED_BUTTON.position;
  useFrame(() => {
    const now = performance.now();
    let someoneOn = false;
    players.forEach((p) => {
      if (distXZ(p.position.x, p.position.z, x, z) < RED_BUTTON.radius && p.position.y < 1.4) someoneOn = true;
    });
    if (someoneOn && now > pressedUntil.current && useGame.getState().phase === 'play') {
      pressedUntil.current = now + 3000;
      useGame.getState().resetPark();
      playButton();
      burstConfetti([x, 1, z], 50, 6);
      ring([x, 0.1, z], { color: '#ff4d5e', radius: 6, duration: 0.7 });
      shakeCamera(0.35);
      emit('puff', [x, 0.5, z], { count: 20, color: ['#ffffff', '#ffd6dc'], speed: 5, up: 1 });
    }
    if (cap.current) {
      const down = someoneOn || now < pressedUntil.current - 2600;
      cap.current.position.y = THREE.MathUtils.lerp(cap.current.position.y, down ? 0.28 : 0.45, 0.3);
    }
  });
  return (
    <group position={[x, 0, z]}>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[0.12, RED_BUTTON.radius + 0.3]} position={[0, 0.12, 0]} />
      </RigidBody>
      <mesh castShadow receiveShadow position={[0, 0.12, 0]} material={lambert('#cfd8dc')}>
        <cylinderGeometry args={[RED_BUTTON.radius + 0.3, RED_BUTTON.radius + 0.45, 0.24, 28]} />
      </mesh>
      <mesh ref={cap} castShadow position={[0, 0.45, 0]} scale={[1, 0.45, 1]} material={lambert('#ff2d44')}>
        <sphereGeometry args={[RED_BUTTON.radius * 0.85, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
    </group>
  );
}

export function Playthings() {
  return (
    <>
      {TRAMPOLINES.map((_, i) => (
        <Trampoline key={i} index={i} />
      ))}
      {LAUNCH_PADS.map((_, i) => (
        <LaunchPad key={i} index={i} />
      ))}
      <Balloons />
      <GoldenStars />
      <HatBox />
      <RedButton />
    </>
  );
}
