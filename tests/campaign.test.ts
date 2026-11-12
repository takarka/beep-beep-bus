import { describe, expect, it } from 'vitest';
import { LANDMARKS, LEVEL_COUNT, MAP_NODES, landmarkForLevel } from '../src/core/campaign';
import { DICTS } from '../src/i18n';
import { generateLevel, levelCounts, maxSpeedFor } from '../src/core/level';
import {
  applyResult,
  completedCount,
  isUnlocked,
  nextLevel,
  sanitizeProgress,
  totalScore,
  totalStars,
} from '../src/core/progress';

const fresh = () => sanitizeProgress(null);

describe('campaign map', () => {
  it('has a landmark for every level, all on screen and far apart', () => {
    expect(MAP_NODES).toHaveLength(LEVEL_COUNT);
    expect(new Set(MAP_NODES.map((n) => n.landmark)).size).toBe(LEVEL_COUNT);
    expect(LANDMARKS).toHaveLength(LEVEL_COUNT);
    for (const n of MAP_NODES) {
      expect(n.x).toBeGreaterThan(90);
      expect(n.x).toBeLessThan(1190);
      expect(n.y).toBeGreaterThan(150);
      expect(n.y).toBeLessThan(620);
    }
    for (let i = 0; i < MAP_NODES.length; i++)
      for (let j = i + 1; j < MAP_NODES.length; j++)
        expect(Math.hypot(MAP_NODES[i]!.x - MAP_NODES[j]!.x, MAP_NODES[i]!.y - MAP_NODES[j]!.y)).toBeGreaterThan(170);
  });

  it('every level finishes at its own landmark', () => {
    for (let l = 1; l <= LEVEL_COUNT; l++) expect(landmarkForLevel(l)).toBe(MAP_NODES[l - 1]!.landmark);
    expect(landmarkForLevel(LEVEL_COUNT + 1)).toBe(landmarkForLevel(1)); // past the last one: start over
    expect(landmarkForLevel(0)).toBe(landmarkForLevel(LEVEL_COUNT)); // never crashes on odd input
  });

  it('names every landmark in every language', () => {
    for (const lang of Object.values(DICTS))
      for (const id of LANDMARKS) expect(lang[`lm_${id}` as keyof typeof lang].trim()).not.toBe('');
  });
});

describe('level difficulty', () => {
  it('grows with the level, up to a cap', () => {
    expect(levelCounts(1).stops).toBe(3);
    expect(levelCounts(LEVEL_COUNT).stops).toBe(8);
    for (let l = 2; l <= LEVEL_COUNT; l++) {
      expect(levelCounts(l).stops).toBeGreaterThanOrEqual(levelCounts(l - 1).stops);
      expect(maxSpeedFor(l)).toBeGreaterThanOrEqual(maxSpeedFor(l - 1));
    }
    expect(maxSpeedFor(1)).toBe(340);
    expect(maxSpeedFor(99)).toBeLessThanOrEqual(510);
    expect(generateLevel(12).items.length).toBeGreaterThan(generateLevel(1).items.length);
  });
});

describe('progress', () => {
  it('starts with only level 1 open', () => {
    const p = fresh();
    expect(isUnlocked(p, 1)).toBe(true);
    expect(isUnlocked(p, 2)).toBe(false);
    expect(p.level).toBe(1);
    expect(completedCount(p)).toBe(0);
  });

  it('completing a level opens the next one and keeps the best result', () => {
    let p = applyResult(fresh(), 1, 2, 40);
    expect(isUnlocked(p, 2)).toBe(true);
    expect(isUnlocked(p, 3)).toBe(false);
    expect(p.level).toBe(2);
    p = applyResult(p, 1, 3, 30); // better stars, worse score: keep the best of each
    expect(p.stars['1']).toBe(3);
    expect(p.scores['1']).toBe(40);
    p = applyResult(p, 2, 1, 25);
    expect(totalStars(p)).toBe(4);
    expect(totalScore(p)).toBe(65);
    expect(completedCount(p)).toBe(2);
  });

  it('replaying an old level never locks anything', () => {
    let p = applyResult(applyResult(fresh(), 1, 3, 50), 2, 3, 50);
    p = applyResult(p, 1, 1, 0);
    expect(p.stars['1']).toBe(3);
    expect(p.level).toBe(3);
  });

  it('finishes on the last level', () => {
    const stars: Record<string, number> = {};
    for (let l = 1; l <= LEVEL_COUNT; l++) stars[String(l)] = 3;
    expect(nextLevel(stars)).toBe(LEVEL_COUNT);
    expect(applyResult(fresh(), 99, 3, 10)).toEqual(fresh()); // unknown level ignored
  });

  it('repairs corrupt or old saved data', () => {
    expect(sanitizeProgress('junk')).toEqual(fresh());
    const old = sanitizeProgress({ level: 4, stars: { '1': 3, '2': 7, '3': 'x', '99': 3 } });
    expect(old.stars).toEqual({ '1': 3 });
    expect(old.level).toBe(2);
  });
});
