import Phaser from 'phaser';
import { GAME_W } from '../config';
import type { LightState } from '../core/traffic';
import { mulberry32, pick, randRange, type Rng } from '../core/rng';
import { AI, ONCOMING_STOP_OFFSET, SPECS, bumpZones, nextSpeed, pickKind, spawnDelay, targetSpeed, type VehicleKind } from './ai';
import { CAR_COLORS, MINIBUS_COLORS, VehicleView } from './VehicleView';
import { depthForY } from './Crossing';
import { LANE_Y } from './lanes';

/** The two oncoming lanes: 0 = the one next to the middle line, 1 = the far one. */
const ONCOMING_Y = [LANE_Y.oncomingNear, LANE_Y.oncomingFar] as const;
/**
 * Drawing scale per kind, chosen so the proportions to our bus (about 380 px long, 150 px tall) look real:
 * a car is roughly 45% of its length, a small bus about 60%. A bit smaller than the near lane: perspective.
 */
const SCALES: Record<VehicleKind, number> = { car: 1.12, police: 1.12, minibus: 0.92 };
const MAX_VEHICLES = 9;
const SPAWN_AHEAD = 320;
const SPAWN_GAP = 250;

interface Vehicle {
  kind: VehicleKind;
  view: VehicleView;
  /** World x of the centre. */
  x: number;
  v: number;
  cruise: number;
  /** World length (scaled). */
  len: number;
  scale: number;
  /** 0 = near oncoming lane, 1 = far oncoming lane. */
  lane: 0 | 1;
}

export interface SignalState {
  lineX: number;
  state: LightState;
}

/**
 * Other road users driving towards us in the far lane. They never touch our bus, but they obey the
 * rules: stop for red lights (at their own stop line, past the zebra crossing) and keep their distance.
 */
export class TrafficManager {
  private vehicles: Vehicle[] = [];
  private rng: Rng = mulberry32(Math.floor(Math.random() * 1e9));
  private timer = 1.5;
  private readonly zones;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly opts: { night: boolean; level: number; bumps: readonly number[] },
  ) {
    this.zones = bumpZones(opts.bumps, false);
  }

  /** Puts a few vehicles on the road so it isn't empty at the start. */
  prewarm(scrollX: number): void {
    let x = scrollX + 140 + this.rng() * 200;
    while (x < scrollX + GAME_W + 200 && this.vehicles.length < 6) {
      const v = this.spawn(x);
      x += v.len * 0.6 + 200 + this.rng() * 300;
    }
  }

  private spawn(x: number, lane: 0 | 1 = this.rng() < 0.6 ? 0 : 1): Vehicle {
    const kind = pickKind(this.rng, this.vehicles.some((v) => v.kind === 'police'));
    const spec = SPECS[kind];
    const color = kind === 'minibus' ? pick(this.rng, MINIBUS_COLORS) : pick(this.rng, CAR_COLORS);
    const view = new VehicleView(this.scene, kind, color, this.rng() < 0.5 ? 0 : 1, this.opts.night);
    const scale = SCALES[kind] * (lane === 1 ? 0.93 : 1); // the far lane is a bit smaller: perspective
    view.setScale(-scale, scale); // mirrored: drives left
    view.setPosition(x, ONCOMING_Y[lane]);
    view.setDepth(depthForY(ONCOMING_Y[lane]));
    const cruise = randRange(this.rng, spec.cruise[0], spec.cruise[1]);
    const vehicle: Vehicle = { kind, view, x, v: cruise, cruise, len: spec.length * scale, scale, lane };
    this.vehicles.push(vehicle);
    return vehicle;
  }

  update(dt: number, scrollX: number, signals: readonly SignalState[]): void {
    const lights = signals.map((s) => ({ stopX: s.lineX + ONCOMING_STOP_OFFSET, state: s.state }));

    // Each lane has its own queue. Leaders first: the vehicle with the smallest x is furthest along.
    const ordered = this.vehicles.slice().sort((a, b) => a.x - b.x);
    ordered.forEach((veh) => {
      const leader = ordered.filter((o) => o.lane === veh.lane && o.x < veh.x).pop() ?? null;
      const target = targetSpeed({
        cruise: veh.cruise,
        v: veh.v,
        front: veh.x - veh.len / 2,
        leaderRear: leader ? leader.x + leader.len / 2 : null,
        lights,
        zones: this.zones,
      });
      veh.v = nextSpeed(veh.v, target, dt);
      const dx = veh.v * dt;
      const before = veh.x;
      veh.x -= dx;
      for (const bx of this.opts.bumps) if (before > bx && veh.x <= bx) this.hop(veh);
      veh.view.setX(veh.x);
      veh.view.roll(dx, veh.scale);
      if (veh.kind === 'police') veh.view.siren(this.scene.time.now);
    });

    // Leave the stage behind the camera.
    this.vehicles = this.vehicles.filter((veh) => {
      const gone = veh.x + veh.len / 2 < scrollX - 300;
      if (gone) veh.view.destroy();
      return !gone;
    });

    this.timer -= dt;
    if (this.timer <= 0) this.timer = this.trySpawn(scrollX) ? spawnDelay(this.rng, this.opts.level) : 0.4;
  }

  /** A little hop as the vehicle drives over a bump. */
  private hop(veh: Vehicle): void {
    this.scene.tweens.add({ targets: veh.view, y: ONCOMING_Y[veh.lane] - 7, yoyo: true, duration: 110, ease: 'Quad.easeOut' });
  }

  private trySpawn(scrollX: number): boolean {
    if (this.vehicles.length >= MAX_VEHICLES) return false;
    const x = scrollX + GAME_W + SPAWN_AHEAD;
    // Pick a lane that is free; wait while a queue (e.g. at a red light) still reaches the spawn point.
    const lanes: Array<0 | 1> = this.rng() < 0.6 ? [0, 1] : [1, 0];
    for (const lane of lanes) {
      if (this.vehicles.some((v) => v.lane === lane && Math.abs(v.x - x) < v.len / 2 + 110 + SPAWN_GAP + AI.minGap)) continue;
      this.spawn(x, lane);
      return true;
    }
    return false;
  }
}
