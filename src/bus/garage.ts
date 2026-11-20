import { MAX_FUEL, MAX_HEALTH } from '../core/rules';
import { loadJSON, saveJSON } from '../core/storage';
import { sanitizeDesign, type BusDesign } from './design';

/** The garage keeps up to three saved buses; one of them is the bus that drives. */
export const GARAGE_SIZE = 3;

export interface BusStatus {
  /** Condition 0..100 (MAX_HEALTH). */
  health: number;
  /** Petrol 0..100 (MAX_FUEL). */
  fuel: number;
}

export interface Garage {
  slots: Array<BusDesign | null>;
  /** Health and petrol per slot (carries over between levels; gas stations fix both). */
  status: BusStatus[];
  /** Slot of the bus that is used on the route. Always a filled slot, unless the garage is empty. */
  current: number;
}

const KEY = 'bbbus.garage.v1';
const LEGACY_KEY = 'bbbus.design.v1'; // before the garage there was a single saved bus

export const freshStatus = (): BusStatus => ({ health: MAX_HEALTH, fuel: MAX_FUEL });

export function sanitizeStatus(raw: unknown): BusStatus {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { health?: unknown; fuel?: unknown };
  const clamp = (v: unknown, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : max;
  return { health: clamp(r.health, MAX_HEALTH), fuel: clamp(r.fuel, MAX_FUEL) };
}

export const emptyGarage = (): Garage => ({
  slots: Array<BusDesign | null>(GARAGE_SIZE).fill(null),
  status: Array.from({ length: GARAGE_SIZE }, freshStatus),
  current: 0,
});

const firstFilled = (slots: Array<BusDesign | null>): number => Math.max(0, slots.findIndex((s) => s !== null));

/** Turns anything (corrupt or old saved data) into a valid garage. */
export function sanitizeGarage(raw: unknown): Garage {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { slots?: unknown; status?: unknown; current?: unknown };
  const list = Array.isArray(r.slots) ? r.slots : [];
  const sList = Array.isArray(r.status) ? r.status : [];
  const slots = Array.from({ length: GARAGE_SIZE }, (_, i) => (list[i] ? sanitizeDesign(list[i]) : null));
  const status = Array.from({ length: GARAGE_SIZE }, (_, i) => (slots[i] ? sanitizeStatus(sList[i]) : freshStatus()));
  const cur = Number.isInteger(r.current) ? (r.current as number) : -1;
  return { slots, status, current: cur >= 0 && cur < GARAGE_SIZE && slots[cur] ? cur : firstFilled(slots) };
}

/** Saves a bus into a slot and makes it the current one. A brand-new bus starts fresh; editing keeps its wear & fuel. */
export function putBus(g: Garage, slot: number, design: BusDesign): Garage {
  if (!Number.isInteger(slot) || slot < 0 || slot >= GARAGE_SIZE) return g;
  const slots = g.slots.slice();
  const status = g.status.map((s) => ({ ...s }));
  const isNew = slots[slot] === null;
  slots[slot] = sanitizeDesign(design);
  if (isNew) status[slot] = freshStatus();
  return { slots, status, current: slot };
}

export function removeBus(g: Garage, slot: number): Garage {
  if (!g.slots[slot]) return g;
  const slots = g.slots.slice();
  const status = g.status.map((s) => ({ ...s }));
  slots[slot] = null;
  status[slot] = freshStatus();
  return { slots, status, current: g.current === slot ? firstFilled(slots) : g.current };
}

export function selectBus(g: Garage, slot: number): Garage {
  return g.slots[slot] ? { ...g, current: slot } : g;
}

/** Updates health and/or fuel for a filled slot. */
export function updateBusStatus(g: Garage, slot: number, patch: Partial<BusStatus>): Garage {
  if (!Number.isInteger(slot) || slot < 0 || slot >= GARAGE_SIZE || !g.slots[slot]) return g;
  const status = g.status.map((s) => ({ ...s }));
  const prev = status[slot] ?? freshStatus();
  status[slot] = sanitizeStatus({ health: patch.health ?? prev.health, fuel: patch.fuel ?? prev.fuel });
  return { ...g, status };
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

/** Condition and petrol of the current bus (fresh if none is saved yet). */
export function loadBusStatus(): BusStatus {
  const g = loadGarage();
  return g.slots[g.current] ? { ...(g.status[g.current] ?? freshStatus()) } : freshStatus();
}

/** Saves the current bus's condition and/or petrol for the next route. */
export function saveBusStatus(patch: Partial<BusStatus>): void {
  const g = loadGarage();
  saveGarage(updateBusStatus(g, g.current, patch));
}

/** Saves into the given slot (default: the current one) and makes it the current bus. */
export function saveDesign(design: BusDesign, slot?: number): void {
  const g = loadGarage();
  saveGarage(putBus(g, slot ?? g.current, design));
}
