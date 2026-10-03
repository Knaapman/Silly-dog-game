import { onFault } from './faults';
import { isSourceConnected, type SourceId } from './input';
import { ZONES } from './layout';
import { perf } from './perf';
import { unstuckLog } from './player/rescue';
import { players } from './runtime';
import { effectiveQuality, useSettings } from './settings';
import { loadJson, saveJson } from './storage';
import { useStickers } from './stickers';
import { useGame } from './store';

// The play log: a small record of each play session, kept on this device only, that a grown-up
// can save from the menu and send along. It answers what tests in a browser can't: how smooth the
// game really runs on this computer, whether animals get stuck, whether controllers drop out,
// which parts of the park the children actually play in, and any errors.

const KEY = 'playlog:v1';
/** Sessions kept (the oldest go first). */
export const MAX_SESSIONS = 10;
/** Seconds into a session before the frame rate counts (loading and warming up are slower). */
const WARMUP = 10;

export type Session = {
  /** When it started (ISO time) and how long it lasted (s). */
  start: string;
  seconds: number;
  maxPlayers: number;
  animals: string[];
  fps: { min: number; avg: number; samples: number };
  draws: { max: number; avg: number; maxTriangles: number };
  /** The graphics quality, each time it changed. */
  quality: string[];
  unstuck: { hops: number; pops: number; rescues: number; where: { kind: string; x: number; z: number }[] };
  controllerDrops: number;
  errors: string[];
  stickers: string[];
  /** Seconds spent in each part of the park (by the animals, added up). */
  zones: Record<string, number>;
};

type Running = {
  session: Session;
  startedAt: number;
  fpsSum: number;
  drawSum: number;
  drawSamples: number;
  stickersAtStart: Set<string>;
  unstuckAtStart: { hops: number; pops: number; chord: number };
  connected: Map<string, boolean>;
};

let running: Running | null = null;
const pendingErrors: string[] = [];

/** The sessions, kept in memory too (storage can be missing, and test mode never uses it). */
let kept: Session[] | null = null;

/** A saved session that looks whole (storage can hold anything: an old version, a half-written save). */
function isSession(s: unknown): s is Session {
  const q = s as Session | null;
  return !!q && typeof q === 'object' && typeof q.start === 'string' && typeof q.seconds === 'number' && !!q.fps && !!q.draws && !!q.unstuck && Array.isArray(q.errors);
}

export function loadSessions(): Session[] {
  if (!kept) {
    const s = loadJson<unknown>(KEY);
    kept = Array.isArray(s) ? s.filter(isSession).slice(-MAX_SESSIONS) : [];
  }
  return kept;
}

function save() {
  if (!running) return;
  const sessions = loadSessions().filter((s) => s.start !== running!.session.start);
  sessions.push(running.session);
  kept = sessions.slice(-MAX_SESSIONS);
  saveJson(KEY, kept);
}

function begin(now: number) {
  running = {
    session: {
      start: new Date().toISOString(),
      seconds: 0,
      maxPlayers: 0,
      animals: [],
      fps: { min: 0, avg: 0, samples: 0 },
      draws: { max: 0, avg: 0, maxTriangles: 0 },
      quality: [effectiveQuality()],
      unstuck: { hops: 0, pops: 0, rescues: 0, where: [] },
      controllerDrops: 0,
      errors: [],
      stickers: [],
      zones: {}
    },
    startedAt: now,
    fpsSum: 0,
    drawSum: 0,
    drawSamples: 0,
    stickersAtStart: new Set(useStickers.getState().got),
    unstuckAtStart: { hops: unstuckLog.hops, pops: unstuckLog.pops, chord: unstuckLog.chord },
    connected: new Map()
  };
}

