export type AudioCategory = 'ui' | 'action' | 'world' | 'reward';

type Vec3Like = { x: number; y: number; z: number };

export type AudioPosition = [number, number, number] | Vec3Like;

export type AudioSettings = {
  muted: boolean;
  masterVolume: number;
  categoryGains: Record<AudioCategory, number>;
};

type ChannelOptions = {
  position?: AudioPosition;
  gain?: number;
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
};

type ChannelHandle = {
  ctx: AudioContext;
  input: GainNode;
  gain: GainNode;
  panner?: PannerNode;
  updatePosition: (position: AudioPosition) => void;
  cleanup: () => void;
};

export type PositionalLoopHandle = {
  setPosition: (position: AudioPosition) => void;
  stop: () => void;
};

type AmbientBed = {
  channel: ChannelHandle;
  source: AudioBufferSourceNode;
  tone: BiquadFilterNode;
  color: BiquadFilterNode;
  gain: GainNode;
  targetGain: number;
};

const CATEGORY_DEFAULTS: Record<AudioCategory, number> = {
  ui: 0.9,
  action: 1,
  world: 0.82,
  reward: 1
};

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let categoryGains: Record<AudioCategory, GainNode> | null = null;
let noiseBuffer: AudioBuffer | null = null;

let settings: AudioSettings = {
  muted: false,
  masterVolume: 0.8,
  categoryGains: { ...CATEGORY_DEFAULTS }
};

const listeners = new Set<(settings: AudioSettings) => void>();

let lastRewardAt = 0;
let rewardChain = 0;
let ambienceBeds: { water: AmbientBed; wind: AmbientBed } | null = null;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const rand = (min: number, max: number) => Math.random() * (max - min) + min;

function toPosition(position: AudioPosition) {
  return Array.isArray(position)
    ? { x: position[0], y: position[1], z: position[2] }
    : position;
}

function getAudioCtx() {
  if (!audioCtx) {
    const AudioCtor = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) {
      throw new Error('Web Audio is not supported in this browser.');
    }
    audioCtx = new AudioCtor();
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
  return audioCtx;
}

function ensureMixer() {
  const ctx = getAudioCtx();
  if (!masterGain || !categoryGains) {
    masterGain = ctx.createGain();
    categoryGains = {
      ui: ctx.createGain(),
      action: ctx.createGain(),
      world: ctx.createGain(),
      reward: ctx.createGain()
    };

    categoryGains.ui.connect(masterGain);
    categoryGains.action.connect(masterGain);
    categoryGains.world.connect(masterGain);
    categoryGains.reward.connect(masterGain);
    masterGain.connect(ctx.destination);
  }

  applyMixerState();
  return { ctx, masterGain, categoryGains };
}

function applyMixerState() {
  if (!masterGain || !categoryGains) return;
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  masterGain.gain.cancelScheduledValues(now);
  masterGain.gain.setTargetAtTime(settings.muted ? 0 : settings.masterVolume, now, 0.015);
  (Object.keys(categoryGains) as AudioCategory[]).forEach((category) => {
    const node = categoryGains![category];
    node.gain.cancelScheduledValues(now);
    node.gain.setTargetAtTime(settings.categoryGains[category], now, 0.02);
  });
}

function emitSettings() {
  const snapshot = getAudioSettings();
  listeners.forEach((listener) => listener(snapshot));
}

function createNoiseBuffer(ctx: AudioContext) {
  if (noiseBuffer) return noiseBuffer;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBuffer = buffer;
  return buffer;
}

function setPannerPosition(panner: PannerNode, position: AudioPosition) {
  const { x, y, z } = toPosition(position);
  panner.positionX.setValueAtTime(x, panner.context.currentTime);
  panner.positionY.setValueAtTime(y, panner.context.currentTime);
  panner.positionZ.setValueAtTime(z, panner.context.currentTime);
}

