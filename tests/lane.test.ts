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

import { MAX_HEALTH, bumpDamage, conditionOf, crashDamage, finalStars, performanceFor, starsFor } from '../src/core/rules';

describe('damage to the bus', () => {
  it('a harder crash does more damage, and our own fault more than being hit', () => {
    expect(crashDamage(40, true)).toBeLessThan(crashDamage(300, true));
    expect(crashDamage(200, false)).toBeLessThan(crashDamage(200, true));
    expect(crashDamage(0, true)).toBeGreaterThan(0);
    expect(crashDamage(9999, true)).toBe(crashDamage(340, true)); // capped
  });

  it('bumps: gentle is free, medium a little, hard a lot', () => {
    expect(bumpDamage(bumpResult(60))).toBe(0);
    const mid = bumpDamage(bumpResult(180));
    const hard = bumpDamage(bumpResult(400));
    expect(mid).toBeGreaterThan(0);
    expect(hard).toBeGreaterThan(mid * 2);
    expect(bumpDamage(bumpResult(250))).toBeLessThanOrEqual(bumpDamage(bumpResult(500)));
  });

  it('a few crashes or hard bumps break a bus; a few careful ones do not', () => {
    const hardHits = Math.ceil(MAX_HEALTH / bumpDamage(bumpResult(400)));
    expect(hardHits).toBeLessThanOrEqual(8);
    expect(hardHits).toBeGreaterThanOrEqual(4);
    expect(MAX_HEALTH - 3 * bumpDamage(bumpResult(180))).toBeGreaterThan(80);
  });

  it('a worn bus is slower, never below half speed, a healthy one is untouched', () => {
    expect(performanceFor(100)).toEqual({ speedFactor: 1, accelFactor: 1 });
    expect(performanceFor(60).speedFactor).toBe(1);
    expect(performanceFor(30).speedFactor).toBeCloseTo(0.75);
    expect(performanceFor(0).speedFactor).toBe(0.5);
    expect(performanceFor(-20).speedFactor).toBe(0.5);
    let last = 2;
    for (let h = 100; h >= 0; h -= 5) {
      const f = performanceFor(h).speedFactor;
      expect(f).toBeLessThanOrEqual(last);
      last = f;
    }
  });

  it('condition levels', () => {
    expect([100, 70, 69, 40, 39, 15, 14, 0].map(conditionOf)).toEqual(['good', 'good', 'worn', 'worn', 'damaged', 'damaged', 'critical', 'critical']);
  });

  it('a badly damaged bus costs a star, but never the last one', () => {
    expect(finalStars(0, 100)).toBe(3);
    expect(finalStars(0, 39)).toBe(2);
    expect(finalStars(0, 40)).toBe(3);
    expect(finalStars(3, 0)).toBe(1);
    expect(finalStars(1, 10)).toBe(starsFor(1) - 1);
  });
});

import { laneClear, wantsToOvertake } from '../src/traffic/ai';

describe('overtaking: when may a driver change lanes', () => {
  const me = { x: 1000, len: 180, v: 220 };

  it('an empty lane is clear', () => {
    expect(laneClear(me, [])).toBe(true);
  });

  it('nobody alongside or overlapping', () => {
    expect(laneClear(me, [{ x: 1000, len: 180, v: 220 }])).toBe(false);
    expect(laneClear(me, [{ x: 1150, len: 180, v: 220 }])).toBe(false); // right next to us
  });

  it('a vehicle ahead needs room to brake, more if we are faster than it', () => {
    // its rear is 190 px in front of our nose
    const o = { x: 1000 + 90 + 190 + 90, len: 180, v: 220 };
    expect(laneClear(me, [o])).toBe(true);
    expect(laneClear(me, [{ ...o, v: 60 }])).toBe(false); // it is much slower: we would run into it
  });

  it('a vehicle behind needs room, more if it is faster', () => {
    const o = { x: 1000 - 90 - 200 - 90, len: 180, v: 220 }; // 200 px behind our tail
    expect(laneClear(me, [o])).toBe(true);
    expect(laneClear(me, [{ ...o, v: 420 }])).toBe(false); // coming up fast: don't cut in
    expect(laneClear(me, [{ x: 1000 - 90 - 60 - 90, len: 180, v: 220 }])).toBe(false); // right on our tail
  });

  it('a driver wants to overtake only a slower vehicle that is close', () => {
    expect(wantsToOvertake(230, 230, null)).toBe(false);
    expect(wantsToOvertake(230, 230, { gap: 100, v: 140 })).toBe(true);
    expect(wantsToOvertake(230, 230, { gap: 100, v: 225 })).toBe(false); // about as fast: no point
    expect(wantsToOvertake(230, 230, { gap: 900, v: 100 })).toBe(false); // still far away
    expect(wantsToOvertake(230, 120, { gap: 100, v: 0 })).toBe(true); // a stopped bus
  });
});

