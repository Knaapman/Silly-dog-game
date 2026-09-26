import { seededRandom } from './clock';
import type { Species } from './config';

// Everything is synthesised with Web Audio: no asset downloads, works offline.

export type AudioCategory = 'ui' | 'action' | 'world' | 'reward' | 'music';

type Vec3Like = { x: number; y: number; z: number };
export type AudioPosition = [number, number, number] | Vec3Like;

type ChannelOptions = { position?: AudioPosition; gain?: number };

const CATEGORY_GAIN: Record<AudioCategory, number> = {
  ui: 0.8,
  action: 1,
  world: 0.85,
  reward: 1,
  music: 0.55
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let buses: Record<AudioCategory, GainNode> | null = null;
let noiseBuffer: AudioBuffer | null = null;
let activeVoices = 0;
const MAX_VOICES = 48;

const settings = { muted: false, music: true, volume: 0.85 };
const listeners = new Set<() => void>();

// Sounds get their own dice. Whether a sound plays depends on real time (throttling, voice
// limits), so sharing the game's random numbers would make the game itself unrepeatable.
const random = seededRandom(0x5111);
const rand = (min: number, max: number) => random() * (max - min) + min;

function toXYZ(p: AudioPosition) {
  return Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : p;
}

function getCtx() {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 4;
    master.connect(compressor);
    compressor.connect(ctx.destination);
    buses = {
      ui: ctx.createGain(),
      action: ctx.createGain(),
      world: ctx.createGain(),
      reward: ctx.createGain(),
      music: ctx.createGain()
    };
    (Object.keys(buses) as AudioCategory[]).forEach((key) => {
      buses![key].gain.value = CATEGORY_GAIN[key];
      buses![key].connect(master!);
    });
    const n = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = n.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = random() * 2 - 1;
    noiseBuffer = n;
    applyMix();
    ctx.addEventListener('statechange', emit);
  }
  return ctx;
}

