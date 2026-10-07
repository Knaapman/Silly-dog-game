import { BallCollider, CylinderCollider, RigidBody, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { playBoing, playCheer, playCrumble, playPoof, playTwinkle } from '../audio';
import { PARTY_POINTS } from '../config';
import { emit, poof, ring } from '../fx';
import { distXZ, ICE, isOnSnow, SKI_JUMP, SNOW, SNOWBALLS, SNOWMAN_BUILD, SNOWMEN, WINTER, type Vec3 } from '../layout';
import { groundHeight } from '../terrain';
import { lambert } from '../materials';
import { allocPropId, debugInfo, registerProp, registerStatic, type PropEntry, type Surface } from '../runtime';
import { offerSnowball, pieceHeights, plannedSizes, SNOWMAN_FLY, useSnowman } from '../snowman';
import { useGame } from '../store';
import { Breakable, type Piece } from './Breakable';
import { SlideTower, useHint } from './common';
import { useSurface } from './surface';
import { after, gameNow, useGameFrame } from '../clock';
import { earnSticker } from '../stickers';
import { cameraFoci } from '../views';
import { SnowballFight } from './SnowballFight';
import { PenguinShy } from './PenguinShy';
import { randomStream } from '../rng';
import { liftIfUnder } from './ground';

const random = randomStream('winter');

function IcePond() {
  const [ix, iz] = ICE.center;
  const col = useRef<RapierCollider>(null);
  const surface = useMemo<Surface>(() => ({ slippery: 0.7 }), []);
  useSurface(col, surface);
  useHint([ix, WINTER.level + 0.5, iz], 'walk', 3);
  return (
    <group position={[ix, WINTER.level, iz]}>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider ref={col} args={[0.03, ICE.radius]} position={[0, 0.03, 0]} friction={0.02} />
      </RigidBody>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.065, 0]}>
        <circleGeometry args={[ICE.radius, 40]} />
        <meshStandardMaterial color="#bfe6ff" roughness={0.05} metalness={0.2} />
      </mesh>
      {[0.4, 1.7, 2.9, 4.2].map((a, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, a]} position={[Math.cos(a) * 1.5, 0.07, Math.sin(a) * 1.5]} material={lambert('#ffffff')}>
          <planeGeometry args={[2.6 - i * 0.3, 0.05]} />
        </mesh>
      ))}
    </group>
  );
}

const SNOWMAN_PIECES: Piece[] = [
  { shape: 'ball', size: 0.6, color: '#ffffff', offset: [0, 0.6, 0] },
  { shape: 'ball', size: 0.45, color: '#ffffff', offset: [0, 1.5, 0] },
  { shape: 'ball', size: 0.32, color: '#ffffff', offset: [0, 2.2, 0] },
  { shape: 'box', size: 0.3, color: '#222222', offset: [0, 2.7, 0] },
  { shape: 'box', size: 0.15, color: '#ff8a1f', offset: [0, 2.2, 0.4] }
];

function Snowman({ at, scarf }: { at: [number, number]; scarf: string }) {
  return (
    <Breakable position={[at[0], WINTER.level, at[1]]} radius={0.7} height={2.6} pieces={SNOWMAN_PIECES} dust={['#ffffff', '#e3f0ff']} respawnMs={12000}>
      <mesh castShadow position={[0, 0.6, 0]} material={lambert('#ffffff')}>
        <sphereGeometry args={[0.65, 16, 12]} />
      </mesh>
      <mesh castShadow position={[0, 1.5, 0]} material={lambert('#ffffff')}>
        <sphereGeometry args={[0.47, 16, 12]} />
      </mesh>
      <mesh castShadow position={[0, 2.2, 0]} material={lambert('#ffffff')}>
        <sphereGeometry args={[0.34, 16, 12]} />
      </mesh>
      <mesh position={[0, 1.88, 0]} rotation={[Math.PI / 2, 0, 0]} material={lambert(scarf)}>
        <torusGeometry args={[0.3, 0.08, 8, 16]} />
      </mesh>
      <mesh position={[0, 2.2, 0.38]} rotation={[Math.PI / 2, 0, 0]} material={lambert('#ff8a1f')}>
        <coneGeometry args={[0.07, 0.35, 8]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.12, 2.3, 0.3]} material={lambert('#111111')}>
          <sphereGeometry args={[0.05, 6, 5]} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`arm${s}`} position={[s * 0.75, 1.6, 0]} rotation={[0, 0, s * -1.1]} material={lambert('#6d4c41')}>
          <cylinderGeometry args={[0.03, 0.04, 0.9, 5]} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 2.55, 0]} material={lambert('#222222')}>
        <cylinderGeometry args={[0.35, 0.35, 0.05, 14]} />
      </mesh>
      <mesh castShadow position={[0, 2.75, 0]} material={lambert('#222222')}>
        <cylinderGeometry args={[0.22, 0.24, 0.4, 14]} />
      </mesh>
    </Breakable>
  );
}

