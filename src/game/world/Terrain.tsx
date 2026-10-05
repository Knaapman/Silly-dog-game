import { CuboidCollider, CylinderCollider, HeightfieldCollider, RigidBody } from '@react-three/rapier';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { WORLD_HALF_X, WORLD_HALF_Z } from '../config';
import { buildHeightGrid, groundHeight, mountainWeight, riverAt, TERRAIN, trackDist } from '../terrain';
import { BOULDERS, distXZ, FLOOR_PATCHES, FOOTBRIDGE, HILLS, MAZE, MESA, MOUNTAIN_PATHS, PATH_WIDTH, PATHS, PLAZA, SEA, SIGNS, SNOW, ZONES, type Vec2 } from '../layout';
import { emojiSignTexture, grassTexture, lambert, speckleTexture, stripeTexture, tileTexture } from '../materials';
import { HedgeSegment } from './common';
import { Water } from './Water';
import { gameClock, useGameFrame } from '../clock';

/** The big flat grass beyond the hedge, running off into the fog (it stops at the coast). */
const FAR = 400;
const FAR_Z = SEA.coast - FAR / 2;

/** A flat rectangle of far grass at y -0.02, tiled like the park's ground so the two match at the seam. */
function farGrass(x0: number, x1: number, z0: number, z1: number) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array([x0, -0.02, z0, x1, -0.02, z0, x0, -0.02, z1, x1, -0.02, z1]);
  const uv = new Float32Array([x0, z0, x1, z0, x0, z1, x1, z1].map((v, i) => (i % 2 === 0 ? (v + FAR / 2) / FAR : (FAR_Z + FAR / 2 - v) / FAR)));
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  return g;
}

/**
 * The ground: a heightfield for the physics and a matching grass mesh (see terrain.ts), over a
 * big flat plane that runs off into the fog beyond the hedge.
 */
/**
 * The grass texture, tinted per vertex: rock where the ground is steep, snow up the mountain,
 * sand where it dips under the water (the river's banks, the beach).
 */
function groundMaterial() {
  const m = new THREE.MeshLambertMaterial({ map: grassTexture() });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = 'attribute vec3 blend;\nvarying vec3 vBlend;\n' + shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvBlend = blend;');
    shader.fragmentShader =
      'varying vec3 vBlend;\n' +
      shader.fragmentShader.replace(
        '#include <map_fragment>',
        [
          '#include <map_fragment>',
          'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.44, 0.38) * (0.55 + 0.9 * diffuseColor.g), vBlend.x);',
          'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.97, 1.0) * (0.85 + 0.3 * diffuseColor.g), vBlend.y);',
          'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.8, 0.6) * (0.75 + 0.4 * diffuseColor.g), vBlend.z);'
        ].join('\n')
      );
  };
  m.customProgramCacheKey = () => 'ground-blend';
  return m;
}

/** The ground is drawn in chunks this many grid cells across (20 m). */
const CHUNK = 40;

