import { mulberry32, pick, randInt } from './rng';
import type { LightState } from './traffic';

export interface StopData {
  kind: 'stop';
  /** World x the bus front should reach (± STOP_ZONE). */
  zoneEnd: number;
  waiting: number;
  /** How many riders want to get off here (capped by who is aboard at runtime). */
  exiting: number;
}

export interface LightData {
  kind: 'light';
  /** World x of the stop line. */
  lineX: number;
  initial: LightState;
  /** First light of a level turns red as the bus approaches, to teach the rule. */
  teach: boolean;
  seed: number;
}

export type LevelItem = StopData | LightData;

export interface LevelData {
  level: number;
  items: LevelItem[];
  /** Where the gas stations are: the world x the bus front should reach (like a stop's `zoneEnd`). */
  stations: number[];
  /** World x of the speed bumps (from level 2). */
  bumps: number[];
  /** World x of the stop lines of uncontrolled pedestrian crossings (from level 2). */
  crosswalks: number[];
  /** World x of the stop lines with a STOP sign (from level 3). */
  stopSigns: number[];
  /** World x of parked cars on the main lane (from level 3). */
  parked: number[];
  /** World x of "Children" warning zones (from level 4). */
  children: number[];
  finishX: number;
  length: number;
  maxSpeed: number;
}

export const START_X = 470;
const FIRST_ITEM_X = 3200;
/** Minimum / maximum distance between two neighbouring lights or stops (world px). */
export const MIN_GAP = 3300;
export const MAX_GAP = 4100;

/** More stops and lights as the route goes on: 3 on levels 1–2 up to 8 on levels 11–12. */
export function levelCounts(level: number): { stops: number; lights: number } {
  const n = Math.min(3 + Math.floor((Math.max(1, level) - 1) / 2), 8);
  return { stops: n, lights: n };
}

/** How many speed bumps a level has: none on level 1, then one more every three levels. */
export const bumpCountFor = (level: number): number => (level < 2 ? 0 : Math.min(1 + Math.floor((Math.max(level, 1) - 1) / 3), 4));

/** Uncontrolled pedestrian crossings: none on level 1, then 1..3 on higher levels. */
export const crosswalkCountFor = (level: number): number => (level < 2 ? 0 : level < 6 ? 1 : level < 11 ? 2 : 3);

/** STOP signs: none on levels 1–2, then 1..2 on higher levels. */
export const stopSignCountFor = (level: number): number => (level < 3 ? 0 : level < 8 ? 1 : 2);

/** Parked cars blocking the right lane: none on levels 1–2, then 1..2 on higher levels. */
export const parkedCountFor = (level: number): number => (level < 3 ? 0 : level < 11 ? 1 : 2);

/** "Children" speed-limit signs: none on levels 1–3, then 1 per route. */
export const childrenCountFor = (level: number): number => (level < 4 ? 0 : 1);

/** Gas stations: none on level 1 (no petrol system yet), one on levels 2–5, two on 6–9, three after that. */
export const stationCountFor = (level: number): number => (level < 2 ? 0 : level <= 5 ? 1 : level <= 9 ? 2 : 3);

/** Bus speed limit for a level (world px/s): gentle at first, a bit faster later. */
export const maxSpeedFor = (level: number): number => Math.min(340 + (Math.max(1, level) - 1) * 15, 510);

/** The most people that may wait at one stop. */
export const maxWaitingFor = (level: number): number => Math.min(3 + Math.floor(Math.max(1, level) / 3), 6);

