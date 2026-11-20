import { describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN } from '../src/bus/design';
import {
  GARAGE_SIZE,
  busCount,
  emptyGarage,
  freshStatus,
  putBus,
  removeBus,
  sanitizeGarage,
  sanitizeStatus,
  selectBus,
  slotForNewBus,
  updateBusStatus,
} from '../src/bus/garage';

const red = { ...DEFAULT_DESIGN, color: 0xe63946 };
const blue = { ...DEFAULT_DESIGN, color: 0x3a86ff, body: 'bendy' as const };

describe('garage', () => {
  it('holds at most three buses', () => {
    expect(GARAGE_SIZE).toBe(3);
    expect(emptyGarage().slots).toHaveLength(3);
    expect(putBus(emptyGarage(), 3, red)).toEqual(emptyGarage());
    expect(putBus(emptyGarage(), -1, red)).toEqual(emptyGarage());
    expect(sanitizeGarage({ slots: [red, blue, red, blue, red] }).slots).toHaveLength(3);
  });

  it('keeps several different buses at once', () => {
    let g = putBus(emptyGarage(), 0, red);
    g = putBus(g, 2, blue);
    expect(busCount(g)).toBe(2);
    expect(g.slots[0]!.color).toBe(0xe63946);
    expect(g.slots[1]).toBeNull();
    expect(g.slots[2]!.body).toBe('bendy');
    expect(g.current).toBe(2); // the one just saved drives
  });

  it('selects only filled slots', () => {
    const g = putBus(putBus(emptyGarage(), 0, red), 2, blue);
    expect(selectBus(g, 0).current).toBe(0);
    expect(selectBus(g, 1).current).toBe(2); // empty slot: unchanged
  });

  it('removing the current bus falls back to another one', () => {
    let g = putBus(putBus(emptyGarage(), 0, red), 2, blue); // current = 2
    g = removeBus(g, 2);
    expect(g.current).toBe(0);
    expect(busCount(g)).toBe(1);
    g = removeBus(g, 0);
    expect(busCount(g)).toBe(0);
    expect(removeBus(g, 1)).toEqual(g);
  });

  it('new buses go to a free slot, or replace the current one when full', () => {
    let g = emptyGarage();
    expect(slotForNewBus(g)).toBe(0);
    g = putBus(g, 0, red);
    expect(slotForNewBus(g)).toBe(1);
    g = putBus(putBus(g, 1, blue), 2, red);
    expect(slotForNewBus(selectBus(g, 1))).toBe(1);
  });

  it('survives corrupt data and repairs the current slot', () => {
    expect(sanitizeGarage('nonsense')).toEqual(emptyGarage());
    expect(sanitizeGarage({ slots: [null, { body: 'rocket' }, null], current: 0 })).toMatchObject({
      current: 1,
      slots: [null, { body: 'city' }, null],
    });
  });

  it('tracks health and fuel per bus, preserves on edit, resets on remove', () => {
    let g = putBus(emptyGarage(), 0, red);
    g = putBus(g, 1, blue);
    expect(g.status[0]).toEqual(freshStatus());
    expect(g.status[1]).toEqual(freshStatus());

    g = updateBusStatus(g, 0, { health: 62, fuel: 38 });
    expect(g.status[0]).toEqual({ health: 62, fuel: 38 });
    expect(g.status[1]).toEqual(freshStatus()); // other bus is untouched

    // Editing an existing bus keeps its wear and fuel
    g = putBus(g, 0, { ...red, number: '42' });
    expect(g.status[0]).toEqual({ health: 62, fuel: 38 });

    // Removing a bus resets its slot to fresh
    g = removeBus(g, 0);
    expect(g.status[0]).toEqual(freshStatus());
  });

  it('clamps and sanitizes corrupt bus status data', () => {
    expect(sanitizeStatus({ health: 140, fuel: -15 })).toEqual({ health: 100, fuel: 0 });
    expect(sanitizeStatus({ health: 'bad', fuel: NaN })).toEqual(freshStatus());
    const g = sanitizeGarage({ slots: [red, null, null], status: [{ health: 44, fuel: 19 }, { health: 10, fuel: 5 }], current: 0 });
    expect(g.status[0]).toEqual({ health: 44, fuel: 19 });
    expect(g.status[1]).toEqual(freshStatus()); // empty slot always resets to fresh
  });
});
