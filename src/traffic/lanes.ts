export type LaneIndex = 0 | 1;

/**
 * The road has four lanes, two for each direction. Wheels touch the road at these heights
 * (far to near): oncoming far lane, oncoming near lane, our passing lane, our own lane.
 * Vehicles in different lanes overlap on screen; the one further down is drawn in front.
 * Pure maths (no Phaser), so unit tests can import it directly.
 */
export const LANE_Y = {
  oncomingFar: 502,
  oncomingNear: 534,
  passing: 566,
  main: 598,
} as const;

/** Seconds a lane change takes: the vehicle drifts sideways, and blocks both lanes meanwhile. */
export const LANE_CHANGE_TIME = 0.85;

export interface LaneMotion {
  /** Target lane: 0 = main (next to the sidewalk), 1 = passing (next to the centre line). */
  lane: LaneIndex;
  /** Lane the vehicle started from during a lane change. */
  fromLane: LaneIndex;
  /** Seconds left in the current lane change (0 when settled in `lane`). */
  changeT: number;
  /** Current wheel height on the road. */
  y: number;
}

export const laneY = (lane: LaneIndex): number => (lane === 0 ? LANE_Y.main : LANE_Y.passing);

export function createLaneMotion(lane: LaneIndex = 0): LaneMotion {
  return { lane, fromLane: lane, changeT: 0, y: laneY(lane) };
}

/** Maximum lateral distance (px) from a lane's wheel height to physically collide with traffic in that lane. */
export const COLLISION_LANE_MARGIN = 18;

/** True when a vehicle occupies `lane` (while changing lanes it blocks both). */
export function occupiesLane(m: Pick<LaneMotion, 'lane' | 'fromLane' | 'changeT'>, lane: LaneIndex): boolean {
  return m.lane === lane || (m.changeT > 0 && m.fromLane === lane);
}

/** True when a vehicle at wheel height `y` physically overlaps `lane` for collision purposes. */
export function collidesInLane(y: number, lane: LaneIndex): boolean {
  return Math.abs(y - laneY(lane)) < COLLISION_LANE_MARGIN;
}

/** Starts a lane change to `to`; returns false if already targeting `to`. */
export function startLaneChange(m: LaneMotion, to: LaneIndex): boolean {
  if (m.lane === to) return false;
  const span = Math.abs(LANE_Y.main - LANE_Y.passing);
  const dist = Math.abs(laneY(to) - m.y);
  m.fromLane = m.lane;
  m.lane = to;
  m.changeT = Math.max(0.12, (dist / span) * LANE_CHANGE_TIME);
  return true;
}

/** Advances sideways drift by `dt` seconds and returns the nose tilt angle (degrees). */
export function stepLaneChange(m: LaneMotion, dt: number): number {
  if (m.changeT > 0) m.changeT = Math.max(0, m.changeT - dt);
  const targetY = laneY(m.lane);
  const step = (Math.abs(LANE_Y.main - LANE_Y.passing) / LANE_CHANGE_TIME) * dt;
  const diff = targetY - m.y;
  m.y += Math.max(-step, Math.min(step, diff));
  if (Math.abs(targetY - m.y) < 0.01) {
    m.y = targetY;
    m.changeT = 0;
  }
  return Math.max(-1, Math.min(1, (targetY - m.y) / 32)) * 3;
}
