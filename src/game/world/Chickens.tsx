import { BallCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playCheer, playCluck, playSquawk } from '../audio';
import { burstConfetti, emit } from '../fx';
import { CHICKEN_COOP, CHICKEN_HOME, distXZ } from '../layout';
import { GATE_IN, GATE_OUT, inCoop, PENNED_FOR, useCoop } from '../coop';
import { earnSticker } from '../stickers';
import { StaticBox } from './common';
import { lambert } from '../materials';
import { allocPropId, debugInfo, noises, players, registerProp, type PropEntry } from '../runtime';
import { useGame } from '../store';
import { gameClock, gameNow, useGameFrame } from '../clock';
import { groundHeight } from '../terrain';
import { randomStream } from '../rng';

const random = randomStream('chickens');

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
    const x = CHICKEN_HOME.center[0] + Math.cos(a) * 4;
    const z = CHICKEN_HOME.center[1] + Math.sin(a) * 4;
    return new THREE.Vector3(x, groundHeight(x, z) + 0.5, z);
  }, [index]);
  const s = useRef({
    mode: 'wander' as Mode,
    timer: random() * 2,
    target: home.clone(),
    facing: random() * Math.PI * 2,
    walk: 0,
    cluckIn: 2 + random() * 6,
    lastNoise: 0,
    settle: 0,
    flap: 0,
    /** In the coop (and staying there), being let out, how long a penned one has been outside. */
    penned: false,
    leaving: false,
    outFor: 0
  });
  ((debugInfo.chickens ??= []) as unknown[])[index] = s.current;
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
    s.current.penned = false;
    s.current.leaving = false;
    useCoop.getState().pen(index, false);
  }, [resetToken, home, index]);

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
        // chased up to the coop's gate: in it goes (a little help for small herders)
        if (!c.penned && distXZ(t.x, t.z, GATE_OUT.x, GATE_OUT.z) < 4.5) {
          const gx = GATE_IN.x - t.x;
          const gz = GATE_IN.z - t.z;
          const gl = Math.hypot(gx, gz) || 1;
          tmp.x += gx / gl;
          tmp.z += gz / gl;
          tmp.normalize();
        }
        c.facing = Math.atan2(tmp.x, tmp.z) + Math.sin(time * 3) * 0.4;
        if (random() < dt * 1.5 && t.y < 0.6) {
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
        if (random() < dt * 4) emit('star', [t.x, t.y + 0.7, t.z], { count: 1, color: '#ffe14d', speed: 0.8, up: 1, size: 0.12 });
        if (c.timer <= 0) c.mode = 'wander';
      } else if (c.mode === 'peck') {
        speed = 0;
        if (c.timer <= 0) {
          c.mode = 'wander';
          const a = random() * Math.PI * 2;
          if (c.penned) {
            // pottering about in the coop
            const r = random() * (CHICKEN_COOP.size / 2 - 0.8);
            c.target.set(CHICKEN_COOP.center[0] + Math.cos(a) * r, 0, CHICKEN_COOP.center[1] + Math.sin(a) * r);
          } else {
            const r = random() * CHICKEN_HOME.radius;
            c.target.set(CHICKEN_HOME.center[0] + Math.cos(a) * r, 0, CHICKEN_HOME.center[1] + Math.sin(a) * r);
          }
        }
      } else if (c.leaving) {
        // let out of the coop: trot out through the gate (no stopping to peck on the way)
        c.facing = Math.atan2(c.target.x - t.x, c.target.z - t.z);
        speed = 3.5;
      } else {
        const d = distXZ(c.target.x, c.target.z, t.x, t.z);
        if (d < 0.5 || c.timer < -6) {
          c.mode = 'peck';
          c.timer = 1 + random() * 2.5;
        } else {
          c.facing = Math.atan2(c.target.x - t.x, c.target.z - t.z);
          speed = 1.8;
        }
      }
      // the round-up: in the coop it stays; let out, it goes out through the gate and home
      const coop = useCoop.getState();
      const inside = inCoop(t.x, t.z);
      if (c.penned && !coop.penned[index]) {
        c.penned = false;
        c.leaving = true;
        // one after another, pecking while they wait their turn (all at once, they jam in the gate)
        c.mode = 'peck';
        c.timer = index * 0.6;
      }
      if (!c.penned && inside && !c.leaving && coop.doneAt < 0) {
        c.penned = true;
        c.outFor = 0;
        coop.pen(index, true);
        playCluck(t);
        emit('star', [t.x, t.y + 0.6, t.z], { count: 6, color: ['#ffd23f', '#ffffff'], speed: 1.5, up: 2 });
      } else if (c.penned && !inside) {
        // thrown out (or it hopped the fence): after a moment it doesn't count any more
        c.outFor += dt;
        if (c.outFor > 1.2) {
          c.penned = false;
          coop.pen(index, false);
        }
      } else c.outFor = 0;
      if (c.leaving && c.mode === 'wander') {
        // to just inside the gate first (straight at the gate from a corner runs into the fence),
        // each in its own lane across the gate so they don't all squeeze for the middle
        // (and straight on out until clear of the fence: turning for home in the gateway walks
        // into the end of the fence)
        const lane = GATE_IN.x + THREE.MathUtils.clamp(t.x - GATE_IN.x, -0.7, 0.7);
        const atGate = Math.abs(t.x - lane) < 0.5 && t.z < GATE_IN.z + 0.4;
        const inGateway = Math.abs(t.x - GATE_IN.x) < CHICKEN_COOP.gate / 2 + 0.3 && t.z > GATE_OUT.z + 0.3 && t.z < GATE_IN.z + 0.4;
        if (inside || inGateway) c.target.set(lane, 0, atGate || !inside ? GATE_OUT.z : GATE_IN.z);
        else {
          c.leaving = false;
          c.target.set(CHICKEN_HOME.center[0], 0, CHICKEN_HOME.center[1]);
        }
      }
      if (!c.penned && !c.leaving && distXZ(t.x, t.z, CHICKEN_HOME.center[0], CHICKEN_HOME.center[1]) > CHICKEN_HOME.radius + 6 && c.mode === 'wander') {
        c.target.set(CHICKEN_HOME.center[0], 0, CHICKEN_HOME.center[1]);
      }
      const k = 1 - Math.exp(-8 * dt);
      vx += (Math.sin(c.facing) * speed - vx) * k;
      vz += (Math.cos(c.facing) * speed - vz) * k;
      // a penned chicken running for the fence (or the gate) turns back in
      if (c.penned && inside && !inCoop(t.x + vx * 0.3, t.z + vz * 0.3, 0.1)) {
        c.facing = Math.atan2(CHICKEN_COOP.center[0] - t.x, CHICKEN_COOP.center[1] - t.z);
        vx = Math.sin(c.facing) * 1.5;
        vz = Math.cos(c.facing) * 1.5;
      }
      rb.setLinvel({ x: vx, y: vy, z: vz }, true);

      c.cluckIn -= dt;
      if (c.cluckIn <= 0) {
        c.cluckIn = 4 + random() * 7;
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

/**
 * The coop the chickens get rounded up into: a fenced pen with a gate facing their yard, a little
 * henhouse, and a sign with a dot for every chicken (they light up as the chickens go in). All
 * in: a party; after a while the gate opens and out they wander again.
 */
function ChickenCoop() {
  const penned = useCoop((st) => st.penned);
  const done = useCoop((st) => st.doneAt >= 0);
  const [cx, cz] = CHICKEN_COOP.center;
  const half = CHICKEN_COOP.size / 2;
  const h = CHICKEN_COOP.fence;
  const g = groundHeight(cx, cz);
  const side = (CHICKEN_COOP.size - CHICKEN_COOP.gate) / 2;
  const gate = useRef<THREE.Group>(null);
  useGameFrame(() => {
    const coop = useCoop.getState();
    const now = gameNow();
    if (coop.doneAt < 0 && coop.penned.every(Boolean)) {
      coop.finish(now);
      earnSticker('chickens');
      useGame.getState().addParty(1);
      playCheer();
      burstConfetti([cx, g + 2.5, cz], 60);
    } else if (coop.doneAt >= 0 && now - coop.doneAt > PENNED_FOR * 1000) coop.release();
    // the gate swings shut while they're all in, and open again after
    const gr = gate.current;
    if (gr) gr.rotation.y += ((coop.doneAt >= 0 ? 0 : -1.4) - gr.rotation.y) * 0.1;
  });
  const wood = lambert('#b7793f');
  const rail = (x: number, z: number, lx: number, lz: number, key: string) => (
    <StaticBox key={key} position={[x, g + h / 2, z]} size={[lx, h, lz]} color="#b7793f" material={wood} />
  );
  return (
    <group>
      {rail(cx, cz + half, CHICKEN_COOP.size, 0.15, 's')}
      {rail(cx - half, cz, 0.15, CHICKEN_COOP.size, 'w')}
      {rail(cx + half, cz, 0.15, CHICKEN_COOP.size, 'e')}
      {rail(cx - half + side / 2, cz - half, side, 0.15, 'nw')}
      {rail(cx + half - side / 2, cz - half, side, 0.15, 'ne')}
      {/* the gate (only a picture: it swings shut when they're all in) */}
      <group ref={gate} position={[cx - CHICKEN_COOP.gate / 2, g, cz - half]} rotation={[0, -1.4, 0]}>
        <mesh position={[CHICKEN_COOP.gate / 2, h / 2, 0]} material={lambert('#d6a064')}>
          <boxGeometry args={[CHICKEN_COOP.gate, h * 0.8, 0.08]} />
        </mesh>
      </group>
      {/* the henhouse in the back corner */}
      <StaticBox position={[cx - half + 1, g + 0.6, cz + half - 0.9]} size={[1.5, 1.2, 1.2]} color="#e53935" />
      <mesh position={[cx - half + 1, g + 1.45, cz + half - 0.9]} rotation={[0, Math.PI / 4, 0]} material={lambert('#8d5a36')}>
        <coneGeometry args={[1.15, 0.6, 4]} />
      </mesh>
      {/* the sign: a dot for every chicken, lit when it's in */}
      <group position={[cx + half + 0.5, g, cz + half + 0.4]}>
        <mesh position={[0, 0.8, 0]} material={wood}>
          <cylinderGeometry args={[0.06, 0.06, 1.6, 6]} />
        </mesh>
        <mesh position={[0, 1.55, 0.05]} material={lambert('#fff8e1')}>
          <boxGeometry args={[2.1, 0.6, 0.08]} />
        </mesh>
        {penned.map((on, i) => (
          <mesh key={i} position={[-0.84 + (i % 4) * 0.56, 1.68 - Math.floor(i / 4) * 0.26, 0.11]} material={lambert(on ? (done ? '#22c55e' : '#fbbf24') : '#cbd5e1')}>
            <sphereGeometry args={[0.1, 8, 6]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function Chickens() {
  return (
    <>
      {Array.from({ length: CHICKEN_HOME.count }, (_, i) => (
        <Chicken key={i} index={i} />
      ))}
      <ChickenCoop />
    </>
  );
}
