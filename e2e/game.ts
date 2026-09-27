import { expect, type Page } from '@playwright/test';

type Vec = { x: number; y: number; z: number };
export type PlayerState = { x: number; y: number; z: number; belly: number; power: string | null; size: number; ridingOn: number | null; flopped: boolean; launched: boolean; grabbedBy: number | null };

/**
 * Drives the game in test mode. Every helper steps the simulation explicitly, so a test reads
 * like a script: "put the dog here, press lick, wait half a second, check the belly".
 */
export class Game {
  errors: string[] = [];
  constructor(readonly page: Page) {
    page.on('pageerror', (e) => this.errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') this.errors.push(m.text());
    });
  }

  /** Fake controllers: call before open(). */
  async withPads() {
    await this.page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      const pads: (Record<string, unknown> | null)[] = [null, null, null, null];
      w.__pads = pads;
      w.__addPad = (i: number, mapping = 'standard', id = `Pad ${i}`) => {
        pads[i] = { index: i, id, connected: true, mapping, axes: mapping === 'standard' ? [0, 0, 0, 0] : [0, 0, 0, 0, 0, 0, 0, 0, 0, 1.2857], buttons: Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 })), vibrationActuator: null };
      };
      w.__unplug = (i: number) => {
        pads[i] = null;
      };
      w.__press = (i: number, b: number, down: boolean) => {
        const pad = pads[i] as { buttons: unknown[] } | null;
        if (pad) pad.buttons[b] = { pressed: down, touched: down, value: down ? 1 : 0 };
      };
      navigator.getGamepads = () => pads.slice() as unknown as (Gamepad | null)[];
    });
  }

  async open(seed = 1) {
    await this.page.goto(`/?test=${seed}`);
    await this.page.waitForFunction(() => typeof (window as unknown as { __silly?: { step?: unknown } }).__silly?.step === 'function', null, { timeout: 60_000 });
    // The physics engine loads asynchronously and the park mounts after it: wait until the
    // world is populated (props registered, star and food spots in place) before stepping.
    await this.page.waitForFunction(() => {
      const r = (window as any).__silly.runtime;
      return r.props.size > 50 && r.foods.size > 10 && r.statics.size > 10;
    }, null, { timeout: 60_000 });
    await this.seconds(0.2);
  }

  /** Start playing as the first keyboard player and let the animal land. */
  async start(source = 'kb1') {
    await this.page.evaluate((s) => (window as any).__silly.useGame.getState().start(s), source);
    await this.seconds(1.5);
  }

  async join(source: string) {
    await this.page.evaluate((s) => (window as any).__silly.useGame.getState().join(s), source);
    await this.seconds(1.5);
  }

  /** Advance the game by this many seconds of game time (60 frames per second). */
  async seconds(s: number, render = false) {
    await this.page.evaluate(([frames, r]) => (window as any).__silly.step(frames, r), [Math.round(s * 60), render] as const);
  }

  async screenshot(path: string) {
    await this.page.evaluate(() => (window as any).__silly.step(1, true));
    await this.page.screenshot({ path });
  }

  player(slot = 0): Promise<PlayerState> {
    return this.page.evaluate((slot) => {
      const p = (window as any).__silly.runtime.players.get(slot);
      return { x: p.position.x, y: p.position.y, z: p.position.z, belly: p.belly, power: p.power, size: p.size, ridingOn: p.ridingOn, flopped: p.flopped, launched: p.isLaunched(), grabbedBy: p.grabbedBy };
    }, slot);
  }

  /** Put an animal somewhere; `y` is the height above the ground there (the ground rolls). */
  async teleport(slot: number, x: number, y: number, z: number) {
    await this.page.evaluate(
      ([slot, x, y, z]) => {
        const s = (window as any).__silly;
        const b = s.runtime.players.get(slot).getBody();
        b.setTranslation({ x, y: y + s.terrain.groundHeight(x, z), z }, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      },
      [slot, x, y, z]
    );
  }

  /** Hop from `from` to land at `to`, facing the way we flew (a reliable way to face something). */
  async hopTo(slot: number, from: [number, number], to: [number, number]) {
    await this.teleport(slot, from[0], 1, from[1]);
    await this.seconds(0.5);
    await this.page.evaluate(([slot, x, z]) => (window as any).__silly.runtime.players.get(slot).launchTo({ x, y: (window as any).__silly.terrain.groundHeight(x, z), z, clone() { return this; } }, 2.2), [slot, to[0], to[1]] as const);
    for (let i = 0; i < 40; i += 1) {
      await this.seconds(0.1);
      const p = await this.player(slot);
      if (!p.launched && p.y < 1.2) break;
    }
    await this.seconds(0.3);
  }

  /** Tap a keyboard key (one frame down, then up). */
  async tap(code: string) {
    await this.page.keyboard.down(code);
    await this.seconds(1 / 60);
    await this.page.keyboard.up(code);
    await this.seconds(1 / 60);
  }

  async hold(code: string, seconds: number) {
    await this.page.keyboard.down(code);
    await this.seconds(seconds);
    await this.page.keyboard.up(code);
  }

  async pad(i: number, button: number, seconds = 0.1) {
    await this.page.evaluate(([i, b]) => (window as any).__press(i, b, true), [i, button] as const);
    await this.seconds(seconds);
    await this.page.evaluate(([i, b]) => (window as any).__press(i, b, false), [i, button] as const);
    await this.seconds(1 / 60);
  }

  poopStats(): Promise<{ poops: number; flowers: number }> {
    return this.page.evaluate(() => (window as any).__silly.runtime.debugInfo.poopStats());
  }

  props(kind: string): Promise<Vec[]> {
    return this.page.evaluate(
      (kind) =>
        [...(window as any).__silly.runtime.props.values()]
          .filter((p: any) => p.kind === kind && p.enabled)
          .map((p: any) => {
            const t = p.getBody().translation();
            return { x: t.x, y: t.y, z: t.z };
          }),
      kind
    );
  }

  state<T>(fn: string): Promise<T> {
    return this.page.evaluate((src) => new Function('g', `return (${src})(g)`)((window as any).__silly.useGame.getState()), fn);
  }

  /** Track the highest y of a player while the game runs for `seconds`. */
  async maxY(slot: number, seconds: number) {
    let best = -Infinity;
    for (let i = 0; i < Math.ceil(seconds / 0.1); i += 1) {
      await this.seconds(0.1);
      best = Math.max(best, (await this.player(slot)).y);
    }
    return best;
  }

  expectNoErrors() {
    expect(this.errors, this.errors.join('\n')).toEqual([]);
  }
}
