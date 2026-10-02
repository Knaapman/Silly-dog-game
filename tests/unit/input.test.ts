import { afterEach, describe, expect, it, vi } from 'vitest';
import { horiPad, loadInput, press, standardPad } from './fakePads';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('standard gamepad', () => {
  it('registers a tap that happens entirely between two frames', async () => {
    const pad = standardPad();
    const t = await loadInput([pad]);
    t.frame();
    press(pad, 0, true);
    t.tick(80);
    press(pad, 0, false);
    t.tick(80);
    expect(t.frame().pressed.jump).toBe(true);
  });

  it('reports a held button as pressed once, then held', async () => {
    const pad = standardPad();
    const t = await loadInput([pad]);
    t.frame();
    press(pad, 0, true);
    t.tick(20);
    const first = t.frame();
    t.tick(20);
    const second = t.frame();
    expect(first.pressed.jump).toBe(true);
    expect(second.pressed.jump).toBe(false);
    expect(second.held.jump).toBe(true);
  });

  it('maps face buttons, bumpers and triggers', async () => {
    const pad = standardPad();
    const t = await loadInput([pad]);
    const expectations: [number, keyof ReturnType<typeof t.frame>['pressed']][] = [
      [0, 'jump'],
      [1, 'bonk'],
      [2, 'lick'],
      [3, 'noise'],
      [4, 'flop'],
      [5, 'flop'],
      [6, 'poop'],
      [7, 'poop']
    ];
    t.frame();
    for (const [button, action] of expectations) {
      press(pad, button, true);
      t.tick(40);
      expect(t.frame().pressed[action], `button ${button}`).toBe(true);
      press(pad, button, false);
      t.tick(40);
      t.frame();
    }
  });

  it('only counts a trigger past halfway', async () => {
    const pad = standardPad();
    const t = await loadInput([pad]);
    t.frame();
    press(pad, 6, true, 0.3);
    t.tick(40);
    expect(t.frame().pressed.poop).toBe(false);
    press(pad, 6, true, 0.8);
    t.tick(40);
    expect(t.frame().pressed.poop).toBe(true);
  });

  it('Start: tap changes hat, hold opens the menu once and does not change hat', async () => {
    const pad = standardPad();
    const t = await loadInput([pad]);
    t.frame();
    press(pad, 9, true);
    t.tick(100);
    expect(t.frame().pressed.hat).toBe(false); // not yet: taps fire on release
    press(pad, 9, false);
    t.tick(40);
    expect(t.frame().pressed.hat).toBe(true);

    press(pad, 9, true);
    t.tick(500);
    expect(t.frame().menu).toBeFalsy();
    t.tick(500);
    expect(t.frame().menu).toBe(true);
    t.tick(200);
    expect(t.frame().menu).toBeFalsy();
    press(pad, 9, false);
    t.tick(40);
    expect(t.frame().pressed.hat).toBe(false);
  });

  it('Select: tap changes animal, hold leaves', async () => {
    const pad = standardPad();
    const t = await loadInput([pad]);
    t.frame();
    press(pad, 8, true);
    t.tick(100);
    t.frame();
    press(pad, 8, false);
    t.tick(20);
    expect(t.frame().pressed.species).toBe(true);
    press(pad, 8, true);
    t.tick(1600);
    expect(t.frame().leave).toBe(true);
    press(pad, 8, false);
    t.tick(20);
    expect(t.frame().pressed.species).toBe(false);
  });

  it('menu navigation counts every D-pad press between frames', async () => {
    const pad = standardPad();
    const t = await loadInput([pad]);
    const navs: string[] = [];
    const off = t.input.onUiNav((n) => navs.push(n));
    t.frame();
    for (let k = 0; k < 3; k += 1) {
      press(pad, 14, true);
      t.tick(60);
      press(pad, 14, false);
      t.tick(60);
    }
    t.frame();
    off();
    expect(navs.filter((n) => n === 'left')).toHaveLength(3);
  });
});

describe('Switch-style pad in DirectInput order (HORIPAD)', () => {
  const cases: [number, string][] = [
    [1, 'jump'], // B, bottom
    [2, 'bonk'], // A, right
    [0, 'lick'], // Y, left
    [3, 'noise'], // X, top
    [4, 'flop'], // L
    [6, 'poop'], // ZL
    [7, 'poop'] // ZR
  ];
  it.each(cases)('raw button %i -> %s', async (raw, action) => {
    const pad = horiPad();
    const t = await loadInput([pad]);
    t.frame();
    press(pad, raw, true);
    t.tick(40);
    expect(t.frame().pressed[action as 'jump']).toBe(true);
  });

  it('Home and Capture do nothing (they used to read as D-pad up/down)', async () => {
    const pad = horiPad();
    const t = await loadInput([pad]);
    t.frame();
    for (const raw of [12, 13]) {
      press(pad, raw, true);
      t.tick(40);
      const f = t.frame();
      expect(f.x).toBe(0);
      expect(f.z).toBe(0);
      expect(Object.values(f.pressed).some(Boolean)).toBe(false);
      press(pad, raw, false);
      t.tick(40);
      t.frame();
    }
  });

  it('reads the D-pad from the hat axis', async () => {
    const pad = horiPad();
    const t = await loadInput([pad]);
    pad.axes[9] = -1; // up
    t.tick(20);
    expect(t.frame()).toMatchObject({ x: 0, z: -1 });
    pad.axes[9] = -0.428; // right
    t.tick(20);
    expect(t.frame().x).toBeCloseTo(1);
    pad.axes[9] = 1.2857; // released
    t.tick(20);
    expect(t.frame()).toMatchObject({ x: 0, z: 0 });
  });

  it('menu: bottom confirms, right goes back', async () => {
    const pad = horiPad();
    const t = await loadInput([pad]);
    const navs: string[] = [];
    const off = t.input.onUiNav((n) => navs.push(n));
    t.frame();
    for (const raw of [1, 2]) {
      press(pad, raw, true);
      t.tick(40);
      t.frame();
      press(pad, raw, false);
      t.tick(40);
      t.frame();
    }
    off();
    expect(navs).toEqual(['confirm', 'back']);
  });
});

