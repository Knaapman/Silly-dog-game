import { useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getAudioState, updateListener } from './audio';
import { GRAVITY } from './config';
import { emit } from './fx';
import { FxRenderer } from './FxRenderer';
import { getInput, isSourceConnected, padIdOf, pollInputs } from './input';
import { startMusic } from './music';
import { Player } from './player/Player';
import { camera as camState, players } from './runtime';
import { isPartyTime, useGame } from './store';
import { Beach } from './world/Beach';
import { Carnival } from './world/Carnival';
import { DinoPark } from './world/DinoPark';
import { Farm } from './world/Farm';
import { Forest } from './world/Forest';
import { Hints } from './world/Hints';
import { Hub } from './world/Hub';
import { LaunchPad } from './world/Launchers';
import { Playground } from './world/Playground';
import { Sports } from './world/Sports';
import { GoldenStars } from './world/Stars';
import { Sky, Terrain } from './world/Terrain';
import { Balloons } from './world/Toys';
import { Train } from './world/Train';
import { Trees } from './world/Trees';
import { Winter } from './world/Winter';
import { LAUNCH_PADS } from './layout';

function SkyDome() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color('#4aa8ff') },
          bottom: { value: new THREE.Color('#d6f1ff') }
        },
        vertexShader: `varying vec3 vPos; void main(){ vPos = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vPos; void main(){ float h = clamp(vPos.y * 1.6 + 0.1, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }`
      }),
    []
  );
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => {
    mesh.current?.position.copy(camera.position);
  });
  return (
    <mesh ref={mesh} material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[300, 24, 12]} />
    </mesh>
  );
}