import { NITRO, fuelUse, nitroStep, type NitroState } from '../src/core/rules';

describe('nitro', () => {
  /** Holds the nitro button (or not) for `seconds` and reports what happened. */
  const run = (wanted: boolean, seconds: number, start: NitroState = { nitro: NITRO.max, locked: false }) => {
    let s: NitroState = start;
    let boostingTime = 0;
    let firstBoost = -1;
    for (let t = 0; t < seconds; t += 1 / 60) {
      const r = nitroStep(s, wanted, 1 / 60);
      s = { nitro: r.nitro, locked: r.locked };
      if (r.boosting) {
        boostingTime += 1 / 60;
        if (firstBoost < 0) firstBoost = t;
      }
    }
    return { ...s, boostingTime, firstBoost };
  };

  it('a full tank lasts about 2.6 seconds, then it is empty and locked', () => {
    const r = run(true, 3);
    expect(r.boostingTime).toBeGreaterThan(2.3);
    expect(r.boostingTime).toBeLessThan(2.9);
    expect(r.nitro).toBeLessThan(5);
    expect(r.locked).toBe(true);
  });

  it('it refills by itself when not used, and is capped', () => {
    expect(run(false, 20, { nitro: 0, locked: true }).nitro).toBe(NITRO.max);
    expect(run(false, 3, { nitro: 0, locked: true }).nitro).toBeCloseTo(NITRO.recharge * 3, 0);
  });

  it('after running dry it cannot be used again until a little has refilled', () => {
    // holding the button on an empty tank: nothing for about (minToStart / recharge) seconds, then a short burst
    const r = run(true, 6, { nitro: 0, locked: true });
    expect(r.firstBoost).toBeGreaterThan(NITRO.minToStart / NITRO.recharge - 0.3);
    expect(r.firstBoost).toBeLessThan(NITRO.minToStart / NITRO.recharge + 0.3);
    expect(nitroStep({ nitro: 0, locked: true }, true, 0.1).boosting).toBe(false);
  });

  it('boosting costs more petrol', () => {
    expect(fuelUse(1000, 4, 300, true, true)).toBeGreaterThan(fuelUse(1000, 4, 300, true, false) * 1.5);
  });

  it('is a clear boost, but not absurd', () => {
    expect(NITRO.speedFactor).toBeGreaterThan(1.2);
    expect(NITRO.speedFactor).toBeLessThan(1.7);
    expect(NITRO.accelFactor).toBeGreaterThan(1.5);
  });
});

import { LANE_CHANGE_TIME, LANE_Y, collidesInLane, createLaneMotion, occupiesLane, startLaneChange, stepLaneChange } from '../src/traffic/lanes';

