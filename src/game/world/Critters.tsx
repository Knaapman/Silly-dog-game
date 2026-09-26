import { BallCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { playCheep, playMoo, playPoof } from '../audio';
import { emit, poof } from '../fx';
import { distXZ, PASTURE, type Vec3 } from '../layout';
import { lambert } from '../materials';
import { allocPropId, players, registerProp, spawners, type PropEntry } from '../runtime';
import { useGame } from '../store';
import { gameClock, gameNow, useGameFrame } from '../clock';

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function GooglyEye({ x, y, z, r }: { x: number; y: number; z: number; r: number }) {
  return (
    <group position={[x, y, z]}>
      <mesh material={lambert('#ffffff')}>
        <sphereGeometry args={[r, 10, 8]} />
      </mesh>
      <mesh position={[0, -r * 0.15, r * 0.75]} material={lambert('#111111')}>
        <sphereGeometry args={[r * 0.5, 8, 6]} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Cows: wander the pasture, moo, and tip over when headbutted (then get back up).

const COW_RADIUS = 0.75;

function Cow({ index }: { index: number }) {
  const body = useRef<RapierRigidBody>(null);
  const yaw = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const legs = useRef<(THREE.Group | null)[]>([]);
  const tail = useRef<THREE.Group>(null);
  const id = useMemo(() => allocPropId(), []);
  const home = useMemo(
    () => new THREE.Vector3(PASTURE.center[0] - 3 + index * 3, COW_RADIUS + 0.1, PASTURE.center[1] + (index % 2 ? 1.5 : -1.5)),
    [index]
  );
  const s = useRef({ mode: 'graze' as 'graze' | 'walk' | 'tipped' | 'held', timer: 2 + index, facing: index * 2, target: home.clone(), walk: 0, mooIn: 4 + index * 3 });
  const entryRef = useRef<PropEntry | null>(null);
  const resetToken = useGame((st) => st.resetToken);

  const tip = () => {
    const rb = body.current;
    if (!rb) return;
    s.current.mode = 'tipped';
    s.current.timer = 3.5;
    rb.setEnabledRotations(true, true, true, true);
    const f = s.current.facing;
    rb.setAngvel({ x: Math.cos(f) * 7, y: 0, z: -Math.sin(f) * 7 }, true);
    playMoo(rb.translation());
  };

  useEffect(() => {
    const entry: PropEntry = {
      id,
      kind: 'cow',
      getBody: () => body.current,
      radius: COW_RADIUS,
      launch: 7,
      heavy: true,
      grabbable: true,
      enabled: true,
      heldBy: null,
      onBonk: () => tip(),
      onGrab: () => {
        s.current.mode = 'held';
        playMoo(body.current?.translation());
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
    const rb = body.current;
    if (!rb) return;
    rb.setEnabledRotations(false, false, false, true);
    rb.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    rb.setTranslation(home, true);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    s.current.mode = 'graze';
  }, [resetToken, home]);

  useGameFrame((_, delta) => {
    const rb = body.current;
    const entry = entryRef.current;
    if (!rb || !entry) return;
    const dt = Math.min(delta, 0.05);
    const c = s.current;
    const t = rb.translation();
    const v = rb.linvel();
    const time = gameClock.time + index * 3;
    c.timer -= dt;
    if (entry.heldBy != null) c.mode = 'held';
    else if (c.mode === 'held') c.mode = 'graze';
    if (t.y < -5) rb.setTranslation(home, true);

    if (c.mode === 'tipped') {
      if (c.timer <= 0 && Math.hypot(v.x, v.y, v.z) < 1.5) {
        rb.setEnabledRotations(false, false, false, true);
        rb.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
        rb.setLinvel({ x: 0, y: 5, z: 0 }, true);
        poof([t.x, t.y, t.z], '#ffffff', 10);
        playMoo(t);
        c.mode = 'graze';
        c.timer = 2;
      }
    } else if (c.mode !== 'held') {
      let speed = 0;
      if (c.mode === 'graze') {
        if (c.timer <= 0) {
          c.mode = 'walk';
          c.timer = 6;
          c.target.set(
            PASTURE.center[0] + (Math.random() - 0.5) * (PASTURE.size[0] - 3),
            0,
            PASTURE.center[1] + (Math.random() - 0.5) * (PASTURE.size[1] - 3)
          );
        }
      } else {
        const d = distXZ(t.x, t.z, c.target.x, c.target.z);
        if (d < 0.8 || c.timer <= 0) {
          c.mode = 'graze';
          c.timer = 3 + Math.random() * 4;
        } else {
          c.facing = lerpAngle(c.facing, Math.atan2(c.target.x - t.x, c.target.z - t.z), 1 - Math.exp(-3 * dt));
          speed = 1.1;
        }
      }
      const k = 1 - Math.exp(-4 * dt);
      rb.setLinvel({ x: v.x + (Math.sin(c.facing) * speed - v.x) * k, y: v.y, z: v.z + (Math.cos(c.facing) * speed - v.z) * k }, true);
      c.mooIn -= dt;
      if (c.mooIn <= 0) {
        c.mooIn = 8 + Math.random() * 10;
        playMoo(t);
      }
    }

    const hs = Math.hypot(v.x, v.z);
    c.walk += hs * dt * 3;
    if (yaw.current && c.mode !== 'tipped') yaw.current.rotation.y = c.facing;
    if (head.current) head.current.rotation.x = c.mode === 'graze' ? 0.7 + Math.sin(time * 3) * 0.08 : Math.sin(c.walk) * 0.08;
    if (tail.current) tail.current.rotation.z = Math.sin(time * 3) * 0.4;
    legs.current.forEach((l, i) => {
      if (l) l.rotation.x = c.mode === 'tipped' ? Math.sin(time * 18 + i) * 0.8 : hs > 0.2 ? Math.sin(c.walk + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.5 : 0;
    });
  });

  const spot = '#2b2b2b';
  return (
    <RigidBody ref={body} position={[home.x, home.y, home.z]} colliders={false} enabledRotations={[false, false, false]} linearDamping={0.4} angularDamping={0.8}>
      <BallCollider args={[COW_RADIUS]} density={1.4} friction={0.6} restitution={0.1} />
      <group ref={yaw} position={[0, -COW_RADIUS, 0]}>
        <mesh castShadow position={[0, 1.05, 0]} material={lambert('#ffffff')}>
          <boxGeometry args={[1.0, 0.8, 1.7]} />
        </mesh>
        {[[0.51, 1.1, 0.2, 0.3], [-0.51, 1.0, -0.4, 0.35], [0.2, 1.46, -0.3, 0.28], [-0.3, 1.46, 0.4, 0.22]].map(([x, y, z, r], i) => (
          <mesh key={i} position={[x, y, z]} scale={[0.2, 1, 1]} material={lambert(spot)}>
            <sphereGeometry args={[r, 10, 8]} />
          </mesh>
        ))}
        <mesh position={[0, 0.6, -0.2]} material={lambert('#ffb3c6')}>
          <sphereGeometry args={[0.2, 10, 8]} />
        </mesh>
        <group ref={head} position={[0, 1.35, 0.9]}>
          <mesh castShadow position={[0, 0, 0.25]} material={lambert('#ffffff')}>
            <boxGeometry args={[0.6, 0.55, 0.6]} />
          </mesh>
          <mesh position={[0, -0.12, 0.58]} material={lambert('#ffb3c6')}>
            <boxGeometry args={[0.55, 0.3, 0.2]} />
          </mesh>
          {[-1, 1].map((sx) => (
            <mesh key={`h${sx}`} position={[sx * 0.22, 0.35, 0.2]} rotation={[0, 0, sx * -0.4]} material={lambert('#f5e6c8')}>
              <coneGeometry args={[0.06, 0.25, 6]} />
            </mesh>
          ))}
          {[-1, 1].map((sx) => (
            <mesh key={`e${sx}`} position={[sx * 0.4, 0.15, 0.2]} scale={[1, 0.4, 0.7]} material={lambert(spot)}>
              <sphereGeometry args={[0.16, 8, 6]} />
            </mesh>
          ))}
          <GooglyEye x={-0.16} y={0.12} z={0.56} r={0.09} />
          <GooglyEye x={0.16} y={0.12} z={0.56} r={0.09} />
        </group>
        <group ref={tail} position={[0, 1.3, -0.86]}>
          <mesh position={[0, -0.3, 0]} material={lambert('#ffffff')}>
            <cylinderGeometry args={[0.04, 0.04, 0.6, 5]} />
          </mesh>
          <mesh position={[0, -0.62, 0]} material={lambert(spot)}>
            <sphereGeometry args={[0.08, 6, 5]} />
          </mesh>
        </group>
        {[[-0.35, 0.6], [0.35, 0.6], [-0.35, -0.6], [0.35, -0.6]].map(([x, z], i) => (
          <group
            key={i}
            position={[x, 0.7, z]}
            ref={(g) => {
              legs.current[i] = g;
            }}
          >
            <mesh position={[0, -0.35, 0]} material={lambert('#ffffff')}>
              <cylinderGeometry args={[0.1, 0.09, 0.7, 8]} />
            </mesh>
            <mesh position={[0, -0.68, 0]} material={lambert(spot)}>
              <cylinderGeometry args={[0.1, 0.1, 0.1, 8]} />
            </mesh>
          </group>
        ))}
      </group>
    </RigidBody>
  );
}

export function Cows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <Cow key={i} index={i} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Baby dinosaurs: hatch from eggs and follow whoever hatched them, copying their jumps
// and answering their noises with a little cheep.

const DINO_COLORS = ['#7ed957', '#5ec8f2', '#ff9ecb', '#ffb020', '#b388ff'];
const DINO_RADIUS = 0.32;

type DinoInfo = { id: number; owner: number; color: string; start: Vec3; order: number };

function BabyDino({ info, onGone }: { info: DinoInfo; onGone: (id: number) => void }) {
  const body = useRef<RapierRigidBody>(null);
  const yaw = useRef<THREE.Group>(null);
  const legs = useRef<(THREE.Group | null)[]>([]);
  const tail = useRef<THREE.Group>(null);
  const id = useMemo(() => allocPropId(), []);
  const s = useRef({ facing: 0, walk: 0, lastJump: 0, lastNoise: 0, hopAt: 0, cheepAt: 0, lostFor: 0, orphanFor: 0, tumble: 0, gone: false });
  const entryRef = useRef<PropEntry | null>(null);
  const target = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const entry: PropEntry = {
      id,
      kind: 'dino',
      getBody: () => body.current,
      radius: 0.4,
      launch: 12,
      heavy: false,
      grabbable: true,
      enabled: true,
      heldBy: null,
      onBonk: () => {
        s.current.tumble = 1.2;
        body.current?.setEnabledRotations(true, true, true, true);
        playCheep(body.current?.translation());
      },
      onGrab: () => playCheep(body.current?.translation())
    };
    entryRef.current = entry;
    return registerProp(entry);
  }, [id]);

  useGameFrame((_, delta) => {
    const rb = body.current;
    const entry = entryRef.current;
    const c = s.current;
    if (!rb || !entry || c.gone) return;
    const dt = Math.min(delta, 0.05);
    const now = gameNow();
    const t = rb.translation();
    const v = rb.linvel();
    const owner = players.get(info.owner);

    if (c.tumble > 0) {
      c.tumble -= dt;
      if (c.tumble <= 0) {
        rb.setEnabledRotations(false, false, false, true);
        rb.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
    } else if (entry.heldBy == null) {
      let vx = 0;
      let vz = 0;
      let vy = v.y;
      if (owner) {
        c.orphanFor = 0;
        const f = owner.facing;
        const back = 1.4 + info.order * 1.1;
        target.set(owner.position.x - Math.sin(f) * back, 0, owner.position.z - Math.cos(f) * back);
        const d = distXZ(t.x, t.z, target.x, target.z);
        // Too far behind (owner flew off on a launch pad)? Catch up with a poof once they land.
        c.lostFor = d > 22 ? c.lostFor + dt : 0;
        if (c.lostFor > 1.2 && !owner.isLaunched()) {
          c.lostFor = 0;
          rb.setTranslation({ x: target.x, y: owner.position.y + 1, z: target.z }, true);
          rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
          poof([target.x, owner.position.y + 1, target.z], info.color, 10);
          playPoof(target);
        }
        if (d > 0.6) {
          const speed = Math.min(10.5, 2 + d * 2.2);
          vx = ((target.x - t.x) / d) * speed;
          vz = ((target.z - t.z) / d) * speed;
          c.facing = lerpAngle(c.facing, Math.atan2(vx, vz), 1 - Math.exp(-10 * dt));
        } else {
          c.facing = lerpAngle(c.facing, f, 1 - Math.exp(-5 * dt));
        }
        // copy the owner's jumps (a little after them, like ducklings)
        if (owner.jumpedAt > c.lastJump) {
          c.lastJump = owner.jumpedAt;
          c.hopAt = now + 120 + info.order * 140;
        }
        if (owner.noiseAt > c.lastNoise) {
          c.lastNoise = owner.noiseAt;
          c.cheepAt = now + 200 + info.order * 160;
        }
      } else {
        // owner left the game: wander a bit, then poof away
        c.orphanFor += dt;
        if (c.orphanFor > 15) {
          c.gone = true;
          poof([t.x, t.y, t.z], info.color, 12);
          onGone(info.id);
          return;
        }
      }
      if (c.hopAt > 0 && now > c.hopAt && t.y < 1.5) {
        c.hopAt = 0;
        vy = 8;
        playCheep(t);
      }
      if (c.cheepAt > 0 && now > c.cheepAt) {
        c.cheepAt = 0;
        playCheep(t);
        emit('heart', [t.x, t.y + 0.8, t.z], { count: 2, color: ['#ff8fb5'], speed: 0.8, up: 1.5, size: 0.2 });
      }
      const k = 1 - Math.exp(-10 * dt);
      rb.setLinvel({ x: v.x + (vx - v.x) * k, y: vy, z: v.z + (vz - v.z) * k }, true);
    }
    if (t.y < -5) rb.setTranslation({ x: info.start[0], y: 2, z: info.start[2] }, true);

    const hs = Math.hypot(v.x, v.z);
    c.walk += hs * dt * 4;
    if (yaw.current && c.tumble <= 0) yaw.current.rotation.y = c.facing;
    if (tail.current) tail.current.rotation.y = Math.sin(gameClock.time * 8 + info.id) * 0.5;
    legs.current.forEach((l, i) => {
      if (l) l.rotation.x = hs > 0.3 ? Math.sin(c.walk + i * Math.PI) * 0.8 : 0;
    });
  });

  const col = info.color;
  return (
    <RigidBody ref={body} position={info.start} colliders={false} enabledRotations={[false, false, false]} linearDamping={0.2} angularDamping={0.6}>
      <BallCollider args={[DINO_RADIUS]} density={0.6} friction={0.4} restitution={0.2} />
      <group ref={yaw} position={[0, -DINO_RADIUS, 0]}>
        <mesh castShadow position={[0, 0.38, 0]} scale={[0.9, 0.85, 1.1]} material={lambert(col)}>
          <sphereGeometry args={[0.3, 12, 10]} />
        </mesh>
        <mesh position={[0, 0.3, 0.12]} scale={[0.7, 0.7, 0.8]} material={lambert('#fff3c4')}>
          <sphereGeometry args={[0.26, 10, 8]} />
        </mesh>
        <mesh castShadow position={[0, 0.78, 0.22]} material={lambert(col)}>
          <sphereGeometry args={[0.28, 12, 10]} />
        </mesh>
        <mesh position={[0, 0.7, 0.44]} scale={[1, 0.7, 1]} material={lambert(col)}>
          <sphereGeometry args={[0.17, 10, 8]} />
        </mesh>
        <GooglyEye x={-0.12} y={0.88} z={0.42} r={0.085} />
        <GooglyEye x={0.12} y={0.88} z={0.42} r={0.085} />
        {[0.95, 0.72, 0.5].map((y, i) => (
          <mesh key={i} position={[0, y + 0.08, 0.1 - i * 0.2]} rotation={[-0.4, 0, 0]} material={lambert('#ffd23f')}>
            <coneGeometry args={[0.07, 0.16, 5]} />
          </mesh>
        ))}
        <group ref={tail} position={[0, 0.36, -0.28]}>
          <mesh position={[0, 0, -0.2]} rotation={[-Math.PI / 2 - 0.3, 0, 0]} material={lambert(col)}>
            <coneGeometry args={[0.12, 0.45, 8]} />
          </mesh>
        </group>
        {[-1, 1].map((sx, i) => (
          <group
            key={sx}
            position={[sx * 0.14, 0.18, 0.02]}
            ref={(g) => {
              legs.current[i] = g;
            }}
          >
            <mesh position={[0, -0.09, 0]} material={lambert(col)}>
              <cylinderGeometry args={[0.07, 0.06, 0.2, 6]} />
            </mesh>
          </group>
        ))}
      </group>
    </RigidBody>
  );
}

const MAX_PER_OWNER = 3;
const MAX_DINOS = 9;

export function BabyDinos() {
  const [dinos, setDinos] = useState<DinoInfo[]>([]);
  const nextId = useRef(1);

  useEffect(() => {
    spawners.babyDino = (owner, pos) => {
      const id = nextId.current++;
      setDinos((list) => {
        let next = list;
        const mine = next.filter((d) => d.owner === owner);
        if (mine.length >= MAX_PER_OWNER) next = next.filter((d) => d.id !== mine[0].id);
        if (next.length >= MAX_DINOS) next = next.slice(1);
        const order = next.filter((d) => d.owner === owner).length;
        return [...next, { id, owner, color: DINO_COLORS[id % DINO_COLORS.length], start: [pos.x, pos.y + 0.6, pos.z] as Vec3, order }];
      });
    };
    return () => {
      spawners.babyDino = () => {};
    };
  }, []);

  const gone = (id: number) => setDinos((list) => list.filter((d) => d.id !== id));

  return (
    <>
      {dinos.map((d) => (
        <BabyDino key={d.id} info={d} onGone={gone} />
      ))}
    </>
  );
}
