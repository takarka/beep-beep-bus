import type { LightState } from '../core/traffic';

/**
 * Behaviour of the other road users (pure maths, no Phaser).
 * They drive in the oncoming lane, i.e. towards decreasing x, and follow the rules:
 * stop for red (and for yellow when they still can), keep a distance to the vehicle ahead.
 */
export type VehicleKind = 'car' | 'police' | 'taxi' | 'truck' | 'minibus' | 'ambulance';

export interface VehicleSpec {
  /** Body length in local (unscaled) px. */
  length: number;
  /** Cruise speed range, world px/s. */
  cruise: readonly [number, number];
}

export const SPECS: Record<VehicleKind, VehicleSpec> = {
  car: { length: 150, cruise: [150, 215] },
  police: { length: 160, cruise: [170, 215] },
  taxi: { length: 150, cruise: [165, 225] },
  truck: { length: 245, cruise: [105, 145] },
  minibus: { length: 230, cruise: [120, 170] },
  ambulance: { length: 190, cruise: [215, 260] },
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
  /** Real braking power used when planning stops for traffic lights (defaults to `brake`). */
  lightBrake?: number;
}

/** The speed the driver wants right now. */
export function targetSpeed(p: DriveInput): number {
  const brake = p.brake ?? AI.brake;
  const lightBrake = p.lightBrake ?? brake;
  let target = p.cruise;
  if (p.leaderRear !== null) {
    const gap = p.front - p.leaderRear - (p.minGap ?? AI.minGap) - (p.headway ?? 0) * p.v;
    target = Math.min(target, safeSpeed(gap, brake));
  }
  const lightLookahead = Math.max(AI.lookahead, brakingDistance(p.v, lightBrake) + 120);
  for (const l of p.lights) {
    const dist = p.front - l.stopX; // > 0 while the line is still ahead
    if (l.state === 'green' || dist > lightLookahead) continue;
    // A slow or stopped vehicle that crept slightly over a red stop line stays stopped rather than running the red.
    if (dist < -4) {
      if (l.state === 'red' && dist >= -25 && p.v < 60) target = 0;
      continue;
    }
    // On yellow, if physically unable to stop before the line any more, keep going rather than slam the brakes mid-junction.
    // On red, never abort braking before the stop line.
    if (l.state === 'yellow' && p.v > 40 && dist < brakingDistance(p.v, lightBrake) - 4) continue;
    target = Math.min(target, safeSpeed(dist - AI.stopMargin, lightBrake * 0.9));
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

/** Types and how often they appear. At most one emergency vehicle at a time, and rarely. */
export function pickKind(rng: () => number, emergencyOnRoad: boolean): VehicleKind {
  if (!emergencyOnRoad && rng() < 0.14) return rng() < 0.55 ? 'police' : 'ambulance';
  const r = rng();
  if (r < 0.46) return 'car';
  if (r < 0.68) return 'taxi';
  if (r < 0.86) return 'minibus';
  return 'truck';
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

// ------------------------------------------------------------------ overtaking in our two lanes

/** What the lane-change logic needs to know about a vehicle (or our bus): centre x, length, speed. */
export interface LaneBody {
  x: number;
  len: number;
  v: number;
}

/**
 * Can `me` safely be in a lane that holds `others`? A vehicle ahead needs room to brake (more when
 * we are faster than it), a vehicle behind needs room not to run into us (more when it is faster).
 */
export function laneClear(me: LaneBody, others: readonly LaneBody[], ahead = 110, behind = 150): boolean {
  for (const o of others) {
    if (o.x >= me.x) {
      const gap = o.x - o.len / 2 - (me.x + me.len / 2);
      if (gap < ahead + Math.max(0, me.v - o.v)) return false;
    } else {
      const gap = me.x - me.len / 2 - (o.x + o.len / 2);
      if (gap < behind + Math.max(0, o.v - me.v)) return false;
    }
  }
  return true;
}

/**
 * A driver stuck behind a slower vehicle wants to go round it: the vehicle in front is clearly slower
 * than what he would like to drive, and close enough to be in the way.
 */
export function wantsToOvertake(cruise: number, v: number, leader: { gap: number; v: number } | null): boolean {
  if (!leader) return false;
  return leader.v + 20 < cruise && leader.gap < 260 + v * 0.5;
}
