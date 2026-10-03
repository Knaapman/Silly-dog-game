import { GRAVITY } from './config';

// A swing is a pendulum: angle θ from hanging straight down (positive = forwards), angular speed
// ω. Pushing the stick pumps it higher (any direction: a five-year-old can't time a pump, so
// holding the stick is enough); a push from a friend adds a big shove; jumping off flies you
// along the way the seat is going (a bit further than real life: it's more fun).

/** Chain length, from the beam to the seat (m). */
export const SWING_LENGTH = 2.5;
/** How high the beam is (m above the ground). */
export const SWING_PIVOT = 3.4;
/** No higher than this (rad): about three-quarters of the way to level. */
export const SWING_MAX = (75 * Math.PI) / 180;
/** Pumping: angular acceleration along the way it's going (rad/s²). */
export const PUMP = 0.9;
/** A nudge from standstill when the stick is first pushed (rad/s). */
export const KICK = 0.8;
/** A push from a friend (rad/s, added in quadrature: always more swing, never less). */
export const PUSH = 1.5;
/** It slows down by itself: per second, with a child on it / empty. */
export const DAMP_RIDDEN = 0.06;
export const DAMP_EMPTY = 0.8;
/** Jumping off: how much further (and higher) than the real thing. */
export const FLING_ALONG = 1.5;
export const FLING_UP = 1.2;
export const FLING_HOP = 4;

const G = -GRAVITY;
const K = G / SWING_LENGTH;

export type Swing = { theta: number; omega: number };

/** "Energy" per unit (ω²/2 + k(1 − cos θ)): the same at every point of one swing. */
const energy = (s: Swing) => 0.5 * s.omega * s.omega + K * (1 - Math.cos(s.theta));

/** How far out it swings (rad), from where it is and how fast it's going. */
export function amplitude(s: Swing) {
  const c = 1 - energy(s) / K;
  return c <= -1 ? Math.PI : Math.acos(c);
}

/** Keep it under the maximum (by slowing it, keeping its way). */
function cap(s: Swing) {
  const most = K * (1 - Math.cos(SWING_MAX));
  if (energy(s) <= most) return;
  const pot = K * (1 - Math.cos(s.theta));
  if (pot >= most) {
    s.theta = Math.sign(s.theta) * SWING_MAX;
    s.omega = 0;
  } else s.omega = Math.sign(s.omega) * Math.sqrt(2 * (most - pot));
}

/** One step: gravity, a little drag, and pumping while `pump` (the stick is held). */
export function stepSwing(s: Swing, dt: number, pump: boolean, ridden: boolean, kickDir = 1) {
  if (pump) {
    if (amplitude(s) < 0.04 && Math.abs(s.omega) < 0.2) s.omega += kickDir * KICK;
    else s.omega += Math.sign(s.omega || kickDir) * PUMP * dt;
  }
  s.omega += -K * Math.sin(s.theta) * dt;
  s.omega *= Math.exp(-(ridden ? DAMP_RIDDEN : DAMP_EMPTY) * dt);
  s.theta += s.omega * dt;
  cap(s);
  // an empty swing comes to rest
  if (!ridden && !pump && Math.abs(s.omega) < 0.02 && Math.abs(s.theta) < 0.01) s.theta = s.omega = 0;
}

/** A shove: off it goes the way it was pushed (`dir` +1 forwards, −1 back), with more swing. */
export function pushSwing(s: Swing, dir: number, strength = PUSH) {
  s.omega = dir * Math.sqrt(s.omega * s.omega + strength * strength);
  cap(s);
}

/** Where the seat is, relative to the beam: [along (forwards), up]. */
export function seatOffset(s: Swing, length = SWING_LENGTH): [number, number] {
  return [length * Math.sin(s.theta), -length * Math.cos(s.theta)];
}

/** The seat's speed (m/s). */
export const seatSpeed = (s: Swing) => Math.abs(s.omega) * SWING_LENGTH;

/**
 * Jumping off at height `y` (above the ground): the flight's horizontal distance (forwards
 * positive), the top of the arc above the ground, and the time in the air.
 */
export function fling(s: Swing, y: number) {
  const vAlong = SWING_LENGTH * s.omega * Math.cos(s.theta) * FLING_ALONG;
  const vUp = SWING_LENGTH * s.omega * Math.sin(s.theta) * FLING_UP + FLING_HOP;
  const time = (vUp + Math.sqrt(vUp * vUp + 2 * G * Math.max(0, y))) / G;
  return { along: vAlong * time, apex: y + Math.max(0.3, vUp > 0 ? (vUp * vUp) / (2 * G) : 0), time };
}
