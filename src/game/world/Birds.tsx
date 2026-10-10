import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playFlutter, playTweet } from '../audio';
import { flocks, type FlockRuntime } from '../chase';
import { gameClock, gameNow, useGameFrame } from '../clock';
import { PARTY_POINTS } from '../config';
import { emit } from '../fx';
import { BIRD_FLOCKS, BIRD_SPOTS, distXZ } from '../layout';
import { lambert } from '../materials';
import { noises, players, props, propPosition } from '../runtime';
import { earnSticker } from '../stickers';
import { groundHeight } from '../terrain';
import { topUnder } from './ground';
import { useGame } from '../store';
import { randomStream } from '../rng';

const random = randomStream('birds');

// Bird flocks: they peck about on the grass (and on a few high spots), burst into the air when
// an animal runs at them or barks, circle round and land somewhere else, so you can chase them
// all over the park. Jump into a flock as it takes off to bonk one; leave a poop lying about and
// they come to peck at it.

const PER_FLOCK = 7;
const ALT = 8;
/** Flying, a flock is about this wide (m), and keeps this far above whatever is under it. */
const FLOCK_R = 2.5;
const CLEAR = 1.5;
const FLY_SPEED = 8;
const LOOKS = [
  { body: '#9ea7b3', head: '#6b7b8c', wing: '#7d8896', belly: '#c7ced6' }, // pigeons
  { body: '#a67c52', head: '#7a5230', wing: '#8a6440', belly: '#e8d3b5' }, // sparrows
  { body: '#3b82f6', head: '#2563eb', wing: '#1d4ed8', belly: '#ffb36b' }, // bluebirds
  { body: '#ffd23f', head: '#ffc300', wing: '#f5b400', belly: '#fff3a8' } // canaries
];

type Phase = 'landed' | 'up' | 'fly' | 'land';
type Bird = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** Where it sits in the flock's landing spot. */
  spot: THREE.Vector3;
  hopFrom: THREE.Vector3;
  hopT: number;
  peckT: number;
  nextMove: number;
  facing: number;
  down: boolean;
  bonk: number;
  flap: number;
};

