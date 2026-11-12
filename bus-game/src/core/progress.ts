import { loadJSON, saveJSON } from './storage';

const KEY = 'bbbus.progress.v1';

export interface Progress {
  /** Highest level the child has unlocked. */
  level: number;
  /** Best star count per level, e.g. { "1": 3 }. */
  stars: Record<string, number>;
}

export function loadProgress(): Progress {
  const raw = loadJSON(KEY) as Partial<Progress> | null;
  const level = raw && Number.isInteger(raw.level) && (raw.level as number) > 0 ? (raw.level as number) : 1;
  const stars = raw && typeof raw.stars === 'object' && raw.stars !== null ? raw.stars : {};
  return { level, stars };
}

export function recordResult(level: number, stars: number): Progress {
  const p = loadProgress();
  const prev = p.stars[String(level)] ?? 0;
  p.stars[String(level)] = Math.max(prev, stars);
  p.level = Math.max(p.level, level + 1);
  saveJSON(KEY, p);
  return p;
}
