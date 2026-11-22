import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/core/rng';
import {
  AI,
  DRIVERS,
  SPECS,
  brakingDistance,
  nextSpeed,
  pickKind,
  safeSpeed,
  spawnDelay,
  targetSpeed,
  type LightAhead,
} from '../src/traffic/ai';

/** Drives one vehicle towards decreasing x for `seconds`; returns its final front x and speed. */
function drive(start: { front: number; v: number }, cruise: number, lights: () => LightAhead[], seconds: number, leader?: () => number | null) {
  let { front, v } = start;
  const dt = 1 / 60;
  let minFront = front;
  for (let t = 0; t < seconds; t += dt) {
    v = nextSpeed(v, targetSpeed({ cruise, v, front, leaderRear: leader ? leader() : null, lights: lights() }), dt);
    front -= v * dt;
    minFront = Math.min(minFront, front);
  }
  return { front, v, minFront };
}

describe('oncoming traffic', () => {
  it('stops before a red line and waits there', () => {
    const stopX = 1000;
    const r = drive({ front: 1900, v: 200 }, 200, () => [{ stopX, state: 'red' }], 25);
    expect(r.v).toBeLessThan(1);
    expect(r.front).toBeGreaterThanOrEqual(stopX); // never crossed the line
    expect(r.front).toBeLessThan(stopX + 30);
  });

  it('drives on when the light is green, and goes again when it turns green', () => {
    const green = drive({ front: 1900, v: 200 }, 200, () => [{ stopX: 1000, state: 'green' }], 6);
    expect(green.front).toBeLessThan(900);
    let state: LightAhead['state'] = 'red';
    const dt = 1 / 60;
    let front = 1500;
    let v = 150;
    for (let t = 0; t < 30; t += dt) {
      if (t > 12) state = 'green';
      v = nextSpeed(v, targetSpeed({ cruise: 150, v, front, leaderRear: null, lights: [{ stopX: 1000, state }] }), dt);
      front -= v * dt;
    }
    expect(front).toBeLessThan(1000);
  });

  it('on yellow it stops if it can, and drives through if it is too close', () => {
    const far = drive({ front: 1500, v: 200 }, 200, () => [{ stopX: 1000, state: 'yellow' }], 20);
    expect(far.front).toBeGreaterThanOrEqual(1000);
    const close = drive({ front: 1000 + brakingDistance(200) * 0.4, v: 200 }, 200, () => [{ stopX: 1000, state: 'yellow' }], 3);
    expect(close.front).toBeLessThan(1000);
  });

  it('keeps its distance to the vehicle in front and never touches it', () => {
    const leaderRear = 500;
    const r = drive({ front: 1400, v: 200 }, 200, () => [], 30, () => leaderRear);
    expect(r.v).toBeLessThan(1);
    expect(r.front - leaderRear).toBeGreaterThanOrEqual(AI.minGap - 5);
  });

  it('a queue at a red light never overlaps', () => {
    const lens = [150, 210, 160, 150];
    const fronts = [1300, 1700, 2100, 2500]; // leading edges, nearest to the line first
    const vs = [180, 180, 180, 180];
    const dt = 1 / 60;
    let worst = Infinity;
    for (let t = 0; t < 40; t += dt) {
      for (let i = 0; i < fronts.length; i++) {
        const leaderRear = i === 0 ? null : fronts[i - 1]! + lens[i - 1]!;
        vs[i] = nextSpeed(vs[i]!, targetSpeed({ cruise: 180, v: vs[i]!, front: fronts[i]!, leaderRear, lights: [{ stopX: 1000, state: 'red' }] }), dt);
        fronts[i] = fronts[i]! - vs[i]! * dt;
        if (i > 0) worst = Math.min(worst, fronts[i]! - (fronts[i - 1]! + lens[i - 1]!));
      }
    }
    expect(worst).toBeGreaterThan(0);
    expect(fronts[0]).toBeGreaterThanOrEqual(1000);
  });

  it('speed maths', () => {
    expect(safeSpeed(0)).toBe(0);
    expect(safeSpeed(-5)).toBe(0);
    expect(nextSpeed(0, 100, 10)).toBe(100);
    expect(nextSpeed(100, 0, 10)).toBe(0);
  });

  it('emergency vehicles are rare, never doubled; all six kinds appear', () => {
    const rng = mulberry32(5);
    const kinds = Array.from({ length: 500 }, () => pickKind(rng, false));
    expect(new Set(kinds)).toEqual(new Set(['car', 'police', 'taxi', 'truck', 'minibus', 'ambulance']));
    expect(kinds.filter((k) => k === 'police' || k === 'ambulance').length).toBeLessThan(100);
    const r2 = mulberry32(5);
    const normal = Array.from({ length: 200 }, () => pickKind(r2, true));
    expect(normal.includes('police')).toBe(false);
    expect(normal.includes('ambulance')).toBe(false);
  });

  it('stops before a red line even at high speed, coarse dt, or with a hasty driver', () => {
    const stopX = 1000;
    for (const [v0, dt] of [
      [300, 0.05],
      [380, 0.05],
      [550, 0.05],
    ] as const) {
      let front = 2000;
      let v: number = v0;
      for (let t = 0; t < 15; t += dt) {
        v = nextSpeed(v, targetSpeed({ cruise: v0, v, front, leaderRear: null, lights: [{ stopX, state: 'red' }] }), dt);
        front -= v * dt;
      }
      expect(v).toBeLessThan(1);
      expect(front).toBeGreaterThanOrEqual(stopX);
    }

    // Hasty driver stops for red when lightBrake is its real brake
    const d = DRIVERS.hasty;
    let front = 1800;
    let v = 250;
    for (let t = 0; t < 15; t += 0.05) {
      const target = targetSpeed({
        cruise: 250,
        v,
        front,
        leaderRear: null,
        lights: [{ stopX, state: 'red' }],
        brake: d.planBrake,
        lightBrake: d.brake,
      });
      v = nextSpeed(v, target, 0.05, d.brake);
      front -= v * 0.05;
    }
    expect(v).toBeLessThan(1);
    expect(front).toBeGreaterThanOrEqual(stopX);

    // A slow vehicle slightly past a red line stays stopped instead of accelerating through
    expect(targetSpeed({ cruise: 200, v: 15, front: stopX - 10, leaderRear: null, lights: [{ stopX, state: 'red' }] })).toBe(0);
  });

  it('roads get busier on later levels, but never swamped', () => {
    const a = mulberry32(1);
    const b = mulberry32(1);
    expect(spawnDelay(b, 12)).toBeLessThan(spawnDelay(a, 1));
    expect(spawnDelay(mulberry32(2), 99)).toBeGreaterThanOrEqual(1.8);
    for (const s of Object.values(SPECS)) expect(s.cruise[0]).toBeLessThan(s.cruise[1]);
  });
});
