import { CapsuleCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { playCrack, playGiggle, playPoof, playRoar, playRumble, playSneeze, SNEEZE_AT } from '../audio';
import { PARTY_POINTS } from '../config';
import { emit, poof } from '../fx';
import { BRONTO, DINO_PAD, distXZ, EGG_NEST, TREX, VOLCANO, type Vec3 } from '../layout';
import { lambert } from '../materials';
import { debugInfo, players, props, propPosition, registerStatic, shakeCamera, spawners, statics } from '../runtime';
import { groundHeight } from '../terrain';
import { useGame } from '../store';
import { Ramp, useHint } from './common';
import { BabyDinos } from './Critters';
import { LaunchPad } from './Launchers';
import { Prop } from './Prop';
import { after, gameClock, gameNow, useGameFrame } from '../clock';
import { earnSticker } from '../stickers';
import { useSeeThrough } from './seeThrough';
import { randomStream } from '../rng';

const random = randomStream('dinoPark');

// ---------------------------------------------------------------------------
// Volcano: climb in (or take the launch pad) and it erupts you into the sky.

const RIM = VOLCANO.height;
const CRATER_FLOOR = RIM - 1.1;
const PROFILE: [number, number][] = [
  [VOLCANO.baseRadius, 0],
  [8.4, 1.3],
  [6.4, 2.8],
  [4.6, 4.3],
  [3.3, 5.6],
  [2.7, RIM],
  [2.2, RIM - 0.2],
  [1.6, CRATER_FLOOR + 0.2],
  [0.01, CRATER_FLOOR]
];

function Volcano() {
  const [cx, cz] = VOLCANO.center;
  const geometry = useMemo(() => new THREE.LatheGeometry(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 40), []);
  const craterTop = useMemo(() => new THREE.Vector3(cx, CRATER_FLOOR, cz), [cx, cz]);
  const state = useRef({ perPlayer: new Map<number, { since: number; count: number }>(), smoke: 0, nextAmbient: 12, rumble: 0 });
  const [balls, setBalls] = useState<{ id: number; color: string; velocity: Vec3 }[]>([]);
  const nextBall = useRef(1);
  useHint([cx, RIM + 0.5, cz], 'walk', 5);

  const spit = (count: number) => {
    const colors = ['#ff4d5e', '#ff9f1c', '#ffd23f', '#ff8fd8'];
    setBalls((list) => {
      const add = Array.from({ length: count }, () => {
        const a = random() * Math.PI * 2;
        return { id: nextBall.current++, color: colors[Math.floor(random() * colors.length)], velocity: [Math.cos(a) * 6, 14, Math.sin(a) * 6] as Vec3 };
      });
      return [...list, ...add].slice(-8);
    });
    emit('chunk', [cx, RIM, cz], { count: 30, color: ['#ff4d5e', '#ff9f1c', '#ffd23f'], speed: 5, up: 12, size: 0.25 });
    emit('puff', [cx, RIM + 1, cz], { count: 20, color: ['#9e9e9e', '#e0e0e0', '#ffffff'], speed: 2, up: 4, size: 0.7, gravity: -2, life: 1.6 });
  };

  useGameFrame((_, delta) => {
    const s = state.current;
    s.smoke -= delta;
    if (s.smoke <= 0) {
      s.smoke = 0.35;
      emit('puff', [cx + (random() - 0.5), RIM + 0.4, cz + (random() - 0.5)], { count: 1, color: ['#bdbdbd', '#eeeeee'], size: 0.6, speed: 0.4, up: 2, gravity: -1.5, life: 2 });
    }
    s.nextAmbient -= delta;
    if (s.nextAmbient <= 0) {
      s.nextAmbient = 18 + random() * 6;
      playRumble([cx, RIM, cz]);
      after(0.9, () => spit(3));
    }
    const now = gameNow();
    players.forEach((p) => {
      const inCrater = distXZ(p.position.x, p.position.z, cx, cz) < VOLCANO.craterRadius + 0.3 && p.position.y < RIM + 0.8 && p.position.y > CRATER_FLOOR - 0.5;
      const rec = s.perPlayer.get(p.slot) ?? { since: 0, count: 0 };
      if (!inCrater || p.isLaunched()) {
        rec.since = 0;
        s.perPlayer.set(p.slot, rec);
        return;
      }
      if (rec.since === 0) {
        rec.since = now;
        playRumble([cx, RIM, cz]);
        shakeCamera(0.25);
      }
      if (now - rec.since > 700) {
        rec.since = 0;
        rec.count += 1;
        // First go straight up past the golden star; the next time, land outside.
        if (rec.count % 2 === 1) p.launchTo(craterTop, 16);
        else {
          const a = random() * Math.PI * 2;
          p.launchTo(new THREE.Vector3(cx + Math.cos(a) * 13, 0, cz + Math.sin(a) * 13), 15);
        }
        spit(2);
        shakeCamera(0.5);
        useGame.getState().addParty(PARTY_POINTS.launch);
        earnSticker('volcano');
      }
      s.perPlayer.set(p.slot, rec);
    });
  });

  return (
    <group>
      <RigidBody type="fixed" colliders="trimesh" position={[cx, 0, cz]}>
        <mesh geometry={geometry} castShadow receiveShadow>
          <meshLambertMaterial color="#8d6e63" side={THREE.DoubleSide} />
        </mesh>
      </RigidBody>
      {/* grassy skirt and glowing crater */}
      <mesh position={[cx, 0.02, cz]} rotation={[-Math.PI / 2, 0, 0]} material={lambert('#7cb342')}>
        <ringGeometry args={[VOLCANO.baseRadius - 0.2, VOLCANO.baseRadius + 1.2, 40]} />
      </mesh>
      <mesh position={[cx, CRATER_FLOOR + 0.05, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.7, 24]} />
        <meshBasicMaterial color="#ff8a1f" />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = i * 1.3;
        return (
          <mesh key={i} position={[cx + Math.cos(a) * 3.6, 5.1, cz + Math.sin(a) * 3.6]} rotation={[0, -a, 0.9]} material={lambert('#ff7043')}>
            <boxGeometry args={[0.35, 1.8, 0.12]} />
          </mesh>
        );
      })}
      {balls.map((b) => (
        <Prop key={b.id} kind="ball" position={[cx, RIM + 0.6, cz]} color={b.color} velocity={b.velocity} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Brontosaurus: stairs onto its back, walk up the neck to the head, slide down the tail.

/** Tickles (headbutts on its body) within TICKLE_WINDOW seconds that make the brontosaurus sneeze. */
const TICKLES = 5;
const TICKLE_WINDOW = 6;

function Brontosaurus() {
  const [bx, bz] = BRONTO.center;
  const green = '#7ed957';
  const dark = '#5cb83a';
  const slide = useMemo(() => ({ slippery: 0.35, slide: true }), []);
  useHint([bx - 7.5, 1, bz], 'walk', 4);
  useHint([bx, 1, bz + 2.6], 'bonk', 3);
  const whole = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  useSeeThrough(whole, bx + 3, bz, 7);
  // tickle it (headbutt its legs and tummy): it giggles; tickle it lots and... ah... ah... CHOO!
  const st = useRef({ tickles: [] as number[], wiggle: 0, sneezeAt: -1, sneezes: 0, blown: 0 });
  debugInfo.bronto = st.current;
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useEffect(
    () =>
      registerStatic({
        id: 9210,
        position: new THREE.Vector3(bx, 1.4, bz),
        radius: 2.6,
        onBonk: () => {
          const s = st.current;
          if (s.sneezeAt >= 0) return;
          const now = gameNow();
          s.tickles = [...s.tickles.filter((t) => now - t < TICKLE_WINDOW * 1000), now];
          s.wiggle = 1;
          playGiggle([bx + 9.4, 7, bz], 0.45);
          if (s.tickles.length >= TICKLES) {
            s.tickles = [];
            s.sneezeAt = now + SNEEZE_AT * 1000;
            playSneeze([bx + 9.4, 7, bz]);
          }
        }
      }),
    [bx, bz]
  );
  const lastChoo = useRef(-1e9);
  const sneeze = () => {
    const nose: [number, number, number] = [bx + 10.9, 6.9, bz];
    lastChoo.current = gameNow();
    shakeCamera(0.6);
    emit('puff', nose, { count: 34, color: ['#ffffff', '#e6f7c1', '#d9f99d'], speed: 9, up: 0.5, size: 0.6, dir: [12, -1, 0] });
    emit('drop', nose, { count: 20, color: ['#d9f99d', '#bef264'], speed: 8, up: 1, size: 0.18, dir: [10, 0, 0] });
    useGame.getState().addParty(PARTY_POINTS.goal);
    earnSticker('sneeze');
    for (const p of players.values()) {
      const up = p.position.y - groundHeight(p.position.x, p.position.z);
      const along = p.position.x - bx;
      const across = p.position.z - bz;
      if (Math.abs(across) < 2.4 && along > -4.2 && along < 10.6 && up > 2.2) {
        // up on its back, its neck or its head: whoosh, off you go (off to the side, onto the grass)
        const side = across >= 0 ? 1 : -1;
        tmp.set(p.position.x + 1.5, 0, bz + side * (7 + Math.abs(along) * 0.15));
        tmp.y = groundHeight(tmp.x, tmp.z);
        p.launchTo(tmp.clone(), p.position.y + 4);
        st.current.blown += 1;
      } else if (along > 10 && along < 20 && Math.abs(across) < 4 && up < 9) {
        // right in front of its nose: blown away
        tmp.set(p.position.x + 6, 0, p.position.z + across * 0.5);
        tmp.y = groundHeight(tmp.x, tmp.z);
        p.launchTo(tmp.clone(), Math.max(p.position.y, tmp.y) + 3);
        st.current.blown += 1;
      }
    }
    props.forEach((prop) => {
      if (prop.heldBy != null || !propPosition(prop, tmp)) return;
      if (tmp.x - bx > 10 && tmp.x - bx < 22 && Math.abs(tmp.z - bz) < 5) prop.getBody()?.applyImpulse({ x: 6, y: 2, z: 0 }, true);
    });
  };
  useGameFrame((_, delta) => {
    const s = st.current;
    const now = gameNow();
    s.wiggle = Math.max(0, s.wiggle - delta * 1.5);
    if (s.sneezeAt >= 0 && now >= s.sneezeAt) {
      s.sneezeAt = -1;
      s.sneezes += 1;
      sneeze();
    }
    const h = head.current;
    if (!h) return;
    // the head: a giggly wiggle; leaning back for the "ah... ah..."; and a jerk forward on the CHOO
    const ah = s.sneezeAt >= 0 ? 1 - (s.sneezeAt - now) / (SNEEZE_AT * 1000) : 0;
    const choo = Math.max(0, 1 - (now - lastChoo.current) / 500);
    h.rotation.y = Math.sin(now / 50) * 0.15 * s.wiggle;
    h.rotation.z = ah * 0.4 - choo * 0.35;
  });
  return (
    <group ref={whole}>
      <RigidBody type="fixed" colliders={false} position={[bx, 2.6, bz]}>
        <CapsuleCollider args={[2.4, 2]} rotation={[0, 0, Math.PI / 2]} />
      </RigidBody>
      <mesh castShadow receiveShadow position={[bx, 2.6, bz]} rotation={[0, 0, Math.PI / 2]} scale={[0.95, 1, 0.85]} material={lambert(green)}>
        <capsuleGeometry args={[2.1, 4.8, 8, 20]} />
      </mesh>
      {[[-1, 1.5, 0.9], [1.2, 1.9, -0.6], [-0.2, 2.3, -1.1], [0.6, 2.4, 1.0]].map(([dx, dy, dz], i) => (
        <mesh key={i} position={[bx + dx, 2.6 + dy - 0.6, bz + dz]} scale={[1, 0.35, 1]} material={lambert(dark)}>
          <sphereGeometry args={[0.55, 10, 8]} />
        </mesh>
      ))}
      {[[-1.8, -1.3], [1.8, -1.3], [-1.8, 1.3], [1.8, 1.3]].map(([dx, dz], i) => (
        <RigidBody key={i} type="fixed" colliders={false} position={[bx + dx, 1.1, bz + dz]}>
          <CylinderCollider args={[1.1, 0.6]} />
          <mesh castShadow material={lambert(green)}>
            <cylinderGeometry args={[0.55, 0.65, 2.2, 12]} />
          </mesh>
        </RigidBody>
      ))}
      {/* neck: a walkable ramp up to the head */}
      <Ramp from={[bx + 3.6, 4.1, bz]} to={[bx + 8.6, 7.2, bz]} width={1.5} color={green} thickness={0.9} />
      <RigidBody type="fixed" colliders={false} position={[bx + 9.3, 7.2, bz]}>
        <CylinderCollider args={[0.2, 1.2]} />
      </RigidBody>
      <group ref={head} position={[bx + 9.4, 7.1, bz]}>
        <mesh castShadow scale={[1.3, 0.8, 1]} material={lambert(green)}>
          <sphereGeometry args={[1.1, 16, 12]} />
        </mesh>
        <mesh position={[0.9, -0.15, 0]} scale={[1, 0.6, 0.9]} material={lambert(green)}>
          <sphereGeometry args={[0.8, 12, 10]} />
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s} position={[0.5, 0.35, s * 0.75]}>
            <mesh material={lambert('#ffffff')}>
              <sphereGeometry args={[0.28, 10, 8]} />
            </mesh>
            <mesh position={[0.18, 0, s * 0.12]} material={lambert('#111111')}>
              <sphereGeometry args={[0.14, 8, 6]} />
            </mesh>
          </group>
        ))}
        <mesh position={[1.55, -0.3, 0]} rotation={[0, 0, Math.PI / 2]} material={lambert('#e05a47')}>
          <torusGeometry args={[0.35, 0.06, 6, 12, Math.PI]} />
        </mesh>
      </group>
      {/* tail: a long slide down */}
      <Ramp from={[bx - 3.8, 3.9, bz]} to={[bx - 12, 0.25, bz]} width={1.7} color={green} thickness={0.6} surface={slide} railColor={dark} railHeight={0.4} />
      {/* stairs up onto the back, facing the camera */}
      <Ramp from={[bx, 0, bz + 8.5]} to={[bx, 3.9, bz + 1.6]} width={2} color="#c9a36b" railColor="#8b5a2b" />
    </group>
  );
}

