import { useEffect, useRef } from 'react';
import { useGameStore, type UiActionType } from './store';

const GAMEPAD_DEADZONE = 0.18;
const JOYSTICK_DEADZONE = 0.12;
const ANALOG_RESPONSE_CURVE = 1.6;
const JUMP_BUFFER_MS = 130;
const COYOTE_TIME_MS = 110;

type InputSampleOptions = {
  grounded?: boolean;
};

type ActionState = Record<UiActionType, boolean>;

function createActionState(): ActionState {
  return {
    bark: false,
    dig: false,
    lieDown: false,
    poop: false,
    interact: false,
    eat: false,
    jump: false,
    sit: false,
    roll: false,
    sniff: false
  };
}

function shapeAnalogInput(x: number, y: number, deadzone: number) {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= deadzone) {
    return { x: 0, y: 0, magnitude: 0 };
  }

  const normalizedMagnitude = (magnitude - deadzone) / (1 - deadzone);
  const curvedMagnitude = Math.pow(Math.min(1, normalizedMagnitude), ANALOG_RESPONSE_CURVE);
  const scale = curvedMagnitude / magnitude;

  return {
    x: x * scale,
    y: y * scale,
    magnitude: curvedMagnitude
  };
}

export function useInput(playerIndex: number) {
  const keys = useRef<Record<string, boolean>>({});
  const prevActions = useRef<ActionState>(createActionState());
  const prevGamepadActions = useRef<ActionState>(createActionState());
  const jumpBufferUntil = useRef(0);
  const coyoteUntil = useRef(0);
  const jumpConsumed = useRef(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  return ({ grounded = false }: InputSampleOptions = {}) => {
    let x = 0;
    let z = 0;
    let run = false;
    const actions = createActionState();
    const gamepadActions = createActionState();

    if (playerIndex === 0) {
      if (keys.current['KeyA']) x -= 1;
      if (keys.current['KeyD']) x += 1;
      if (keys.current['KeyW']) z -= 1;
      if (keys.current['KeyS']) z += 1;
      if (keys.current['KeyF']) actions.bark = true;
      if (keys.current['KeyE']) actions.eat = true;
      if (keys.current['KeyT']) actions.interact = true;
      if (keys.current['Space']) actions.jump = true;
      if (keys.current['KeyQ']) actions.sit = true;
      if (keys.current['KeyR']) actions.roll = true;
      if (keys.current['KeyZ']) actions.poop = true;
      if (keys.current['KeyC']) actions.lieDown = true;
      if (keys.current['KeyV']) actions.sniff = true;
      if (keys.current['KeyX']) actions.dig = true;
      if (keys.current['ShiftLeft']) run = true;
    } else if (playerIndex === 1) {
      if (keys.current['ArrowLeft']) x -= 1;
      if (keys.current['ArrowRight']) x += 1;
      if (keys.current['ArrowUp']) z -= 1;
      if (keys.current['ArrowDown']) z += 1;
      if (keys.current['Enter']) actions.bark = true;
      if (keys.current['Slash']) actions.eat = true;
      if (keys.current['Quote']) actions.interact = true;
      if (keys.current['ControlRight']) actions.jump = true;
      if (keys.current['Period']) actions.sit = true;
      if (keys.current['Comma']) actions.roll = true;
      if (keys.current['KeyM']) actions.poop = true;
      if (keys.current['KeyL']) actions.lieDown = true;
      if (keys.current['Semicolon']) actions.sniff = true;
      if (keys.current['KeyU']) actions.dig = true;
      if (keys.current['ShiftRight']) run = true;
    }

    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[playerIndex];
    if (gp) {
      const leftStick = shapeAnalogInput(gp.axes[0] ?? 0, gp.axes[1] ?? 0, GAMEPAD_DEADZONE);
      x += leftStick.x;
      z += leftStick.y;

      gamepadActions.jump = !!gp.buttons[0]?.pressed;
      gamepadActions.bark = !!gp.buttons[1]?.pressed;
      gamepadActions.interact = !!gp.buttons[2]?.pressed;
      gamepadActions.eat = !!gp.buttons[3]?.pressed;
      gamepadActions.sniff = !!gp.buttons[4]?.pressed;
      gamepadActions.dig = !!gp.buttons[5]?.pressed;
      gamepadActions.lieDown = !!gp.buttons[6]?.pressed;
      run = run || !!gp.buttons[7]?.pressed;
      gamepadActions.sit = !!gp.buttons[12]?.pressed;
      gamepadActions.poop = !!gp.buttons[13]?.pressed;
      gamepadActions.roll = !!gp.buttons[15]?.pressed;
    }

    const joystick = useGameStore.getState().joystick;
    if (playerIndex === 0 && joystick.active) {
      const shapedJoystick = shapeAnalogInput(joystick.x, joystick.y, JOYSTICK_DEADZONE);
      x += shapedJoystick.x;
      z += shapedJoystick.y;
    }

    (Object.keys(gamepadActions) as UiActionType[]).forEach((action) => {
      if (gamepadActions[action] && !prevGamepadActions.current[action]) {
        useGameStore.getState().triggerInputFeedback(action, 'gamepad', playerIndex);
      }
      prevGamepadActions.current[action] = gamepadActions[action];
      actions[action] = actions[action] || gamepadActions[action];
    });

    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }

    const now = performance.now();
    if (grounded) {
      coyoteUntil.current = now + COYOTE_TIME_MS;
    }

    const jumpPressedThisFrame = actions.jump && !prevActions.current.jump;
    if (jumpPressedThisFrame) {
      jumpBufferUntil.current = now + JUMP_BUFFER_MS;
    }

    const canConsumeBufferedJump = !jumpConsumed.current
      && jumpBufferUntil.current > now
      && coyoteUntil.current > now;

    const justJumped = canConsumeBufferedJump;
    if (justJumped) {
      jumpConsumed.current = true;
      jumpBufferUntil.current = 0;
      coyoteUntil.current = 0;
    } else if (!actions.jump) {
      jumpConsumed.current = false;
    }

    const justBarked = actions.bark && !prevActions.current.bark;
    const justInteracted = actions.interact && !prevActions.current.interact;
    const justSat = actions.sit && !prevActions.current.sit;
    const justRolled = actions.roll && !prevActions.current.roll;
    const justPooped = actions.poop && !prevActions.current.poop;
    const justLayDown = actions.lieDown && !prevActions.current.lieDown;
    const justSniffed = actions.sniff && !prevActions.current.sniff;
    const justDug = actions.dig && !prevActions.current.dig;
    const justAte = actions.eat && !prevActions.current.eat;

    prevActions.current = { ...actions };

    return {
      x,
      z,
      bark: actions.bark,
      justBarked,
      interact: actions.interact,
      justInteracted,
      jump: actions.jump,
      justJumped,
      sit: actions.sit,
      justSat,
      roll: actions.roll,
      justRolled,
      poop: actions.poop,
      justPooped,
      lieDown: actions.lieDown,
      justLayDown,
      sniff: actions.sniff,
      justSniffed,
      dig: actions.dig,
      justDug,
      eat: actions.eat,
      justAte,
      run
    };
  };
}
