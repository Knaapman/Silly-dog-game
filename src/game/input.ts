// Unified input: keyboard (two players), up to 4 gamepads and on-screen touch controls.
// pollInputs() runs once per frame; players read their frame with getInput(source).

export type SourceId = 'kb1' | 'kb2' | 'touch' | `pad${number}`;
export type ActionName = 'jump' | 'bonk' | 'lick' | 'noise' | 'flop' | 'species' | 'hat';
export const ACTIONS: ActionName[] = ['jump', 'bonk', 'lick', 'noise', 'flop', 'species', 'hat'];

export type InputFrame = {
  x: number;
  z: number;
  held: Record<ActionName, boolean>;
  pressed: Record<ActionName, boolean>;
  anyPressed: boolean;
};

type KeyMap = { up: string[]; down: string[]; left: string[]; right: string[]; actions: Record<ActionName, string[]> };

export const KEYMAPS: Record<'kb1' | 'kb2', KeyMap> = {
  kb1: {
    up: ['KeyW'],
    down: ['KeyS'],
    left: ['KeyA'],
    right: ['KeyD'],
    actions: {
      // WASD + Q/E/R/F, or the J/K/L/I "diamond" that mirrors a controller.
      jump: ['Space', 'KeyK'],
      bonk: ['KeyE', 'KeyL'],
      lick: ['KeyQ', 'KeyJ'],
      noise: ['KeyR', 'KeyI'],
      flop: ['KeyF', 'KeyU', 'KeyO'],
      species: ['Digit1', 'KeyC'],
      hat: ['Digit2', 'KeyX']
    }
  },
  kb2: {
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    actions: {
      jump: ['Enter', 'Numpad0'],
      bonk: ['ShiftRight', 'Numpad2'],
      lick: ['ControlRight', 'Numpad1'],
      noise: ['Slash', 'Numpad3'],
      flop: ['Period', 'NumpadDecimal'],
      species: ['Comma', 'Numpad7'],
      hat: ['KeyM', 'Numpad9']
    }
  }
};

// Standard gamepad layout: 0 bottom, 1 right, 2 left, 3 top face button.
const PAD_BUTTONS: Record<ActionName, number[]> = {
  jump: [0],
  bonk: [1],
  lick: [2],
  noise: [3],
  flop: [4, 5, 6, 7],
  species: [8],
  hat: [9]
};

const STICK_DEADZONE = 0.22;

const keysHeld = new Set<string>();
const keysPressed = new Set<string>();

const touch = {
  x: 0,
  z: 0,
  held: emptyActions(),
  pressed: new Set<ActionName>()
};

const prevPad = new Map<number, boolean[]>();
// Buttons seen down since the last frame. Sampled faster than the frame rate so a quick
// tap from a small hand is never lost, even when the game runs at a low frame rate.
const latchedPad = new Map<number, boolean[]>();
const frames = new Map<SourceId, InputFrame>();
export const NO_INPUT: InputFrame = { x: 0, z: 0, held: emptyActions(), pressed: emptyActions(), anyPressed: false };

function emptyActions(): Record<ActionName, boolean> {
  return { jump: false, bonk: false, lick: false, noise: false, flop: false, species: false, hat: false };
}

const PREVENT_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Slash', 'Enter']);

let installed = false;
let anyKeyListener: ((code: string) => void) | null = null;

function samplePads() {
  for (const gp of getConnectedPads()) {
    const latched = latchedPad.get(gp.index) ?? [];
    gp.buttons.forEach((b, i) => {
      if (b.pressed || b.value > 0.5) latched[i] = true;
    });
    latchedPad.set(gp.index, latched);
  }
}

export function installInput() {
  if (installed) return;
  installed = true;
  window.setInterval(samplePads, 8);
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    if (!e.repeat) {
      keysPressed.add(e.code);
      anyKeyListener?.(e.code);
    }
    keysHeld.add(e.code);
  });
  window.addEventListener('keyup', (e) => keysHeld.delete(e.code));
  window.addEventListener('blur', () => keysHeld.clear());
}

/** Forget key presses that were already handled outside the game loop (e.g. the title screen). */
export function consumeKeyPresses() {
  keysPressed.clear();
}

/** Called for every fresh key press (used by the title screen). */
export function onAnyKey(listener: ((code: string) => void) | null) {
  anyKeyListener = listener;
}

export function keyboardSourceForKey(code: string): 'kb1' | 'kb2' | null {
  for (const source of ['kb1', 'kb2'] as const) {
    const map = KEYMAPS[source];
    const all = [...map.up, ...map.down, ...map.left, ...map.right, ...Object.values(map.actions).flat()];
    if (all.includes(code)) return source;
  }
  return null;
}

export function setTouchStick(x: number, z: number) {
  touch.x = x;
  touch.z = z;
}

