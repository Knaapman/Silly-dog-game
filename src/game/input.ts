// Unified input: keyboard (two players), up to 4 gamepads and on-screen touch controls.
// pollInputs() runs once per frame; players read their frame with getInput(source).

export type SourceId = 'kb1' | 'kb2' | 'touch' | `pad${number}`;
export type ActionName = 'jump' | 'bonk' | 'lick' | 'noise' | 'flop' | 'poop' | 'species' | 'hat';
export const ACTIONS: ActionName[] = ['jump', 'bonk', 'lick', 'noise', 'flop', 'poop', 'species', 'hat'];

export type InputFrame = {
  x: number;
  z: number;
  held: Record<ActionName, boolean>;
  pressed: Record<ActionName, boolean>;
  anyPressed: boolean;
  /** Controller only: Start held long enough to open the grown-ups menu. */
  menu?: boolean;
  /** Controller only: Select held long enough to leave the game. */
  leave?: boolean;
};

/** Directional / confirm / back events for navigating menus with a controller. */
export type UiNav = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back';

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
      poop: ['KeyG', 'KeyP'],
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
      poop: ['Quote', 'Numpad5'],
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
  // bumpers flop, triggers poop (big, easy buttons for small hands)
  flop: [4, 5],
  poop: [6, 7],
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

// Buttons seen down since the last frame. Sampled faster than the frame rate so a quick
// tap from a small hand is never lost, even when the game runs at a low frame rate.
// Sampled faster than the frame rate: counts every press so quick taps (or several taps
// between two slow frames on an old tablet) are never lost.
const sampledPad = new Map<number, boolean[]>();
const pressEdges = new Map<number, number[]>();
const frames = new Map<SourceId, InputFrame>();
export const NO_INPUT: InputFrame = { x: 0, z: 0, held: emptyActions(), pressed: emptyActions(), anyPressed: false };

// Start / Select do two things: a tap changes hat / animal, a long hold opens the menu / leaves.
const TAP_MS = 550;
const MENU_HOLD_MS = 900;
const LEAVE_HOLD_MS = 1500;
const holdStart = new Map<string, number>();
/** When the sampler first saw each button go down (per pad), so holds are timed from the real press. */
const pressedAt = new Map<number, number[]>();
const holdFired = new Set<string>();
const prevNav = new Map<number, { dir: string }>();
const navListeners = new Set<(nav: UiNav) => void>();

export function onUiNav(listener: (nav: UiNav) => void) {
  navListeners.add(listener);
  return () => {
    navListeners.delete(listener);
  };
}

function emptyActions(): Record<ActionName, boolean> {
  return { jump: false, bonk: false, lick: false, noise: false, flop: false, poop: false, species: false, hat: false };
}

const PREVENT_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Slash', 'Enter', 'Quote']);

/** Clock for Start/Select hold timing: wall time normally, simulated time in test mode. */
let inputNow = () => performance.now();
export function setInputClock(now: () => number) {
  inputNow = now;
}
/** Current time on the input clock (ms). */
export function inputTime() {
  return inputNow();
}

let installed = false;
let anyKeyListener: ((code: string) => void) | null = null;

// Pads the browser doesn't recognise ("non-standard" mapping) report their buttons in
// DirectInput order: HORIPAD / other Switch-style wired pads, generic USB pads and PlayStation
// pads in D-mode all use left, bottom, right, top, L, R, ZL, ZR, -, +, LS, RS, Home, Capture,
// with the D-pad on a hat axis. Translate that to standard positions so "bottom = jump" holds
// whatever letters are printed on the buttons.
const DINPUT_TO_STANDARD = [1, 2, 0, 3, 4, 5, 6, 7, 8, 9, 10, 11, -1, -1, -1, -1, 12];

/** Button states in standard-gamepad order (0 bottom, 1 right, 2 left, 3 top, ...). */
function padButtons(gp: Gamepad): boolean[] {
  const raw = gp.buttons.map((b) => b.pressed || b.value > 0.5);
  if (gp.mapping === 'standard') return raw;
  return DINPUT_TO_STANDARD.map((i) => i >= 0 && !!raw[i]);
}

