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

export const brakingDistance = (v: number, brake: number = AI.brake): number => (v * v) / (2 * brake);

/** The fastest speed from which a vehicle can still stop within `dist` px. */
export const safeSpeed = (dist: number, brake: number = AI.brake): number => Math.sqrt(2 * brake * Math.max(0, dist));

/**
 * Drivers in our own lane. Careful ones keep a generous gap and can always stop for us.
 * Hasty ones follow close and overestimate their brakes (they plan for 600 px/s² but really
 * only have 190): if our bus stops suddenly they run into it.
 */
export type Driver = 'careful' | 'hasty';
export const DRIVERS: Record<Driver, { minGap: number; headway: number; planBrake: number; brake: number }> = {
  careful: { minGap: 55, headway: 1.0, planBrake: 320, brake: 320 },
  hasty: { minGap: 6, headway: 0.08, planBrake: 600, brake: 190 },
};

export interface LightAhead {
  /** x of the line to stop at. */
  stopX: number;
  state: LightState;
}

/** A stretch of road with a speed limit (a speed bump). `start` is in the driver's own coordinates, like `stopX`. */
export interface SpeedZone {
  start: number;
  length: number;
  limit: number;
}

/** Vehicles slow to this speed over a bump. */
export const BUMP_LIMIT = 95;
export const BUMP_ZONE_LENGTH = 120;
/** The zone starts this far before the bump's centre and ends this far after it (world px). */
export const BUMP_ZONE_BEFORE = 60;

/** Speed zones of the bumps for traffic that drives towards smaller x (oncoming), or larger x (mirrored: pass `mirror`). */
export function bumpZones(bumps: readonly number[], mirror: boolean): SpeedZone[] {
  return bumps.map((bx) =>
    mirror
      ? { start: -(bx - BUMP_ZONE_BEFORE), length: BUMP_ZONE_LENGTH, limit: BUMP_LIMIT }
      : { start: bx + BUMP_ZONE_BEFORE, length: BUMP_ZONE_LENGTH, limit: BUMP_LIMIT },
  );
}

export interface DriveInput {
  cruise: number;
  v: number;
  /** x of the leading (left) edge of this vehicle. */
  front: number;
  /** x of the rear (right) edge of the vehicle in front, if any. */
  leaderRear: number | null;
  lights: readonly LightAhead[];
  zones?: readonly SpeedZone[];
  /** Extra following distance in seconds of driving (default 0), minimum gap and the braking power the driver *plans* with. */
  headway?: number;
  minGap?: number;
  brake?: number;
}

/** The speed the driver wants right now. */
export function targetSpeed(p: DriveInput): number {
  const brake = p.brake ?? AI.brake;
  let target = p.cruise;
  if (p.leaderRear !== null) {
    const gap = p.front - p.leaderRear - (p.minGap ?? AI.minGap) - (p.headway ?? 0) * p.v;
    target = Math.min(target, safeSpeed(gap, brake));
  }
  for (const l of p.lights) {
    const dist = p.front - l.stopX; // > 0 while the line is still ahead
    if (dist < -4 || dist > AI.lookahead || l.state === 'green') continue;
    // Physically unable to stop before the line any more: keep going rather than slam the brakes mid-junction.
    // (A vehicle that is braking normally stays about `stopMargin` px outside this zone.)
    if (p.v > 40 && dist < brakingDistance(p.v, brake) - 4) continue;
    target = Math.min(target, safeSpeed(dist - AI.stopMargin, brake));
  }
  for (const z of p.zones ?? []) {
    const dist = p.front - z.start; // > 0: the zone is still ahead
    if (dist < -z.length) continue; // already through
    // Slow down in time to be at the limit when the zone starts.
    target = Math.min(target, dist > 0 ? Math.sqrt(z.limit * z.limit + 2 * brake * dist) : z.limit);
  }
  return target;
}

export function nextSpeed(v: number, target: number, dt: number, brake: number = AI.brake): number {
  return v < target ? Math.min(target, v + AI.accel * dt) : Math.max(target, v - brake * dt);
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

/** Traffic in our own lane: appears from level 2, and gets denser and a bit less careful later. */
export function lanePlan(level: number): {
  enabled: boolean;
  /** Seconds between new vehicles ahead of us / coming up behind us. */
  ahead: readonly [number, number];
  behind: readonly [number, number];
  hastyChance: number;
} {
  const l = Math.max(level, 1);
  return {
    enabled: l >= 2,
    ahead: [Math.max(9, 18 - l * 0.8), Math.max(14, 26 - l * 1.0)],
    behind: [Math.max(8, 15 - l * 0.6), Math.max(13, 24 - l * 0.8)],
    hastyChance: l >= 5 ? Math.min(0.15 + (l - 5) * 0.03, 0.35) : 0,
  };
}