function applyMix() {
  if (!ctx || !master || !buses) return;
  master.gain.setTargetAtTime(settings.muted ? 0 : settings.volume, ctx.currentTime, 0.02);
  buses.music.gain.setTargetAtTime(settings.music ? CATEGORY_GAIN.music : 0, ctx.currentTime, 0.2);
}

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeAudio(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAudioState() {
  return { ...settings, running: ctx?.state === 'running' };
}

/** Must be called from a real user gesture (click, tap, key) — gamepad presses don't count. */
export function unlockAudio() {
  const c = getCtx();
  if (c && c.state !== 'running') void c.resume().then(emit);
}

export function setMuted(muted: boolean) {
  settings.muted = muted;
  applyMix();
  emit();
}

export function setMusicEnabled(enabled: boolean) {
  settings.music = enabled;
  applyMix();
  emit();
}

export function setVolume(volume: number) {
  settings.volume = Math.min(1, Math.max(0, volume));
  applyMix();
  emit();
}

export function getBus(category: AudioCategory) {
  const c = getCtx();
  if (!c || !buses) return null;
  return { ctx: c, bus: buses[category] };
}

export function updateListener(focus: AudioPosition) {
  if (!ctx) return;
  const { x, y, z } = toXYZ(focus);
  const l = ctx.listener;
  const t = ctx.currentTime;
  if (l.positionX) {
    l.positionX.setTargetAtTime(x, t, 0.05);
    l.positionY.setTargetAtTime(y + 7, t, 0.05);
    l.positionZ.setTargetAtTime(z + 9, t, 0.05);
    l.forwardX.setValueAtTime(0, t);
    l.forwardY.setValueAtTime(-0.6, t);
    l.forwardZ.setValueAtTime(-0.8, t);
    l.upX.setValueAtTime(0, t);
    l.upY.setValueAtTime(1, t);
    l.upZ.setValueAtTime(0, t);
  } else {
    l.setPosition(x, y + 7, z + 9);
  }
}

// ---------------------------------------------------------------------------
// Voice helper: one short-lived node graph per sound.

type ToneSpec = {
  type?: OscillatorType;
  from: number;
  to?: number;
  at?: number;
  dur: number;
  gain: number;
  attack?: number;
  glide?: 'exp' | 'lin';
  vibrato?: [number, number];
  tremolo?: [number, number];
  filter?: { type: BiquadFilterType; freq: number; q?: number };
};

type NoiseSpec = {
  at?: number;
  dur: number;
  gain: number;
  attack?: number;
  filter: { type: BiquadFilterType; freq: number; to?: number; q?: number };
  wobble?: [number, number];
};

function voice(category: AudioCategory, options: ChannelOptions = {}) {
  const c = getCtx();
  if (!c || !buses || c.state !== 'running' || settings.muted || activeVoices >= MAX_VOICES) return null;
  activeVoices += 1;
  const input = c.createGain();
  input.gain.value = options.gain ?? 1;
  const nodes: AudioNode[] = [input];
  if (options.position) {
    const p = toXYZ(options.position);
    const panner = c.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = 14;
    panner.maxDistance = 120;
    panner.rolloffFactor = 1;
    if (panner.positionX) {
      panner.positionX.value = p.x;
      panner.positionY.value = p.y;
      panner.positionZ.value = p.z;
    } else {
      panner.setPosition(p.x, p.y, p.z);
    }
    input.connect(panner);
    panner.connect(buses[category]);
    nodes.push(panner);
  } else {
    input.connect(buses[category]);
  }
  const now = c.currentTime + 0.005;
  let end = now;

  const envelope = (g: GainNode, t0: number, attack: number, dur: number, peak: number) => {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  };

  const lfo = (target: AudioParam, rate: number, depth: number, t0: number, dur: number) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.value = rate;
    g.gain.value = depth;
    o.connect(g);
    g.connect(target);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    nodes.push(o, g);
  };

  return {
    now,
    tone(spec: ToneSpec) {
      const t0 = now + (spec.at ?? 0);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = spec.type ?? 'sine';
      o.frequency.setValueAtTime(spec.from, t0);
      if (spec.to != null) {
        if (spec.glide === 'lin') o.frequency.linearRampToValueAtTime(spec.to, t0 + spec.dur);
        else o.frequency.exponentialRampToValueAtTime(Math.max(1, spec.to), t0 + spec.dur);
      }
      envelope(g, t0, spec.attack ?? 0.01, spec.dur, spec.gain);
      let last: AudioNode = o;
      if (spec.filter) {
        const f = c.createBiquadFilter();
        f.type = spec.filter.type;
        f.frequency.value = spec.filter.freq;
        f.Q.value = spec.filter.q ?? 1;
        o.connect(f);
        last = f;
        nodes.push(f);
      }
      last.connect(g);
      g.connect(input);
      if (spec.vibrato) lfo(o.frequency, spec.vibrato[0], spec.vibrato[1], t0, spec.dur);
      if (spec.tremolo) lfo(g.gain, spec.tremolo[0], spec.gain * spec.tremolo[1], t0, spec.dur);
      o.start(t0);
      o.stop(t0 + spec.dur + 0.02);
      nodes.push(o, g);
      end = Math.max(end, t0 + spec.dur);
    },
    noise(spec: NoiseSpec) {
      if (!noiseBuffer) return;
      const t0 = now + (spec.at ?? 0);
      const src = c.createBufferSource();
      src.buffer = noiseBuffer;
      const f = c.createBiquadFilter();
      f.type = spec.filter.type;
      f.frequency.setValueAtTime(spec.filter.freq, t0);
      if (spec.filter.to) f.frequency.exponentialRampToValueAtTime(spec.filter.to, t0 + spec.dur);
      f.Q.value = spec.filter.q ?? 0.8;
      const g = c.createGain();
      envelope(g, t0, spec.attack ?? 0.005, spec.dur, spec.gain);
      src.connect(f);
      f.connect(g);
      g.connect(input);
      if (spec.wobble) lfo(f.frequency, spec.wobble[0], spec.wobble[1], t0, spec.dur);
      src.start(t0, random() * Math.max(0, noiseBuffer.duration - spec.dur - 0.05));
      src.stop(t0 + spec.dur + 0.02);
      nodes.push(src, f, g);
      end = Math.max(end, t0 + spec.dur);
    },
    finish() {
      const ms = (end - c.currentTime) * 1000 + 120;
      window.setTimeout(() => {
        nodes.forEach((n) => n.disconnect());
        activeVoices -= 1;
      }, Math.max(0, ms));
    }
  };
}

const lastPlayed = new Map<string, number>();
function throttled(key: string, ms: number) {
  const now = performance.now();
  if (now - (lastPlayed.get(key) ?? 0) < ms) return true;
  lastPlayed.set(key, now);
  return false;
}

// ---------------------------------------------------------------------------
// Animal noises