function createChannel(category: AudioCategory, options: ChannelOptions = {}): ChannelHandle {
  const mixer = ensureMixer();
  const input = mixer.ctx.createGain();
  input.gain.value = options.gain ?? 1;

  let panner: PannerNode | undefined;
  if (options.position) {
    panner = mixer.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = options.refDistance ?? 8;
    panner.maxDistance = options.maxDistance ?? 90;
    panner.rolloffFactor = options.rolloffFactor ?? 1.2;
    setPannerPosition(panner, options.position);
    input.connect(panner);
    panner.connect(mixer.categoryGains[category]);
  } else {
    input.connect(mixer.categoryGains[category]);
  }

  return {
    ctx: mixer.ctx,
    input,
    gain: input,
    panner,
    updatePosition(position) {
      if (panner) setPannerPosition(panner, position);
    },
    cleanup() {
      input.disconnect();
      panner?.disconnect();
    }
  };
}

function finishLater(channel: ChannelHandle, when: number, ...nodes: AudioNode[]) {
  const timeoutMs = Math.max(0, (when - channel.ctx.currentTime) * 1000 + 80);
  window.setTimeout(() => {
    nodes.forEach((node) => node.disconnect());
    channel.cleanup();
  }, timeoutMs);
}

function playFilteredNoiseBurst(category: AudioCategory, options: ChannelOptions & { duration: number; frequency: number; q?: number; type?: BiquadFilterType }) {
  const channel = createChannel(category, options);
  const noise = channel.ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(channel.ctx);
  const filter = channel.ctx.createBiquadFilter();
  filter.type = options.type ?? 'bandpass';
  filter.frequency.value = options.frequency;
  filter.Q.value = options.q ?? 0.8;

  const now = channel.ctx.currentTime;
  noise.connect(filter);
  filter.connect(channel.input);
  channel.gain.gain.setValueAtTime(0.0001, now);
  channel.gain.gain.linearRampToValueAtTime(options.gain ?? 0.14, now + 0.02);
  channel.gain.gain.exponentialRampToValueAtTime(0.0001, now + options.duration);
  noise.start(now);
  noise.stop(now + options.duration);
  finishLater(channel, now + options.duration, noise, filter);
}

function rewardCombo(combo?: number) {
  if (typeof combo === 'number') return combo;
  const now = performance.now();
  rewardChain = now - lastRewardAt < 1300 ? rewardChain + 1 : 1;
  lastRewardAt = now;
  return rewardChain;
}

function createAmbientBed(position: AudioPosition, baseFrequency: number, highpass: number): AmbientBed {
  const channel = createChannel('world', {
    position,
    gain: 1,
    refDistance: 10,
    maxDistance: 80,
    rolloffFactor: 0.9
  });
  const source = channel.ctx.createBufferSource();
  source.buffer = createNoiseBuffer(channel.ctx);
  source.loop = true;

  const color = channel.ctx.createBiquadFilter();
  color.type = 'lowpass';
  color.frequency.value = baseFrequency;

  const tone = channel.ctx.createBiquadFilter();
  tone.type = 'highpass';
  tone.frequency.value = highpass;

  const gain = channel.ctx.createGain();
  gain.gain.value = 0.0001;

  source.connect(color);
  color.connect(tone);
  tone.connect(gain);
  gain.connect(channel.input);
  source.start();

  return { channel, source, tone, color, gain, targetGain: 0 };
}

function ensureAmbience() {
  if (ambienceBeds) return ambienceBeds;
  ambienceBeds = {
    water: createAmbientBed([0, 0.8, 0], 680, 90),
    wind: createAmbientBed([37, 1.2, -23], 1900, 300)
  };
  return ambienceBeds;
}

export function getAudioSettings(): AudioSettings {
  return {
    muted: settings.muted,
    masterVolume: settings.masterVolume,
    categoryGains: { ...settings.categoryGains }
  };
}

