import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playBoom, playCheer, playFanfare, playPoof, playSnore, playWhoosh, playXylo } from '../audio';
import { gameNow, useGameFrame } from '../clock';
import { burstConfetti, emit, poof, ring } from '../fx';
import { FINALE, finaleOn, useFinale } from '../finale';
import { FOUNTAIN } from '../layout';
import { debugInfo, players } from '../runtime';
import { settings } from '../settings';
import { STICKERS, useStickers } from '../stickers';
import { useGame } from '../store';
import { groundHeight } from '../terrain';
import { randomStream } from '../rng';

const random = randomStream('finale');

// The grand finale's show in the park (see finale.ts): everyone gathers round the fountain, on
// the side nearest the camera, facing it; rockets whoosh up from the fountain and burst over it;
// at bedtime the animals then get sleepy; for the album, crowns. Also starts the show: the play
// timer from the grown-ups menu, and the very last sticker.

/** Where everyone stands, round the fountain's front (the camera's side), this far out (m). */
const RING = 7.5;
const RAINBOW = ['#ff4d5e', '#ff9f1c', '#ffd23f', '#22c55e', '#3b82f6', '#a855f7', '#ff8fd8'];
/** "Twinkle, twinkle, little star" on the xylophone's notes (C D E F G A B C = 0..7), for the night. */
const LULLABY = [0, 0, 4, 4, 5, 5, 4, -1, 3, 3, 2, 2, 1, 1, 0];

type Rocket = { x: number; y: number; z: number; vy: number; burstAt: number; color: string; big: boolean };

/** Spot `i` of `n` round the front of the fountain, and the way to face (towards it). */
function spot(i: number, n: number, out: THREE.Vector3) {
  const [fx, fz] = FOUNTAIN.center;
  const spread = Math.min(Math.PI * 0.75, 0.55 * Math.max(1, n - 1));
  const a = Math.PI / 2 + (n > 1 ? -spread / 2 + (spread * i) / (n - 1) : 0);
  out.set(fx + Math.cos(a) * RING, 0, fz + Math.sin(a) * RING);
  out.y = groundHeight(out.x, out.z) + 0.6;
  return Math.atan2(fx - out.x, fz - out.z);
}