function samplePads() {
  for (const gp of getConnectedPads()) {
    const last = sampledPad.get(gp.index) ?? [];
    const downs = pressEdges.get(gp.index) ?? [];
    const cur = padButtons(gp);
    const times = pressedAt.get(gp.index) ?? [];
    cur.forEach((d, i) => {
      if (d && !last[i]) {
        downs[i] = (downs[i] ?? 0) + 1;
        times[i] = inputNow();
      }
    });
    pressedAt.set(gp.index, times);
    sampledPad.set(gp.index, cur);
    pressEdges.set(gp.index, downs);
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

/**
 * D-pad for controllers without the "standard" mapping: many report it on axes 6/7, and
 * DirectInput pads report a single hat axis (usually 9) that steps from -1 (up) clockwise.
 */
function hatDirection(gp: Gamepad): [number, number] {
  if (gp.mapping === 'standard') return [0, 0];
  const hat = gp.axes.length > 9 ? gp.axes[9] : undefined;
  if (hat != null && hat >= -1.05 && hat <= 1.05) {
    const step = Math.round(((hat + 1) / 2) * 7);
    const dirs: [number, number][] = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
    return dirs[Math.max(0, Math.min(7, step))];
  }
  if (gp.axes.length >= 8) {
    const hx = gp.axes[6];
    const hz = gp.axes[7];
    return [Math.abs(hx) > 0.5 ? Math.sign(hx) : 0, Math.abs(hz) > 0.5 ? Math.sign(hz) : 0];
  }
  return [0, 0];
}

function readPad(gp: Gamepad): InputFrame {
  const now = padButtons(gp);
  const downs = pressEdges.get(gp.index) ?? [];
  pressEdges.set(gp.index, []);
  const tapped = (i: number) => (downs[i] ?? 0) > 0;
  // Held this frame, or pressed-and-released since the last one.
  const buttons = now.map((down, i) => down || tapped(i));
  const clock = inputNow();

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
  const [hx, hz] = hatDirection(gp);
  const dx = (buttons[15] ? 1 : 0) - (buttons[14] ? 1 : 0) + hx;
  const dz = (buttons[13] ? 1 : 0) - (buttons[12] ? 1 : 0) + hz;
  if (dx !== 0 || dz !== 0) {
    const l = Math.hypot(dx, dz);
    x = dx / l;
    z = dz / l;
  }

  const held = emptyActions();
  const pressed = emptyActions();
  let anyPressed = false;
  for (const action of ACTIONS) {
    if (action === 'species' || action === 'hat') continue;
    held[action] = PAD_BUTTONS[action].some((i) => now[i]);
    pressed[action] = PAD_BUTTONS[action].some((i) => tapped(i));
    anyPressed ||= pressed[action];
  }
  if ([12, 13, 14, 15].some(tapped)) anyPressed = true;

  // Select (8) / Start (9): tap on release, or a long hold.
  let menu = false;
  let leave = false;
  for (const [button, action, holdMs] of [
    [8, 'species', LEAVE_HOLD_MS],
    [9, 'hat', MENU_HOLD_MS]
  ] as const) {
    const key = `${gp.index}:${button}`;
    if (tapped(button)) {
      if (!holdStart.has(key)) holdFired.delete(key);
      holdStart.set(key, pressedAt.get(gp.index)?.[button] ?? clock);
      anyPressed = true;
    }
    const since = holdStart.has(key) ? clock - holdStart.get(key)! : 0;
    if (now[button] && since >= holdMs && !holdFired.has(key)) {
      holdFired.add(key);
      if (button === 9) menu = true;
      else leave = true;
    }
    if (!now[button] && holdStart.has(key)) {
      if (since < TAP_MS && !holdFired.has(key)) pressed[action] = true;
      holdStart.delete(key);
      holdFired.delete(key);
    }
    held[action] = now[button];
  }
  navEdges.set(gp.index, downs);
  return { x, z, held, pressed, anyPressed, menu, leave };
}

const navEdges = new Map<number, number[]>();

/** Menu navigation from every controller: edges on D-pad/stick, A = confirm, B/Start = back. */
function readPadNav(gp: Gamepad) {
  const edges = navEdges.get(gp.index) ?? [];
  const count = (i: number) => edges[i] ?? 0;
  const prev = prevNav.get(gp.index) ?? { dir: '' };
  // Analog stick: one step per push.
  const sx = gp.axes[0] ?? 0;
  const sz = gp.axes[1] ?? 0;
  let dir = '';
  if (Math.abs(sx) > 0.6 || Math.abs(sz) > 0.6) {
    dir = Math.abs(sx) > Math.abs(sz) ? (sx > 0 ? 'right' : 'left') : sz > 0 ? 'down' : 'up';
  }
  prevNav.set(gp.index, { dir });
  if (navListeners.size === 0) return;
  const emit = (nav: UiNav, times = 1) => {
    for (let k = 0; k < times; k += 1) navListeners.forEach((l) => l(nav));
  };
  if (dir && dir !== prev.dir) emit(dir as UiNav);
  // D-pad: every press counts, even several between two slow frames.
  emit('up', count(12));
  emit('down', count(13));
  emit('left', count(14));
  emit('right', count(15));
  if (count(0) > 0) emit('confirm');
  if (count(1) > 0 || count(9) > 0) {
    // Closing the menu with Start must not also count as a "change hat" tap.
    if (count(9) > 0) holdFired.add(`${gp.index}:9`);
    emit('back');
  }
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

  samplePads();
  for (const gp of getConnectedPads()) {
    const source: SourceId = `pad${gp.index}`;
    const frame = readPad(gp);
    frames.set(source, frame);
    if (frame.anyPressed) pressedSources.push(source);
    readPadNav(gp);
  }
  return pressedSources;
}

export function padIdOf(source: SourceId) {
  if (!source.startsWith('pad')) return undefined;
  const index = Number(source.slice(3));
  return getConnectedPads().find((g) => g.index === index)?.id;
}

export function rumbleAll(sources: SourceId[], strong: number, weak: number, durationMs: number) {
  sources.forEach((s) => rumble(s, strong, weak, durationMs));
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
