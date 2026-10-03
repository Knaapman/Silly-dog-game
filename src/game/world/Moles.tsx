import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playBonk, playCheer, playPop, playSqueak, playTwinkle } from '../audio';
import { gameNow, useGameFrame } from '../clock';
import { PARTY_POINTS } from '../config';
import { burstConfetti, emit, ring } from '../fx';
import { distXZ, MOLES } from '../layout';
import { lambert } from '../materials';
import { RADIUS } from '../player/constants';
import { debugInfo, players, registerStatic } from '../runtime';
import { earnSticker } from '../stickers';
import { useGame } from '../store';
import { groundHeight } from '../terrain';
import { useHint } from './common';
import { randomStream } from '../rng';

const random = randomStream('moles');

// Whack-a-mole on the meadow between the plaza and the forest: seven molehills, and while a child
// is about, cheeky moles pop up out of them one after another. Bonk one (a headbutt, a jump on its
// head, a snowball, or just bump into it) and down it goes, seeing stars. After every ten a golden
// mole with a crown comes up and waits: bonk that one for a cheer and a party (and a sticker; with
// two children bonking, a friend sticker). Nothing is timed and nothing is lost: a mole nobody
// bonks just giggles and pops down again.

/** A child this close to the middle (m): the moles come out. */
const ACTIVE_R = 9;
/** Seconds a mole stays up when nobody bonks it (the golden one waits). */
const UP_TIME = 2.4;
/** Seconds between moles popping up (a bit quicker with friends about). */
const GAP: [number, number] = [0.6, 1.3];
/** Seconds a hole stays empty before another mole can come out of it. */
const REST = 0.5;
/** Moles to bonk before the golden one comes up. */
export const MOLE_ROUND = 10;
/** Bumping into a mole: this close across (m) and low enough. */
const TOUCH = 0.65;
/** Moles are drawn this much bigger than their model (so they read from the camera)... */
const SIZE = 1.25;
/** ...and stand this tall out of their holes (m). */
const TOP = 0.76 * SIZE;
/** Falling at least this fast onto one (m/s) is a stomp: a bounce off its head. */
const STOMP_VY = -2;

type MoleState = 'down' | 'up' | 'bonked' | 'hiding';
type Mole = { state: MoleState; h: number; t: number; golden: boolean; squash: number };

/** For the buddy: is anyone playing, and which moles are up. */
export const moles = {
  active: false,
  list: MOLES.holes.map((): Mole => ({ state: 'down', h: 0, t: 1, golden: false, squash: 0 }))
};

