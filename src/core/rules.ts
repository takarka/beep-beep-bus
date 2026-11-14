/** Scoring and traffic rules — pure functions so they are easy to test and tune. */

export const POINTS = {
  stopServed: 10,
  passenger: 2,
  waitedAtRed: 5,
  ranRedLight: -10,
  missedStop: -5,
  /** Our bus drove into another vehicle. */
  crash: -10,
  /** Drove over a speed bump too fast. */
  speedBump: -5,
  /** Drove over a speed bump slowly and carefully. */
  gentleBump: 3,
  /** Filled up when the tank was getting empty: planning ahead. */
  refuel: 4,
  /** The tank ran dry and somebody had to bring petrol. */
  noFuel: -10,
} as const;

/** This many mistakes in a row (with nothing good in between) bring the police siren. */
export const STRIKES_FOR_SIREN = 3;

/** Bus-front positions (world px) relative to a stop's target line `zoneEnd`. */
export const STOP_ZONE = {
  /** The front may be this far before the target line… */
  before: 230,
  /** …or this far past it, and it still counts as "at the stop". */
  after: 100,
  /** Past this distance the stop counts as missed. */
  miss: 180,
} as const;

/** Bus physics in world px/s and px/s². Gentle on purpose: the players are 4 years old. */
export const PHYSICS = { accel: 320, coast: 200, brake: 700 } as const;

export const brakingDistance = (v: number): number => (v * v) / (2 * PHYSICS.brake);

/** Can a bus moving at speed v still stop before the line (with a small safety margin)? */
export const canStopBefore = (front: number, lineX: number, v: number): boolean =>
  lineX - front >= brakingDistance(v) + 20;

/** How far before a stop line counts as "waiting at the red light". */
export const RED_WAIT_RANGE = 320;

export const crossedLine = (prev: number, cur: number, lineX: number): boolean =>
  prev < lineX && cur >= lineX;

export const isInStopZone = (front: number, zoneEnd: number): boolean =>
  front >= zoneEnd - STOP_ZONE.before && front <= zoneEnd + STOP_ZONE.after;

export const hasMissedStop = (front: number, zoneEnd: number): boolean =>
  front > zoneEnd + STOP_ZONE.miss;

export const isWaitingBeforeLine = (front: number, lineX: number): boolean =>
  front <= lineX && front >= lineX - RED_WAIT_RANGE;

export class ScoreKeeper {
  score = 0;
  mistakes = 0;
  passengersMoved = 0;
  /** Mistakes in a row since the last good deed. */
  streak = 0;

  /** Returns the actual change applied (score never drops below zero). */
  add(delta: number): number {
    const before = this.score;
    this.score = Math.max(0, this.score + delta);
    if (delta < 0) {
      this.mistakes++;
      this.streak++;
    } else if (delta > 0) {
      this.streak = 0; // any good deed clears the streak
    }
    return this.score - before;
  }

  /** Pays for something (a repair). Not a mistake: it doesn't count against the stars or the streak. */
  spend(points: number): number {
    const paid = Math.min(this.score, Math.max(0, Math.round(points)));
    this.score -= paid;
    return paid;
  }

  /** True once when the streak reaches the limit (and the streak starts over). */
  takeWarning(): boolean {
    if (this.streak < STRIKES_FOR_SIREN) return false;
    this.streak = 0;
    return true;
  }

  passenger(): number {
    this.passengersMoved++;
    return this.add(POINTS.passenger);
  }
}

/** Kid-friendly rating: always at least one star. */
export function starsFor(mistakes: number): 1 | 2 | 3 {
  if (mistakes === 0) return 3;
  if (mistakes <= 2) return 2;
  return 1;
}

/** Speed bumps ("sleeping policemen"): how fast is too fast, world px/s. */
export const BUMP = { gentle: 130, hard: 230 } as const;

export type BumpKind = 'gentle' | 'bump' | 'hard';

