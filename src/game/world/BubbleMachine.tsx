import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playBoing, playPop } from '../audio';
import { gameNow, useGameFrame } from '../clock';
import { PARTY_POINTS } from '../config';
import { emit } from '../fx';
import { getInput, rumble, type SourceId } from '../input';
import { BUBBLE_MACHINE } from '../layout';
import { lambert } from '../materials';
import { debugInfo, players, rider } from '../runtime';
import { earnSticker } from '../stickers';
import { useGame } from '../store';
import { TEST_MODE } from '../testMode';
import { groundHeight } from '../terrain';
import { StaticBox, useHint } from './common';

// The bubble machine: a wand turns round on top and blows soap bubbles off towards the plaza,
// little ones and big ones, drifting and rising. A little one pops when you touch it. A big one
// swallows you up: you float off inside it, up over the park (push the stick to drift about),
// until it pops (jump to pop it, or a friend can bump it) and down you plop.

const MAX_BUBBLES = 8;
/** A new bubble this often (seconds). */
const BLOW_EVERY = 1.3;
/** Bubbles at least this big can carry an animal. */
const BIG = 1.05;
/** How high above the ground a bubble with an animal in it floats up to. */
const RIDE_HEIGHT = 5;
/** A ride lasts this long before the bubble pops by itself (seconds). */
const RIDE_FOR = 7;
/** After a pop you can't be swallowed again straight away (ms). */
const AGAIN_AFTER = 1200;

type Bubble = {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  r: number;
  bornAt: number;
  life: number;
  rider: number | null;
  rideAt: number;
  hue: number;
};

const [MX, MZ] = BUBBLE_MACHINE.at;
const MG = groundHeight(MX, MZ);
const WAND = new THREE.Vector3(MX + Math.sin(BUBBLE_MACHINE.blow) * 0.9, MG + 2.3, MZ + Math.cos(BUBBLE_MACHINE.blow) * 0.9);

/**
 * For tests and tuning: every bubble, rides and pops so far. In the browser tests the machine
 * starts switched off (like the buddy's own mind), or its bubbles drifting over the plaza would
 * swallow whoever a test has put there; the bubble tests and the chaos test switch it on.
 */
export const bubbles = { list: [] as Bubble[], rides: 0, pops: 0, auto: !TEST_MODE };

