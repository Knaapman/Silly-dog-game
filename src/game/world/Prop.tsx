import {
  BallCollider,
  ConeCollider,
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  type CollisionEnterPayload,
  type RapierRigidBody
} from '@react-three/rapier';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { playBounce, playChomp, playClack, playPoof, playSplat, playSqueak } from '../audio';
import { PARTY_POINTS } from '../config';
import { emit, poof } from '../fx';
import type { Vec3 } from '../layout';
import {
  beachBallTexture,
  crateTexture,
  hayTexture,
  lambert,
  melonTexture,
  soccerTexture
} from '../materials';
import { allocPropId, players, registerProp, type PropEntry, type PropKind } from '../runtime';
import { useGame } from '../store';
import { after, useGameFrame } from '../clock';

type PropDef = {
  radius: number;
  launch: number;
  heavy: boolean;
  density: number;
  restitution: number;
  friction: number;
  linearDamping: number;
  angularDamping: number;
};

type SimpleKind = Exclude<PropKind, 'chicken' | 'cat' | 'bird' | 'cow' | 'dino' | 'snowball' | 'throwball' | 'pitball' | 'poop' | 'giantcarrot' | 'hamsterball' | 'fish' | 'block' | 'giantball'>;

const DEFS: Record<SimpleKind, PropDef> = {
  ball: { radius: 0.3, launch: 16, heavy: false, density: 0.5, restitution: 0.8, friction: 0.6, linearDamping: 0.2, angularDamping: 0.3 },
  beachball: { radius: 0.75, launch: 13, heavy: false, density: 0.06, restitution: 0.85, friction: 0.5, linearDamping: 0.5, angularDamping: 0.4 },
  soccer: { radius: 0.55, launch: 15, heavy: false, density: 0.3, restitution: 0.7, friction: 0.6, linearDamping: 0.25, angularDamping: 0.5 },
  bowling: { radius: 0.42, launch: 10, heavy: true, density: 5, restitution: 0.15, friction: 0.4, linearDamping: 0.05, angularDamping: 0.1 },
  crate: { radius: 0.62, launch: 11, heavy: false, density: 0.5, restitution: 0.1, friction: 0.7, linearDamping: 0.1, angularDamping: 0.2 },
  barrel: { radius: 0.5, launch: 10, heavy: true, density: 0.9, restitution: 0.15, friction: 0.6, linearDamping: 0.1, angularDamping: 0.2 },
  cone: { radius: 0.35, launch: 13, heavy: false, density: 0.5, restitution: 0.3, friction: 0.6, linearDamping: 0.1, angularDamping: 0.3 },
  hay: { radius: 0.7, launch: 8, heavy: true, density: 0.7, restitution: 0.05, friction: 0.9, linearDamping: 0.2, angularDamping: 0.6 },
  melon: { radius: 0.48, launch: 10, heavy: false, density: 0.8, restitution: 0.2, friction: 0.8, linearDamping: 0.1, angularDamping: 0.4 },
  pin: { radius: 0.3, launch: 11, heavy: false, density: 0.45, restitution: 0.3, friction: 0.5, linearDamping: 0.05, angularDamping: 0.1 },
  apple: { radius: 0.2, launch: 13, heavy: false, density: 0.8, restitution: 0.4, friction: 0.7, linearDamping: 0.2, angularDamping: 0.4 },
  duck: { radius: 0.32, launch: 15, heavy: false, density: 0.25, restitution: 0.6, friction: 0.5, linearDamping: 0.3, angularDamping: 0.5 }
};

export type PropKindNoChicken = SimpleKind;

function Collider({ kind }: { kind: PropKindNoChicken }) {
  const d = DEFS[kind];
  const common = { density: d.density, restitution: d.restitution, friction: d.friction };
  switch (kind) {
    case 'crate':
      return <CuboidCollider args={[0.6, 0.6, 0.6]} {...common} />;
    case 'barrel':
      return <CylinderCollider args={[0.5, 0.45]} {...common} />;
    case 'cone':
      return <ConeCollider args={[0.4, 0.3]} {...common} />;
    case 'hay':
      return <CylinderCollider args={[0.55, 0.62]} {...common} />;
    case 'pin':
      return <CylinderCollider args={[0.38, 0.14]} {...common} />;
    default:
      return <BallCollider args={[d.radius]} {...common} />;
  }
}

