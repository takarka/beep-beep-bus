import { describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN } from '../src/bus/design';
import {
  GARAGE_SIZE,
  busCount,
  emptyGarage,
  putBus,
  removeBus,
  sanitizeGarage,
  selectBus,
  slotForNewBus,
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
});
