import { mulberry32 } from '../core/rng';
import type { BusLayout } from './geometry';

/**
 * Wear and tear as concrete broken parts. The bus keeps one number (health, 0..100); this module turns
 * "how much is broken" into a list of things a child can see on the bus and fix with a tap in the depot.
 * Pure maths (no Phaser).
 */

export type PartKind = 'scratch' | 'dent' | 'window' | 'windshield' | 'headlight' | 'soot' | 'bumper' | 'wheel';

export interface Part {
  /** Unique within one list, e.g. "window-2". */
  id: string;
  kind: PartKind;
  /** Which window / wheel (for those kinds), otherwise just the n-th of its kind. */
  index: number;
  /** Health points this part gives back when fixed. The values of a list add up to the missing health. */
  value: number;
  /** How many taps in the depot it takes to fix. */
  taps: number;
  /** Where it is on the bus (bus-local coordinates: x = 0 middle of the bus, y = 0 the road, up is negative). */
  x: number;
  y: number;
}

/** Health a part is "worth" at most, and how many taps it needs. */
const KINDS: Record<PartKind, { weight: number; taps: number }> = {
  scratch: { weight: 4, taps: 1 },
  dent: { weight: 6, taps: 2 },
  soot: { weight: 5, taps: 1 },
  window: { weight: 8, taps: 2 },
  headlight: { weight: 8, taps: 2 },
  wheel: { weight: 10, taps: 3 },
  windshield: { weight: 10, taps: 2 },
  bumper: { weight: 12, taps: 3 },
};

/** The order in which things break: small stuff first, big stuff when it is really bad. */
const ORDER: PartKind[] = ['scratch', 'dent', 'window', 'headlight', 'scratch', 'dent', 'soot', 'window', 'wheel', 'dent', 'windshield', 'window', 'bumper', 'scratch', 'wheel', 'dent', 'window'];

/** Spots where the fixed parts sit on the bus (bus-local coordinates, like the layout). */
function anchorOf(kind: PartKind, index: number, L: BusLayout): { x: number; y: number } {
  switch (kind) {
    case 'window': {
      const w = L.windows[index];
      return w ? { x: w.x + w.w / 2, y: w.y + w.h / 2 } : { x: L.backX + 80, y: L.top + 70 };
    }
    case 'windshield':
      return { x: L.windshield.x + L.windshield.w / 2, y: L.windshield.y + L.windshield.h / 2 };
    case 'headlight':
      return { x: L.headlight.x, y: L.headlight.y };
    case 'soot':
      return { x: L.boxFrontX - 60, y: L.top + 34 };
    case 'bumper':
      return { x: L.frontX - 6, y: L.bottom - 2 };
    default:
      return { x: L.wheelXs[index % L.wheelXs.length]!, y: -L.wheelR * 0.5 };
  }
}

/**
 * The broken parts for a bus with `missingHealth` points of damage. A bigger damage always gives the same
 * parts as a smaller one plus more (so a bus gets worse step by step), and the values add up exactly.
 * Dents and scratches are scattered over the body, away from the other parts and from each other.
 */
export function planParts(missingHealth: number, L: BusLayout): Part[] {
  const counts = { windows: L.windows.length, wheels: L.wheelXs.length };
  const missing = Math.max(0, Math.round(missingHealth));
  const parts: Part[] = [];
  const used: Record<PartKind, number> = { scratch: 0, dent: 0, window: 0, headlight: 0, soot: 0, wheel: 0, windshield: 0, bumper: 0 };
  const limit = (k: PartKind): number => (k === 'window' ? counts.windows : k === 'wheel' ? counts.wheels : k === 'headlight' || k === 'windshield' || k === 'bumper' || k === 'soot' ? 1 : 99);

  // every fixed spot counts as taken, whether or not that part is broken now
  const taken: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < counts.windows; i++) taken.push(anchorOf('window', i, L));
  for (let i = 0; i < counts.wheels; i++) taken.push(anchorOf('wheel', i, L));
  for (const k of ['windshield', 'headlight', 'soot', 'bumper'] as const) taken.push(anchorOf(k, 0, L));

  const x0 = L.backX + 40;
  const x1 = L.boxFrontX - 40;
  const y0 = L.top + 20;
  const y1 = L.bottom - 14;
  const place = (kind: PartKind, index: number): { x: number; y: number } => {
    const rng = mulberry32((index + 1) * 7919 + kind.charCodeAt(0) * 131);
    let best = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    let bestD = -1;
    for (let c = 0; c < 40; c++) {
      const at = { x: x0 + rng() * (x1 - x0), y: y0 + rng() * (y1 - y0) };
      const d = taken.reduce((m, o) => Math.min(m, Math.hypot(o.x - at.x, o.y - at.y)), 1e9);
      if (d > bestD) {
        bestD = d;
        best = at;
      }
    }
    taken.push(best);
    return best;
  };

  let sum = 0;
  let round = 0;
  while (sum < missing && round < 20) {
    let added = false;
    for (const kind of ORDER) {
      if (sum >= missing) break;
      if (used[kind] >= limit(kind)) continue;
      const i = used[kind]++;
      const k = KINDS[kind];
      const value = Math.min(k.weight, missing - sum);
      const at = kind === 'dent' || kind === 'scratch' ? place(kind, i) : anchorOf(kind, i, L);
      parts.push({ id: `${kind}-${i}`, kind, index: i, value, taps: k.taps, x: at.x, y: at.y });
      sum += value;
      added = true;
    }
    if (!added) break;
    round++;
  }
  return parts;
}

/** The health the bus has when only `parts` are still broken. */
export const healthWith = (parts: readonly Part[], maxHealth = 100): number => maxHealth - parts.reduce((s, p) => s + p.value, 0);