export function setTouchButton(action: ActionName, down: boolean) {
  if (down && !touch.held[action]) touch.pressed.add(action);
  touch.held[action] = down;
}

function readKeyboard(source: 'kb1' | 'kb2'): InputFrame {
  const map = KEYMAPS[source];
  const any = (codes: string[]) => codes.some((c) => keysHeld.has(c));
  const tapped = (codes: string[]) => codes.some((c) => keysPressed.has(c));
  let x = (any(map.right) ? 1 : 0) - (any(map.left) ? 1 : 0);
  let z = (any(map.down) ? 1 : 0) - (any(map.up) ? 1 : 0);
  const len = Math.hypot(x, z);
  if (len > 1) {
    x /= len;
    z /= len;
  }
  const held = emptyActions();
  const pressed = emptyActions();
  let anyPressed = tapped([...map.up, ...map.down, ...map.left, ...map.right]);
  for (const action of ACTIONS) {
    held[action] = any(map.actions[action]);
    pressed[action] = tapped(map.actions[action]);
    anyPressed ||= pressed[action];
  }
  return { x, z, held, pressed, anyPressed };
}

function readTouch(): InputFrame {
  const pressed = emptyActions();
  let anyPressed = false;
  touch.pressed.forEach((a) => {
    pressed[a] = true;
    anyPressed = true;
  });
  touch.pressed.clear();
  return { x: touch.x, z: touch.z, held: { ...touch.held }, pressed, anyPressed };
}

function readPad(gp: Gamepad): InputFrame {
  const now = gp.buttons.map((b) => b.pressed || b.value > 0.5);
  const latched = latchedPad.get(gp.index) ?? [];
  const buttons = now.map((down, i) => down || !!latched[i]);
  latchedPad.set(gp.index, []);
  const prev = prevPad.get(gp.index) ?? [];
  prevPad.set(gp.index, now);

  let x = gp.axes[0] ?? 0;
  let z = gp.axes[1] ?? 0;
  const mag = Math.hypot(x, z);
  if (mag < STICK_DEADZONE) {
    x = 0;
    z = 0;
  } else {
    const scaled = Math.min(1, (mag - STICK_DEADZONE) / (1 - STICK_DEADZONE));
    x = (x / mag) * scaled;
    z = (z / mag) * scaled;
  }
  // D-pad also moves: many small kids find it easier than the stick.
  const dx = (buttons[15] ? 1 : 0) - (buttons[14] ? 1 : 0);
  const dz = (buttons[13] ? 1 : 0) - (buttons[12] ? 1 : 0);
  if (dx !== 0 || dz !== 0) {
    const l = Math.hypot(dx, dz);
    x = dx / l;
    z = dz / l;
  }

  const held = emptyActions();
  const pressed = emptyActions();
  let anyPressed = false;
  for (const action of ACTIONS) {
    held[action] = PAD_BUTTONS[action].some((i) => buttons[i]);
    pressed[action] = PAD_BUTTONS[action].some((i) => buttons[i] && !prev[i]);
    anyPressed ||= pressed[action];
  }
  return { x, z, held, pressed, anyPressed };
}

export function getConnectedPads(): Gamepad[] {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
  return Array.from(navigator.getGamepads()).filter((g): g is Gamepad => !!g && g.connected);
}

/** Samples every input source. Returns the sources that pressed something this frame. */
export function pollInputs(): SourceId[] {
  const pressedSources: SourceId[] = [];
  frames.clear();

  for (const source of ['kb1', 'kb2'] as const) {
    const frame = readKeyboard(source);
    frames.set(source, frame);
    if (frame.anyPressed) pressedSources.push(source);
  }
  keysPressed.clear();

  const t = readTouch();
  frames.set('touch', t);
  if (t.anyPressed) pressedSources.push('touch');

  for (const gp of getConnectedPads()) {
    const source: SourceId = `pad${gp.index}`;
    const frame = readPad(gp);
    frames.set(source, frame);
    if (frame.anyPressed) pressedSources.push(source);
  }
  return pressedSources;
}

export function getInput(source: SourceId): InputFrame {
  return frames.get(source) ?? NO_INPUT;
}

export function isSourceConnected(source: SourceId) {
  if (!source.startsWith('pad')) return true;
  const index = Number(source.slice(3));
  return getConnectedPads().some((g) => g.index === index);
}

export function rumble(source: SourceId, strong: number, weak: number, durationMs: number) {
  if (!source.startsWith('pad')) return;
  const index = Number(source.slice(3));
  const gp = getConnectedPads().find((g) => g.index === index);
  const actuator = gp?.vibrationActuator as
    | { playEffect?: (type: string, params: Record<string, number>) => Promise<unknown> }
    | null
    | undefined;
  actuator?.playEffect?.('dual-rumble', { duration: durationMs, strongMagnitude: strong, weakMagnitude: weak })?.catch(() => {});
}
