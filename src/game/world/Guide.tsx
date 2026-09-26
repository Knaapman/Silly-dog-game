import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { gameClock, gameNow, useGameFrame } from '../clock';
import { GUIDE_TIME, guideDebug, guideTarget, useGuide } from '../guide';
import { players } from '../runtime';
import { stickerById } from '../stickers';

// The sticker guide in the park: a big arrow over every animal pointing the way, and a beam of
// light where the sticker can be earned. The arrow goes away once you're there.

const SLOTS = 4;
const ARRIVED = 4;

/** A flat arrow lying level, pointing along +z: the camera looks down, so this reads best. */
function arrowGeometry(grow = 0) {
  const s = new THREE.Shape();
  const w = 0.16 + grow;
  const head = 0.42 + grow;
  s.moveTo(0, 0.95 + grow * 1.6);
  s.lineTo(head, 0.2 - grow * 0.4);
  s.lineTo(w, 0.2 - grow * 0.4);
  s.lineTo(w, -0.75 - grow);
  s.lineTo(-w, -0.75 - grow);
  s.lineTo(-w, 0.2 - grow * 0.4);
  s.lineTo(-head, 0.2 - grow * 0.4);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false });
  g.rotateX(Math.PI / 2);
  return g;
}

export function StickerGuide() {
  const arrows = useRef<(THREE.Group | null)[]>([]);
  const beams = useRef<(THREE.Group | null)[]>([]);
  // One bright colour for every guide, so it stands out on grass, sand, snow and stone alike
  // (the sticker itself is shown at the top of the screen).
  const arrowMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffd23f' }), []);
  const outlineMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#b45309' }), []);
  const arrowGeo = useMemo(() => arrowGeometry(), []);
  const outlineGeo = useMemo(() => arrowGeometry(0.09), []);
  const beamMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }), []);
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.85, depthWrite: false }), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const slots = useMemo(() => Array.from({ length: SLOTS }, (_, i) => i), []);

  useGameFrame(() => {
    const { sticker, since, stop } = useGuide.getState();
    const t = gameClock.time;
    if (sticker && (gameNow() - since) / 1000 > GUIDE_TIME) stop();
    const s = sticker ? stickerById(sticker) : undefined;
    if (s) beamMat.opacity = 0.24 + Math.sin(t * 4) * 0.08;
    const all = [...players.values()].filter((p) => !p.asleep);
    for (let i = 0; i < SLOTS; i += 1) {
      const arrow = arrows.current[i];
      const beam = beams.current[i];
      const p = all[i];
      const has = !!s && !!p && !!sticker && guideTarget(sticker, p.position, p.slot, target);
      if (beam) {
        beam.visible = has;
        if (has) {
          beam.position.set(target.x, 0, target.z);
          beam.rotation.y = t * 0.8;
          beam.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
        }
      }
      if (arrow) {
        const far = has && p && p.position.distanceTo(target.setY(p.position.y)) > ARRIVED;
        arrow.visible = !!far;
        if (far && p) {
          arrow.position.set(p.position.x, p.position.y + 2.2 * p.size + Math.sin(t * 5) * 0.15, p.position.z);
          arrow.rotation.y = Math.atan2(target.x - p.position.x, target.z - p.position.z);
        }
        guideDebug.arrows[i] = { visible: arrow.visible, yaw: arrow.rotation.y };
      }
      if (beam) guideDebug.beams[i] = { visible: beam.visible, x: beam.position.x, z: beam.position.z };
    }
  });

  return (
    <>
      {slots.map((i) => (
        <group
          key={`a${i}`}
          ref={(g) => {
            arrows.current[i] = g;
          }}
          visible={false}
        >
          <group scale={1.5}>
            <mesh geometry={arrowGeo} material={arrowMat} position={[0, 0.02, 0]} />
            <mesh geometry={outlineGeo} material={outlineMat} />
          </group>
        </group>
      ))}
      {slots.map((i) => (
        <group
          key={`b${i}`}
          ref={(g) => {
            beams.current[i] = g;
          }}
          visible={false}
        >
          <mesh material={beamMat} position={[0, 7, 0]}>
            <cylinderGeometry args={[1.1, 1.4, 14, 20, 1, true]} />
          </mesh>
          <mesh material={ringMat} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[1.4, 1.8, 32]} />
          </mesh>
        </group>
      ))}
    </>
  );
}