function Visual({ kind, color }: { kind: PropKindNoChicken; color?: string }) {
  const mats = useMemo(
    () => ({
      crate: new THREE.MeshLambertMaterial({ map: crateTexture() }),
      beach: new THREE.MeshLambertMaterial({ map: beachBallTexture() }),
      soccer: new THREE.MeshLambertMaterial({ map: soccerTexture() }),
      melon: new THREE.MeshLambertMaterial({ map: melonTexture() }),
      hay: new THREE.MeshLambertMaterial({ map: hayTexture() })
    }),
    []
  );
  switch (kind) {
    case 'ball':
      return (
        <mesh castShadow material={lambert(color ?? '#c6f432')}>
          <sphereGeometry args={[0.3, 16, 12]} />
        </mesh>
      );
    case 'beachball':
      return (
        <mesh castShadow material={mats.beach}>
          <sphereGeometry args={[0.75, 20, 16]} />
        </mesh>
      );
    case 'soccer':
      return (
        <mesh castShadow material={mats.soccer}>
          <sphereGeometry args={[0.55, 20, 16]} />
        </mesh>
      );
    case 'bowling':
      return (
        <group>
          <mesh castShadow material={lambert('#7c3aed')}>
            <sphereGeometry args={[0.42, 18, 14]} />
          </mesh>
          {[[-0.08, 0.28], [0.08, 0.28], [0, 0.18]].map(([x, y], i) => (
            <mesh key={i} material={lambert('#1f1147')} position={[x, y, 0.3]}>
              <sphereGeometry args={[0.05, 8, 6]} />
            </mesh>
          ))}
        </group>
      );
    case 'crate':
      return (
        <mesh castShadow receiveShadow material={mats.crate}>
          <boxGeometry args={[1.2, 1.2, 1.2]} />
        </mesh>
      );
    case 'barrel':
      return (
        <group>
          <mesh castShadow material={lambert(color ?? '#e05a47')}>
            <cylinderGeometry args={[0.45, 0.45, 1, 16]} />
          </mesh>
          {[-0.32, 0.32].map((y) => (
            <mesh key={y} material={lambert('#5b6770')} position={[0, y, 0]}>
              <cylinderGeometry args={[0.465, 0.465, 0.08, 16]} />
            </mesh>
          ))}
        </group>
      );
    case 'cone':
      return (
        <group>
          <mesh castShadow material={lambert('#ff7a1a')}>
            <coneGeometry args={[0.3, 0.8, 14]} />
          </mesh>
          <mesh material={lambert('#ffffff')} position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.13, 0.19, 0.14, 14]} />
          </mesh>
          <mesh material={lambert('#ff7a1a')} position={[0, -0.39, 0]}>
            <boxGeometry args={[0.66, 0.04, 0.66]} />
          </mesh>
        </group>
      );
    case 'hay':
      return (
        <mesh castShadow receiveShadow material={mats.hay}>
          <cylinderGeometry args={[0.62, 0.62, 1.1, 16]} />
        </mesh>
      );
    case 'melon':
      return (
        <mesh castShadow material={mats.melon} scale={[1, 0.88, 1.2]} rotation={[Math.PI / 2, 0, 0]}>
          <sphereGeometry args={[0.46, 18, 14]} />
        </mesh>
      );
    case 'pin':
      return (
        <group>
          <mesh castShadow material={lambert('#ffffff')} position={[0, -0.12, 0]}>
            <cylinderGeometry args={[0.1, 0.14, 0.52, 12]} />
          </mesh>
          <mesh castShadow material={lambert('#ffffff')} position={[0, 0.26, 0]}>
            <sphereGeometry args={[0.1, 12, 10]} />
          </mesh>
          <mesh material={lambert('#ff4d5e')} position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.085, 0.09, 0.08, 12]} />
          </mesh>
        </group>
      );
    case 'apple':
      return (
        <group>
          <mesh castShadow material={lambert(color ?? '#e53935')}>
            <sphereGeometry args={[0.2, 14, 10]} />
          </mesh>
          <mesh material={lambert('#5b3a1a')} position={[0, 0.22, 0]}>
            <cylinderGeometry args={[0.015, 0.02, 0.08, 5]} />
          </mesh>
          <mesh material={lambert('#43a047')} position={[0.05, 0.23, 0]} rotation={[0, 0, -0.8]} scale={[1, 0.3, 0.6]}>
            <sphereGeometry args={[0.06, 8, 6]} />
          </mesh>
        </group>
      );
    case 'duck':
      return (
        <group>
          <mesh castShadow material={lambert(color ?? '#ffd23f')} scale={[1, 0.8, 1.2]}>
            <sphereGeometry args={[0.28, 14, 10]} />
          </mesh>
          <mesh castShadow material={lambert(color ?? '#ffd23f')} position={[0, 0.26, 0.14]}>
            <sphereGeometry args={[0.17, 14, 10]} />
          </mesh>
          <mesh material={lambert('#ff8a1f')} position={[0, 0.24, 0.32]} scale={[1, 0.4, 1]}>
            <sphereGeometry args={[0.08, 10, 8]} />
          </mesh>
          {[-1, 1].map((sx) => (
            <mesh key={sx} material={lambert('#111111')} position={[sx * 0.08, 0.31, 0.27]}>
              <sphereGeometry args={[0.028, 6, 4]} />
            </mesh>
          ))}
        </group>
      );
  }
}

export type PropProps = {
  kind: PropKindNoChicken;
  position: Vec3;
  rotation?: Vec3;
  color?: string;
  /** Burst into pieces on a headbutt or a hard landing, then grow back. */
  splatty?: boolean;
  /** Eaten when licked (apples). */
  edible?: boolean;
  onEaten?: () => void;
  /** When set, the prop resets itself whenever this number changes (in addition to the park reset). */
  resetKey?: number;
  /** Initial velocity (e.g. balls spat out by the volcano). */
  velocity?: Vec3;
  children?: ReactNode;
};

