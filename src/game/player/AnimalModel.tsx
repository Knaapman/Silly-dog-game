import type { ThreeElements } from '@react-three/fiber';
import type { MutableRefObject, ReactNode } from 'react';
import * as THREE from 'three';
import type { Coat } from '../coats';
import type { HatId, Species } from '../config';
import { lambert } from '../materials';
import { Hat } from './Hat';

// Low-poly toy animals built from primitives. Origin = between the feet, facing +z.
// The controller animates them through the Rig refs.

export type Rig = {
  body: THREE.Group | null;
  head: THREE.Group | null;
  legs: (THREE.Group | null)[];
  tail: THREE.Group | null;
  ears: (THREE.Group | null)[];
  pupils: (THREE.Group | null)[];
  mud: THREE.Group | null;
  /** Paint splotches (where the mud goes, but the other way round), and their colour. */
  paint: THREE.Group | null;
  paintMat: THREE.MeshLambertMaterial;
  /** Round tummy that grows with every bite (scaled by the controller). */
  belly: THREE.Group | null;
  /** Rosy cheeks, hidden until the animal strains (pooping) or eats a chili. */
  cheeks: THREE.Group | null;
  eyeRadius: number;
};

export function createRig(): Rig {
  return { body: null, head: null, legs: [null, null, null, null], tail: null, ears: [null, null], pupils: [null, null], mud: null, paint: null, paintMat: new THREE.MeshLambertMaterial({ color: '#ff4d5e' }), belly: null, cheeks: null, eyeRadius: 0.09 };
}

type SpeciesSpec = {
  bodyY: number;
  hipY: number;
  hipX: number;
  hipZ: number;
  legRadius: number;
  head: [number, number, number];
  eyes: { x: number; y: number; z: number; r: number; iris: string; pupil: 'round' | 'goat' | 'cat' };
  hatAnchor: [number, number, number];
  collar: { pos: [number, number, number]; tilt: number; r: number };
};

export const SPECIES_SPECS: Record<Species, SpeciesSpec> = {
  dog: {
    bodyY: 0.62,
    hipY: 0.5,
    hipX: 0.15,
    hipZ: 0.3,
    legRadius: 0.075,
    head: [0, 0.98, 0.5],
    eyes: { x: 0.11, y: 0.07, z: 0.2, r: 0.09, iris: '#ffffff', pupil: 'round' },
    hatAnchor: [0, 0.25, -0.02],
    collar: { pos: [0, 0.8, 0.36], tilt: 0.9, r: 0.2 }
  },
  goat: {
    bodyY: 0.72,
    hipY: 0.6,
    hipX: 0.14,
    hipZ: 0.3,
    legRadius: 0.06,
    head: [0, 1.08, 0.5],
    eyes: { x: 0.12, y: 0.08, z: 0.14, r: 0.085, iris: '#ffe066', pupil: 'goat' },
    hatAnchor: [0, 0.17, -0.05],
    collar: { pos: [0, 0.9, 0.36], tilt: 0.9, r: 0.19 }
  },
  pig: {
    bodyY: 0.56,
    hipY: 0.32,
    hipX: 0.18,
    hipZ: 0.26,
    legRadius: 0.085,
    head: [0, 0.76, 0.54],
    eyes: { x: 0.11, y: 0.08, z: 0.2, r: 0.075, iris: '#ffffff', pupil: 'round' },
    hatAnchor: [0, 0.26, -0.02],
    collar: { pos: [0, 0.66, 0.42], tilt: 1.2, r: 0.26 }
  },
  sheep: {
    bodyY: 0.66,
    hipY: 0.44,
    hipX: 0.14,
    hipZ: 0.24,
    legRadius: 0.055,
    head: [0, 0.92, 0.5],
    eyes: { x: 0.09, y: 0.06, z: 0.15, r: 0.075, iris: '#ffffff', pupil: 'round' },
    hatAnchor: [0, 0.24, -0.02],
    collar: { pos: [0, 0.8, 0.4], tilt: 1.0, r: 0.2 }
  },
  cat: {
    bodyY: 0.55,
    hipY: 0.42,
    hipX: 0.12,
    hipZ: 0.27,
    legRadius: 0.055,
    head: [0, 0.9, 0.46],
    eyes: { x: 0.1, y: 0.06, z: 0.19, r: 0.085, iris: '#c6f36b', pupil: 'cat' },
    hatAnchor: [0, 0.24, -0.02],
    collar: { pos: [0, 0.74, 0.33], tilt: 0.9, r: 0.17 }
  },
  duck: {
    bodyY: 0.5,
    hipY: 0.24,
    hipX: 0.13,
    hipZ: 0,
    legRadius: 0.045,
    head: [0, 0.98, 0.3],
    eyes: { x: 0.1, y: 0.06, z: 0.15, r: 0.075, iris: '#ffffff', pupil: 'round' },
    hatAnchor: [0, 0.21, -0.02],
    collar: { pos: [0, 0.76, 0.24], tilt: 0.6, r: 0.14 }
  },
  cow: {
    bodyY: 0.8,
    hipY: 0.64,
    hipX: 0.18,
    hipZ: 0.34,
    legRadius: 0.08,
    head: [0, 1.12, 0.6],
    eyes: { x: 0.13, y: 0.09, z: 0.14, r: 0.085, iris: '#ffffff', pupil: 'round' },
    hatAnchor: [0, 0.23, -0.05],
    collar: { pos: [0, 1.0, 0.44], tilt: 0.9, r: 0.22 }
  },
  unicorn: {
    bodyY: 0.8,
    hipY: 0.66,
    hipX: 0.14,
    hipZ: 0.32,
    legRadius: 0.06,
    head: [0, 1.24, 0.56],
    eyes: { x: 0.12, y: 0.08, z: 0.12, r: 0.085, iris: '#ffffff', pupil: 'round' },
    hatAnchor: [0, 0.2, -0.16],
    collar: { pos: [0, 1.02, 0.38], tilt: 0.8, r: 0.2 }
  }
};

