import { BallCollider, CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { gameClock, useGameFrame } from '../clock';
import { FOOTBRIDGE, MESA, RIVER_FOOTBRIDGE, STEPPING_STONES, TRAIN_BRIDGE } from '../layout';
import { lambert, speckleTexture } from '../materials';
import { groundHeight } from '../terrain';
import { Ramp, StaticBox, useHint } from './common';
import { useSeeThrough } from './seeThrough';

// Landmarks in the open grass between the zones: the mesa at the mountain's foot with the train
// tunnel through it (up the ramp from the mountainside, wave the flag, watch the train come out
// underneath you), the footbridge over the west track, and the river crossings: the railway
// bridge, the footbridge on the way to the dino park, and the stepping stones on the way to the
// playground. (The hills and the mountain are part of the ground: see terrain.ts.)

function grassMaterial(name: string) {
  return new THREE.MeshLambertMaterial({ map: speckleTexture(name, '#6cbd4c', ['#5faa42', '#7fcf5e', '#c9e59a'], 8) });
}

function Flag({ position }: { position: [number, number, number] }) {
  const cloth = useRef<THREE.Mesh>(null);
  useGameFrame(() => {
    if (cloth.current) cloth.current.rotation.y = Math.sin(gameClock.time * 3) * 0.25;
  });
  return (
    <group position={position}>
      <mesh castShadow position={[0, 1.5, 0]} material={lambert('#eeeeee')}>
        <cylinderGeometry args={[0.06, 0.08, 3, 8]} />
      </mesh>
      <mesh position={[0, 2.95, 0]} material={lambert('#ffd23f')}>
        <sphereGeometry args={[0.12, 8, 6]} />
      </mesh>
      <group position={[0, 2.5, 0]}>
        <mesh ref={cloth} position={[0.65, 0, 0]}>
          <planeGeometry args={[1.3, 0.8]} />
          <meshLambertMaterial color="#ff4d5e" side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

/** The mesa: two earth walls, a roof, the tunnel between them (along x), grass on top. */
function Mesa() {
  const [cx, cz] = MESA.center;
  const { halfWidth: hw, halfLength: hl, opening, clearance, roof } = MESA;
  const wallW = hw - opening / 2;
  const top = clearance + roof;
  const whole = useRef<THREE.Group>(null);
  useSeeThrough(whole, cx, cz, hl + 2);
  const rock = useMemo(() => new THREE.MeshLambertMaterial({ map: speckleTexture('mesa', '#9c8a6e', ['#8a7757', '#b3a184', '#7a6a4f'], 7) }), []);
  const grass = useMemo(() => grassMaterial('mesa-top'), []);
  const stone = lambert('#c9c2b6');
  const boulder = lambert('#8f8a82');
  useHint([MESA.rampFrom[0], groundHeight(MESA.rampFrom[0], MESA.rampFrom[2]) + 0.5, MESA.rampFrom[2]], 'walk', 4);
  // in the mesa's own frame: local z runs along the tunnel, local x across it
  const boulders: [number, number, number, number][] = [
    [-hw - 1, 0.7, 5, 0.9],
    [-hw - 0.8, 0.5, -3, 0.6],
    [4, hl + 2.2, 0.55, 0.8],
    [-4.2, -hl - 2, 0.6, 0.85],
    [-3.5, 4.5, top + 0.5, 0.6],
    [3.8, -5.5, top + 0.6, 0.7]
  ];
  const foot = groundHeight(MESA.rampFrom[0], MESA.rampFrom[2]);
  return (
    <group ref={whole}>
      <RigidBody type="fixed" colliders={false} position={[cx, 0, cz]} rotation={[0, Math.PI / 2, 0]}>
        {[-1, 1].map((side) => (
          <group key={side} position={[side * (opening / 2 + wallW / 2), clearance / 2, 0]}>
            <CuboidCollider args={[wallW / 2, clearance / 2, hl]} friction={1} />
            <mesh castShadow receiveShadow material={rock}>
              <boxGeometry args={[wallW, clearance, hl * 2]} />
            </mesh>
          </group>
        ))}
        <group position={[0, clearance + roof / 2, 0]}>
          <CuboidCollider args={[hw, roof / 2, hl]} friction={1} />
          <mesh castShadow receiveShadow material={rock}>
            <boxGeometry args={[hw * 2, roof, hl * 2]} />
          </mesh>
        </group>
        {/* grass on top, a little proud of the edges */}
        <mesh receiveShadow position={[0, top + 0.06, 0]} material={grass}>
          <boxGeometry args={[hw * 2 + 0.4, 0.12, hl * 2 + 0.4]} />
        </mesh>
        {/* stone portals round the tunnel mouths */}
        {[-1, 1].map((end) => (
          <group key={end} position={[0, 0, end * (hl + 0.3)]}>
            {[-1, 1].map((side) => (
              <mesh key={side} castShadow position={[side * (opening / 2 + 0.5), clearance / 2 + 0.2, 0]} material={stone}>
                <boxGeometry args={[1, clearance + 0.4, 0.6]} />
              </mesh>
            ))}
            <mesh castShadow position={[0, clearance + 0.6, 0]} material={stone}>
              <boxGeometry args={[opening + 2, 1.2, 0.6]} />
            </mesh>
          </group>
        ))}
        {/* boulders round the foot and on top */}
        {boulders.map(([x, z, y, r], i) => (
          <group key={i} position={[x, y, z]}>
            <BallCollider args={[r]} />
            <mesh castShadow receiveShadow material={boulder}>
              <icosahedronGeometry args={[r, 1]} />
            </mesh>
          </group>
        ))}
      </RigidBody>
      {/* up from the mountainside behind it */}
      <Ramp from={[MESA.rampFrom[0], foot, MESA.rampFrom[2]]} to={MESA.rampTo} width={2.6} color="#a1887f" railColor="#6d4c41" />
      <Flag position={[cx, top + 0.1, cz]} />
    </group>
  );
}

/** A wooden footbridge over the west track: up the ramp, along the deck, look down on the train. */
function Footbridge() {
  const { z, height, deckThickness, rampFrom, deckFrom, deckTo, width } = FOOTBRIDGE;
  const wood = '#a1887f';
  const rail = '#6d4c41';
  const deckLen = deckFrom - deckTo;
  const deckX = (deckFrom + deckTo) / 2;
  useHint([rampFrom, 0.5, z], 'walk', 4);
  return (
    <group>
      {/* the ramp's end rests on the deck (level with it, it would leave a step that stops you) */}
      <Ramp from={[rampFrom, 0, z]} to={[deckFrom - 0.4, height + 0.3, z]} width={width} color={wood} railColor={rail} />
      <StaticBox position={[deckX, height - deckThickness / 2, z]} size={[deckLen, deckThickness, width]} color={wood} />
      {[-1, 1].map((side) => (
        <StaticBox key={side} position={[deckX, height + 0.35, z + side * (width / 2 + 0.1)]} size={[deckLen, 0.7, 0.2]} color={rail} />
      ))}
      <StaticBox position={[deckTo + 0.1, height + 0.35, z]} size={[0.2, 0.7, width + 0.4]} color={rail} />
      {/* posts down to the ground, either side of the track */}
      {[-1, 1].map((side) =>
        [deckFrom - 0.4, deckTo + 0.4].map((x) => (
          <mesh key={`${side}${x}`} castShadow position={[x, (height - deckThickness) / 2, z + side * (width / 2 - 0.15)]} material={lambert(rail)}>
            <cylinderGeometry args={[0.15, 0.18, height - deckThickness, 8]} />
          </mesh>
        ))
      )}
    </group>
  );
}

/** The railway bridge: a deck carrying the track over the river, with low stone parapets. */
function TrainBridge() {
  const [x, z] = TRAIN_BRIDGE.center;
  const { length, width } = TRAIN_BRIDGE;
  const stone = lambert('#b0a89a');
  return (
    <group>
      <StaticBox position={[x, -0.25, z]} size={[length, 0.5, width]} color="#9e9689" />
      {[-1, 1].map((side) => (
        <StaticBox key={side} position={[x, 0.25, z + side * (width / 2 + 0.15)]} size={[length, 0.5, 0.3]} color="#b0a89a" />
      ))}
      {[-1, 1].map((side) => (
        <mesh key={side} castShadow position={[x + side * 3.5, -0.5, z]} material={stone}>
          <boxGeometry args={[1.2, 1, width + 0.6]} />
        </mesh>
      ))}
    </group>
  );
}

/** A little arched footbridge over the river on the way to the dino park. */
function RiverFootbridge() {
  const [x, z] = RIVER_FOOTBRIDGE.center;
  const { length, width } = RIVER_FOOTBRIDGE;
  const wood = '#a1887f';
  const rail = '#6d4c41';
  return (
    <group>
      <StaticBox position={[x, -0.2, z]} size={[length, 0.4, width]} color={wood} />
      {[-1, 1].map((side) => (
        <group key={side}>
          <StaticBox position={[x, 0.35, z + side * (width / 2 + 0.1)]} size={[length, 0.7, 0.2]} color={rail} shadow={false} />
          {[-1, 1].map((end) => (
            <mesh key={end} castShadow position={[x + end * (length / 2 - 0.3), 0.5, z + side * (width / 2 + 0.1)]} material={lambert(rail)}>
              <cylinderGeometry args={[0.1, 0.12, 1.4, 8]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Stepping stones across the river on the way to the playground: hop, hop, hop (or splash). */
function SteppingStones() {
  const { from, to, count, radius } = STEPPING_STONES;
  const stone = lambert('#9e9689');
  const stones = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const x = from[0] + (to[0] - from[0]) * t;
        const z = from[1] + (to[1] - from[1]) * t + (i % 2 ? 0.35 : -0.35);
        return { x, z, bottom: groundHeight(x, z) - 0.3 };
      }),
    [from, to, count]
  );
  return (
    <RigidBody type="fixed" colliders={false}>
      {stones.map((s, i) => (
        <group key={i} position={[s.x, (s.bottom + 0.06) / 2, s.z]}>
          <CylinderCollider args={[(0.06 - s.bottom) / 2, radius]} friction={1} />
          <mesh castShadow receiveShadow material={stone}>
            <cylinderGeometry args={[radius, radius * 1.1, 0.06 - s.bottom, 14]} />
          </mesh>
        </group>
      ))}
    </RigidBody>
  );
}

export function Landmarks() {
  return (
    <>
      <Mesa />
      <Footbridge />
      <TrainBridge />
      <RiverFootbridge />
      <SteppingStones />
    </>
  );
}