export function Prop({ kind, position, rotation, color, splatty, edible, onEaten, resetKey, velocity }: PropProps) {
  const def = DEFS[kind];
  const body = useRef<RapierRigidBody>(null);
  const visual = useRef<THREE.Group>(null);
  const id = useMemo(() => allocPropId(), []);
  const [hidden, setHidden] = useState(false);
  const lastSpeed = useRef(0);
  const entryRef = useRef<PropEntry | null>(null);
  const resetToken = useGame((s) => s.resetToken);

  const reset = () => {
    const rb = body.current;
    if (!rb) return;
    rb.setEnabled(true);
    rb.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rotation ?? [0, 0, 0])));
    rb.setRotation(q, true);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    if (entryRef.current) entryRef.current.enabled = true;
    setHidden(false);
  };

  const splat = () => {
    const rb = body.current;
    const entry = entryRef.current;
    if (!rb || !entry || !entry.enabled) return;
    const p = rb.translation();
    entry.enabled = false;
    rb.setEnabled(false);
    setHidden(true);
    emit('chunk', [p.x, p.y, p.z], { count: 22, color: ['#ff4d6d', '#ff8fa3', '#2e7d32', '#1b5e20'], speed: 6, up: 7, size: 0.18 });
    emit('drop', [p.x, p.y, p.z], { count: 16, color: ['#ff4d6d', '#ffb3c1'], speed: 4, up: 5 });
    playSplat(p);
    useGame.getState().addParty(PARTY_POINTS.splat);
    after(9, () => {
      reset();
      poof(position, '#b6f5a8', 12);
      playPoof(position);
    });
  };

  useEffect(() => {
    const entry: PropEntry = {
      id,
      kind,
      getBody: () => body.current,
      radius: def.radius,
      launch: def.launch,
      heavy: def.heavy,
      grabbable: true,
      enabled: true,
      heldBy: null,
      onBonk: splatty ? () => after(0, splat) : kind === 'duck' ? () => playSqueak(body.current?.translation()) : undefined,
      onGrab: edible
        ? (slot) => {
            const rb = body.current;
            if (!rb) return false;
            const p = rb.translation();
            playChomp(p);
            players.get(slot)?.feed();
            emit('heart', [p.x, p.y + 0.8, p.z], { count: 6, color: ['#ff4d8d', '#ff8fb5'], speed: 1.5, up: 2 });
            emit('chunk', [p.x, p.y, p.z], { count: 8, color: ['#fff3c4', '#e53935'], speed: 2, up: 3, size: 0.08 });
            useGame.getState().addParty(PARTY_POINTS.eat);
            entry.enabled = false;
            onEaten?.();
            return false;
          }
        : kind === 'duck'
          ? () => {
              playSqueak(body.current?.translation());
            }
          : undefined
    };
    entryRef.current = entry;
    return registerProp(entry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const lastReset = useRef({ resetToken, resetKey });
  useEffect(() => {
    const prev = lastReset.current;
    if (prev.resetToken === resetToken && prev.resetKey === resetKey) return;
    lastReset.current = { resetToken, resetKey };
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken, resetKey]);

  const tick = useRef(Math.floor(Math.random() * 30));
  useGameFrame(() => {
    const rb = body.current;
    const entry = entryRef.current;
    if (!rb || !entry || !entry.enabled) return;
    if (splatty) {
      const v = rb.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      // A sudden stop from a high speed = a hard landing.
      if (lastSpeed.current > 11 && speed < lastSpeed.current * 0.45 && entry.heldBy == null) splat();
      lastSpeed.current = speed;
    }
    tick.current += 1;
    if (tick.current % 30 === 0 && rb.translation().y < -10) reset();
  });

  const onCollisionEnter = (payload: CollisionEnterPayload) => {
    const rb = body.current;
    if (!rb) return;
    const v = rb.linvel();
    const speed = Math.hypot(v.x, v.y, v.z);
    if (speed < 3.5) return;
    const other = payload.other.rigidBody;
    if (other && other.isDynamic() && other.mass() > 1.5 && speed < 6) return;
    const p = rb.translation();
    const sharp = Math.min(1, speed / 14);
    if (kind === 'duck') playSqueak(p);
    else if (kind === 'crate' || kind === 'pin' || kind === 'barrel' || kind === 'cone') playClack(p, sharp);
    else playBounce(p, sharp);
  };

  return (
    <RigidBody
      ref={body}
      position={position}
      rotation={rotation}
      colliders={false}
      linearDamping={def.linearDamping}
      angularDamping={def.angularDamping}
      onCollisionEnter={onCollisionEnter}
      {...(velocity ? { linearVelocity: velocity } : {})}
      ccd={kind === 'ball' || kind === 'soccer' || kind === 'apple'}
    >
      <Collider kind={kind} />
      <group ref={visual} visible={!hidden}>
        <Visual kind={kind} color={color} />
      </group>
    </RigidBody>
  );
}
