import type { LightState } from '../core/traffic';

/**
 * Behaviour of the other road users (pure maths, no Phaser).
 * They drive in the oncoming lane, i.e. towards decreasing x, and follow the rules:
 * stop for red (and for yellow when they still can), keep a distance to the vehicle ahead.
 */
export type VehicleKind = 'car' | 'police' | 'minibus';

export interface VehicleSpec {
  /** Body length in local (unscaled) px. */
  length: number;
  /** Cruise speed range, world px/s. */
  cruise: readonly [number, number];
}

export const SPECS: Record<VehicleKind, VehicleSpec> = {
  car: { length: 150, cruise: [150, 215] },
  police: { length: 160, cruise: [170, 215] },
  minibus: { length: 230, cruise: [120, 170] },
};

export const AI = {
  accel: 150,
  brake: 320,
  /** Gap to keep to the vehicle in front, px. */
  minGap: 55,
  /** Stop this far before a stop line, px. */
  stopMargin: 8,
  /** Only react to lights closer than this, px. */
  lookahead: 700,
} as const;

/** Where the oncoming lane stops, relative to the stop line of our lane (past the zebra crossing). */
export const ONCOMING_STOP_OFFSET = 185;

export const brakingDistance = (v: number): number => (v * v) / (2 * AI.brake);

/** The fastest speed from which a vehicle can still stop within `dist` px. */
export const safeSpeed = (dist: number): number => Math.sqrt(2 * AI.brake * Math.max(0, dist));

export interface LightAhead {
  /** x of the line to stop at. */
  stopX: number;
  state: LightState;
}

export interface DriveInput {
  cruise: number;
  v: number;
  /** x of the leading (left) edge of this vehicle. */
  front: number;
  /** x of the rear (right) edge of the vehicle in front, if any. */
  leaderRear: number | null;
  lights: readonly LightAhead[];
}

/** The speed the driver wants right now. */
export function targetSpeed(p: DriveInput): number {
  let target = p.cruise;
  if (p.leaderRear !== null) target = Math.min(target, safeSpeed(p.front - p.leaderRear - AI.minGap));
  for (const l of p.lights) {
    const dist = p.front - l.stopX; // > 0 while the line is still ahead
    if (dist < -4 || dist > AI.lookahead || l.state === 'green') continue;
    // Physically unable to stop before the line any more: keep going rather than slam the brakes mid-junction.
    // (A vehicle that is braking normally stays about `stopMargin` px outside this zone.)
    if (p.v > 40 && dist < brakingDistance(p.v) - 4) continue;
    target = Math.min(target, safeSpeed(dist - AI.stopMargin));
  }
  return target;
}

export function nextSpeed(v: number, target: number, dt: number): number {
  return v < target ? Math.min(target, v + AI.accel * dt) : Math.max(target, v - AI.brake * dt);
}

/** Types and how often they appear. A single police car at most, and rarely. */
export function pickKind(rng: () => number, policeOnRoad: boolean): VehicleKind {
  if (!policeOnRoad && rng() < 0.12) return 'police';
  return rng() < 0.72 ? 'car' : 'minibus';
}

/** Seconds until the next vehicle appears: busier roads on later levels. */
export function spawnDelay(rng: () => number, level: number): number {
  const busy = Math.min(Math.max(level, 1) * 0.2, 2);
  return Math.max(1.8, 3.6 + rng() * 3.6 - busy);
}
