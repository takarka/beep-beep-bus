import { describe, expect, it } from 'vitest';
import { generateLevel, stationCountFor } from '../src/core/level';
import {
  MAX_FUEL,
  POINTS,
  ScoreKeeper,
  fuelPerformance,
  fuelUse,
} from '../src/core/rules';

/** A typical careful route: cruising at 250 px/s with waits at lights and stops. */
function fuelForRoute(level: number): number {
  const lvl = generateLevel(level);
  const length = lvl.finishX - 470;
  const cruise = 250;
  const driving = fuelUse({ dt: length / cruise, v: cruise, accel: 0, gas: true });
  const waiting = lvl.items.length * fuelUse({ dt: 4, v: 0, accel: 0, gas: false }); // ~4 s idling at every light and stop
  const starting = lvl.items.length * fuelUse({ dt: 2.5, v: 125, accel: 100, gas: true }); // speeding up again after each
  const braking = lvl.items.length * fuelUse({ dt: 2, v: 125, accel: -120, gas: false });
  return driving + waiting + starting + braking;
}

const GO = { dt: 1, accel: 0, gas: true } as const;

describe('petrol', () => {
  it('speed: a fast bus burns much more per metre than a calm one, and crawling is wasteful too', () => {
    const perPx = (v: number) => fuelUse({ ...GO, v }) / v;
    expect(perPx(500)).toBeGreaterThan(perPx(250) * 1.5);
    expect(perPx(250)).toBeGreaterThan(perPx(150));
    expect(perPx(40)).toBeGreaterThan(perPx(150));
  });

  it('standing and coasting cost almost nothing, speeding up and braking waste petrol', () => {
    const stand = fuelUse({ dt: 5, v: 0, accel: 0, gas: false });
    expect(stand).toBeGreaterThan(0);
    expect(fuelUse({ dt: 5, v: 0, accel: 0, gas: true })).toBeGreaterThan(stand);
    // coasting at speed is cheaper than holding the same speed on the gas
    expect(fuelUse({ dt: 1, v: 250, accel: -20, gas: false })).toBeLessThan(fuelUse({ ...GO, v: 250 }) * 0.3);
    // a hard push costs more than a gentle one
    expect(fuelUse({ ...GO, v: 200, accel: 300 })).toBeGreaterThan(fuelUse({ ...GO, v: 200, accel: 80 }));
    expect(fuelUse({ ...GO, v: 200, accel: 80 })).toBeGreaterThan(fuelUse({ ...GO, v: 200 }));
    expect(fuelUse({ dt: 0, v: 100, accel: 0, gas: true })).toBe(0);
  });

  it('nitro, a full bus and a worn-out engine all use more', () => {
    const base = fuelUse({ ...GO, v: 250 });
    expect(fuelUse({ ...GO, v: 250, boosting: true })).toBeCloseTo(base * 1.8, 5);
    expect(fuelUse({ ...GO, v: 250, passengers: 12 })).toBeGreaterThan(base);
    expect(fuelUse({ ...GO, v: 250, passengers: 12 })).toBeLessThan(base * 1.2);
    expect(fuelUse({ ...GO, v: 250, health: 20 })).toBeGreaterThan(base * 1.1);
    expect(fuelUse({ ...GO, v: 250, health: 100 })).toBeCloseTo(base, 8);
  });

  it('an empty tank means a crawl', () => {
    expect(fuelPerformance(50)).toBe(1);
    expect(fuelPerformance(0)).toBe(0.25);
  });

  it('level 2 needs no refuelling, long routes do, and the stations are always enough', () => {
    expect(fuelForRoute(2)).toBeLessThan(MAX_FUEL * 0.85);
    expect(fuelForRoute(12)).toBeGreaterThan(MAX_FUEL * 1.5);
    for (let l = 2; l <= 12; l++) {
      const need = fuelForRoute(l);
      // the tank plus every station's fill, with a generous margin for a clumsy driver
      expect((1 + stationCountFor(l)) * MAX_FUEL).toBeGreaterThan(need * 1.25);
    }
  });

  it('level 1 has no station; later levels have more', () => {
    expect(stationCountFor(1)).toBe(0);
    expect(generateLevel(1).stations).toEqual([]);
    expect(stationCountFor(2)).toBe(1);
    expect(stationCountFor(12)).toBe(3);
    for (let l = 2; l <= 12; l++) expect(generateLevel(l).stations).toHaveLength(stationCountFor(l));
  });

  it('stations are spread along the route and well away from lights, stops and bumps', () => {
    for (let l = 2; l <= 12; l++) {
      const lvl = generateLevel(l);
      expect(lvl.stations).toEqual(generateLevel(l).stations); // deterministic
      const spots = lvl.items.map((i) => (i.kind === 'stop' ? i.zoneEnd : i.lineX));
      for (const s of lvl.stations) {
        for (const sp of spots) expect(Math.abs(s - sp)).toBeGreaterThan(700);
        for (const b of lvl.bumps) expect(Math.abs(s - b)).toBeGreaterThan(700);
        expect(s).toBeLessThan(lvl.finishX);
      }
      for (let i = 1; i < lvl.stations.length; i++) expect(lvl.stations[i]! - lvl.stations[i - 1]!).toBeGreaterThan(2000);
    }
  });
});

describe('petrol and paying', () => {
  it('paying is not a mistake and never goes below zero', () => {
    const s = new ScoreKeeper();
    s.add(30);
    expect(s.spend(12)).toBe(12);
    expect(s.score).toBe(18);
    expect(s.mistakes).toBe(0);
    expect(s.streak).toBe(0);
    expect(s.spend(100)).toBe(18);
    expect(s.score).toBe(0);
    expect(s.mistakes).toBe(0);
  });

  it('refuelling in time is rewarded, an empty tank costs points', () => {
    expect(POINTS.refuel).toBeGreaterThan(0);
    expect(POINTS.noFuel).toBeLessThan(0);
  });
});
