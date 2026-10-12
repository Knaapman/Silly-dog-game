import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playFanfare, playGeyser, playRibbit, playSnore, playSplash, playWhaleSong } from '../audio';
import { after, gameNow, useGameFrame } from '../clock';
import { WORLD_HALF_Z } from '../config';
import { burstConfetti, emit, ring } from '../fx';
import { getInput, type SourceId } from '../input';
import { LAKE, SEA, SUMMIT_FLAG, WATER_LEVEL } from '../layout';
import { lambert } from '../materials';
import { debugInfo, players, registerFood, type PlayerRuntime } from '../runtime';
import { earnSticker } from '../stickers';
import { useGame } from '../store';
import { groundHeight } from '../terrain';
import { SPECIES_SPECS } from '../player/AnimalModel';
import { randomStream } from '../rng';

const random = randomStream('secrets');

// A few secrets, with no hints anywhere (their stickers show as a "?" until found):
//
//   whale   swim right out to the buoys at sea: a whale comes up under you and its spout blows
//           you sky-high, all the way back to the beach
//   frog    a frog sits on one of the lily pads in the lagoon: lick it and it hops onto your head
//           and rides along, croaking, for a while
//   summit  stand by the flag on the very top of the snowy summit: fireworks!
//   nap     stand still and do nothing for a while: your animal dozes off (sleepy bubbles, a soft
//           snore), and a butterfly comes and sits on its head

/** Where on the head something sits (a frog, a butterfly), for this player. */
function headTop(p: PlayerRuntime, out: THREE.Vector3, up = 0.3) {
  const species = useGame.getState().players.find((x) => x.slot === p.slot)?.species ?? 'dog';
  const [, hy, hz] = SPECIES_SPECS[species].head;
  return out.set(p.position.x + Math.sin(p.facing) * hz * p.size, p.position.y + (hy + up) * p.size, p.position.z + Math.cos(p.facing) * hz * p.size);
}

/** A little hop from `a` to `b` (t: 0..1), `h` high at the top. */
function arc(a: THREE.Vector3, b: THREE.Vector3, t: number, h: number, out: THREE.Vector3) {
  out.lerpVectors(a, b, t);
  out.y += Math.sin(Math.PI * t) * h;
  return out;
}

export const secrets = {
  whale: { mode: 'gone' as 'gone' | 'rise' | 'spout' | 'sink', t: 0, x: 0, z: 0, who: -1, nextAt: 0, blows: 0 },
  frog: { rider: null as number | null, mode: 'pad' as 'pad' | 'on' | 'ride' | 'off', t: 0, rides: 0 },
  summit: { parties: 0 },
  naps: new Map<number, { still: number; butterfly: 'none' | 'in' | 'on' | 'out'; t: number }>()
};

export function Secrets() {
  debugInfo.secrets = secrets;
  return (
    <>
      <Whale />
      <Frog />
      <Summit />
      <Naps />
    </>
  );
}

// ---- the whale ----

/** Swimming this far out (z), near the buoys, brings the whale. */
export const WHALE_Z = WORLD_HALF_Z - 5;
const WHALE = { deep: WATER_LEVEL - 3.2, up: WATER_LEVEL - 0.1, rise: 1.4, spout: 1.6, sink: 1.8, again: 20000, reach: 3.2 };

