import {
  ConvexHullCollider,
  CuboidCollider,
  CylinderCollider,
  type RapierCollider
} from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import type { Vec2, Vec3 } from '../layout';
import { lambert } from '../materials';
import { registerHint, type Hint, type Surface } from '../runtime';
import { useSurface } from './surface';
import { useGameFrame } from '../clock';

let hintId = 1;

/** Shows a floating controller-button hint here when a player comes close (one that `wants` it). */
export function useHint(position: Vec3 | THREE.Vector3, action: Hint['action'], radius = 4, wants?: Hint['wants']) {
  const id = useMemo(() => hintId++, []);
  const pos = useMemo(
    () => (position instanceof THREE.Vector3 ? position : new THREE.Vector3(position[0], position[1], position[2])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  // (`wants` is read through a ref: a new function each render doesn't re-register the hint)
  const wantsRef = useRef(wants);
  wantsRef.current = wants;
  useEffect(() => registerHint({ id, position: pos, radius, action, wants: (p) => !wantsRef.current || wantsRef.current(p) }), [id, pos, radius, action]);
  return pos;
}

type BoxProps = {
  position: Vec3;
  size: Vec3;
  rotation?: Vec3;
  color: string;
  surface?: Surface;
  shadow?: boolean;
  material?: THREE.Material;
  friction?: number;
  restitution?: number;
};

/** A fixed box with matching collider. */
export function StaticBox({ position, size, rotation, color, surface, shadow = true, material, friction, restitution }: BoxProps) {
  const col = useRef<RapierCollider>(null);
  useSurface(col, surface ?? EMPTY_SURFACE);
  return (
    <group position={position} rotation={rotation}>
      {/* only pass what was given: an undefined friction or restitution becomes NaN in the
          physics, and a NaN contact lets a running animal sink straight through the box */}
      <CuboidCollider ref={col} args={[size[0] / 2, size[1] / 2, size[2] / 2]} {...(friction != null ? { friction } : {})} {...(restitution != null ? { restitution } : {})} />
      <mesh castShadow={shadow} receiveShadow material={material ?? lambert(color)}>
        <boxGeometry args={size} />
      </mesh>
    </group>
  );
}

const EMPTY_SURFACE: Surface = {};

export function StaticCylinder({
  position,
  radius,
  height,
  color,
  radiusTop,
  segments = 16,
  surface
}: {
  position: Vec3;
  radius: number;
  height: number;
  color: string;
  radiusTop?: number;
  segments?: number;
  surface?: Surface;
}) {
  const col = useRef<RapierCollider>(null);
  useSurface(col, surface ?? EMPTY_SURFACE);
  return (
    <group position={position}>
      <CylinderCollider ref={col} args={[height / 2, Math.max(radius, radiusTop ?? radius)]} />
      <mesh castShadow receiveShadow material={lambert(color)}>
        <cylinderGeometry args={[radiusTop ?? radius, radius, height, segments]} />
      </mesh>
    </group>
  );
}

/**
 * A plank whose top surface runs from `from` to `to` (both are points on the walking
 * surface). Optional side rails. Used for ramps, slides, gangplanks and dino necks.
 */
export function Ramp({
  from,
  to,
  width,
  color,
  railColor,
  railHeight = 0.55,
  thickness = 0.3,
  surface,
  friction,
  solid
}: {
  from: Vec3;
  to: Vec3;
  width: number;
  color: string;
  railColor?: string;
  railHeight?: number;
  thickness?: number;
  surface?: Surface;
  /** A slide is frictionless (0): a ball with grip starts rolling, and rolling is damped, so it would crawl. */
  friction?: number;
  /**
   * Fill the space under it down into the ground, so nothing can wander in underneath and get
   * wedged where the ramp comes down to meet the ground.
   */
  solid?: string;
}) {
  const col = useRef<RapierCollider>(null);
  useSurface(col, surface ?? EMPTY_SURFACE);
  const { center, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a);
    const len = dir.length();
    dir.normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    const pitch = -Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const c = a.clone().add(b).multiplyScalar(0.5).addScaledVector(normal, -thickness / 2);
    return { center: c, quaternion: q, length: len };
  }, [from, to, thickness]);
  const base = useMemo(() => {
    if (!solid) return null;
    const dx = to[0] - from[0];
    const dz = to[2] - from[2];
    const flat = Math.hypot(dx, dz) || 1;
    const sx = (-dz / flat) * (width / 2 - 0.05);
    const sz = (dx / flat) * (width / 2 - 0.05);
    const bottom = Math.min(from[1], to[1]) - 0.8;
    const pts: THREE.Vector3[] = [];
    for (const [x, y, z] of [from, to])
      for (const side of [-1, 1]) {
        pts.push(new THREE.Vector3(x + sx * side, y - thickness - 0.02, z + sz * side));
        pts.push(new THREE.Vector3(x + sx * side, bottom, z + sz * side));
      }
    const geometry = new ConvexGeometry(pts);
    return { geometry, vertices: new Float32Array(pts.flatMap((p) => [p.x, p.y, p.z])) };
  }, [solid, from, to, width, thickness]);

  return (
    <>
    {base && (
      <group>
        <ConvexHullCollider args={[base.vertices]} />
        <mesh castShadow receiveShadow geometry={base.geometry} material={lambert(solid!)} />
      </group>
    )}
    <group position={center} quaternion={quaternion}>
      <CuboidCollider ref={col} args={[width / 2, thickness / 2, length / 2]} {...(friction != null ? { friction } : {})} />
      <mesh castShadow receiveShadow material={lambert(color)}>
        <boxGeometry args={[width, thickness, length]} />
      </mesh>
      {railColor &&
        [-1, 1].map((side) => (
          <group key={side} position={[(side * (width + 0.2)) / 2, railHeight / 2 + thickness / 2, 0]}>
            <CuboidCollider args={[0.1, railHeight / 2, length / 2]} />
            <mesh castShadow material={lambert(railColor)}>
              <boxGeometry args={[0.2, railHeight, length]} />
            </mesh>
          </group>
        ))}
    </group>
    </>
  );
}