export function generateLevel(level: number, seed = level * 7919): LevelData {
  const rng = mulberry32(seed);
  const { stops, lights } = levelCounts(level);

  // Interleave: light, stop, light, stop…
  const kinds: Array<'stop' | 'light'> = [];
  for (let i = 0; i < Math.max(stops, lights); i++) {
    if (i < lights) kinds.push('light');
    if (i < stops) kinds.push('stop');
  }

  const items: LevelItem[] = [];
  let x = FIRST_ITEM_X;
  let firstLight = true;
  for (const kind of kinds) {
    if (kind === 'light') {
      items.push({
        kind,
        lineX: x,
        initial: firstLight ? 'green' : pick(rng, ['green', 'green', 'red', 'yellow'] as const),
        teach: firstLight,
        seed: randInt(rng, 1, 1e9),
      });
      firstLight = false;
    } else {
      items.push({ kind, zoneEnd: x, waiting: randInt(rng, 1, maxWaitingFor(level)), exiting: randInt(rng, 0, 3) });
    }
    x += randInt(rng, MIN_GAP, MAX_GAP);
  }

  const spots = items.map((i) => (i.kind === 'stop' ? i.zoneEnd : i.lineX));
  const gaps = spots.slice(1).map((_, i) => i);

  // Gas stations go into gaps spread evenly along the route, in the middle of the gap.
  const stations: number[] = [];
  const nStations = stationCountFor(level);
  for (let k = 0; k < nStations && gaps.length > 0; k++) {
    const want = Math.floor(((k + 0.5) / nStations) * (spots.length - 1));
    let best = 0;
    for (let i = 1; i < gaps.length; i++) if (Math.abs(gaps[i]! - want) < Math.abs(gaps[best]! - want)) best = i;
    const g = gaps.splice(best, 1)[0]!;
    stations.push(Math.round((spots[g]! + spots[g + 1]!) / 2));
  }
  stations.sort((a, b) => a - b);

  // Speed bumps go into the other gaps, well away from lights and stops.
  const bumps: number[] = [];
  for (let n = bumpCountFor(level); n > 0 && gaps.length > 0; n--) {
    const g = gaps.splice(randInt(rng, 0, gaps.length - 1), 1)[0]!;
    bumps.push(Math.round((spots[g]! + spots[g + 1]!) / 2 + randInt(rng, -250, 250)));
  }
  bumps.sort((a, b) => a - b);

  // Uncontrolled pedestrian crossings go into remaining gaps.
  const crosswalks: number[] = [];
  for (let n = crosswalkCountFor(level); n > 0 && gaps.length > 0; n--) {
    const g = gaps.splice(randInt(rng, 0, gaps.length - 1), 1)[0]!;
    crosswalks.push(Math.round((spots[g]! + spots[g + 1]!) / 2 + randInt(rng, -250, 250)));
  }
  crosswalks.sort((a, b) => a - b);

  // STOP signs go into remaining gaps.
  const stopSigns: number[] = [];
  for (let n = stopSignCountFor(level); n > 0 && gaps.length > 0; n--) {
    const g = gaps.splice(randInt(rng, 0, gaps.length - 1), 1)[0]!;
    stopSigns.push(Math.round((spots[g]! + spots[g + 1]!) / 2 + randInt(rng, -250, 250)));
  }
  stopSigns.sort((a, b) => a - b);

  // Parked cars go into remaining gaps.
  const parked: number[] = [];
  for (let n = parkedCountFor(level); n > 0 && gaps.length > 0; n--) {
    const g = gaps.splice(randInt(rng, 0, gaps.length - 1), 1)[0]!;
    parked.push(Math.round((spots[g]! + spots[g + 1]!) / 2 + randInt(rng, -250, 250)));
  }
  parked.sort((a, b) => a - b);

  // "Children" signs go into remaining gaps.
  const children: number[] = [];
  for (let n = childrenCountFor(level); n > 0 && gaps.length > 0; n--) {
    const g = gaps.splice(randInt(rng, 0, gaps.length - 1), 1)[0]!;
    children.push(Math.round((spots[g]! + spots[g + 1]!) / 2 + randInt(rng, -250, 250)));
  }
  children.sort((a, b) => a - b);

  const finishX = x;
  return {
    level,
    items,
    stations,
    bumps,
    crosswalks,
    stopSigns,
    parked,
    children,
    finishX,
    length: finishX + 1400,
    maxSpeed: maxSpeedFor(level),
  };
}
