import { vi } from 'vitest';

type FakeButton = { pressed: boolean; value: number };
export type FakePad = {
  index: number;
  id: string;
  connected: boolean;
  mapping: string;
  axes: number[];
  buttons: FakeButton[];
};

/**
 * Loads a fresh copy of the input module against fake gamepads, a fake clock and a manual
 * sampler (the 8 ms interval the real module installs).
 */
export async function loadInput(pads: (FakePad | null)[]) {
  let clock = 0;
  let sampler: (() => void) | null = null;
  vi.resetModules();
  vi.stubGlobal('performance', { now: () => clock });
  vi.stubGlobal('window', {
    addEventListener: () => {},
    setInterval: (fn: () => void) => {
      sampler = fn;
      return 1;
    }
  });
  vi.stubGlobal('navigator', { getGamepads: () => pads });
  const input = await import('../../src/game/input');
  input.installInput();
  return {
    input,
    /** Let this many ms pass, running the 8 ms sampler like the browser would. */
    tick(ms: number) {
      for (let t = 0; t < ms; t += 8) {
        clock += 8;
        sampler?.();
      }
    },
    frame(source = 'pad0') {
      input.pollInputs();
      return input.getInput(source as Parameters<typeof input.getInput>[0]);
    }
  };
}

export function standardPad(index = 0): FakePad {
  return { index, id: `Pad ${index}`, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
}

/** A Switch-style wired pad (HORIPAD) the browser doesn't recognise: DirectInput order, hat on axis 9. */
export function horiPad(index = 0): FakePad {
  return {
    index,
    id: 'HORIPAD S (Vendor: 0f0d Product: 00c1)',
    connected: true,
    mapping: '',
    axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1.2857],
    buttons: Array.from({ length: 14 }, () => ({ pressed: false, value: 0 }))
  };
}

export function press(pad: FakePad, button: number, down: boolean, value = down ? 1 : 0) {
  pad.buttons[button] = { pressed: value > 0.5, value };
}