/**
 * A hedge from `from` to `to`. With `y0`/`y1` (the ground height at each end) it tilts to follow
 * the ground, so the border hedge runs up the mountain without steps.
 */
export function HedgeSegment({ from, to, y0 = 0, y1 = 0, height = 1.8, thickness = 1.3 }: { from: Vec2; to: Vec2; y0?: number; y1?: number; height?: number; thickness?: number }) {
  const { len, quaternion, center } = useMemo(() => {
    const dir = new THREE.Vector3(to[0] - from[0], y1 - y0, to[1] - from[1]);
    const len = dir.length() + thickness;
    dir.normalize();
    // local x along the hedge, local y as near to straight up as the slope allows
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, up, right));
    return { len, quaternion: q, center: [(from[0] + to[0]) / 2, (y0 + y1) / 2, (from[1] + to[1]) / 2] as Vec3 };
  }, [from, to, y0, y1, thickness]);
  return (
    <group position={center} quaternion={quaternion}>
      <CuboidCollider args={[len / 2, height / 2, thickness / 2]} position={[0, height / 2, 0]} />
      <mesh castShadow receiveShadow position={[0, height / 2 - 0.1, 0]} material={lambert('#3f9a3f')}>
        <boxGeometry args={[len, height - 0.2, thickness]} />
      </mesh>
      <mesh castShadow position={[0, height - 0.2, 0]} rotation={[0, 0, Math.PI / 2]} material={lambert('#4fae47')}>
        <cylinderGeometry args={[thickness / 2, thickness / 2, len, 10]} />
      </mesh>
    </group>
  );
}

/** Flat decal-like ground patch (sand, snow, rubber...). */
export function GroundPatch({
  center,
  radius,
  color,
  y = 0.008,
  material,
  segments = 48
}: {
  center: Vec2;
  radius: number;
  color: string;
  y?: number;
  material?: THREE.Material;
  segments?: number;
}) {
  const mat = useMemo(() => {
    if (material) return material;
    const m = new THREE.MeshLambertMaterial({ color });
    m.polygonOffset = true;
    m.polygonOffsetFactor = -1;
    m.polygonOffsetUnits = -1;
    return m;
  }, [color, material]);
  return (
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[center[0], y, center[1]]} material={mat}>
      <circleGeometry args={[radius, segments]} />
    </mesh>
  );
}

