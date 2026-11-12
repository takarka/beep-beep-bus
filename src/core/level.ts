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
  /** World x of the speed bumps (from level 2). */
  bumps: number[];
  finishX: number;
  length: number;
  maxSpeed: number;
}

export const START_X = 470;
const FIRST_ITEM_X = 2300;
/** Minimum / maximum distance between two neighbouring lights or stops (world px). */
export const MIN_GAP = 2100;
export const MAX_GAP = 2700;

/** More stops and lights as the route goes on: 3 on levels 1–2 up to 8 on levels 11–12. */
export function levelCounts(level: number): { stops: number; lights: number } {
  const n = Math.min(3 + Math.floor((Math.max(1, level) - 1) / 2), 8);
  return { stops: n, lights: n };
}

/** How many speed bumps a level has: none on level 1, then one more every three levels. */
export const bumpCountFor = (level: number): number => (level < 2 ? 0 : Math.min(1 + Math.floor((Math.max(level, 1) - 1) / 3), 4));

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

  // Speed bumps go into the gaps between lights and stops, well away from both.
  const spots = items.map((i) => (i.kind === 'stop' ? i.zoneEnd : i.lineX));
  const gaps = spots.slice(1).map((_, i) => i);
  const bumps: number[] = [];
  for (let n = bumpCountFor(level); n > 0 && gaps.length > 0; n--) {
    const g = gaps.splice(randInt(rng, 0, gaps.length - 1), 1)[0]!;
    bumps.push(Math.round((spots[g]! + spots[g + 1]!) / 2 + randInt(rng, -250, 250)));
  }
  bumps.sort((a, b) => a - b);

  const finishX = x;
  return {
    level,
    items,
    bumps,
    finishX,
    length: finishX + 1400,
    maxSpeed: maxSpeedFor(level),
  };
}
