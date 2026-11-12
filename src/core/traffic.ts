import type { Rng } from './rng';
import { randRange } from './rng';

export type LightState = 'green' | 'yellow' | 'red';

/** Seconds. Red is kept short so little kids don't get bored waiting. */
export const LIGHT_TIMING = {
  greenMin: 3,
  greenMax: 6,
  yellow: 1.5,
  redMin: 2.5,
  redMax: 4.5,
} as const;

const NEXT: Record<LightState, LightState> = { green: 'yellow', yellow: 'red', red: 'green' };

export class TrafficLightModel {
  state: LightState;
  remaining: number;

  constructor(private readonly rng: Rng, initial: LightState = 'green') {
    this.state = initial;
    this.remaining = this.durationFor(initial) * (0.4 + 0.6 * rng());
  }

  durationFor(s: LightState): number {
    if (s === 'green') return randRange(this.rng, LIGHT_TIMING.greenMin, LIGHT_TIMING.greenMax);
    if (s === 'red') return randRange(this.rng, LIGHT_TIMING.redMin, LIGHT_TIMING.redMax);
    return LIGHT_TIMING.yellow;
  }

  /** Advances time; returns true if the colour changed. */
  update(dt: number): boolean {
    this.remaining -= dt;
    let changed = false;
    while (this.remaining <= 0) {
      this.state = NEXT[this.state];
      this.remaining += this.durationFor(this.state);
      changed = true;
    }
    return changed;
  }

  /** Teaching moment: switch to yellow (then red) as the bus approaches. */
  forceToRed(): void {
    if (this.state === 'green') {
      this.state = 'yellow';
      this.remaining = LIGHT_TIMING.yellow;
    }
  }
}
