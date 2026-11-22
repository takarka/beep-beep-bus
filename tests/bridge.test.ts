import { describe, expect, it } from 'vitest';
import { BRIDGE_ARCH, BRIDGE_MIN_LEN, bridgeLiftAt, bridgeSlopeDegAt, hasBridgeFor, type BridgeData } from '../src/core/bridge';
import { LEVEL_COUNT } from '../src/core/campaign';
import { generateLevel } from '../src/core/level';

describe('bridge geometry', () => {
  const b: BridgeData = { x0: 1000, x1: 3800, arch: BRIDGE_ARCH };

  it('has zero lift and zero slope outside and at both ends (C1 smooth transition)', () => {
    for (const x of [0, 999, 1000, 3800, 3801, 5000]) {
      expect(bridgeLiftAt([b], x)).toBeCloseTo(0, 6);
      expect(bridgeSlopeDegAt([b], x)).toBeCloseTo(0, 6);
    }
  });

  it('peaks smoothly at the centre with gentle oval arch height and symmetric slopes', () => {
    const mid = (b.x0 + b.x1) / 2;
    expect(bridgeLiftAt([b], mid)).toBeCloseTo(b.arch, 6);
    expect(bridgeSlopeDegAt([b], mid)).toBeCloseTo(0, 6);

    const q1 = b.x0 + (b.x1 - b.x0) * 0.25;
    const q3 = b.x0 + (b.x1 - b.x0) * 0.75;
    expect(bridgeLiftAt([b], q1)).toBeCloseTo(b.arch / 2, 5);
    expect(bridgeLiftAt([b], q3)).toBeCloseTo(b.arch / 2, 5);

    // Climbing: negative Phaser angle (nose up); descending: positive (nose down); gentle (< 6 degrees)
    const up = bridgeSlopeDegAt([b], q1);
    const down = bridgeSlopeDegAt([b], q3);
    expect(up).toBeLessThan(0);
    expect(down).toBeGreaterThan(0);
    expect(Math.abs(up)).toBeLessThan(6);
    expect(up).toBeCloseTo(-down, 6);
  });
});

describe('level bridges', () => {
  it('places a long bridge on some levels across the campaign and keeps it clear of all road items', () => {
    let withBridge = 0;
    let withoutBridge = 0;
    for (let l = 1; l <= LEVEL_COUNT; l++) {
      const lvl = generateLevel(l);
      expect(lvl.bridges).toEqual(generateLevel(l).bridges); // deterministic
      if (hasBridgeFor(l)) {
        withBridge++;
        expect(lvl.bridges).toHaveLength(1);
        const br = lvl.bridges[0]!;
        expect(br.x1 - br.x0).toBeGreaterThanOrEqual(BRIDGE_MIN_LEN);
        expect(br.arch).toBe(BRIDGE_ARCH);
        expect(br.x1).toBeLessThan(lvl.finishX - 600);

        const spots = lvl.items.map((i) => (i.kind === 'stop' ? i.zoneEnd : i.lineX));
        const all = [...spots, ...lvl.stations, ...lvl.bumps, ...lvl.crosswalks, ...lvl.stopSigns, ...lvl.parked, ...lvl.children];
        for (const x of all) {
          // Nothing spawns on or right next to the bridge
          expect(x < br.x0 - 400 || x > br.x1 + 400).toBe(true);
        }
      } else {
        withoutBridge++;
        expect(lvl.bridges).toEqual([]);
      }
    }
    expect(withBridge).toBeGreaterThan(0);
    expect(withoutBridge).toBeGreaterThan(0);
  });
});