export function playAnimalNoise(species: Species, position?: AudioPosition) {
  const v = voice('action', { position });
  if (!v) return;
  const p = rand(0.92, 1.1);
  if (species === 'dog') {
    const barks = random() < 0.4 ? 2 : 1;
    for (let i = 0; i < barks; i += 1) {
      const at = i * 0.17;
      v.tone({ type: 'square', from: 420 * p, to: 140 * p, at, dur: 0.16, gain: 0.16, filter: { type: 'lowpass', freq: 1800 } });
      v.tone({ type: 'triangle', from: 110 * p, to: 50, at, dur: 0.14, gain: 0.12 });
      v.noise({ at, dur: 0.05, gain: 0.06, filter: { type: 'bandpass', freq: 1400 } });
    }
  } else if (species === 'goat') {
    // "meh-eh-eh-eh"
    v.tone({ type: 'sawtooth', from: 540 * p, to: 470 * p, dur: 0.62, gain: 0.14, attack: 0.03, tremolo: [11, 0.85], vibrato: [11, 18], filter: { type: 'bandpass', freq: 1100, q: 1.4 } });
    v.tone({ type: 'sawtooth', from: 270 * p, to: 235 * p, dur: 0.62, gain: 0.08, attack: 0.03, tremolo: [11, 0.85], filter: { type: 'bandpass', freq: 700, q: 2 } });
  } else if (species === 'pig') {
    for (let i = 0; i < 2; i += 1) {
      const at = i * 0.16;
      v.tone({ type: 'square', from: 260 * p, to: 150 * p, at, dur: 0.13, gain: 0.14, filter: { type: 'bandpass', freq: 900, q: 3 } });
      v.noise({ at, dur: 0.12, gain: 0.08, filter: { type: 'lowpass', freq: 500 }, wobble: [40, 200] });
    }
  } else {
    // "baaaa"
    v.tone({ type: 'sawtooth', from: 330 * p, to: 300 * p, dur: 0.8, gain: 0.13, attack: 0.05, vibrato: [6, 14], tremolo: [7, 0.4], filter: { type: 'bandpass', freq: 950, q: 1.2 } });
    v.tone({ type: 'sawtooth', from: 660 * p, to: 600 * p, dur: 0.8, gain: 0.05, attack: 0.05, vibrato: [6, 20], filter: { type: 'bandpass', freq: 1500, q: 2 } });
  }
  v.finish();
}

// ---------------------------------------------------------------------------
// Player actions

export function playJump(position?: AudioPosition, double = false) {
  const v = voice('action', { position });
  if (!v) return;
  const base = double ? 380 : 220;
  v.tone({ from: base * rand(0.95, 1.05), to: base * 2.3, dur: 0.2, gain: 0.12 });
  v.finish();
}

export function playBoing(position?: AudioPosition, pitch = 1) {
  const v = voice('world', { position });
  if (!v) return;
  v.tone({ type: 'sine', from: 160 * pitch, to: 520 * pitch, dur: 0.45, gain: 0.18, vibrato: [16, 40 * pitch] });
  v.tone({ type: 'triangle', from: 80 * pitch, to: 60, dur: 0.15, gain: 0.12 });
  v.finish();
}

export function playSlideWhistle(direction: 'up' | 'down', position?: AudioPosition) {
  const v = voice('action', { position });
  if (!v) return;
  const [from, to] = direction === 'up' ? [480, 1500] : [1500, 260];
  v.tone({ type: 'sine', from, to, dur: 0.55, gain: 0.11, glide: 'lin', vibrato: [7, 25], attack: 0.04 });
  v.finish();
}

export function playWhoosh(position?: AudioPosition) {
  const v = voice('action', { position });
  if (!v) return;
  v.noise({ dur: 0.28, gain: 0.12, attack: 0.08, filter: { type: 'bandpass', freq: 400, to: 1800, q: 1.2 } });
  v.finish();
}

export function playBonk(position?: AudioPosition, pitch = 1) {
  const v = voice('action', { position });
  if (!v) return;
  v.tone({ type: 'triangle', from: 190 * pitch, to: 70, dur: 0.14, gain: 0.22 });
  v.tone({ type: 'square', from: 900 * pitch, to: 700 * pitch, dur: 0.05, gain: 0.05, filter: { type: 'bandpass', freq: 1200, q: 4 } });
  v.tone({ type: 'sine', from: 300 * pitch, to: 700 * pitch, at: 0.04, dur: 0.22, gain: 0.07, vibrato: [22, 30] });
  v.finish();
}