type ModelProps = {
  species: Species;
  hat: HatId;
  color: string;
  coat: Coat;
  rig: MutableRefObject<Rig>;
};

function Mesh({ children, color, ...rest }: { children: ReactNode; color: string } & Omit<ThreeElements['mesh'], 'material'>) {
  return (
    <mesh castShadow material={lambert(color)} {...rest}>
      {children}
    </mesh>
  );
}

/** Hidden inside the body when empty; the controller scales it up as the animal eats. */
function Belly({ spec, rig, radius, color }: { spec: SpeciesSpec; rig: MutableRefObject<Rig>; radius: number; color: string }) {
  return (
    <group
      position={[0, spec.bodyY - 0.07, 0.04]}
      scale={0.8}
      ref={(g) => {
        rig.current.belly = g;
      }}
    >
      <Mesh color={color} scale={[1, 0.92, 1.12]}>
        <sphereGeometry args={[radius, 18, 14]} />
      </Mesh>
    </group>
  );
}

function Eye({ spec, side, rig }: { spec: SpeciesSpec; side: 0 | 1; rig: MutableRefObject<Rig> }) {
  const { x, y, z, r, iris, pupil } = spec.eyes;
  return (
    <group position={[side === 0 ? -x : x, y, z]}>
      <Mesh color={iris}>
        <sphereGeometry args={[r, 14, 10]} />
      </Mesh>
      <group
        ref={(g) => {
          rig.current.pupils[side] = g;
        }}
        position={[0, 0, r * 0.8]}
      >
        {pupil === 'goat' ? (
          <Mesh color="#111111">
            <boxGeometry args={[r * 0.95, r * 0.32, r * 0.35]} />
          </Mesh>
        ) : pupil === 'cat' ? (
          <Mesh color="#111111">
            <boxGeometry args={[r * 0.3, r * 0.95, r * 0.35]} />
          </Mesh>
        ) : (
          <Mesh color="#111111">
            <sphereGeometry args={[r * 0.52, 10, 8]} />
          </Mesh>
        )}
      </group>
    </group>
  );
}

function Legs({ spec, coat, rig, length }: { spec: SpeciesSpec; coat: Coat; rig: MutableRefObject<Rig>; length: number }) {
  const hips: [number, number, number][] = [
    [-spec.hipX, spec.hipY, spec.hipZ],
    [spec.hipX, spec.hipY, spec.hipZ],
    [-spec.hipX, spec.hipY, -spec.hipZ],
    [spec.hipX, spec.hipY, -spec.hipZ]
  ];
  return (
    <>
      {hips.map((hip, i) => (
        <group
          key={i}
          position={hip}
          ref={(g) => {
            rig.current.legs[i] = g;
          }}
        >
          <Mesh color={coat.legs} position={[0, -length / 2, 0]}>
            <cylinderGeometry args={[spec.legRadius, spec.legRadius * 0.9, length, 8]} />
          </Mesh>
          <Mesh color={coat.feet} position={[0, -length + 0.03, 0.02]}>
            <sphereGeometry args={[spec.legRadius * 1.25, 8, 6]} />
          </Mesh>
        </group>
      ))}
    </>
  );
}

function Collar({ spec, color, bell = false }: { spec: SpeciesSpec; color: string; bell?: boolean }) {
  return (
    <group position={spec.collar.pos} rotation={[Math.PI / 2 - spec.collar.tilt, 0, 0]}>
      <Mesh color={color}>
        <torusGeometry args={[spec.collar.r, 0.05, 8, 22]} />
      </Mesh>
      {bell && (
        <Mesh color="#f5c542" position={[0, spec.collar.r + 0.02, -0.04]}>
          <sphereGeometry args={[0.06, 10, 8]} />
        </Mesh>
      )}
    </group>
  );
}

