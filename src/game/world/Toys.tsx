import { CoefficientCombineRule } from '@dimforge/rapier3d-compat';
import { CuboidCollider, CylinderCollider, RigidBody, type RapierCollider } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playButton, playPop, playPoof } from '../audio';
import { MOVE, PARTY_POINTS } from '../config';
import { burstConfetti, emit, ring } from '../fx';
import { BALLOONS, distXZ, HAT_BOX, RED_BUTTON, TRAMPOLINE_TOP, type Vec3 } from '../layout';
import { basic, lambert } from '../materials';
import { players, registerStatic, shakeCamera, type Surface } from '../runtime';
import { useGame } from '../store';
import { useHint } from './common';
import { useSurface } from './surface';
import { gameClock, gameNow, useGameFrame } from '../clock';
import { earnSticker } from '../stickers';

// Small interactive toys used around the park.

const TRAMP_COLORS = ['#3b82f6', '#ff4d5e', '#22c55e', '#a855f7'];

/** In-ground trampoline: walk on to bounce, hold jump for an extra-big bounce. */
export function Trampoline({ position, radius, color = 0 }: { position: Vec3; radius: number; color?: number }) {
  const mat = useRef<THREE.Group>(null);
  const col = useRef<RapierCollider>(null);
  const lastBounce = useRef(-1e9);
  const surface = useMemo<Surface>(() => ({ bounce: MOVE.trampolineVelocity, onBounce: () => (lastBounce.current = gameNow()) }), []);
  useSurface(col, surface);
  useGameFrame(() => {
    if (!mat.current) return;
    const since = (gameNow() - lastBounce.current) / 1000;
    const dip = since < 0.6 ? Math.sin(since * 22) * Math.exp(-since * 6) * 0.25 : 0;
    mat.current.position.y = TRAMPOLINE_TOP - 0.04 - Math.max(0, dip);
    mat.current.scale.setScalar(1 + Math.abs(dip) * 0.15);
  });
  const c = TRAMP_COLORS[color % TRAMP_COLORS.length];
  return (
    <group position={position}>
      <RigidBody type="fixed" colliders={false}>
        {/* Bouncy top so balls and crates boing too */}
        <CylinderCollider
          ref={col}
          args={[TRAMPOLINE_TOP / 2, radius]}
          position={[0, TRAMPOLINE_TOP / 2, 0]}
          restitution={1.05}
          restitutionCombineRule={CoefficientCombineRule.Max}
        />
      </RigidBody>
      <mesh castShadow position={[0, TRAMPOLINE_TOP / 2, 0]} material={lambert(c)}>
        <cylinderGeometry args={[radius + 0.25, radius + 0.35, TRAMPOLINE_TOP, 28, 1, true]} />
      </mesh>
      <mesh position={[0, TRAMPOLINE_TOP, 0]} rotation={[Math.PI / 2, 0, 0]} material={lambert(c)}>
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

const BALLOON_COLORS = ['#ff4d5e', '#ffd23f', '#3b82f6', '#22c55e', '#a855f7', '#ff8fd8'];

export function Balloons() {
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
    s.respawnAt = gameNow() + 7000;
    const color = BALLOON_COLORS[i % BALLOON_COLORS.length];
    emit('confetti', s.pos, { count: 36, color: [color, '#ffffff', '#ffd23f'], speed: 6, up: 4 });
    ring(s.pos, { color, radius: 1.8, duration: 0.3 });
    playPop(s.pos);
    useGame.getState().addParty(PARTY_POINTS.pop);
    earnSticker('balloon');
  };

  useGameFrame((_, delta) => {
    const t = gameClock.time;
    const now = gameNow();
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

export function HatBox() {
  const lid = useRef<THREE.Group>(null);
  const lidState = useRef({ y: 0, v: 0 });
  const cooldowns = useRef(new Map<number, number>());
  const [x, , z] = HAT_BOX.position;
  const size = HAT_BOX.size;
  useHint([x, size, z], 'walk', 5);

  const giveHat = (slot: number) => {
    const now = gameNow();
    if ((cooldowns.current.get(slot) ?? 0) > now) return;
    cooldowns.current.set(slot, now + 2500);
    useGame.getState().randomHat(slot);
    earnSticker('hat');
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

  useGameFrame((_, delta) => {
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

export function RedButton() {
  const cap = useRef<THREE.Mesh>(null);
  const pressedUntil = useRef(0);
  const [x, , z] = RED_BUTTON.position;
  useHint([x, 0.6, z], 'walk', 5);
  useGameFrame(() => {
    const now = gameNow();
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
