import { CylinderCollider, RigidBody, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { playBoing, playCheer, playCollect, playPoof, playSlideWhistle, playSplash } from '../audio';
import { after, gameClock, gameNow, useGameFrame } from '../clock';
import { PARTY_POINTS } from '../config';
import { makeCourse, type CoursePoint } from '../course';
import { burstConfetti, emit, poof, ring } from '../fx';
import { getInput, rumble } from '../input';
import { distXZ, SLED_RUN, TUBE_RIDE, WATER_LEVEL } from '../layout';
import { lambert, stripeTexture } from '../materials';
import { canBoard, debugInfo, players, rider, type PlayerRuntime, type Surface } from '../runtime';
import { earnSticker } from '../stickers';
import { useSledding } from '../sledding';
import { useGame } from '../store';
import { ballistic } from '../player/physics';
import { getStarGeometry, getStarMaterial } from './Stars';
import { groundHeight } from '../terrain';
import { StaticBox, useHint } from './common';
import { useSurface } from './surface';
import { randomStream } from '../rng';

const random = randomStream('rides');

// Rides on the new ground: rubber rings down the river, and sleds down the mountain.

// ---------------------------------------------------------------------------
// River tubing

export const TUBE_COURSE = makeCourse(TUBE_RIDE.course);
/** Where the tube at the jetty waits, and where the ride ends (distances along the course). */
export const TUBE_BOARD = TUBE_COURSE.sAtZ(TUBE_RIDE.jettyZ);
export const TUBE_END = TUBE_COURSE.sAtZ(TUBE_RIDE.takeOutZ);
/** Space between the tubes waiting in line. */
const GAP = 2.5;
/** The top of a tube, where riders stand. */
const TOP = WATER_LEVEL + 0.27;

type TubeMode = 'wait' | 'ride' | 'sink';
type TubeState = {
  mode: TubeMode;
  s: number;
  speed: number;
  /** Seconds somebody has been standing on it (at the jetty). */
  aboard: number;
  sink: number;
  yaw: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  w: number;
};

const TUBE_COLORS = ['#ff4d5e', '#3b82f6', '#ffd23f'];

/** Is this animal standing (or sitting, or flopped) on this tube? */
function onTube(p: PlayerRuntime, t: TubeState) {
  return !p.isLaunched() && distXZ(p.position.x, p.position.z, t.x, t.z) < TUBE_RIDE.radius + 0.1 && p.position.y > t.y - 0.1 && p.position.y < t.y + 1.8;
}

function Tube({ index, tubes }: { index: number; tubes: MutableRefObject<TubeState[]> }) {
  const body = useRef<RapierRigidBody>(null);
  const col = useRef<RapierCollider>(null);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const euler = useMemo(() => new THREE.Euler(), []);
  const surface = useMemo<Surface>(
    () => ({
      velocityAt: (p, out) => {
        const t = tubes.current[index];
        return out.set(t.vx + t.w * (p.z - t.z), t.vy, t.vz - t.w * (p.x - t.x));
      }
    }),
    [tubes, index]
  );
  useSurface(col, surface);
  const ring = useMemo(() => new THREE.MeshLambertMaterial({ map: stripeTexture(`tube${index}`, [TUBE_COLORS[index % 3], '#ffffff', TUBE_COLORS[index % 3], '#ffffff', TUBE_COLORS[index % 3], '#ffffff']) }), [index]);
  const start = tubes.current[index];
  useGameFrame(() => {
    const t = tubes.current[index];
    const rb = body.current;
    if (!rb) return;
    rb.setNextKinematicTranslation({ x: t.x, y: t.y - 0.15, z: t.z });
    rb.setNextKinematicRotation(q.setFromEuler(euler.set(0, t.yaw, 0)));
  });
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[start.x, start.y - 0.15, start.z]}>
      <CylinderCollider ref={col} args={[0.15, TUBE_RIDE.radius]} friction={1} />
      <mesh castShadow receiveShadow position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={ring}>
        <torusGeometry args={[0.76, 0.3, 12, 28]} />
      </mesh>
      <mesh receiveShadow position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]} material={lambert('#bfe9ff')}>
        <circleGeometry args={[0.78, 24]} />
      </mesh>
    </RigidBody>
  );
}

