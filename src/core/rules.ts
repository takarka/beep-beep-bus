import type { StopPlace } from './level';

/** Scoring and traffic rules — pure functions so they are easy to test and tune. */

export const POINTS = {
  stopServed: 10,
  passenger: 2,
  /** Bonus for dropping off a passenger at their requested destination stop. */
  destination: 4,
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
  /** For leaving the depot with a bus that is as good as new. */
  repaired: 6,
  /** The tank ran dry and somebody had to bring petrol. */
  noFuel: -10,
  /** Stopped to let pedestrians cross at an uncontrolled zebra crossing. */
  yielded: 5,
  /** Drove across an uncontrolled zebra while pedestrians were crossing. */
  ranCrosswalk: -10,
  /** Made a full stop at a STOP sign. */
  stopSign: 5,
  /** Drove past a STOP sign without stopping. */
  ranStopSign: -10,
  /** Drove carefully past a "Children" sign. */
  carefulChildren: 3,
  /** Drove too fast past a "Children" sign. */
  fastChildren: -5,
  /** Moved out of the way to let an ambulance pass. */
  yieldAmbulance: 5,
  /** Blocked an ambulance with its siren on. */
  blockAmbulance: -5,
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

/** Reversing is slow and careful: a low top speed and a gentle pull. */
export const REVERSE = { max: 130, accel: 170 } as const;

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

/** Splits onboard passengers into those who want to get off at `place` and those staying aboard. */
export function countMatchingDestinations(
  aboard: readonly StopPlace[],
  place: StopPlace,
): { exiting: number; remaining: StopPlace[] } {
  let exiting = 0;
  const remaining: StopPlace[] = [];
  for (const d of aboard) {
    if (d === place) exiting++;
    else remaining.push(d);
  }
  return { exiting, remaining };
}

/** Kid-friendly rating: always at least one star. */
export function starsFor(mistakes: number): 1 | 2 | 3 {
  if (mistakes === 0) return 3;
  if (mistakes <= 2) return 2;
  return 1;
}

/** Speed bumps ("sleeping policemen"): how fast is too fast, world px/s. */
export const BUMP = { gentle: 130, hard: 230 } as const;

/** "Children" warning zone: slow down past the sign. */
export const CHILDREN = { gentle: 165, fast: 235 } as const;

export function childrenZoneResult(v: number): 'gentle' | 'ok' | 'fast' {
  const speed = Math.max(0, v);
  if (speed <= CHILDREN.gentle) return 'gentle';
  if (speed <= CHILDREN.fast) return 'ok';
  return 'fast';
}

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

/** What the engine is doing during a short moment of driving. */
export interface FuelInput {
  /** How long this moment lasted (s). */
  dt: number;
  /** Speed (px/s) and the real acceleration (px/s², negative when slowing down). */
  v: number;
  accel: number;
  /** Is the gas pedal pressed? Without it the engine only idles or coasts. */
  gas: boolean;
  boosting?: boolean;
  /** People on board: a heavier bus uses more petrol. */
  passengers?: number;
  /** A worn-out engine is thirstier. */
  health?: number;
}

/** Petrol per second just for the engine running, and while coasting with the foot off the gas (the engine nearly shuts off). */
const FUEL_IDLE = 0.17;
const FUEL_COAST = 0.06;
/** Petrol per second per px/s of speed (tyres, gears), per (px/s)³ (air: it grows fast), and per (px/s)·(px/s²) of speeding up. */
const FUEL_ROLL = 0.00105;
const FUEL_DRAG = 1.45e-8;
const FUEL_PUSH = 9e-6;

/**
 * Petrol used in a short moment, like a real engine (the numbers are scaled to the game):
 * - standing with the engine on, or coasting without gas, costs almost nothing;
 * - holding a speed costs more the faster it is, and the air makes it grow much faster than the speed
 *   (so a fast bus burns far more per metre than a calm one, and crawling is wasteful too);
 * - speeding up costs extra (the harder the push, the more), and braking throws that energy away;
 * - nitro burns a lot, passengers add weight, and a worn-out engine is thirstier.
 */
export function fuelUse(i: FuelInput): number {
  if (i.dt <= 0) return 0;
  const v = Math.max(0, i.v);
  const mass = 1 + 0.012 * Math.min(Math.max(i.passengers ?? 0, 0), 14);
  let perSecond = i.gas ? FUEL_IDLE + (FUEL_ROLL * v + FUEL_DRAG * v * v * v) * mass + FUEL_PUSH * Math.max(0, i.accel) * v * mass : v > 5 ? FUEL_COAST : FUEL_IDLE * 0.8;
  if (i.boosting) perSecond *= NITRO.fuelFactor;
  const wear = i.health === undefined ? 1 : 1 + (0.25 * Math.max(0, 60 - i.health)) / 60;
  return perSecond * wear * i.dt;
}

/** With an empty tank the bus only crawls. */
export const fuelPerformance = (fuel: number): number => (fuel > 0 ? 1 : 0.25);

// ------------------------------------------------------------------ nitro: a short burst of speed

export const NITRO = {
  max: 100,
  /** Used up per second of boosting: about 2.6 s from a full tank. */
  use: 38,
  /** Refills per second when not used: about 14 s from empty. */
  recharge: 7,
  /** After running dry it can only be used again once this much has refilled. */
  minToStart: 20,
  /** Top speed and pull while boosting, compared with normal. */
  speedFactor: 1.45,
  accelFactor: 2.6,
  /** Boosting burns petrol this much faster. */
  fuelFactor: 1.8,
  /** Nitro given for serving a bus stop properly. */
  stopReward: 20,
} as const;

export interface NitroState {
  nitro: number;
  /** True after running dry, until enough has refilled. */
  locked: boolean;
}

/** One step of the nitro tank: drains while boosting (and wanted), refills otherwise. */
export function nitroStep(state: NitroState, wanted: boolean, dt: number): NitroState & { boosting: boolean } {
  let { nitro, locked } = state;
  if (locked && nitro >= NITRO.minToStart) locked = false;
  const boosting = wanted && !locked && nitro > 0;
  if (boosting) {
    nitro = Math.max(0, nitro - NITRO.use * dt);
    if (nitro <= 0) locked = true;
  } else {
    nitro = Math.min(NITRO.max, nitro + NITRO.recharge * dt);
  }
  return { nitro, locked, boosting };
}