function Ground() {
  const material = useMemo(groundMaterial, []);
  const far = useMemo(() => new THREE.MeshLambertMaterial({ map: grassTexture() }), []);
  const farStrips = useMemo(
    () => [farGrass(-FAR / 2, FAR / 2, -FAR / 2, TERRAIN.minZ), farGrass(-FAR / 2, TERRAIN.minX, TERRAIN.minZ, SEA.coast), farGrass(TERRAIN.maxX, FAR / 2, TERRAIN.minZ, SEA.coast)],
    []
  );
  const { nx, nz, heights, chunks, scale, center } = useMemo(() => {
    const { nx, nz, heights } = buildHeightGrid();
    const { minX, minZ, maxX, maxZ, cell } = TERRAIN;
    // the mesh: one vertex per grid sample, the same heights the physics uses
    const geometry = new THREE.BufferGeometry();
    const count = (nx + 1) * (nz + 1);
    const pos = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    for (let iz = 0; iz <= nz; iz += 1)
      for (let ix = 0; ix <= nx; ix += 1) {
        const k = iz * (nx + 1) + ix;
        const x = minX + ix * cell;
        const z = minZ + iz * cell;
        pos[k * 3] = x;
        pos[k * 3 + 1] = heights[k];
        pos[k * 3 + 2] = z;
        // the same tiling as the big plane underneath, so the two match at the edge
        uv[k * 2] = (x + FAR / 2) / FAR;
        uv[k * 2 + 1] = (FAR_Z + FAR / 2 - z) / FAR;
      }
    const index = new Uint32Array(nx * nz * 6);
    let q = 0;
    for (let iz = 0; iz < nz; iz += 1)
      for (let ix = 0; ix < nx; ix += 1) {
        const a = iz * (nx + 1) + ix;
        const b = a + 1;
        const c = a + (nx + 1);
        const d = c + 1;
        index[q++] = a;
        index[q++] = c;
        index[q++] = b;
        index[q++] = b;
        index[q++] = c;
        index[q++] = d;
      }
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.computeVertexNormals();
    // The mountain in bands, like a picture-book mountain: grass at its foot, a band of rock up
    // its face, snow from the rim up. The bands have crisp edges (soft ones read as fog). Sand
    // under the water and along the coast. The rolling grass and the hills stay green.
    const band = (y: number, edge: number) => THREE.MathUtils.smoothstep(y, edge - 0.18, edge + 0.18);
    const blend = new Float32Array(count * 3);
    const beach = SEA.coast - SEA.shore - 3;
    for (let iz = 0; iz <= nz; iz += 1)
      for (let ix = 0; ix <= nx; ix += 1) {
        const k = iz * (nx + 1) + ix;
        const x = minX + ix * cell;
        const z = minZ + iz * cell;
        const y = heights[k];
        const onMountain = mountainWeight(x, z) > 0.12 ? 1 : 0;
        const snow = band(y, 8.2);
        const rock = band(y, 3.2) * (1 - snow) * onMountain;
        const wet = band(-y, 0.12);
        const shore = band(z, beach + 1);
        const sand = Math.max(wet, shore) * (1 - snow);
        blend[k * 3] = rock * (1 - sand);
        blend[k * 3 + 1] = snow;
        blend[k * 3 + 2] = sand;
      }
    geometry.setAttribute('blend', new THREE.BufferAttribute(blend, 3));
    // Drawn in square chunks that share the vertices, so the camera only draws the ground it can
    // see (as one mesh it was a quarter of a million triangles in every view, every frame).
    const chunks: THREE.BufferGeometry[] = [];
    for (let cz = 0; cz < nz; cz += CHUNK)
      for (let cx = 0; cx < nx; cx += CHUNK) {
        const ex = Math.min(nx, cx + CHUNK);
        const ez = Math.min(nz, cz + CHUNK);
        const part = new Uint32Array((ex - cx) * (ez - cz) * 6);
        let lo = Infinity;
        let hi = -Infinity;
        let w = 0;
        for (let iz = cz; iz < ez; iz += 1)
          for (let ix = cx; ix < ex; ix += 1) {
            const q0 = (iz * nx + ix) * 6;
            for (let n = 0; n < 6; n += 1) part[w++] = index[q0 + n];
          }
        for (let iz = cz; iz <= ez; iz += 1)
          for (let ix = cx; ix <= ex; ix += 1) {
            const y = heights[iz * (nx + 1) + ix];
            lo = Math.min(lo, y);
            hi = Math.max(hi, y);
          }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', geometry.getAttribute('position'));
        g.setAttribute('uv', geometry.getAttribute('uv'));
        g.setAttribute('normal', geometry.getAttribute('normal'));
        g.setAttribute('blend', geometry.getAttribute('blend'));
        g.setIndex(new THREE.BufferAttribute(part, 1));
        // (the bounds of this chunk, not of the whole shared vertex list)
        g.boundingBox = new THREE.Box3(new THREE.Vector3(minX + cx * cell, lo, minZ + cz * cell), new THREE.Vector3(minX + ex * cell, hi, minZ + ez * cell));
        g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
        chunks.push(g);
      }
    // rapier wants the height matrix column-major: rows along z, columns along x
    const colMajor = new Float32Array(count);
    for (let iz = 0; iz <= nz; iz += 1) for (let ix = 0; ix <= nx; ix += 1) colMajor[ix * (nz + 1) + iz] = heights[iz * (nx + 1) + ix];
    return { nx, nz, heights: Array.from(colMajor), chunks, scale: { x: nx * cell, y: 1, z: nz * cell }, center: [(minX + maxX) / 2, 0, (minZ + maxZ) / 2] as [number, number, number] };
  }, []);
  const hx = WORLD_HALF_X;
  const hz = WORLD_HALF_Z;
  return (
    <RigidBody type="fixed" colliders={false} friction={1}>
      <HeightfieldCollider args={[nz, nx, heights, scale]} position={center} friction={1} />
      {chunks.map((g, i) => (
        <mesh key={i} receiveShadow geometry={g} material={material} />
      ))}
      {/* the flat grass beyond the park's ground: north, west and east (the sea takes the south) */}
      {farStrips.map((g, i) => (
        <mesh key={i} receiveShadow geometry={g} material={far} />
      ))}
      {/* Tall invisible walls so nothing escapes the park (or swims out to sea) */}
      <CuboidCollider args={[hx + 2, 30, 0.5]} position={[0, 30, -hz - 1]} />
      <CuboidCollider args={[hx + 2, 30, 0.5]} position={[0, 30, hz + 1]} />
      <CuboidCollider args={[0.5, 30, hz + 2]} position={[-hx - 1, 30, 0]} />
      <CuboidCollider args={[0.5, 30, hz + 2]} position={[hx + 1, 30, 0]} />
      {/* and a floor under it all, in case anything ever gets past the heightfield's edge. Deep
          down: just under the sea and river beds it caught anything that punched through them,
          half in the bed, where nothing could get it back up (see keepAboveGround, liftIfUnder) */}
      <CuboidCollider args={[hx + 30, 0.5, hz + 40]} position={[0, -12.5, 0]} />
    </RigidBody>
  );
}