export function playThud(position?: AudioPosition) {
  const v = voice('action', { position });
  if (!v) return;
  v.tone({ type: 'triangle', from: 110, to: 40, dur: 0.3, gain: 0.25 });
  v.noise({ dur: 0.25, gain: 0.12, filter: { type: 'lowpass', freq: 500 } });
  v.finish();
}

export function playFlop(position?: AudioPosition) {
  playSlideWhistle('down', position);
  const v = voice('action', { position });
  if (!v) return;
  v.tone({ type: 'sine', from: 140, to: 70, at: 0.45, dur: 0.18, gain: 0.18, vibrato: [30, 25] });
  v.finish();
}

export function playSlurp(position?: AudioPosition, miss = false) {
  const v = voice('action', { position });
  if (!v) return;
  v.noise({ dur: 0.22, gain: 0.1, filter: { type: 'bandpass', freq: miss ? 600 : 400, to: miss ? 1600 : 2600, q: 3 } });
  v.tone({ from: miss ? 250 : 300, to: miss ? 500 : 900, dur: 0.2, gain: 0.06 });
  v.finish();
}

export function playThrow(position?: AudioPosition) {
  const v = voice('action', { position });
  if (!v) return;
  v.tone({ type: 'triangle', from: 260, to: 620, dur: 0.16, gain: 0.08 });
  v.noise({ dur: 0.2, gain: 0.06, filter: { type: 'bandpass', freq: 700, to: 2000 } });
  v.finish();
}

export function playChomp(position?: AudioPosition) {
  const v = voice('action', { position });
  if (!v) return;
  for (let i = 0; i < 3; i += 1) {
    v.noise({ at: i * 0.11, dur: 0.07, gain: 0.14, filter: { type: 'bandpass', freq: 2200, q: 1.5 } });
    v.tone({ type: 'triangle', from: 300, to: 120, at: i * 0.11, dur: 0.07, gain: 0.08 });
  }
  v.finish();
}

// ---------------------------------------------------------------------------
// Tummy noises

/** Empty-belly toot. Low buzzy flutter; every one sounds a little different. */
export function playFart(position?: AudioPosition) {
  const v = voice('action', { position });
  if (!v) return;
  const base = rand(62, 105);
  const dur = rand(0.3, 0.62);
  v.tone({ type: 'sawtooth', from: base * 1.25, to: base * 0.75, dur, gain: 0.15, attack: 0.02, vibrato: [rand(20, 34), base * 0.4], filter: { type: 'lowpass', freq: 560, q: 5 } });
  v.noise({ dur: dur * 0.9, gain: 0.07, filter: { type: 'lowpass', freq: 380, q: 6 }, wobble: [rand(18, 30), 150] });
  v.finish();
}

/** A huge rocket toot (beans). */
export function playBigFart(position?: AudioPosition) {
  const v = voice('action', { position });
  if (!v) return;
  const base = rand(48, 70);
  v.tone({ type: 'sawtooth', from: base * 1.4, to: base * 0.7, dur: 0.75, gain: 0.2, attack: 0.02, vibrato: [rand(24, 32), base * 0.45], filter: { type: 'lowpass', freq: 650, q: 6 } });
  v.noise({ dur: 0.8, gain: 0.12, filter: { type: 'lowpass', freq: 500, to: 180, q: 5 }, wobble: [26, 180] });
  v.noise({ at: 0.05, dur: 0.5, gain: 0.06, filter: { type: 'highpass', freq: 1800 } });
  v.finish();
}

/** Tummy rumble while full of beans. */
export function playGurgle(position?: AudioPosition) {
  if (throttled('gurgle', 900)) return;
  const v = voice('world', { position, gain: 0.7 });
  if (!v) return;
  for (let i = 0; i < 3; i += 1) v.tone({ type: 'sine', from: rand(90, 140), to: rand(160, 260), at: i * 0.09, dur: 0.1, gain: 0.08, glide: 'lin' });
  v.finish();
}

/** Magic food kicks in (up) or wears off (down). */
export function playPower(position: AudioPosition | undefined, up: boolean) {
  const v = voice('reward', { position });
  if (!v) return;
  const notes = up ? [523, 659, 784, 1047, 1319] : [784, 659, 523, 392];
  notes.forEach((f, i) => v.tone({ type: 'square', from: f, at: i * 0.07, dur: 0.12, gain: 0.05, filter: { type: 'lowpass', freq: 3000 } }));
  if (up) v.tone({ from: 300, to: 1200, dur: 0.4, gain: 0.05, glide: 'exp' });
  v.finish();
}

