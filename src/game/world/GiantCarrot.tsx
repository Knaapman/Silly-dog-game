import { CapsuleCollider, CylinderCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { playBoing, playCheer, playChomp, playPop, playPoof, playSlurp } from '../audio';
import { after, gameNow, useGameFrame } from '../clock';
import { PARTY_POINTS } from '../config';
import { emit, poof, ring } from '../fx';
import { getInput, rumble, type SourceId } from '../input';
import { GIANT_CARROT } from '../layout';
import { lambert } from '../materials';
import { allocPropId, debugInfo, players, rider, registerFood, registerProp, type PropEntry } from '../runtime';
import { earnSticker } from '../stickers';
import { useGame } from '../store';
import { groundHeight } from '../terrain';
import { useHint } from './common';

// The giant carrot: its leaves stick out of a mound of earth east of the farm. Grab them with
// your tongue and you hang on; push the stick away from the carrot to pull. Alone it comes up
// slowly; every friend pulling from another side makes it come much quicker (playing alone,
// the buddy hops over to help). Out it pops: everyone tumbles over backwards, and there's a
// carrot the size of a sofa to push about and eat. Then a new one grows.

const [CX, CZ] = GIANT_CARROT.at;
const Y0 = groundHeight(CX, CZ);
/** The four places to pull from: west, east, south, north (round the carrot). */
const SPOT_ANGLES = [Math.PI, 0, Math.PI / 2, -Math.PI / 2];
const SPOTS = SPOT_ANGLES.map((a) => ({ out: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), at: new THREE.Vector3(CX + Math.cos(a) * GIANT_CARROT.pull, 0, CZ + Math.sin(a) * GIANT_CARROT.pull) }));
SPOTS.forEach((s) => (s.at.y = groundHeight(s.at.x, s.at.z) + 0.5));

/** How quickly it comes up: this much a second for one puller, times pullers^1.5 (a second friend nearly triples it). */
const PULL_RATE = 0.08;
/** Nobody pulling: it slowly sinks back. */
const SINK_RATE = 0.03;
const BITES = 4;
/** The popped carrot lies about this long before it goes (if nobody eats it all up first). */
const LIES_FOR = 30;
const REGROW = 4;
const CARROT_LEN = 2.6;
const CARROT_R = 0.7;

type Phase = 'stuck' | 'popped' | 'regrow';