/** The hedge round three sides of the park (the sea is the fourth), in pieces that follow the ground. */
function Border() {
  const pieces = useMemo(() => {
    const out: { from: Vec2; to: Vec2; y0: number; y1: number }[] = [];
    const hx = WORLD_HALF_X + 0.6;
    const hz = WORLD_HALF_Z + 0.6;
    const add = (from: Vec2, to: Vec2) => out.push({ from, to, y0: groundHeight(from[0], from[1]), y1: groundHeight(to[0], to[1]) });
    const STEP = 4;
    for (let x = -hx; x < hx - 0.01; x += STEP) add([x, -hz], [Math.min(hx, x + STEP), -hz]);
    for (let z = -hz; z < SEA.coast - 0.01; z += STEP) {
      add([-hx, z], [-hx, Math.min(SEA.coast, z + STEP)]);
      add([hx, z], [hx, Math.min(SEA.coast, z + STEP)]);
    }
    return out;
  }, []);
  return (
    <>
      {pieces.map((p, i) => (
        <HedgeSegment key={i} from={p.from} to={p.to} y0={p.y0} y1={p.y1} height={2.4} />
      ))}
      {MAZE.walls.map(([x1, z1, x2, z2], i) => (
        <HedgeSegment key={`m${i}`} from={[x1, z1]} to={[x2, z2]} height={1.4} thickness={0.9} />
      ))}
    </>
  );
}

function offsetMaterial(map: THREE.Texture, factor = -1) {
  const m = new THREE.MeshLambertMaterial({ map });
  m.polygonOffset = true;
  m.polygonOffsetFactor = factor;
  m.polygonOffsetUnits = factor;
  return m;
}

