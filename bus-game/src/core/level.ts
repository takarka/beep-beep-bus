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
  finishX: number;
  length: number;
  maxSpeed: number;
}

export const START_X = 470;
const FIRST_ITEM_X = 1700;

export function levelCounts(level: number): { stops: number; lights: number } {
  const n = Math.min(2 + Math.max(1, level), 7);
  return { stops: n, lights: n };
}

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
      items.push({ kind, zoneEnd: x, waiting: randInt(rng, 1, 4), exiting: randInt(rng, 0, 3) });
    }
    x += randInt(rng, 1100, 1500);
  }

  const finishX = x;
  return {
    level,
    items,
    finishX,
    length: finishX + 1400,
    maxSpeed: Math.min(430 + (level - 1) * 30, 580),
  };
}