function Whale() {
  const group = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  const tmp = useMemo(() => ({ target: new THREE.Vector3() }), []);
  useGameFrame((_, dt) => {
    const w = secrets.whale;
    const now = gameNow();
    if (w.mode === 'gone') {
      if (now < w.nextAt) return;
      let who: PlayerRuntime | undefined;
      players.forEach((p) => {
        if (!who && !p.bot && p.swimming && p.position.z > WHALE_Z) who = p;
      });
      if (!who) return;
      // up it comes right under them (side on to the camera), its blowhole just below
      w.mode = 'rise';
      w.t = 0;
      w.who = who.slot;
      w.x = who.position.x;
      w.z = Math.min(who.position.z, WORLD_HALF_Z - 1.5);
      playSplash(who.position, true);
      playWhaleSong(who.position);
      ring([w.x, WATER_LEVEL + 0.05, w.z], { color: '#d9f3ff', radius: 4, duration: 1.2 });
    }
    w.t += dt;
    // (coming up, it keeps itself under the one it came for)
    const swimmer = players.get(w.who);
    if (w.mode === 'rise' && swimmer?.swimming && swimmer.position.z > WHALE_Z - 3) {
      w.x = swimmer.position.x;
      w.z = Math.min(swimmer.position.z, WORLD_HALF_Z - 1.5);
    }
    if (w.mode === 'rise' && w.t >= WHALE.rise) {
      w.mode = 'spout';
      w.t = 0;
      w.blows += 1;
      playGeyser([w.x, WATER_LEVEL, w.z]);
      // whoosh! anyone swimming over the blowhole goes flying back to the beach
      players.forEach((p) => {
        if (p.isLaunched() || Math.hypot(p.position.x - w.x, p.position.z - w.z) > WHALE.reach || p.position.y > WATER_LEVEL + 2) return;
        tmp.target.set(p.position.x, 0, SEA.coast - 9);
        for (let k = 0; k < 6 && groundHeight(tmp.target.x, tmp.target.z) < WATER_LEVEL + 0.2; k += 1) tmp.target.z -= 3;
        tmp.target.y = groundHeight(tmp.target.x, tmp.target.z);
        p.launchTo(tmp.target, WATER_LEVEL + 15);
        if (!p.bot) earnSticker('whale');
      });
    } else if (w.mode === 'spout') {
      if (random() < 0.9) emit('puff', [w.x, WATER_LEVEL + 0.6, w.z], { count: 3, color: ['#ffffff', '#d9f3ff', '#a8dcff'], speed: 1.2, up: 9, size: 0.45, gravity: 6, life: 1.1 });
      if (w.t >= WHALE.spout) {
        w.mode = 'sink';
        w.t = 0;
      }
    } else if (w.mode === 'sink' && w.t >= WHALE.sink) {
      w.mode = 'gone';
      w.nextAt = now + WHALE.again;
    }
    const g = group.current;
    if (g) {
      const k = w.mode === 'rise' ? w.t / WHALE.rise : w.mode === 'sink' ? 1 - w.t / WHALE.sink : w.mode === 'spout' ? 1 : 0;
      g.visible = w.mode !== 'gone';
      g.position.set(w.x, THREE.MathUtils.lerp(WHALE.deep, WHALE.up, THREE.MathUtils.smoothstep(k, 0, 1)), w.z);
      g.rotation.z = Math.sin(gameNow() / 700) * 0.05;
    }
    // (the tail flicks up out of the water)
    if (tail.current) tail.current.rotation.z = -0.55 + Math.sin(gameNow() / 300) * 0.3;
  });
  return (
    <group ref={group} visible={false}>
      {/* a big friendly whale, lying along the shore (x), head to the east */}
      <mesh castShadow scale={[3.4, 1.15, 1.5]} material={lambert('#4a6fa5')}>
        <sphereGeometry args={[1, 20, 14]} />
      </mesh>
      <mesh position={[0.4, -0.45, 0]} scale={[2.8, 0.75, 1.2]} material={lambert('#e8eef7')}>
        <sphereGeometry args={[1, 18, 12]} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[2.2, 0.5, s * 0.92]}>
          <mesh material={lambert('#ffffff')}>
            <sphereGeometry args={[0.26, 12, 10]} />
          </mesh>
          <mesh position={[0.08, 0.03, s * 0.17]} material={lambert('#111111')}>
            <sphereGeometry args={[0.14, 10, 8]} />
          </mesh>
        </group>
      ))}
      {/* a big smile, on the side you see */}
      <mesh position={[2.55, 0.35, 0.95]} rotation={[0, 0.5, Math.PI]} material={lambert('#1d2f4d')}>
        <torusGeometry args={[0.32, 0.045, 6, 16, Math.PI]} />
      </mesh>
      {/* the blowhole, right in the middle of its back */}
      <mesh position={[0, 1.12, 0]} scale={[1, 0.3, 1]} material={lambert('#2f4b73')}>
        <sphereGeometry args={[0.18, 10, 6]} />
      </mesh>
      <group ref={tail} position={[-3.1, 0.5, 0]}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[-0.6, 0.1, s * 0.6]} rotation={[0, s * 0.5, 0]} scale={[0.95, 0.14, 0.55]} material={lambert('#4a6fa5')}>
            <sphereGeometry args={[1, 12, 8]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ---- the frog ----

/** The lily pad the frog sits on, and how long it rides on a head (s). */
const PAD = new THREE.Vector3(LAKE.center[0] + 5, WATER_LEVEL + 0.1, LAKE.center[1] - 4);
const FROG_RIDE = 30;
const FROG_HOP = 0.45;

function Frog() {
  const group = useRef<THREE.Group>(null);
  const tmp = useMemo(() => ({ head: new THREE.Vector3(), from: new THREE.Vector3(), at: new THREE.Vector3() }), []);
  const food = useRef<ReturnType<typeof registerFood> | null>(null);
  useEffect(() => {
    food.current = registerFood({
      position: PAD.clone().setY(PAD.y + 0.2),
      radius: 0.4,
      enabled: true,
      eat: (slot) => {
        const f = secrets.frog;
        if (f.mode !== 'pad') return;
        f.rider = slot;
        f.mode = 'on';
        f.t = 0;
        f.rides += 1;
        tmp.from.copy(PAD);
        if (food.current) food.current.entry.enabled = false;
        playRibbit(PAD);
        if (!players.get(slot)?.bot) earnSticker('frog');
      }
    });
    return () => {
      food.current?.unregister();
      food.current = null;
    };
  }, [tmp]);
  useGameFrame((_, dt) => {
    const f = secrets.frog;
    const g = group.current;
    if (!g) return;
    f.t += dt;
    const p = f.rider == null ? undefined : players.get(f.rider);
    if (f.mode !== 'pad' && !p && f.mode !== 'off') {
      // (the rider left the game): back to the pad
      f.mode = 'off';
      f.t = 0;
      tmp.from.copy(g.position);
    }
    if (f.mode === 'on' && p) {
      headTop(p, tmp.head, 0.25);
      arc(tmp.from, tmp.head, Math.min(1, f.t / FROG_HOP), 1.2, tmp.at);
      g.position.copy(tmp.at);
      if (f.t >= FROG_HOP) {
        f.mode = 'ride';
        f.t = 0;
      }
    } else if (f.mode === 'ride' && p) {
      headTop(p, tmp.head, 0.25);
      // a little bounce on every croak
      const beat = f.t % 3;
      g.position.copy(tmp.head);
      g.position.y += beat < 0.25 ? Math.sin((beat / 0.25) * Math.PI) * 0.15 : 0;
      g.rotation.y = p.facing;
      if (beat < dt) playRibbit(tmp.head);
      if (f.t >= FROG_RIDE) {
        // off it hops, back home to its pad
        f.mode = 'off';
        f.t = 0;
        tmp.from.copy(g.position);
      }
    } else if (f.mode === 'off') {
      arc(tmp.from, PAD, Math.min(1, f.t / (FROG_HOP * 2)), 2, tmp.at);
      g.position.copy(tmp.at);
      if (f.t >= FROG_HOP * 2) {
        f.mode = 'pad';
        f.rider = null;
        g.rotation.y = 0;
        playRibbit(PAD);
        if (food.current) food.current.entry.enabled = true;
      }
    } else {
      g.position.copy(PAD);
      // now and then it puffs up its throat (a croak you can see from the shore)
      g.scale.setScalar(1 + (Math.sin(gameNow() / 260) > 0.92 ? 0.08 : 0));
    }
  });
  return (
    <group ref={group} position={PAD.toArray()}>
      <mesh castShadow position={[0, 0.12, 0]} scale={[1, 0.65, 1.1]} material={lambert('#5cbf3a')}>
        <sphereGeometry args={[0.2, 14, 10]} />
      </mesh>
      <mesh position={[0, 0.06, 0.06]} scale={[0.85, 0.5, 0.9]} material={lambert('#c8ee8a')}>
        <sphereGeometry args={[0.2, 12, 8]} />
      </mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.09, 0.25, 0.1]}>
          <mesh material={lambert('#5cbf3a')}>
            <sphereGeometry args={[0.07, 10, 8]} />
          </mesh>
          <mesh position={[0, 0.02, 0.05]} material={lambert('#ffffff')}>
            <sphereGeometry args={[0.045, 8, 6]} />
          </mesh>
          <mesh position={[0, 0.02, 0.085]} material={lambert('#111111')}>
            <sphereGeometry args={[0.022, 6, 5]} />
          </mesh>
        </group>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`leg${s}`} position={[s * 0.17, 0.03, -0.05]} scale={[0.6, 0.3, 1.3]} material={lambert('#4aa62e')}>
          <sphereGeometry args={[0.08, 8, 6]} />
        </mesh>
      ))}
    </group>
  );
}