const SNOWBALL_START = 0.45;
const SNOWBALL_MAX = 1.9;
/** How much a snowball's radius grows per metre it rolls through the snow. */
const SNOWBALL_GROWTH = 0.05;

/** Push it through the snow and it grows. Headbutt a big one and it bursts. Roll it onto the snowman. */
function SnowBall({ home, index }: { home: Vec3; index: number }) {
  const body = useRef<RapierRigidBody>(null);
  const col = useRef<RapierCollider>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const radius = useRef(SNOWBALL_START);
  const id = useMemo(() => allocPropId(), []);
  const entryRef = useRef<PropEntry | null>(null);
  const resetToken = useGame((s) => s.resetToken);

  const respawn = () => {
    const rb = body.current;
    if (!rb) return;
    radius.current = SNOWBALL_START;
    col.current?.setRadius(SNOWBALL_START);
    rb.setTranslation({ x: home[0], y: home[1] + 0.5, z: home[2] }, true);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    if (entryRef.current) {
      entryRef.current.radius = SNOWBALL_START;
      entryRef.current.heavy = false;
    }
  };

  useEffect(() => {
    const entry: PropEntry = {
      id,
      kind: 'snowball',
      getBody: () => body.current,
      radius: SNOWBALL_START,
      launch: 12,
      heavy: false,
      grabbable: true,
      enabled: true,
      heldBy: null,
      onBonk: () => {
        if (radius.current < 1.1) return;
        const p = body.current?.translation();
        if (!p) return;
        emit('puff', p, { count: 30, color: ['#ffffff', '#e3f0ff'], speed: 6, up: 5, size: 0.5 });
        emit('chunk', p, { count: 20, color: '#ffffff', speed: 6, up: 7, size: 0.25 });
        playCrumble(p);
        useGame.getState().addParty(PARTY_POINTS.splat);
        earnSticker('snowball');
        after(0, () => {
          respawn();
          poof([home[0], home[1] + 0.5, home[2]], '#ffffff', 10);
          playPoof(home);
        });
      }
    };
    entryRef.current = entry;
    return registerProp(entry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const lastReset = useRef(resetToken);
  useEffect(() => {
    if (lastReset.current === resetToken) return;
    lastReset.current = resetToken;
    respawn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  useEffect(() => {
    ((debugInfo.snowballs ??= []) as unknown[])[index] = {
      radius: () => radius.current,
      position: () => body.current?.translation(),
      place: (x: number, z: number, y?: number) => {
        body.current?.setTranslation({ x, y: y ?? groundHeight(x, z) + radius.current + 0.05, z }, true);
        body.current?.setLinvel({ x: 0, y: 0, z: 0 }, true);
      },
      roll: (vx: number, vz: number) => body.current?.setLinvel({ x: vx, y: body.current.linvel().y, z: vz }, true)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useGameFrame((_, delta) => {
    const rb = body.current;
    if (!rb) return;
    liftIfUnder(rb, radius.current);
    const t = rb.translation();
    const v = rb.linvel();
    const speed = Math.hypot(v.x, v.z);
    // onto the snowman? (it hops over there; this one pops back up at home, small again, and
    // a tongue holding it lets go)
    const entry = entryRef.current;
    if (entry?.enabled && offerSnowball(t, radius.current)) {
      respawn();
      entry.enabled = false;
      after(SNOWMAN_FLY, () => {
        entry.enabled = true;
        poof([home[0], home[1] + 0.5, home[2]], '#ffffff', 10);
        playPoof(home);
      });
      return;
    }
    // it grows with every metre it rolls through the snow (or is dragged low through it on a tongue)
    if (isOnSnow(t.x, t.z) && speed > 1.2 && t.y - groundHeight(t.x, t.z) < radius.current + 0.6 && radius.current < SNOWBALL_MAX) {
      radius.current = Math.min(SNOWBALL_MAX, radius.current + speed * Math.min(delta, 0.05) * SNOWBALL_GROWTH);
      col.current?.setRadius(radius.current);
      if (entryRef.current) {
        entryRef.current.radius = radius.current;
        entryRef.current.heavy = radius.current > 1.2;
      }
      if (random() < 0.3) emit('puff', [t.x, t.y - radius.current + 0.1, t.z], { count: 1, color: '#ffffff', size: 0.25, speed: 1, up: 1 });
    }
    if (mesh.current) mesh.current.scale.setScalar(radius.current / SNOWBALL_START);
    if (t.y < -5 || (t.y < WINTER.level - 12 && !isOnSnow(t.x, t.z) && speed < 0.5)) respawn();
  });

  return (
    <RigidBody ref={body} position={home} colliders={false} linearDamping={0.4} angularDamping={0.4}>
      <BallCollider ref={col} args={[SNOWBALL_START]} density={0.25} friction={0.8} restitution={0.1} />
      <mesh ref={mesh} castShadow material={lambert('#ffffff')}>
        <icosahedronGeometry args={[SNOWBALL_START, 2]} />
      </mesh>
    </RigidBody>
  );
}

const [BX, BZ] = SNOWMAN_BUILD.center;
const BUILD_BASE = new THREE.Vector3(BX, WINTER.level, BZ);
const SCARVES = ['#ff4d5e', '#3b82f6', '#22c55e', '#a855f7', '#ff9f1c'];
const KNOCKED_FOR = 6;

type Debris = { at: number; bodies: { p: Vec3; r: number; color: string; box?: boolean; v: Vec3; w: Vec3 }[] };

/**
 * Build your own snowman: a ring in the snow with a see-through snowman in it, showing what to
 * build. Roll a big snowball into the ring and it's the bottom; roll two more against it and they
 * hop up on top. The last one: coal eyes and smile, a carrot, stick arms, a hat and a scarf, and
 * a party. Headbutt it down (only once it's finished) and build another.
 */
function SnowmanBuild() {
  const pieces = useSnowman((s) => s.pieces);
  const builtAt = useSnowman((s) => s.builtAt);
  const resetToken = useGame((s) => s.resetToken);
  const [debris, setDebris] = useState<Debris | null>(null);
  const [scarf, setScarf] = useState(0);
  const pieceRefs = useRef<(THREE.Group | null)[]>([]);
  const ghostRefs = useRef<(THREE.Mesh | null)[]>([]);
  const face = useRef<THREE.Group>(null);
  const popRefs = useRef<(THREE.Group | null)[]>([]);
  const wobble = useRef<THREE.Group>(null);
  const wobbleAt = useRef(-1e9);
  const cheered = useRef(-1);
  const landed = useRef(0);
  const sizes = plannedSizes(pieces);
  const heights = pieceHeights(sizes);

  const lastReset = useRef(resetToken);
  useEffect(() => {
    if (lastReset.current === resetToken) return;
    lastReset.current = resetToken;
    useSnowman.getState().reset();
    setDebris(null);
  }, [resetToken]);

  useEffect(() => {
    debugInfo.snowman = { wobbles: 0, knocks: 0 };
  }, []);

  // a headbutt (or fire): a wobble while it's being built, down it goes once it's finished
  useEffect(() => {
    if (pieces.length === 0) return;
    return registerStatic({
      id: 9500,
      position: new THREE.Vector3(BX, WINTER.level + 1, BZ),
      radius: pieces[0].r,
      onBonk: (_slot, dir) => {
        const st = useSnowman.getState();
        const now = gameNow();
        if (st.builtAt < 0 || now < st.builtAt) {
          if (now - wobbleAt.current < 400) return;
          wobbleAt.current = now;
          (debugInfo.snowman as { wobbles: number }).wobbles += 1;
          playBoing(BUILD_BASE, 0.7);
          emit('puff', [BX, WINTER.level + 0.4, BZ], { count: 8, color: '#ffffff', speed: 2, up: 1, size: 0.3 });
          return;
        }
        (debugInfo.snowman as { knocks: number }).knocks += 1;
        const hs = pieceHeights(st.pieces.map((p) => p.r));
        const fling = (spread: number, up: number): { v: Vec3; w: Vec3 } => ({
          v: [dir.x * 5 + (random() - 0.5) * spread, up + random() * 3, dir.z * 5 + (random() - 0.5) * spread],
          w: [random() * 6, random() * 6, random() * 6]
        });
        const top = hs[2] + st.pieces[2].r;
        setDebris({
          at: now,
          bodies: [
            ...st.pieces.map((p, i) => ({ p: [BX, WINTER.level + hs[i], BZ] as Vec3, r: p.r * 0.9, color: '#ffffff', ...fling(3, 3 + i * 2) })),
            { p: [BX, WINTER.level + top + 0.3, BZ], r: 0.3, color: '#222222', box: true, ...fling(4, 8) },
            { p: [BX, WINTER.level + hs[2], BZ + st.pieces[2].r], r: 0.1, color: '#ff8a1f', ...fling(5, 7) }
          ]
        });
        st.reset();
        playCrumble(BUILD_BASE);
        emit('puff', [BX, WINTER.level + 1.5, BZ], { count: 40, color: ['#ffffff', '#e3f0ff'], speed: 6, up: 5, size: 0.6 });
        emit('chunk', [BX, WINTER.level + 1.5, BZ], { count: 24, color: '#ffffff', speed: 6, up: 7, size: 0.25 });
        useGame.getState().addParty(PARTY_POINTS.splat);
      }
    });
  }, [pieces]);

  // the pieces left by a knock melt away after a while
  useEffect(() => {
    if (!debris) return;
    return after(KNOCKED_FOR, () => setDebris(null));
  }, [debris]);

  useGameFrame(() => {
    const now = gameNow();
    // each new piece flies over from where the snowball was, and lands with a puff
    pieces.forEach((p, i) => {
      const g = pieceRefs.current[i];
      if (!g) return;
      const k = Math.min(1, (now - p.at) / (SNOWMAN_FLY * 1000));
      const x = p.from[0] + (BX - p.from[0]) * k;
      const z = p.from[2] + (BZ - p.from[2]) * k;
      const y = p.from[1] + (WINTER.level + heights[i] - p.from[1]) * k + Math.sin(k * Math.PI) * 2.5;
      g.position.set(x - BX, y - WINTER.level, z - BZ);
      g.scale.setScalar(k < 1 ? 1 + Math.sin(k * Math.PI) * 0.15 : 1);
    });
    const done = pieces.filter((p) => now - p.at >= SNOWMAN_FLY * 1000).length;
    if (done > landed.current) {
      const i = done - 1;
      poof([BX, WINTER.level + heights[i], BZ], '#ffffff', 16);
      playPoof(BUILD_BASE);
      if (i < 2) playTwinkle(BUILD_BASE, 1 + i * 0.25);
    }
    landed.current = done;
    // the see-through snowman: the next piece to build breathes in and out
    ghostRefs.current.forEach((m, i) => {
      if (!m) return;
      m.visible = i >= pieces.length && !debris;
      const next = i === pieces.length;
      m.scale.setScalar(sizes[i] * (next ? 1 + Math.sin(now / 260) * 0.06 : 1));
      (m.material as THREE.MeshBasicMaterial).opacity = next ? 0.34 + Math.sin(now / 260) * 0.08 : 0.14;
    });
    // finished: the face pops on, and a party
    const built = builtAt > 0 && now >= builtAt;
    if (face.current) {
      const k = built ? Math.min(1, (now - builtAt) / 350) : 0;
      face.current.visible = k > 0;
      popRefs.current.forEach((g) => g?.scale.setScalar(Math.max(0.001, k < 1 ? k * 1.2 : 1)));
    }
    if (built && cheered.current !== builtAt) {
      cheered.current = builtAt;
      setScarf((n) => (n + 1) % SCARVES.length);
      const top: Vec3 = [BX, WINTER.level + heights[2], BZ];
      emit('confetti', top, { count: 60, speed: 6, up: 8 });
      ring([BX, WINTER.level + 0.1, BZ], { color: '#7dd3fc', radius: 5, duration: 0.8 });
      playCheer();
      earnSticker('snowman');
      useGame.getState().addParty(PARTY_POINTS.goal * 2);
    }
    // a headbutt while building: it wobbles
    if (wobble.current) {
      const t = (now - wobbleAt.current) / 1000;
      wobble.current.rotation.z = t < 0.8 ? Math.sin(t * 22) * 0.12 * (1 - t / 0.8) : 0;
    }
  });

  const [, h1, h2] = heights;
  const r2 = sizes[2];
  const r1 = sizes[1];
  return (
    <group>
      <group position={[BX, WINTER.level, BZ]}>
        {/* the ring in the snow */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[SNOWMAN_BUILD.radius, SNOWMAN_BUILD.radius + 0.22, 40]} />
          <meshBasicMaterial color="#7dd3fc" transparent opacity={0.8} depthWrite={false} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh
            key={`ghost${i}`}
            ref={(m) => {
              ghostRefs.current[i] = m;
            }}
            position={[0, heights[i], 0]}
          >
            <sphereGeometry args={[1, 18, 14]} />
            <meshBasicMaterial color="#e0f2fe" transparent opacity={0.2} depthWrite={false} />
          </mesh>
        ))}
        {pieces.length > 0 && (
          <RigidBody type="fixed" colliders={false}>
            {pieces.map((p, i) => (
              <BallCollider key={i} args={[p.r]} position={[0, heights[i], 0]} />
            ))}
          </RigidBody>
        )}
        <group ref={wobble}>
          {pieces.map((p, i) => (
            <group
              key={`${p.at}-${i}`}
              ref={(g) => {
                pieceRefs.current[i] = g;
              }}
            >
              <mesh castShadow material={lambert('#ffffff')}>
                <icosahedronGeometry args={[p.r, 2]} />
              </mesh>
            </group>
          ))}
          {/* the face, hat and scarf on the head; buttons and arms on the middle: each pops on in place */}
          <group ref={face} visible={false}>
            <group
              position={[0, h2, 0]}
              ref={(g) => {
                popRefs.current[0] = g;
              }}
            >
              {[-1, 1].map((sx) => (
                <mesh key={sx} position={[sx * r2 * 0.35, r2 * 0.2, r2 * 0.88]} material={lambert('#111111')}>
                  <sphereGeometry args={[r2 * 0.1, 8, 6]} />
                </mesh>
              ))}
              <mesh position={[0, 0, r2 * 1.1]} rotation={[Math.PI / 2, 0, 0]} material={lambert('#ff8a1f')}>
                <coneGeometry args={[r2 * 0.14, r2 * 0.7, 8]} />
              </mesh>
              {[-2, -1, 0, 1, 2].map((k) => (
                <mesh key={`m${k}`} position={[k * r2 * 0.16, -r2 * 0.36 + Math.abs(k) * r2 * 0.07, r2 * 0.88 - Math.abs(k) * r2 * 0.05]} material={lambert('#111111')}>
                  <sphereGeometry args={[r2 * 0.06, 6, 5]} />
                </mesh>
              ))}
              <mesh castShadow position={[0, r2 * 0.88, 0]} material={lambert('#222222')}>
                <cylinderGeometry args={[r2 * 0.8, r2 * 0.8, r2 * 0.1, 16]} />
              </mesh>
              <mesh castShadow position={[0, r2 * 1.35, 0]} material={lambert('#222222')}>
                <cylinderGeometry args={[r2 * 0.52, r2 * 0.56, r2 * 0.9, 16]} />
              </mesh>
              <mesh position={[0, r2 * 1.02, 0]} material={lambert(SCARVES[scarf])}>
                <cylinderGeometry args={[r2 * 0.57, r2 * 0.57, r2 * 0.16, 16]} />
              </mesh>
              <mesh position={[0, -r2 * 0.8, 0]} rotation={[Math.PI / 2, 0, 0]} material={lambert(SCARVES[scarf])}>
                <torusGeometry args={[r2 * 0.78, r2 * 0.18, 8, 20]} />
              </mesh>
              <mesh position={[r2 * 0.4, -r2 * 1.3, r1 * 0.75]} rotation={[0.3, 0, -0.2]} material={lambert(SCARVES[scarf])}>
                <boxGeometry args={[r2 * 0.3, r2 * 0.8, r2 * 0.1]} />
              </mesh>
            </group>
            <group
              position={[0, h1, 0]}
              ref={(g) => {
                popRefs.current[1] = g;
              }}
            >
              {[0.35, 0.05, -0.25].map((dy) => (
                <mesh key={dy} position={[0, dy * r1 * 1.8, r1 * 0.97 - Math.abs(dy) * r1 * 0.5]} material={lambert('#111111')}>
                  <sphereGeometry args={[r1 * 0.09, 6, 5]} />
                </mesh>
              ))}
              {[-1, 1].map((sx) => (
                <group key={`arm${sx}`} position={[sx * r1 * 0.9, r1 * 0.2, 0]} rotation={[0, 0, sx * -0.9]}>
                  <mesh position={[0, r1 * 0.7, 0]} material={lambert('#6d4c41')}>
                    <cylinderGeometry args={[0.04, 0.06, r1 * 1.4, 5]} />
                  </mesh>
                  <mesh position={[sx * -0.12, r1 * 1.15, 0]} rotation={[0, 0, sx * 0.8]} material={lambert('#6d4c41')}>
                    <cylinderGeometry args={[0.03, 0.035, r1 * 0.45, 5]} />
                  </mesh>
                </group>
              ))}
            </group>
          </group>
        </group>
      </group>
      {debris && (
        <group>
          {debris.bodies.map((b, i) => (
            <RigidBody key={`${debris.at}-${i}`} position={b.p} linearVelocity={b.v} angularVelocity={b.w} colliders={false}>
              {b.box ? <CylinderCollider args={[b.r, b.r]} density={0.3} /> : <BallCollider args={[b.r]} density={0.3} />}
              <mesh castShadow material={lambert(b.color)}>
                {b.box ? <cylinderGeometry args={[b.r * 0.8, b.r * 0.8, b.r * 2, 12]} /> : <icosahedronGeometry args={[b.r, 1]} />}
              </mesh>
            </RigidBody>
          ))}
        </group>
      )}
    </group>
  );
}

function Snowfall() {
  const timer = useRef(0);
  useGameFrame((_, delta) => {
    timer.current -= delta;
    if (timer.current > 0) return;
    timer.current = 0.05;
    // around wherever a camera is looking (each view's, in split screen)
    for (const f of cameraFoci()) {
      if (distXZ(f.x, f.z, SNOW.center[0], SNOW.center[1]) > SNOW.radius + 12) continue;
      const x = f.x + (random() - 0.5) * 34;
      const z = f.z + (random() - 0.5) * 26;
      if (!isOnSnow(x, z)) continue;
      emit('confetti', [x, WINTER.level + 12, z], { count: 2, color: '#ffffff', speed: 0.4, up: 0, gravity: 1.1, drag: 1.2, life: 6 });
    }
  });
  return null;
}

export function Winter() {
  const scarves = ['#ff4d5e', '#3b82f6', '#22c55e', '#a855f7'];
  return (
    <group>
      <IcePond />
      <SlideTower
        base={SKI_JUMP.base}
        height={SKI_JUMP.height}
        rampAngle={Math.PI}
        rampLength={7}
        slideAngle={0}
        slideLength={8}
        kicker
        colors={{ tower: '#bde0ff', ramp: '#ffffff', slide: '#e3f0ff', rail: '#3b82f6' }}
      />
      {SNOWMEN.map((at, i) => (
        <Snowman key={i} at={at} scarf={scarves[i % scarves.length]} />
      ))}
      {SNOWBALLS.map((p, i) => (
        <SnowBall key={i} home={p} index={i} />
      ))}
      <SnowmanBuild />
      <SnowballFight />
      <PenguinShy />
      <Snowfall />
    </group>
  );
}