function Lighting() {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const { scene } = useThree();
  const partyColor = useMemo(() => new THREE.Color(), []);
  const baseSky = useMemo(() => new THREE.Color('#e8f6ff'), []);

  useEffect(() => {
    if (sun.current) scene.add(sun.current.target);
  }, [scene]);

  useFrame(({ clock }) => {
    const f = camState.focus;
    if (sun.current) {
      sun.current.position.set(f.x + 14, f.y + 28, f.z + 12);
      sun.current.target.position.set(f.x, f.y, f.z);
      sun.current.target.updateMatrixWorld();
    }
    if (hemi.current) {
      if (isPartyTime()) {
        partyColor.setHSL((clock.elapsedTime * 0.6) % 1, 0.8, 0.75);
        hemi.current.color.lerp(partyColor, 0.2);
      } else hemi.current.color.lerp(baseSky, 0.05);
    }
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={['#e8f6ff', '#6fae4f', 1.6]} />
      <directionalLight
        ref={sun}
        castShadow
        intensity={2.3}
        color="#fff4dc"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
      />
    </>
  );
}

/** One shared camera that frames every player (no split screen for little kids). */
function CameraRig() {
  const focus = useMemo(() => new THREE.Vector3(0, 0, 4), []);
  const desiredFocus = useMemo(() => new THREE.Vector3(), []);
  const desiredPos = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useMemo(() => new THREE.Vector3(0, 0, 4), []);
  const orbit = useRef(0);

  useFrame(({ camera, size }, delta) => {
    const dt = Math.min(delta, 0.05);
    const game = useGame.getState();
    if (game.phase === 'title' || players.size === 0) {
      orbit.current += dt * 0.04;
      desiredFocus.set(0, 0, 0);
      focus.lerp(desiredFocus, 1 - Math.exp(-1.5 * dt));
      desiredPos.set(Math.sin(orbit.current) * 62, 44, Math.cos(orbit.current) * 62);
    } else {
      desiredFocus.set(0, 0, 0);
      const anyAwake = [...players.values()].some((p) => !p.asleep);
      let framed = 0;
      players.forEach((p) => {
        if (anyAwake && p.asleep) return;
        desiredFocus.add(p.position);
        framed += 1;
      });
      desiredFocus.divideScalar(Math.max(1, framed));
      let spread = 0;
      players.forEach((p) => {
        if (anyAwake && p.asleep) return;
        spread = Math.max(spread, Math.abs(p.position.x - desiredFocus.x) * 0.85, Math.abs(p.position.z - desiredFocus.z) * 1.35);
      });
      desiredFocus.y = Math.min(4, Math.max(0, desiredFocus.y - 0.5) * 0.5);
      const aspect = size.width / Math.max(1, size.height);
      const portraitBoost = aspect < 1.3 ? Math.min(1.7, 1.3 / aspect) : 1;
      const dist = THREE.MathUtils.clamp(13 + spread * 1.4, 13, 50) * portraitBoost + (isPartyTime() ? 2.5 : 0);
      focus.lerp(desiredFocus, 1 - Math.exp(-5 * dt));
      desiredPos.set(focus.x, focus.y + dist * 0.8, focus.z + dist * 0.78);
    }
    camera.position.lerp(desiredPos, 1 - Math.exp(-3.5 * dt));
    camState.shake = Math.max(0, camState.shake - dt * 2.5);
    if (camState.shake > 0) {
      const s = camState.shake * camState.shake;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
    }
    lookAt.lerp(focus, 1 - Math.exp(-6 * dt));
    camera.lookAt(lookAt.x, lookAt.y + 0.6, lookAt.z);
    camState.focus.copy(focus);
  });
  return null;
}

/** Polls every controller/keyboard/touch source; any button press drops a new player in. */
function InputSystem() {
  const missingSince = useRef(new Map<number, number>());
  useFrame(() => {
    const pressed = pollInputs();
    const game = useGame.getState();
    if (game.menuOpen) return;
    if (game.phase === 'title') {
      // Keyboard starts are handled by App (any key works there); here: controllers and touch.
      const source = pressed.find((s) => s !== 'kb1' && s !== 'kb2');
      if (source) game.start(source);
      return;
    }
    for (const source of pressed) {
      if (game.players.some((p) => p.source === source)) continue;
      // A controller that dropped out and came back (maybe on a new index) wakes its own animal.
      const padId = padIdOf(source);
      const napper = padId ? game.players.find((p) => p.asleep && p.padId === padId && !isSourceConnected(p.source)) : undefined;
      if (napper) game.reattach(napper.slot, source);
      else game.join(source);
    }
    // Hold Start = grown-ups menu, hold Select = leave the game.
    for (const p of game.players) {
      const frame = getInput(p.source);
      if (frame.menu) game.setMenuOpen(true);
      if (frame.leave) game.leave(p.slot);
    }
    // Unplugged controllers: the animal naps (and leaves after a long while).
    const now = performance.now();
    game.players.forEach((p) => {
      if (isSourceConnected(p.source)) {
        missingSince.current.delete(p.slot);
        if (p.asleep) game.setAsleep(p.slot, false);
        return;
      }
      const since = missingSince.current.get(p.slot) ?? now;
      missingSince.current.set(p.slot, since);
      if (now - since > 1500 && !p.asleep) game.setAsleep(p.slot, true);
      if (now - since > 120000) {
        missingSince.current.delete(p.slot);
        game.leave(p.slot);
      }
    });
  }, -10);
  return null;
}

function AudioDirector() {
  useFrame(() => {
    updateListener(camState.focus);
    const game = useGame.getState();
    const audio = getAudioState();
    if (game.phase === 'play' && audio.running) startMusic();
  });
  return null;
}

/** Confetti rain + fireworks while the party meter celebration runs. */
function PartyDirector() {
  const confettiTimer = useRef(0);
  const fireworkTimer = useRef(0);
  useFrame((_, delta) => {
    if (!isPartyTime()) return;
    const f = camState.focus;
    confettiTimer.current -= delta;
    fireworkTimer.current -= delta;
    if (confettiTimer.current <= 0) {
      confettiTimer.current = 0.06;
      emit('confetti', [f.x + (Math.random() - 0.5) * 30, 14, f.z + (Math.random() - 0.5) * 20], { count: 6, speed: 1, up: 0, gravity: 3, life: 3.5 });
    }
    if (fireworkTimer.current <= 0) {
      fireworkTimer.current = 0.45;
      const colors = [['#ff4d5e', '#ffd23f'], ['#3b82f6', '#a855f7'], ['#22c55e', '#ffffff'], ['#ff8fd8', '#ffd23f']];
      emit('star', [f.x + (Math.random() - 0.5) * 24, 9 + Math.random() * 5, f.z - 4 + (Math.random() - 0.5) * 10], {
        count: 26,
        color: colors[Math.floor(Math.random() * colors.length)],
        speed: 9,
        up: 2,
        gravity: 3,
        drag: 2,
        size: 0.18,
        life: 1.3
      });
    }
  });
  return null;
}

function DevHook() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __silly?: Record<string, unknown> };
    if (w.__silly) w.__silly.gl = gl;
  }, [gl]);
  return null;
}

function Players() {
  const list = useGame((s) => s.players);
  return (
    <>
      {list.map((p) => (
        <Player key={`${p.slot}-${p.joinedAt}`} info={p} />
      ))}
    </>
  );
}

export function Scene() {
  const menuOpen = useGame((s) => s.menuOpen);
  return (
    <>
      <DevHook />
      <SkyDome />
      <fog attach="fog" args={['#d6f1ff', 90, 230]} />
      <Lighting />
      <CameraRig />
      <InputSystem />
      <AudioDirector />
      <PartyDirector />
      <Physics gravity={[0, GRAVITY, 0]} paused={menuOpen}>
        <Terrain />
        <Trees />
        <Hub />
        <Carnival />
        <Sports />
        <DinoPark />
        <Playground />
        <Beach />
        <Winter />
        <Farm />
        <Forest />
        <Train />
        {LAUNCH_PADS.slice(1).map((pad, i) => (
          <LaunchPad key={i} pad={pad} />
        ))}
        <Balloons />
        <GoldenStars />
        <Players />
      </Physics>
      <Sky />
      <Hints />
      <FxRenderer />
    </>
  );
}