/** Chili dragon breath. */
export function playFireBreath(position?: AudioPosition) {
  const v = voice('action', { position });
  if (!v) return;
  v.noise({ dur: 0.7, gain: 0.2, filter: { type: 'bandpass', freq: 500, to: 1800, q: 0.8 }, wobble: [9, 300] });
  v.tone({ type: 'sawtooth', from: 110, to: 70, dur: 0.6, gain: 0.08, filter: { type: 'lowpass', freq: 400 } });
  v.finish();
}

/** FLUUUSH: a falling whoosh with gurgles, then a happy jingle. */
export function playFlush(position?: AudioPosition) {
  const v = voice('world', { position });
  if (!v) return;
  v.noise({ dur: 1.3, gain: 0.22, attack: 0.05, filter: { type: 'lowpass', freq: 2600, to: 180, q: 3 }, wobble: [7, 500] });
  for (let i = 0; i < 6; i += 1) v.tone({ type: 'sine', from: rand(200, 420), to: rand(90, 160), at: 0.3 + i * 0.13, dur: 0.12, gain: 0.07 });
  [784, 988, 1175, 1568].forEach((f, i) => v.tone({ type: 'triangle', from: f, at: 1.2 + i * 0.09, dur: 0.18, gain: 0.07 }));
  v.finish();
}

/** Giant footstep. */
export function playStomp(position?: AudioPosition) {
  if (throttled('stomp', 120)) return;
  const v = voice('world', { position });
  if (!v) return;
  v.tone({ type: 'sine', from: 90, to: 38, dur: 0.22, gain: 0.25 });
  v.noise({ dur: 0.12, gain: 0.06, filter: { type: 'lowpass', freq: 300 } });
  v.finish();
}

/** Squeeze... plop! Bigger poops plop lower; golden ones sparkle. */
export function playPlop(position?: AudioPosition, size = 1, golden = false) {
  const v = voice('action', { position });
  if (!v) return;
  v.tone({ type: 'sawtooth', from: rand(150, 190), to: rand(95, 120), dur: 0.18, gain: 0.07, vibrato: [30, 22], filter: { type: 'lowpass', freq: 700, q: 3 } });
  const f = 560 / Math.sqrt(size);
  v.tone({ type: 'sine', from: f, to: f * 0.32, at: 0.17, dur: 0.15, gain: 0.22 });
  v.noise({ at: 0.17, dur: 0.1, gain: 0.07, filter: { type: 'lowpass', freq: 800 } });
  if (golden) [1568, 2093, 2637, 3136].forEach((fr, i) => v.tone({ from: fr, at: 0.32 + i * 0.07, dur: 0.3, gain: 0.06 }));
  v.finish();
}

export function playBurp(position?: AudioPosition) {
  if (throttled('burp', 300)) return;
  const v = voice('action', { position });
  if (!v) return;
  const f = rand(80, 105);
  v.tone({ type: 'sawtooth', from: f * 1.2, to: f * 0.78, dur: 0.6, gain: 0.18, attack: 0.03, vibrato: [11, 7], filter: { type: 'bandpass', freq: 520, q: 1.5 } });
  v.noise({ dur: 0.45, gain: 0.04, filter: { type: 'bandpass', freq: 650, q: 2 } });
  v.finish();
}

/** "Bleh!" after licking something you really shouldn't. */
export function playYuck(position?: AudioPosition) {
  if (throttled('yuck', 250)) return;
  const v = voice('action', { position });
  if (!v) return;
  v.tone({ type: 'square', from: 430, to: 250, dur: 0.34, gain: 0.07, vibrato: [34, 30], filter: { type: 'lowpass', freq: 1400, q: 2 } });
  v.noise({ at: 0.05, dur: 0.24, gain: 0.07, filter: { type: 'bandpass', freq: 1200, q: 2 }, wobble: [30, 400] });
  v.finish();
}

export function playPoof(position?: AudioPosition) {
  const v = voice('reward', { position });
  if (!v) return;
  v.noise({ dur: 0.3, gain: 0.1, filter: { type: 'highpass', freq: 900 } });
  [1318, 1568, 2093].forEach((f, i) => v.tone({ from: f, at: 0.05 + i * 0.05, dur: 0.18, gain: 0.05 }));
  v.finish();
}

export function playSplash(position?: AudioPosition, big = true) {
  if (throttled('splash', 120)) return;
  const v = voice('world', { position });
  if (!v) return;
  v.noise({ dur: big ? 0.45 : 0.2, gain: big ? 0.16 : 0.08, attack: 0.01, filter: { type: 'bandpass', freq: 1100, to: 500, q: 0.7 } });
  for (let i = 0; i < 3; i += 1) v.tone({ from: rand(700, 1200), to: rand(1400, 2200), at: rand(0.05, 0.3), dur: 0.06, gain: 0.04 });
  v.finish();
}

