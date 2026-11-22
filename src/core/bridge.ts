/**
 * Long gently-arched ("oval") bridges over a lake.
 * Pure maths (no Phaser), so unit tests and traffic/bus physics can share it directly.
 */
export interface BridgeData {
  /** World x where the bridge deck begins. */
  x0: number;
  /** World x where the bridge deck ends. */
  x1: number;
  /** Maximum upward arch rise at the midpoint of the bridge (world px). */
  arch: number;
}

/** Gentle oval arch height: ~1:40 rise-to-span ratio, max pitch ~4.5 degrees. */
export const BRIDGE_ARCH = 68;
export const BRIDGE_MIN_LEN = 2500;
export const BRIDGE_MAX_LEN = 2900;

/** Some levels across all three cities feature a long bridge over a lake (2, 5, 8, 11, 14, 17, 20, 23). */
export const hasBridgeFor = (level: number): boolean => level >= 2 && level % 3 === 2;

/** Returns the bridge covering world `x`, or null if `x` is on flat road. */
export function bridgeAt(bridges: readonly BridgeData[], x: number): BridgeData | null {
  for (const b of bridges) {
    if (x >= b.x0 && x <= b.x1) return b;
  }
  return null;
}

/**
 * Upward vertical lift (px >= 0) of the road surface at world `x`.
 * Uses a smooth sin²(πt) arch so both entry and exit have zero slope (C¹ continuous).
 */
export function bridgeLiftAt(bridges: readonly BridgeData[], x: number): number {
  const b = bridgeAt(bridges, x);
  if (!b) return 0;
  const span = b.x1 - b.x0;
  if (span <= 0) return 0;
  const t = (x - b.x0) / span;
  const s = Math.sin(Math.PI * t);
  return b.arch * s * s;
}

/**
 * Pitch angle of the road surface at world `x` in Phaser degrees.
 * Negative when climbing up-right (screen Y decreases), positive when descending down-right.
 */
export function bridgeSlopeDegAt(bridges: readonly BridgeData[], x: number): number {
  const b = bridgeAt(bridges, x);
  if (!b) return 0;
  const span = b.x1 - b.x0;
  if (span <= 0) return 0;
  const t = (x - b.x0) / span;
  // d/dx [arch * sin²(πt)] = (π * arch / span) * sin(2πt)
  const dhdx = ((Math.PI * b.arch) / span) * Math.sin(2 * Math.PI * t);
  return -Math.atan(dhdx) * (180 / Math.PI);
}
