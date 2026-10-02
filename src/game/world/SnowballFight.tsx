import { BallCollider, CylinderCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playCrumble, playSplat, playThrow } from '../audio';
import { after, gameNow, useGameFrame } from '../clock';
import { PARTY_POINTS } from '../config';
import { emit, poof } from '../fx';
import { rumble, type SourceId } from '../input';
import { distXZ, SNOW_PILES } from '../layout';
import { lambert } from '../materials';
import { paintAnimal, SNOW_PAINT } from '../paint';
import { ballistic } from '../player/physics';
import { allocPropId, debugInfo, players, pushNoise, registerProp, statics, type PlayerRuntime, type PropEntry } from '../runtime';
import { earnSticker } from '../stickers';
import { useGame } from '../store';
import { groundHeight } from '../terrain';
import { useHint } from './common';

// Snowball fight: two snow piles with little snowballs on top. Lick one to pick it up, lick again
// to throw it. A friend it hits gets a splat, a hop and a dusting of snow (white paw prints!) that
// soon melts; a snowman, a tree or a paint bucket it hits gets it just like a headbutt. Hit the
// buddy and it throws one back. Nothing is counted: it's just for fun.

const BALL_R = 0.2;
const PER_PILE = 5;
const PILE_R = 1;
const PILE_TOP = 0.4;
/** How long a ball takes to grow back on the pile after it's thrown (ms). */
const REGROW_MS = 800;
/** A ball knocked off the pile goes back after this long (ms). */
const AWAY_MS = 6000;
/** The buddy only throws back at someone this close. */
const THROW_BACK_RANGE = 14;

type BallState = { holder: number | null; thrownBy: number | null; thrownAt: number; awaySince: number; regrowAt: number };
type Ball = { st: BallState; body: () => RapierRigidBody | null; entry: PropEntry; home: THREE.Vector3; regrow: (now: number) => void };

const balls: Ball[] = [];
/** For tests: hits so far and the buddy's throws back. */
export const snowballFight = { hits: 0, buddyThrows: 0, balls };

/** Splat: the friend hit gets snowy, hops, and (if it's the buddy) throws one back. */
function hitAnimal(p: PlayerRuntime, by: number) {
  const at = p.position;
  emit('puff', [at.x, at.y + 0.4, at.z], { count: 26, color: ['#ffffff', '#e3f0ff'], speed: 4, up: 3, size: 0.32 });
  emit('chunk', [at.x, at.y + 0.5, at.z], { count: 12, color: '#ffffff', speed: 4, up: 4, size: 0.14 });
  playSplat(at);
  playCrumble(at);
  paintAnimal(p.slot, SNOW_PAINT);
  p.hop(4.5);
  rumble(p.source as SourceId, 0.4, 0.3, 160);
  useGame.getState().addParty(PARTY_POINTS.splat);
  snowballFight.hits += 1;
  const thrower = players.get(by);
  if (thrower && !thrower.bot) {
    earnSticker('snowballfight');
    if (p.bot) after(0.9, () => throwBack(p.slot, by));
  }
}

/** The buddy got hit: a snowball appears in its mouth and off it goes, at whoever threw it. */
function throwBack(botSlot: number, targetSlot: number) {
  const bot = players.get(botSlot);
  const target = players.get(targetSlot);
  if (!bot || !target || bot.isLaunched() || distXZ(bot.position.x, bot.position.z, target.position.x, target.position.z) > THROW_BACK_RANGE) return;
  const ball = balls.find((b) => b.entry.heldBy == null && b.entry.enabled && b.st.thrownBy == null);
  const rb = ball?.body();
  if (!ball || !rb) return;
  const from = new THREE.Vector3().subVectors(target.position, bot.position).setY(0).normalize().multiplyScalar(0.7).add(bot.position);
  from.y += 0.9;
  const to = target.position.clone();
  to.y += 0.2;
  const v = new THREE.Vector3();
  ballistic(from, to, Math.max(from.y, to.y) + 1.4, v);
  rb.setTranslation(from, true);
  rb.setLinvel(v, true);
  ball.st.thrownBy = botSlot;
  ball.st.thrownAt = gameNow();
  ball.st.awaySince = -1;
  playThrow(from);
  snowballFight.buddyThrows += 1;
}

function burst(t: { x: number; y: number; z: number }, by: number | null) {
  emit('puff', [t.x, t.y, t.z], { count: 14, color: ['#ffffff', '#e3f0ff'], speed: 2.5, up: 2, size: 0.25 });
  playCrumble(t);
  if (by != null) pushNoise(new THREE.Vector3(t.x, t.y, t.z), by);
}

