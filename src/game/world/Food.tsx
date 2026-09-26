import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { playChomp, playPoof } from '../audio';
import { PARTY_POINTS } from '../config';
import { emit, poof } from '../fx';
import { PICNIC, SNACKS, type SnackKind, type Vec3 } from '../layout';
import { lambert, tileTexture } from '../materials';
import { players, registerFood } from '../runtime';
import { useGame } from '../store';
import { useHint } from './common';

// Food that stays where it is: lick it to fill your tummy. It grows back after a while.

const SNACK = {
  kibble: { bites: 4, regrow: 5000, radius: 0.4, crumbs: ['#a0652f', '#7a4a2b', '#c98a4b'], lift: 0.18 },
  cake: { bites: 1, regrow: 9000, radius: 0.28, crumbs: ['#ff8fb5', '#fff3c4', '#ffffff'], lift: 0.22 },
  carrot: { bites: 1, regrow: 8000, radius: 0.25, crumbs: ['#ff8a3d', '#ffb26b', '#3f9b3a'], lift: 0.2 },
  icecream: { bites: 1, regrow: 10000, radius: 0.25, crumbs: ['#ffffff', '#ff8fb5', '#fff3a8'], lift: 0.3 }
} satisfies Record<SnackKind, { bites: number; regrow: number; radius: number; crumbs: string[]; lift: number }>;

const SCOOPS = ['#ff8fb5', '#fff3c4', '#8d5a36', '#b9f0a8', '#8fd3ff'];

function KibbleBowl({ bites }: { bites: number }) {
  const pile = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const a = i * 2.39;
        const r = 0.08 + (i % 4) * 0.055;
        return [Math.cos(a) * r, 0.17 + (i < 4 ? 0.05 : 0), Math.sin(a) * r] as Vec3;
      }),
    []
  );
  const shown = Math.ceil((bites / SNACK.kibble.bites) * pile.length);
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, 0.08, 0]} material={lambert('#3b82f6')}>
        <cylinderGeometry args={[0.42, 0.32, 0.16, 20]} />
      </mesh>
      <mesh position={[0, 0.162, 0]} rotation={[-Math.PI / 2, 0, 0]} material={lambert('#1e3a8a')}>
        <circleGeometry args={[0.36, 20]} />
      </mesh>
      {pile.slice(0, shown).map((p, i) => (
        <mesh key={i} position={p} material={lambert(i % 3 === 0 ? '#7a4a2b' : '#a0652f')}>
          <dodecahedronGeometry args={[0.06, 0]} />
        </mesh>
      ))}
    </group>
  );
}

function Cupcake() {
  return (
    <group>
      <mesh castShadow position={[0, 0.1, 0]} material={lambert('#ffd23f')}>
        <cylinderGeometry args={[0.17, 0.13, 0.2, 12]} />
      </mesh>
      <mesh castShadow position={[0, 0.24, 0]} scale={[1, 0.75, 1]} material={lambert('#ff8fb5')}>
        <sphereGeometry args={[0.19, 14, 10]} />
      </mesh>
      <mesh position={[0, 0.39, 0]} material={lambert('#e53935')}>
        <sphereGeometry args={[0.055, 10, 8]} />
      </mesh>
    </group>
  );
}

function Carrot() {
  return (
    <group>
      <mesh castShadow position={[0, 0.12, 0]} rotation={[Math.PI, 0, 0]} material={lambert('#ff8a3d')}>
        <coneGeometry args={[0.1, 0.4, 10]} />
      </mesh>
      {[-0.5, 0, 0.5].map((a) => (
        <mesh key={a} castShadow position={[Math.sin(a) * 0.05, 0.42, 0]} rotation={[0, 0, a]} material={lambert('#3f9b3a')}>
          <coneGeometry args={[0.04, 0.26, 6]} />
        </mesh>
      ))}
    </group>
  );
}

function IceCream({ scoop }: { scoop: string }) {
  return (
    <group>
      <mesh castShadow position={[0, 0.13, 0]} rotation={[Math.PI, 0, 0]} material={lambert('#e8b16a')}>
        <coneGeometry args={[0.1, 0.26, 10]} />
      </mesh>
      <mesh castShadow position={[0, 0.3, 0]} material={lambert(scoop)}>
        <sphereGeometry args={[0.13, 12, 10]} />
      </mesh>
    </group>
  );
}