export function subscribeAudioSettings(listener: (settings: AudioSettings) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setAudioMuted(muted: boolean) {
  settings = { ...settings, muted };
  applyMixerState();
  emitSettings();
}

export function toggleAudioMuted() {
  setAudioMuted(!settings.muted);
}

export function setMasterVolume(volume: number) {
  settings = { ...settings, masterVolume: clamp(volume, 0, 1) };
  applyMixerState();
  emitSettings();
}

export function setCategoryGain(category: AudioCategory, volume: number) {
  settings = {
    ...settings,
    categoryGains: {
      ...settings.categoryGains,
      [category]: clamp(volume, 0, 1.4)
    }
  };
  applyMixerState();
  emitSettings();
}

export function updateAudioListener(position: AudioPosition) {
  if (!audioCtx) return;
  const ctx = audioCtx;
  const listener = ctx.listener;
  const { x, y, z } = toPosition(position);
  listener.positionX.setValueAtTime(x, ctx.currentTime);
  listener.positionY.setValueAtTime(y + 1.6, ctx.currentTime);
  listener.positionZ.setValueAtTime(z + 8, ctx.currentTime);
  listener.forwardX.setValueAtTime(0, ctx.currentTime);
  listener.forwardY.setValueAtTime(-0.12, ctx.currentTime);
  listener.forwardZ.setValueAtTime(-1, ctx.currentTime);
  listener.upX.setValueAtTime(0, ctx.currentTime);
  listener.upY.setValueAtTime(1, ctx.currentTime);
  listener.upZ.setValueAtTime(0, ctx.currentTime);
}

export function syncZoneAmbience(position: AudioPosition, isNight = false) {
  if (!audioCtx) return;
  const beds = ensureAmbience();
  const waterPos = toPosition([0, 0, 0]);
  const dunePos = toPosition([37, 0, -23]);
  const current = toPosition(position);
  const waterDist = Math.hypot(current.x - waterPos.x, current.z - waterPos.z);
  const duneDist = Math.hypot(current.x - dunePos.x, current.z - dunePos.z);
  const waterAmount = clamp(1 - waterDist / 34, 0, 1);
  const duneAmount = clamp(1 - duneDist / 26, 0, 1);
  const ctx = beds.water.channel.ctx;
  const now = ctx.currentTime;

  beds.water.targetGain = 0.22 * waterAmount + (isNight ? 0.03 : 0);
  beds.wind.targetGain = 0.18 * duneAmount + (isNight ? 0.04 : 0.02);

  beds.water.gain.gain.setTargetAtTime(Math.max(0.0001, beds.water.targetGain), now, 0.5);
  beds.wind.gain.gain.setTargetAtTime(Math.max(0.0001, beds.wind.targetGain), now, 0.55);
  beds.water.color.frequency.setTargetAtTime(isNight ? 520 : 680, now, 0.8);
  beds.wind.color.frequency.setTargetAtTime(isNight ? 1500 : 1900, now, 0.8);
}

export function playBarkSound(options: { position?: AudioPosition } = {}) {
  const channel = createChannel('action', { ...options, gain: 1, refDistance: 7, maxDistance: 95 });
  const now = channel.ctx.currentTime;

  const bark = channel.ctx.createOscillator();
  const barkGain = channel.ctx.createGain();
  bark.type = 'square';
  bark.frequency.setValueAtTime(rand(360, 430), now);
  bark.frequency.exponentialRampToValueAtTime(rand(120, 160), now + 0.16);
  barkGain.gain.setValueAtTime(0.0001, now);
  barkGain.gain.linearRampToValueAtTime(0.18, now + 0.015);
  barkGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

  const thump = channel.ctx.createOscillator();
  const thumpGain = channel.ctx.createGain();
  thump.type = 'triangle';
  thump.frequency.setValueAtTime(rand(85, 105), now);
  thump.frequency.exponentialRampToValueAtTime(48, now + 0.12);
  thumpGain.gain.setValueAtTime(0.0001, now);
  thumpGain.gain.linearRampToValueAtTime(0.09, now + 0.012);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

  const transient = channel.ctx.createBufferSource();
  transient.buffer = createNoiseBuffer(channel.ctx);
  const snap = channel.ctx.createBiquadFilter();
  snap.type = 'bandpass';
  snap.frequency.value = 1400;
  const snapGain = channel.ctx.createGain();
  snapGain.gain.setValueAtTime(0.0001, now);
  snapGain.gain.linearRampToValueAtTime(0.05, now + 0.004);
  snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

  bark.connect(barkGain);
  barkGain.connect(channel.input);
  thump.connect(thumpGain);
  thumpGain.connect(channel.input);
  transient.connect(snap);
  snap.connect(snapGain);
  snapGain.connect(channel.input);

  bark.start(now);
  bark.stop(now + 0.18);
  thump.start(now);
  thump.stop(now + 0.16);
  transient.start(now);
  transient.stop(now + 0.05);

  finishLater(channel, now + 0.22, bark, barkGain, thump, thumpGain, transient, snap, snapGain);
}

export function playStarSound(options: { position?: AudioPosition; combo?: number; delay?: number } = {}) {
  const channel = createChannel('reward', { ...options, gain: 1, refDistance: 8, maxDistance: 100 });
  const chain = rewardCombo(options.combo);
  const start = channel.ctx.currentTime + (options.delay ?? 0);
  const pitchBoost = Math.pow(1.045, Math.min(chain - 1, 8));
  const freqs = [660, 990, 1320].map((freq) => freq * pitchBoost);

  freqs.forEach((freq, index) => {
    const osc = channel.ctx.createOscillator();
    const gain = channel.ctx.createGain();
    osc.type = index === 0 ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, start + index * 0.035);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.16, start + index * 0.035 + 0.18);
    gain.gain.setValueAtTime(0.0001, start + index * 0.035);
    gain.gain.linearRampToValueAtTime(0.13 + Math.min(chain, 4) * 0.015, start + index * 0.035 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + index * 0.035 + 0.26);
    osc.connect(gain);
    gain.connect(channel.input);
    osc.start(start + index * 0.035);
    osc.stop(start + index * 0.035 + 0.26);
    finishLater(channel, start + 0.42, osc, gain);
  });
}

