import { Birds } from './world/Birds';
import { Landmarks } from './world/Landmarks';
import { Sleds, TubeRide } from './world/Rides';
import { Zipline } from './world/Zipline';
import { Cats } from './world/Cats';
import { useFrame, useThree } from '@react-three/fiber';
import { Physics, useRapier } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getAudioState, playShutter, updateListener } from './audio';
import { GRAVITY } from './config';
import { emit } from './fx';
import { gameClock, useGameFrame } from './clock';
import { FrameLoop } from './FrameLoop';
import { FxRenderer } from './FxRenderer';
import { albumPressed, getInput, inputTime, isSourceConnected, padIdOf, photoPressed, pollInputs } from './input';
import { PHOTO_SIZE, usePhotos } from './photo';
import { startMusic } from './music';
import { Player } from './player/Player';
import { camera as camState, players, type PlayerRuntime } from './runtime';
import { cameraFoci, JOIN_AT, layoutRects, lightRig, renderViews, SPLIT_AT, useViews, views, type View } from './views';
import { effectiveQuality, QUALITY, useSettings } from './settings';
import { isPartyTime, isPaused, useGame } from './store';
import { TEST_MODE } from './testMode';
import { Beach } from './world/Beach';
import { Carnival } from './world/Carnival';
import { SkyCourse } from './world/SkyCourse';
import { BumperCars } from './world/BumperCars';
import { DinoPark } from './world/DinoPark';
import { Farm } from './world/Farm';
import { Forest } from './world/Forest';
import { Hints } from './world/Hints';
import { Hub } from './world/Hub';
import { BubbleMachine } from './world/BubbleMachine';
import { HamsterBalls } from './world/HamsterBalls';
import { LaunchPad } from './world/Launchers';
import { Playground } from './world/Playground';
import { Sports } from './world/Sports';
import { GoldenStars } from './world/Stars';
import { Treasures } from './world/Treasures';
import { Sky, Terrain } from './world/Terrain';
import { Balloons } from './world/Toys';
import { Train } from './world/Train';
import { Food } from './world/Food';
import { Poops } from './world/Poop';
import { Trees } from './world/Trees';
import { Winter } from './world/Winter';
import { ParkEvents, weather } from './world/Events';
import { StickerGuide } from './world/Guide';
import { Buddy } from './world/Buddy';
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
    lightRig.sun = sun.current;
    return () => {
      lightRig.sun = null;
    };
  }, [scene]);

  // Graphics level: sharper shadows over a wider area on a strong graphics card.
  const quality = QUALITY[useSettings(effectiveQuality)];
  useEffect(() => {
    const light = sun.current;
    if (!light) return;
    const { shadow } = light;
    const cam = shadow.camera;
    cam.left = cam.bottom = -quality.shadowExtent;
    cam.right = cam.top = quality.shadowExtent;
    cam.far = 60 + quality.shadowExtent;
    cam.updateProjectionMatrix();
    if (shadow.mapSize.x !== quality.shadowMap) {
      shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
      // three only makes a new shadow texture when there is none
      shadow.map?.dispose();
      shadow.map = null;
    }
  }, [quality]);

  useFrame(() => {
    const f = camState.focus;
    if (sun.current) {
      sun.current.position.set(f.x + 14, f.y + 28, f.z + 12);
      sun.current.target.position.set(f.x, f.y, f.z);
      sun.current.target.updateMatrixWorld();
    }
    // a rain shower makes everything a bit greyer
    if (sun.current) sun.current.intensity = 2.3 * (1 - 0.5 * weather.rain);
    if (hemi.current) {
      hemi.current.intensity = 1.6 * (1 - 0.25 * weather.rain);
      if (isPartyTime()) {
        partyColor.setHSL((gameClock.time * 0.6) % 1, 0.8, 0.75);
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
        shadow-camera-near={1}
        shadow-bias={-0.0005}
        shadow-normalBias={0.03}
      />
    </>
  );
}

/**
 * One shared camera that frames every player; when the children wander too far apart for that,
 * a camera each in split screen (see views.ts), joining up again when they come back together.
 */
function CameraRig() {
  const focus = useMemo(() => new THREE.Vector3(0, 0, 4), []);
  const desiredFocus = useMemo(() => new THREE.Vector3(), []);
  const desiredPos = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useMemo(() => new THREE.Vector3(0, 0, 4), []);
  const orbit = useRef(0);
  const viewOf = useMemo(() => new Map<number, View>(), []);
  const tmp = useMemo(() => ({ kid: new THREE.Vector3(), pos: new THREE.Vector3() }), []);

  /** How far apart the children (not the buddy, not anyone napping) are, as the camera sees it. */
  const kidSpread = (kids: PlayerRuntime[]) => {
    tmp.kid.set(0, 0, 0);
    kids.forEach((p) => tmp.kid.add(p.position));
    tmp.kid.divideScalar(Math.max(1, kids.length));
    let spread = 0;
    kids.forEach((p) => {
      spread = Math.max(spread, Math.abs(p.position.x - tmp.kid.x) * 0.85, Math.abs(p.position.z - tmp.kid.z) * 1.35, Math.abs(p.position.y - tmp.kid.y) * 0.9);
    });
    return 13 + spread * 1.4;
  };

  /** Split (or keep split) with a view for each child, or join back up. */
  const updateSplit = (camera: THREE.Camera, width: number, height: number, dt: number) => {
    const kids = [...players.values()].filter((p) => !p.bot && !p.asleep).sort((a, b) => a.slot - b.slot);
    const reach = kids.length >= 2 ? kidSpread(kids) : 0;
    const want = useSettings.getState().split && kids.length >= 2 && !(TEST_MODE && camState.override) && (views.split ? reach > JOIN_AT : reach > SPLIT_AT);
    if (!want) {
      if (views.split) {
        views.split = false;
        views.list = [];
        viewOf.clear();
        useViews.setState({ split: false, slots: [] });
      }
      return;
    }
    const rects = layoutRects(kids.length);
    const zoom = useSettings.getState().zoom;
    views.list = kids.map((p, i) => {
      let v = viewOf.get(p.slot);
      if (!v) {
        // a new view starts where the shared camera is, and swoops in to its animal
        const cam = (camera as THREE.PerspectiveCamera).clone();
        v = { slot: p.slot, cam, focus: focus.clone(), look: lookAt.clone(), rect: rects[i] };
        viewOf.set(p.slot, v);
      }
      v.rect = rects[i];
      const aspect = (v.rect.w * width) / Math.max(1, v.rect.h * height);
      const portraitBoost = aspect < 1.3 ? Math.min(1.7, 1.3 / aspect) : 1;
      const up = Math.max(0, p.position.y - 0.5);
      tmp.kid.set(p.position.x, up * 0.5 + Math.max(0, up - 3) * 0.5, p.position.z);
      v.focus.lerp(tmp.kid, 1 - Math.exp(-5 * dt));
      const dist = (13 * portraitBoost + (isPartyTime() ? 2.5 : 0)) * zoom;
      tmp.pos.set(v.focus.x, v.focus.y + dist * 0.8, v.focus.z + dist * 0.78);
      v.cam.position.lerp(tmp.pos, 1 - Math.exp(-3.5 * dt));
      if (camState.shake > 0 && dt > 0) {
        const s = camState.shake * camState.shake;
        v.cam.position.x += (Math.random() - 0.5) * s;
        v.cam.position.y += (Math.random() - 0.5) * s;
      }
      v.look.lerp(v.focus, 1 - Math.exp(-6 * dt));
      v.cam.lookAt(v.look.x, v.look.y + 0.6, v.look.z);
      return v;
    });
    [...viewOf.keys()].forEach((slot) => {
      if (!kids.some((p) => p.slot === slot)) viewOf.delete(slot);
    });
    const slots = kids.map((p) => p.slot);
    const ui = useViews.getState();
    if (!views.split || !ui.split || ui.slots.join() !== slots.join()) useViews.setState({ split: true, slots });
    views.split = true;
  };

  useFrame(({ camera, size, scene }, delta) => {
    const dt = Math.min(delta, 0.05);
    const game = useGame.getState();
    if (TEST_MODE && camState.override) {
      const { position, lookAt } = camState.override;
      camera.position.set(...position);
      camera.lookAt(...lookAt);
      scene.fog = null;
      return;
    }
    if (game.phase === 'title' || players.size === 0) {
      orbit.current += dt * 0.04;
      desiredFocus.set(0, 0, 0);
      focus.lerp(desiredFocus, 1 - Math.exp(-1.5 * dt));
      desiredPos.set(Math.sin(orbit.current) * 70, 48, Math.cos(orbit.current) * 70);
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
      // a jump barely moves the camera; up the mountain (or the ferris wheel) it follows properly
      const up = Math.max(0, desiredFocus.y - 0.5);
      desiredFocus.y = up * 0.5 + Math.max(0, up - 3) * 0.5;
      players.forEach((p) => {
        if (anyAwake && p.asleep) return;
        spread = Math.max(spread, Math.abs(p.position.y - desiredFocus.y) * 0.9);
      });
      const aspect = size.width / Math.max(1, size.height);
      const portraitBoost = aspect < 1.3 ? Math.min(1.7, 1.3 / aspect) : 1;
      const dist = (THREE.MathUtils.clamp(13 + spread * 1.4, 13, 50) * portraitBoost + (isPartyTime() ? 2.5 : 0)) * useSettings.getState().zoom;
      camState.dist = dist;
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
    if (game.phase === 'play') updateSplit(camera, size.width, size.height, dt);
    else if (views.split) updateSplit(camera, size.width, size.height, 0);
  });
  return null;
}

/** Polls every controller/keyboard/touch source; any button press drops a new player in. */
function InputSystem() {
  const missingSince = useRef(new Map<number, number>());
  useFrame(() => {
    const pressed = pollInputs();
    const game = useGame.getState();
    if (isPaused(game)) return;
    if (game.phase === 'play' && photoPressed()) usePhotos.getState().request();
    if (game.phase === 'play' && albumPressed()) {
      game.setAlbumOpen(true);
      return;
    }
    if (game.phase === 'title') {
      // Keyboard starts are handled by App (any key works there); here: controllers and touch.
      const source = pressed.find((s) => s !== 'kb1' && s !== 'kb2');
      if (source) game.start(source, true);
      return;
    }
    for (const source of pressed) {
      if (game.players.some((p) => p.source === source)) continue;
      // A controller that dropped out and came back (maybe on a new index) wakes its own animal.
      const padId = padIdOf(source);
      const napper = padId ? game.players.find((p) => p.asleep && p.padId === padId && !isSourceConnected(p.source)) : undefined;
      if (napper) game.reattach(napper.slot, source);
      else game.join(source, true);
    }
    // Hold Start = grown-ups menu, hold Select = leave the game.
    for (const p of game.players) {
      const frame = getInput(p.source);
      if (frame.menu) game.setMenuOpen(true);
      if (frame.leave) game.leave(p.slot);
    }
    // Unplugged controllers: the animal naps (and leaves after a long while).
    const now = inputTime();
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
    updateListener(camState.focus, views.split ? cameraFoci() : []);
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
  useGameFrame((_, delta) => {
    if (!isPartyTime()) return;
    confettiTimer.current -= delta;
    fireworkTimer.current -= delta;
    // over every view in split screen (between the children, nobody would see it)
    const foci = cameraFoci();
    if (confettiTimer.current <= 0) {
      confettiTimer.current = 0.06;
      for (const f of foci) emit('confetti', [f.x + (Math.random() - 0.5) * 30, f.y + 14, f.z + (Math.random() - 0.5) * 20], { count: 6, speed: 1, up: 0, gravity: 3, life: 3.5 });
    }
    if (fireworkTimer.current <= 0) {
      fireworkTimer.current = 0.45;
      const colors = [['#ff4d5e', '#ffd23f'], ['#3b82f6', '#a855f7'], ['#22c55e', '#ffffff'], ['#ff8fd8', '#ffd23f']];
      for (const f of foci) {
        emit('star', [f.x + (Math.random() - 0.5) * 24, f.y + 9 + Math.random() * 5, f.z - 4 + (Math.random() - 0.5) * 10], {
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
    }
  });
  return null;
}

/** The camera: runs the photo countdown and, on the shutter frame, keeps what's on screen. */
function PhotoDirector() {
  const get = useThree((s) => s.get);
  useFrame(() => {
    if (!usePhotos.getState().tick()) return;
    const { gl, scene, camera } = get();
    // Draw now and copy straight away: the canvas is only readable until the browser shows it.
    renderViews(gl, scene, camera);
    const src = gl.domElement;
    const scale = Math.min(1, PHOTO_SIZE / Math.max(src.width, src.height));
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(src.width * scale));
    out.height = Math.max(1, Math.round(src.height * scale));
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(src, 0, 0, out.width, out.height);
    usePhotos.getState().add(out.toDataURL('image/jpeg', 0.85));
    playShutter();
  });
  return null;
}

function DevHook() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    if (!import.meta.env.DEV && !TEST_MODE) return;
    const w = window as unknown as { __silly?: Record<string, unknown> };
    if (w.__silly) Object.assign(w.__silly, { gl, scene });
  }, [gl, scene]);
  return null;
}

/** Dev/test only: the physics world, for poking at colliders. */
function PhysicsHook() {
  const { world, rapier } = useRapier();
  useEffect(() => {
    if (!import.meta.env.DEV && !TEST_MODE) return;
    const w = window as unknown as { __silly?: Record<string, unknown> };
    if (w.__silly) Object.assign(w.__silly, { world, rapier });
  }, [world, rapier]);
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
  const paused = useGame(isPaused);
  return (
    <>
      <FrameLoop />
      <DevHook />
      <SkyDome />
      <fog attach="fog" args={['#d6f1ff', 100, 260]} />
      <Lighting />
      <CameraRig />
      <InputSystem />
      <Buddy />
      <AudioDirector />
      <PartyDirector />
      <PhotoDirector />
      <Physics gravity={[0, GRAVITY, 0]} paused={paused}>
        <PhysicsHook />
        <Terrain />
        <Trees />
        <Landmarks />
        <TubeRide />
        <Sleds />
        <Zipline />
        <Hub />
        <BubbleMachine />
        <HamsterBalls />
        <Carnival />
        <SkyCourse />
        <BumperCars />
        <Sports />
        <DinoPark />
        <Playground />
        <Beach />
        <Winter />
        <Farm />
        <Cats />
        <Birds />
        <Forest />
        <Train />
        <Food />
        <Poops />
        {LAUNCH_PADS.slice(1).map((pad, i) => (
          <LaunchPad key={i} pad={pad} />
        ))}
        <Balloons />
        <GoldenStars />
        <Treasures />
        <ParkEvents />
        <Players />
      </Physics>
      <Sky />
      <Hints />
      <StickerGuide />
      <FxRenderer />
    </>
  );
}