export function playSquelch(position?: AudioPosition) {
  if (throttled('squelch', 200)) return;
  const v = voice('world', { position });
  if (!v) return;
  v.noise({ dur: 0.35, gain: 0.16, filter: { type: 'lowpass', freq: 380, q: 6 }, wobble: [14, 220] });
  v.tone({ type: 'sine', from: 160, to: 90, dur: 0.3, gain: 0.08, vibrato: [18, 30] });
  v.finish();
}

// ---------------------------------------------------------------------------
// World

export function playPop(position?: AudioPosition) {
  const v = voice('world', { position });
  if (!v) return;
  v.noise({ dur: 0.07, gain: 0.25, filter: { type: 'highpass', freq: 1400 } });
  v.tone({ from: 900, to: 180, dur: 0.1, gain: 0.1 });
  v.finish();
}

export function playSplat(position?: AudioPosition) {
  const v = voice('world', { position });
  if (!v) return;
  v.noise({ dur: 0.35, gain: 0.2, filter: { type: 'lowpass', freq: 900, to: 200, q: 2 } });
  v.tone({ type: 'triangle', from: 220, to: 50, dur: 0.25, gain: 0.14 });
  v.finish();
}

export function playSquawk(position?: AudioPosition) {
  if (throttled('squawk', 90)) return;
  const v = voice('world', { position });
  if (!v) return;
  v.tone({ type: 'sawtooth', from: rand(850, 1050), to: rand(600, 750), dur: 0.3, gain: 0.1, vibrato: [32, 260], filter: { type: 'bandpass', freq: 1500, q: 1.5 } });
  v.finish();
}

export function playCluck(position?: AudioPosition) {
  if (throttled('cluck', 350)) return;
  const v = voice('world', { position, gain: 0.8 });
  if (!v) return;
  const n = random() < 0.5 ? 2 : 3;
  for (let i = 0; i < n; i += 1) {
    v.tone({ type: 'square', from: rand(560, 680), to: rand(380, 450), at: i * 0.11, dur: 0.06, gain: 0.06, filter: { type: 'bandpass', freq: 1100, q: 2 } });
  }
  v.finish();
}

export function playSqueak(position?: AudioPosition) {
  if (throttled('squeak', 80)) return;
  const v = voice('world', { position });
  if (!v) return;
  v.tone({ type: 'sine', from: 1100, to: 1900, dur: 0.09, gain: 0.1 });
  v.tone({ type: 'sine', from: 1900, to: 1000, at: 0.09, dur: 0.12, gain: 0.08 });
  v.finish();
}

export function playClack(position?: AudioPosition, sharpness = 0.5) {
  if (throttled('clack', 60)) return;
  const v = voice('world', { position });
  if (!v) return;
  v.tone({ type: 'square', from: 700 + sharpness * 500, to: 400, dur: 0.05, gain: 0.05 + sharpness * 0.05, filter: { type: 'bandpass', freq: 1600, q: 3 } });
  v.noise({ dur: 0.04, gain: 0.05, filter: { type: 'bandpass', freq: 2500 } });
  v.finish();
}

export function playBounce(position?: AudioPosition, sharpness = 0.5) {
  if (throttled('bounce', 90)) return;
  const v = voice('world', { position });
  if (!v) return;
  v.tone({ type: 'triangle', from: 180 + sharpness * 200, to: 100 + sharpness * 60, dur: 0.12, gain: 0.06 + sharpness * 0.06 });
  v.finish();
}

export function playRustle(position?: AudioPosition) {
  const v = voice('world', { position });
  if (!v) return;
  v.noise({ dur: 0.45, gain: 0.12, attack: 0.03, filter: { type: 'highpass', freq: 2200 }, wobble: [18, 900] });
  v.finish();
}

export function playButton() {
  const v = voice('ui');
  if (!v) return;
  v.tone({ type: 'square', from: 220, to: 180, dur: 0.06, gain: 0.08, filter: { type: 'lowpass', freq: 1200 } });
  v.tone({ from: 880, dur: 0.25, at: 0.08, gain: 0.12 });
  v.tone({ from: 660, dur: 0.35, at: 0.3, gain: 0.12 });
  v.finish();
}

