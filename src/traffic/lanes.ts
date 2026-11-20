import { GROUND_Y } from '../ui/textures';

/**
 * The road has four lanes, two for each direction. Wheels touch the road at these heights
 * (far to near): oncoming far lane, oncoming near lane, our passing lane, our own lane.
 * Vehicles in different lanes overlap on screen; the one further down is drawn in front.
 */
export const LANE_Y = {
  oncomingFar: 502,
  oncomingNear: 534,
  passing: 566,
  main: GROUND_Y,
} as const;

/** Seconds a lane change takes: the vehicle drifts sideways, and blocks both lanes meanwhile. */
export const LANE_CHANGE_TIME = 0.85;