export type SlideTowerProps = {
  base: Vec3;
  height: number;
  /** Direction the ramp comes from (radians, 0 = +z). */
  rampAngle: number;
  rampLength: number;
  slideAngle: number;
  slideLength: number;
  colors: { tower: string; ramp: string; slide: string; rail: string };
  /** A little ski-jump lip at the bottom of the slide. */
  kicker?: boolean;
};

/** Walk up the ramp, slide down the other side. Used for the playground slide and the ski jump. */
export function SlideTower({ base, height, rampAngle, rampLength, slideAngle, slideLength, colors, kicker }: SlideTowerProps) {
  // `base[1]` is the ground level it stands on (the ski jump is up the mountain)
  const [bx, y0, bz] = base;
  const half = 1.6;
  const slideSurface = useMemo<Surface>(() => ({ slippery: 0.35, slide: true }), []);
  const edge = (angle: number, dist: number, y: number): Vec3 => [bx + Math.sin(angle) * dist, y0 + y, bz + Math.cos(angle) * dist];
  const rampTop = edge(rampAngle, half, height);
  const rampBottom = edge(rampAngle, half + rampLength, 0);
  const slideTop = edge(slideAngle, half, height);
  const slideDrop = kicker ? 0.9 : 0.25;
  const slideBottom = edge(slideAngle, half + slideLength, slideDrop);
  const kickerEnd = edge(slideAngle, half + slideLength + 2.6, slideDrop + 0.9);
  const posts: Vec2[] = [
    [bx - half + 0.2, bz - half + 0.2],
    [bx + half - 0.2, bz - half + 0.2],
    [bx - half + 0.2, bz + half - 0.2],
    [bx + half - 0.2, bz + half - 0.2]
  ];
  // Railings on the two sides without ramp or slide.
  const railSides = [0, Math.PI / 2, Math.PI, -Math.PI / 2].filter(
    (a) => Math.abs(Math.cos(a - rampAngle) - 1) > 0.01 && Math.abs(Math.cos(a - slideAngle) - 1) > 0.01
  );
  return (
    <group>
      <StaticBox position={[bx, y0 + height - 0.15, bz]} size={[half * 2, 0.3, half * 2]} color={colors.tower} />
      {posts.map(([x, z], i) => (
        <StaticCylinder key={i} position={[x, y0 + (height - 0.3) / 2, z]} radius={0.18} height={height - 0.3} color={colors.rail} segments={8} />
      ))}
      {railSides.map((a) => {
        const [x, , z] = edge(a, half - 0.1, 0);
        const along = Math.abs(Math.sin(a)) > 0.5;
        return (
          <StaticBox
            key={a}
            position={[x, y0 + height + 0.35, z]}
            size={along ? [0.2, 0.7, half * 2] : [half * 2, 0.7, 0.2]}
            color={colors.rail}
          />
        );
      })}
      <Ramp from={rampBottom} to={rampTop} width={2} color={colors.ramp} railColor={colors.rail} />
      <Ramp from={slideTop} to={slideBottom} width={2} color={colors.slide} railColor={colors.slide} railHeight={0.6} surface={slideSurface} thickness={0.25} friction={0} />
      {kicker && <Ramp from={slideBottom} to={kickerEnd} width={2} color={colors.slide} surface={slideSurface} thickness={0.25} friction={0} />}
    </group>
  );
}

/** Gently bobbing + spinning helper used by decorative bits. */
export function Spinner({ speed = 1, axis = 'y', children, position }: { speed?: number; axis?: 'x' | 'y' | 'z'; children: React.ReactNode; position?: Vec3 }) {
  const g = useRef<THREE.Group>(null);
  useGameFrame((_, dt) => {
    if (g.current) g.current.rotation[axis] += dt * speed;
  });
  return (
    <group ref={g} position={position}>
      {children}
    </group>
  );
}