export function playTap() {
  const v = voice('ui');
  if (!v) return;
  v.tone({ from: 660, to: 990, dur: 0.08, gain: 0.08 });
  v.finish();
}

// ---------------------------------------------------------------------------
// Rewards

export function playCollect(position?: AudioPosition) {
  const v = voice('reward', { position });
  if (!v) return;
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
    v.tone({ type: 'triangle', from: f, at: i * 0.07, dur: 0.3, gain: 0.12 });
    v.tone({ type: 'sine', from: f * 2, at: i * 0.07, dur: 0.2, gain: 0.04 });
  });
  v.finish();
}

export function playHatTada(position?: AudioPosition) {
  const v = voice('reward', { position });
  if (!v) return;
  v.tone({ type: 'triangle', from: 784, at: 0, dur: 0.12, gain: 0.1 });
  v.tone({ type: 'triangle', from: 1046.5, at: 0.12, dur: 0.35, gain: 0.12 });
  v.tone({ type: 'sine', from: 1318.5, at: 0.12, dur: 0.35, gain: 0.06 });
  v.finish();
}

export function playDuet() {
  const v = voice('reward');
  if (!v) return;
  [523.25, 659.25, 783.99].forEach((f) => v.tone({ type: 'sine', from: f, dur: 0.9, gain: 0.07, attack: 0.05, vibrato: [5, 4] }));
  v.finish();
}

export function playCheer() {
  const v = voice('reward');
  if (!v) return;
  v.noise({ dur: 1.6, gain: 0.14, attack: 0.25, filter: { type: 'bandpass', freq: 1400, q: 0.6 }, wobble: [6, 500] });
  v.noise({ dur: 1.3, gain: 0.08, attack: 0.2, filter: { type: 'bandpass', freq: 2600, q: 1 }, wobble: [9, 800] });
  v.tone({ type: 'sine', from: 2200, to: 2600, dur: 0.25, gain: 0.07, vibrato: [30, 120] });
  v.tone({ type: 'sine', from: 2200, to: 2600, at: 0.3, dur: 0.4, gain: 0.07, vibrato: [30, 120] });
  v.finish();
}

export function playFanfare() {
  const v = voice('reward');
  if (!v) return;
  const notes: [number, number, number][] = [
    [392, 0, 0.12],
    [392, 0.13, 0.12],
    [392, 0.26, 0.12],
    [523.25, 0.4, 0.5],
    [466.16, 0.92, 0.18],
    [523.25, 1.12, 0.7]
  ];
  notes.forEach(([f, at, dur]) => {
    v.tone({ type: 'sawtooth', from: f, at, dur, gain: 0.09, attack: 0.02, filter: { type: 'lowpass', freq: 2200 } });
    v.tone({ type: 'square', from: f / 2, at, dur, gain: 0.04, filter: { type: 'lowpass', freq: 900 } });
  });
  [523.25, 659.25, 783.99].forEach((f) => v.tone({ type: 'triangle', from: f, at: 1.12, dur: 0.9, gain: 0.06 }));
  v.noise({ at: 1.12, dur: 0.6, gain: 0.08, filter: { type: 'highpass', freq: 5000 } });
  v.finish();
}

export function playStrike() {
  const v = voice('reward');
  if (!v) return;
  for (let i = 0; i < 7; i += 1) {
    v.tone({ type: 'square', from: rand(700, 1300), to: 400, at: rand(0, 0.35), dur: 0.05, gain: 0.05, filter: { type: 'bandpass', freq: 1500, q: 3 } });
  }
  v.finish();
  playCheer();
}

// ---------------------------------------------------------------------------
// Map toys

export function playRoar(position?: AudioPosition) {
  const v = voice('world', { position, gain: 1.2 });
  if (!v) return;
  v.tone({ type: 'sawtooth', from: 150, to: 70, dur: 1.1, gain: 0.2, attack: 0.08, vibrato: [9, 18], filter: { type: 'lowpass', freq: 700, q: 2 } });
  v.tone({ type: 'square', from: 95, to: 55, dur: 1.0, gain: 0.1, attack: 0.08, tremolo: [14, 0.6], filter: { type: 'lowpass', freq: 400 } });
  v.noise({ dur: 1, gain: 0.12, attack: 0.1, filter: { type: 'bandpass', freq: 500, to: 250, q: 1.2 }, wobble: [12, 200] });
  v.finish();
}