function ThrowBall({ home }: { home: THREE.Vector3 }) {
  const body = useRef<RapierRigidBody>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const id = useMemo(() => allocPropId(), []);
  const st = useRef<BallState>({ holder: null, thrownBy: null, thrownAt: -1e9, awaySince: -1, regrowAt: -1e9 });
  const entryRef = useRef<PropEntry | null>(null);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const resetToken = useGame((s) => s.resetToken);

  /** Back on the pile, growing again (it can't be picked up until it has). */
  const regrow = (now: number) => {
    const rb = body.current;
    if (!rb) return;
    rb.setTranslation(home, true);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    st.current.thrownBy = null;
    st.current.awaySince = -1;
    st.current.regrowAt = now;
    if (entryRef.current) entryRef.current.enabled = false;
  };

  useEffect(() => {
    const s = st.current;
    const entry: PropEntry = {
      id,
      kind: 'throwball',
      getBody: () => body.current,
      // (a little bigger than it is, so small tongues find it easily)
      radius: BALL_R + 0.15,
      launch: 9,
      heavy: false,
      grabbable: true,
      enabled: true,
      heldBy: null,
      onGrab: (slot) => {
        s.holder = slot;
        s.thrownBy = null;
      },
      onRelease: () => {
        s.thrownBy = s.holder;
        s.thrownAt = gameNow();
        s.holder = null;
      }
    };
    entryRef.current = entry;
    const ball: Ball = { st: s, body: () => body.current, entry, home, regrow };
    balls.push(ball);
    const off = registerProp(entry);
    return () => {
      off();
      balls.splice(balls.indexOf(ball), 1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const lastReset = useRef(resetToken);
  useEffect(() => {
    if (lastReset.current === resetToken) return;
    lastReset.current = resetToken;
    regrow(-1e9);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  useGameFrame(() => {
    const rb = body.current;
    const entry = entryRef.current;
    if (!rb || !entry) return;
    const s = st.current;
    const now = gameNow();
    const grown = Math.min(1, (now - s.regrowAt) / REGROW_MS);
    if (mesh.current) mesh.current.scale.setScalar(Math.max(0.01, grown));
    if (grown >= 1 && !entry.enabled) entry.enabled = true;
    if (entry.heldBy != null) {
      s.awaySince = -1;
      return;
    }
    const t = rb.translation();
    const v = rb.linvel();
    const speed = Math.hypot(v.x, v.y, v.z);
    if (s.thrownBy != null) {
      const age = now - s.thrownAt;
      if (speed > 3 && age < 2500) {
        // a friend in the way?
        for (const p of players.values()) {
          if (p.slot === s.thrownBy) continue;
          // (anywhere from its feet to just over its ears: it's a lob, and they're small)
          if (distXZ(p.position.x, p.position.z, t.x, t.z) < 0.8 && t.y > p.position.y - 0.8 && t.y < p.position.y + 1.6) {
            hitAnimal(p, s.thrownBy);
            regrow(now);
            return;
          }
        }
        // a snowman, a tree, a paint bucket...: just like a headbutt
        for (const st2 of statics.values()) {
          if (distXZ(st2.position.x, st2.position.z, t.x, t.z) < st2.radius + 0.35 && Math.abs(st2.position.y - t.y) < 2.5) {
            st2.onBonk(s.thrownBy, dir.set(v.x, 0, v.z).normalize());
            burst(t, s.thrownBy);
            regrow(now);
            return;
          }
        }
      }
      // down it comes (or into a wall): poof
      if (age > 120 && (t.y - groundHeight(t.x, t.z) < BALL_R + 0.12 || speed < 2)) {
        burst(t, s.thrownBy);
        regrow(now);
        return;
      }
    } else {
      // knocked off the pile (or dropped somewhere): back after a while
      const away = distXZ(t.x, t.z, home.x, home.z) > PILE_R + 0.3 || t.y < home.y - 1;
      if (!away) s.awaySince = -1;
      else if (s.awaySince < 0) s.awaySince = now;
      else if (now - s.awaySince > AWAY_MS) {
        poof([t.x, t.y, t.z], '#ffffff', 6);
        regrow(now);
      }
    }
    if (t.y < -5) regrow(now);
  });

  return (
    <RigidBody ref={body} position={home} colliders={false} linearDamping={0.1} angularDamping={0.6} ccd>
      <BallCollider args={[BALL_R]} density={0.4} friction={0.9} restitution={0.05} />
      <mesh ref={mesh} castShadow material={lambert('#ffffff')}>
        <icosahedronGeometry args={[BALL_R, 1]} />
      </mesh>
    </RigidBody>
  );
}

function SnowPile({ at }: { at: [number, number] }) {
  const g = groundHeight(at[0], at[1]);
  const homes = useMemo(
    () =>
      Array.from({ length: PER_PILE }, (_, i) => {
        const a = (i / PER_PILE) * Math.PI * 2;
        return new THREE.Vector3(at[0] + Math.cos(a) * 0.5, g + PILE_TOP + BALL_R + 0.02, at[1] + Math.sin(a) * 0.5);
      }),
    [at, g]
  );
  useHint([at[0], g + 1.2, at[1]], 'lick', 3);
  return (
    <group>
      <RigidBody type="fixed" colliders={false} position={[at[0], g, at[1]]}>
        <CylinderCollider args={[PILE_TOP / 2, PILE_R]} position={[0, PILE_TOP / 2, 0]} />
        <mesh receiveShadow scale={[1, 0.42, 1]} material={lambert('#f4f9ff')}>
          <sphereGeometry args={[PILE_R + 0.15, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      </RigidBody>
      {homes.map((h, i) => (
        <ThrowBall key={i} home={h} />
      ))}
    </group>
  );
}

export function SnowballFight() {
  useEffect(() => {
    debugInfo.snowballFight = snowballFight;
  }, []);
  return (
    <>
      {SNOW_PILES.map((at, i) => (
        <SnowPile key={i} at={at} />
      ))}
    </>
  );
}
