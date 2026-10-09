import { CylinderCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playPoof, playWhoosh } from '../audio';
import { gameClock, gameNow, useGameFrame } from '../clock';
import { PARTY_POINTS } from '../config';
import { poof } from '../fx';
import { distXZ, KITES } from '../layout';
import { lambert } from '../materials';
import { allocPropId, debugInfo, kiteLift, players, registerHint, registerProp, type Hint, type PropEntry } from '../runtime';
import { earnSticker } from '../stickers';
import { useGame } from '../store';
import { groundHeight } from '../terrain';
import { useHint } from './common';
import { HelpPaws, Learned } from './helpPaws';

// Kites on the hill north of the mesa: three spools of string lie on the top, each with its kite
// beside it. Lick a spool to pick it up and run: the wind takes the kite out on its string, and the
// faster you run the higher it climbs. With it flying high, a jump turns into a slow, floaty glide
// (from the top of the hill, a long one). A kite way up is a sticker; two friends' kites up high
// at once, a friend sticker. Spools carried off and left lying about go home after a while.

const COLORS = ['#ef4444', '#3b82f6', '#ffd23f'];
/** Running faster than this (m/s) makes a kite climb; at RUN_TOP it climbs all the way. */
const RUN_FROM = 1.5;
const RUN_TOP = 7;
/** How far behind (m) and how high above you a kite flies: low, and all the way up. */
const BACK = [2, 5];
const UP = [1.2, 4.5];
/** The wind blows the kites out to the west and a little towards the camera (so you can always see yours). */
const WIND = new THREE.Vector3(-1, 0, 0.35).normalize();
/** A kite this high (0..1) is way up: a sticker. */
export const WAY_UP = 0.85;
const HOME_AFTER = 40;
const AWAY = 12;
/** Help, only while it's needed: standing still this long (s) with the kite down shows paw prints
 * ("run!"); a kite flying high this long (s) without a jump shows the jump bubble. */
const STAND_HELP = 2.5;
const JUMP_HELP = 1.5;
/** A kite this high (0..1) lets a jump float (see tricks.ts glide). */
const FLOATS = 0.6;

type Kite = { holder: number | null; h: number; pos: THREE.Vector3; still: number; standFor: number; highFor: number; jumpHelp: boolean; seenJump: number; helpAt: THREE.Vector3 };

/** For the tests (and the buddy). spool: where each spool is. ranHigh / glided: children who've had a kite up high / floated on one (no more help). */
export const kites = { list: [] as Kite[], spool: [] as THREE.Vector3[], high: 0, together: 0, homes: 0, ranHigh: new Learned(), glided: new Learned(), paws: [] as { shown: number; mask: number }[] };