export function BubbleMachine() {
  const list = useMemo(
    () => Array.from({ length: MAX_BUBBLES }, (): Bubble => ({ alive: false, x: 0, y: 0, z: 0, vx: 0, vz: 0, r: 1, bornAt: 0, life: 0, rider: null, rideAt: 0, hue: 0 })),
    []
  );
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const wand = useRef<THREE.Group>(null);
  const mats = useMemo(
    () => list.map(() => new THREE.MeshPhongMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.42, shininess: 120, specular: new THREE.Color('#ffffff'), depthWrite: false })),
    [list]
  );
  const st = useRef({ nextBlow: 0, lastPop: new Map<number, number>() });
  const seat = useMemo(() => new THREE.Vector3(), []);
  const resetToken = useGame((s) => s.resetToken);
  useHint([MX, MG + 2.6, MZ], 'walk', 4);

  const pop = (b: Bubble, by?: number) => {
    if (!b.alive) return;
    b.alive = false;
    bubbles.pops += 1;
    emit('drop', [b.x, b.y, b.z], { count: Math.round(10 + b.r * 14), color: ['#dff4ff', '#ffffff', '#ffd6f5'], speed: 2 + b.r * 2, up: 1.5, size: 0.1 });
    playPop([b.x, b.y, b.z]);
    const p = b.rider != null ? players.get(b.rider) : undefined;
    if (p) {
      // down you plop
      p.hold(null);
      p.hop(3);
      st.current.lastPop.set(p.slot, gameNow());
      rumble(p.source as SourceId, 0.4, 0.4, 150);
    }
    if (by != null) st.current.lastPop.set(by, gameNow());
    b.rider = null;
  };

  const blow = (r: number, at?: { x: number; y?: number; z: number }) => {
    const b = list.find((x) => !x.alive);
    if (!b) return null;
    const a = BUBBLE_MACHINE.blow + (Math.random() - 0.5) * 1.1;
    const speed = 0.9 + Math.random() * 0.8;
    Object.assign(b, {
      alive: true,
      x: at?.x ?? WAND.x,
      y: at?.y ?? WAND.y,
      z: at?.z ?? WAND.z,
      vx: at ? 0 : Math.sin(a) * speed,
      vz: at ? 0 : Math.cos(a) * speed,
      r,
      bornAt: gameNow(),
      life: 9 + Math.random() * 5,
      rider: null,
      rideAt: 0,
      hue: Math.random()
    });
    return b;
  };

  useEffect(() => {
    bubbles.list = list;
    debugInfo.bubbles = {
      state: bubbles,
      /** Blow one now (a big one, say), right here. */
      blow: (r: number, x: number, z: number, y?: number) => !!blow(r, { x, z, y }),
      /** Stop the machine blowing by itself (so a test knows every bubble there is). */
      setAuto: (on: boolean) => {
        bubbles.auto = on;
      },
      popAll: () => list.forEach((b) => pop(b))
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  const lastReset = useRef(resetToken);
  useEffect(() => {
    if (lastReset.current === resetToken) return;
    lastReset.current = resetToken;
    list.forEach((b) => pop(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  useGameFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const now = gameNow();
    const s = st.current;
    if (wand.current) wand.current.rotation.z += dt * 2.5;

    // blow another one now and then: one in three is a big one
    if (bubbles.auto && now >= s.nextBlow) {
      s.nextBlow = now + BLOW_EVERY * 1000;
      blow(Math.random() < 0.35 ? BIG + Math.random() * 0.25 : 0.35 + Math.random() * 0.5);
    }

    list.forEach((b, i) => {
      const mesh = meshes.current[i];
      if (!b.alive) {
        if (mesh) mesh.visible = false;
        return;
      }
      const age = (now - b.bornAt) / 1000;
      const g = groundHeight(b.x, b.z);
      const p = b.rider != null ? rider(b.rider) : undefined;
      if (b.rider != null && !p) {
        // its animal left (or popped out with the "I'm stuck" buttons): pop
        b.rider = null;
        pop(b);
        return;
      }
      if (p) {
        // floating off with someone inside: up, a little drift with the stick, jump pops it
        const input = getInput(p.source as SourceId);
        b.vx += (input.x * 2.2 - b.vx) * Math.min(1, dt * 1.5);
        b.vz += (input.z * 2.2 - b.vz) * Math.min(1, dt * 1.5);
        b.y += (g + RIDE_HEIGHT - b.y) * Math.min(1, dt * 0.6);
        if (input.pressed.jump || (now - b.rideAt) / 1000 > RIDE_FOR) {
          pop(b);
          return;
        }
      } else {
        // drifting along, bobbing, low enough to catch: a big one low enough to walk into, a little
        // one at jumping height
        b.vx *= 1 - dt * 0.15;
        b.vz *= 1 - dt * 0.15;
        const hover = g + Math.max(b.r + 0.25, 1.3) + Math.sin(now / 600 + i * 1.7) * 0.25;
        b.y += (hover - b.y) * Math.min(1, dt * 0.8);
        if (age > b.life) {
          pop(b);
          return;
        }
      }
      b.x += (b.vx + Math.sin(now / 700 + i * 2) * 0.25) * dt;
      b.z += (b.vz + Math.cos(now / 900 + i) * 0.25) * dt;
      // (never down into the ground, e.g. drifting over a hill)
      b.y = Math.max(b.y, g + b.r * 0.9);

      // animals touching it: a little one pops, a big empty one swallows you, a full one pops
      for (const q of players.values()) {
        if (q.slot === b.rider) continue;
        const d = Math.hypot(q.position.x - b.x, q.position.y - b.y, q.position.z - b.z);
        if (d > b.r + 0.35) continue;
        const free = !q.isLaunched() && q.ridingOn == null && q.grabbedBy == null && now - (s.lastPop.get(q.slot) ?? -1e9) > AGAIN_AFTER;
        if (b.r >= BIG && b.rider == null && free && !list.some((o) => o.alive && o.rider === q.slot)) {
          b.rider = q.slot;
          b.rideAt = now;
          bubbles.rides += 1;
          playBoing([b.x, b.y, b.z], 1.6);
          rumble(q.source as SourceId, 0.3, 0.3, 120);
          useGame.getState().addParty(PARTY_POINTS.bounce * 2);
          if (!q.bot) earnSticker('bubble');
        } else {
          pop(b, q.slot);
        }
        break;
      }
      if (!b.alive) return;
      if (b.rider != null) players.get(b.rider)?.hold(seat.set(b.x, b.y - 0.35, b.z), false);

      if (mesh) {
        mesh.visible = true;
        mesh.position.set(b.x, b.y, b.z);
        // wobbly, and a little squashed with someone inside
        const w = Math.sin(now / 160 + i) * 0.04;
        const grow = Math.min(1, age / 0.4);
        mesh.scale.set(b.r * grow * (1 + w), b.r * grow * (1 - w - (b.rider != null ? 0.05 : 0)), b.r * grow * (1 + w));
        // the rainbow shimmer of soap
        mats[i].color.setHSL((b.hue + now / 4000) % 1, 0.6, 0.85);
      }
    });
  });

  return (
    <group>
      {/* the machine: a box with a crank and a big wand ring going round on top */}
      <StaticBox position={[MX, MG + 0.6, MZ]} size={[1.4, 1.2, 1.4]} color="#c084fc" />
      <mesh position={[MX, MG + 1.25, MZ]} castShadow material={lambert('#f472b6')}>
        <cylinderGeometry args={[0.55, 0.65, 0.12, 16]} />
      </mesh>
      <mesh position={[MX, MG + 1.65, MZ]} material={lambert('#e5e7eb')}>
        <cylinderGeometry args={[0.06, 0.06, 0.8, 6]} />
      </mesh>
      <group position={[WAND.x, WAND.y, WAND.z]} rotation={[0, BUBBLE_MACHINE.blow, 0]}>
        <group ref={wand}>
          <mesh material={lambert('#38bdf8')}>
            <torusGeometry args={[0.45, 0.06, 8, 20]} />
          </mesh>
        </group>
      </group>
      {[-1, 1].map((k) => (
        <mesh key={k} position={[MX + k * 0.45, MG + 0.85, MZ + 0.71]} material={lambert('#fde047')}>
          <sphereGeometry args={[0.12, 10, 8]} />
        </mesh>
      ))}
      {list.map((_, i) => (
        <mesh
          key={i}
          visible={false}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          material={mats[i]}
          renderOrder={2}
        >
          <sphereGeometry args={[1, 20, 14]} />
          {/* a glint of light on it */}
          <mesh position={[-0.4, 0.45, 0.75]} material={lambert('#ffffff')}>
            <sphereGeometry args={[0.1, 8, 6]} />
          </mesh>
        </mesh>
      ))}
    </group>
  );
}