export function Finale() {
  const rockets = useRef<Rocket[]>([]);
  const nextRocket = useRef(0);
  const played = useRef(0);
  const tmp = useMemo(() => ({ p: new THREE.Vector3() }), []);
  debugInfo.finale = { rockets: rockets.current, played };

  // back to the start screen: the timer starts again, and any show stops
  useEffect(
    () =>
      useGame.subscribe((s, prev) => {
        if (s.phase === 'title' && prev.phase !== 'title') {
          played.current = 0;
          if (finaleOn()) {
            release();
            useFinale.getState().end();
          }
        }
      }),
    []
  );

  // the last sticker: a crown party (once, when it comes in)
  useEffect(
    () =>
      useStickers.subscribe((s, prev) => {
        // (a broken album, got not even a list, is the fault guard's business: not a show, not a crash)
        if (!Array.isArray(s.got) || s.got.length !== STICKERS.length) return;
        if (!Array.isArray(prev.got) || prev.got.length < STICKERS.length) useFinale.getState().start('album');
      }),
    []
  );

  useGameFrame((_, dt) => {
    const f = useFinale.getState();
    const now = gameNow();
    // ----- the play timer (grown-ups menu): playing this long brings the bedtime show
    const minutes = settings().bedtime;
    if (f.phase === 'off' && useGame.getState().phase === 'play') {
      played.current += dt;
      if (minutes > 0 && played.current >= minutes * 60) {
        played.current = 0;
        f.start('bedtime');
      }
    }
    if (f.phase === 'off') return;
    const since = (now - f.at) / 1000;
    const all = [...players.values()].sort((a, b) => a.slot - b.slot);

    // ----- everyone at the fountain, held there for the show
    if (f.phase !== 'night') {
      all.forEach((p, i) => {
        const face = spot(i, all.length, tmp.p);
        if (f.phase === 'gather' && since < dt * 1.5) {
          poof([p.position.x, p.position.y + 0.5, p.position.z], '#ffffff', 10);
          poof([tmp.p.x, tmp.p.y + 0.3, tmp.p.z], '#ffffff', 10);
        }
        p.hold(tmp.p, false, face);
      });
    }
    if (f.phase === 'gather' && since < dt * 1.5) playPoof();

    // ----- the phases
    if (f.phase === 'gather' && since >= FINALE.gather) {
      f.setPhase('show');
      nextRocket.current = now;
      playFanfare();
    } else if (f.phase === 'show') {
      if (now >= nextRocket.current && since < FINALE.show - 2.5) {
        // one after another, faster and faster, and a big bunch at the end
        const last = since > FINALE.show - 4;
        const n = last ? 4 : 2;
        for (let k = 0; k < n; k += 1) launch(rockets.current, last);
        nextRocket.current = now + (last ? 650 : Math.max(380, 900 - since * 50));
      }
      if (since >= FINALE.show) {
        playCheer();
        if (f.kind === 'bedtime') f.setPhase('sleep');
        else {
          f.setPhase('crowns');
          all.forEach((p) => {
            if (!p.bot) useGame.getState().setHat(p.slot, 'crown');
            burstConfetti([p.position.x, p.position.y + 1.6, p.position.z], 30, 4);
          });
        }
      }
    } else if (f.phase === 'sleep') {
      // yawns, sleepy bubbles and snores all round
      all.forEach((p, i) => {
        if (random() < dt * 1.3) emit('puff', [p.position.x, p.position.y + 1.3 * p.size, p.position.z], { count: 1, color: ['#ffffff', '#dfe9ff'], speed: 0.2, up: 0.7, size: 0.2, gravity: -0.3, life: 1.8 });
        if ((since + i * 0.7) % 2.4 < dt) playSnore(p.position);
      });
      if (since >= FINALE.sleep) {
        f.setPhase('night');
        // (on the real clock: the night screen pauses the game's)
        LULLABY.forEach((n, i) => n >= 0 && window.setTimeout(() => playXylo(n, undefined, 0.5), 300 + i * 450));
      }
    } else if (f.phase === 'crowns' && since >= FINALE.crowns) {
      release();
      f.end();
    }

    // ----- the rockets: up they go, trailing sparks, and burst
    const list = rockets.current;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const r = list[i];
      r.y += r.vy * dt;
      r.vy = Math.max(2, r.vy - 6 * dt);
      emit('star', [r.x, r.y, r.z], { count: 1, color: ['#fff3a8', '#ffffff'], speed: 0.4, up: -0.5, size: 0.12, life: 0.45 });
      if (now >= r.burstAt) {
        const at: [number, number, number] = [r.x, r.y, r.z];
        burstConfetti(at, r.big ? 90 : 60, r.big ? 8 : 6);
        emit('star', at, { count: r.big ? 44 : 30, color: [r.color, r.color, '#ffffff'], speed: r.big ? 7 : 5.5, up: 0.5, size: 0.5, gravity: 1.5, life: 1.4 });
        ring(at, { color: r.color, radius: r.big ? 4.5 : 3.2, duration: 0.7 });
        ring(at, { color: '#ffffff', radius: r.big ? 2.4 : 1.6, duration: 0.45 });
        playBoom(at);
        list.splice(i, 1);
      }
    }
  });

  return null;
}

/**
 * A rocket from the plaza between the fountain and everyone watching, bursting a few metres up:
 * the camera looks down from behind the animals, so anything much higher (or further back, over
 * the fountain) would be off the top of the picture.
 */
function launch(list: Rocket[], big: boolean) {
  const [fx, fz] = FOUNTAIN.center;
  const x = fx + (random() - 0.5) * 9;
  const z = fz + FOUNTAIN.basinRadius - 1 + random() * 1.5;
  const g = groundHeight(x, z);
  list.push({ x, y: g + 0.4, z, vy: 8 + random() * 2, burstAt: gameNow() + 330 + random() * 170, color: RAINBOW[Math.floor(random() * RAINBOW.length)], big });
  playWhoosh([x, g, z]);
}

/** Everyone free to play again. */
function release() {
  players.forEach((p) => p.hold(null));
}

/** "Play again" from the night screen: wake up, and off you go. */
export function wakeUp() {
  if (!finaleOn()) return;
  release();
  useFinale.getState().end();
}