export interface BumpResult {
  kind: BumpKind;
  /** 0..1: how hard the bus is shaken. */
  power: number;
  /** Speed left after the bump (multiplier). */
  speedFactor: number;
  points: number;
}

/** The slower we cross a bump, the gentler it is: a small wobble, a hop, or a hard jolt that costs speed and points. */
export function bumpResult(v: number): BumpResult {
  const speed = Math.max(0, v);
  if (speed <= BUMP.gentle) return { kind: 'gentle', power: 0.1, speedFactor: 1, points: POINTS.gentleBump };
  if (speed <= BUMP.hard) {
    const k = (speed - BUMP.gentle) / (BUMP.hard - BUMP.gentle);
    return { kind: 'bump', power: 0.35 + 0.3 * k, speedFactor: 0.88, points: 0 };
  }
  const k = Math.min(1, (speed - BUMP.hard) / 200);
  return { kind: 'hard', power: 0.7 + 0.3 * k, speedFactor: 0.5, points: POINTS.speedBump };
}

// ------------------------------------------------------------------ the bus gets damaged

export const MAX_HEALTH = 100;

/**
 * Crashes and hard bumps break the bus. How much: a crash hurts more the faster we hit
 * (and more when it is our fault than when somebody runs into us), and so does a bump.
 */
export function crashDamage(impact: number, atFault: boolean): number {
  const base = 8 + Math.min(Math.max(impact, 0), 340) * 0.05;
  return Math.round(atFault ? base : base * 0.6);
}

export function bumpDamage(r: BumpResult): number {
  if (r.kind === 'gentle') return 0;
  if (r.kind === 'bump') return Math.round(2 + 2 * r.power);
  return Math.round(9 + 8 * r.power);
}

/** A damaged bus is slower and weaker: down to half the speed when it is completely worn out. */
export function performanceFor(health: number): { speedFactor: number; accelFactor: number } {
  const h = Math.min(Math.max(health, 0), MAX_HEALTH);
  const f = h >= 60 ? 1 : 0.5 + 0.5 * (h / 60);
  return { speedFactor: f, accelFactor: f };
}

export type Condition = 'good' | 'worn' | 'damaged' | 'critical';

export function conditionOf(health: number): Condition {
  if (health >= 70) return 'good';
  if (health >= 40) return 'worn';
  if (health >= 15) return 'damaged';
  return 'critical';
}

/** Stars for the route: by mistakes, and one star less if the bus came home badly damaged (never below one). */
export function finalStars(mistakes: number, health: number): 1 | 2 | 3 {
  const base = starsFor(mistakes);
  return health < 40 && base > 1 ? ((base - 1) as 1 | 2) : base;
}

// ------------------------------------------------------------------ petrol and the gas station

export const MAX_FUEL = 100;
/** The "low fuel" warning comes at this level. */
export const LOW_FUEL = 25;

/**
 * Petrol used by a move of `dx` px taking `dt` seconds: more per px the faster we go,
 * a bit extra while pushing the gas, and a little just for idling (waiting at a light).
 */
export function fuelUse(dx: number, dt: number, v: number, accelerating: boolean): number {
  return Math.max(0, dx) * (0.0028 + 0.0000028 * Math.max(0, v)) + dt * (0.2 + (accelerating ? 0.5 : 0));
}

/** With an empty tank the bus only crawls. */
export const fuelPerformance = (fuel: number): number => (fuel > 0 ? 1 : 0.25);

/** The station fixes the bus for points: half a point per percent. */
export const REPAIR_COST_PER_PERCENT = 0.5;

/** How much we can repair for the points we have, and what it costs. */
export function repairPlan(missingHealth: number, score: number): { percent: number; cost: number } {
  const missing = Math.max(0, Math.round(missingHealth));
  const affordable = Math.floor(Math.max(0, score) / REPAIR_COST_PER_PERCENT);
  const percent = Math.min(missing, affordable);
  return { percent, cost: Math.ceil(percent * REPAIR_COST_PER_PERCENT) };
}