/** Once a second (now: ms): note how the session is going. */
export function tickPlayLog(now = performance.now()) {
  const game = useGame.getState();
  if (game.phase !== 'play') {
    if (running) {
      save();
      running = null;
    }
    return;
  }
  if (!running) begin(now);
  const r = running!;
  const s = r.session;
  s.seconds = Math.round((now - r.startedAt) / 1000);
  s.maxPlayers = Math.max(s.maxPlayers, game.players.length);
  for (const p of game.players) if (!s.animals.includes(p.species)) s.animals.push(p.species);

  // smoothness (only once warmed up, and not while the tab is hidden)
  const visible = typeof document === 'undefined' || !document.hidden;
  if (s.seconds >= WARMUP && visible && perf.fps > 0) {
    r.fpsSum += perf.fps;
    s.fps.samples += 1;
    s.fps.avg = Math.round((r.fpsSum / s.fps.samples) * 10) / 10;
    s.fps.min = s.fps.samples === 1 ? Math.round(perf.fps) : Math.min(s.fps.min, Math.round(perf.fps));
  }
  if (perf.calls > 0) {
    r.drawSum += perf.calls;
    r.drawSamples += 1;
    s.draws.avg = Math.round(r.drawSum / r.drawSamples);
    s.draws.max = Math.max(s.draws.max, perf.calls);
    s.draws.maxTriangles = Math.max(s.draws.maxTriangles, perf.triangles);
  }
  const q = effectiveQuality(useSettings.getState());
  if (s.quality[s.quality.length - 1] !== q) s.quality.push(q);

  // getting stuck, and the rescues
  s.unstuck.hops = unstuckLog.hops - r.unstuckAtStart.hops;
  s.unstuck.pops = unstuckLog.pops - r.unstuckAtStart.pops;
  s.unstuck.rescues = unstuckLog.chord - r.unstuckAtStart.chord;
  // (where: the latest ones, up to ten, from this session)
  const n = Math.min(10, s.unstuck.hops + s.unstuck.pops + s.unstuck.rescues);
  s.unstuck.where = n > 0 ? unstuckLog.where.slice(-n).map((w) => ({ kind: w.kind, x: w.x, z: w.z })) : [];

  // controllers dropping out
  for (const p of game.players) {
    const on = isSourceConnected(p.source as SourceId);
    const was = r.connected.get(p.source);
    if (was === true && !on) s.controllerDrops += 1;
    r.connected.set(p.source, on);
  }

  // stickers earned (which things got played with), and where in the park the animals are
  s.stickers = useStickers.getState().got.filter((id) => !r.stickersAtStart.has(id));
  for (const p of players.values()) {
    if (p.asleep || p.bot) continue;
    let best = '';
    let bd = Infinity;
    for (const [name, [x, z]] of Object.entries(ZONES)) {
      const d = Math.hypot(p.position.x - x, p.position.z - z);
      if (d < bd) {
        bd = d;
        best = name;
      }
    }
    s.zones[best] = (s.zones[best] ?? 0) + 1;
  }

  while (pendingErrors.length && s.errors.length < 20) {
    const e = pendingErrors.shift()!;
    if (!s.errors.includes(e)) s.errors.push(e);
  }
  if (s.seconds % 10 === 0) save();
}

/** Remember an error (for the current session's log). */
export function logError(message: string) {
  if (pendingErrors.length < 20) pendingErrors.push(message.slice(0, 300));
}

/** Everything in the log, ready to save as a file. */
export function playLogFile() {
  save();
  const s = useSettings.getState();
  return JSON.stringify(
    {
      saved: new Date().toISOString(),
      device: {
        browser: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        gpu: s.gpu,
        screen: typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height} @${window.devicePixelRatio}` : ''
      },
      sessions: loadSessions()
    },
    null,
    2
  );
}

export function clearPlayLog() {
  kept = [];
  saveJson(KEY, []);
  running = null;
}

/** Start keeping the log (not in test mode: tests tick it themselves). */
export function startPlayLog(test: boolean) {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (e) => logError(String(e.message || e.error)));
  window.addEventListener('unhandledrejection', (e) => logError(`unhandled: ${String(e.reason)}`));
  // (and whatever went wrong but was kept from stopping the game: see faults.ts)
  onFault(logError);
  if (!test) window.setInterval(() => tickPlayLog(), 1000);
  window.addEventListener('pagehide', save);
}
