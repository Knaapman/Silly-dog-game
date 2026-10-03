import { CuboidCollider, RigidBody, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playBoing, playBonk, playCheer, playCrumble, playPoof, playStrike } from '../audio';
import { gameNow, useGameFrame } from '../clock';
import { PARTY_POINTS } from '../config';
import { burstConfetti, emit, poof } from '../fx';
import { BLOCKS } from '../layout';
import { allocPropId, debugInfo, players, registerProp, shakeCamera, type PlayerRuntime, type PropEntry } from '../runtime';
import { earnSticker } from '../stickers';
import { useGame } from '../store';
import { groundHeight } from '../terrain';
import { RADIUS } from '../player/constants';
import { useHint } from './common';

// Giant soft building blocks on the playground floor: a little tower in the middle and the rest
// lying round it. Lick a block to pick it up and carry it about; lick again and it hops onto the
// top of the tower in front of you (or, with no tower in reach, you set it down there). Five high
// is a cheer and a sticker (with blocks from two children on it, a friend sticker), and then the
// best bit: headbutt it and down it all comes, crash! Blocks carried off and left lying about
// somewhere hop back home after a while. Playing alone, the buddy fetches blocks for your tower.

const S = BLOCKS.size;
const HALF = S / 2;
const COLORS = ['#ef4444', '#3b82f6', '#ffd23f', '#22c55e', '#f97316', '#a855f7'];
/** Putting a block on a tower: the tower's top within this far of the spot in front of you (m, across)... */
const SNAP_R = 1.4;
/** ...and no higher than this above you (m): stand on something (or a friend) to build higher. */
const REACH_UP = 3.2;
/** A tower this high: a cheer and a sticker. */
export const BLOCK_STICKER = 5;
/** A tower at least CRASH_FROM high losing three blocks at once: crash! */
const CRASH_FROM = 4;
/** Lying still this long, this far from the middle (s, m): back home. */
const HOME_AFTER = 40;
const AWAY = 10;

type Block = { holder: number | null; placedBy: number | null; stillSince: number; below: number; above: number; height: number };

/** For the buddy and the tests: every block, where it is, what's on what, and the child's tower. */
export const blocks = {
  list: [] as Block[],
  pos: [] as THREE.Vector3[],
  /** The block a child last put down or stacked, and the top of the tower it's in (-1: none). */
  kidBlock: -1,
  kidTop: -1,
  lastKidPlace: -1e9,
  tallest: 0,
  peak: 0,
  peakAt: 0,
  peakPos: new THREE.Vector3(),
  celebrated: 0,
  snaps: 0,
  buddySnaps: 0,
  setDowns: 0,
  towers: 0,
  crashes: 0,
  homes: 0
};

/** Is a child busy building (holding a block, or put one down lately), near the blocks? */
export function kidBuilding(kid: PlayerRuntime, now: number) {
  if (Math.hypot(kid.position.x - BLOCKS.center[0], kid.position.z - BLOCKS.center[1]) > 8) return false;
  return blocks.list.some((b) => b.holder === kid.slot) || now - blocks.lastKidPlace < 20000;
}