export function Moles() {
  const [cx, cz] = MOLES.center;
  const g = groundHeight(cx, cz);
  const st = useRef({
    list: moles.list,
    count: 0,
    bonks: 0,
    stomps: 0,
    touches: 0,
    buddyBonks: 0,
    rounds: 0,
    goldenUp: false,
    nextPop: 0,
    last: -1,
    nextTwinkle: 0,
    kids: new Set<number>()
  });
  debugInfo.moles = st.current;
  const groups = useRef<(THREE.Group | null)[]>([]);
  const bodies = useRef<(THREE.Mesh | null)[]>([]);
  const crowns = useRef<(THREE.Group | null)[]>([]);
  const mats = useMemo(() => ({ brown: lambert('#6b4f3a'), gold: lambert('#f5c542') }), []);
  useHint([cx, g + 1, cz], 'bonk', 4);

  const bonk = useMemo(
    () => (i: number, slot: number, how: 'bonk' | 'stomp' | 'touch') => {
      const s = st.current;
      const m = s.list[i];
      const who = players.get(slot);
      // (the golden one is for the children: the buddy can't knock it down, not even by accident)
      if (m.state !== 'up' || (m.golden && who?.bot)) return;
      const [x, z] = MOLES.holes[i];
      const top = g + TOP * m.h;
      m.state = 'bonked';
      m.t = 0;
      m.squash = 1;
      s.bonks += 1;
      if (how === 'stomp') s.stomps += 1;
      if (how === 'touch') s.touches += 1;
      if (who?.bot) s.buddyBonks += 1;
      else if (who) s.kids.add(slot);
      // a headbutt makes its own stars and bonk; a bump or a stomp gets them here
      if (how !== 'bonk') {
        emit('star', [x, top, z], { count: 8, color: ['#ffd23f', '#ffffff'], speed: 2.5, up: 2 });
        playBonk([x, top, z], 1.5);
      }
      playSqueak([x, top, z]);
      if (how === 'stomp') who?.hop(7);
      useGame.getState().addParty(PARTY_POINTS.bonkCritter);
      if (!m.golden) {
        s.count = Math.min(MOLE_ROUND, s.count + 1);
        return;
      }
      // the golden one: a party!
      s.goldenUp = false;
      s.count = 0;
      s.rounds += 1;
      playCheer();
      burstConfetti([x, top + 0.5, z], 50, 6);
      ring([cx, g + 0.1, cz], { color: '#ffd23f', radius: 3.5, duration: 0.8 });
      useGame.getState().addParty(PARTY_POINTS.goal);
      earnSticker('moles');
      if (s.kids.size >= 2) earnSticker('molefriends');
      s.kids.clear();
      s.nextPop = gameNow() + 2500;
    },
    [g, cx, cz]
  );

  // a mole that's up can be headbutted (or hit with a snowball): only then is it in the list
  const statics = useMemo(
    () =>
      MOLES.holes.map(([x, z], i) => ({
        on: null as null | (() => void),
        entry: { id: 9950 + i, position: new THREE.Vector3(x, g + TOP * 0.6, z), radius: 0.4, onBonk: (slot: number) => bonk(i, slot, 'bonk') }
      })),
    [g, bonk]
  );
  useEffect(
    () => () =>
      statics.forEach((k) => {
        k.on?.();
        k.on = null;
      }),
    [statics]
  );

  useGameFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const s = st.current;
    const now = gameNow();
    let kids = 0;
    for (const p of players.values()) if (!p.bot && !p.asleep && distXZ(p.position.x, p.position.z, cx, cz) < ACTIVE_R) kids += 1;
    moles.active = kids > 0;

    // pop one up now and then (not right under someone's feet, nor where the last one was)
    if (moles.active && now >= s.nextPop) {
      const up = s.list.filter((m) => m.state === 'up').length;
      if (up < (kids > 1 ? 3 : 2)) {
        const free: number[] = [];
        s.list.forEach((m, i) => {
          if (m.state !== 'down' || m.t < REST || i === s.last) return;
          const [x, z] = MOLES.holes[i];
          for (const p of players.values()) if (distXZ(p.position.x, p.position.z, x, z) < 0.9 && p.position.y - g < 2) return;
          free.push(i);
        });
        if (free.length > 0) {
          const i = free[Math.floor(random() * free.length)];
          const m = s.list[i];
          m.state = 'up';
          m.t = 0;
          m.golden = s.count >= MOLE_ROUND && !s.goldenUp;
          if (m.golden) s.goldenUp = true;
          s.last = i;
          playPop([MOLES.holes[i][0], g + 0.3, MOLES.holes[i][1]]);
        }
      }
      // (slower while the golden one waits, so it stands out)
      s.nextPop = now + (GAP[0] + random() * (GAP[1] - GAP[0])) * 1000 * (kids > 1 ? 0.75 : 1) * (s.goldenUp ? 1.6 : 1);
    }

    s.list.forEach((m, i) => {
      const [x, z] = MOLES.holes[i];
      m.t += dt;
      m.squash = Math.max(0, m.squash - dt * 1.5);
      if (m.state === 'up') {
        m.h = Math.min(1, m.h + dt * 6);
        if (!moles.active || (!m.golden && m.t > UP_TIME)) {
          // nobody bonked it: a giggle, and down it pops
          m.state = 'hiding';
          if (m.golden) s.goldenUp = false;
          if (moles.active) playSqueak([x, g + TOP, z]);
        } else if (m.h > 0.4) {
          // bumped into, or jumped on
          for (const p of players.values()) {
            if (p.asleep || distXZ(p.position.x, p.position.z, x, z) > TOUCH) continue;
            const up = p.position.y - g;
            if (up < -0.3 || up > TOP * m.h + RADIUS * p.size + 0.25) continue;
            bonk(i, p.slot, p.velocity.y < STOMP_VY ? 'stomp' : 'touch');
            break;
          }
        }
      } else if (m.state === 'bonked' || m.state === 'hiding') {
        m.h = Math.max(0, m.h - dt * (m.state === 'bonked' ? 2.2 : 4));
        if (m.h === 0) {
          m.state = 'down';
          m.t = 0;
          m.golden = false;
        }
      }
      // headbuttable while it's up
      const k = statics[i];
      const want = m.state === 'up' && m.h > 0.4;
      if (want && !k.on) k.on = registerStatic(k.entry);
      else if (!want && k.on) {
        k.on();
        k.on = null;
      }

      // the picture: up out of its hole, looking at the nearest animal; squashed and wobbling when bonked
      const gr = groups.current[i];
      if (!gr) return;
      gr.visible = m.h > 0;
      if (!gr.visible) return;
      gr.position.set(x, g + (m.h - 1) * (TOP + 0.05), z);
      let best = 1e9;
      for (const p of players.values()) {
        const d = distXZ(p.position.x, p.position.z, x, z);
        if (d < best) {
          best = d;
          gr.rotation.y = Math.atan2(p.position.x - x, p.position.z - z);
        }
      }
      gr.rotation.z = m.state === 'bonked' ? Math.sin(now / 60) * 0.3 * m.squash : m.state === 'up' ? Math.sin(now / 120 + i) * 0.08 : 0;
      gr.scale.set(SIZE * (1 + m.squash * 0.3), SIZE * (1 - m.squash * 0.4), SIZE * (1 + m.squash * 0.3));
      const body = bodies.current[i];
      if (body) body.material = m.golden ? mats.gold : mats.brown;
      const crown = crowns.current[i];
      if (crown) crown.visible = m.golden;
      if (m.golden && m.state === 'up' && now >= s.nextTwinkle) {
        s.nextTwinkle = now + 400;
        emit('star', [x, g + TOP + 0.3, z], { count: 3, color: ['#ffd23f', '#ffffff'], speed: 1, up: 1.2, size: 0.12 });
        playTwinkle([x, g + TOP, z], 1.4);
      }
    });
  });

  return (
    <group>
      {MOLES.holes.map(([x, z], i) => (
        <group key={i}>
          {/* the molehill: a ring of dug-up earth round a dark hole */}
          <mesh receiveShadow position={[x, g + 0.04, z]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.7]} material={lambert('#7a5230')}>
            <torusGeometry args={[0.55, 0.2, 6, 14]} />
          </mesh>
          <mesh position={[x, g + 0.02, z]} rotation={[-Math.PI / 2, 0, 0]} material={lambert('#2b1d12')}>
            <circleGeometry args={[0.42, 14]} />
          </mesh>
          {/* the mole (it pops up out of the hole) */}
          <group
            ref={(gr) => {
              groups.current[i] = gr;
            }}
            visible={false}
            position={[x, g - TOP, z]}
          >
            <mesh
              ref={(m) => {
                bodies.current[i] = m;
              }}
              castShadow
              position={[0, 0.38, 0]}
              scale={[1, 1.35, 1]}
              material={mats.brown}
            >
              <sphereGeometry args={[0.28, 14, 10]} />
            </mesh>
            <mesh position={[0, 0.54, 0.26]} material={lambert('#ff8fb5')}>
              <sphereGeometry args={[0.075, 8, 6]} />
            </mesh>
            {[-1, 1].map((sd) => (
              <mesh key={sd} position={[sd * 0.1, 0.64, 0.22]} material={lambert('#111111')}>
                <sphereGeometry args={[0.035, 6, 5]} />
              </mesh>
            ))}
            <mesh position={[0, 0.45, 0.265]} material={lambert('#ffffff')}>
              <boxGeometry args={[0.09, 0.06, 0.02]} />
            </mesh>
            <group
              ref={(c) => {
                crowns.current[i] = c;
              }}
              visible={false}
            >
              <mesh position={[0, 0.8, 0]} material={lambert('#ffd23f')}>
                <cylinderGeometry args={[0.15, 0.13, 0.14, 8, 1, true]} />
              </mesh>
              <mesh position={[0, 0.8, 0.14]} material={lambert('#ef4444')}>
                <sphereGeometry args={[0.035, 6, 5]} />
              </mesh>
            </group>
          </group>
        </group>
      ))}
    </group>
  );
}