export function Kites() {
  const [hx, hz] = KITES.hill;
  const bodies = useRef<(RapierRigidBody | null)[]>([]);
  const homes = useMemo(
    () =>
      COLORS.map((_, i) => {
        const a = (i / COLORS.length) * Math.PI * 2 + 0.4;
        const x = hx + Math.cos(a) * KITES.ring;
        const z = hz + Math.sin(a) * KITES.ring;
        return new THREE.Vector3(x, groundHeight(x, z) + 0.2, z);
      }),
    [hx, hz]
  );
  const ids = useMemo(() => homes.map(() => allocPropId()), [homes]);
  if (kites.list.length !== homes.length)
    kites.list = homes.map(
      (h): Kite => ({
        holder: null,
        h: 0,
        pos: h.clone().add(new THREE.Vector3(0.9, 0, 0)),
        still: 0,
        standFor: 0,
        highFor: 0,
        jumpHelp: false,
        seenJump: 0,
        helpAt: new THREE.Vector3()
      })
    );
  /** Paw prints for each spool's holder ("run this way"). */
  const paws = useMemo(() => homes.map(() => new HelpPaws(4)), [homes]);
  debugInfo.kites = kites;
  const kiteRefs = useRef<(THREE.Group | null)[]>([]);
  /** Children who've had the sticker for a kite way up (once each is plenty). */
  const cheered = useRef(new Set<number>());
  const strings = useRef<(THREE.Mesh | null)[]>([]);
  const tails = useRef<(THREE.Group | null)[]>([]);
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), q: new THREE.Quaternion() }), []);
  // (not for a child already holding a spool)
  useHint([hx, groundHeight(hx, hz) + 1, hz], 'lick', 4, (p) => !kites.list.some((k) => k.holder === p.slot));

  // the jump bubble over a child whose kite is up high, until they've floated once (for that
  // child only: its slot follows whoever holds the spool)
  const jumpHints = useMemo(
    () =>
      kites.list.map(
        (k, i): Hint => ({ id: 9900 + i, position: k.helpAt, radius: 2, action: 'jump', wants: (p) => p.slot === k.holder && !kites.glided.has(p) && k.jumpHelp })
      ),
    [homes]
  );
  useEffect(() => {
    const offs = jumpHints.map((h) => registerHint(h));
    return () => offs.forEach((off) => off());
  }, [jumpHints]);

  useEffect(() => {
    const offs = homes.map((_, i) => {
      const entry: PropEntry = {
        id: ids[i],
        kind: 'kite',
        getBody: () => bodies.current[i],
        radius: 0.3,
        launch: 10,
        heavy: false,
        grabbable: true,
        enabled: true,
        heldBy: null,
        onGrab: (slot) => {
          kites.list[i].holder = slot;
          // (jumps from before picking it up don't count)
          kites.list[i].seenJump = players.get(slot)?.jumpedAt ?? 0;
          return true;
        },
        onRelease: () => {
          const k = kites.list[i];
          if (k.holder != null) kiteLift.delete(k.holder);
          k.holder = null;
        }
      };
      return registerProp(entry);
    });
    return () => offs.forEach((off) => off());
  }, [homes, ids]);

  const goHome = (i: number) => {
    const rb = bodies.current[i];
    if (!rb) return;
    const t = rb.translation();
    poof([t.x, t.y, t.z], '#ffffff', 8);
    rb.setTranslation(homes[i], true);
    rb.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    poof(homes[i], '#ffffff', 8);
    playPoof(homes[i]);
    kites.homes += 1;
  };

  useGameFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const now = gameNow();
    let high = 0;
    kites.list.forEach((k, i) => {
      const rb = bodies.current[i];
      if (!rb) return;
      const t = rb.translation();
      (kites.spool[i] ??= new THREE.Vector3()).set(t.x, t.y, t.z);
      const p = k.holder != null ? players.get(k.holder) : undefined;
      if (p) {
        // climbing with how fast you run; drifting down slowly when you stop
        const speed = Math.hypot(p.velocity.x, p.velocity.z);
        const want = THREE.MathUtils.clamp((speed - RUN_FROM) / (RUN_TOP - RUN_FROM), 0.1, 1);
        k.h += (want - k.h) * dt * (want > k.h ? 0.9 : 0.35);
        kiteLift.set(p.slot, k.h);
        const back = BACK[0] + (BACK[1] - BACK[0]) * k.h;
        const sway = Math.sin(gameClock.time * 1.7 + i * 2) * (0.6 + k.h);
        tmp.a.set(p.position.x + WIND.x * back - WIND.z * sway, p.position.y + UP[0] + (UP[1] - UP[0]) * k.h, p.position.z + WIND.z * back + WIND.x * sway);
        k.pos.lerp(tmp.a, Math.min(1, dt * 2.5));
        if (!p.bot && k.h > WAY_UP && !cheered.current.has(p.slot)) {
          cheered.current.add(p.slot);
          useGame.getState().addParty(PARTY_POINTS.launch);
          earnSticker('kite');
        }
        if (!p.bot && k.h > 0.7) high += 1;

        // help, only while it's needed (and never again once it's worked)
        k.standFor = speed < 0.5 && p.grounded && k.h < 0.3 ? k.standFor + dt : 0;
        k.highFor = k.h > FLOATS && p.grounded ? k.highFor + dt : 0;
        // (once on, the jump bubble stays till the jump, or till the kite comes down: not on and
        // off with every bump on the hill)
        if (k.highFor > JUMP_HELP) k.jumpHelp = true;
        if (k.h < FLOATS - 0.1) k.jumpHelp = false;
        if (k.h > FLOATS) kites.ranHigh.add(p);
        // a jump with the kite up high: that's what the jump bubble is for (running off the top of
        // the hill floats too, but that isn't the child jumping)
        if (p.jumpedAt !== k.seenJump) {
          if (k.h > FLOATS) kites.glided.add(p);
          k.seenJump = p.jumpedAt;
          k.jumpHelp = false;
        }
        k.helpAt.copy(p.position);
        jumpHints[i].slot = p.slot;
      } else {
        k.standFor = 0;
        k.highFor = 0;
        k.jumpHelp = false;
        // lying on the grass beside its spool
        k.h = 0;
        tmp.a.set(t.x + 0.9, groundHeight(t.x + 0.9, t.z) + 0.08, t.z);
        k.pos.lerp(tmp.a, Math.min(1, dt * 3));
      }

      // the picture: the kite (facing the way the wind takes it), its tail, the string
      const kg = kiteRefs.current[i];
      if (kg) {
        kg.position.copy(k.pos);
        if (p) {
          // (face on to the camera, leaning back in the wind, like a kite in a picture)
          kg.rotation.set(-0.25 - (1 - k.h) * 0.4, 0, Math.sin(gameClock.time * 2.3 + i) * 0.25);
        } else kg.rotation.set(-Math.PI / 2, 0, 0.6);
      }
      const tail = tails.current[i];
      if (tail) tail.children.forEach((c, n) => (c.position.x = Math.sin(gameClock.time * 4 + n * 0.9 + i) * 0.12 * n));
      const str = strings.current[i];
      if (str) {
        str.visible = !!p;
        if (p) {
          tmp.b.set(t.x, t.y, t.z);
          const len = tmp.b.distanceTo(k.pos);
          str.position.copy(tmp.b).lerp(k.pos, 0.5);
          str.scale.set(1, len, 1);
          str.quaternion.setFromUnitVectors(tmp.up, tmp.a.copy(k.pos).sub(tmp.b).normalize());
        }
      }

      // paw prints ahead of a child standing still with the kite down: "run!" (gone once they run)
      const help = paws[i];
      const wantSteps = !!p && !p.bot && !kites.ranHigh.has(p) && (k.standFor > STAND_HELP || (help.shown > 0 && Math.hypot(p.velocity.x, p.velocity.z) < RUN_FROM));
      if (p && wantSteps && help.shown === 0) {
        const fx = Math.sin(p.facing);
        const fz = Math.cos(p.facing);
        help.place(
          [0, 1, 2, 3].map((n) => {
            const side = n % 2 ? 0.16 : -0.16;
            const ahead = 0.9 + n * 0.55;
            return { x: p.position.x + fx * ahead + fz * side, z: p.position.z + fz * ahead - fx * side, angle: p.facing };
          })
        );
      }
      help.update(wantSteps, dt, p ? [p.slot] : []);
      kites.paws[i] = { shown: help.shown, mask: help.mask };

      // carried off and left lying about: home after a while
      const v = rb.linvel();
      const away = distXZ(t.x, t.z, hx, hz) > AWAY;
      if (k.holder != null || !away || Math.hypot(v.x, v.y, v.z) > 0.3) k.still = now;
      else if (now - k.still > HOME_AFTER * 1000) {
        goHome(i);
        k.still = now;
      }
      if (t.y < -5) goHome(i);
    });
    // two friends with their kites up high together
    if (high >= 2 && kites.together === 0) {
      kites.together += 1;
      playWhoosh([hx, groundHeight(hx, hz) + 2, hz]);
      earnSticker('kitefriends');
    }
    kites.high = high;
  });

  return (
    <group>
      {paws.map((pw, i) => (
        <primitive key={`paws${i}`} object={pw.group} />
      ))}
      {homes.map((h, i) => (
        <group key={i}>
          {/* the spool of string (what you pick up) */}
          <RigidBody
            ref={(rb) => {
              bodies.current[i] = rb;
            }}
            position={[h.x, h.y, h.z]}
            colliders={false}
            linearDamping={0.4}
            angularDamping={0.6}
          >
            <CylinderCollider args={[0.13, 0.22]} density={0.6} friction={0.9} />
            <mesh castShadow material={lambert('#8b5a2b')}>
              <cylinderGeometry args={[0.22, 0.22, 0.06, 12]} />
            </mesh>
            <mesh material={lambert('#fff7e6')}>
              <cylinderGeometry args={[0.16, 0.16, 0.2, 12]} />
            </mesh>
            <mesh position={[0, 0.13, 0]} material={lambert('#8b5a2b')}>
              <cylinderGeometry args={[0.22, 0.22, 0.06, 12]} />
            </mesh>
          </RigidBody>
          {/* the kite: a diamond with a cross, and a tail of bows */}
          <group
            ref={(g) => {
              kiteRefs.current[i] = g;
            }}
          >
            <mesh castShadow rotation={[0, 0, Math.PI / 4]} scale={[1, 1.35, 1]} material={lambert(COLORS[i])}>
              <planeGeometry args={[0.8, 0.8]} />
            </mesh>
            <mesh position={[0, 0, 0.01]} material={lambert('#ffffff')}>
              <boxGeometry args={[0.04, 1.5, 0.02]} />
            </mesh>
            <mesh position={[0, 0.15, 0.01]} material={lambert('#ffffff')}>
              <boxGeometry args={[1.1, 0.04, 0.02]} />
            </mesh>
            <group
              ref={(g) => {
                tails.current[i] = g;
              }}
              position={[0, -0.8, 0]}
            >
              {[0, 1, 2, 3].map((n) => (
                <mesh key={n} position={[0, -n * 0.32, 0]} rotation={[0, 0, Math.PI / 4]} material={lambert(COLORS[(i + n + 1) % COLORS.length])}>
                  <boxGeometry args={[0.16, 0.16, 0.02]} />
                </mesh>
              ))}
            </group>
          </group>
          {/* the string, from the spool up to the kite */}
          <mesh
            ref={(m) => {
              strings.current[i] = m;
            }}
            visible={false}
            material={lambert('#f8fafc')}
          >
            <cylinderGeometry args={[0.015, 0.015, 1, 4]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
