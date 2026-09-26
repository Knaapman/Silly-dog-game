import { BallCollider, CylinderCollider, RigidBody, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playCrumble, playPoof } from '../audio';
import { PARTY_POINTS } from '../config';
import { emit, poof } from '../fx';
import { distXZ, ICE, isOnSnow, SKI_JUMP, SNOW, SNOW_HILL, SNOWBALLS, SNOWMEN, type Vec3 } from '../layout';
import { lambert, speckleTexture } from '../materials';
import { allocPropId, camera, registerProp, type PropEntry, type Surface } from '../runtime';
import { useGame } from '../store';
import { Breakable, type Piece } from './Breakable';
import { SlideTower, useHint } from './common';
import { useSurface } from './surface';
import { after, useGameFrame } from '../clock';
import { earnSticker } from '../stickers';

function SnowHill() {
  const [hx, hz] = SNOW_HILL.center;
  const capAngle = Math.acos((SNOW_HILL.sphereRadius - SNOW_HILL.height) / SNOW_HILL.sphereRadius);
  const col = useRef<RapierCollider>(null);
  const surface = useMemo<Surface>(() => ({ snow: true }), []);
  useSurface(col, surface);
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ map: speckleTexture('snowhill', '#ffffff', ['#e3f0ff', '#d6e8fb'], 6) }), []);
  return (
    <RigidBody type="fixed" colliders={false} position={[hx, SNOW_HILL.height - SNOW_HILL.sphereRadius, hz]}>
      <BallCollider ref={col} args={[SNOW_HILL.sphereRadius]} />
      <mesh receiveShadow castShadow material={mat}>
        <sphereGeometry args={[SNOW_HILL.sphereRadius, 48, 16, 0, Math.PI * 2, 0, capAngle]} />
      </mesh>
    </RigidBody>
  );
}

function IcePond() {
  const [ix, iz] = ICE.center;
  const col = useRef<RapierCollider>(null);
  const surface = useMemo<Surface>(() => ({ slippery: 0.7 }), []);
  useSurface(col, surface);
  useHint([ix, 0.5, iz], 'walk', 3);
  return (
    <group position={[ix, 0, iz]}>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider ref={col} args={[0.03, ICE.radius]} position={[0, 0.03, 0]} friction={0.02} />
      </RigidBody>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.065, 0]}>
        <circleGeometry args={[ICE.radius, 40]} />
        <meshStandardMaterial color="#bfe6ff" roughness={0.05} metalness={0.2} />
      </mesh>
      {[0.4, 1.7, 2.9, 4.2].map((a, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, a]} position={[Math.cos(a) * 1.5, 0.07, Math.sin(a) * 1.5]} material={lambert('#ffffff')}>
          <planeGeometry args={[2.6 - i * 0.3, 0.05]} />
        </mesh>
      ))}
    </group>
  );
}

const SNOWMAN_PIECES: Piece[] = [
  { shape: 'ball', size: 0.6, color: '#ffffff', offset: [0, 0.6, 0] },
  { shape: 'ball', size: 0.45, color: '#ffffff', offset: [0, 1.5, 0] },
  { shape: 'ball', size: 0.32, color: '#ffffff', offset: [0, 2.2, 0] },
  { shape: 'box', size: 0.3, color: '#222222', offset: [0, 2.7, 0] },
  { shape: 'box', size: 0.15, color: '#ff8a1f', offset: [0, 2.2, 0.4] }
];

function Snowman({ at, scarf }: { at: [number, number]; scarf: string }) {
  return (
    <Breakable position={[at[0], 0, at[1]]} radius={0.7} height={2.6} pieces={SNOWMAN_PIECES} dust={['#ffffff', '#e3f0ff']} respawnMs={12000}>
      <mesh castShadow position={[0, 0.6, 0]} material={lambert('#ffffff')}>
        <sphereGeometry args={[0.65, 16, 12]} />
      </mesh>
      <mesh castShadow position={[0, 1.5, 0]} material={lambert('#ffffff')}>
        <sphereGeometry args={[0.47, 16, 12]} />
      </mesh>
      <mesh castShadow position={[0, 2.2, 0]} material={lambert('#ffffff')}>
        <sphereGeometry args={[0.34, 16, 12]} />
      </mesh>
      <mesh position={[0, 1.88, 0]} rotation={[Math.PI / 2, 0, 0]} material={lambert(scarf)}>
        <torusGeometry args={[0.3, 0.08, 8, 16]} />
      </mesh>
      <mesh position={[0, 2.2, 0.38]} rotation={[Math.PI / 2, 0, 0]} material={lambert('#ff8a1f')}>
        <coneGeometry args={[0.07, 0.35, 8]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.12, 2.3, 0.3]} material={lambert('#111111')}>
          <sphereGeometry args={[0.05, 6, 5]} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`arm${s}`} position={[s * 0.75, 1.6, 0]} rotation={[0, 0, s * -1.1]} material={lambert('#6d4c41')}>
          <cylinderGeometry args={[0.03, 0.04, 0.9, 5]} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 2.55, 0]} material={lambert('#222222')}>
        <cylinderGeometry args={[0.35, 0.35, 0.05, 14]} />
      </mesh>
      <mesh castShadow position={[0, 2.75, 0]} material={lambert('#222222')}>
        <cylinderGeometry args={[0.22, 0.24, 0.4, 14]} />
      </mesh>
    </Breakable>
  );
}

