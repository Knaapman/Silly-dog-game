import { BallCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playCluck, playSquawk } from '../audio';
import { emit } from '../fx';
import { CHICKEN_HOME, distXZ } from '../layout';
import { lambert } from '../materials';
import { allocPropId, noises, players, registerProp, type PropEntry } from '../runtime';
import { useGame } from '../store';
import { gameClock, gameNow, useGameFrame } from '../clock';

type Mode = 'wander' | 'peck' | 'flee' | 'tumble' | 'dizzy' | 'held';

const RADIUS = 0.3;

function Chicken({ index }: { index: number }) {
  const body = useRef<RapierRigidBody>(null);
  const yaw = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const wings = useRef<(THREE.Group | null)[]>([]);
  const legs = useRef<(THREE.Group | null)[]>([]);
  const id = useMemo(() => allocPropId(), []);
  const home = useMemo(() => {
    const a = (index / CHICKEN_HOME.count) * Math.PI * 2;
    return new THREE.Vector3(CHICKEN_HOME.center[0] + Math.cos(a) * 4, 0.5, CHICKEN_HOME.center[1] + Math.sin(a) * 4);
  }, [index]);
  const s = useRef({
    mode: 'wander' as Mode,
    timer: Math.random() * 2,
    target: home.clone(),
    facing: Math.random() * Math.PI * 2,
    walk: 0,
    cluckIn: 2 + Math.random() * 6,
    lastNoise: 0,
    settle: 0,
    flap: 0
  });
  const entryRef = useRef<PropEntry | null>(null);
  const resetToken = useGame((st) => st.resetToken);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  const startTumble = () => {
    const rb = body.current;
    if (!rb) return;
    s.current.mode = 'tumble';
    s.current.settle = 0;
    rb.setEnabledRotations(true, true, true, true);
    const p = rb.translation();
    playSquawk(p);
    emit('feather', [p.x, p.y + 0.2, p.z], { count: 12, color: ['#ffffff', '#fff6e0'], speed: 3, up: 3 });
  };

  useEffect(() => {
    const entry: PropEntry = {
      id,
      kind: 'chicken',
      getBody: () => body.current,
      radius: 0.35,
      launch: 12,
      heavy: false,
      grabbable: true,
      enabled: true,
      heldBy: null,
      onBonk: () => startTumble(),
      onGrab: () => {
        s.current.mode = 'held';
        playSquawk(body.current?.translation());
      },
      onRelease: () => startTumble()
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
    s.current.mode = 'wander';
  }, [resetToken, home]);

  useGameFrame((_, delta) => {
    const rb = body.current;
    const entry = entryRef.current;
    if (!rb || !entry) return;
    const dt = Math.min(delta, 0.05);
    const c = s.current;
    const t = rb.translation();
    const v = rb.linvel();
    const time = gameClock.time + index;
    c.timer -= dt;
    c.flap = Math.max(0, c.flap - dt);

    if (entry.heldBy != null) c.mode = 'held';
    else if (c.mode === 'held') c.mode = 'tumble';

    if (t.y < -5) {
      rb.setTranslation(home, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }

    let vx = v.x;
    let vz = v.z;
    let vy = v.y;
    let speed = 0;

    if (c.mode === 'tumble') {
      const moving = Math.hypot(v.x, v.y, v.z);
      c.settle = moving < 1.2 && t.y < 0.8 ? c.settle + dt : 0;
      c.flap = 0.2;
      if (c.settle > 0.35) {
        rb.setEnabledRotations(false, false, false, true);
        rb.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
        rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
        c.mode = 'dizzy';
        c.timer = 1.6;
      }
    } else if (c.mode !== 'held') {
      // react to players and noises
      let nearest: THREE.Vector3 | null = null;
      let nearestD = 3.6;
      players.forEach((p) => {
        const d = distXZ(p.position.x, p.position.z, t.x, t.z);
        if (d < nearestD) {
          nearestD = d;
          nearest = p.position;
        }
      });
      const now = gameNow();
      for (const n of noises) {
        if (n.time > c.lastNoise && now - n.time < 300 && distXZ(n.position.x, n.position.z, t.x, t.z) < 8) {
          c.lastNoise = n.time;
          vy = 5.5;
          c.flap = 0.8;
          c.mode = 'flee';
          c.timer = 1.2;
          playSquawk(t);
          emit('feather', [t.x, t.y + 0.3, t.z], { count: 4, color: '#ffffff', speed: 1.5, up: 2 });
          tmp.set(t.x - n.position.x, 0, t.z - n.position.z).normalize();
          c.facing = Math.atan2(tmp.x, tmp.z);
        }
      }
      const near = nearest as THREE.Vector3 | null;
      if (near && c.mode !== 'dizzy') {
        c.mode = 'flee';
        c.timer = 0.8;
        tmp.set(t.x - near.x, 0, t.z - near.z).normalize();
        c.facing = Math.atan2(tmp.x, tmp.z) + Math.sin(time * 3) * 0.4;
        if (Math.random() < dt * 1.5 && t.y < 0.6) {
          vy = 4;
          c.flap = 0.5;
        }
      }

      if (c.mode === 'flee') {
        speed = 5.5;
        if (c.timer <= 0) {
          c.mode = 'wander';
          c.timer = 0;
        }
      } else if (c.mode === 'dizzy') {
        c.facing += dt * 6;
        speed = 1.5;
        if (Math.random() < dt * 4) emit('star', [t.x, t.y + 0.7, t.z], { count: 1, color: '#ffe14d', speed: 0.8, up: 1, size: 0.12 });
        if (c.timer <= 0) c.mode = 'wander';
      } else if (c.mode === 'peck') {
        speed = 0;
        if (c.timer <= 0) {
          c.mode = 'wander';
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * CHICKEN_HOME.radius;
          c.target.set(CHICKEN_HOME.center[0] + Math.cos(a) * r, 0, CHICKEN_HOME.center[1] + Math.sin(a) * r);
        }
      } else {
        const d = distXZ(c.target.x, c.target.z, t.x, t.z);
        if (d < 0.5 || c.timer < -6) {
          c.mode = 'peck';
          c.timer = 1 + Math.random() * 2.5;
        } else {
          c.facing = Math.atan2(c.target.x - t.x, c.target.z - t.z);
          speed = 1.8;
        }
      }
      if (distXZ(t.x, t.z, CHICKEN_HOME.center[0], CHICKEN_HOME.center[1]) > CHICKEN_HOME.radius + 6 && c.mode === 'wander') {
        c.target.set(CHICKEN_HOME.center[0], 0, CHICKEN_HOME.center[1]);
      }
      const k = 1 - Math.exp(-8 * dt);
      vx += (Math.sin(c.facing) * speed - vx) * k;
      vz += (Math.cos(c.facing) * speed - vz) * k;
      rb.setLinvel({ x: vx, y: vy, z: vz }, true);

      c.cluckIn -= dt;
      if (c.cluckIn <= 0) {
        c.cluckIn = 4 + Math.random() * 7;
        playCluck(t);
      }
    }

    // ----- animation
    const hs = Math.hypot(v.x, v.z);
    c.walk += hs * dt * 5;
    if (yaw.current && c.mode !== 'tumble') {
      let d = c.facing - yaw.current.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      yaw.current.rotation.y += d * (1 - Math.exp(-12 * dt));
    }
    if (head.current) head.current.rotation.x = c.mode === 'peck' ? Math.max(0, Math.sin(time * 9)) * 1.1 : Math.sin(c.walk * 2) * 0.15;
    const flapping = c.flap > 0 || c.mode === 'flee' || c.mode === 'held' || t.y > 0.8;
    wings.current.forEach((w, i) => {
      if (!w) return;
      const side = i === 0 ? -1 : 1;
      w.rotation.z = flapping ? side * (0.4 + Math.sin(time * 40) * 0.7) : side * 0.1;
    });
    legs.current.forEach((l, i) => {
      if (l) l.rotation.x = hs > 0.3 ? Math.sin(c.walk + i * Math.PI) * 0.7 : 0;
    });
  });

  return (
    <RigidBody
      ref={body}
      position={[home.x, home.y, home.z]}
      colliders={false}
      enabledRotations={[false, false, false]}
      linearDamping={0.3}
      angularDamping={0.6}
    >
      <BallCollider args={[RADIUS]} density={0.6} friction={0.5} restitution={0.3} />
      <group ref={yaw} position={[0, -RADIUS, 0]}>
        <mesh castShadow position={[0, 0.38, 0]} scale={[0.9, 0.85, 1.15]} material={lambert('#ffffff')}>
          <sphereGeometry args={[0.27, 14, 10]} />
        </mesh>
        <mesh castShadow position={[0, 0.55, -0.26]} rotation={[-0.6, 0, 0]} material={lambert('#f5f5f5')}>
          <coneGeometry args={[0.13, 0.3, 6]} />
        </mesh>
        <group ref={head} position={[0, 0.62, 0.2]}>
          <mesh castShadow position={[0, 0.06, 0.02]} material={lambert('#ffffff')}>
            <sphereGeometry args={[0.14, 12, 10]} />
          </mesh>
          {[-0.05, 0, 0.05].map((z, i) => (
            <mesh key={i} position={[0, 0.21 - Math.abs(z), z]} material={lambert('#ff3b3b')}>
              <sphereGeometry args={[0.045, 8, 6]} />
            </mesh>
          ))}
          <mesh position={[0, 0.04, 0.17]} rotation={[Math.PI / 2, 0, 0]} material={lambert('#ffa31a')}>
            <coneGeometry args={[0.045, 0.12, 6]} />
          </mesh>
          <mesh position={[0, -0.04, 0.13]} material={lambert('#ff3b3b')}>
            <sphereGeometry args={[0.035, 8, 6]} />
          </mesh>
          {[-1, 1].map((sx) => (
            <mesh key={sx} position={[sx * 0.09, 0.09, 0.09]} material={lambert('#111111')}>
              <sphereGeometry args={[0.025, 6, 5]} />
            </mesh>
          ))}
        </group>
        {[-1, 1].map((sx, i) => (
          <group
            key={sx}
            position={[sx * 0.22, 0.46, 0]}
            ref={(g) => {
              wings.current[i] = g;
            }}
          >
            <mesh castShadow position={[sx * 0.06, -0.08, 0]} scale={[0.35, 0.8, 1.2]} material={lambert('#f1f1f1')}>
              <sphereGeometry args={[0.15, 10, 8]} />
            </mesh>
          </group>
        ))}
        {[-1, 1].map((sx, i) => (
          <group
            key={`leg${sx}`}
            position={[sx * 0.09, 0.18, 0]}
            ref={(g) => {
              legs.current[i] = g;
            }}
          >
            <mesh position={[0, -0.09, 0]} material={lambert('#ffa31a')}>
              <cylinderGeometry args={[0.025, 0.025, 0.18, 5]} />
            </mesh>
            <mesh position={[0, -0.17, 0.04]} material={lambert('#ffa31a')}>
              <boxGeometry args={[0.1, 0.02, 0.12]} />
            </mesh>
          </group>
        ))}
      </group>
    </RigidBody>
  );
}

export function Chickens() {
  return (
    <>
      {Array.from({ length: CHICKEN_HOME.count }, (_, i) => (
        <Chicken key={i} index={i} />
      ))}
    </>
  );
}