/** A toy block face: the colour, with a lighter square inset and a darker rim. */
function blockTexture(color: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const base = new THREE.Color(color);
  ctx.fillStyle = `#${base.clone().multiplyScalar(0.75).getHexString()}`;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = color;
  ctx.fillRect(4, 4, 56, 56);
  ctx.fillStyle = `#${base.clone().lerp(new THREE.Color('#ffffff'), 0.35).getHexString()}`;
  ctx.fillRect(16, 16, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const yawQuat = (yaw: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
const tmp = new THREE.Vector3();

export function Blocks() {
  const [cx, cz] = BLOCKS.center;
  const g = groundHeight(cx, cz);
  const bodies = useRef<(RapierRigidBody | null)[]>([]);
  const colliders = useRef<(RapierCollider | null)[]>([]);
  const homes = useMemo(
    () =>
      Array.from({ length: BLOCKS.count }, (_, i) => {
        if (i < BLOCKS.tower) return new THREE.Vector3(cx, g + HALF + 0.01 + i * (S + 0.01), cz);
        const a = ((i - BLOCKS.tower) / (BLOCKS.count - BLOCKS.tower)) * Math.PI * 2;
        const x = cx + Math.cos(a) * BLOCKS.ring;
        const z = cz + Math.sin(a) * BLOCKS.ring;
        return new THREE.Vector3(x, groundHeight(x, z) + HALF + 0.01, z);
      }),
    [cx, cz, g]
  );
  const ids = useMemo(() => homes.map(() => allocPropId()), [homes]);
  const mats = useMemo(() => COLORS.map((c) => new THREE.MeshLambertMaterial({ map: blockTexture(c) })), []);
  const geo = useMemo(() => new THREE.BoxGeometry(S, S, S), []);
  const resetToken = useGame((s) => s.resetToken);
  useHint([cx, g + 1, cz], 'lick', 4);
  if (blocks.list.length !== homes.length) {
    blocks.list = homes.map((): Block => ({ holder: null, placedBy: null, stillSince: 0, below: -1, above: -1, height: 1 }));
    blocks.pos = homes.map((h) => h.clone());
  }
  debugInfo.blocks = blocks;

  const goHome = (i: number) => {
    const rb = bodies.current[i];
    if (!rb) return;
    const t = rb.translation();
    poof([t.x, t.y, t.z], '#ffffff', 10);
    rb.setTranslation(homes[i], true);
    rb.setRotation(yawQuat(0), true);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    poof(homes[i], '#ffffff', 10);
    playPoof(homes[i]);
    blocks.list[i].placedBy = null;
    blocks.homes += 1;
  };

  /** A face of the block is pointing up (it's lying flat, not on an edge). */
  const flat = (rb: RapierRigidBody) => {
    const r = rb.rotation();
    const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q.invert());
    return Math.max(Math.abs(up.x), Math.abs(up.y), Math.abs(up.z)) > 0.95;
  };

  /** Licked again while carrying block `i`: onto the tower in front, or set down right here. */
  const place = (i: number, p: PlayerRuntime) => {
    const rb = bodies.current[i];
    if (!rb) return false;
    const now = gameNow();
    const fx = Math.sin(p.facing);
    const fz = Math.cos(p.facing);
    const px = p.position.x + fx;
    const pz = p.position.z + fz;
    let best = -1;
    let bestScore = Infinity;
    blocks.list.forEach((b, j) => {
      const jb = bodies.current[j];
      if (j === i || !jb || b.holder != null || b.above >= 0) return;
      const t = jb.translation();
      const v = jb.linvel();
      if (Math.hypot(v.x, v.y, v.z) > 1.5 || !flat(jb)) return;
      const d = Math.hypot(t.x - px, t.z - pz);
      const top = t.y + HALF;
      if (d > SNAP_R || top > p.position.y + REACH_UP || top < p.position.y - 1.5) return;
      // (not onto someone standing up there)
      for (const q of players.values()) if (q.slot !== p.slot && Math.hypot(q.position.x - t.x, q.position.z - t.z) < 0.8 && q.position.y > top - 0.2 && q.position.y < top + 1.8) return;
      const score = d - 0.4 * b.height;
      if (score < bestScore) {
        bestScore = score;
        best = j;
      }
    });
    const b = blocks.list[i];
    b.placedBy = p.slot;
    if (!p.bot) {
      blocks.kidBlock = i;
      blocks.lastKidPlace = now;
    }
    if (best >= 0) {
      // hop! onto the top, lined up with the block below
      const jb = bodies.current[best]!;
      const t = jb.translation();
      rb.setTranslation({ x: t.x, y: t.y + S + 0.01, z: t.z }, true);
      rb.setRotation(jb.rotation(), true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
      const level = blocks.list[best].height + 1;
      playBoing([t.x, t.y + S, t.z], 0.75 + level * 0.12);
      emit('puff', [t.x, t.y + HALF + 0.05, t.z], { count: 6, color: '#ffffff', speed: 1.2, up: 0.5, size: 0.25 });
      blocks.snaps += 1;
      if (p.bot) blocks.buddySnaps += 1;
      return true;
    }
    // no tower in reach: set it down right here, flat, the way we're facing (a carried block
    // passes through things: if it's inside another block, beside us instead)
    const free = (x: number, y: number, z: number) => blocks.list.every((o, j) => j === i || o.holder != null || blocks.pos[j].distanceTo(tmp.set(x, y, z)) > S * 1.02);
    const here = rb.translation();
    if (!free(here.x, here.y, here.z)) {
      const y = p.position.y - RADIUS + HALF + 0.05;
      for (const a of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
        const x = p.position.x + Math.sin(p.facing + a) * 1.2;
        const z = p.position.z + Math.cos(p.facing + a) * 1.2;
        if (!free(x, y, z)) continue;
        rb.setTranslation({ x, y, z }, true);
        break;
      }
    }
    rb.setRotation(yawQuat(p.facing), true);
    rb.setLinvel({ x: 0, y: -0.5, z: 0 }, true);
    rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    blocks.setDowns += 1;
    return true;
  };

  useEffect(() => {
    const offs = homes.map((_, i) => {
      const entry: PropEntry = {
        id: ids[i],
        kind: 'block',
        getBody: () => bodies.current[i],
        radius: 0.55,
        launch: 8,
        heavy: false,
        grabbable: true,
        enabled: true,
        heldBy: null,
        onGrab: (slot) => {
          const b = blocks.list[i];
          b.holder = slot;
          b.placedBy = null;
          // carried, it passes through things (no knocking the tower over on the way to it)
          colliders.current[i]?.setSensor(true);
          return true;
        },
        onRelease: (thrown) => {
          const b = blocks.list[i];
          const p = b.holder != null ? players.get(b.holder) : undefined;
          b.holder = null;
          const placed = thrown && p ? place(i, p) : false;
          colliders.current[i]?.setSensor(false);
          return placed;
        }
      };
      return registerProp(entry);
    });
    return () => offs.forEach((off) => off());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homes, ids]);

  // the red button puts the park back
  const lastReset = useRef(resetToken);
  useEffect(() => {
    if (lastReset.current === resetToken) return;
    lastReset.current = resetToken;
    homes.forEach((_, i) => goHome(i));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  useGameFrame(() => {
    const now = gameNow();
    const L = blocks.list;
    const n = L.length;
    for (let i = 0; i < n; i += 1) {
      const rb = bodies.current[i];
      if (!rb) return;
      const t = rb.translation();
      blocks.pos[i].set(t.x, t.y, t.z);
      L[i].below = -1;
      L[i].above = -1;
    }

    // what's standing on what (only blocks lying still and flat, lined up on top of each other)
    for (let i = 0; i < n; i += 1) {
      if (L[i].holder != null) continue;
      const a = blocks.pos[i];
      for (let j = 0; j < n; j += 1) {
        if (j === i || L[j].holder != null) continue;
        const b = blocks.pos[j];
        const dy = a.y - b.y;
        if (dy > S * 0.85 && dy < S * 1.15 && Math.abs(a.x - b.x) < HALF && Math.abs(a.z - b.z) < HALF) {
          L[i].below = j;
          L[j].above = i;
          break;
        }
      }
    }
    let tallest = 0;
    let tallTop = -1;
    for (let i = 0; i < n; i += 1) {
      let h = 1;
      for (let k = L[i].below; k >= 0 && h <= n; k = L[k].below) h += 1;
      L[i].height = h;
      if (L[i].above < 0 && L[i].holder == null && h > tallest) {
        tallest = h;
        tallTop = i;
      }
    }
    blocks.tallest = tallest;
    // the child's tower: the top of the pile their last block is in
    let top = blocks.kidBlock;
    if (top >= 0 && L[top].holder != null) top = -1;
    for (let k = 0; top >= 0 && L[top].above >= 0 && k < n; k += 1) top = L[top].above;
    blocks.kidTop = top;

    // five high: a cheer (and stickers)
    if (tallest >= BLOCK_STICKER && tallest > blocks.celebrated && tallTop >= 0) {
      blocks.celebrated = tallest;
      blocks.towers += 1;
      const t = blocks.pos[tallTop];
      playCheer();
      burstConfetti([t.x, t.y + 1, t.z], 50, 6);
      useGame.getState().addParty(PARTY_POINTS.goal);
      earnSticker('blocks');
      const builders = new Set<number>();
      for (let k = tallTop; k >= 0; k = L[k].below) {
        const by = L[k].placedBy != null ? players.get(L[k].placedBy!) : undefined;
        if (by && !by.bot) builders.add(by.slot);
      }
      if (builders.size >= 2) earnSticker('blockfriends');
    }
    if (tallest < 3) blocks.celebrated = 0;

    // a tall tower coming down all at once: crash!
    if (tallest >= blocks.peak) {
      blocks.peak = tallest;
      blocks.peakAt = now;
      if (tallTop >= 0) blocks.peakPos.copy(blocks.pos[tallTop]);
    } else if (blocks.peak >= CRASH_FROM && blocks.peak - tallest >= 3) {
      blocks.crashes += 1;
      blocks.peak = tallest;
      blocks.peakAt = now;
      const c = blocks.peakPos;
      playCrumble([c.x, c.y, c.z]);
      playStrike();
      playBonk([c.x, c.y, c.z], 0.6);
      shakeCamera(0.35);
      emit('puff', [c.x, groundHeight(c.x, c.z) + 0.4, c.z], { count: 18, color: ['#ffffff', '#e8e0d0'], speed: 4, up: 1.5, size: 0.4 });
      emit('star', [c.x, c.y, c.z], { count: 14, color: COLORS, speed: 5, up: 4 });
      useGame.getState().addParty(PARTY_POINTS.strike);
    } else if (now - blocks.peakAt > 3000) blocks.peak = tallest;

    // carried off and left lying about: home after a while (straight away if it fell out of the park)
    for (let i = 0; i < n; i += 1) {
      const rb = bodies.current[i]!;
      const p = blocks.pos[i];
      if (p.y < -5) {
        goHome(i);
        continue;
      }
      const v = rb.linvel();
      const away = Math.hypot(p.x - cx, p.z - cz) > AWAY;
      if (L[i].holder != null || !away || Math.hypot(v.x, v.y, v.z) > 0.3) L[i].stillSince = now;
      else if (now - L[i].stillSince > HOME_AFTER * 1000) {
        goHome(i);
        L[i].stillSince = now;
      }
    }
  });

  return (
    <group>
      {homes.map((h, i) => (
        <RigidBody
          key={i}
          ref={(rb) => {
            bodies.current[i] = rb;
          }}
          position={[h.x, h.y, h.z]}
          colliders={false}
          linearDamping={0.1}
          angularDamping={0.4}
        >
          <CuboidCollider
            ref={(c) => {
              colliders.current[i] = c;
            }}
            args={[HALF, HALF, HALF]}
            density={0.4}
            friction={0.9}
            restitution={0.05}
          />
          <mesh castShadow receiveShadow geometry={geo} material={mats[i % COLORS.length]} />
        </RigidBody>
      ))}
    </group>
  );
}