/** A disc of ground cover that follows the lie of the land (rings a metre apart). */
export function groundDiscGeometry(center: Vec2, radius: number, lift: number, segments = 48) {
  const rings = Math.max(2, Math.ceil(radius * 2));
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  pos.push(center[0], groundHeight(center[0], center[1]) + lift, center[1]);
  uv.push(0.5, 0.5);
  for (let ring = 1; ring <= rings; ring += 1) {
    const r = (radius * ring) / rings;
    for (let s = 0; s < segments; s += 1) {
      const a = (s / segments) * Math.PI * 2;
      const x = center[0] + Math.cos(a) * r;
      const z = center[1] + Math.sin(a) * r;
      pos.push(x, groundHeight(x, z) + lift, z);
      uv.push(0.5 + (Math.cos(a) * r) / (radius * 2), 0.5 - (Math.sin(a) * r) / (radius * 2));
    }
  }
  const at = (ring: number, s: number) => (ring === 0 ? 0 : 1 + (ring - 1) * segments + (s % segments));
  for (let s = 0; s < segments; s += 1) index.push(0, at(1, s + 1), at(1, s));
  for (let ring = 1; ring < rings; ring += 1)
    for (let s = 0; s < segments; s += 1) {
      const a = at(ring, s);
      const b = at(ring, s + 1);
      const c = at(ring + 1, s);
      const d = at(ring + 1, s + 1);
      index.push(a, d, c, a, b, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** A strip of ground cover from `a` to `b` that follows the lie of the land. */
export function groundRibbonGeometry(a: Vec2, b: Vec2, width: number, lift: number) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(len));
  const dx = (b[0] - a[0]) / len;
  const dz = (b[1] - a[1]) / len;
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = a[0] + (b[0] - a[0]) * t;
    const z = a[1] + (b[1] - a[1]) * t;
    for (const side of [-1, 1]) {
      const px = x + (dz * side * width) / 2;
      const pz = z - (dx * side * width) / 2;
      pos.push(px, groundHeight(px, pz) + lift, pz);
      uv.push(t, side > 0 ? 1 : 0);
    }
  }
  for (let i = 0; i < steps; i += 1) {
    const k = i * 2;
    index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** Each zone gets its own floor so it reads as a different place at a glance. */
function ZoneFloors() {
  const mats = useMemo(
    () => ({
      plaza: offsetMaterial(tileTexture('plaza', ['#f3e3c3', '#ead3a8'], '#d8bf8f', 6)),
      carnival: offsetMaterial(tileTexture('carnival', ['#ff8fb5', '#ffe07a', '#8fd3ff', '#b9f0a8'], '#ffffff', 7)),
      snow: offsetMaterial(speckleTexture('snow', '#f7fbff', ['#dcecff', '#ffffff', '#cfe3fa'], 8)),
      sand: offsetMaterial(speckleTexture('sand', '#f2dc9b', ['#e2c67d', '#fff0c2'], 10)),
      dirt: offsetMaterial(speckleTexture('dirt', '#caa06a', ['#b88a52', '#dab680'], 8)),
      dino: offsetMaterial(speckleTexture('dino', '#e7b97a', ['#d59f5c', '#f3cd96'], 9)),
      rubber: offsetMaterial(speckleTexture('rubber', '#58c9b9', ['#46b6a6', '#7fdccf', '#ffd23f'], 9)),
      forest: offsetMaterial(speckleTexture('forest', '#5ea64c', ['#4f9540', '#77bb5e', '#c9e59a'], 10))
    }),
    []
  );
  const geometries = useMemo(() => FLOOR_PATCHES.map((p) => groundDiscGeometry(p.center, p.radius, p.y)), []);
  return (
    <group>
      {FLOOR_PATCHES.map((p, i) => (
        <mesh key={p.kind} receiveShadow geometry={geometries[i]} material={mats[p.kind]} />
      ))}
    </group>
  );
}

function pathMaterial(color: string) {
  const m = new THREE.MeshLambertMaterial({ color });
  m.polygonOffset = true;
  m.polygonOffsetFactor = -1;
  m.polygonOffsetUnits = -1;
  return m;
}

const pathParts = (list: [Vec2, Vec2][]) =>
  list.flatMap(([a, b]) => [groundRibbonGeometry(a, b, PATH_WIDTH, 0.012), groundDiscGeometry(a, PATH_WIDTH / 2, 0.012, 20), groundDiscGeometry(b, PATH_WIDTH / 2, 0.012, 20)]);

/** Log steps across the mountain path where it climbs (flush with the ground: you run straight over them). */
function LogSteps() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const steps = useMemo(() => {
    const out: { x: number; y: number; z: number; q: THREE.Quaternion }[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (const [a, b] of MOUNTAIN_PATHS) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const across = new THREE.Vector3(-(b[1] - a[1]) / len, 0, (b[0] - a[0]) / len);
      const q = new THREE.Quaternion().setFromUnitVectors(up, across);
      for (let d = 0.8; d < len - 0.8; d += 1.6) {
        const x = a[0] + ((b[0] - a[0]) * d) / len;
        const z = a[1] + ((b[1] - a[1]) * d) / len;
        const y = groundHeight(x, z);
        if (y > 0.4) out.push({ x, y: y + 0.03, z, q });
      }
    }
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new THREE.Object3D();
    steps.forEach((st, i) => {
      o.position.set(st.x, st.y, st.z);
      o.quaternion.copy(st.q);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [steps]);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, steps.length]} receiveShadow material={lambert('#8b5a2b')}>
      <cylinderGeometry args={[0.09, 0.09, PATH_WIDTH + 0.2, 8]} />
    </instancedMesh>
  );
}

function Paths() {
  const sandy = useMemo(() => pathMaterial('#ecd29a'), []);
  const gravel = useMemo(() => pathMaterial('#cdc3b1'), []);
  const parts = useMemo(() => pathParts(PATHS), []);
  const mountain = useMemo(() => pathParts(MOUNTAIN_PATHS), []);
  return (
    <group>
      {parts.map((g, i) => (
        <mesh key={i} receiveShadow geometry={g} material={sandy} />
      ))}
      {mountain.map((g, i) => (
        <mesh key={`m${i}`} receiveShadow geometry={g} material={gravel} />
      ))}
      <LogSteps />
    </group>
  );
}

/** Keep decorations on plain grass. */
const BLOCKERS: { c: Vec2; r: number }[] = [
  { c: PLAZA.center, r: PLAZA.radius + 1 },
  ...FLOOR_PATCHES.map((p) => ({ c: p.center, r: p.radius + 1 })),
  { c: SNOW.center, r: SNOW.radius + 3 },
  { c: ZONES.sports, r: 15 },
  ...HILLS.map((h) => ({ c: h.center, r: h.radius + 1.2 })),
  { c: MESA.center, r: 12 },
  ...BOULDERS.map((b) => ({ c: b.at, r: b.r + 0.5 })),
  { c: [(FOOTBRIDGE.rampFrom + FOOTBRIDGE.deckTo) / 2, FOOTBRIDGE.z] as Vec2, r: 10 }
];

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function Flowers() {
  const heads = useRef<THREE.InstancedMesh>(null);
  const stems = useRef<THREE.InstancedMesh>(null);
  const items = useMemo(() => {
    const rnd = seeded(7);
    const colors = ['#ff6f91', '#ffd23f', '#ffffff', '#b388ff', '#ff9e40', '#4fc3f7'];
    const out: { x: number; z: number; y: number; s: number; color: string }[] = [];
    const river = { d: 0, level: 0 };
    let guard = 0;
    while (out.length < 520 && guard < 16000) {
      guard += 1;
      const x = (rnd() - 0.5) * (WORLD_HALF_X * 2 - 4);
      const z = -WORLD_HALF_Z + 2 + rnd() * (SEA.coast - 8 + WORLD_HALF_Z - 2);
      if (BLOCKERS.some((b) => distXZ(x, z, b.c[0], b.c[1]) < b.r) || trackDist(x, z) < 2.5 || riverAt(x, z, river).d < 6.5) continue;
      const y = groundHeight(x, z);
      // only on grass: not in the water, the sand along the coast, the mountain's stone or its snow
      if (y < 0 || y > 7.8 || (y > 3 && mountainWeight(x, z) > 0.12) || z > SEA.coast - SEA.shore - 2.8) continue;
      out.push({ x, z, y, s: 0.7 + rnd() * 0.6, color: colors[Math.floor(rnd() * colors.length)] });
    }
    return out;
  }, []);

  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    items.forEach((f, i) => {
      d.position.set(f.x, f.y + 0.28 * f.s, f.z);
      d.scale.setScalar(f.s);
      d.updateMatrix();
      heads.current?.setMatrixAt(i, d.matrix);
      heads.current?.setColorAt(i, c.set(f.color));
      d.position.set(f.x, f.y + 0.13 * f.s, f.z);
      d.updateMatrix();
      stems.current?.setMatrixAt(i, d.matrix);
    });
    if (heads.current) {
      heads.current.instanceMatrix.needsUpdate = true;
      if (heads.current.instanceColor) heads.current.instanceColor.needsUpdate = true;
      heads.current.computeBoundingSphere();
    }
    if (stems.current) {
      stems.current.instanceMatrix.needsUpdate = true;
      stems.current.computeBoundingSphere();
    }
  }, [items]);

  return (
    <group>
      <instancedMesh ref={heads} args={[undefined, undefined, items.length]}>
        <icosahedronGeometry args={[0.12, 0]} />
        <meshLambertMaterial />
      </instancedMesh>
      <instancedMesh ref={stems} args={[undefined, undefined, items.length]} material={lambert('#3d8b37')}>
        <cylinderGeometry args={[0.02, 0.02, 0.26, 4]} />
      </instancedMesh>
    </group>
  );
}

