import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playBirdHmm, playBirdNote, playXylo } from '../audio';
import { after, gameNow, useGameFrame } from '../clock';
import { PARTY_POINTS } from '../config';
import { emit } from '../fx';
import { distXZ, XYLOPHONE } from '../layout';
import { lambert } from '../materials';
import { RADIUS } from '../player/constants';
import { debugInfo, players } from '../runtime';
import { earnSticker } from '../stickers';
import { useGame } from '../store';
import { groundHeight } from '../terrain';
import { judge, KEYS, makeTune, TUNE_BIG, TUNE_MOST, TUNE_START } from '../tune';
import { useHint } from './common';
import { randomStream } from '../rng';

const random = randomStream('xylophone');

// The giant xylophone in the playground: eight big keys to walk, run and jump along, each with
// its own note. Behind them a songbird on a post sings a little tune and lights up its keys;
// play it back (any of you, in turns or all together) and it dances, and the next tune is a
// note longer. A wrong key: it puts its head on one side and sings it again. After two tries a
// gentle glow shows the next key.

export const KEY_COLORS = ['#ff4d5e', '#ff9f1c', '#ffd23f', '#22c55e', '#14b8a6', '#3b82f6', '#a855f7', '#ff6fb5'];

const [CX, CZ] = XYLOPHONE.center;
const [BX, BZ] = XYLOPHONE.bird;
const Y0 = groundHeight(CX, CZ);
const KEY_SPECS = Array.from({ length: KEYS }, (_, i) => ({
  x: CX + (i - (KEYS - 1) / 2) * XYLOPHONE.pitch,
  z: CZ,
  w: XYLOPHONE.width,
  d: XYLOPHONE.depth[0] + ((XYLOPHONE.depth[1] - XYLOPHONE.depth[0]) * i) / (KEYS - 1)
}));
const POST = 1.6;
/** The songbird is drawn this much bigger than life, so it reads from the camera. */
const BIRD_SCALE = 1.4;
const BIRD_Y = Y0 + POST + 0.3 * BIRD_SCALE;

/** Someone (not the buddy) this close to the xylophone wakes the songbird. */
const NEAR = 9;
/** Seconds between the bird's notes, and how long it waits for a copy before singing again. */
const NOTE_GAP = 0.6;
const LISTEN_FOR = 9;
/** Nobody about for this long: the next child starts again with a short tune. */
const FORGET_AFTER = 25;

type Phase = 'wait' | 'sing' | 'listen' | 'hmm' | 'cheer';

function keyAt(x: number, z: number) {
  for (let i = 0; i < KEYS; i += 1) {
    const k = KEY_SPECS[i];
    if (Math.abs(x - k.x) < k.w / 2 + 0.05 && Math.abs(z - k.z) < k.d / 2 + 0.05) return i;
  }
  return -1;
}

const NOTE_POOL = 8;

