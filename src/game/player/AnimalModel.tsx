import type { ThreeElements } from '@react-three/fiber';
import type { MutableRefObject, ReactNode } from 'react';
import * as THREE from 'three';
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
  eyeRadius: number;
};

export function createRig(): Rig {
  return { body: null, head: null, legs: [null, null, null, null], tail: null, ears: [null, null], pupils: [null, null], mud: null, eyeRadius: 0.09 };
}

type SpeciesSpec = {
  bodyY: number;
  hipY: number;
  hipX: number;
  hipZ: number;
  legRadius: number;
  legColor: string;
  hoofColor: string;
  head: [number, number, number];
  eyes: { x: number; y: number; z: number; r: number; iris: string; pupil: 'round' | 'goat' };
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
    legColor: '#c98a4b',
    hoofColor: '#f3dcc0',
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
    legColor: '#e8e1d4',
    hoofColor: '#3a332c',
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
    legColor: '#ff9fc0',
    hoofColor: '#c45a80',
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
    legColor: '#2f2a28',
    hoofColor: '#1a1716',
    head: [0, 0.92, 0.5],
    eyes: { x: 0.09, y: 0.06, z: 0.15, r: 0.075, iris: '#ffffff', pupil: 'round' },
    hatAnchor: [0, 0.24, -0.02],
    collar: { pos: [0, 0.8, 0.4], tilt: 1.0, r: 0.2 }
  }
};

type ModelProps = {
  species: Species;
  hat: HatId;
  color: string;
  rig: MutableRefObject<Rig>;
};

function Mesh({ children, color, ...rest }: { children: ReactNode; color: string } & Omit<ThreeElements['mesh'], 'material'>) {
  return (
    <mesh castShadow material={lambert(color)} {...rest}>
      {children}
    </mesh>
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
        ) : (
          <Mesh color="#111111">
            <sphereGeometry args={[r * 0.52, 10, 8]} />
          </Mesh>
        )}
      </group>
    </group>
  );
}

function Legs({ spec, rig, length }: { spec: SpeciesSpec; rig: MutableRefObject<Rig>; length: number }) {
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
          <Mesh color={spec.legColor} position={[0, -length / 2, 0]}>
            <cylinderGeometry args={[spec.legRadius, spec.legRadius * 0.9, length, 8]} />
          </Mesh>
          <Mesh color={spec.hoofColor} position={[0, -length + 0.03, 0.02]}>
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
      <group position={spec.hatAnchor}>
        <Hat hat={hat} />
      </group>
    </group>
  );
}

function Dog({ rig, hat, color }: Omit<ModelProps, 'species'>) {
  const spec = SPECIES_SPECS.dog;
  const fur = '#c98a4b';
  const dark = '#6b4226';
  const light = '#f3dcc0';
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
      <Legs spec={spec} rig={rig} length={0.46} />
    </>
  );
}

function Goat({ rig, hat, color }: Omit<ModelProps, 'species'>) {
  const spec = SPECIES_SPECS.goat;
  const fur = '#f4efe6';
  const accent = '#b9ad9c';
  const horn = '#7d7266';
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
      <Legs spec={spec} rig={rig} length={0.56} />
    </>
  );
}

function Pig({ rig, hat, color }: Omit<ModelProps, 'species'>) {
  const spec = SPECIES_SPECS.pig;
  const skin = '#ffa9c8';
  const snout = '#ff86ae';
  return (
    <>
      <group ref={(g) => { rig.current.body = g; }}>
        <Mesh color={skin} position={[0, spec.bodyY, 0]} scale={[1, 0.86, 1.22]}>
          <sphereGeometry args={[0.44, 18, 14]} />
        </Mesh>
        <Collar spec={spec} color={color} />
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
      <Legs spec={spec} rig={rig} length={0.3} />
    </>
  );
}

function Sheep({ rig, hat, color }: Omit<ModelProps, 'species'>) {
  const spec = SPECIES_SPECS.sheep;
  const wool = '#fbfbf8';
  const face = '#2f2a28';
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
      <Legs spec={spec} rig={rig} length={0.42} />
    </>
  );
}

export function AnimalModel({ species, hat, color, rig }: ModelProps) {
  rig.current.eyeRadius = SPECIES_SPECS[species].eyes.r;
  switch (species) {
    case 'dog':
      return <Dog rig={rig} hat={hat} color={color} />;
    case 'goat':
      return <Goat rig={rig} hat={hat} color={color} />;
    case 'pig':
      return <Pig rig={rig} hat={hat} color={color} />;
    case 'sheep':
      return <Sheep rig={rig} hat={hat} color={color} />;
  }
}
