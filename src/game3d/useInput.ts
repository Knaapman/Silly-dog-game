import { useEffect, useRef } from 'react';
import { useGameStore } from './store';

export function useInput(playerIndex: number) {
  const keys = useRef<Record<string, boolean>>({});
  const prevBark = useRef(false);
  const prevInteract = useRef(false);
  const prevJump = useRef(false);
  const prevSit = useRef(false);
  const prevRoll = useRef(false);
  const prevPoop = useRef(false);
  const prevLieDown = useRef(false);
  const prevSniff = useRef(false);
  const prevDig = useRef(false);
  const prevEat = useRef(false);

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

  return () => {
    let x = 0;
    let z = 0;
    let bark = false;
    let interact = false;
    let jump = false;
    let sit = false;
    let roll = false;
    let poop = false;
    let lieDown = false;
    let sniff = false;
    let dig = false;
    let run = false;
    let eat = false;

    if (playerIndex === 0) {
      if (keys.current['KeyA']) x -= 1;
      if (keys.current['KeyD']) x += 1;
      if (keys.current['KeyW']) z -= 1;
      if (keys.current['KeyS']) z += 1;
      if (keys.current['KeyF']) bark = true;
      if (keys.current['KeyE']) eat = true; // E for Eat
      if (keys.current['KeyT']) interact = true; // T for Throw
      if (keys.current['Space']) jump = true;
      if (keys.current['KeyQ']) sit = true;
      if (keys.current['KeyR']) roll = true;
      if (keys.current['KeyZ']) poop = true;
      if (keys.current['KeyC']) lieDown = true;
      if (keys.current['KeyV']) sniff = true;
      if (keys.current['KeyX']) dig = true;
      if (keys.current['ShiftLeft']) run = true;
    } else if (playerIndex === 1) {
      if (keys.current['ArrowLeft']) x -= 1;
      if (keys.current['ArrowRight']) x += 1;
      if (keys.current['ArrowUp']) z -= 1;
      if (keys.current['ArrowDown']) z += 1;
      if (keys.current['Enter']) bark = true;
      if (keys.current['Slash']) eat = true; // Slash for Eat
      if (keys.current['Quote']) interact = true; // Quote for Throw
      if (keys.current['ControlRight']) jump = true;
      if (keys.current['Period']) sit = true;
      if (keys.current['Comma']) roll = true;
      if (keys.current['KeyM']) poop = true;
      if (keys.current['KeyL']) lieDown = true;
      if (keys.current['Semicolon']) sniff = true;
      if (keys.current['KeyU']) dig = true;
      if (keys.current['ShiftRight']) run = true;
    }

    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[playerIndex];
    if (gp) {
      if (Math.abs(gp.axes[0]) > 0.1) x += gp.axes[0];
      if (Math.abs(gp.axes[1]) > 0.1) z += gp.axes[1];
      if (gp.buttons[0]?.pressed) jump = true; // A
      if (gp.buttons[1]?.pressed) bark = true; // B
      if (gp.buttons[2]?.pressed) interact = true; // X
      if (gp.buttons[3]?.pressed) poop = true; // Y
      if (gp.buttons[4]?.pressed) sit = true; // LB
      if (gp.buttons[5]?.pressed) roll = true; // RB
      if (gp.buttons[6]?.pressed) lieDown = true; // LT
      if (gp.buttons[7]?.pressed) run = true; // RT (Sprint)
      if (gp.buttons[8]?.pressed) dig = true; // Select/Back
      if (gp.buttons[12]?.pressed) sniff = true; // D-Pad Up
    }

    // Read virtual joystick
    const joystick = useGameStore.getState().joystick;
    if (playerIndex === 0 && joystick.active) {
      x += joystick.x;
      z += joystick.y;
    }

    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }

    const justBarked = bark && !prevBark.current;
    prevBark.current = bark;

    const justInteracted = interact && !prevInteract.current;
    prevInteract.current = interact;

    // We don't need to override justJumped here because it's handled in Dog.tsx, but let's keep it clean
    let finalJustJumped = jump && !prevJump.current;
    prevJump.current = jump;

    const justSat = sit && !prevSit.current;
    prevSit.current = sit;

    const justRolled = roll && !prevRoll.current;
    prevRoll.current = roll;

    const justPooped = poop && !prevPoop.current;
    prevPoop.current = poop;

    const justLayDown = lieDown && !prevLieDown.current;
    prevLieDown.current = lieDown;

    const justSniffed = sniff && !prevSniff.current;
    prevSniff.current = sniff;

    const justDug = dig && !prevDig.current;
    prevDig.current = dig;

    const justAte = eat && !prevEat.current;
    prevEat.current = eat;

    return { 
      x, z, 
      bark, justBarked, 
      interact, justInteracted, 
      jump, justJumped: finalJustJumped, 
      sit, justSat, 
      roll, justRolled, 
      poop, justPooped,
      lieDown, justLayDown,
      sniff, justSniffed,
      dig, justDug,
      eat, justAte,
      run
    };
  };
}
