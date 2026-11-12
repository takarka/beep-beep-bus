import { describe, expect, it } from 'vitest';
import { STRIKES_FOR_SIREN, ScoreKeeper } from '../src/core/rules';
import {
  AI,
  DRIVERS,
  lanePlan,
  nextSpeed,
  targetSpeed,
} from '../src/traffic/ai';
import { CRASH_MIN_IMPACT, gapBetween, resolveLane, type Body } from '../src/traffic/collision';

describe('police siren: three mistakes in a row', () => {
  it('fires after the third mistake in a row, then starts over', () => {
    const s = new ScoreKeeper();
    s.add(10);
    s.add(-5);
    s.add(-10);
    expect(s.takeWarning()).toBe(false);
    s.add(-10);
    expect(s.streak).toBe(STRIKES_FOR_SIREN);
    expect(s.takeWarning()).toBe(true);
    expect(s.takeWarning()).toBe(false); // only once per streak
    expect(s.streak).toBe(0);
  });

  it('a good deed in between clears the streak', () => {
    const s = new ScoreKeeper();
    s.add(-5);
    s.add(-10);
    s.passenger();
    s.add(-5);
    s.add(-5);
    expect(s.takeWarning()).toBe(false);
    s.add(-5);
    expect(s.takeWarning()).toBe(true);
    expect(s.mistakes).toBe(5);
  });
});

describe('lane collisions', () => {
  const car = (x: number, v: number, len = 160): Body => ({ x, len, v });

  it('a faster follower that runs into a leader is stopped and reported', () => {
    const bodies = [car(0, 300), car(150, 0)]; // 10 px overlap
    const crashes = resolveLane(bodies);
    expect(crashes).toHaveLength(1);
    expect(crashes[0]).toMatchObject({ follower: 0, leader: 1 });
    expect(crashes[0]!.impact).toBeCloseTo(300);
    expect(gapBetween(bodies[0]!, bodies[1]!)).toBeGreaterThanOrEqual(-1e-9);
    expect(bodies[0]!.v).toBeLessThan(150);
    expect(bodies[1]!.v).toBeGreaterThan(0); // the leader gets pushed on
  });

  it('nothing happens when there is no overlap, or the follower is slower', () => {
    expect(resolveLane([car(0, 300), car(400, 0)])).toEqual([]);
    const slow = [car(0, 10), car(150, 100)];
    expect(resolveLane(slow)).toEqual([]);
    expect(gapBetween(slow[0]!, slow[1]!)).toBeGreaterThanOrEqual(-1e-9); // still never inside it
  });

  it('light bumps are not crashes', () => {
    expect(resolveLane([car(0, CRASH_MIN_IMPACT - 5), car(150, 0)])).toEqual([]);
  });

  it('a heavy bus pushes a car harder than a car pushes a bus', () => {
    const bus = resolveLane.length; // (keeps the import used)
    expect(bus).toBe(1);
    const a = [car(0, 200, 380), car(200, 0, 160)];
    resolveLane(a);
    const b = [car(0, 200, 160), car(200, 0, 380)];
    resolveLane(b);
    expect(a[1]!.v).toBeGreaterThan(b[1]!.v);
  });

  it('a pile-up never leaves anybody inside anybody', () => {
    const bodies = [car(0, 250), car(160, 220), car(330, 200), car(480, 0)];
    resolveLane(bodies);
    const sorted = bodies.slice().sort((p, q) => p.x - q.x);
    for (let i = 0; i < sorted.length - 1; i++) expect(gapBetween(sorted[i]!, sorted[i + 1]!)).toBeGreaterThanOrEqual(-1e-6);
  });

  it('works whatever order the bodies are listed in', () => {
    const bodies = [car(150, 0), car(0, 300)];
    const crashes = resolveLane(bodies);
    expect(crashes[0]).toMatchObject({ follower: 1, leader: 0 });
  });
});