export function playLevelStinger(phase: 'intro' | 'outro') {
  const channel = createChannel('ui', { gain: 1 });
  const now = channel.ctx.currentTime;
  const freqs = phase === 'intro' ? [392, 523.25, 783.99] : [659.25, 523.25, 392];

  freqs.forEach((freq, index) => {
    const osc = channel.ctx.createOscillator();
    const gain = channel.ctx.createGain();
    osc.type = phase === 'intro' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, now + index * 0.08);
    osc.frequency.exponentialRampToValueAtTime(freq * (phase === 'intro' ? 1.08 : 0.92), now + index * 0.08 + 0.18);
    gain.gain.setValueAtTime(0.0001, now + index * 0.08);
    gain.gain.linearRampToValueAtTime(0.16, now + index * 0.08 + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.08 + 0.24);
    osc.connect(gain);
    gain.connect(channel.input);
    osc.start(now + index * 0.08);
    osc.stop(now + index * 0.08 + 0.24);
    finishLater(channel, now + 0.6, osc, gain);
  });
}

export function playCrashSound(options: { position?: AudioPosition } = {}) {
  const channel = createChannel('world', { ...options, gain: 1, refDistance: 9, maxDistance: 110 });
  const now = channel.ctx.currentTime;

  const metal = channel.ctx.createOscillator();
  const metalGain = channel.ctx.createGain();
  metal.type = 'sawtooth';
  metal.frequency.setValueAtTime(rand(180, 240), now);
  metal.frequency.exponentialRampToValueAtTime(48, now + 0.25);
  metalGain.gain.setValueAtTime(0.0001, now);
  metalGain.gain.linearRampToValueAtTime(0.15, now + 0.01);
  metalGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

  metal.connect(metalGain);
  metalGain.connect(channel.input);
  metal.start(now);
  metal.stop(now + 0.28);
  finishLater(channel, now + 0.32, metal, metalGain);

  playFilteredNoiseBurst('world', {
    ...options,
    duration: 0.22,
    gain: 0.18,
    frequency: 920,
    q: 0.7
  });
}