describe('keyboard maps', () => {
  it('never binds the same key twice', async () => {
    const t = await loadInput([]);
    const all: string[] = [];
    for (const map of Object.values(t.input.KEYMAPS)) all.push(...map.up, ...map.down, ...map.left, ...map.right, ...Object.values(map.actions).flat());
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('press counting', () => {
  it('counts every trigger press between two slow frames (mashing poop)', async () => {
    const pad = standardPad();
    const t = await loadInput([pad]);
    t.frame();
    for (let i = 0; i < 3; i += 1) {
      press(pad, 7, true);
      t.tick(24);
      press(pad, 7, false);
      t.tick(24);
    }
    const f = t.frame();
    expect(f.pressed.poop).toBe(true);
    expect(f.presses.poop).toBe(3);
    expect(t.frame().presses.poop).toBe(0);
  });

  it('counts keyboard presses too', async () => {
    const t = await loadInput([]);
    t.frame('kb1');
    t.key('KeyG', true);
    t.key('KeyG', false);
    t.key('KeyP', true);
    t.key('KeyP', false);
    expect(t.frame('kb1').presses.poop).toBe(2);
  });

  it('a Start tap counts as one hat press', async () => {
    const pad = standardPad();
    const t = await loadInput([pad]);
    t.frame();
    press(pad, 9, true);
    t.tick(100);
    t.frame();
    press(pad, 9, false);
    t.tick(16);
    expect(t.frame().presses.hat).toBe(1);
  });
});

describe('camera button', () => {
  it('Capture takes a photo on a Switch pad the browser recognises', async () => {
    const pad = standardPad();
    const t = await loadInput([pad]);
    t.frame();
    press(pad, 17, true);
    t.tick(40);
    t.frame();
    expect(t.input.photoPressed()).toBe(true);
    t.tick(40);
    t.frame();
    expect(t.input.photoPressed()).toBe(false);
  });

  it('Capture takes a photo on a HORIPAD (DirectInput button 13), and does not join', async () => {
    const pad = horiPad();
    const t = await loadInput([pad]);
    t.frame();
    press(pad, 13, true);
    t.tick(40);
    const pressedSources = t.input.pollInputs();
    expect(t.input.photoPressed()).toBe(true);
    expect(pressedSources).toEqual([]);
  });

  it('T takes a photo from the keyboard', async () => {
    const t = await loadInput([]);
    t.frame('kb1');
    t.key('KeyT', true);
    t.frame('kb1');
    expect(t.input.photoPressed()).toBe(true);
  });
});

describe('rumble', () => {
  it('can be switched off', async () => {
    const pad = standardPad();
    const playEffect = vi.fn(() => Promise.resolve());
    (pad as unknown as { vibrationActuator: unknown }).vibrationActuator = { playEffect };
    const t = await loadInput([pad]);
    t.input.rumble('pad0', 1, 1, 100);
    expect(playEffect).toHaveBeenCalledTimes(1);
    t.input.setRumbleEnabled(false);
    t.input.rumble('pad0', 1, 1, 100);
    expect(playEffect).toHaveBeenCalledTimes(1);
  });
});

describe('"I\'m stuck" chord', () => {
  it('needs all four shoulder buttons together (L, R, ZL, ZR), on a standard pad and a HORIPAD', async () => {
    for (const pad of [standardPad(), horiPad()]) {
      const t = await loadInput([pad]);
      t.frame();
      for (const b of [4, 5, 6]) press(pad, b, true);
      t.tick(40);
      expect(t.frame().rescue, pad.id).toBe(false);
      press(pad, 7, true);
      t.tick(40);
      expect(t.frame().rescue, pad.id).toBe(true);
      press(pad, 5, false);
      t.tick(40);
      expect(t.frame().rescue, pad.id).toBe(false);
    }
  });

  it('flop and poop together on a keyboard', async () => {
    const t = await loadInput([]);
    t.key('KeyF', true);
    expect(t.frame('kb1').rescue).toBe(false);
    t.key('KeyG', true);
    expect(t.frame('kb1').rescue).toBe(true);
    expect(t.frame('kb2').rescue).toBe(false);
  });
});