describe('player lane changes', () => {
  it('starts settled in the main lane and occupies only that lane', () => {
    const m = createLaneMotion(0);
    expect(m.y).toBe(LANE_Y.main);
    expect(occupiesLane(m, 0)).toBe(true);
    expect(occupiesLane(m, 1)).toBe(false);
    expect(startLaneChange(m, 0)).toBe(false);
  });

  it('occupies both lanes while drifting and settles in the passing lane', () => {
    const m = createLaneMotion(0);
    expect(startLaneChange(m, 1)).toBe(true);
    expect(occupiesLane(m, 0)).toBe(true);
    expect(occupiesLane(m, 1)).toBe(true);

    const midAngle = stepLaneChange(m, LANE_CHANGE_TIME * 0.4);
    expect(midAngle).toBeLessThan(0); // nose tilts upward toward the passing lane
    expect(m.y).toBeLessThan(LANE_Y.main);
    expect(m.y).toBeGreaterThan(LANE_Y.passing);
    expect(occupiesLane(m, 0)).toBe(true);
    expect(occupiesLane(m, 1)).toBe(true);

    let angle = midAngle;
    for (let i = 0; i < 60; i++) angle = stepLaneChange(m, 0.02);
    expect(m.y).toBe(LANE_Y.passing);
    expect(m.changeT).toBe(0);
    expect(angle).toBe(0);
    expect(occupiesLane(m, 0)).toBe(false);
    expect(occupiesLane(m, 1)).toBe(true);
  });

  it('can reverse mid-change and takes proportionally less time', () => {
    const m = createLaneMotion(0);
    startLaneChange(m, 1);
    stepLaneChange(m, LANE_CHANGE_TIME * 0.3);
    expect(startLaneChange(m, 0)).toBe(true);
    expect(m.changeT).toBeLessThan(LANE_CHANGE_TIME * 0.5);
    const angle = stepLaneChange(m, 0.05);
    expect(angle).toBeGreaterThan(0); // nose tilts downward back to the main lane
    for (let i = 0; i < 60; i++) stepLaneChange(m, 0.02);
    expect(m.y).toBe(LANE_Y.main);
    expect(occupiesLane(m, 0)).toBe(true);
    expect(occupiesLane(m, 1)).toBe(false);
  });

  it('physical lane collision follows actual wheel height, preventing phantom cross-lane hits', () => {
    expect(collidesInLane(LANE_Y.main, 0)).toBe(true);
    expect(collidesInLane(LANE_Y.main, 1)).toBe(false);
    expect(collidesInLane(LANE_Y.passing, 0)).toBe(false);
    expect(collidesInLane(LANE_Y.passing, 1)).toBe(true);

    // Just started changing from main to passing: still only physically in main
    expect(collidesInLane(LANE_Y.main - 2, 0)).toBe(true);
    expect(collidesInLane(LANE_Y.main - 2, 1)).toBe(false);

    // Nearly finished changing into passing: no longer physically colliding in main
    expect(collidesInLane(LANE_Y.passing + 4, 0)).toBe(false);
    expect(collidesInLane(LANE_Y.passing + 4, 1)).toBe(true);

    // Straddling the divider in the middle: collides in both lanes
    const mid = (LANE_Y.main + LANE_Y.passing) / 2;
    expect(collidesInLane(mid, 0)).toBe(true);
    expect(collidesInLane(mid, 1)).toBe(true);
  });
});

import { childrenCountFor, crosswalkCountFor, parkedCountFor, stopSignCountFor } from '../src/core/level';
import { childrenZoneResult } from '../src/core/rules';

describe('uncontrolled crosswalks, STOP signs, parked cars and children signs', () => {
  it('none on level 1, then appear deterministically and stay well away from other stops/lights/stations/bumps', () => {
    expect(crosswalkCountFor(1)).toBe(0);
    expect(stopSignCountFor(1)).toBe(0);
    expect(stopSignCountFor(2)).toBe(0);
    expect(parkedCountFor(2)).toBe(0);
    expect(childrenCountFor(3)).toBe(0);
    expect(generateLevel(1).crosswalks).toEqual([]);
    expect(generateLevel(1).stopSigns).toEqual([]);
    expect(generateLevel(2).stopSigns).toEqual([]);
    expect(generateLevel(2).parked).toEqual([]);
    expect(generateLevel(3).children).toEqual([]);

    for (let l = 2; l <= 12; l++) {
      const lvl = generateLevel(l);
      expect(lvl.crosswalks).toHaveLength(crosswalkCountFor(l));
      expect(lvl.stopSigns).toHaveLength(stopSignCountFor(l));
      expect(lvl.parked).toHaveLength(parkedCountFor(l));
      expect(lvl.children).toHaveLength(childrenCountFor(l));
      expect(lvl.crosswalks).toEqual(generateLevel(l).crosswalks);
      expect(lvl.stopSigns).toEqual(generateLevel(l).stopSigns);
      expect(lvl.parked).toEqual(generateLevel(l).parked);
      expect(lvl.children).toEqual(generateLevel(l).children);

      const spots = lvl.items.map((i) => (i.kind === 'stop' ? i.zoneEnd : i.lineX));
      const all = [...spots, ...lvl.stations, ...lvl.bumps, ...lvl.crosswalks, ...lvl.stopSigns, ...lvl.parked, ...lvl.children];
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          expect(Math.abs(all[i]! - all[j]!)).toBeGreaterThan(700);
        }
      }
    }
  });

  it('reward yielding/stopping/careful driving and penalize running across or speeding', () => {
    expect(POINTS.yielded).toBeGreaterThan(0);
    expect(POINTS.stopSign).toBeGreaterThan(0);
    expect(POINTS.carefulChildren).toBeGreaterThan(0);
    expect(POINTS.ranCrosswalk).toBeLessThan(0);
    expect(POINTS.ranStopSign).toBeLessThan(0);
    expect(POINTS.fastChildren).toBeLessThan(0);
    expect(childrenZoneResult(100)).toBe('gentle');
    expect(childrenZoneResult(200)).toBe('ok');
    expect(childrenZoneResult(300)).toBe('fast');
  });
});