export function playPoopSound(options: { position?: AudioPosition } = {}) {
  const channel = createChannel('action', { ...options, gain: 1, refDistance: 7, maxDistance: 85 });
  const now = channel.ctx.currentTime;
  const osc = channel.ctx.createOscillator();
  const gain = channel.ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(rand(140, 170), now);
  osc.frequency.linearRampToValueAtTime(rand(48, 62), now + 0.16);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.18, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  osc.connect(gain);
  gain.connect(channel.input);
  osc.start(now);
  osc.stop(now + 0.16);
  finishLater(channel, now + 0.2, osc, gain);
}

export function playJumpSound(options: { position?: AudioPosition } = {}) {
  const channel = createChannel('action', { ...options, gain: 1, refDistance: 8, maxDistance: 90 });
  const now = channel.ctx.currentTime;
  const osc = channel.ctx.createOscillator();
  const gain = channel.ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(rand(190, 240), now);
  osc.frequency.exponentialRampToValueAtTime(rand(420, 520), now + 0.24);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.14, now + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
  osc.connect(gain);
  gain.connect(channel.input);
  osc.start(now);
  osc.stop(now + 0.24);
  finishLater(channel, now + 0.28, osc, gain);
}

export function startDigLoop(options: { position?: AudioPosition } = {}): PositionalLoopHandle {
  const channel = createChannel('action', { ...options, gain: 1, refDistance: 8, maxDistance: 95 });
  const now = channel.ctx.currentTime;
  const noise = channel.ctx.createBufferSource();
  noise.buffer = createNoiseBuffer(channel.ctx);
  noise.loop = true;

  const grit = channel.ctx.createBiquadFilter();
  grit.type = 'bandpass';
  grit.frequency.value = 760;
  grit.Q.value = 0.9;

  const rumble = channel.ctx.createOscillator();
  rumble.type = 'triangle';
  rumble.frequency.value = 62;

  const rumbleGain = channel.ctx.createGain();
  rumbleGain.gain.value = 0.05;

  const mix = channel.ctx.createGain();
  mix.gain.setValueAtTime(0.0001, now);
  mix.gain.linearRampToValueAtTime(0.16, now + 0.08);

  const pulse = channel.ctx.createOscillator();
  pulse.type = 'sine';
  pulse.frequency.value = 7;
  const pulseDepth = channel.ctx.createGain();
  pulseDepth.gain.value = 0.03;

  pulse.connect(pulseDepth);
  pulseDepth.connect(mix.gain);
  noise.connect(grit);
  grit.connect(mix);
  rumble.connect(rumbleGain);
  rumbleGain.connect(mix);
  mix.connect(channel.input);

  noise.start(now);
  rumble.start(now);
  pulse.start(now);

  let stopped = false;

  return {
    setPosition(position) {
      channel.updatePosition(position);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const stopAt = channel.ctx.currentTime + 0.12;
      mix.gain.cancelScheduledValues(channel.ctx.currentTime);
      mix.gain.setTargetAtTime(0.0001, channel.ctx.currentTime, 0.03);
      noise.stop(stopAt);
      rumble.stop(stopAt);
      pulse.stop(stopAt);
      finishLater(channel, stopAt + 0.08, noise, grit, rumble, rumbleGain, pulse, pulseDepth, mix);
    }
  };
}

export function playDigCompleteSound(options: { position?: AudioPosition } = {}) {
  const channel = createChannel('action', { ...options, gain: 1, refDistance: 8, maxDistance: 95 });
  const now = channel.ctx.currentTime;
  const osc = channel.ctx.createOscillator();
  const gain = channel.ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(620, now);
  osc.frequency.exponentialRampToValueAtTime(1040, now + 0.12);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.1, now + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  osc.connect(gain);
  gain.connect(channel.input);
  osc.start(now);
  osc.stop(now + 0.18);
  finishLater(channel, now + 0.22, osc, gain);
}

