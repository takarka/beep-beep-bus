import { LEVEL_COUNT } from './campaign';
import { loadJSON, saveJSON } from './storage';

const KEY = 'bbbus.progress.v1';

export interface Progress {
  /** The level to play next: the first one without stars (the last level once all are done). */
  level: number;
  /** Best star count per level, e.g. { "1": 3 }. A level with stars is completed. */
  stars: Record<string, number>;
  /** Best score per level. */
  scores: Record<string, number>;
}

export function nextLevel(stars: Record<string, number>): number {
  for (let l = 1; l <= LEVEL_COUNT; l++) if (!(stars[String(l)]! > 0)) return l;
  return LEVEL_COUNT;
}

const intIn = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null;

/** Turns anything (corrupt or old saved data) into valid progress. */
export function sanitizeProgress(raw: unknown): Progress {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { stars?: unknown; scores?: unknown };
  const stars: Record<string, number> = {};
  const scores: Record<string, number> = {};
  const rs = (r.stars && typeof r.stars === 'object' ? r.stars : {}) as Record<string, unknown>;
  const rc = (r.scores && typeof r.scores === 'object' ? r.scores : {}) as Record<string, unknown>;
  for (let l = 1; l <= LEVEL_COUNT; l++) {
    const s = intIn(rs[String(l)], 1, 3);
    if (s !== null) stars[String(l)] = s;
    const c = intIn(rc[String(l)], 0, 1_000_000);
    if (c !== null && s !== null) scores[String(l)] = c;
  }
  return { level: nextLevel(stars), stars, scores };
}

export const isCompleted = (p: Progress, level: number): boolean => (p.stars[String(level)] ?? 0) > 0;

/** A level opens when the one before it has been completed. */
export const isUnlocked = (p: Progress, level: number): boolean =>
  level >= 1 && level <= LEVEL_COUNT && (level === 1 || isCompleted(p, level - 1));

export const completedCount = (p: Progress): number => Object.keys(p.stars).length;
export const totalStars = (p: Progress): number => Object.values(p.stars).reduce((a, b) => a + b, 0);
export const totalScore = (p: Progress): number => Object.values(p.scores).reduce((a, b) => a + b, 0);

/** Keeps the best stars and score of every level. */
export function applyResult(p: Progress, level: number, stars: number, score: number): Progress {
  if (level < 1 || level > LEVEL_COUNT) return p;
  const next = {
    stars: { ...p.stars, [String(level)]: Math.max(p.stars[String(level)] ?? 0, Math.min(3, Math.max(1, stars))) },
    scores: { ...p.scores, [String(level)]: Math.max(p.scores[String(level)] ?? 0, Math.max(0, Math.round(score))) },
  };
  return { level: nextLevel(next.stars), ...next };
}

export function loadProgress(): Progress {
  return sanitizeProgress(loadJSON(KEY));
}

export function recordResult(level: number, stars: number, score: number): Progress {
  const p = applyResult(loadProgress(), level, stars, score);
  saveJSON(KEY, p);
  return p;
}