function Flock({ index }: { index: number }) {
  const groups = useRef<(THREE.Group | null)[]>([]);
  const heads = useRef<(THREE.Group | null)[]>([]);
  const wings = useRef<(THREE.Group | null)[][]>(Array.from({ length: PER_FLOCK }, () => []));
  const look = LOOKS[index % LOOKS.length];
  const resetToken = useGame((st) => st.resetToken);
  const f = useRef({
    phase: 'landed' as Phase,
    spot: (index * 3) % BIRD_SPOTS.length,
    center: new THREE.Vector3(),
    spread: 2,
    since: 0,
    stayFor: 25 + random() * 15,
    from: new THREE.Vector3(),
    mid: new THREE.Vector3(),
    to: new THREE.Vector3(),
    p: 0,
    dur: 1,
    upT: 0,
    poop: -1,
    lastNoise: 0,
    swirl: random() * 6,
    checkPoopIn: 5
  });
  const birds = useMemo<Bird[]>(
    () =>
      Array.from({ length: PER_FLOCK }, () => ({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        spot: new THREE.Vector3(),
        hopFrom: new THREE.Vector3(),
        hopT: 1,
        peckT: 0,
        nextMove: random() * 2,
        facing: random() * Math.PI * 2,
        down: true,
        bonk: 0,
        flap: random() * 6
      })),
    []
  );
  const tmp = useMemo(() => new THREE.Vector3(), []);

  /** Scatter the birds round a landing spot. */
  const settleAt = (x: number, y: number, z: number, spread: number, instant: boolean) => {
    const st = f.current;
    st.center.set(x, y, z);
    st.spread = spread;
    birds.forEach((b, i) => {
      const a = (i / PER_FLOCK) * Math.PI * 2 + random() * 0.6;
      const r = spread * (0.35 + random() * 0.65);
      b.spot.set(x + Math.cos(a) * r, y, z + Math.sin(a) * r);
      if (instant) {
        b.pos.copy(b.spot);
        b.down = true;
        b.vel.set(0, 0, 0);
      }
    });
  };

  const rtRef = useRef<FlockRuntime | null>(null);
  const place = () => {
    const [x, y, z, r] = BIRD_SPOTS[f.current.spot];
    settleAt(x, y + groundHeight(x, z), z, r, true);
    f.current.phase = 'landed';
    f.current.since = gameNow();
    if (rtRef.current) rtRef.current.landed = true;
  };

  /** Pick where to go next: somewhere nobody is standing, not too near, not too far. */
  const pickNext = (preferNear: boolean) => {
    const st = f.current;
    // a poop lying about with nobody near it? lunch!
    if (random() < 0.45) {
      let found: THREE.Vector3 | null = null;
      let foundId = -1;
      props.forEach((prop) => {
        if (found || prop.kind !== 'poop' || prop.heldBy != null || !propPosition(prop, tmp) || tmp.y - groundHeight(tmp.x, tmp.z) > 1.2) return;
        let crowded = false;
        players.forEach((p) => {
          if (distXZ(p.position.x, p.position.z, tmp.x, tmp.z) < 8) crowded = true;
        });
        const d = distXZ(tmp.x, tmp.z, st.center.x, st.center.z);
        if (!crowded && d > 6 && d < 60) {
          found = tmp.clone();
          foundId = prop.id;
        }
      });
      const poop = found as THREE.Vector3 | null;
      if (poop) {
        st.poop = foundId;
        st.to.set(poop.x, groundHeight(poop.x, poop.z), poop.z);
        st.spread = 1.6;
        return;
      }
    }
    st.poop = -1;
    const options: number[] = [];
    BIRD_SPOTS.forEach(([x, , z], i) => {
      if (i === st.spot) return;
      if (flocks.some((o) => o !== rtRef.current && distXZ(o.center.x, o.center.z, x, z) < 4)) return;
      const d = distXZ(x, z, st.center.x, st.center.z);
      if (d < 14 || d > 60) return;
      let crowded = false;
      let seen = false;
      players.forEach((p) => {
        const pd = distXZ(p.position.x, p.position.z, x, z);
        if (pd < 9) crowded = true;
        if (pd < 32) seen = true;
      });
      if (crowded) return;
      options.push(i);
      if (preferNear && seen) options.push(i, i); // more likely where the children are
    });
    const next = options.length ? options[Math.floor(random() * options.length)] : (st.spot + 1) % BIRD_SPOTS.length;
    st.spot = next;
    const [x, y, z, r] = BIRD_SPOTS[next];
    st.to.set(x, y + groundHeight(x, z), z);
    st.spread = r;
  };

  /** Everybody up! (calm = just moving on, no fuss) */
  const takeOff = (from: THREE.Vector3 | null, calm: boolean) => {
    const st = f.current;
    if (st.phase !== 'landed') return;
    st.phase = 'up';
    st.upT = 0;
    if (rtRef.current) rtRef.current.landed = false;
    birds.forEach((b) => {
      b.down = false;
      const a = from ? Math.atan2(b.pos.x - from.x, b.pos.z - from.z) + (random() - 0.5) * 1.2 : random() * Math.PI * 2;
      const out = calm ? 1 : 2.5 + random() * 2.5;
      b.vel.set(Math.sin(a) * out, (calm ? 4 : 6) + random() * 2.5, Math.cos(a) * out);
    });
    if (!calm) {
      playFlutter(st.center);
      emit('feather', [st.center.x, st.center.y + 0.4, st.center.z], { count: 10, color: [look.body, look.wing, '#ffffff'], speed: 3, up: 3 });
    }
  };

  useEffect(() => {
    const rt: FlockRuntime = {
      index,
      center: f.current.center,
      landed: true,
      scare: (from, slot) => {
        if (f.current.phase !== 'landed') return;
        takeOff(from, false);
        const p = slot != null ? players.get(slot) : undefined;
        if (p && !p.bot) {
          earnSticker('birds');
          useGame.getState().addParty(PARTY_POINTS.bonkCritter);
        }
      }
    };
    rtRef.current = rt;
    flocks[index] = rt;
    place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const lastReset = useRef(resetToken);
  useEffect(() => {
    if (lastReset.current === resetToken) return;
    lastReset.current = resetToken;
    f.current.spot = (index * 3) % BIRD_SPOTS.length;
    f.current.poop = -1;
    place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  useGameFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    if (dt <= 0) return;
    const st = f.current;
    const rt = rtRef.current;
    if (!rt) return;
    const now = gameNow();
    const time = gameClock.time;

    if (st.phase === 'landed') {
      // anything scary about?
      if (now - st.since > 900) {
        let scarer: { pos: THREE.Vector3; slot: number } | null = null;
        players.forEach((p) => {
          if (scarer || p.asleep) return;
          const d = distXZ(p.position.x, p.position.z, st.center.x, st.center.z);
          const dy = Math.abs(p.position.y - st.center.y);
          const fast = Math.hypot(p.velocity.x, p.velocity.z) > 4.5;
          if (dy < 3 && (d < st.spread + 2 || (fast && d < st.spread + 5))) scarer = { pos: p.position, slot: p.slot };
        });
        for (const n of noises) {
          if (!scarer && n.time > st.lastNoise && now - n.time < 300 && distXZ(n.position.x, n.position.z, st.center.x, st.center.z) < 10) {
            st.lastNoise = n.time;
            scarer = { pos: n.position, slot: n.slot };
          }
        }
        const sc = scarer as { pos: THREE.Vector3; slot: number } | null;
        if (sc) {
          rt.scare(sc.pos.clone(), sc.slot);
        } else if ((now - st.since) / 1000 > st.stayFor) {
          takeOff(null, true);
        } else {
          st.checkPoopIn -= dt;
          if (st.checkPoopIn <= 0 && st.poop < 0) {
            st.checkPoopIn = 5;
            // a fresh poop somewhere quiet: sometimes worth a visit
            if (now - st.since > 8000 && random() < 0.35) {
              let any = false;
              props.forEach((prop) => {
                if (prop.kind === 'poop' && prop.heldBy == null) any = true;
              });
              if (any) takeOff(null, true);
            }
          }
        }
      }
    }

    if (st.phase === 'up') {
      st.upT += dt;
      if (st.upT > 0.9) {
        // on to the next spot, by way of a big lazy curve
        st.phase = 'fly';
        pickNext(true);
        st.from.set(st.center.x, st.center.y + ALT * 0.6, st.center.z);
        const side = random() < 0.5 ? 1 : -1;
        tmp.subVectors(st.to, st.center);
        st.mid.set((st.center.x + st.to.x) / 2 - tmp.z * 0.3 * side, Math.max(st.center.y, st.to.y) + ALT, (st.center.z + st.to.z) / 2 + tmp.x * 0.3 * side);
        st.dur = Math.max(3, distXZ(st.center.x, st.center.z, st.to.x, st.to.z) / FLY_SPEED + 1.5);
        st.p = 0;
        settleAt(st.to.x, st.to.y, st.to.z, st.spread, false);
        st.center.copy(st.from);
      }
    } else if (st.phase === 'fly') {
      st.p = Math.min(1, st.p + dt / st.dur);
      const q = st.p;
      // quadratic bezier: from → mid → above the landing spot
      tmp.set(st.to.x, st.to.y + 2.5, st.to.z);
      st.center.set(
        (1 - q) * (1 - q) * st.from.x + 2 * (1 - q) * q * st.mid.x + q * q * tmp.x,
        (1 - q) * (1 - q) * st.from.y + 2 * (1 - q) * q * st.mid.y + q * q * tmp.y,
        (1 - q) * (1 - q) * st.from.z + 2 * (1 - q) * q * st.mid.z + q * q * tmp.z
      );
      // (over whatever is on the way, a tree, a roof, the mountain: never through it)
      st.center.y = Math.max(st.center.y, topUnder(st.center.x, st.center.z, FLOCK_R) + CLEAR);
      if (q >= 1) st.phase = 'land';
    } else if (st.phase === 'land') {
      if (birds.every((b) => b.down)) {
        st.phase = 'landed';
        st.since = now;
        st.stayFor = 22 + random() * 18;
        st.center.set(st.to.x, st.to.y, st.to.z);
        rt.landed = true;
        if (st.poop >= 0) {
          let watching = false;
          players.forEach((p) => {
            if (!p.bot && distXZ(p.position.x, p.position.z, st.center.x, st.center.z) < 25) watching = true;
          });
          if (watching) earnSticker('poopbirds');
        }
      }
    }

    // each bird
    st.swirl += dt * 1.3;
    birds.forEach((b, i) => {
      b.bonk = Math.max(0, b.bonk - dt);
      if (b.down) {
        // peck about: little hops, head bobbing (at a poop: all facing it)
        b.nextMove -= dt;
        if (b.hopT < 1) {
          b.hopT = Math.min(1, b.hopT + dt / 0.22);
          b.pos.lerpVectors(b.hopFrom, b.spot, b.hopT);
          b.pos.y = b.spot.y + Math.sin(b.hopT * Math.PI) * 0.18;
        } else if (b.nextMove <= 0) {
          b.nextMove = 0.6 + random() * 2.2;
          if (random() < 0.5) {
            b.peckT = 0.5;
          } else {
            b.hopFrom.copy(b.pos);
            const a = random() * Math.PI * 2;
            const r = st.spread * Math.sqrt(random());
            b.spot.set(st.center.x + Math.cos(a) * r, st.center.y, st.center.z + Math.sin(a) * r);
            b.facing = Math.atan2(b.spot.x - b.pos.x, b.spot.z - b.pos.z);
            b.hopT = 0;
          }
        }
        if (st.poop >= 0 && b.peckT > 0) b.facing = Math.atan2(st.center.x - b.pos.x, st.center.z - b.pos.z);
        b.peckT = Math.max(0, b.peckT - dt);
        if (random() < dt * 0.05) playTweet(b.pos);
        return;
      }
      // flying
      b.flap += dt * (st.phase === 'land' ? 16 : 30);
      if (st.phase === 'up') {
        b.vel.multiplyScalar(1 - dt * 0.6);
        b.vel.y = Math.max(b.vel.y, 2.5);
      } else {
        let target: THREE.Vector3;
        if (st.phase === 'fly') {
          const a = st.swirl + (i / PER_FLOCK) * Math.PI * 2;
          const r = 1.6 + (i % 3) * 0.6;
          target = tmp.set(st.center.x + Math.cos(a) * r, st.center.y + Math.sin(a * 2 + i) * 0.5, st.center.z + Math.sin(a) * r);
        } else {
          target = b.spot;
        }
        const k = st.phase === 'land' ? 5 : 3.2;
        b.vel.x += ((target.x - b.pos.x) * k - b.vel.x) * Math.min(1, dt * 3);
        b.vel.y += ((target.y - b.pos.y) * k - b.vel.y) * Math.min(1, dt * 3);
        b.vel.z += ((target.z - b.pos.z) * k - b.vel.z) * Math.min(1, dt * 3);
        if (b.vel.length() > 14) b.vel.setLength(14);
        if (st.phase === 'land' && b.pos.distanceTo(b.spot) < 0.15) {
          b.down = true;
          b.pos.copy(b.spot);
          b.hopT = 1;
          b.vel.set(0, 0, 0);
        }
      }
      if (b.bonk > 0) b.vel.y -= 14 * dt;
      b.pos.addScaledVector(b.vel, dt);
      if (Math.hypot(b.vel.x, b.vel.z) > 0.5) b.facing = Math.atan2(b.vel.x, b.vel.z);
      // bonk! (jump or fly into one)
      if (b.bonk <= 0) {
        players.forEach((p) => {
          if (b.bonk > 0 || p.position.distanceTo(b.pos) > 0.95 * Math.max(1, p.size)) return;
          b.bonk = 1;
          tmp.subVectors(b.pos, p.position).setY(0.4).normalize();
          b.vel.set(tmp.x * 6, 4, tmp.z * 6);
          playTweet(b.pos, true);
          emit('feather', [b.pos.x, b.pos.y, b.pos.z], { count: 8, color: [look.body, look.wing, '#ffffff'], speed: 2.5, up: 1.5 });
          emit('star', [b.pos.x, b.pos.y + 0.2, b.pos.z], { count: 4, color: '#ffe14d', speed: 1.5, up: 1.5, size: 0.14 });
          if (!p.bot) {
            earnSticker('birdbonk');
            useGame.getState().addParty(PARTY_POINTS.bonkCritter);
          }
        });
      }
    });

    // draw
    birds.forEach((b, i) => {
      const g = groups.current[i];
      if (!g) return;
      g.position.copy(b.pos);
      g.rotation.y = b.facing;
      g.rotation.z = b.bonk > 0 ? b.bonk * Math.PI * 4 : 0;
      const h = heads.current[i];
      if (h) h.rotation.x = b.down && b.peckT > 0 ? Math.max(0, Math.sin(time * 22 + i)) * 1.1 : 0;
      const flapping = !b.down;
      wings.current[i].forEach((w, side) => {
        if (!w) return;
        const sx = side === 0 ? -1 : 1;
        w.rotation.z = flapping ? sx * (0.2 + Math.sin(b.flap) * 0.9) : -sx * 1.25; // folded down along the body
      });
    });
  });

  const bodyM = lambert(look.body);
  const headM = lambert(look.head);
  const wingM = lambert(look.wing);
  const bellyM = lambert(look.belly);
  return (
    <>
      {birds.map((_, i) => (
        <group
          key={i}
          ref={(g) => {
            groups.current[i] = g;
          }}
          scale={2}
        >
          <mesh position={[0, 0.14, 0]} scale={[0.8, 0.8, 1.2]} material={bodyM}>
            <sphereGeometry args={[0.12, 10, 8]} />
          </mesh>
          <mesh position={[0, 0.11, 0.04]} scale={[0.65, 0.6, 0.9]} material={bellyM}>
            <sphereGeometry args={[0.11, 8, 6]} />
          </mesh>
          <mesh position={[0, 0.16, -0.16]} rotation={[0.5, 0, 0]} scale={[1, 0.3, 1]} material={wingM}>
            <boxGeometry args={[0.12, 0.05, 0.14]} />
          </mesh>
          <group
            position={[0, 0.24, 0.1]}
            ref={(g) => {
              heads.current[i] = g;
            }}
          >
            <mesh material={headM}>
              <sphereGeometry args={[0.075, 10, 8]} />
            </mesh>
            <mesh position={[0, -0.01, 0.08]} rotation={[Math.PI / 2, 0, 0]} material={lambert('#ffa31a')}>
              <coneGeometry args={[0.022, 0.06, 5]} />
            </mesh>
          </group>
          {[-1, 1].map((sx, side) => (
            <group
              key={sx}
              position={[sx * 0.08, 0.17, 0]}
              ref={(g) => {
                wings.current[i][side] = g;
              }}
            >
              <mesh position={[sx * 0.1, 0, -0.02]} scale={[1, 0.25, 0.8]} material={wingM}>
                <sphereGeometry args={[0.11, 8, 6]} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </>
  );
}

export function Birds() {
  return (
    <>
      {Array.from({ length: BIRD_FLOCKS }, (_, i) => (
        <Flock key={i} index={i} />
      ))}
    </>
  );
}