function Snack({ kind, position }: { kind: SnackKind; position: Vec3 }) {
  const def = SNACK[kind];
  const [bites, setBites] = useState<number>(def.bites);
  const group = useRef<THREE.Group>(null);
  const pop = useRef(1);
  const scoop = useMemo(() => SCOOPS[Math.floor(Math.random() * SCOOPS.length)], []);
  const resetToken = useGame((s) => s.resetToken);
  const regrowTimer = useRef<number | undefined>(undefined);

  const bitesRef = useRef(bites);
  bitesRef.current = bites;
  const entryRef = useRef<{ enabled: boolean } | null>(null);

  useEffect(() => {
    const at = new THREE.Vector3(position[0], position[1] + def.lift, position[2]);
    const { entry, unregister } = registerFood({
      position: at,
      radius: def.radius,
      enabled: true,
      eat: (slot) => {
        if (bitesRef.current <= 0) return;
        const left = bitesRef.current - 1;
        bitesRef.current = left;
        setBites(left);
        pop.current = 0.6;
        players.get(slot)?.feed();
        playChomp(at);
        emit('chunk', at, { count: 10, color: def.crumbs, speed: 2.2, up: 3, size: 0.07 });
        emit('heart', [at.x, at.y + 0.5, at.z], { count: 3, color: ['#ff4d8d', '#ff8fb5'], speed: 1.2, up: 1.8 });
        useGame.getState().addParty(PARTY_POINTS.eat);
        if (left > 0) return;
        entry.enabled = false;
        regrowTimer.current = window.setTimeout(() => {
          entry.enabled = true;
          bitesRef.current = def.bites;
          setBites(def.bites);
          pop.current = 0;
          poof([at.x, at.y + 0.1, at.z], '#b6f5a8', 8);
          playPoof(at);
        }, def.regrow);
      }
    });
    entryRef.current = entry;
    return () => {
      unregister();
      window.clearTimeout(regrowTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The park reset refills everything straight away.
  const firstReset = useRef(resetToken);
  useEffect(() => {
    if (resetToken === firstReset.current) return;
    window.clearTimeout(regrowTimer.current);
    if (entryRef.current) entryRef.current.enabled = true;
    bitesRef.current = def.bites;
    setBites(def.bites);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken]);

  // Squish when bitten, pop back up when it regrows.
  useFrame((_, delta) => {
    const g = group.current;
    if (!g || pop.current >= 1) return;
    pop.current = Math.min(1, pop.current + delta * 2.5);
    const t = pop.current;
    g.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.25);
  });

  const empty = bites <= 0 && kind !== 'kibble';
  return (
    <group ref={group} position={position} visible={!empty}>
      {kind === 'kibble' && <KibbleBowl bites={bites} />}
      {kind === 'cake' && <Cupcake />}
      {kind === 'carrot' && <Carrot />}
      {kind === 'icecream' && <IceCream scoop={scoop} />}
    </group>
  );
}

function PicnicBlanket() {
  const material = useMemo(() => new THREE.MeshLambertMaterial({ map: tileTexture('picnic', ['#ff4d5e', '#ffffff'], '#ffffff', 3) }), []);
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0.2]} position={[PICNIC.center[0], 0.03, PICNIC.center[1]]} material={material}>
        <planeGeometry args={[PICNIC.size, PICNIC.size]} />
      </mesh>
      {/* basket */}
      <mesh castShadow position={[PICNIC.center[0] + 1.1, 0.25, PICNIC.center[1] - 0.9]} material={lambert('#c98a4b')}>
        <boxGeometry args={[0.7, 0.45, 0.5]} />
      </mesh>
      <mesh position={[PICNIC.center[0] + 1.1, 0.55, PICNIC.center[1] - 0.9]} rotation={[0, 0, Math.PI / 2]} material={lambert('#8d5a36')}>
        <torusGeometry args={[0.25, 0.03, 6, 16, Math.PI]} />
      </mesh>
    </group>
  );
}

function CarrotRows() {
  const rows = [3, 4.6];
  return (
    <group>
      {rows.map((z) => (
        <mesh key={z} receiveShadow position={[-30.6, 0.04, z]} material={lambert('#8d5a36')}>
          <boxGeometry args={[4.4, 0.08, 0.9]} />
        </mesh>
      ))}
    </group>
  );
}

function BowlHint({ position }: { position: Vec3 }) {
  useHint([position[0], 1, position[2]], 'lick', 3);
  return null;
}

export function Food() {
  return (
    <group>
      <PicnicBlanket />
      <CarrotRows />
      {SNACKS.map((s, i) => (
        <Snack key={i} kind={s.kind} position={s.position} />
      ))}
      {SNACKS.filter((s) => s.kind === 'kibble').map((s, i) => (
        <BowlHint key={i} position={s.position} />
      ))}
    </group>
  );
}