export function playEatSound(options: { position?: AudioPosition } = {}) {
  const channel = createChannel('action', { ...options, gain: 1, refDistance: 7, maxDistance: 85 });
  const now = channel.ctx.currentTime;
  const osc = channel.ctx.createOscillator();
  const gain = channel.ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(rand(280, 360), now);
  osc.frequency.exponentialRampToValueAtTime(rand(120, 150), now + 0.08);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.11, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
  osc.connect(gain);
  gain.connect(channel.input);
  osc.start(now);
  osc.stop(now + 0.1);
  finishLater(channel, now + 0.14, osc, gain);
}

export function playDrinkSound(options: { position?: AudioPosition } = {}) {
  const channel = createChannel('action', { ...options, gain: 1, refDistance: 8, maxDistance: 85 });
  const now = channel.ctx.currentTime;
  const osc = channel.ctx.createOscillator();
  const gain = channel.ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(rand(620, 820), now);
  osc.frequency.exponentialRampToValueAtTime(rand(980, 1180), now + 0.06);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.08, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  osc.connect(gain);
  gain.connect(channel.input);
  osc.start(now);
  osc.stop(now + 0.08);
  finishLater(channel, now + 0.12, osc, gain);
}

export function playSniffSound(options: { position?: AudioPosition } = {}) {
  playFilteredNoiseBurst('action', {
    ...options,
    duration: 0.15,
    gain: 0.08,
    frequency: rand(2100, 3000),
    type: 'highpass'
  });
}

export function playSleepSound(options: { position?: AudioPosition } = {}) {
  playFilteredNoiseBurst('action', {
    ...options,
    duration: 1.4,
    gain: 0.05,
    frequency: rand(320, 460),
    type: 'lowpass'
  });
}

export function playPantSound(options: { position?: AudioPosition } = {}) {
  playFilteredNoiseBurst('action', {
    ...options,
    duration: 0.14,
    gain: 0.08,
    frequency: rand(2100, 2800),
    type: 'highpass'
  });
}

export function playPickupSound(options: { position?: AudioPosition } = {}) {
  const channel = createChannel('world', { ...options, gain: 1, refDistance: 7, maxDistance: 85 });
  const now = channel.ctx.currentTime;
  const osc = channel.ctx.createOscillator();
  const gain = channel.ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(280, now);
  osc.frequency.exponentialRampToValueAtTime(520, now + 0.08);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.07, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
  osc.connect(gain);
  gain.connect(channel.input);
  osc.start(now);
  osc.stop(now + 0.1);
  finishLater(channel, now + 0.14, osc, gain);
}

export function playThrowSound(options: { position?: AudioPosition; flavor?: 'ball' | 'bone' | 'frisbee' } = {}) {
  const flavor = options.flavor ?? 'ball';
  const channel = createChannel('world', { ...options, gain: 1, refDistance: 8, maxDistance: 100 });
  const now = channel.ctx.currentTime;
  const osc = channel.ctx.createOscillator();
  const gain = channel.ctx.createGain();
  osc.type = flavor === 'frisbee' ? 'sine' : 'triangle';
  osc.frequency.setValueAtTime(flavor === 'bone' ? 210 : 260, now);
  osc.frequency.exponentialRampToValueAtTime(flavor === 'frisbee' ? 760 : 520, now + 0.16);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(flavor === 'frisbee' ? 0.09 : 0.07, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  osc.connect(gain);
  gain.connect(channel.input);
  osc.start(now);
  osc.stop(now + 0.16);
  finishLater(channel, now + 0.2, osc, gain);
}

export function playToyBounceSound(options: { position?: AudioPosition; sharpness?: number } = {}) {
  const channel = createChannel('world', { ...options, gain: 1, refDistance: 8, maxDistance: 95 });
  const now = channel.ctx.currentTime;
  const sharpness = clamp(options.sharpness ?? 0.5, 0, 1);
  const osc = channel.ctx.createOscillator();
  const gain = channel.ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(180 + sharpness * 180, now);
  osc.frequency.exponentialRampToValueAtTime(110 + sharpness * 90, now + 0.12);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.07 + sharpness * 0.05, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  osc.connect(gain);
  gain.connect(channel.input);
  osc.start(now);
  osc.stop(now + 0.12);
  finishLater(channel, now + 0.16, osc, gain);
}
