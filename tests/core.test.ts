import { describe, expect, it } from 'vitest';
import { DICTS, LANGS, detectLang } from '../src/i18n';
import {
  BODY_TYPES,
  DEFAULT_DESIGN,
  DOOR_COUNTS,
  WHEEL_TYPES,
  normalizeNumber,
  sanitizeDesign,
} from '../src/bus/design';
import { computeLayout } from '../src/bus/geometry';
import { generateLevel } from '../src/core/level';
import { mulberry32 } from '../src/core/rng';
import { LIGHT_TIMING, TrafficLightModel } from '../src/core/traffic';
import {
  POINTS,
  STOP_ZONE,
  ScoreKeeper,
  crossedLine,
  hasMissedStop,
  isInStopZone,
  starsFor,
} from '../src/core/rules';

describe('i18n', () => {
  it('every language has every key, non-empty', () => {
    const keys = Object.keys(DICTS.en);
    for (const lang of LANGS) {
      expect(Object.keys(DICTS[lang]).sort()).toEqual([...keys].sort());
      for (const k of keys) expect(DICTS[lang][k as keyof typeof DICTS.en].trim()).not.toBe('');
    }
  });
  it('detects language from browser preferences', () => {
    expect(detectLang(['kk-KZ'])).toBe('kk');
    expect(detectLang(['en-US', 'ru'])).toBe('en');
    expect(detectLang(['de-DE'])).toBe('ru');
  });
});

describe('design', () => {
  it('sanitizes garbage to a valid design', () => {
    expect(sanitizeDesign(null)).toEqual(DEFAULT_DESIGN);
    expect(sanitizeDesign({ body: 'rocket', doors: 9, number: 'ab12345' })).toMatchObject({
      body: 'city',
      doors: 2,
      number: '123',
    });
  });
  it('normalizes the bus number', () => {
    expect(normalizeNumber('')).toBe(DEFAULT_DESIGN.number);
    expect(normalizeNumber('0042')).toBe('004');
  });
});

describe('bus layout', () => {
  const overlap = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

  for (const body of BODY_TYPES)
    for (const doors of DOOR_COUNTS)
      for (const wheels of WHEEL_TYPES) {
        it(`${body} / ${doors} doors / ${wheels} wheels fits together`, () => {
          const L = computeLayout({ body, doors, wheels });
          expect(L.doors).toHaveLength(doors);
          L.doors.forEach((d, i) => {
            expect(d.x).toBeGreaterThan(L.backX);
            expect(d.x + d.w).toBeLessThan(L.boxFrontX);
            for (const wx of L.wheelXs)
              expect(overlap(d.x, d.x + d.w, wx - L.wheelR, wx + L.wheelR)).toBe(false);
            const next = L.doors[i + 1];
            if (next) expect(d.x + d.w).toBeLessThan(next.x);
          });
          for (const w of L.windows) {
            expect(w.w).toBeGreaterThan(30);
            const lowerDeck = L.deckY === null || w.y > L.deckY;
            if (lowerDeck)
              for (const d of L.doors) expect(overlap(w.x, w.x + w.w, d.x, d.x + d.w)).toBe(false);
          }
          expect(L.windows.length).toBeGreaterThan(0);
        });
      }
});

describe('level generator', () => {
  it('is deterministic and grows with level', () => {
    expect(generateLevel(2)).toEqual(generateLevel(2));
    const l1 = generateLevel(1);
    const l3 = generateLevel(3);
    expect(l1.items.filter((i) => i.kind === 'stop')).toHaveLength(3);
    expect(l1.items.filter((i) => i.kind === 'light')).toHaveLength(3);
    expect(l3.items.length).toBeGreaterThan(l1.items.length);
  });
  it('keeps items well apart and before the finish', () => {
    const lvl = generateLevel(5);
    const xs = lvl.items.map((i) => (i.kind === 'stop' ? i.zoneEnd : i.lineX));
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(1100);
    expect(lvl.finishX).toBeGreaterThan(xs[xs.length - 1]!);
    expect(lvl.items.filter((i) => i.kind === 'light' && i.teach)).toHaveLength(1);
  });
});

describe('traffic light', () => {
  it('cycles green → yellow → red → green', () => {
    const m = new TrafficLightModel(mulberry32(1), 'green');
    const seen: string[] = [m.state];
    for (let i = 0; i < 400; i++) if (m.update(0.05)) seen.push(m.state);
    expect(seen.slice(0, 4)).toEqual(['green', 'yellow', 'red', 'green']);
  });
  it('forceToRed goes through yellow first', () => {
    const m = new TrafficLightModel(mulberry32(2), 'green');
    m.forceToRed();
    expect(m.state).toBe('yellow');
    m.update(LIGHT_TIMING.yellow + 0.01);
    expect(m.state).toBe('red');
  });
});

describe('rules', () => {
  it('detects crossing a line exactly once', () => {
    expect(crossedLine(90, 100, 100)).toBe(true);
    expect(crossedLine(100, 110, 100)).toBe(false);
  });
  it('stop zone and miss boundaries', () => {
    expect(isInStopZone(1000, 1000)).toBe(true);
    expect(isInStopZone(1000 - STOP_ZONE.before - 1, 1000)).toBe(false);
    expect(hasMissedStop(1000 + STOP_ZONE.miss + 1, 1000)).toBe(true);
  });
  it('score never goes negative and counts mistakes', () => {
    const s = new ScoreKeeper();
    expect(s.add(POINTS.ranRedLight)).toBe(0);
    expect(s.score).toBe(0);
    expect(s.mistakes).toBe(1);
    s.add(POINTS.stopServed);
    s.passenger();
    expect(s.score).toBe(12);
    expect(s.passengersMoved).toBe(1);
  });
  it('stars', () => {
    expect([0, 1, 2, 3, 9].map(starsFor)).toEqual([3, 2, 2, 1, 1]);
  });
});
