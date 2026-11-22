import { describe, expect, it } from 'vitest';
import type { BusDesign } from '../src/bus/design';
import { BODY_SIZE, computeLayout } from '../src/bus/geometry';
import { healthWith, planParts } from '../src/bus/parts';
import { depotCountFor, generateLevel } from '../src/core/level';

const bodies = Object.keys(BODY_SIZE) as BusDesign['body'][];
const layoutOf = (body: BusDesign['body'], doors: 1 | 2 | 3 = 2) => computeLayout({ body, doors, wheels: 'classic' });
const countsOf = (body: BusDesign['body']) => layoutOf(body);

describe('broken parts', () => {
  it('a new bus has nothing broken', () => {
    expect(planParts(0, countsOf('city'))).toEqual([]);
  });

  it('the values add up exactly to the missing health, for every damage and every body', () => {
    for (const body of bodies) {
      for (let missing = 0; missing <= 100; missing++) {
        const parts = planParts(missing, countsOf(body));
        expect(parts.reduce((s, p) => s + p.value, 0)).toBe(missing);
        expect(healthWith(parts)).toBe(100 - missing);
        for (const p of parts) {
          expect(p.value).toBeGreaterThan(0);
          expect(p.taps).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it('more damage = the same parts plus more, and ids are unique', () => {
    for (const body of bodies) {
      let prev = planParts(0, countsOf(body));
      for (let missing = 1; missing <= 100; missing++) {
        const next = planParts(missing, countsOf(body));
        expect(new Set(next.map((p) => p.id)).size).toBe(next.length);
        expect(next.length).toBeGreaterThanOrEqual(prev.length);
        for (let i = 0; i < prev.length - 1; i++) expect(next[i]).toEqual(prev[i]);
        prev = next;
      }
    }
  });

  it('never breaks a window or wheel the bus does not have, and a wrecked bus is still fixable by hand', () => {
    for (const body of bodies) {
      const c = countsOf(body);
      const parts = planParts(100, c);
      expect(parts.filter((p) => p.kind === 'window').length).toBeLessThanOrEqual(c.windows.length);
      expect(parts.filter((p) => p.kind === 'wheel').length).toBeLessThanOrEqual(c.wheelXs.length);
      expect(parts.reduce((s, p) => s + p.taps, 0)).toBeLessThanOrEqual(70);
    }
  });

  it('every part is on the bus body, so it can be tapped', () => {
    for (const body of bodies) {
      const L = layoutOf(body);
      for (const p of planParts(100, countsOf(body))) {
        const at = p;
        expect(at.x).toBeGreaterThanOrEqual(L.backX - 5);
        expect(at.x).toBeLessThanOrEqual(L.frontX + 10);
        expect(at.y).toBeGreaterThanOrEqual(L.top);
        expect(at.y).toBeLessThanOrEqual(0);
      }
    }
  });

  it('parts are well apart so a finger picks the right one', () => {
    for (const body of bodies) {
      const L = layoutOf(body);
      const spots = planParts(40, L);
      for (let i = 0; i < spots.length; i++)
        for (let j = i + 1; j < spots.length; j++) expect(Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.y - spots[j]!.y)).toBeGreaterThan(34);
    }
  });
});

describe('depots on the route', () => {
  it('none on level 1, then they are spread out, deterministic and away from other things', () => {
    expect(generateLevel(1).depots).toEqual([]);
    for (let l = 2; l <= 24; l++) {
      const lvl = generateLevel(l);
      expect(lvl.depots).toEqual(generateLevel(l).depots);
      expect(lvl.depots).toHaveLength(depotCountFor(l));
      const spots = lvl.items.map((i) => (i.kind === 'stop' ? i.zoneEnd : i.lineX));
      for (const d of lvl.depots) {
        for (const s of [...spots, ...lvl.stations, ...lvl.bumps]) expect(Math.abs(d - s)).toBeGreaterThan(1200);
        expect(d).toBeLessThan(lvl.finishX);
      }
    }
  });
});