// ---------------------------------------------------------------------------
// T-rex statue: headbutt it and it ROARS.

function TRex() {
  const [x, , z] = TREX.position;
  const jaw = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const roar = useRef(0);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useHint([x, 1, z + 2.5], 'bonk', 5);

  useEffect(
    () =>
      registerStatic({
        id: 9200,
        position: new THREE.Vector3(x, 1, z),
        radius: 2.2,
        onBonk: () => {
          if (roar.current > 0.3) return;
          roar.current = 1.4;
          playRoar([x, 4, z]);
          shakeCamera(0.7);
          emit('puff', [x + 2, 5, z], { count: 14, color: ['#ffffff', '#e0e0e0'], speed: 4, up: 1, size: 0.5, dir: [4, 0, 0] });
          useGame.getState().addParty(PARTY_POINTS.bonkCritter);
          earnSticker('roar');
          props.forEach((prop) => {
            if (prop.heldBy != null || !propPosition(prop, tmp)) return;
            if (tmp.distanceTo(new THREE.Vector3(x, 0, z)) < 10) prop.getBody()?.applyImpulse({ x: 0, y: 1.5, z: 0 }, true);
          });
        }
      }),
    [x, z, tmp]
  );

  useGameFrame((_, delta) => {
    roar.current = Math.max(0, roar.current - delta);
    const r = roar.current;
    if (jaw.current) jaw.current.rotation.z = r > 0 ? -0.6 : -0.05;
    if (head.current) head.current.rotation.z = r > 0 ? 0.25 + Math.sin(gameClock.time * 40) * 0.05 : Math.sin(gameClock.time * 0.8) * 0.05;
  });

  const skin = '#4caf50';
  const whole = useRef<THREE.Group>(null);
  useSeeThrough(whole, x, z, 3.5);
  return (
    <group ref={whole} position={[x, 0, z]} rotation={[0, -0.4, 0]}>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[1.5, 1.6]} position={[0, 1.5, 0]} />
        <CapsuleCollider args={[1.2, 1.3]} position={[0, 3.6, 0]} rotation={[0, 0, 1.1]} />
      </RigidBody>
      {[-0.8, 0.8].map((s) => (
        <group key={s} position={[0, 0, s]}>
          <mesh castShadow position={[0, 1.2, 0]} material={lambert(skin)}>
            <cylinderGeometry args={[0.45, 0.6, 2.4, 10]} />
          </mesh>
          <mesh castShadow position={[0.4, 0.15, 0]} material={lambert(skin)}>
            <boxGeometry args={[1.2, 0.3, 0.7]} />
          </mesh>
        </group>
      ))}
      <mesh castShadow position={[0, 3.4, 0]} rotation={[0, 0, 1.1]} material={lambert(skin)}>
        <capsuleGeometry args={[1.3, 2.2, 8, 16]} />
      </mesh>
      <mesh castShadow position={[-3, 2.2, 0]} rotation={[0, 0, 1.25]} material={lambert(skin)}>
        <coneGeometry args={[0.9, 3.8, 12]} />
      </mesh>
      {[-0.5, 0.5].map((s) => (
        <mesh key={s} position={[1.3, 3.5, s]} rotation={[0, 0, -0.8]} material={lambert(skin)}>
          <cylinderGeometry args={[0.1, 0.12, 0.8, 6]} />
        </mesh>
      ))}
      <group ref={head} position={[1.6, 5.4, 0]}>
        <mesh castShadow position={[0.8, 0.2, 0]} material={lambert(skin)}>
          <boxGeometry args={[2.2, 1.1, 1.3]} />
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s} position={[0.5, 0.75, s * 0.55]}>
            <mesh material={lambert('#ffffff')}>
              <sphereGeometry args={[0.26, 10, 8]} />
            </mesh>
            <mesh position={[0.14, 0, s * 0.12]} material={lambert('#111111')}>
              <sphereGeometry args={[0.13, 8, 6]} />
            </mesh>
          </group>
        ))}
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i} position={[0.1 + i * 0.32, -0.38, 0.55]} rotation={[Math.PI, 0, 0]} material={lambert('#ffffff')}>
            <coneGeometry args={[0.08, 0.22, 4]} />
          </mesh>
        ))}
        <group ref={jaw} position={[-0.2, -0.35, 0]}>
          <mesh castShadow position={[0.95, -0.2, 0]} material={lambert('#43a047')}>
            <boxGeometry args={[1.9, 0.35, 1.2]} />
          </mesh>
          <mesh position={[0.95, -0.02, 0]} material={lambert('#ff8fa3')}>
            <boxGeometry args={[1.7, 0.05, 1]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Egg nest: headbutt an egg and a baby dino hatches and follows you around.

function Egg({ index }: { index: number }) {
  const [nx, nz] = EGG_NEST.center;
  const a = (index / EGG_NEST.eggs) * Math.PI * 2;
  const pos = useMemo(() => new THREE.Vector3(nx + Math.cos(a) * 1.1, 0.45, nz + Math.sin(a) * 1.1), [nx, nz, a]);
  const [hatched, setHatched] = useState(false);
  const hatchedRef = useRef(false);
  const colors = ['#b9f0a8', '#bde0ff', '#ffd6e8', '#fff3a8', '#e9d5ff'];

  useEffect(
    () =>
      registerStatic({
        id: 9300 + index,
        position: pos,
        radius: 0.5,
        onBonk: (slot) => {
          if (hatchedRef.current) return;
          hatchedRef.current = true;
          setHatched(true);
          playCrack(pos);
          emit('chunk', pos, { count: 14, color: [colors[index], '#ffffff'], speed: 3, up: 5, size: 0.14 });
          emit('heart', [pos.x, pos.y + 0.8, pos.z], { count: 5, color: ['#ff8fb5', '#ff4d8d'], speed: 1, up: 2 });
          spawners.babyDino(slot, pos);
          useGame.getState().addParty(PARTY_POINTS.splat);
          earnSticker('dino');
          after(20, () => {
            hatchedRef.current = false;
            setHatched(false);
            poof(pos, colors[index], 8);
            playPoof(pos);
          });
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, pos]
  );

  // Walking into an egg hatches it too (headbutting is not required).
  useGameFrame(() => {
    if (hatchedRef.current) return;
    players.forEach((p) => {
      if (hatchedRef.current) return;
      if (distXZ(p.position.x, p.position.z, pos.x, pos.z) < 0.9 && p.position.y < 1.6) statics.get(9300 + index)?.onBonk(p.slot, pos);
    });
  });

  if (hatched) return null;
  return (
    <group position={pos}>
      <mesh castShadow scale={[1, 1.3, 1]} material={lambert(colors[index % colors.length])}>
        <sphereGeometry args={[0.36, 14, 10]} />
      </mesh>
      {[[0.2, 0.15, 0.25], [-0.25, -0.1, 0.2], [0.05, 0.3, -0.3]].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} material={lambert('#ffffff')}>
          <sphereGeometry args={[0.07, 6, 5]} />
        </mesh>
      ))}
    </group>
  );
}

function EggNest() {
  const [nx, nz] = EGG_NEST.center;
  useHint([nx, 0.8, nz], 'bonk', 4.5);
  return (
    <group>
      <mesh position={[nx, 0.2, nz]} rotation={[Math.PI / 2, 0, 0]} receiveShadow castShadow>
        <torusGeometry args={[1.7, 0.45, 8, 24]} />
        <meshLambertMaterial color="#d8b25c" />
      </mesh>
      <mesh position={[nx, 0.05, nz]} rotation={[-Math.PI / 2, 0, 0]} material={lambert('#c9a04a')}>
        <circleGeometry args={[1.8, 20]} />
      </mesh>
      {Array.from({ length: EGG_NEST.eggs }, (_, i) => (
        <Egg key={i} index={i} />
      ))}
    </group>
  );
}

export function DinoPark() {
  const [vx, vz] = VOLCANO.center;
  return (
    <group>
      <Volcano />
      <Brontosaurus />
      <TRex />
      <EggNest />
      <BabyDinos />
      <LaunchPad pad={{ position: DINO_PAD, target: [vx, CRATER_FLOOR, vz], apex: RIM + 4 }} />
    </group>
  );
}