export function Xylophone() {
  const resetToken = useGame((s) => s.resetToken);
  const mats = useMemo(() => KEY_COLORS.map((c) => new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(c), emissiveIntensity: 0 })), []);
  const keyRefs = useRef<(THREE.Group | null)[]>([]);
  const glow = useRef(new Float32Array(KEYS));
  const dip = useRef(new Float32Array(KEYS));
  const onKey = useRef(new Map<number, number>());
  const st = useRef({
    phase: 'wait' as Phase,
    phaseAt: 0,
    tune: [] as number[],
    progress: 0,
    misses: 0,
    sung: 0,
    nextNoteAt: 0,
    length: TUNE_START,
    lastInputAt: 0,
    nearSince: -1,
    awaySince: 0,
    copied: 0,
    /** The key glowing to help (after two tries), or -1. */
    hint: -1,
    struck: [] as number[]
  });
  const bird = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const beak = useRef<THREE.Mesh>(null);
  const wings = useRef<(THREE.Group | null)[]>([]);
  const beakOpenAt = useRef(-1e9);
  const notes = useRef<(THREE.Group | null)[]>([]);
  const noteState = useRef(Array.from({ length: NOTE_POOL }, () => ({ at: -1e9, x: 0, color: 0 })));
  const noteCursor = useRef(0);
  const noteMats = useMemo(() => KEY_COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true })), []);
  useHint([CX, Y0 + 1, CZ], 'jump', 5);

  useEffect(() => {
    debugInfo.xylophone = st.current;
  }, []);

  useEffect(() => {
    const s = st.current;
    s.phase = 'wait';
    s.tune = [];
    s.length = TUNE_START;
    s.progress = 0;
    s.misses = 0;
  }, [resetToken]);

  const setPhase = (phase: Phase, now: number) => {
    const s = st.current;
    s.phase = phase;
    s.phaseAt = now;
    if (phase === 'sing') {
      s.progress = 0;
      s.sung = 0;
      s.nextNoteAt = now + 400;
    }
    if (phase === 'listen') s.lastInputAt = now;
  };

  const floatNote = (key: number, now: number) => {
    const i = noteCursor.current;
    noteCursor.current = (i + 1) % NOTE_POOL;
    noteState.current[i] = { at: now, x: (random() - 0.5) * 0.6, color: key };
    const g = notes.current[i];
    g?.children.forEach((c) => ((c as THREE.Mesh).material = noteMats[key]));
  };

  /** A child (or the buddy, who only makes noise) on a key. */
  const strike = (key: number, bot: boolean, now: number) => {
    const k = KEY_SPECS[key];
    playXylo(key, [k.x, Y0, k.z]);
    dip.current[key] = 1;
    glow.current[key] = Math.max(glow.current[key], 0.7);
    const s = st.current;
    s.struck.push(key);
    if (s.struck.length > 24) s.struck.shift();
    if (bot || s.phase !== 'listen') return;
    s.lastInputAt = now;
    const verdict = judge(s.tune, s.progress, key);
    if (verdict === 'next') {
      s.progress += 1;
    } else if (verdict === 'done') {
      s.copied += 1;
      setPhase('cheer', now);
      emit('confetti', [BX, BIRD_Y + 0.4, BZ], { count: 50, speed: 5, up: 7 });
      [0, 2, 4, 7].forEach((n, i) => after(i * 0.11, () => playBirdNote(n, [BX, BIRD_Y, BZ])));
      useGame.getState().addParty(PARTY_POINTS.goal);
      earnSticker('tune');
      if (s.tune.length >= TUNE_BIG) earnSticker('bigtune');
      s.length = Math.min(TUNE_MOST, s.length + 1);
    } else {
      s.misses += 1;
      setPhase('hmm', now);
      playBirdHmm([BX, BIRD_Y, BZ]);
    }
  };

  useGameFrame((_, dt) => {
    const now = gameNow();
    const s = st.current;
    // ----- who's on which key
    let near = false;
    players.forEach((p) => {
      const bot = p.source === 'bot';
      if (!bot && !p.asleep && distXZ(p.position.x, p.position.z, CX, CZ) < NEAR) near = true;
      const i = keyAt(p.position.x, p.position.z);
      const h = p.position.y - (Y0 + XYLOPHONE.top);
      const on = i >= 0 && h > 0 && h < RADIUS + 0.3 ? i : -1;
      const before = onKey.current.get(p.slot) ?? -1;
      if (on >= 0 && on !== before) strike(on, bot, now);
      onKey.current.set(p.slot, on);
    });

    // ----- the songbird
    if (near) {
      s.awaySince = now;
      if (s.nearSince < 0) s.nearSince = now;
    } else {
      s.nearSince = -1;
      if (now - s.awaySince > FORGET_AFTER * 1000) s.length = TUNE_START;
    }
    const since = (now - s.phaseAt) / 1000;
    if (s.phase === 'wait') {
      if (near && now - s.nearSince > 1200) {
        if (s.tune.length !== s.length) s.tune = makeTune(s.length, random);
        s.misses = 0;
        setPhase('sing', now);
      }
    } else if (s.phase === 'sing') {
      if (now >= s.nextNoteAt) {
        if (s.sung < s.tune.length) {
          const key = s.tune[s.sung];
          playBirdNote(key, [BX, BIRD_Y, BZ]);
          glow.current[key] = 1;
          beakOpenAt.current = now;
          floatNote(key, now);
          s.sung += 1;
          s.nextNoteAt = now + NOTE_GAP * 1000;
        } else {
          setPhase('listen', now);
        }
      }
    } else if (s.phase === 'listen') {
      if (now - s.lastInputAt > LISTEN_FOR * 1000) setPhase(near ? 'sing' : 'wait', now);
    } else if (s.phase === 'hmm') {
      if (since > 1.4) setPhase(near ? 'sing' : 'wait', now);
    } else if (s.phase === 'cheer') {
      if (since > 2.6) {
        s.tune = makeTune(s.length, random);
        s.misses = 0;
        setPhase(near ? 'sing' : 'wait', now);
      }
    }

    // ----- the keys: they dip when struck and glow while the bird sings them; after two tries,
    // the next key to play twinkles
    const hintKey = s.phase === 'listen' && s.misses >= 2 ? s.tune[s.progress] : -1;
    s.hint = hintKey;
    for (let i = 0; i < KEYS; i += 1) {
      glow.current[i] = Math.max(0, glow.current[i] - dt * 2.2);
      dip.current[i] = Math.max(0, dip.current[i] - dt * 5);
      const twinkle = i === hintKey ? 0.25 + Math.sin(now / 160) * 0.2 : 0;
      mats[i].emissiveIntensity = Math.max(glow.current[i] * 0.9, twinkle);
      const g = keyRefs.current[i];
      if (g) g.position.y = -dip.current[i] * 0.07;
    }

    // ----- the bird's moves
    const b = bird.current;
    const hd = head.current;
    if (b && hd) {
      let y = BIRD_Y + Math.abs(Math.sin(now / 420)) * 0.03;
      let spin = 0;
      let tilt = 0;
      let yaw = Math.sin(now / 1700) * 0.25;
      if (s.phase === 'cheer') {
        y += Math.abs(Math.sin(since * 9)) * 0.35;
        spin = Math.min(1, since / 1.2) * Math.PI * 2;
        yaw = 0;
      } else if (s.phase === 'hmm') {
        tilt = Math.sin(Math.min(1, since / 0.3) * Math.PI * 0.5) * 0.45;
        yaw = Math.sin(since * 14) * 0.3 * Math.max(0, 1 - since);
      } else if (s.phase === 'sing' || s.phase === 'listen') {
        yaw = 0;
      }
      b.position.y = y;
      b.rotation.y = spin;
      hd.rotation.set(0, yaw, tilt);
      const open = Math.max(0, 1 - (now - beakOpenAt.current) / 280);
      if (beak.current) beak.current.rotation.x = 0.1 + open * 0.55;
      const flap = s.phase === 'cheer' ? Math.sin(since * 30) * 0.8 : 0;
      wings.current.forEach((w, i) => w && (w.rotation.z = (i === 0 ? 1 : -1) * (0.15 + Math.abs(flap))));
    }

    // ----- little notes float up from the bird as it sings
    noteState.current.forEach((n, i) => {
      const g = notes.current[i];
      if (!g) return;
      const t = (now - n.at) / 1000;
      g.visible = t < 1.3;
      if (!g.visible) return;
      g.position.set(BX + n.x + Math.sin(t * 6) * 0.15, BIRD_Y + 0.4 + t * 1.4, BZ + 0.2);
      g.scale.setScalar(Math.max(0.01, 1 - t / 1.3) * 0.9 + 0.1);
    });
  });

  return (
    <group>
      {/* the frame the keys rest on */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[CX, Y0 + 0.06, CZ + side * 1.0]} castShadow material={lambert('#8d5a3b')}>
          <boxGeometry args={[KEYS * XYLOPHONE.pitch + 0.4, 0.12, 0.3]} />
        </mesh>
      ))}
      <RigidBody type="fixed" colliders={false}>
        {KEY_SPECS.map((k, i) => (
          <CuboidCollider key={i} args={[k.w / 2, XYLOPHONE.top / 2, k.d / 2]} position={[k.x, Y0 + XYLOPHONE.top / 2, k.z]} />
        ))}
        <CylinderCollider args={[POST / 2, 0.12]} position={[BX, Y0 + POST / 2, BZ]} />
      </RigidBody>
      {KEY_SPECS.map((k, i) => (
        <group
          key={i}
          ref={(g) => {
            keyRefs.current[i] = g;
          }}
        >
          <mesh position={[k.x, Y0 + XYLOPHONE.top / 2, k.z]} castShadow receiveShadow material={mats[i]}>
            <boxGeometry args={[k.w, XYLOPHONE.top, k.d]} />
          </mesh>
          {/* two shiny pins, like a real one */}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[k.x, Y0 + XYLOPHONE.top + 0.01, k.z + side * (k.d / 2 - 0.35)]} material={lambert('#e5e7eb')}>
              <cylinderGeometry args={[0.09, 0.09, 0.03, 10]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* the songbird's post and perch */}
      <mesh position={[BX, Y0 + POST / 2, BZ]} castShadow material={lambert('#8d5a3b')}>
        <cylinderGeometry args={[0.1, 0.13, POST, 8]} />
      </mesh>
      <mesh position={[BX, Y0 + POST, BZ]} rotation={[0, 0, Math.PI / 2]} castShadow material={lambert('#6d4c41')}>
        <cylinderGeometry args={[0.05, 0.05, 0.9, 6]} />
      </mesh>
      <group ref={bird} position={[BX, BIRD_Y, BZ]} scale={BIRD_SCALE}>
        <mesh castShadow scale={[1, 0.95, 1.1]} material={lambert('#3b82f6')}>
          <sphereGeometry args={[0.3, 16, 12]} />
        </mesh>
        <mesh position={[0, -0.05, 0.14]} scale={[0.8, 0.8, 0.6]} material={lambert('#bfdbfe')}>
          <sphereGeometry args={[0.25, 14, 10]} />
        </mesh>
        {/* tail */}
        <mesh position={[0, 0.06, -0.36]} rotation={[-0.9, 0, 0]} material={lambert('#2563eb')}>
          <coneGeometry args={[0.13, 0.32, 6]} />
        </mesh>
        {[-1, 1].map((sx, i) => (
          <group
            key={sx}
            position={[sx * 0.27, 0.02, -0.02]}
            ref={(g) => {
              wings.current[i] = g;
            }}
          >
            <mesh position={[sx * 0.06, -0.04, 0]} scale={[0.3, 0.75, 1.1]} material={lambert('#2563eb')}>
              <sphereGeometry args={[0.2, 10, 8]} />
            </mesh>
          </group>
        ))}
        {[-1, 1].map((sx) => (
          <mesh key={`f${sx}`} position={[sx * 0.09, -0.3, 0.05]} material={lambert('#ff9f1c')}>
            <cylinderGeometry args={[0.02, 0.02, 0.1, 5]} />
          </mesh>
        ))}
        <group ref={head} position={[0, 0.3, 0.08]}>
          <mesh castShadow material={lambert('#3b82f6')}>
            <sphereGeometry args={[0.2, 14, 10]} />
          </mesh>
          {[-1, 1].map((sx) => (
            <group key={sx} position={[sx * 0.09, 0.05, 0.15]}>
              <mesh material={lambert('#ffffff')}>
                <sphereGeometry args={[0.06, 10, 8]} />
              </mesh>
              <mesh position={[0, 0, 0.04]} material={lambert('#111111')}>
                <sphereGeometry args={[0.035, 8, 6]} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, -0.01, 0.22]} rotation={[Math.PI / 2 - 0.1, 0, 0]} material={lambert('#ff9f1c')}>
            <coneGeometry args={[0.06, 0.14, 6]} />
          </mesh>
          <mesh ref={beak} position={[0, -0.05, 0.19]} rotation={[0.1, 0, 0]} material={lambert('#e0801a')}>
            <boxGeometry args={[0.08, 0.02, 0.1]} />
          </mesh>
          {/* a little crest */}
          <mesh position={[0, 0.2, -0.02]} rotation={[-0.4, 0, 0]} material={lambert('#2563eb')}>
            <coneGeometry args={[0.04, 0.14, 5]} />
          </mesh>
        </group>
      </group>

      {/* floating notes */}
      {Array.from({ length: NOTE_POOL }, (_, i) => (
        <group
          key={`n${i}`}
          visible={false}
          ref={(g) => {
            notes.current[i] = g;
          }}
        >
          <mesh scale={[1.2, 0.9, 0.5]} material={noteMats[0]}>
            <sphereGeometry args={[0.09, 8, 6]} />
          </mesh>
          <mesh position={[0.09, 0.16, 0]} material={noteMats[0]}>
            <boxGeometry args={[0.025, 0.32, 0.025]} />
          </mesh>
          <mesh position={[0.15, 0.28, 0]} rotation={[0, 0, -0.6]} material={noteMats[0]}>
            <boxGeometry args={[0.14, 0.04, 0.025]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