export function GiantCarrot() {
  const resetToken = useGame((s) => s.resetToken);
  const [phase, setPhaseState] = useState<Phase>('stuck');
  const [poppedAt, setPoppedAt] = useState(0);
  const st = useRef({
    phase: 'stuck' as Phase,
    progress: 0,
    pullers: new Map<number, { spot: number; pulling: boolean; idle: number }>(),
    botComing: null as null | { slot: number; spot: number; at: number },
    pulling: 0,
    pops: 0,
    bites: BITES,
    poppedAt: 0,
    regrowAt: 0,
    dirt: 0
  });
  const handle = useRef<RapierRigidBody>(null);
  const loose = useRef<RapierRigidBody>(null);
  const carrot = useRef<THREE.Group>(null);
  const leaves = useRef<THREE.Group>(null);
  const looseMesh = useRef<THREE.Group>(null);
  const tongues = useRef<(THREE.Mesh | null)[]>([]);
  const arrows = useRef<(THREE.Group | null)[]>([]);
  const foodPos = useMemo(() => new THREE.Vector3(CX, Y0 + 0.8, CZ), []);
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), q: new THREE.Quaternion(), up: new THREE.Vector3(0, 1, 0) }), []);
  useHint([CX, Y0 + 1.4, CZ], 'lick', 3.5);

  /** The popped carrot's body, once it's there (and never one that has gone). */
  const looseBody = () => {
    const b = loose.current;
    return b && b.isValid() ? b : null;
  };

  const setPhase = (p: Phase) => {
    st.current.phase = p;
    setPhaseState(p);
  };

  useEffect(() => {
    debugInfo.carrot = st.current;
  }, []);

  /** Let go of everyone (flinging them over backwards when it pops). */
  const releaseAll = (fling: boolean) => {
    const s = st.current;
    s.pullers.forEach((pl, slot) => {
      const p = players.get(slot);
      if (!p) return;
      p.hold(null);
      if (fling) {
        const spot = SPOTS[pl.spot];
        tmp.a.copy(spot.out).multiplyScalar(GIANT_CARROT.pull + 2.5).add(tmp.b.set(CX, 0, CZ));
        tmp.a.y = groundHeight(tmp.a.x, tmp.a.z);
        p.launchTo(tmp.a.clone(), tmp.a.y + 3);
        rumble(p.source as SourceId, 0.8, 0.8, 300);
      }
    });
    s.pullers.clear();
    s.botComing = null;
  };

  const lastReset = useRef(resetToken);
  useEffect(() => {
    if (lastReset.current === resetToken) return;
    lastReset.current = resetToken;
    releaseAll(false);
    st.current.progress = 0;
    setPhase('stuck');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  const freeSpotNear = (x: number, z: number) => {
    const taken = new Set([...st.current.pullers.values()].map((p) => p.spot));
    if (st.current.botComing) taken.add(st.current.botComing.spot);
    let best = -1;
    let bestD = Infinity;
    SPOTS.forEach((s, i) => {
      if (taken.has(i)) return;
      const d = Math.hypot(s.at.x - x, s.at.z - z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };

  // grab the leaves with your tongue: you hang on (the tongue itself lets go: we hold you here)
  useEffect(() => {
    const entry: PropEntry = {
      id: allocPropId(),
      kind: 'giantcarrot',
      getBody: () => (st.current.phase === 'stuck' ? handle.current : null),
      radius: 0.8,
      launch: 0,
      heavy: true,
      grabbable: true,
      enabled: true,
      heldBy: null,
      onGrab: (slot) => {
        const s = st.current;
        const p = players.get(slot);
        if (s.phase !== 'stuck' || !p || s.pullers.has(slot)) return false;
        const spot = freeSpotNear(p.position.x, p.position.z);
        if (spot < 0) return false;
        s.pullers.set(slot, { spot, pulling: false, idle: 0 });
        playSlurp(p.position);
        playBoing(SPOTS[spot].at, 1.3);
        // playing alone? the buddy comes to help
        if (!p.bot && !s.botComing) {
          players.forEach((b) => {
            if (!b.bot || s.pullers.has(b.slot) || s.botComing || b.position.distanceTo(foodPos) > 30) return;
            const bs = freeSpotNear(CX * 2 - p.position.x, CZ * 2 - p.position.z);
            if (bs < 0) return;
            s.botComing = { slot: b.slot, spot: bs, at: gameNow() };
            b.launchTo(SPOTS[bs].at.clone(), SPOTS[bs].at.y + 3);
          });
        }
        return false;
      }
    };
    return registerProp(entry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the popped carrot can be eaten: four big bites
  useEffect(() => {
    if (phase !== 'popped') return;
    const food = registerFood({
      position: foodPos,
      radius: 1.3,
      enabled: true,
      eat: (slot) => {
        const s = st.current;
        if (s.phase !== 'popped' || s.bites <= 0) return;
        s.bites -= 1;
        players.get(slot)?.feed();
        playChomp(foodPos);
        emit('chunk', foodPos, { count: 12, color: ['#ff8a1f', '#ffb066'], speed: 3, up: 3, size: 0.15 });
        if (s.bites <= 0) after(0, gone);
      }
    });
    return food.unregister;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // the popped carrot as something to push about and headbutt
  useEffect(() => {
    if (phase !== 'popped') return;
    return registerProp({
      id: allocPropId(),
      kind: 'giantcarrot',
      getBody: looseBody,
      radius: 1.1,
      launch: 6,
      heavy: true,
      grabbable: false,
      enabled: true,
      heldBy: null
    });
  }, [phase]);

  const gone = () => {
    const s = st.current;
    if (s.phase !== 'popped') return;
    poof(foodPos, '#ff8a1f', 18);
    playPoof(foodPos);
    s.regrowAt = gameNow();
    s.progress = 0;
    setPhase('regrow');
  };

  const pop = (now: number) => {
    const s = st.current;
    const together = s.pullers.size;
    releaseAll(true);
    s.pops += 1;
    s.bites = BITES;
    s.poppedAt = now;
    s.progress = 1;
    setPoppedAt(now);
    setPhase('popped');
    const top: [number, number, number] = [CX, Y0 + 1.2, CZ];
    playPop(top);
    playBoing(top, 0.6);
    after(0.4, playCheer);
    emit('chunk', [CX, Y0 + 0.3, CZ], { count: 40, color: ['#7a5230', '#5c3d22', '#9b6b3f'], speed: 7, up: 8, size: 0.25 });
    emit('confetti', top, { count: 70, speed: 7, up: 9 });
    ring([CX, Y0 + 0.1, CZ], { color: '#ff8a1f', radius: 4.5, duration: 0.7 });
    useGame.getState().addParty(PARTY_POINTS.goal * 2);
    earnSticker('carrot');
    // (pulled out together: the buddy counts as a friend, like everywhere else)
    if (together >= 2) earnSticker('carrotfriends');
  };

  useGameFrame((_, dt) => {
    const now = gameNow();
    const s = st.current;

    if (s.phase === 'stuck') {
      // the buddy, on its way over
      const bc = s.botComing;
      if (bc) {
        const b = players.get(bc.slot);
        if (!b) s.botComing = null;
        else if ((!b.isLaunched() && b.position.distanceTo(SPOTS[bc.spot].at) < 1.6) || now - bc.at > 3000) {
          s.pullers.set(bc.slot, { spot: bc.spot, pulling: false, idle: 0 });
          s.botComing = null;
          playBoing(SPOTS[bc.spot].at, 1.3);
        }
      }
      // everyone hanging on: stick away from the carrot = pull; jump = let go
      let kidsPulling = 0;
      s.pullers.forEach((pl, slot) => {
        const p = rider(slot);
        // (gone home, or popped out with the "I'm stuck" buttons: their place is free again)
        if (!p) {
          s.pullers.delete(slot);
          return;
        }
        const input = getInput(p.source as SourceId);
        if (!p.bot && input.pressed.jump) {
          p.hold(null);
          const spot = SPOTS[pl.spot];
          tmp.a.copy(spot.out).multiplyScalar(GIANT_CARROT.pull + 1.5).add(tmp.b.set(CX, 0, CZ));
          tmp.a.y = groundHeight(tmp.a.x, tmp.a.z);
          p.launchTo(tmp.a.clone(), tmp.a.y + 1.5);
          s.pullers.delete(slot);
          return;
        }
        const out = SPOTS[pl.spot].out;
        const mag = Math.hypot(input.x, input.z);
        pl.pulling = !p.bot && mag > 0.4 && (input.x * out.x + input.z * out.z) / mag > 0.4;
        if (pl.pulling) kidsPulling += 1;
        pl.idle = pl.pulling ? 0 : pl.idle + dt;
      });
      // the buddy pulls whenever a child does (and lets go when no child is hanging on)
      let pulling = kidsPulling;
      const kidsOn = [...s.pullers.keys()].some((slot) => !players.get(slot)?.bot);
      s.pullers.forEach((pl, slot) => {
        const b = players.get(slot);
        if (!b?.bot) return;
        if (!kidsOn) {
          b.hop(6);
          b.hold(null);
          s.pullers.delete(slot);
          return;
        }
        pl.pulling = kidsPulling > 0;
        if (pl.pulling) pulling += 1;
      });
      s.pulling = pulling;
      s.progress = pulling > 0 ? s.progress + PULL_RATE * Math.pow(pulling, 1.5) * dt : Math.max(0, s.progress - SINK_RATE * dt);
      // hold everyone in place, leaning back while they pull
      s.pullers.forEach((pl, slot) => {
        const p = players.get(slot);
        if (!p) return;
        const spot = SPOTS[pl.spot];
        const lean = pl.pulling ? 0.35 + Math.sin(now / 70 + slot) * 0.06 : 0;
        tmp.a.copy(spot.out).multiplyScalar(lean).add(spot.at);
        p.hold(tmp.a, false, Math.atan2(-spot.out.x, -spot.out.z));
        if (pl.pulling && Math.random() < dt * 3) rumble(p.source as SourceId, 0.2, 0.3, 80);
      });
      if (pulling > 0) {
        s.dirt -= dt;
        if (s.dirt <= 0) {
          s.dirt = 0.12;
          emit('chunk', [CX + (Math.random() - 0.5) * 1.2, Y0 + 0.2, CZ + (Math.random() - 0.5) * 1.2], { count: 2, color: ['#7a5230', '#5c3d22'], speed: 2, up: 3, size: 0.14 });
        }
      }
      if (s.progress >= 1) pop(now);
    } else if (s.phase === 'popped') {
      const lb = looseBody();
      if (lb) {
        const t = lb.translation();
        foodPos.set(t.x, t.y, t.z);
        if (t.y < Y0 - 20) gone();
      }
      if (looseMesh.current) looseMesh.current.scale.setScalar(0.55 + (0.45 * s.bites) / BITES);
      if (now - s.poppedAt > LIES_FOR * 1000) gone();
    } else if (s.phase === 'regrow') {
      if (now - s.regrowAt > REGROW * 1000) {
        s.progress = 0;
        setPhase('stuck');
        poof([CX, Y0 + 0.6, CZ], '#5fbf4a', 10);
      }
    }

    // ----- the carrot in the ground: it rises and shakes as it comes up
    const g = carrot.current;
    if (g) {
      g.visible = s.phase === 'stuck';
      const shake = s.pulling > 0 ? (0.03 + s.progress * 0.07) * Math.sin(now / 35) : 0;
      g.position.set(CX + shake, Y0 - CARROT_LEN + 0.45 + s.progress * 1.1, CZ + shake * 0.6);
      g.rotation.z = shake * 0.8;
    }
    const lv = leaves.current;
    if (lv) {
      const grow = s.phase === 'regrow' ? Math.min(1, (now - s.regrowAt) / (REGROW * 1000)) : s.phase === 'stuck' ? 1 : 0;
      lv.visible = s.phase !== 'popped';
      lv.scale.setScalar(Math.max(0.01, grow));
      lv.position.set(g?.position.x ?? CX, (s.phase === 'stuck' ? Y0 + 0.45 + s.progress * 1.1 : Y0 + 0.2) + 0.02, g?.position.z ?? CZ);
      lv.rotation.z = (g?.rotation.z ?? 0) * 1.5;
    }
    handle.current?.setTranslation({ x: CX, y: s.phase === 'stuck' ? Y0 + 0.75 + s.progress * 1.1 : Y0 - 8, z: CZ }, true);

    // ----- tongues from each puller to the leaves, and an arrow to show which way to pull
    for (let i = 0; i < 4; i += 1) {
      const m = tongues.current[i];
      const arrow = arrows.current[i];
      const entry = [...s.pullers.entries()].find(([, pl]) => pl.spot === i);
      const p = entry ? players.get(entry[0]) : undefined;
      if (m) {
        m.visible = !!p && s.phase === 'stuck';
        if (p && m.visible) {
          tmp.a.set(p.position.x, p.position.y + 0.35, p.position.z);
          tmp.b.set(CX, Y0 + 0.6 + s.progress * 1.1, CZ);
          const len = tmp.a.distanceTo(tmp.b);
          m.position.copy(tmp.a).add(tmp.b).multiplyScalar(0.5);
          m.scale.set(1, len, 1);
          m.quaternion.setFromUnitVectors(tmp.up, tmp.b.sub(tmp.a).normalize());
        }
      }
      if (arrow) {
        const show = !!entry && !players.get(entry[0])?.bot && entry[1].idle > 1.2 && s.phase === 'stuck';
        arrow.visible = show;
        if (show) {
          const k = 0.5 + 0.5 * Math.sin(now / 150);
          arrow.position.copy(SPOTS[i].out).multiplyScalar(1.3 + k * 0.4).add(SPOTS[i].at);
          arrow.position.y = groundHeight(arrow.position.x, arrow.position.z) + 0.05;
          arrow.rotation.y = Math.atan2(SPOTS[i].out.x, SPOTS[i].out.z);
        }
      }
    }
  });

  return (
    <group>
      {/* the mound of earth */}
      <mesh position={[CX, Y0 - 0.1, CZ]} scale={[1, 0.35, 1]} receiveShadow material={lambert('#7a5230')}>
        <sphereGeometry args={[1.35, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      {/* (always there: underground while there's no carrot in the mound; a body that comes
          and goes can be touched by a frame after it's gone, and that crashes the physics) */}
      <RigidBody ref={handle} type="fixed" colliders={false} position={[CX, Y0 + 0.75, CZ]}>
        <CylinderCollider args={[0.75, CARROT_R]} />
      </RigidBody>
      <group ref={carrot}>
        <mesh position={[0, CARROT_LEN / 2, 0]} rotation={[Math.PI, 0, 0]} castShadow material={lambert('#ff8a1f')}>
          <coneGeometry args={[CARROT_R, CARROT_LEN, 14]} />
        </mesh>
        {[0.25, 0.55, 0.85].map((f) => (
          <mesh key={f} position={[0, CARROT_LEN * f, 0]} rotation={[Math.PI / 2, 0, 0]} material={lambert('#e8741a')}>
            <torusGeometry args={[CARROT_R * f + 0.01, 0.025, 4, 16]} />
          </mesh>
        ))}
      </group>
      <group ref={leaves}>
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 0.18, 0.55, Math.sin(a) * 0.18]} rotation={[Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]} castShadow material={lambert(i % 2 ? '#3f9b3a' : '#5fbf4a')}>
              <coneGeometry args={[0.18, 1.1, 5]} />
            </mesh>
          );
        })}
      </group>
      {phase === 'popped' && (
        <RigidBody
          key={poppedAt}
          ref={loose}
          position={[CX, Y0 + 1.8, CZ]}
          rotation={[0, 0, Math.PI / 2]}
          linearVelocity={[1.5, 9, 0.8]}
          angularVelocity={[4, 1, 6]}
          colliders={false}
          linearDamping={0.3}
          angularDamping={0.6}
        >
          <CapsuleCollider args={[CARROT_LEN / 2 - CARROT_R * 0.7, CARROT_R * 0.75]} density={0.6} friction={0.9} />
          <group ref={looseMesh}>
            <mesh rotation={[Math.PI, 0, 0]} castShadow material={lambert('#ff8a1f')}>
              <coneGeometry args={[CARROT_R, CARROT_LEN, 14]} />
            </mesh>
            {[0, 1, 2, 3, 4].map((i) => {
              const a = (i / 5) * Math.PI * 2;
              return (
                <mesh key={i} position={[Math.cos(a) * 0.18, CARROT_LEN / 2 + 0.5, Math.sin(a) * 0.18]} rotation={[Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]} material={lambert('#5fbf4a')}>
                  <coneGeometry args={[0.18, 1.1, 5]} />
                </mesh>
              );
            })}
          </group>
        </RigidBody>
      )}
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={`t${i}`}
          visible={false}
          ref={(m) => {
            tongues.current[i] = m;
          }}
          material={lambert('#ff6f9c')}
        >
          <cylinderGeometry args={[0.06, 0.07, 1, 6]} />
        </mesh>
      ))}
      {[0, 1, 2, 3].map((i) => (
        <group
          key={`a${i}`}
          visible={false}
          ref={(g) => {
            arrows.current[i] = g;
          }}
        >
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0.25]} material={lambert('#ffd23f')}>
            <circleGeometry args={[0.4, 3, -Math.PI / 2]} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -0.2]} material={lambert('#ffd23f')}>
            <planeGeometry args={[0.3, 0.6]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
