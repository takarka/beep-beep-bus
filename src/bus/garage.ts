import { loadJSON, saveJSON } from '../core/storage';
import { sanitizeDesign, type BusDesign } from './design';

/** The garage keeps up to three saved buses; one of them is the bus that drives. */
export const GARAGE_SIZE = 3;

export interface Garage {
  slots: Array<BusDesign | null>;
  /** Slot of the bus that is used on the route. Always a filled slot, unless the garage is empty. */
  current: number;
}

const KEY = 'bbbus.garage.v1';
const LEGACY_KEY = 'bbbus.design.v1'; // before the garage there was a single saved bus

export const emptyGarage = (): Garage => ({ slots: Array<BusDesign | null>(GARAGE_SIZE).fill(null), current: 0 });

const firstFilled = (slots: Array<BusDesign | null>): number => Math.max(0, slots.findIndex((s) => s !== null));

/** Turns anything (corrupt or old saved data) into a valid garage. */
export function sanitizeGarage(raw: unknown): Garage {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { slots?: unknown; current?: unknown };
  const list = Array.isArray(r.slots) ? r.slots : [];
  const slots = Array.from({ length: GARAGE_SIZE }, (_, i) => (list[i] ? sanitizeDesign(list[i]) : null));
  const cur = Number.isInteger(r.current) ? (r.current as number) : -1;
  return { slots, current: cur >= 0 && cur < GARAGE_SIZE && slots[cur] ? cur : firstFilled(slots) };
}

/** Saves a bus into a slot and makes it the current one. */
export function putBus(g: Garage, slot: number, design: BusDesign): Garage {
  if (!Number.isInteger(slot) || slot < 0 || slot >= GARAGE_SIZE) return g;
  const slots = g.slots.slice();
  slots[slot] = sanitizeDesign(design);
  return { slots, current: slot };
}

export function removeBus(g: Garage, slot: number): Garage {
  if (!g.slots[slot]) return g;
  const slots = g.slots.slice();
  slots[slot] = null;
  return { slots, current: g.current === slot ? firstFilled(slots) : g.current };
}

export function selectBus(g: Garage, slot: number): Garage {
  return g.slots[slot] ? { ...g, current: slot } : g;
}

export const busCount = (g: Garage): number => g.slots.filter((s) => s !== null).length;

/** First free slot, or the current one when the garage is full. */
export function slotForNewBus(g: Garage): number {
  const free = g.slots.findIndex((s) => s === null);
  return free >= 0 ? free : g.current;
}

export function loadGarage(): Garage {
  const raw = loadJSON(KEY);
  if (raw) return sanitizeGarage(raw);
  const legacy = loadJSON(LEGACY_KEY);
  return legacy ? putBus(emptyGarage(), 0, sanitizeDesign(legacy)) : emptyGarage();
}

export function saveGarage(g: Garage): void {
  saveJSON(KEY, g);
}

/** The bus that drives (null until the child has built one). */
export function loadDesign(): BusDesign | null {
  const g = loadGarage();
  return g.slots[g.current] ?? null;
}

/** Saves into the given slot (default: the current one) and makes it the current bus. */
export function saveDesign(design: BusDesign, slot?: number): void {
  const g = loadGarage();
  saveGarage(putBus(g, slot ?? g.current, design));
}