describe('lane drivers', () => {
  /** A follower behind a leader that brakes at 700 px/s² (as our bus does) from `v` to a stop. */
  function followWhileLeaderStops(driver: keyof typeof DRIVERS, v: number): number {
    const d = DRIVERS[driver];
    const dt = 1 / 120;
    const leader: Body = { x: 600, len: 380, v };
    const f: Body = { x: 200, len: 170, v };
    // settle at the speed-dependent gap first
    for (let t = 0; t < 8; t += dt) {
      leader.x += leader.v * dt;
      const target = targetSpeed({ cruise: v, v: f.v, front: -(f.x + f.len / 2), leaderRear: -(leader.x - leader.len / 2), lights: [], headway: d.headway, minGap: d.minGap, brake: d.planBrake });
      f.v = nextSpeed(f.v, target, dt, d.brake);
      f.x += f.v * dt;
    }
    // now the leader brakes hard and the follower reacts
    let worst = Infinity;
    for (let t = 0; t < 8; t += dt) {
      leader.v = Math.max(0, leader.v - 700 * dt);
      leader.x += leader.v * dt;
      const target = targetSpeed({ cruise: v, v: f.v, front: -(f.x + f.len / 2), leaderRear: -(leader.x - leader.len / 2), lights: [], headway: d.headway, minGap: d.minGap, brake: d.planBrake });
      f.v = nextSpeed(f.v, target, dt, d.brake);
      f.x += f.v * dt;
      worst = Math.min(worst, gapBetween(f, leader));
    }
    return worst;
  }

  it('careful drivers can always stop when we brake hard', () => {
    for (const v of [150, 200, 250]) expect(followWhileLeaderStops('careful', v)).toBeGreaterThan(0);
  });

  it('hasty drivers can run into us when we stop suddenly', () => {
    expect(followWhileLeaderStops('hasty', 250)).toBeLessThan(0);
  });

  it('defaults are unchanged for the oncoming lane', () => {
    expect(AI.minGap).toBe(55);
    expect(targetSpeed({ cruise: 100, v: 100, front: 0, leaderRear: null, lights: [] })).toBe(100);
  });

  it('lane traffic starts on level 2 and hasty drivers only later', () => {
    expect(lanePlan(1).enabled).toBe(false);
    expect(lanePlan(2).enabled).toBe(true);
    expect(lanePlan(2).hastyChance).toBe(0);
    expect(lanePlan(12).hastyChance).toBeGreaterThan(0);
    expect(lanePlan(12).hastyChance).toBeLessThanOrEqual(0.35);
    expect(lanePlan(12).ahead[0]).toBeLessThan(lanePlan(2).ahead[0]);
  });
});

import { BUMP, POINTS, bumpResult } from '../src/core/rules';
import { bumpCountFor, generateLevel } from '../src/core/level';
import { BUMP_LIMIT, BUMP_ZONE_LENGTH, bumpZones } from '../src/traffic/ai';

describe('speed bumps', () => {
  it('slow = gentle and rewarded, medium = a hop, fast = a hard jolt that costs speed and points', () => {
    const slow = bumpResult(60);
    const mid = bumpResult(180);
    const fast = bumpResult(400);
    expect([slow.kind, mid.kind, fast.kind]).toEqual(['gentle', 'bump', 'hard']);
    expect(slow.points).toBe(POINTS.gentleBump);
    expect(slow.points).toBeGreaterThan(0);
    expect(mid.points).toBe(0);
    expect(fast.points).toBe(POINTS.speedBump);
    expect(fast.points).toBeLessThan(0);
    expect(slow.power).toBeLessThan(mid.power);
    expect(mid.power).toBeLessThan(fast.power);
    expect(slow.speedFactor).toBe(1);
    expect(fast.speedFactor).toBeLessThan(mid.speedFactor);
    expect(mid.speedFactor).toBeLessThan(1);
  });

  it('the harder the speed, the harder the jolt, never above 1', () => {
    let last = 0;
    for (let v = 0; v <= 600; v += 20) {
      const p = bumpResult(v).power;
      expect(p).toBeGreaterThanOrEqual(last - 1e-9);
      expect(p).toBeLessThanOrEqual(1);
      last = p;
    }
    expect(bumpResult(BUMP.gentle).kind).toBe('gentle');
    expect(bumpResult(BUMP.hard).kind).toBe('bump');
    expect(bumpResult(-5).kind).toBe('gentle');
  });

  it('levels: none on level 1, then more; always well away from lights and stops', () => {
    expect(bumpCountFor(1)).toBe(0);
    expect(bumpCountFor(2)).toBe(1);
    expect(bumpCountFor(12)).toBeLessThanOrEqual(4);
    expect(generateLevel(1).bumps).toEqual([]);
    for (let l = 2; l <= 12; l++) {
      const lvl = generateLevel(l);
      expect(lvl.bumps).toHaveLength(bumpCountFor(l));
      expect(lvl.bumps).toEqual(generateLevel(l).bumps); // deterministic
      const spots = lvl.items.map((i) => (i.kind === 'stop' ? i.zoneEnd : i.lineX));
      for (const b of lvl.bumps) for (const s of spots) expect(Math.abs(b - s)).toBeGreaterThan(700);
      for (let i = 1; i < lvl.bumps.length; i++) expect(lvl.bumps[i]! - lvl.bumps[i - 1]!).toBeGreaterThan(1500);
    }
  });

  it('other vehicles slow down for a bump, in both directions of travel', () => {
    const bx = 3000;
    // oncoming: drives towards smaller x
    for (const mirror of [false, true]) {
      const zones = bumpZones([bx], mirror);
      let front = mirror ? -(bx - 900) : bx + 900; // in the driver's own coordinates
      let v = 220;
      let worstInside = 0;
      for (let t = 0; t < 12; t += 1 / 60) {
        v = nextSpeed(v, targetSpeed({ cruise: 220, v, front, leaderRear: null, lights: [], zones }), 1 / 60);
        front -= v * (1 / 60);
        const z = zones[0]!;
        if (front <= z.start - 5 && front >= z.start - z.length) worstInside = Math.max(worstInside, v);
      }
      expect(worstInside).toBeLessThanOrEqual(BUMP_LIMIT + 3);
      expect(v).toBeGreaterThan(150); // and speeds up again afterwards
    }
    expect(BUMP_ZONE_LENGTH).toBeGreaterThan(0);
  });
});