const SNOWBALL_START = 0.45;
const SNOWBALL_MAX = 1.9;

/** Push it through the snow and it grows. Headbutt a big one and it bursts. */
function SnowBall({ home }: { home: Vec3 }) {
  const body = useRef<RapierRigidBody>(null);
  const col = useRef<RapierCollider>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const radius = useRef(SNOWBALL_START);
  const id = useMemo(() => allocPropId(), []);
  const entryRef = useRef<PropEntry | null>(null);
  const resetToken = useGame((s) => s.resetToken);

  const respawn = () => {
    const rb = body.current;
    if (!rb) return;
    radius.current = SNOWBALL_START;
    col.current?.setRadius(SNOWBALL_START);
    rb.setTranslation({ x: home[0], y: home[1] + 0.5, z: home[2] }, true);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    if (entryRef.current) {
      entryRef.current.radius = SNOWBALL_START;
      entryRef.current.heavy = false;
    }
  };

  useEffect(() => {
    const entry: PropEntry = {
      id,
      kind: 'snowball',
      getBody: () => body.current,
      radius: SNOWBALL_START,
      launch: 12,
      heavy: false,
      grabbable: true,
      enabled: true,
      heldBy: null,
      onBonk: () => {
        if (radius.current < 1.1) return;
        const p = body.current?.translation();
        if (!p) return;
        emit('puff', p, { count: 30, color: ['#ffffff', '#e3f0ff'], speed: 6, up: 5, size: 0.5 });
        emit('chunk', p, { count: 20, color: '#ffffff', speed: 6, up: 7, size: 0.25 });
        playCrumble(p);
        useGame.getState().addParty(PARTY_POINTS.splat);
        earnSticker('snowball');
        after(0, () => {
          respawn();
          poof([home[0], home[1] + 0.5, home[2]], '#ffffff', 10);
          playPoof(home);
        });
      }
    };
    entryRef.current = entry;
    return registerProp(entry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const lastReset = useRef(resetToken);
  useEffect(() => {
    if (lastReset.current === resetToken) return;
    lastReset.current = resetToken;
    respawn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  useGameFrame((_, delta) => {
    const rb = body.current;
    if (!rb) return;
    const t = rb.translation();
    const v = rb.linvel();
    const speed = Math.hypot(v.x, v.z);
    if (isOnSnow(t.x, t.z) && speed > 1.2 && t.y < radius.current + 0.3 && radius.current < SNOWBALL_MAX) {
      radius.current = Math.min(SNOWBALL_MAX, radius.current + speed * Math.min(delta, 0.05) * 0.03);
      col.current?.setRadius(radius.current);
      if (entryRef.current) {
        entryRef.current.radius = radius.current;
        entryRef.current.heavy = radius.current > 1.2;
      }
      if (Math.random() < 0.3) emit('puff', [t.x, 0.1, t.z], { count: 1, color: '#ffffff', size: 0.25, speed: 1, up: 1 });
    }
    if (mesh.current) mesh.current.scale.setScalar(radius.current / SNOWBALL_START);
    if (t.y < -5) respawn();
  });

  return (
    <RigidBody ref={body} position={home} colliders={false} linearDamping={0.4} angularDamping={0.4}>
      <BallCollider ref={col} args={[SNOWBALL_START]} density={0.25} friction={0.8} restitution={0.1} />
      <mesh ref={mesh} castShadow material={lambert('#ffffff')}>
        <icosahedronGeometry args={[SNOWBALL_START, 2]} />
      </mesh>
    </RigidBody>
  );
}

function Snowfall() {
  const timer = useRef(0);
  useGameFrame((_, delta) => {
    const f = camera.focus;
    if (distXZ(f.x, f.z, SNOW.center[0], SNOW.center[1]) > SNOW.radius + 12) return;
    timer.current -= delta;
    if (timer.current > 0) return;
    timer.current = 0.05;
    const x = f.x + (Math.random() - 0.5) * 34;
    const z = f.z + (Math.random() - 0.5) * 26;
    if (!isOnSnow(x, z)) return;
    emit('confetti', [x, 12, z], { count: 2, color: '#ffffff', speed: 0.4, up: 0, gravity: 1.1, drag: 1.2, life: 6 });
  });
  return null;
}

export function Winter() {
  const scarves = ['#ff4d5e', '#3b82f6', '#22c55e', '#a855f7'];
  return (
    <group>
      <SnowHill />
      <IcePond />
      <SlideTower
        base={SKI_JUMP.base}
        height={SKI_JUMP.height}
        rampAngle={Math.PI}
        rampLength={9}
        slideAngle={-Math.PI / 2}
        slideLength={8}
        kicker
        colors={{ tower: '#bde0ff', ramp: '#ffffff', slide: '#e3f0ff', rail: '#3b82f6' }}
      />
      {SNOWMEN.map((at, i) => (
        <Snowman key={i} at={at} scarf={scarves[i % scarves.length]} />
      ))}
      {SNOWBALLS.map((p, i) => (
        <SnowBall key={i} home={p} />
      ))}
      <Snowfall />
    </group>
  );
}
