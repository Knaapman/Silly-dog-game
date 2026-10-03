import { BallCollider, RigidBody, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playCatSound, playRustle } from '../audio';
import { CAT_COUNT, chaseParams, flocks, parkCats, treeShakeListeners, useChase, type CatMode, type CatRuntime } from '../chase';
import { gameClock, gameNow, useGameFrame } from '../clock';
import { MOVE, WORLD_HALF_X, WORLD_HALF_Z } from '../config';
import { emit, poof } from '../fx';
import { rumble, type SourceId } from '../input';
import { CAT_HOMES, distXZ, TREES } from '../layout';
import { lambert } from '../materials';
import { allocPropId, noises, players, registerProp, statics, type PlayerRuntime, type PropEntry } from '../runtime';
import { settings, SPEED_FACTOR } from '../settings';
import { earnSticker } from '../stickers';
import { groundHeight, isInWater } from '../terrain';
import { useGame } from '../store';
import { eatFish, nearestFish } from './Fishing';

/** `stalk` when a cat is after a fish rather than a flock of birds. */
const FISH = -2;

// Park cats: the thing to chase. They nap, groom and stalk the birds. Come close (or bark) and
// they bolt, a little slower than you and slower still once they're tired, so a child who keeps
// going always catches one (how much slower: the grown-ups' setting, or each child's own skill,
// see chase.ts). Tag it and it yowls and flees up the nearest tree; bark under the tree (or
// headbutt it) and down it tumbles, dizzy, and off it runs again. Tag all four and they follow
// you round the park in a line for a while. Only real children startle a cat: the buddy running
// about doesn't spoil sneaking up on one (but a fleeing cat keeps away from the buddy too).

const R = 0.42;
/** The model is drawn at this size (big enough to spot from the camera). */
const SIZE = 1.45;
/** In the conga line, how far behind the one in front each cat trots. */
const CONGA_GAP = 1.7;
const PALETTES = [
  { fur: '#f59e3b', stripe: '#c2621a', light: '#ffe3c2' }, // ginger tabby
  { fur: '#34343c', stripe: '#1f1f25', light: '#ffffff' }, // black with white socks
  { fur: '#9aa3ad', stripe: '#6b7580', light: '#eef1f4' }, // grey tabby
  { fur: '#fff4e6', stripe: '#e07b2e', light: '#fff4e6' } // calico
];
export const CAT_COLORS = PALETTES.map((p) => p.fur);

/**
 * Where a cat sits in tree `i`: out on a branch on the camera's side, so you can see it up
 * there (on top of the tree it would be off the top of the screen). Not palms: their crown is
 * off to one side.
 */
const treeScale = (i: number) => 0.9 + ((i * 7) % 5) * 0.06;
function perchOf(i: number, out: THREE.Vector3) {
  const t = TREES[i];
  const round = t.kind === 'round' || t.kind === 'blossom';
  const sc = treeScale(i);
  return out.set(t.at[0], (round ? 1.85 : 1.45) * sc + R, t.at[1] + (round ? 1.5 : 1.65) * sc);
}

function wrap(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** A heading near `a` that doesn't run into the lake or the hedge. */
function clearHeading(x: number, z: number, a: number) {
  for (const off of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3]) {
    const h = a + off;
    const px = x + Math.sin(h) * 3;
    const pz = z + Math.cos(h) * 3;
    if (Math.abs(px) > WORLD_HALF_X - 3 || Math.abs(pz) > WORLD_HALF_Z - 3 || isInWater(px, pz)) continue;
    return h;
  }
  return a + Math.PI;
}

type Idle = 'sit' | 'groom' | 'walk' | 'nap';

