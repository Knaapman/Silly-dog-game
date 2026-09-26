import { BallCollider, RigidBody, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { playBurp, playHatTada, playPoof, playPower } from '../audio';
import { gameClock, gameNow, useGameFrame } from '../clock';
import { ANIMAL_GROUPS } from '../collision';
import { BELLY_MAX, PARTY_POINTS, PLAYER_SHAPES } from '../config';
import { emit, poof, ring } from '../fx';
import { getInput, NO_INPUT, rumble } from '../input';
import { lambert } from '../materials';
import { players, props, type PlayerRuntime } from '../runtime';
import { MAGIC_FACTOR, settings } from '../settings';
import { isPaused, useGame, type PlayerInfo } from '../store';
import { tongue as tongueStep, headbutt, looks, poop, voice } from './actions';
import { AnimalModel, createRig, SPECIES_SPECS } from './AnimalModel';
import { animate } from './animate';
import { flop, impulses, landing, launch, powerAndSize, probeGround, respawnIfLost, syncRuntime, tickTimers, tugged, waterAndMud } from './body';
import { MODEL_SCALE, POWER_COLOR, POWER_TIME, RADIUS } from './constants';
import { MarkerShape } from './MarkerShape';
import { createTmp, type FrameCtx } from './frame';
import { movement } from './movement';
import { pickSpawn } from './physics';
import { piggyback } from './piggyback';
import { createState } from './state';
import { earnSticker } from '../stickers';

// One animal. The per-frame logic lives in the modules next to this file and runs in a
// fixed order (see the frame loop below); this component owns the physics body, the
// scene objects, and the hooks that let the rest of the game talk to the animal.

export function Player({ info }: { info: PlayerInfo }) {
  const { slot, source, species, hat, color } = info;
  const asleep = !!info.asleep;
  const { world, rapier } = useRapier();
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const yawGroup = useRef<THREE.Group>(null);
  const squashGroup = useRef<THREE.Group>(null);
  const sizeGroup = useRef<THREE.Group>(null);
  const flipGroup = useRef<THREE.Group>(null);
  const shadowRing = useRef<THREE.Mesh>(null);
  const marker = useRef<THREE.Group>(null);
  const tongue = useRef<THREE.Mesh>(null);
  const tongueTip = useRef<THREE.Mesh>(null);
  const rig = useRef(createRig());

  const spawn = useMemo(() => pickSpawn(slot), [slot]);
  const st = useRef(createState(spawn));
  const speciesRef = useRef(species);
  speciesRef.current = species;
  const asleepRef = useRef(asleep);
  asleepRef.current = asleep;
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const beam = useRef<THREE.Mesh>(null);
  const bornAt = useRef(gameNow());

  const tmp = useMemo(createTmp, []);
  const ray = useMemo(() => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }), [rapier]);

  // Register with the runtime so props, critters, camera and other players can find us.
  useEffect(() => {
    const s = st.current;
    const rt: PlayerRuntime = {
      slot,
      source,
      getBody: () => body.current,
      position: s.pos,
      velocity: s.vel,
      facing: 0,
      flopped: false,
      asleep: false,
      jumpedAt: 0,
      noiseAt: 0,
      poopAt: 0,
      bump: (dir) => {
        s.pendingBump = dir.clone();
      },
      hop: (vy) => {
        s.pendingHop = vy;
      },
      launchTo: (target, apex) => {
        s.pendingLaunch = { target: target.clone(), apex };
      },
      hold: (position, hidden = false) => {
        s.holdAt = position ? position.clone() : null;
        s.hidden = position ? hidden : false;
      },
      isLaunched: () => s.launched > 0 || s.pendingLaunch != null || s.holdAt != null,
      belly: 0,
      feed: () => {
        s.chew = 0.7;
        s.bellyVel += 3.5;
        if (s.belly < BELLY_MAX) {
          s.belly += 1;
          if (s.belly === BELLY_MAX) earnSticker('full');
          return;
        }
        // Already stuffed: a big burp instead.
        playBurp(s.pos);
        s.squash = -0.3;
        ring([s.pos.x, s.pos.y + 0.6, s.pos.z], { color: '#c8f7c5', radius: 2.2, duration: 0.5 });
        emit('puff', [s.pos.x, s.pos.y + 0.7, s.pos.z], { count: 6, color: ['#e8ffe0', '#ffffff'], speed: 1.5, up: 1.5, size: 0.3 });
      },
      power: null,
      size: 1,
      ridingOn: null,
      grabbedBy: null,
      tug: new THREE.Vector3(),
      powerUp: (kind) => {
        s.powerTime = POWER_TIME[kind] * MAGIC_FACTOR[settings().magic];
        if (s.power === kind) return;
        s.power = kind;
        if (kind === 'giant') earnSticker('giant');
        playPower(s.pos, true);
        ring([s.pos.x, s.pos.y - 0.4, s.pos.z], { color: POWER_COLOR[kind], radius: 3, duration: 0.6 });
        emit('star', [s.pos.x, s.pos.y + 0.5, s.pos.z], { count: 18, color: [POWER_COLOR[kind], '#ffffff', '#ffd23f'], speed: 4, up: 4 });
        useGame.getState().addParty(PARTY_POINTS.launch);
      }
    };
    players.set(slot, rt);
    // "I'm here!" - buzz the controller that just joined.
    rumble(sourceRef.current, 0.6, 0.6, 250);
    return () => {
      players.delete(slot);
      if (useGame.getState().phase === 'play') {
        poof([s.pos.x, s.pos.y, s.pos.z], color, 16);
        playPoof(s.pos);
      }
      const held = s.held != null ? props.get(s.held) : null;
      if (held) {
        held.heldBy = null;
        held.onRelease?.();
      }
      const friend = s.heldFriend != null ? players.get(s.heldFriend) : null;
      if (friend?.grabbedBy === slot) friend.grabbedBy = null;
    };
  }, [slot]);

  // Poof when (re)spawning or switching animal.
  useEffect(() => {
    const s = st.current;
    poof([s.pos.x, s.pos.y, s.pos.z], '#ffffff', 12);
    ring([s.pos.x, s.pos.y, s.pos.z], { color, radius: 1.6, duration: 0.4 });
    playPoof(s.pos);
    s.squash = -0.35;
  }, [species, color]);

  const lastHat = useRef(hat);
  useEffect(() => {
    if (lastHat.current === hat) return;
    lastHat.current = hat;
    const s = st.current;
    emit('confetti', [s.pos.x, s.pos.y + 1.3, s.pos.z], { count: 24, speed: 3, up: 5 });
    playHatTada(s.pos);
    s.squash = 0.25;
  }, [hat]);

  useGameFrame((_state, delta) => {
    const rb = body.current;
    if (!rb) return;
    const s = st.current;
    const game = useGame.getState();
    const napping = asleepRef.current;
    const species = speciesRef.current;
    const t = rb.translation();
    const lv = rb.linvel();
    s.prevVel.copy(s.vel);
    s.pos.set(t.x, t.y, t.z);
    s.vel.set(lv.x, lv.y, lv.z);

    const f: FrameCtx = {
      s,
      rb,
      col: collider.current,
      slot,
      source: sourceRef.current,
      color,
      hat,
      species,
      spec: SPECIES_SPECS[species],
      input: game.phase === 'play' && !isPaused(game) && !napping ? getInput(sourceRef.current) : NO_INPUT,
      napping,
      dt: Math.min(delta, 1 / 20),
      time: gameClock.time,
      rt: players.get(slot),
      t,
      lv,
      tmp,
      rad: RADIUS * s.size,
      hit: null,
      groundDist: 99,
      surface: undefined,
      onStatic: true,
      wasGrounded: s.grounded,
      heavyDrag: false,
      rocketed: false,
      riding: s.ridingOn != null,
      v: { x: lv.x, y: lv.y, z: lv.z }
    };

    // the body: size, what's underneath, timers, water, flopping
    powerAndSize(f);
    probeGround(f, world, ray, rapier.QueryFilterFlags.EXCLUDE_SENSORS);
    tickTimers(f);
    waterAndMud(f);
    flop(f);
    // the buttons: lick, noise, poop, animal / hat, headbutt
    tongueStep(f);
    voice(f);
    poop(f);
    looks(f);
    headbutt(f);
    // what happens to us, then where we go
    impulses(f);
    tugged(f);
    piggyback(f);
    launch(f);
    movement(f);
    landing(f);
    respawnIfLost(f, rb);
    syncRuntime(f);
    animate(f, {
      rig: rig.current,
      yawGroup: yawGroup.current,
      squashGroup: squashGroup.current,
      sizeGroup: sizeGroup.current,
      flipGroup: flipGroup.current,
      shadowRing: shadowRing.current,
      beam: beam.current,
      marker: marker.current,
      tongue: tongue.current,
      tongueTip: tongueTip.current,
      bornAt: bornAt.current
    });
  });

  return (
    <>
      <RigidBody
        ref={body}
        position={[spawn.x, spawn.y, spawn.z]}
        colliders={false}
        enabledRotations={[false, false, false]}
        linearDamping={0}
        angularDamping={1.2}
        ccd
        canSleep={false}
      >
        <BallCollider ref={collider} args={[RADIUS]} friction={0} restitution={0} density={4} collisionGroups={ANIMAL_GROUPS} />
        <group ref={yawGroup} position={[0, -RADIUS, 0]}>
          <group ref={sizeGroup}>
          <group ref={squashGroup}>
            <group ref={flipGroup} position={[0, 0.6, 0]}>
              <group position={[0, -0.6, 0]} scale={MODEL_SCALE}>
                <AnimalModel key={species} species={species} hat={hat} color={color} rig={rig} />
              </group>
            </group>
          </group>
          </group>
        </group>
      </RigidBody>

      <mesh ref={shadowRing} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <ringGeometry args={[0.55, 0.78, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} />
      </mesh>
      <mesh ref={beam}>
        <cylinderGeometry args={[0.9, 1.2, 12, 20, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <group ref={marker}>
        <MarkerShape shape={PLAYER_SHAPES[slot % PLAYER_SHAPES.length]} color={color} />
      </group>
      <mesh ref={tongue} visible={false} material={lambert('#ff6f9c')}>
        <cylinderGeometry args={[0.055, 0.075, 1, 8]} />
      </mesh>
      <mesh ref={tongueTip} visible={false} material={lambert('#ff6f9c')}>
        <sphereGeometry args={[0.1, 10, 8]} />
      </mesh>
    </>
  );
}
