/** Scoring and traffic rules — pure functions so they are easy to test and tune. */

export const POINTS = {
  stopServed: 10,
  passenger: 2,
  waitedAtRed: 5,
  ranRedLight: -10,
  missedStop: -5,
} as const;

/** Bus-front positions (world px) relative to a stop's target line `zoneEnd`. */
export const STOP_ZONE = {
  /** The front may be this far before the target line… */
  before: 230,
  /** …or this far past it, and it still counts as "at the stop". */
  after: 50,
  /** Past this distance the stop counts as missed. */
  miss: 140,
} as const;

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

  /** Returns the actual change applied (score never drops below zero). */
  add(delta: number): number {
    const before = this.score;
    this.score = Math.max(0, this.score + delta);
    if (delta < 0) this.mistakes++;
    return this.score - before;
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
