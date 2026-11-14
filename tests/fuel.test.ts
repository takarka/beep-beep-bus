import { describe, expect, it } from 'vitest';
import { generateLevel, stationCountFor } from '../src/core/level';
import {
  MAX_FUEL,
  POINTS,
  REPAIR_COST_PER_PERCENT,
  ScoreKeeper,
  fuelPerformance,
  fuelUse,
  repairPlan,
} from '../src/core/rules';

/** A typical careful route: cruising at 250 px/s with waits at lights and stops. */
function fuelForRoute(level: number): number {
  const lvl = generateLevel(level);
  const length = lvl.finishX - 470;
  const cruise = 250;
  const driving = fuelUse(length, length / cruise, cruise, false);
  const waiting = lvl.items.length * 4 * 0.2; // ~4 s idling at every light and stop
  const accelerating = lvl.items.length * 3 * 0.5; // ~3 s of pushing the gas after every one
  return driving + waiting + accelerating;
}

describe('petrol', () => {
  it('faster = more petrol per px, idling costs a little, accelerating more', () => {
    expect(fuelUse(1000, 4, 250, false)).toBeLessThan(fuelUse(1000, 2, 500, false));
    expect(fuelUse(0, 5, 0, false)).toBeGreaterThan(0);
    expect(fuelUse(0, 5, 0, true)).toBeGreaterThan(fuelUse(0, 5, 0, false));
    expect(fuelUse(-10, 0, 100, false)).toBe(0);
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

describe('repair at the station', () => {
  it('costs half a point per percent, limited by the points we have', () => {
    expect(repairPlan(40, 100)).toEqual({ percent: 40, cost: 20 });
    expect(repairPlan(40, 10)).toEqual({ percent: 20, cost: 10 }); // can only afford half of it
    expect(repairPlan(40, 0)).toEqual({ percent: 0, cost: 0 });
    expect(repairPlan(0, 100)).toEqual({ percent: 0, cost: 0 });
    for (const score of [1, 7, 33, 90]) expect(repairPlan(60, score).cost).toBeLessThanOrEqual(score);
    expect(REPAIR_COST_PER_PERCENT).toBe(0.5);
  });

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
