import { BallCollider, CuboidCollider, RigidBody } from '@react-three/rapier';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { gameClock, useGameFrame } from '../clock';
import { FOOTBRIDGE, HILLS, MESA } from '../layout';
import { lambert, speckleTexture } from '../materials';
import { Ramp, StaticBox, useHint } from './common';
import { useSeeThrough } from './seeThrough';

// Landmarks in the open grass between the zones: grassy hills to run up and jump off, a mesa
// with the train tunnel through it (walk up the ramp or take the launch pad, wave the flag,
// watch the train come out underneath you), and a footbridge over the north track.

function grassMaterial(name: string) {
  return new THREE.MeshLambertMaterial({ map: speckleTexture(name, '#6cbd4c', ['#5faa42', '#7fcf5e', '#c9e59a'], 8) });
}

/** A round grassy hill: the top of a big sphere, like the snow hill. */
function Hill({ center, radius, height, index }: { center: [number, number]; radius: number; height: number; index: number }) {
  const R = (radius * radius + height * height) / (2 * height);
  const capAngle = Math.acos((R - height) / R);
  const mat = useMemo(() => grassMaterial(`hill${index}`), [index]);
  return (
    <RigidBody type="fixed" colliders={false} position={[center[0], height - R, center[1]]}>
      <BallCollider args={[R]} friction={1} />
      <mesh receiveShadow castShadow material={mat}>
        <sphereGeometry args={[R, 40, 14, 0, Math.PI * 2, 0, capAngle]} />
      </mesh>
    </RigidBody>
  );
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

/** The mesa: two earth walls, a roof, the tunnel between them, grass on top. */
function Mesa() {
  const [cx, cz] = MESA.center;
  const { halfWidth: hw, halfLength: hl, opening, clearance, roof } = MESA;
  const wallW = hw - opening / 2;
  const top = clearance + roof;
  const whole = useRef<THREE.Group>(null);
  useSeeThrough(whole, cx, cz, hw + 2);
  const rock = useMemo(() => new THREE.MeshLambertMaterial({ map: speckleTexture('mesa', '#9c8a6e', ['#8a7757', '#b3a184', '#7a6a4f'], 7) }), []);
  const grass = useMemo(() => grassMaterial('mesa-top'), []);
  const stone = lambert('#c9c2b6');
  const boulder = lambert('#8f8a82');
  useHint([MESA.rampFrom[0], 0.5, MESA.rampFrom[2]], 'walk', 4);
  const boulders: [number, number, number, number][] = [
    [-hw - 1, 0.7, 5, 0.9],
    [-hw - 0.8, 0.5, -3, 0.6],
    [4, hl + 2.2, 0.55, 0.8],
    [-4.2, -hl - 2, 0.6, 0.85],
    [-3.5, 4.5, top + 0.5, 0.6],
    [3.8, -5.5, top + 0.6, 0.7]
  ];
  return (
    <group ref={whole}>
      <RigidBody type="fixed" colliders={false} position={[cx, 0, cz]}>
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
      <Ramp from={MESA.rampFrom} to={MESA.rampTo} width={2.6} color="#a1887f" railColor="#6d4c41" />
      <Flag position={[cx, top + 0.1, cz]} />
    </group>
  );
}

/** A wooden footbridge over the north track: up the ramp, along the deck, look down on the train. */
function Footbridge() {
  const { x, height, deckThickness, rampFrom, deckFrom, deckTo, width } = FOOTBRIDGE;
  const wood = '#a1887f';
  const rail = '#6d4c41';
  const deckLen = deckFrom - deckTo;
  const deckZ = (deckFrom + deckTo) / 2;
  useHint([x, 0.5, rampFrom], 'walk', 4);
  return (
    <group>
      {/* the ramp's end rests on the deck (level with it, it would leave a step that stops you) */}
      <Ramp from={[x, 0, rampFrom]} to={[x, height + 0.3, deckFrom - 0.4]} width={width} color={wood} railColor={rail} />
      <StaticBox position={[x, height - deckThickness / 2, deckZ]} size={[width, deckThickness, deckLen]} color={wood} />
      {[-1, 1].map((side) => (
        <StaticBox key={side} position={[x + side * (width / 2 + 0.1), height + 0.35, deckZ]} size={[0.2, 0.7, deckLen]} color={rail} />
      ))}
      <StaticBox position={[x, height + 0.35, deckTo + 0.1]} size={[width + 0.4, 0.7, 0.2]} color={rail} />
      {/* posts down to the ground, either side of the track */}
      {[-1, 1].map((side) =>
        [deckFrom - 0.4, deckTo + 0.4].map((z) => (
          <mesh key={`${side}${z}`} castShadow position={[x + side * (width / 2 - 0.15), (height - deckThickness) / 2, z]} material={lambert(rail)}>
            <cylinderGeometry args={[0.15, 0.18, height - deckThickness, 8]} />
          </mesh>
        ))
      )}
    </group>
  );
}

export function Landmarks() {
  return (
    <>
      {HILLS.map((h, i) => (
        <Hill key={i} index={i} {...h} />
      ))}
      <Mesa />
      <Footbridge />
    </>
  );
}