/** The jetty the tubes wait at: a wooden boardwalk out from the west bank. */
function Jetty({ end }: { end: number }) {
  const from = TUBE_RIDE.jettyFrom;
  const z = TUBE_RIDE.jettyZ;
  useHint([end - 0.6, 0.6, z], 'walk', 4);
  return (
    <group>
      <StaticBox position={[(from + end) / 2, 0, z]} size={[end - from, 0.3, 1.8]} color="#a1887f" />
      {[from + 2.5, end - 0.3].map((x) =>
        [-0.75, 0.75].map((dz) => (
          <mesh key={`${x}${dz}`} castShadow position={[x, -0.4, z + dz]} material={lambert('#6d4c41')}>
            <cylinderGeometry args={[0.1, 0.12, 0.9, 8]} />
          </mesh>
        ))
      )}
    </group>
  );
}

export function TubeRide() {
  const p = useMemo<CoursePoint>(() => ({ x: 0, z: 0, dx: 0, dz: 1 }), []);
  const tubes = useRef<TubeState[]>(
    Array.from({ length: TUBE_RIDE.count }, (_, i) => {
      const at = TUBE_COURSE.at(TUBE_BOARD - GAP * i);
      return { mode: 'wait' as TubeMode, s: TUBE_BOARD - GAP * i, speed: 0, aboard: 0, sink: 0, yaw: i, x: at.x, y: TOP, z: at.z, vx: 0, vy: 0, vz: 0, w: 0 };
    })
  );
  const jettyEnd = useMemo(() => TUBE_COURSE.at(TUBE_BOARD).x - TUBE_RIDE.radius - 0.15, []);
  debugInfo.tubes = tubes.current;
  const landing = useMemo(() => new THREE.Vector3(), []);

  useGameFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const time = gameClock.time;
    const list = tubes.current;
    // the line at the jetty: the front one waits at the jetty, the others behind it
    const waiting = list.filter((t) => t.mode === 'wait').sort((a, b) => b.s - a.s);
    const clearAhead = !list.some((t) => t.mode === 'ride' && t.s < TUBE_BOARD + 5);
    waiting.forEach((t, k) => {
      const target = TUBE_BOARD - GAP * k;
      t.s += Math.max(-1.2 * dt, Math.min(1.2 * dt, target - t.s));
      if (k > 0 || Math.abs(t.s - TUBE_BOARD) > 0.05) {
        t.aboard = 0;
        return;
      }
      let someone = false;
      players.forEach((pl) => {
        if (onTube(pl, t)) someone = true;
      });
      t.aboard = someone ? t.aboard + dt : 0;
      if (t.aboard > 0.5 && clearAhead) {
        t.mode = 'ride';
        t.speed = 0;
        playSplash([t.x, t.y, t.z], false);
      }
    });
    list.forEach((t, i) => {
      const px = t.x;
      const py = t.y;
      const pz = t.z;
      let lateral = 0;
      if (t.mode === 'ride') {
        // off it floats, speeding up gently, slowing down again at the take-out
        const left = TUBE_END - t.s;
        t.speed = Math.min(TUBE_RIDE.speed, t.speed + dt * 1.2, 0.5 + left * 0.9);
        t.s += t.speed * dt;
        lateral = Math.sin(time * 0.9 + i * 2.1) * 0.45 * Math.min(1, (t.s - TUBE_BOARD) / 3);
        t.w = 0.45;
        if (t.s >= TUBE_END - 0.05) {
          // the take-out: everybody on it is tipped out onto the bank, wheee
          let n = 0;
          players.forEach((pl) => {
            if (!onTube(pl, t)) return;
            landing.set(TUBE_RIDE.landing[0] - (n % 2) * 1.2, 0, TUBE_RIDE.landing[1] + (n - 1) * 1.1);
            landing.y = groundHeight(landing.x, landing.z);
            pl.launchTo(landing, t.y + 3);
            earnSticker('tube');
            n += 1;
          });
          ring([t.x, WATER_LEVEL + 0.05, t.z], { color: '#e0f6ff', radius: 2, duration: 0.6 });
          t.mode = 'sink';
          t.sink = 0;
        }
      } else if (t.mode === 'sink') {
        // it bobs under and pops up again at the back of the line
        t.sink += dt;
        t.w = 1.5;
        if (t.sink > 0.7) {
          const behind = list.filter((o) => o.mode === 'wait').length;
          t.mode = 'wait';
          t.s = Math.min(TUBE_BOARD - GAP * behind, TUBE_BOARD - GAP);
          t.speed = 0;
          TUBE_COURSE.at(t.s, p);
          poof([p.x, TOP + 0.3, p.z], '#e0f6ff', 10);
          playPoof([p.x, TOP, p.z]);
        }
      } else t.w = 0.12;
      TUBE_COURSE.at(t.s, p);
      t.x = p.x + p.dz * lateral;
      t.z = p.z - p.dx * lateral;
      t.y = t.mode === 'sink' ? TOP - Math.min(1, t.sink * 1.6) : TOP + Math.sin(time * 2 + i * 1.7) * (t.mode === 'ride' ? 0.04 : 0.015);
      t.yaw += t.w * dt;
      if (dt > 0) {
        t.vx = (t.x - px) / dt;
        t.vy = (t.y - py) / dt;
        t.vz = (t.z - pz) / dt;
      }
      // a few ripples behind a moving tube
      if (t.mode === 'ride' && random() < dt * 3) ring([t.x - p.dx * 1.1, WATER_LEVEL + 0.04, t.z - p.dz * 1.1], { color: '#e0f6ff', radius: 1.2, duration: 0.8 });
    });
  });

  return (
    <group>
      <Jetty end={jettyEnd} />
      {tubes.current.map((_, i) => (
        <Tube key={i} index={i} tubes={tubes} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Sledding

const SLED_GRAVITY = 12;
const SLED_FRICTION = 1;
/** Top speed; every hoop you go through this run adds one. */
const SLED_MAX = 10;
/** A jump pressed this long before the kick counts as jumping off the hill (ms). */
const KICK_JUMP = 450;
/** When each hoop was last gone through (game ms), for its flash. */
const hoopFlash = SLED_RUN.hoops.map(() => -1e9);
/** Downhill is west (-x): an animal on a sled faces that way. */
const SLED_FACING = -Math.PI / 2;

type SledMode = 'park' | 'ride' | 'away';
type SledState = {
  mode: SledMode;
  x: number;
  z: number;
  y: number;
  v: number;
  pitch: number;
  rider: number | null;
  timer: number;
  /** This run: which hoops you went through, and when jump was last pressed. */
  hoops: boolean[];
  jumpAt: number;
};

function SledModel() {
  const wood = lambert('#ff4d5e');
  const runner = lambert('#ffd23f');
  return (
    <group>
      <mesh castShadow position={[0, 0.22, 0]} material={wood}>
        <boxGeometry args={[0.9, 0.1, 1.6]} />
      </mesh>
      {[-0.38, 0.38].map((x) => (
        <group key={x}>
          <mesh castShadow position={[x, 0.07, -0.05]} material={runner}>
            <boxGeometry args={[0.08, 0.06, 1.7]} />
          </mesh>
          <mesh castShadow position={[x, 0.22, 0.86]} rotation={[0.9, 0, 0]} material={runner}>
            <boxGeometry args={[0.08, 0.06, 0.42]} />
          </mesh>
          {[-0.5, 0.35].map((z) => (
            <mesh key={z} position={[x, 0.14, z]} material={runner}>
              <boxGeometry args={[0.06, 0.12, 0.06]} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh castShadow position={[0, 0.34, -0.72]} material={wood}>
        <boxGeometry args={[0.9, 0.18, 0.08]} />
      </mesh>
    </group>
  );
}

function Sled({ index }: { index: number }) {
  const [sx, sz] = SLED_RUN.starts[index];
  const group = useRef<THREE.Group>(null);
  const st = useRef<SledState>({ mode: 'park', x: sx, z: sz, y: groundHeight(sx, sz), v: 0, pitch: 0, rider: null, timer: 0, hoops: SLED_RUN.hoops.map(() => false), jumpAt: -1e9 });
  const fly = useMemo(() => new THREE.Vector3(), []);
  const seat = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  ((debugInfo.sleds ??= []) as SledState[])[index] = st.current;
  useHint([sx, groundHeight(sx, sz) + 0.6, sz], 'walk', 3);

  const park = (s: SledState) => {
    s.mode = 'park';
    s.x = sx;
    s.z = sz;
    s.v = 0;
    s.y = groundHeight(sx, sz);
    s.pitch = 0;
    poof([sx, s.y + 0.4, sz], '#ffffff', 12);
    playPoof([sx, s.y, sz]);
  };
  const away = (s: SledState) => {
    s.mode = 'away';
    s.timer = 2.5;
    s.rider = null;
    poof([s.x, s.y + 0.4, s.z], '#ffffff', 12);
  };

  useGameFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const s = st.current;
    if (s.mode === 'away') {
      s.timer -= dt;
      if (s.timer <= 0) park(s);
    } else if (s.mode === 'park') {
      // walk into it: sit down and off you go
      players.forEach((p) => {
        if (s.rider != null || !canBoard(p)) return;
        if (distXZ(p.position.x, p.position.z, s.x, s.z) > 1.0 || p.position.y < s.y || p.position.y > s.y + 2) return;
        s.rider = p.slot;
        s.mode = 'ride';
        s.v = 5;
        s.hoops = SLED_RUN.hoops.map(() => false);
        s.jumpAt = -1e9;
        playSlideWhistle('down', p.position);
      });
    } else {
      const p = rider(s.rider);
      if (!p) {
        away(s);
      } else {
        // faster downhill, slower uphill, a little friction; steer to the sides with the stick
        const slope = (groundHeight(s.x + 0.6, s.z) - groundHeight(s.x - 0.6, s.z)) / 1.2;
        const through = s.hoops.filter(Boolean).length;
        s.v = Math.max(0, Math.min(SLED_MAX + through, s.v + (SLED_GRAVITY * slope - SLED_FRICTION) * dt));
        const input = p.bot ? null : getInput(p.source as Parameters<typeof getInput>[0]);
        const steer = input?.z ?? 0;
        if (input?.pressed.jump) s.jumpAt = gameNow();
        const prevX = s.x;
        s.x -= s.v * dt;
        // through a star hoop: ting! and a push
        SLED_RUN.hoops.forEach(([hx, hz], i) => {
          if (s.hoops[i] || prevX < hx || s.x > hx || Math.abs(s.z - hz) > 1) return;
          s.hoops[i] = true;
          s.v = Math.min(SLED_MAX + through + 1, s.v + 2);
          hoopFlash[i] = gameNow();
          const hy = groundHeight(hx, hz) + HOOP_HEIGHT;
          emit('star', [hx, hy, hz], { count: 24, color: ['#ffd23f', '#fff3a8', '#ffffff'], speed: 5, up: 3 });
          playCollect([hx, hy, hz]);
          rumble(p.source as Parameters<typeof rumble>[0], 0.4, 0.6, 150);
        });
        s.z = THREE.MathUtils.clamp(s.z + steer * 3 * dt, sz - SLED_RUN.laneHalfWidth, sz + SLED_RUN.laneHalfWidth);
        s.y = groundHeight(s.x, s.z);
        s.pitch = Math.atan(slope);
        seat.set(s.x, s.y + 0.8, s.z);
        p.hold(seat, false, SLED_FACING);
        if (s.v > 4 && random() < dt * 20) emit('puff', [s.x + 0.8, s.y + 0.1, s.z], { count: 1, color: s.y > 7 ? '#ffffff' : '#e8e0d0', size: 0.3, speed: 0.6, up: 0.8, life: 0.8 });
        if (s.x <= SLED_RUN.kickX) {
          // up the hill and WHEEE, off you fly: the faster you were going, the further (and
          // further still with a jump right at the top)
          const jumped = gameNow() - s.jumpAt < KICK_JUMP;
          const x = Math.max(SLED_RUN.furthestX, SLED_RUN.kickX - SLED_RUN.flyPerSpeed * s.v - (jumped ? SLED_RUN.jumpBonus : 0));
          p.hold(null);
          target.set(x, 0, s.z);
          target.y = groundHeight(target.x, target.z);
          const apex = s.y + 5 + (jumped ? 1.5 : 0);
          p.launchTo(target, apex);
          earnSticker('sled');
          if (s.hoops.every(Boolean)) earnSticker('hoops');
          emit('confetti', seat, { count: 24, speed: 4, up: 5 });
          if (jumped) {
            emit('star', seat, { count: 30, color: ['#ffd23f', '#ffffff', '#ff8fd8'], speed: 6, up: 4 });
            playBoing(seat, 1.3);
          }
          // where it lands: a new record moves the golden flag
          const flight = ballistic(seat, target, apex, fly);
          const slot = p.slot;
          after(flight, () => landed(x, target.z, slot));
          away(s);
        } else if (s.v < 0.3 && s.x < sx - 3) {
          // stuck (it can't happen on the run, but just in case): hop off
          p.hold(null);
          p.hop(6);
          away(s);
        }
      }
    }
    const g = group.current;
    if (g) {
      g.visible = s.mode !== 'away';
      g.position.set(s.x, s.y, s.z);
      g.rotation.set(s.pitch, SLED_FACING, 0, 'YXZ');
    }
  });

  return (
    <group ref={group} position={[sx, groundHeight(sx, sz), sz]}>
      <SledModel />
    </group>
  );
}

/** A sled flight landed at x: past the red line is the far-flying sticker, a record moves the golden flag. */
function landed(x: number, z: number, slot: number) {
  const record = useSledding.getState().land(x, gameNow());
  const y = groundHeight(x, z);
  ring([x, y + 0.08, z], { color: '#ffffff', radius: 2.2, duration: 0.5 });
  const markers = SLED_RUN.markers;
  if (x <= markers[markers.length - 1]) earnSticker('farfly');
  if (!record) return;
  const [fz0] = SLED_RUN.fieldZ;
  burstConfetti([x, groundHeight(x, fz0) + 2.5, fz0], 60);
  playCheer();
  useGame.getState().addParty(PARTY_POINTS.goal);
  const p = players.get(slot);
  p?.hop(8);
}

/** Height of the hoops' middle above the ground (where a rider on a sled is). */
const HOOP_HEIGHT = 1.15;
const HOOP_RADIUS = 1.25;

/** Three rings of stars floating over the sled run: steer through them. */
function SledHoops() {
  const rings = useRef<(THREE.Group | null)[]>([]);
  useGameFrame(() => {
    const now = gameNow();
    rings.current.forEach((g, i) => {
      if (!g) return;
      const since = (now - hoopFlash[i]) / 1000;
      const pop = since < 0.5 ? 1 + Math.sin(since * Math.PI * 2) * 0.35 * (1 - since * 2) : 1;
      g.scale.setScalar(pop);
      g.rotation.z = gameClock.time * 0.8 + i;
    });
  });
  return (
    <>
      {SLED_RUN.hoops.map(([x, z], i) => (
        // half turned towards the camera (facing straight up the run, it would be seen edge-on)
        <group key={i} position={[x, groundHeight(x, z) + HOOP_HEIGHT, z]} rotation={[0, Math.PI / 4, 0]}>
          <group ref={(g) => { rings.current[i] = g; }}>
            <mesh material={lambert('#ffd23f')}>
              <torusGeometry args={[HOOP_RADIUS, 0.09, 8, 36]} />
            </mesh>
            {Array.from({ length: 8 }, (_, k) => {
              const a = (k / 8) * Math.PI * 2;
              return (
                <mesh key={k} position={[Math.cos(a) * HOOP_RADIUS, Math.sin(a) * HOOP_RADIUS, 0]} geometry={getStarGeometry()} material={getStarMaterial()} scale={0.32} />
              );
            })}
          </group>
        </group>
      ))}
    </>
  );
}

/** The landing field: green, yellow and red lines across the grass, and a golden flag at the record. */
function LandingField() {
  const best = useSledding((s) => s.best);
  const [z0, z1] = SLED_RUN.fieldZ;
  const colors = ['#22c55e', '#ffd23f', '#ef4444'];
  const flag = useRef<THREE.Mesh>(null);
  useGameFrame(() => {
    if (flag.current) flag.current.rotation.y = Math.sin(gameClock.time * 3) * 0.3;
  });
  return (
    <>
      {SLED_RUN.markers.map((x, i) => (
        <group key={x}>
          {/* a line of little painted dashes (they follow the ground) */}
          {Array.from({ length: Math.round(z1 - z0) + 1 }, (_, k) => {
            const z = z0 + k;
            return (
              <mesh key={k} position={[x, groundHeight(x, z) + 0.03, z]} rotation={[-Math.PI / 2, 0, 0]} material={lambert(colors[i])}>
                <planeGeometry args={[0.3, 0.7]} />
              </mesh>
            );
          })}
          {/* and a flag at the end nearest the camera */}
          <group position={[x, groundHeight(x, z1 + 0.6), z1 + 0.6]}>
            <mesh position={[0, 0.7, 0]} material={lambert('#e2e8f0')}>
              <cylinderGeometry args={[0.04, 0.04, 1.4, 6]} />
            </mesh>
            <mesh position={[0.28, 1.22, 0]} material={lambert(colors[i])}>
              <boxGeometry args={[0.55, 0.35, 0.03]} />
            </mesh>
          </group>
        </group>
      ))}
      {best != null && (
        <group position={[best, groundHeight(best, z0 - 0.6), z0 - 0.6]}>
          <mesh position={[0, 1.1, 0]} material={lambert('#e2e8f0')}>
            <cylinderGeometry args={[0.05, 0.05, 2.2, 6]} />
          </mesh>
          <mesh ref={flag} position={[0.35, 1.9, 0]} material={lambert('#ffd23f')}>
            <boxGeometry args={[0.7, 0.45, 0.04]} />
          </mesh>
          <mesh position={[0, 2.3, 0]} geometry={getStarGeometry()} material={getStarMaterial()} scale={0.4} />
        </group>
      )}
    </>
  );
}

export function Sleds() {
  return (
    <>
      {SLED_RUN.starts.map((_, i) => (
        <Sled key={i} index={i} />
      ))}
      <SledHoops />
      <LandingField />
    </>
  );
}