/** Text-free wayfinding: a picture of the place and an arrow pointing to it. */
function Signposts() {
  return (
    <group>
      {SIGNS.map((sign, i) => {
        const target = ZONES[sign.zone];
        const yaw = Math.atan2(target[0] - sign.position[0], target[1] - sign.position[1]);
        return (
          <group key={i} position={[sign.position[0], groundHeight(sign.position[0], sign.position[1]), sign.position[1]]}>
            <RigidBody type="fixed" colliders={false}>
              <CylinderCollider args={[1.3, 0.12]} position={[0, 1.3, 0]} />
            </RigidBody>
            <mesh castShadow position={[0, 1.3, 0]} material={lambert('#8b5a2b')}>
              <cylinderGeometry args={[0.1, 0.12, 2.6, 8]} />
            </mesh>
            <mesh position={[0, 2.35, 0.13]} rotation={[-0.35, 0, 0]}>
              <circleGeometry args={[0.62, 28]} />
              <meshBasicMaterial map={emojiSignTexture(sign.icon)} />
            </mesh>
            <mesh position={[0, 2.35, 0.1]} rotation={[-0.35, 0, 0]} material={lambert('#8b5a2b')}>
              <circleGeometry args={[0.72, 28]} />
            </mesh>
            {/* arrow board pointing at the zone */}
            <group position={[0, 1.55, 0]} rotation={[0, yaw, 0]}>
              <mesh castShadow position={[0, 0, 0.45]} material={lambert('#ffd23f')}>
                <boxGeometry args={[0.35, 0.22, 0.9]} />
              </mesh>
              <mesh castShadow position={[0, 0, 1.05]} rotation={[Math.PI / 2, 0, 0]} material={lambert('#ffd23f')}>
                <coneGeometry args={[0.35, 0.45, 3]} />
              </mesh>
            </group>
          </group>
        );
      })}
    </group>
  );
}

