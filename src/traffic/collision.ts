/**
 * Vehicles in one lane can't drive through each other (pure maths, no Phaser).
 * Every body has a centre x and a length; the lane runs left → right, so a "leader" is the body
 * with the larger x. After every step `resolveLane` pushes overlapping followers back, shares the
 * momentum and reports the crashes.
 */
export interface Body {
  x: number;
  len: number;
  v: number;
}

export interface Crash {
  /** Indices into the array that was passed in. */
  follower: number;
  leader: number;
  /** How fast the follower was closing in, px/s. */
  impact: number;
}

/** Slower bumps than this are just touching, not a crash. */
export const CRASH_MIN_IMPACT = 30;
/** 0 = both stick together, 1 = bounce apart perfectly. Small: cartoon bumps don't ping-pong. */
const BOUNCE = 0.15;

export const gapBetween = (follower: Body, leader: Body): number => leader.x - leader.len / 2 - (follower.x + follower.len / 2);

export function resolveLane(bodies: Body[]): Crash[] {
  const order = bodies.map((_, i) => i).sort((a, b) => bodies[a]!.x - bodies[b]!.x);
  const crashes: Crash[] = [];
  // From the front of the queue to the back, so a push can ripple backwards.
  for (let k = order.length - 2; k >= 0; k--) {
    const fi = order[k]!;
    const li = order[k + 1]!;
    const f = bodies[fi]!;
    const l = bodies[li]!;
    const gap = gapBetween(f, l);
    if (gap >= 0) continue;
    f.x += gap; // push the follower back so they only touch
    const rel = f.v - l.v;
    if (rel <= 0) continue;
    // Share the momentum (mass ~ length), with a little bounce.
    const mf = f.len;
    const ml = l.len;
    const vcm = (mf * f.v + ml * l.v) / (mf + ml);
    f.v = vcm - BOUNCE * (ml / (mf + ml)) * rel;
    l.v = vcm + BOUNCE * (mf / (mf + ml)) * rel;
    if (rel >= CRASH_MIN_IMPACT) crashes.push({ follower: fi, leader: li, impact: rel });
  }
  return crashes;
}