// ---- the summit ----

/** Standing this close to the summit flag (m) counts; the party comes round again after this long (ms). */
const SUMMIT_NEAR = 2.4;
const SUMMIT_AGAIN = 15000;

function Summit() {
  const last = useRef(new Map<number, number>());
  useGameFrame(() => {
    const [fx, fz] = SUMMIT_FLAG;
    const top = groundHeight(fx, fz);
    const now = gameNow();
    players.forEach((p) => {
      if (p.bot || !p.grounded || Math.hypot(p.position.x - fx, p.position.z - fz) > SUMMIT_NEAR || p.position.y < top - 0.8) return;
      if (now - (last.current.get(p.slot) ?? -1e9) < SUMMIT_AGAIN) return;
      last.current.set(p.slot, now);
      secrets.summit.parties += 1;
      earnSticker('summit');
      playFanfare();
      // fireworks: bursts of confetti all round, one after the other (in front of the animal and
      // not too high: the camera looks down from behind, and higher up would be off the screen)
      const [px, py, pz] = [p.position.x, p.position.y, p.position.z];
      for (let i = 0; i < 5; i += 1) {
        after(i * 0.45, () => {
          const a = i * 2.4;
          const at: [number, number, number] = [px + Math.cos(a) * 2.2, py + 1.4 + (i % 2) * 0.6, pz + 2 + Math.sin(a) * 1.2];
          burstConfetti(at, 40, 6);
          ring(at, { color: ['#ff4d5e', '#ffd23f', '#3b82f6', '#a855f7', '#22c55e'][i], radius: 3, duration: 0.6 });
        });
      }
    });
  });
  return null;
}