export function Clouds() {
  const group = useRef<THREE.Group>(null);
  const clouds = useMemo(() => {
    const rnd = seeded(42);
    return Array.from({ length: 14 }, () => ({
      x: (rnd() - 0.5) * 240,
      y: 30 + rnd() * 12,
      z: -90 + rnd() * 140,
      s: 2.5 + rnd() * 3,
      speed: 0.6 + rnd() * 0.8
    }));
  }, []);
  useGameFrame((_, delta) => {
    group.current?.children.forEach((c, i) => {
      c.position.x += clouds[i].speed * delta;
      if (c.position.x > 130) c.position.x = -130;
    });
  });
  return (
    <group ref={group}>
      {clouds.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]} scale={c.s}>
          {[[0, 0, 0, 1], [1.1, -0.2, 0.2, 0.75], [-1.1, -0.25, -0.1, 0.8], [0.4, 0.45, 0, 0.7]].map(([x, y, z, r], j) => (
            <mesh key={j} position={[x, y, z]} material={lambert('#ffffff')}>
              <icosahedronGeometry args={[r, 1]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

/** Two hot-air balloons drifting over the park: landmarks in the sky. */
function HotAirBalloons() {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const balloons = useMemo(
    () => [
      { r: 45, y: 26, speed: 0.03, phase: 0, colors: ['#ff4d5e', '#ffd23f', '#ff4d5e', '#ffd23f', '#ff4d5e', '#ffd23f'] },
      { r: 30, y: 32, speed: -0.025, phase: 2.5, colors: ['#3b82f6', '#ffffff', '#22c55e', '#ffffff', '#3b82f6', '#ffffff'] }
    ],
    []
  );
  const mats = useMemo(() => balloons.map((b, i) => new THREE.MeshLambertMaterial({ map: stripeTexture(`hab${i}`, b.colors) })), [balloons]);
  useGameFrame(() => {
    const t = gameClock.time;
    balloons.forEach((b, i) => {
      const g = refs.current[i];
      if (!g) return;
      const a = b.phase + t * b.speed;
      g.position.set(Math.cos(a) * b.r, b.y + Math.sin(t * 0.4 + i) * 1.2, Math.sin(a) * b.r - 10);
      g.rotation.y = t * 0.1;
    });
  });
  return (
    <group>
      {balloons.map((_, i) => (
        <group
          key={i}
          ref={(g) => {
            refs.current[i] = g;
          }}
        >
          <mesh material={mats[i]} scale={[1, 1.15, 1]}>
            <sphereGeometry args={[3.2, 20, 14]} />
          </mesh>
          <mesh position={[0, -3.6, 0]} material={mats[i]}>
            <cylinderGeometry args={[1.6, 0.6, 1.4, 16, 1, true]} />
          </mesh>
          <mesh position={[0, -5.2, 0]} material={lambert('#8b5a2b')}>
            <boxGeometry args={[1.2, 0.9, 1.2]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Terrain() {
  return (
    <>
      <Ground />
      <Water />
      <Border />
      <ZoneFloors />
      <Paths />
      <Flowers />
      <Signposts />
    </>
  );
}

export function Sky() {
  return (
    <>
      <Clouds />
      <HotAirBalloons />
    </>
  );
}