function MudSplotches({ rig, spots }: { rig: MutableRefObject<Rig>; spots: [number, number, number, number][] }) {
  return (
    <>
      <group
        ref={(g) => {
          rig.current.mud = g;
        }}
        visible={false}
      >
        {spots.map(([x, y, z, r], i) => (
          <mesh key={i} position={[x, y, z]} material={lambert('#6b4a2b')}>
            <sphereGeometry args={[r, 8, 6]} />
          </mesh>
        ))}
      </group>
      {/* paint goes on the other side from the mud, in big blobs (you should see it from across the park) */}
      <group
        ref={(g) => {
          rig.current.paint = g;
        }}
        visible={false}
      >
        {spots.map(([x, y, z, r], i) => (
          <mesh key={i} position={[-x, y + 0.03, z]} material={rig.current.paintMat}>
            <sphereGeometry args={[r * 1.8, 8, 6]} />
          </mesh>
        ))}
      </group>
    </>
  );
}

function HeadExtras({ spec, hat, rig, children }: { spec: SpeciesSpec; hat: HatId; rig: MutableRefObject<Rig>; children: ReactNode }) {
  return (
    <group
      position={spec.head}
      ref={(g) => {
        rig.current.head = g;
      }}
    >
      {children}
      <Eye spec={spec} side={0} rig={rig} />
      <Eye spec={spec} side={1} rig={rig} />
      <group
        scale={0.001}
        ref={(g) => {
          rig.current.cheeks = g;
        }}
      >
        {[-1, 1].map((side) => (
          <Mesh key={side} color="#ff4f79" position={[side * (spec.eyes.x + 0.07), spec.eyes.y - 0.12, spec.eyes.z - 0.04]} scale={[1, 0.7, 0.5]}>
            <sphereGeometry args={[0.075, 10, 8]} />
          </Mesh>
        ))}
      </group>
      <group position={spec.hatAnchor}>
        <Hat hat={hat} />
      </group>
    </group>
  );
}