// ---- the nap ----

/** Seconds of standing still before the sleepy bubbles, and before the butterfly comes. */
const DOZE = 6;
const BUTTERFLY = 9;
const BUTTERFLY_FLY = 2;

function Naps() {
  const flies = useRef<(THREE.Group | null)[]>([]);
  const last = useMemo(() => new Map<number, THREE.Vector3>(), []);
  const tmp = useMemo(() => ({ head: new THREE.Vector3(), from: new THREE.Vector3(), at: new THREE.Vector3() }), []);
  useGameFrame((_, dt) => {
    if (dt <= 0) return;
    const slots = new Set<number>();
    players.forEach((p) => {
      if (p.bot) return;
      slots.add(p.slot);
      let n = secrets.naps.get(p.slot);
      if (!n) secrets.naps.set(p.slot, (n = { still: 0, butterfly: 'none', t: 0 }));
      const prev = last.get(p.slot) ?? p.position.clone();
      const input = getInput(p.source as SourceId);
      const resting = p.grounded && !p.swimming && !p.isLaunched() && !p.flopped && p.ridingOn == null && p.grabbedBy == null && !p.asleep;
      const quiet = Math.hypot(input.x, input.z) < 0.15 && !input.anyPressed && p.position.distanceTo(prev) < 0.03;
      last.set(p.slot, (last.get(p.slot) ?? new THREE.Vector3()).copy(p.position));
      if (resting && quiet) n.still += dt;
      else {
        n.still = 0;
        if (n.butterfly === 'in' || n.butterfly === 'on') {
          n.butterfly = 'out';
          n.t = 0;
        }
      }
      n.t += dt;
      // dozing: sleepy bubbles drifting up, and a soft snore now and then
      if (n.still > DOZE) {
        headTop(p, tmp.head, 0.2);
        if ((n.still % 1.2) < dt) emit('puff', tmp.head, { count: 1, color: ['#ffffff', '#dfe9ff'], speed: 0.2, up: 0.7, size: 0.18, gravity: -0.3, life: 1.6 });
        if ((n.still % 2.6) < dt) playSnore(p.position);
      }
      if (n.still > BUTTERFLY && n.butterfly === 'none') {
        n.butterfly = 'in';
        n.t = 0;
      }
      if (n.butterfly === 'in' && n.t >= BUTTERFLY_FLY) {
        n.butterfly = 'on';
        n.t = 0;
        earnSticker('nap');
      }
      if (n.butterfly === 'out' && n.t >= BUTTERFLY_FLY) n.butterfly = 'none';
    });
    // the butterflies, one for each child (slot order)
    for (let i = 0; i < flies.current.length; i += 1) {
      const g = flies.current[i];
      if (!g) continue;
      const p = players.get(i);
      const n = secrets.naps.get(i);
      if (!p || !slots.has(i) || !n || n.butterfly === 'none') {
        g.visible = false;
        continue;
      }
      g.visible = true;
      headTop(p, tmp.head, 0.32);
      tmp.from.set(p.position.x + 3, p.position.y + 3, p.position.z + 2);
      const k = Math.min(1, n.t / BUTTERFLY_FLY);
      if (n.butterfly === 'in') arc(tmp.from, tmp.head, k, 0.8, tmp.at);
      else if (n.butterfly === 'out') arc(tmp.head, tmp.from.set(p.position.x - 3, p.position.y + 5, p.position.z - 3), k, 0.5, tmp.at);
      else tmp.at.copy(tmp.head);
      // (a wobbly flight path, quiet wings once it's sitting)
      if (n.butterfly !== 'on') tmp.at.y += Math.sin(gameNow() / 90) * 0.12;
      g.position.copy(tmp.at);
      g.rotation.y = p.facing + (n.butterfly === 'on' ? 0 : gameNow() / 400);
      const flap = Math.sin(gameNow() / (n.butterfly === 'on' ? 400 : 45)) * (n.butterfly === 'on' ? 0.5 : 1.1);
      const [l, r] = g.children as THREE.Object3D[];
      if (l && r) {
        l.rotation.z = 0.3 + flap;
        r.rotation.z = -0.3 - flap;
      }
    }
  });
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <group
          key={i}
          visible={false}
          ref={(g) => {
            flies.current[i] = g;
          }}
        >
          {[-1, 1].map((s) => (
            <group key={s}>
              <mesh position={[s * 0.22, 0, 0]} scale={[1, 0.15, 0.85]} material={lambert(['#ff3d9a', '#ffb703', '#22a6f2', '#9b4dff'][i])}>
                <sphereGeometry args={[0.22, 12, 8]} />
              </mesh>
            </group>
          ))}
          <mesh scale={[0.3, 0.3, 1]} material={lambert('#2b2020')}>
            <sphereGeometry args={[0.13, 8, 6]} />
          </mesh>
        </group>
      ))}
    </>
  );
}
