import { describe, expect, it } from 'vitest';
import { luminance } from '../src/config';
import {
  DEFAULT_WORLD,
  SEASONS,
  TIMES,
  envForLevel,
  envKey,
  paletteFor,
  precipKind,
  resolveEnv,
  sanitizeWorld,
} from '../src/core/world';

describe('world', () => {
  it('level 1 is the familiar sunny summer day, then the world changes', () => {
    expect(envForLevel(1)).toEqual({ season: 'summer', time: 'day', precip: false });
    expect(envForLevel(0)).toEqual(envForLevel(1));
    const seen = new Set(Array.from({ length: 8 }, (_, i) => envKey(envForLevel(i + 1))));
    expect(seen.size).toBe(8); // every season × day/night combination appears
    expect(envForLevel(9)).toEqual(envForLevel(1)); // and the cycle repeats
  });

  it('auto follows the level, manual follows the choice', () => {
    expect(resolveEnv(3, DEFAULT_WORLD)).toEqual(envForLevel(3));
    const manual = { auto: false, season: 'autumn', time: 'night', precip: true } as const;
    expect(resolveEnv(1, manual)).toEqual({ season: 'autumn', time: 'night', precip: true });
  });

  it('repairs corrupt settings', () => {
    expect(sanitizeWorld(null)).toEqual(DEFAULT_WORLD);
    expect(sanitizeWorld({ auto: false, season: 'monsoon', time: 'night', precip: 'yes' })).toEqual({
      auto: false,
      season: 'summer',
      time: 'night',
      precip: false,
    });
  });

  it('winter precipitation is snow, otherwise rain', () => {
    expect(precipKind({ season: 'winter', time: 'day', precip: true })).toBe('snow');
    expect(precipKind({ season: 'spring', time: 'day', precip: true })).toBe('rain');
  });

  it('night is darker than day in every season, with a moon instead of a sun', () => {
    for (const season of SEASONS) {
      const day = paletteFor({ season, time: 'day', precip: false });
      const night = paletteFor({ season, time: 'night', precip: false });
      expect(luminance(night.skyTop)).toBeLessThan(luminance(day.skyTop));
      expect(luminance(night.hillNear)).toBeLessThan(luminance(day.hillNear));
      expect(night.litWindowChance).toBeGreaterThan(day.litWindowChance);
      expect(day.sunVisible && !day.moonVisible).toBe(true);
      expect(night.moonVisible && !night.sunVisible).toBe(true);
    }
  });

  it('rain hides the sun', () => {
    expect(paletteFor({ season: 'summer', time: 'day', precip: true }).sunVisible).toBe(false);
  });

  it('has distinct texture keys for every combination', () => {
    const keys = new Set(SEASONS.flatMap((s) => TIMES.map((t) => envKey({ season: s, time: t, precip: false }))));
    expect(keys.size).toBe(8);
  });
});