export function playMoo(position?: AudioPosition) {
  if (throttled('moo', 400)) return;
  const v = voice('world', { position });
  if (!v) return;
  const p = rand(0.9, 1.1);
  v.tone({ type: 'sawtooth', from: 130 * p, to: 110 * p, dur: 1.1, gain: 0.16, attack: 0.15, vibrato: [4, 5], filter: { type: 'lowpass', freq: 500, q: 3 } });
  v.tone({ type: 'sawtooth', from: 260 * p, to: 215 * p, dur: 1.0, gain: 0.05, attack: 0.2, filter: { type: 'bandpass', freq: 700, q: 2 } });
  v.finish();
}

export function playToot(position?: AudioPosition) {
  const v = voice('world', { position, gain: 1.1 });
  if (!v) return;
  [0, 0.45].forEach((at, i) => {
    const dur = i === 0 ? 0.3 : 0.6;
    [392, 494, 587].forEach((f) => v.tone({ type: 'sawtooth', from: f, at, dur, gain: 0.05, attack: 0.03, filter: { type: 'lowpass', freq: 1600 } }));
    v.noise({ at, dur, gain: 0.05, attack: 0.02, filter: { type: 'bandpass', freq: 2400, q: 2 } });
  });
  v.finish();
}

export function playChuff(position?: AudioPosition) {
  if (throttled('chuff', 200)) return;
  const v = voice('world', { position, gain: 0.7 });
  if (!v) return;
  v.noise({ dur: 0.18, gain: 0.08, filter: { type: 'bandpass', freq: 900, q: 0.8 } });
  v.finish();
}

export function playBell(position?: AudioPosition) {
  const v = voice('reward', { position });
  if (!v) return;
  [1318, 1760, 2637].forEach((f, i) => v.tone({ type: 'sine', from: f, dur: 1.6 - i * 0.3, gain: 0.12 - i * 0.03, attack: 0.003 }));
  v.finish();
}

export function playBoom(position?: AudioPosition) {
  const v = voice('world', { position, gain: 1.2 });
  if (!v) return;
  v.tone({ type: 'triangle', from: 120, to: 35, dur: 0.6, gain: 0.3 });
  v.noise({ dur: 0.5, gain: 0.25, filter: { type: 'lowpass', freq: 1200, to: 200, q: 0.7 } });
  v.finish();
}

export function playCrack(position?: AudioPosition) {
  const v = voice('world', { position });
  if (!v) return;
  for (let i = 0; i < 3; i += 1) v.noise({ at: i * 0.06, dur: 0.04, gain: 0.14, filter: { type: 'highpass', freq: 2500 } });
  v.tone({ from: 700, to: 1400, at: 0.2, dur: 0.12, gain: 0.06 });
  v.finish();
}

export function playCheep(position?: AudioPosition) {
  if (throttled('cheep', 70)) return;
  const v = voice('world', { position, gain: 0.8 });
  if (!v) return;
  const f = rand(1500, 2100);
  v.tone({ from: f, to: f * 1.35, dur: 0.08, gain: 0.07 });
  v.tone({ from: f * 1.1, to: f * 0.8, at: 0.1, dur: 0.1, gain: 0.06 });
  v.finish();
}

export function playGeyser(position?: AudioPosition) {
  const v = voice('world', { position });
  if (!v) return;
  v.noise({ dur: 1.1, gain: 0.14, attack: 0.1, filter: { type: 'bandpass', freq: 500, to: 2200, q: 0.6 } });
  v.finish();
}

export function playCrumble(position?: AudioPosition) {
  const v = voice('world', { position });
  if (!v) return;
  for (let i = 0; i < 6; i += 1) v.noise({ at: rand(0, 0.3), dur: 0.08, gain: 0.1, filter: { type: 'lowpass', freq: rand(500, 1200) } });
  v.tone({ type: 'triangle', from: 160, to: 60, dur: 0.3, gain: 0.12 });
  v.finish();
}

export function playRumble(position?: AudioPosition) {
  const v = voice('world', { position, gain: 1.2 });
  if (!v) return;
  v.noise({ dur: 1.2, gain: 0.2, attack: 0.4, filter: { type: 'lowpass', freq: 180, q: 1 }, wobble: [7, 60] });
  v.tone({ type: 'triangle', from: 45, to: 38, dur: 1.2, gain: 0.15, attack: 0.4, tremolo: [7, 0.5] });
  v.finish();
}

export function playSpin(position?: AudioPosition) {
  const v = voice('world', { position });
  if (!v) return;
  v.tone({ type: 'triangle', from: 300, to: 900, dur: 0.5, gain: 0.08, vibrato: [18, 60] });
  v.finish();
}