function Dog({ rig, hat, color, coat }: Omit<ModelProps, 'species'>) {
  const spec = SPECIES_SPECS.dog;
  const { fur, mark: dark, light } = coat;
  return (
    <>
      <group ref={(g) => { rig.current.body = g; }}>
        <Mesh color={fur} position={[0, spec.bodyY, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <capsuleGeometry args={[0.27, 0.5, 6, 12]} />
        </Mesh>
        <Mesh color={dark} position={[0.13, 0.84, -0.1]} scale={[1, 0.5, 1.3]}>
          <sphereGeometry args={[0.12, 10, 8]} />
        </Mesh>
        <Mesh color={dark} position={[-0.1, 0.84, 0.16]} scale={[1, 0.5, 1]}>
          <sphereGeometry args={[0.1, 10, 8]} />
        </Mesh>
        <Collar spec={spec} color={color} />
        <Belly spec={spec} rig={rig} radius={0.27} color={light} />
        <HeadExtras spec={spec} hat={hat} rig={rig}>
          <Mesh color={fur}>
            <sphereGeometry args={[0.27, 16, 12]} />
          </Mesh>
          <Mesh color={light} position={[0, -0.07, 0.24]}>
            <boxGeometry args={[0.2, 0.15, 0.24]} />
          </Mesh>
          <Mesh color="#1a1a1a" position={[0, -0.01, 0.37]}>
            <sphereGeometry args={[0.065, 10, 8]} />
          </Mesh>
          <Mesh color="#ff7aa2" position={[0.03, -0.16, 0.32]} rotation={[0.5, 0, 0]}>
            <boxGeometry args={[0.08, 0.02, 0.12]} />
          </Mesh>
          {[-1, 1].map((sx, i) => (
            <group
              key={sx}
              position={[sx * 0.22, 0.13, -0.02]}
              rotation={[0, 0, sx * 0.35]}
              ref={(g) => {
                rig.current.ears[i] = g;
              }}
            >
              <Mesh color={dark} position={[0, -0.15, 0]}>
                <boxGeometry args={[0.07, 0.3, 0.17]} />
              </Mesh>
            </group>
          ))}
        </HeadExtras>
        <group position={[0, 0.72, -0.52]} ref={(g) => { rig.current.tail = g; }}>
          <Mesh color={fur} position={[0, 0.17, -0.06]} rotation={[-0.4, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.05, 0.36, 8]} />
          </Mesh>
        </group>
        <MudSplotches rig={rig} spots={[[0.2, 0.7, 0.1, 0.1], [-0.2, 0.62, -0.2, 0.12], [0, 0.88, -0.3, 0.09], [0.15, 0.55, 0.35, 0.08], [-0.12, 1.1, 0.55, 0.07]]} />
      </group>
      <Legs spec={spec} coat={coat} rig={rig} length={0.46} />
    </>
  );
}

function Goat({ rig, hat, color, coat }: Omit<ModelProps, 'species'>) {
  const spec = SPECIES_SPECS.goat;
  const { fur, mark: accent } = coat;
  const horn = coat.extra ?? '#7d7266';
  return (
    <>
      <group ref={(g) => { rig.current.body = g; }}>
        <Mesh color={fur} position={[0, spec.bodyY, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <capsuleGeometry args={[0.26, 0.52, 6, 12]} />
        </Mesh>
        <Mesh color={accent} position={[0, spec.bodyY + 0.2, -0.05]} scale={[0.6, 0.35, 1.5]}>
          <sphereGeometry args={[0.2, 10, 8]} />
        </Mesh>
        <Collar spec={spec} color={color} bell />
        <Belly spec={spec} rig={rig} radius={0.26} color={fur} />
        <HeadExtras spec={spec} hat={hat} rig={rig}>
          <Mesh color={fur} rotation={[Math.PI / 2 - 0.35, 0, 0]}>
            <capsuleGeometry args={[0.16, 0.2, 6, 12]} />
          </Mesh>
          <Mesh color={accent} position={[0, -0.08, 0.2]}>
            <sphereGeometry args={[0.12, 12, 10]} />
          </Mesh>
          <Mesh color="#3a332c" position={[0, -0.04, 0.3]}>
            <sphereGeometry args={[0.035, 8, 6]} />
          </Mesh>
          {/* beard */}
          <Mesh color={accent} position={[0, -0.26, 0.17]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.05, 0.2, 6]} />
          </Mesh>
          {/* curly horns */}
          {[-1, 1].map((sx) => (
            <Mesh key={sx} color={horn} position={[sx * 0.09, 0.14, -0.08]} rotation={[0, Math.PI / 2, 0.4]}>
              <torusGeometry args={[0.12, 0.035, 6, 12, Math.PI * 1.15]} />
            </Mesh>
          ))}
          {[-1, 1].map((sx, i) => (
            <group
              key={`ear${sx}`}
              position={[sx * 0.17, 0.06, -0.04]}
              rotation={[0, 0, sx * -0.3]}
              ref={(g) => {
                rig.current.ears[i] = g;
              }}
            >
              <Mesh color={fur} position={[sx * 0.1, 0, 0]} scale={[1, 0.35, 0.55]}>
                <sphereGeometry args={[0.12, 10, 8]} />
              </Mesh>
            </group>
          ))}
        </HeadExtras>
        <group position={[0, 0.86, -0.52]} ref={(g) => { rig.current.tail = g; }}>
          <Mesh color={fur} position={[0, 0.08, -0.03]} rotation={[-0.5, 0, 0]}>
            <coneGeometry args={[0.07, 0.2, 6]} />
          </Mesh>
        </group>
        <MudSplotches rig={rig} spots={[[0.2, 0.75, 0.1, 0.1], [-0.2, 0.7, -0.2, 0.12], [0, 0.97, -0.3, 0.09], [0.15, 0.62, 0.35, 0.08], [-0.1, 1.2, 0.55, 0.07]]} />
      </group>
      <Legs spec={spec} coat={coat} rig={rig} length={0.56} />
    </>
  );
}

function Pig({ rig, hat, color, coat }: Omit<ModelProps, 'species'>) {
  const spec = SPECIES_SPECS.pig;
  const { fur: skin, mark: snout } = coat;
  return (
    <>
      <group ref={(g) => { rig.current.body = g; }}>
        <Mesh color={skin} position={[0, spec.bodyY, 0]} scale={[1, 0.86, 1.22]}>
          <sphereGeometry args={[0.44, 18, 14]} />
        </Mesh>
        <Collar spec={spec} color={color} />
        <Belly spec={spec} rig={rig} radius={0.37} color={coat.light} />
        <HeadExtras spec={spec} hat={hat} rig={rig}>
          <Mesh color={skin}>
            <sphereGeometry args={[0.28, 16, 12]} />
          </Mesh>
          <Mesh color={snout} position={[0, -0.04, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.12, 0.13, 0.1, 14]} />
          </Mesh>
          {[-1, 1].map((sx) => (
            <Mesh key={sx} color="#b8416b" position={[sx * 0.045, -0.04, 0.335]}>
              <sphereGeometry args={[0.026, 8, 6]} />
            </Mesh>
          ))}
          {[-1, 1].map((sx, i) => (
            <group
              key={`ear${sx}`}
              position={[sx * 0.15, 0.22, 0.02]}
              rotation={[0.5, 0, sx * -0.35]}
              ref={(g) => {
                rig.current.ears[i] = g;
              }}
            >
              <Mesh color={snout} position={[0, 0.07, 0]}>
                <coneGeometry args={[0.08, 0.16, 6]} />
              </Mesh>
            </group>
          ))}
        </HeadExtras>
        <group position={[0, 0.66, -0.55]} ref={(g) => { rig.current.tail = g; }}>
          <Mesh color={skin} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[0.07, 0.022, 6, 14, Math.PI * 1.7]} />
          </Mesh>
        </group>
        <MudSplotches rig={rig} spots={[[0.3, 0.6, 0.1, 0.13], [-0.28, 0.55, -0.2, 0.14], [0, 0.9, -0.2, 0.12], [0.15, 0.4, 0.4, 0.1], [-0.1, 0.96, 0.62, 0.08], [0.05, 0.85, 0.25, 0.1]]} />
      </group>
      <Legs spec={spec} coat={coat} rig={rig} length={0.3} />
    </>
  );
}

function Sheep({ rig, hat, color, coat }: Omit<ModelProps, 'species'>) {
  const spec = SPECIES_SPECS.sheep;
  const { fur: wool, mark: face } = coat;
  const puffs: [number, number, number, number][] = [
    [0, 0.72, 0, 0.32],
    [0.19, 0.66, 0.2, 0.23],
    [-0.19, 0.66, 0.2, 0.23],
    [0.19, 0.66, -0.2, 0.23],
    [-0.19, 0.66, -0.2, 0.23],
    [0, 0.86, 0.18, 0.22],
    [0, 0.86, -0.2, 0.22],
    [0, 0.62, 0.34, 0.2],
    [0, 0.62, -0.36, 0.21]
  ];
  return (
    <>
      <group ref={(g) => { rig.current.body = g; }}>
        {puffs.map(([x, y, z, r], i) => (
          <Mesh key={i} color={wool} position={[x, y, z]}>
            <icosahedronGeometry args={[r, 1]} />
          </Mesh>
        ))}
        <Collar spec={spec} color={color} bell />
        <Belly spec={spec} rig={rig} radius={0.35} color={wool} />
        <HeadExtras spec={spec} hat={hat} rig={rig}>
          <Mesh color={face} scale={[0.9, 1, 1.2]}>
            <sphereGeometry args={[0.19, 14, 10]} />
          </Mesh>
          {[[-0.07, 0.17, -0.02], [0.07, 0.17, -0.02], [0, 0.2, 0.05]].map((p, i) => (
            <Mesh key={i} color={wool} position={p as [number, number, number]}>
              <icosahedronGeometry args={[0.09, 1]} />
            </Mesh>
          ))}
          {[-1, 1].map((sx, i) => (
            <group
              key={`ear${sx}`}
              position={[sx * 0.15, 0.05, -0.02]}
              rotation={[0, 0, sx * -0.4]}
              ref={(g) => {
                rig.current.ears[i] = g;
              }}
            >
              <Mesh color={face} position={[sx * 0.08, 0, 0]} scale={[1, 0.4, 0.6]}>
                <sphereGeometry args={[0.1, 10, 8]} />
              </Mesh>
            </group>
          ))}
        </HeadExtras>
        <group position={[0, 0.72, -0.56]} ref={(g) => { rig.current.tail = g; }}>
          <Mesh color={wool}>
            <icosahedronGeometry args={[0.1, 1]} />
          </Mesh>
        </group>
        <MudSplotches rig={rig} spots={[[0.3, 0.7, 0.1, 0.12], [-0.3, 0.65, -0.2, 0.13], [0, 1.02, -0.2, 0.11], [0.16, 0.5, 0.4, 0.1], [-0.12, 0.95, 0.3, 0.1]]} />
      </group>
      <Legs spec={spec} coat={coat} rig={rig} length={0.42} />
    </>
  );
}

function Cat({ rig, hat, color, coat }: Omit<ModelProps, 'species'>) {
  const spec = SPECIES_SPECS.cat;
  const { fur, mark: stripe, light } = coat;
  return (
    <>
      <group ref={(g) => { rig.current.body = g; }}>
        <Mesh color={fur} position={[0, spec.bodyY, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <capsuleGeometry args={[0.22, 0.48, 6, 12]} />
        </Mesh>
        {[-0.18, 0, 0.18].map((z) => (
          <Mesh key={z} color={stripe} position={[0, spec.bodyY + 0.2, z]} scale={[1, 0.3, 0.35]}>
            <sphereGeometry args={[0.17, 10, 8]} />
          </Mesh>
        ))}
        <Collar spec={spec} color={color} bell />
        <Belly spec={spec} rig={rig} radius={0.22} color={light} />
        <HeadExtras spec={spec} hat={hat} rig={rig}>
          <Mesh color={fur} scale={[1.08, 0.95, 1]}>
            <sphereGeometry args={[0.24, 16, 12]} />
          </Mesh>
          {[-1, 1].map((sx) => (
            <Mesh key={sx} color={light} position={[sx * 0.055, -0.08, 0.2]}>
              <sphereGeometry args={[0.07, 10, 8]} />
            </Mesh>
          ))}
          <Mesh color="#ff7aa2" position={[0, -0.03, 0.24]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.035, 0.04, 3]} />
          </Mesh>
          {/* whiskers */}
          {[-1, 1].map((sx) =>
            [-0.03, 0.02].map((dy) => (
              <Mesh key={`${sx}${dy}`} color="#ffffff" position={[sx * 0.17, -0.07 + dy, 0.19]} rotation={[0, 0, sx * dy * 4]}>
                <boxGeometry args={[0.2, 0.008, 0.008]} />
              </Mesh>
            ))
          )}
          {[-1, 1].map((sx, i) => (
            <group
              key={`ear${sx}`}
              position={[sx * 0.14, 0.19, 0]}
              rotation={[0, 0, sx * -0.25]}
              ref={(g) => {
                rig.current.ears[i] = g;
              }}
            >
              <Mesh color={fur} position={[0, 0.07, 0]}>
                <coneGeometry args={[0.08, 0.16, 4]} />
              </Mesh>
              <Mesh color="#ffb3c7" position={[0, 0.06, 0.02]} scale={0.6}>
                <coneGeometry args={[0.08, 0.14, 4]} />
              </Mesh>
            </group>
          ))}
        </HeadExtras>
        {/* a long tail curling up */}
        <group position={[0, 0.62, -0.46]} ref={(g) => { rig.current.tail = g; }}>
          <Mesh color={fur} position={[0, 0.06, -0.14]} rotation={[-1.1, 0, 0]}>
            <cylinderGeometry args={[0.035, 0.045, 0.32, 8]} />
          </Mesh>
          <Mesh color={stripe} position={[0, 0.3, -0.24]} rotation={[-0.2, 0, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.26, 8]} />
          </Mesh>
        </group>
        <MudSplotches rig={rig} spots={[[0.18, 0.6, 0.1, 0.09], [-0.18, 0.55, -0.2, 0.1], [0, 0.8, -0.25, 0.08], [0.12, 0.5, 0.3, 0.07], [-0.1, 1.02, 0.5, 0.06]]} />
      </group>
      <Legs spec={spec} coat={coat} rig={rig} length={0.4} />
    </>
  );
}

function Duck({ rig, hat, color, coat }: Omit<ModelProps, 'species'>) {
  const spec = SPECIES_SPECS.duck;
  const { fur: feathers, mark: wing } = coat;
  const bill = coat.extra ?? '#ff9f1c';
  return (
    <>
      <group ref={(g) => { rig.current.body = g; }}>
        <Mesh color={feathers} position={[0, spec.bodyY, -0.04]} scale={[1, 0.85, 1.25]}>
          <sphereGeometry args={[0.34, 18, 14]} />
        </Mesh>
        {/* neck */}
        <Mesh color={feathers} position={[0, 0.74, 0.26]} rotation={[0.35, 0, 0]}>
          <cylinderGeometry args={[0.11, 0.14, 0.3, 10]} />
        </Mesh>
        {/* tail feathers */}
        <Mesh color={feathers} position={[0, 0.66, -0.44]} rotation={[-0.9, 0, 0]}>
          <coneGeometry args={[0.13, 0.26, 8]} />
        </Mesh>
        {/* wings: they flap like ears do */}
        {[-1, 1].map((sx, i) => (
          <group
            key={sx}
            position={[sx * 0.3, 0.56, -0.02]}
            ref={(g) => {
              rig.current.ears[i] = g;
            }}
          >
            <Mesh color={wing} scale={[0.35, 0.75, 1.1]} rotation={[0, 0, sx * 0.2]}>
              <sphereGeometry args={[0.2, 10, 8]} />
            </Mesh>
          </group>
        ))}
        <Collar spec={spec} color={color} />
        <Belly spec={spec} rig={rig} radius={0.3} color={coat.light} />
        <HeadExtras spec={spec} hat={hat} rig={rig}>
          <Mesh color={feathers}>
            <sphereGeometry args={[0.23, 16, 12]} />
          </Mesh>
          {/* a big flat bill */}
          <Mesh color={bill} position={[0, -0.06, 0.24]} scale={[1, 0.35, 1]}>
            <boxGeometry args={[0.2, 0.12, 0.2]} />
          </Mesh>
          <Mesh color={bill} position={[0, -0.1, 0.22]} scale={[1, 0.3, 1]}>
            <boxGeometry args={[0.18, 0.1, 0.18]} />
          </Mesh>
          <Mesh color={feathers} position={[0, 0.2, -0.02]} rotation={[-0.4, 0, 0]}>
            <coneGeometry args={[0.04, 0.12, 6]} />
          </Mesh>
        </HeadExtras>
        <group position={[0, 0.7, -0.5]} ref={(g) => { rig.current.tail = g; }} />
        <MudSplotches rig={rig} spots={[[0.2, 0.55, 0.05, 0.1], [-0.22, 0.5, -0.15, 0.11], [0, 0.72, -0.2, 0.09], [0.1, 0.4, 0.28, 0.08]]} />
      </group>
      {/* two orange legs with flappy feet (legs 0 and 1 swing in turn) */}
      {[-1, 1].map((sx, i) => (
        <group
          key={sx}
          position={[sx * spec.hipX, spec.hipY, spec.hipZ]}
          ref={(g) => {
            rig.current.legs[i] = g;
          }}
        >
          <Mesh color={coat.legs} position={[0, -0.1, 0]}>
            <cylinderGeometry args={[spec.legRadius, spec.legRadius, 0.2, 6]} />
          </Mesh>
          <Mesh color={coat.feet} position={[0, -0.21, 0.08]}>
            <boxGeometry args={[0.16, 0.03, 0.22]} />
          </Mesh>
        </group>
      ))}
    </>
  );
}

function Cow({ rig, hat, color, coat }: Omit<ModelProps, 'species'>) {
  const spec = SPECIES_SPECS.cow;
  const { fur: white, mark: spot } = coat;
  const snout = coat.extra ?? '#ffb3c7';
  return (
    <>
      <group ref={(g) => { rig.current.body = g; }}>
        <Mesh color={white} position={[0, spec.bodyY, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <capsuleGeometry args={[0.32, 0.6, 6, 12]} />
        </Mesh>
        {(
          [
            [0.24, 0.9, 0.1, 0.16],
            [-0.26, 0.82, -0.18, 0.18],
            [0.05, 1.08, -0.28, 0.14],
            [-0.12, 0.98, 0.3, 0.12]
          ] as const
        ).map(([x, y, z, r], i) => (
          <Mesh key={i} color={spot} position={[x, y, z]} scale={[1, 0.6, 1.2]}>
            <sphereGeometry args={[r, 10, 8]} />
          </Mesh>
        ))}
        <Collar spec={spec} color={color} bell />
        <Belly spec={spec} rig={rig} radius={0.32} color={coat.light} />
        <HeadExtras spec={spec} hat={hat} rig={rig}>
          <Mesh color={white} rotation={[Math.PI / 2 - 0.2, 0, 0]}>
            <capsuleGeometry args={[0.2, 0.18, 6, 12]} />
          </Mesh>
          <Mesh color={spot} position={[0.1, 0.12, 0.04]} scale={[1, 0.6, 1]}>
            <sphereGeometry args={[0.1, 10, 8]} />
          </Mesh>
          <Mesh color={snout} position={[0, -0.08, 0.26]} rotation={[Math.PI / 2, 0, 0]} scale={[1.2, 1, 0.9]}>
            <cylinderGeometry args={[0.13, 0.14, 0.12, 14]} />
          </Mesh>
          {[-1, 1].map((sx) => (
            <Mesh key={sx} color="#b8416b" position={[sx * 0.055, -0.08, 0.33]}>
              <sphereGeometry args={[0.025, 8, 6]} />
            </Mesh>
          ))}
          {/* little horns */}
          {[-1, 1].map((sx) => (
            <Mesh key={`h${sx}`} color="#efe4c8" position={[sx * 0.14, 0.22, -0.06]} rotation={[0, 0, sx * -0.5]}>
              <coneGeometry args={[0.04, 0.14, 6]} />
            </Mesh>
          ))}
          {[-1, 1].map((sx, i) => (
            <group
              key={`ear${sx}`}
              position={[sx * 0.22, 0.1, -0.04]}
              ref={(g) => {
                rig.current.ears[i] = g;
              }}
            >
              <Mesh color={white} position={[sx * 0.08, 0, 0]} scale={[1, 0.4, 0.6]}>
                <sphereGeometry args={[0.12, 10, 8]} />
              </Mesh>
            </group>
          ))}
        </HeadExtras>
        <group position={[0, 0.98, -0.6]} ref={(g) => { rig.current.tail = g; }}>
          <Mesh color={white} position={[0, -0.2, -0.04]} rotation={[0.2, 0, 0]}>
            <cylinderGeometry args={[0.02, 0.025, 0.4, 6]} />
          </Mesh>
          <Mesh color={spot} position={[0, -0.42, 0]}>
            <sphereGeometry args={[0.06, 8, 6]} />
          </Mesh>
        </group>
        <MudSplotches rig={rig} spots={[[0.3, 0.8, 0.1, 0.12], [-0.3, 0.72, -0.2, 0.13], [0, 1.1, -0.3, 0.1], [0.18, 0.6, 0.4, 0.1], [-0.12, 1.2, 0.62, 0.08]]} />
      </group>
      <Legs spec={spec} coat={coat} rig={rig} length={0.6} />
    </>
  );
}

function Unicorn({ rig, hat, color, coat }: Omit<ModelProps, 'species'>) {
  const spec = SPECIES_SPECS.unicorn;
  const white = coat.fur;
  const mane = coat.mane ?? [coat.mark];
  const horn = coat.extra ?? '#f5c542';
  return (
    <>
      <group ref={(g) => { rig.current.body = g; }}>
        <Mesh color={white} position={[0, spec.bodyY, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <capsuleGeometry args={[0.28, 0.6, 6, 12]} />
        </Mesh>
        {/* neck */}
        <Mesh color={white} position={[0, 1.02, 0.42]} rotation={[0.55, 0, 0]}>
          <cylinderGeometry args={[0.14, 0.2, 0.46, 10]} />
        </Mesh>
        {/* rainbow mane down the neck */}
        {mane.map((c, i) => (
          <Mesh key={i} color={c} position={[0, 1.28 - i * 0.07, 0.44 - i * 0.07]}>
            <sphereGeometry args={[0.08, 8, 6]} />
          </Mesh>
        ))}
        <Collar spec={spec} color={color} />
        <Belly spec={spec} rig={rig} radius={0.28} color={coat.light} />
        <HeadExtras spec={spec} hat={hat} rig={rig}>
          <Mesh color={white} rotation={[Math.PI / 2 - 0.5, 0, 0]}>
            <capsuleGeometry args={[0.16, 0.24, 6, 12]} />
          </Mesh>
          <Mesh color={coat.light} position={[0, -0.12, 0.22]} scale={[1, 0.8, 1]}>
            <sphereGeometry args={[0.13, 12, 10]} />
          </Mesh>
          {[-1, 1].map((sx) => (
            <Mesh key={sx} color="#c45a80" position={[sx * 0.05, -0.12, 0.34]}>
              <sphereGeometry args={[0.02, 8, 6]} />
            </Mesh>
          ))}
          {/* the golden horn */}
          <Mesh color={horn} position={[0, 0.35, 0.05]} rotation={[0.15, 0, 0]}>
            <coneGeometry args={[0.07, 0.5, 10]} />
          </Mesh>
          {[0, 1, 2].map((i) => (
            <Mesh key={`band${i}`} color="#fff3a8" position={[0, 0.2 + i * 0.11, 0.028 + i * 0.016]} rotation={[0.15, 0, 0]}>
              <torusGeometry args={[0.058 - i * 0.014, 0.012, 6, 12]} />
            </Mesh>
          ))}
          {[-1, 1].map((sx, i) => (
            <group
              key={`ear${sx}`}
              position={[sx * 0.1, 0.18, -0.08]}
              ref={(g) => {
                rig.current.ears[i] = g;
              }}
            >
              <Mesh color={white} position={[0, 0.06, 0]}>
                <coneGeometry args={[0.05, 0.14, 5]} />
              </Mesh>
            </group>
          ))}
        </HeadExtras>
        {/* rainbow tail */}
        <group position={[0, 0.95, -0.58]} ref={(g) => { rig.current.tail = g; }}>
          {mane.map((c, i) => (
            <Mesh key={i} color={c} position={[0, -i * 0.07, -0.04 - i * 0.035]}>
              <sphereGeometry args={[0.075 - i * 0.004, 8, 6]} />
            </Mesh>
          ))}
        </group>
        <MudSplotches rig={rig} spots={[[0.26, 0.8, 0.1, 0.11], [-0.26, 0.72, -0.2, 0.12], [0, 1.08, -0.3, 0.1], [0.16, 0.62, 0.38, 0.09], [-0.1, 1.3, 0.6, 0.07]]} />
      </group>
      <Legs spec={spec} coat={coat} rig={rig} length={0.62} />
    </>
  );
}

export function AnimalModel({ species, hat, color, coat, rig }: ModelProps) {
  rig.current.eyeRadius = SPECIES_SPECS[species].eyes.r;
  switch (species) {
    case 'dog':
      return <Dog rig={rig} hat={hat} color={color} coat={coat} />;
    case 'goat':
      return <Goat rig={rig} hat={hat} color={color} coat={coat} />;
    case 'pig':
      return <Pig rig={rig} hat={hat} color={color} coat={coat} />;
    case 'sheep':
      return <Sheep rig={rig} hat={hat} color={color} coat={coat} />;
    case 'cat':
      return <Cat rig={rig} hat={hat} color={color} coat={coat} />;
    case 'duck':
      return <Duck rig={rig} hat={hat} color={color} coat={coat} />;
    case 'cow':
      return <Cow rig={rig} hat={hat} color={color} coat={coat} />;
    case 'unicorn':
      return <Unicorn rig={rig} hat={hat} color={color} coat={coat} />;
  }
}