function Cat({ index }: { index: number }) {
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const yaw = useRef<THREE.Group>(null);
  const pose = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const tail = useRef<(THREE.Group | null)[]>([]);
  const legs = useRef<(THREE.Group | null)[]>([]);
  const branch = useRef<THREE.Mesh>(null);
  const id = useMemo(() => allocPropId(), []);
  const pal = PALETTES[index % PALETTES.length];
  const home = useMemo(() => new THREE.Vector3(CAT_HOMES[index][0], groundHeight(CAT_HOMES[index][0], CAT_HOMES[index][1]) + R + 0.2, CAT_HOMES[index][1]), [index]);
  const rt = useMemo<CatRuntime>(() => ({ index, position: home.clone(), mode: 'idle', tree: -1, getBody: () => body.current }), [index, home]);
  const s = useRef({
    mode: 'idle' as CatMode,
    idle: 'sit' as Idle,
    timer: 1 + index,
    facing: index * 1.7,
    target: home.clone(),
    walk: 0,
    fleeFor: 0,
    calmFor: 0,
    boost: 0,
    lastNoise: 0,
    stuckFor: 0,
    jumpAt: 0,
    tree: -1,
    perch: new THREE.Vector3(),
    climbFrom: new THREE.Vector3(),
    climbT: -1,
    treeSince: 0,
    teaseIn: 2,
    shakenBy: null as number | null,
    gentle: false,
    tagBy: null as number | null,
    heldBy: null as number | null,
    stalk: -1,
    pounceAt: 0,
    fallT: 0,
    /** Tumbling out of a tree (the sticker is for that, not for any old fall). */
    fromTree: false,
    flip: 0,
    arch: 0,
    /** The child chasing us, when they startled us, and how long they've kept it up. */
    chaser: -1,
    chaseStart: 0,
    chasedFor: 0,
    congaMeow: 0,
    /** Hops over something in the way since this cat last caught up with the line. */
    congaHops: 0,
    /** After the conga the cats wander off in peace: no tagging or startling until then. */
    truceUntil: 0,
    /** Walking into something (another cat, say): step round it this way for a moment. */
    sidestep: 0,
    sidestepUntil: 0
  });
  const entryRef = useRef<PropEntry | null>(null);
  const resetToken = useGame((st) => st.resetToken);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  const setMode = (mode: CatMode) => {
    s.current.mode = mode;
    rt.mode = mode;
  };

  /** Loose from the tree (or from anything unusual): a normal body again. */
  const ground = () => {
    collider.current?.setSensor(false);
    body.current?.setGravityScale(1, true);
    s.current.climbT = -1;
    s.current.tree = -1;
    rt.tree = -1;
  };

  /** Flying through the air (headbutted, thrown): when it lands, it counts as tagged. */
  const tumble = (slot: number | null) => {
    const c = s.current;
    ground();
    setMode('fall');
    c.fallT = 0;
    c.gentle = false;
    c.fromTree = false;
    c.shakenBy = null;
    c.tagBy = slot;
    c.flip = 1;
    playCatSound('yowl', body.current?.translation());
  };

  useEffect(() => {
    parkCats[index] = rt;
    const entry: PropEntry = {
      id,
      kind: 'cat',
      getBody: () => body.current,
      radius: 0.4,
      launch: 9,
      heavy: false,
      grabbable: true,
      enabled: true,
      heldBy: null,
      onBonk: (slot) => tumble(players.get(slot)?.bot ? null : slot),
      onGrab: (slot) => {
        const c = s.current;
        ground();
        c.heldBy = slot;
        setMode('held');
        playCatSound('hiss', body.current?.translation());
      },
      onRelease: () => {
        const by = s.current.heldBy;
        s.current.heldBy = null;
        tumble(by != null && !players.get(by)?.bot ? by : null);
      }
    };
    entryRef.current = entry;
    const shaken = (tree: number) => {
      const c = s.current;
      if (c.mode === 'tree' && c.tree === tree) c.shakenBy = c.shakenBy ?? -1;
    };
    treeShakeListeners.add(shaken);
    const off = registerProp(entry);
    return () => {
      off();
      treeShakeListeners.delete(shaken);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const lastReset = useRef(resetToken);
  useEffect(() => {
    if (lastReset.current === resetToken) return;
    lastReset.current = resetToken;
    const rb = body.current;
    if (!rb) return;
    ground();
    rb.setTranslation(home, true);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    setMode('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken, home]);

  useGameFrame((_, delta) => {
    const rb = body.current;
    const entry = entryRef.current;
    if (!rb || !entry) return;
    const dt = Math.min(delta, 0.05);
    if (dt <= 0) return;
    const c = s.current;
    const now = gameNow();
    const time = gameClock.time + index * 3.1;
    const t = rb.translation();
    const v = rb.linvel();
    rt.position.set(t.x, t.y, t.z);
    c.timer -= dt;
    c.arch = Math.max(0, c.arch - dt * 1.6);
    if (t.y < -5) {
      ground();
      rb.setTranslation(home, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      setMode('idle');
      return;
    }
    if (entry.heldBy != null && c.mode !== 'held') setMode('held');

    // who's about: anyone (the buddy too) to keep away from and look at; a real child to be
    // startled by, tagged by, and chased by
    let near: PlayerRuntime | null = null;
    let nearD = Infinity;
    let child: PlayerRuntime | null = null;
    let childD = Infinity;
    let tagger: PlayerRuntime | null = null;
    let awayX = 0;
    let awayZ = 0;
    players.forEach((p) => {
      if (p.asleep) return;
      const d = distXZ(p.position.x, p.position.z, t.x, t.z);
      if (d < nearD) {
        nearD = d;
        near = p;
      }
      if (d < 12 && d > 0.01) {
        awayX += (t.x - p.position.x) / (d * d);
        awayZ += (t.z - p.position.z) / (d * d);
      }
      if (p.bot) return;
      if (d < childD) {
        childD = d;
        child = p;
      }
      if (d < chaseParams(p.slot).tag * Math.max(1, p.size) && Math.abs(p.position.y - t.y) < 1.4) tagger = p;
    });
    const nearest = near as PlayerRuntime | null;
    const kid = child as PlayerRuntime | null;
    let heard: THREE.Vector3 | null = null;
    let heardSlot = -1;
    for (const n of noises) {
      // (up a tree it hears barks from the ground below; the buddy's noises don't count)
      if (n.time > c.lastNoise && now - n.time < 300 && !players.get(n.slot)?.bot && distXZ(n.position.x, n.position.z, t.x, t.z) < 9) {
        c.lastNoise = n.time;
        heard = n.position;
        heardSlot = n.slot;
      }
    }
    const onGround = Math.abs(v.y) < 0.8 && now - c.jumpAt > 350;
    const playerSpeed = MOVE.speed * SPEED_FACTOR[settings().speed];
    const { congaUntil, congaLeader } = useChase.getState();
    const conga = now < congaUntil;
    /** A chase is over (caught, or got away): tell the difficulty how it went. A cat that got
     * away only counts if the child really was after it, not if they just walked past. */
    const endChase = (outcome: 'tagged' | 'escaped') => {
      if (c.chaser >= 0 && (outcome === 'tagged' || c.chasedFor > 2)) useChase.getState().reportChase(c.chaser, outcome, (now - c.chaseStart) / 1000);
      c.chaser = -1;
      c.chasedFor = 0;
    };
    const tag = (p: PlayerRuntime) => {
      endChase('tagged');
      setMode('tagged');
      c.timer = 0.6;
      c.arch = 1;
      c.fleeFor = 0;
      c.jumpAt = now;
      rb.setLinvel({ x: 0, y: 6.5, z: 0 }, true);
      playCatSound('yowl', t);
      poof([t.x, t.y + 0.3, t.z], pal.fur, 14);
      emit('star', [t.x, t.y + 0.8, t.z], {
        count: 10,
        color: ['#ffd23f', '#ffffff', pal.fur],
        speed: 4,
        up: 4
      });
      rumble(p.source as SourceId, 0.6, 0.6, 200);
      useChase.getState().tag(index, p.slot);
    };

    let speed = 0;
    let steer = false;
    let vy = v.y;
    const m = c.mode;
    const truce = now < c.truceUntil;
    const canBeTagged = !truce && (m === 'idle' || m === 'stalk' || m === 'alert' || m === 'flee' || m === 'dizzy');
    const tg = tagger as PlayerRuntime | null;
    if (conga && (m === 'idle' || m === 'stalk' || m === 'alert' || m === 'flee' || m === 'dizzy' || (m === 'toTree' && c.climbT < 0))) {
      // all four tagged: everybody line up behind the winner!
      ground();
      setMode('conga');
      c.congaMeow = now + 500 + index * 700;
      c.chaser = -1;
    } else if (canBeTagged && tg) {
      tag(tg);
    } else if (m === 'idle' || m === 'stalk') {
      const prm = chaseParams(kid?.slot ?? -1);
      const fast = kid ? Math.hypot(kid.velocity.x, kid.velocity.z) > 5 : false;
      // (a cat on its way to a fish is braver: it lets a child come much closer)
      const range = (c.idle === 'nap' && m === 'idle' ? prm.notice[1] : prm.notice[0] * (fast ? 1.35 : 1)) * (m === 'stalk' && c.stalk === FISH ? 0.45 : 1);
      if (!truce && (heard || (kid && childD < range))) {
        // eek! up in the air, back arched, then run
        setMode('alert');
        c.chaser = heard ? heardSlot : kid!.slot;
        c.chaseStart = now;
        c.chasedFor = 0;
        c.timer = heard ? 0.5 : 0.3;
        c.arch = 1;
        c.jumpAt = now;
        vy = heard ? 7 : 4.5;
        playCatSound(heard ? 'yowl' : 'meow', t);
        emit('star', [t.x, t.y + 0.9, t.z], {
          count: 3,
          color: '#ffd23f',
          speed: 1.5,
          up: 2.5,
          size: 0.16
        });
        const from = heard ?? kid!.position;
        c.facing = Math.atan2(t.x - from.x, t.z - from.z);
      } else if (m === 'stalk' && c.stalk === FISH) {
        // a fish flopping about: run over and eat it, then lick your lips
        const fish = nearestFish(t.x, t.z, 16);
        if (!fish) {
          setMode('idle');
          c.idle = 'sit';
          c.timer = 2;
          c.stalk = -1;
        } else {
          const d = distXZ(fish.x, fish.z, t.x, t.z);
          c.facing = Math.atan2(fish.x - t.x, fish.z - t.z);
          if (d < 0.75 && onGround) {
            eatFish(fish.index);
            playCatSound('meow', t);
            earnSticker('catfish');
            setMode('idle');
            c.idle = 'groom';
            c.timer = 4;
            c.stalk = -1;
            c.pounceAt = now;
            return;
          }
          speed = 3.6;
          steer = true;
        }
      } else if (m === 'stalk') {
        const f = flocks[c.stalk];
        if (!f || !f.landed) {
          setMode('idle');
          c.idle = 'sit';
          c.timer = 2;
        } else {
          const d = distXZ(f.center.x, f.center.z, t.x, t.z);
          c.facing = Math.atan2(f.center.x - t.x, f.center.z - t.z);
          if (d < 2.8 && onGround) {
            // pounce!
            c.jumpAt = now;
            c.pounceAt = now;
            vy = 6;
            rb.setLinvel({ x: Math.sin(c.facing) * 6, y: 6, z: Math.cos(c.facing) * 6 }, true);
            f.scare(new THREE.Vector3(t.x, t.y, t.z), null);
            playCatSound('meow', t);
            setMode('idle');
            c.idle = 'sit';
            c.timer = 3;
            c.stalk = -1;
            return;
          }
          speed = 1.6;
          steer = true;
        }
      } else {
        // idle: sit, groom, nap, stroll about home, and keep an eye out for birds
        let bird = -1;
        if (now - c.pounceAt > 15000 && c.idle !== 'nap') {
          flocks.forEach((f, i) => {
            if (f.landed && f.center.y - groundHeight(f.center.x, f.center.z) < 0.5 && distXZ(f.center.x, f.center.z, t.x, t.z) < 14 && distXZ(f.center.x, f.center.z, home.x, home.z) < 22) bird = i;
          });
        }
        // a fish lying about beats any bird (a napping cat only wakes for one right by its nose)
        const fish = now - c.pounceAt > 3000 ? nearestFish(t.x, t.z, c.idle === 'nap' ? 5 : 14) : null;
        if (fish && distXZ(fish.x, fish.z, home.x, home.z) < 26) {
          setMode('stalk');
          c.stalk = FISH;
          c.idle = 'sit';
          playCatSound('meow', t);
        } else if (bird >= 0) {
          setMode('stalk');
          c.stalk = bird;
        } else if (c.idle === 'walk') {
          const d = distXZ(c.target.x, c.target.z, t.x, t.z);
          if (d < 0.6 || c.timer <= 0) {
            c.idle = 'sit';
            c.timer = 2 + Math.random() * 3;
          } else {
            c.facing = Math.atan2(c.target.x - t.x, c.target.z - t.z) + (now < c.sidestepUntil ? c.sidestep : 0);
            speed = distXZ(t.x, t.z, home.x, home.z) > 14 || truce ? 3.5 : 1.7;
            steer = true;
            // not getting anywhere (nose to nose with another cat): step round
            c.stuckFor = Math.hypot(v.x, v.z) < speed * 0.4 && onGround ? c.stuckFor + dt : 0;
            if (c.stuckFor > 0.5) {
              c.stuckFor = 0;
              c.sidestep = (Math.random() < 0.5 ? 1 : -1) * 1.3;
              c.sidestepUntil = now + 800;
            }
          }
        } else if (c.timer <= 0) {
          const r = Math.random();
          if (distXZ(t.x, t.z, home.x, home.z) > 9 || r < 0.4) {
            c.idle = 'walk';
            const a = Math.random() * Math.PI * 2;
            const rr = 2 + Math.random() * 6;
            c.target.set(home.x + Math.cos(a) * rr, 0, home.z + Math.sin(a) * rr);
            c.timer = 12;
          } else if (r < 0.65) {
            c.idle = 'groom';
            c.timer = 3 + Math.random() * 2;
          } else if (r < 0.85) {
            c.idle = 'nap';
            c.timer = 9 + Math.random() * 7;
          } else {
            c.idle = 'sit';
            c.timer = 3 + Math.random() * 3;
            if (Math.random() < 0.5) playCatSound('meow', t);
          }
        }
        if (c.idle === 'nap' && Math.random() < dt * 0.8)
          emit('puff', [t.x, t.y + 0.6, t.z], {
            count: 1,
            color: '#e3f2fd',
            size: 0.14,
            speed: 0.2,
            up: 1,
            gravity: -1,
            life: 1.4
          });
        if (c.idle !== 'walk' && nearest && nearD < 12) c.facing += wrap(Math.atan2(nearest.position.x - t.x, nearest.position.z - t.z) - c.facing) * Math.min(1, dt * 2);
      }
    } else if (m === 'alert') {
      speed = 0;
      if (c.timer <= 0) {
        setMode('flee');
        c.calmFor = 0;
      }
    } else if (m === 'flee') {
      c.fleeFor += dt;
      c.boost = Math.max(0, c.boost - dt);
      const scared = Math.hypot(awayX, awayZ) > 1e-3;
      if (scared) c.facing = Math.atan2(awayX, awayZ) + Math.sin(time * 2.3) * 0.45;
      else if (c.boost <= 0) c.facing = Math.atan2(home.x - t.x, home.z - t.z);
      // the child on our heels is the one we run from (their level)
      if (kid && childD < 9) {
        if (c.chaser < 0) c.chaseStart = now;
        c.chaser = kid.slot;
        c.chasedFor += dt;
      }
      const prm = chaseParams(c.chaser);
      speed = c.boost > 0 ? 11 : playerSpeed * (c.fleeFor < 3 ? prm.speed[0] : prm.speed[1]);
      steer = true;
      c.calmFor = nearest && nearD < 11 ? 0 : c.calmFor + dt;
      if (c.calmFor > 2.5 && c.boost <= 0) {
        endChase('escaped');
        setMode('idle');
        c.idle = 'sit';
        c.timer = 2.5;
        c.fleeFor = 0;
      }
      // stuck against something: jump it
      if (Math.hypot(v.x, v.z) < 1.5 && onGround) c.stuckFor += dt;
      else c.stuckFor = 0;
      if (c.stuckFor > 0.35) {
        c.stuckFor = 0;
        c.jumpAt = now;
        vy = 7.5;
        c.facing += (Math.random() < 0.5 ? 1 : -1) * 1.1;
      }
    } else if (m === 'tagged') {
      if (c.timer <= 0 && conga) {
        setMode('conga');
        c.congaMeow = now + 500;
      } else if (c.timer <= 0) {
        // off to the nearest free tree (not a palm), faster than anyone can run (but not one past the
        // child who just caught it: that would mean running straight into them)
        let best = -1;
        let bestD = 35;
        TREES.forEach((tr, i) => {
          if (tr.kind === 'palm' || parkCats.some((o) => o !== rt && o.tree === i)) return;
          let d = distXZ(tr.at[0], tr.at[1], t.x, t.z);
          if (kid && childD < 4 && d > childD) {
            const toward = ((tr.at[0] - t.x) * (kid.position.x - t.x) + (tr.at[1] - t.z) * (kid.position.z - t.z)) / Math.max(0.01, d * childD);
            if (toward > 0.3) d += 20;
          }
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        });
        if (best >= 0) {
          setMode('toTree');
          c.tree = best;
          rt.tree = best;
          c.timer = 8;
        } else {
          setMode('flee');
          c.boost = 4;
          c.fleeFor = 0;
        }
      }
    } else if (m === 'toTree') {
      const tr = TREES[c.tree];
      if (c.climbT >= 0) {
        // scrabbling up
        c.climbT += dt / 0.6;
        const k = Math.min(1, c.climbT);
        tmp.lerpVectors(c.climbFrom, perchOf(c.tree, c.perch), k);
        tmp.y += Math.sin(k * Math.PI) * 1.2;
        rb.setTranslation(tmp, true);
        rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
        if (k >= 1) {
          setMode('tree');
          c.treeSince = now;
          c.teaseIn = 1.5;
          c.shakenBy = null;
        }
      } else {
        const d = distXZ(tr.at[0], tr.at[1], t.x, t.z);
        c.facing = Math.atan2(tr.at[0] - t.x, tr.at[1] - t.z);
        speed = 11;
        // something (somebody) in the way: hop over it
        if (Math.hypot(v.x, v.z) < 4 && onGround) c.stuckFor += dt;
        else c.stuckFor = 0;
        if (c.stuckFor > 0.3) {
          c.stuckFor = 0;
          c.jumpAt = now;
          vy = 7.5;
        }
        if (c.timer <= 0 && d >= 6) {
          // couldn't get there: just run off instead
          c.tree = -1;
          rt.tree = -1;
          setMode('flee');
          c.boost = 3;
          c.fleeFor = 0;
        } else if (d < 1.4 || c.timer <= 0) {
          c.climbT = 0;
          c.climbFrom.set(t.x, t.y, t.z);
          collider.current?.setSensor(true);
          rb.setGravityScale(0, true);
          playRustle([tr.at[0], 2, tr.at[1]]);
        }
      }
    } else if (m === 'tree') {
      rb.setTranslation(c.perch, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      const tr = TREES[c.tree];
      if (nearest) c.facing += wrap(Math.atan2(nearest.position.x - t.x, nearest.position.z - t.z) - c.facing) * Math.min(1, dt * 3);
      // a bark under the tree shakes it
      if (heard && distXZ(heard.x, heard.z, tr.at[0], tr.at[1]) < 7) {
        statics.get(5000 + c.tree)?.onBonk(heardSlot, new THREE.Vector3(1, 0, 0));
        c.shakenBy = heardSlot;
      }
      if (nearest && nearest.position.distanceTo(c.perch) < 1.6) c.shakenBy = nearest.slot;
      c.teaseIn -= dt;
      if (c.teaseIn <= 0) {
        c.teaseIn = 2.5 + Math.random() * 3;
        const close = nearest && nearD < 7;
        playCatSound(close && Math.random() < 0.5 ? 'hiss' : 'meow', t);
        c.arch = close ? 0.6 : 0;
      }
      const alone = !nearest || nearD > 14;
      if (c.shakenBy != null || conga || (alone && now - c.treeSince > 45000)) {
        // down it comes: tumbling (shaken), or calmly (bored, or the conga is starting)
        const gentle = c.shakenBy == null;
        const by = c.shakenBy;
        ground();
        setMode('fall');
        c.fallT = 0;
        c.gentle = gentle;
        c.fromTree = !gentle;
        c.tagBy = null;
        c.shakenBy = gentle ? null : by;
        const a = nearest ? Math.atan2(t.x - nearest.position.x, t.z - nearest.position.z) : c.facing;
        rb.setLinvel({ x: Math.sin(a) * 3, y: gentle ? 2 : 4, z: Math.cos(a) * 3 }, true);
        c.flip = gentle ? 0 : 1;
        if (!gentle) {
          playCatSound('yowl', t);
          emit('confetti', [t.x, t.y, t.z], {
            count: 10,
            color: ['#3fa34d', '#57bb5a', pal.fur],
            speed: 2,
            up: 1,
            size: 1.2
          });
        }
        return;
      }
    } else if (m === 'fall') {
      c.fallT += dt;
      if (c.fallT > 0.35 && onGround && t.y < 3) {
        if (c.tagBy != null) {
          // headbutted or thrown: that's a tag
          const p = players.get(c.tagBy);
          c.tagBy = null;
          if (p) tag(p);
          else setMode('flee');
        } else if (c.gentle) {
          setMode('idle');
          c.idle = 'sit';
          c.timer = 2;
        } else {
          if (c.fromTree) earnSticker('cattree');
          c.fromTree = false;
          setMode('dizzy');
          c.timer = 1.8;
          playCatSound('meow', t);
        }
      }
    } else if (m === 'dizzy') {
      c.facing += dt * 7;
      if (Math.random() < dt * 5)
        emit('star', [t.x, t.y + 0.7, t.z], {
          count: 1,
          color: '#ffe14d',
          speed: 0.8,
          up: 1,
          size: 0.12
        });
      if (c.timer <= 0) {
        setMode('flee');
        c.fleeFor = 1.5;
        c.calmFor = 0;
      }
    } else if (m === 'held') {
      if (entry.heldBy == null) tumble(null);
      else if (Math.random() < dt * 1.2) playCatSound(Math.random() < 0.5 ? 'hiss' : 'meow', t);
    } else if (m === 'conga') {
      if (!conga) {
        // that was fun; off home again, at a trot, and left alone on the way
        setMode('idle');
        c.idle = 'walk';
        c.target.copy(home);
        c.timer = 20;
        c.truceUntil = now + 6000;
      } else {
        // the first cat follows the winner, every other cat the cat in front of it
        let ahead: THREE.Vector3 | null = null;
        for (let i = index - 1; i >= 0 && !ahead; i -= 1) if (parkCats[i]?.mode === 'conga') ahead = parkCats[i].position;
        const leader = players.get(congaLeader);
        if (!ahead && leader) ahead = leader.position;
        if (ahead) {
          const d = distXZ(ahead.x, ahead.z, t.x, t.z);
          c.facing = Math.atan2(ahead.x - t.x, ahead.z - t.z) + (now < c.sidestepUntil ? c.sidestep : 0);
          speed = d > CONGA_GAP ? Math.min(playerSpeed * 1.1, (d - CONGA_GAP) * 4 + 1.5) : 0;
          steer = d > CONGA_GAP + 3;
          // stuck against something (a ramp, a fence, a wall) on the way: hop over it, stepping
          // to one side (a different side each time, in case it's too tall to hop)
          c.stuckFor = speed > 2 && Math.hypot(v.x, v.z) < speed * 0.3 && onGround ? c.stuckFor + dt : 0;
          if (c.stuckFor > 0.3) {
            c.stuckFor = 0;
            c.jumpAt = now;
            vy = 7.5;
            c.sidestep = (c.sidestep > 0 ? -1 : 1) * 1.2;
            c.sidestepUntil = now + 700;
            c.congaHops += 1;
          }
          if (d < CONGA_GAP + 1) c.congaHops = 0;
          if (d > 28 || c.congaHops >= 2) {
            // left far behind (a launcher, a flush), or still stuck after a couple of hops: pop
            // back into the line
            c.congaHops = 0;
            poof([t.x, t.y, t.z], pal.fur, 8);
            rb.setTranslation({ x: ahead.x - Math.sin(c.facing) * CONGA_GAP, y: ahead.y + 1, z: ahead.z - Math.cos(c.facing) * CONGA_GAP }, true);
            rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
          }
        }
        if (now > c.congaMeow) {
          c.congaMeow = now + 2500 + Math.random() * 2500;
          playCatSound('meow', t);
          emit('heart', [t.x, t.y + 0.8, t.z], { count: 2, color: ['#ff4d8d', '#ff8fb5'], speed: 1, up: 1.5 });
        }
      }
    }

    // move (the modes that walk on their own feet)
    if (
      c.mode === 'idle' ||
      c.mode === 'stalk' ||
      c.mode === 'alert' ||
      c.mode === 'flee' ||
      c.mode === 'dizzy' ||
      c.mode === 'toTree' ||
      c.mode === 'tagged' ||
      c.mode === 'conga'
    ) {
      if (c.mode === 'toTree' && c.climbT >= 0) {
        // (placed by hand while climbing)
      } else {
        let heading = c.facing;
        if (steer && speed > 2.5) heading = clearHeading(t.x, t.z, c.facing);
        if (isInWater(t.x, t.z)) heading = Math.atan2(home.x - t.x, home.z - t.z);
        const k = 1 - Math.exp(-(speed > 3 ? 10 : 6) * dt);
        const vx = v.x + (Math.sin(heading) * speed - v.x) * k;
        const vz = v.z + (Math.cos(heading) * speed - v.z) * k;
        rb.setLinvel({ x: vx, y: vy, z: vz }, true);
        if (speed > 0.5) c.facing += wrap(heading - c.facing) * Math.min(1, dt * 12);
      }
    }

    // ----- animation
    const br = branch.current;
    if (br) {
      br.visible = c.mode === 'tree';
      if (br.visible) {
        const tr = TREES[c.tree];
        br.position.set(tr.at[0], c.perch.y - R - 0.08, (tr.at[1] + c.perch.z) / 2);
        br.scale.set(1, c.perch.z - tr.at[1], 1);
      }
    }
    const hs = Math.hypot(v.x, v.z);
    c.walk += hs * dt * 4.5;
    c.flip = c.mode === 'fall' && !c.gentle ? c.flip + dt * 2.2 : 0;
    const y = yaw.current;
    if (y) y.rotation.y += wrap(c.facing - y.rotation.y) * (1 - Math.exp(-14 * dt));
    const running = hs > 3;
    const sitting = (c.mode === 'idle' && (c.idle === 'sit' || c.idle === 'groom')) || c.mode === 'tree';
    const napping = c.mode === 'idle' && c.idle === 'nap';
    const crouch = c.mode === 'stalk' && c.stalk !== FISH;
    const held = c.mode === 'held';
    const pz = pose.current;
    if (pz) {
      const arch = c.arch;
      pz.rotation.x = c.flip > 0 ? c.flip * Math.PI * 2 : sitting ? -0.45 : 0;
      pz.rotation.z = c.mode === 'dizzy' ? Math.sin(time * 9) * 0.25 : held ? Math.sin(time * 20) * 0.4 : 0;
      const sy = napping ? 0.62 : crouch ? 0.72 : 1 + arch * 0.3;
      pz.scale.set(1, sy, running ? 1.15 : 1);
      pz.position.y = sitting ? 0.08 : 0;
    }
    if (head.current) {
      head.current.rotation.x = c.mode === 'idle' && c.idle === 'groom' ? 0.5 + Math.sin(time * 8) * 0.15 : napping ? 0.35 : 0;
      head.current.rotation.z = c.mode === 'idle' && c.idle === 'groom' ? 0.3 : 0;
    }
    if (eyes.current) eyes.current.scale.y = napping ? 0.12 : c.arch > 0.3 || c.mode === 'tagged' ? 1.35 : 1;
    tail.current.forEach((seg, i) => {
      if (!seg) return;
      const puff = 1 + c.arch * 0.9;
      seg.scale.set(puff, 1, puff);
      if (c.mode === 'tree')
        seg.rotation.x = i === 0 ? -1.2 : 0.3 + Math.sin(time * 2 + i) * 0.35; // dangling down, swishing
      else if (c.mode === 'conga')
        seg.rotation.x = i === 0 ? 1.3 : 0.2 + Math.sin(time * 6 + i) * 0.3; // straight up: a happy cat
      else if (running) seg.rotation.x = i === 0 ? 1.2 : 0.1;
      else if (c.arch > 0.2) seg.rotation.x = i === 0 ? 0.1 : -0.3;
      else seg.rotation.x = i === 0 ? 0.5 : 0.5 + Math.sin(time * (crouch ? 9 : 2.5) + i) * (crouch ? 0.5 : 0.25);
      seg.rotation.z = Math.sin(time * 2.2 + i) * 0.2;
    });
    legs.current.forEach((l, i) => {
      if (!l) return;
      const front = i < 2;
      if (held) l.rotation.x = Math.sin(time * 26 + i * 1.7) * 0.9;
      else if (hs > 0.4) l.rotation.x = Math.sin(c.walk * 2 + (i % 2 ? Math.PI : 0) + (front ? 0 : Math.PI / 2)) * (running ? 1 : 0.6);
      else if (front && i === 0 && c.mode === 'idle' && c.idle === 'groom') l.rotation.x = -1.3 + Math.sin(time * 8) * 0.2;
      else l.rotation.x = 0;
    });
  });

  const fur = lambert(pal.fur);
  const stripe = lambert(pal.stripe);
  const light = lambert(pal.light);
  return (
    <>
      {/* the branch it sits on while up a tree */}
      <mesh ref={branch} visible={false} rotation={[Math.PI / 2, 0, 0]} material={lambert('#8b5a2b')} castShadow>
        <cylinderGeometry args={[0.07, 0.11, 1, 6]} />
      </mesh>
      <RigidBody ref={body} position={[home.x, home.y, home.z]} colliders={false} enabledRotations={[false, false, false]} linearDamping={0.2} angularDamping={0.6}>
        <BallCollider ref={collider} args={[R]} density={0.7} friction={0.3} restitution={0.2} />
        <group ref={yaw} position={[0, -R, 0]}>
          <group scale={SIZE}>
            <group ref={pose}>
              {/* body */}
              <mesh castShadow position={[0, 0.3, -0.02]} scale={[0.8, 0.78, 1.35]} material={fur}>
                <sphereGeometry args={[0.26, 14, 10]} />
              </mesh>
              <mesh position={[0, 0.25, 0.04]} scale={[0.62, 0.6, 1.1]} material={light}>
                <sphereGeometry args={[0.24, 12, 8]} />
              </mesh>
              {[-0.12, 0, 0.12].map((z) => (
                <mesh key={z} position={[0, 0.49, z - 0.04]} scale={[1.3, 0.35, 0.28]} material={index === 3 && z === 0 ? lambert('#34343c') : stripe}>
                  <sphereGeometry args={[0.12, 8, 6]} />
                </mesh>
              ))}
              {/* head */}
              <group ref={head} position={[0, 0.5, 0.32]}>
                <mesh castShadow material={fur}>
                  <sphereGeometry args={[0.2, 14, 10]} />
                </mesh>
                {index === 3 && (
                  <mesh position={[0.08, 0.1, 0.02]} scale={[1, 0.7, 1]} material={lambert('#e07b2e')}>
                    <sphereGeometry args={[0.13, 10, 8]} />
                  </mesh>
                )}
                {[-1, 1].map((sx) => (
                  <group key={sx} position={[sx * 0.11, 0.17, -0.02]} rotation={[0, 0, -sx * 0.25]}>
                    <mesh material={fur}>
                      <coneGeometry args={[0.075, 0.16, 4]} />
                    </mesh>
                    <mesh position={[0, -0.01, 0.025]} scale={[0.55, 0.7, 0.5]} material={lambert('#ffb3c7')}>
                      <coneGeometry args={[0.075, 0.16, 4]} />
                    </mesh>
                  </group>
                ))}
                <group ref={eyes} position={[0, 0.04, 0.15]}>
                  {[-1, 1].map((sx) => (
                    <group key={sx} position={[sx * 0.075, 0, 0]}>
                      <mesh material={lambert('#ffffff')}>
                        <sphereGeometry args={[0.065, 10, 8]} />
                      </mesh>
                      <mesh position={[0, 0, 0.045]} scale={[0.55, 1, 0.5]} material={lambert('#1a1a1a')}>
                        <sphereGeometry args={[0.042, 8, 6]} />
                      </mesh>
                    </group>
                  ))}
                </group>
                <mesh position={[0, -0.04, 0.19]} material={lambert('#ff7fa0')}>
                  <sphereGeometry args={[0.028, 8, 6]} />
                </mesh>
                {[-1, 1].map((sx) =>
                  [-0.02, 0.02].map((dy) => (
                    <mesh key={`${sx}${dy}`} position={[sx * 0.14, -0.05 + dy, 0.15]} rotation={[0, 0, sx * dy * 6]} material={lambert('#ffffff')}>
                      <boxGeometry args={[0.16, 0.008, 0.008]} />
                    </mesh>
                  ))
                )}
              </group>
              {/* tail: two segments that curl, swish, puff up and dangle */}
              <group
                position={[0, 0.36, -0.36]}
                ref={(g) => {
                  tail.current[0] = g;
                }}
              >
                <mesh position={[0, 0, -0.14]} rotation={[Math.PI / 2, 0, 0]} material={fur}>
                  <cylinderGeometry args={[0.045, 0.055, 0.3, 8]} />
                </mesh>
                <group
                  position={[0, 0, -0.28]}
                  ref={(g) => {
                    tail.current[1] = g;
                  }}
                >
                  <mesh position={[0, 0, -0.13]} rotation={[Math.PI / 2, 0, 0]} material={stripe}>
                    <cylinderGeometry args={[0.05, 0.045, 0.28, 8]} />
                  </mesh>
                </group>
              </group>
              {/* legs: front pair, back pair */}
              {[
                [-0.1, 0.2],
                [0.1, 0.2],
                [-0.1, -0.2],
                [0.1, -0.2]
              ].map(([x, z], i) => (
                <group
                  key={i}
                  position={[x, 0.18, z]}
                  ref={(g) => {
                    legs.current[i] = g;
                  }}
                >
                  <mesh position={[0, -0.09, 0]} material={fur}>
                    <cylinderGeometry args={[0.045, 0.04, 0.2, 6]} />
                  </mesh>
                  <mesh position={[0, -0.18, 0.02]} material={light}>
                    <sphereGeometry args={[0.05, 8, 6]} />
                  </mesh>
                </group>
              ))}
            </group>
          </group>
        </group>
      </RigidBody>
    </>
  );
}

export function Cats() {
  return (
    <>
      {Array.from({ length: CAT_COUNT }, (_, i) => (
        <Cat key={i} index={i} />
      ))}
    </>
  );
}
