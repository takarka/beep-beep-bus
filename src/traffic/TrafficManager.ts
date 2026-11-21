import Phaser from 'phaser';
import { GAME_W } from '../config';
import type { LightState } from '../core/traffic';
import { mulberry32, pick, randRange, type Rng } from '../core/rng';
import { AI, ONCOMING_STOP_OFFSET, SPECS, bumpZones, nextSpeed, pickKind, spawnDelay, targetSpeed, wantsToOvertake, type VehicleKind } from './ai';
import { CAR_COLORS, MINIBUS_COLORS, VehicleView } from './VehicleView';
import { depthForY } from './Crossing';
import { LANE_CHANGE_TIME, LANE_Y } from './lanes';

/** The two oncoming lanes: 0 = the one next to the middle line, 1 = the far one. */
const ONCOMING_Y = [LANE_Y.oncomingNear, LANE_Y.oncomingFar] as const;
/**
 * Drawing scale per kind, chosen so the proportions to our bus (about 380 px long, 150 px tall) look real:
 * a car is roughly 45% of its length, a small bus about 60%. A bit smaller than the near lane: perspective.
 */
const SCALES: Record<VehicleKind, number> = { car: 1.12, police: 1.12, taxi: 1.12, truck: 0.96, minibus: 0.92, ambulance: 1.05 };
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
  fromLane: 0 | 1;
  changeT: number;
  cool: number;
  passTimer: number;
  y: number;
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
    const kind = pickKind(this.rng, this.vehicles.some((v) => v.kind === 'police' || v.kind === 'ambulance'));
    const spec = SPECS[kind];
    const color = kind === 'minibus' ? pick(this.rng, MINIBUS_COLORS) : pick(this.rng, CAR_COLORS);
    const view = new VehicleView(this.scene, kind, color, this.rng() < 0.5 ? 0 : 1, this.opts.night);
    const scale = SCALES[kind] * (lane === 1 ? 0.93 : 1); // the far lane is a bit smaller: perspective
    view.setScale(-scale, scale); // mirrored: drives left
    view.setPosition(x, ONCOMING_Y[lane]);
    view.setDepth(depthForY(ONCOMING_Y[lane]));
    const cruise = randRange(this.rng, spec.cruise[0], spec.cruise[1]);
    const vehicle: Vehicle = {
      kind,
      view,
      x,
      v: cruise,
      cruise,
      len: spec.length * scale,
      scale,
      lane,
      fromLane: lane,
      changeT: 0,
      cool: randRange(this.rng, 0.4, 1.5),
      passTimer: 0,
      y: ONCOMING_Y[lane],
    };
    this.vehicles.push(vehicle);
    return vehicle;
  }

  update(dt: number, scrollX: number, signals: readonly SignalState[]): void {
    const lights = signals.map((s) => ({ stopX: s.lineX + ONCOMING_STOP_OFFSET, state: s.state }));

    // Each lane has its own queue. Leaders first: the vehicle with the smallest x is furthest along.
    const ordered = this.vehicles.slice().sort((a, b) => a.x - b.x);
    ordered.forEach((veh) => {
      const leader = ordered.filter((o) => (o.lane === veh.lane || (o.changeT > 0 && o.fromLane === veh.lane)) && o.x < veh.x).pop() ?? null;
      const target = targetSpeed({
        cruise: veh.cruise * (veh.lane === 0 && veh.passTimer > 0 ? 1.15 : 1),
        v: veh.v,
        front: veh.x - veh.len / 2,
        leaderRear: leader ? leader.x + leader.len / 2 : null,
        lights,
        zones: this.zones,
      });
      veh.v = nextSpeed(veh.v, target, dt);
      veh.cool -= dt;
      veh.passTimer -= dt;
      if (veh.changeT > 0) veh.changeT -= dt;
      else if (veh.cool <= 0) this.decideLane(veh, leader, lights);
      const targetY = ONCOMING_Y[veh.lane];
      const stepY = (Math.abs(ONCOMING_Y[0] - ONCOMING_Y[1]) / LANE_CHANGE_TIME) * dt;
      veh.y += Phaser.Math.Clamp(targetY - veh.y, -stepY, stepY);

      const dx = veh.v * dt;
      const before = veh.x;
      veh.x -= dx;
      for (const bx of this.opts.bumps) if (before > bx && veh.x <= bx) this.hop(veh);
      veh.view.setPosition(veh.x, veh.y);
      veh.view.setDepth(depthForY(veh.y));
      veh.view.setBlinker(veh.changeT > 0, this.scene.time.now);
      veh.view.roll(dx, veh.scale);
      if (veh.kind === 'police' || veh.kind === 'ambulance') veh.view.siren(this.scene.time.now);
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

  /** Oncoming drivers overtake slower vehicles ahead when the other oncoming lane is clear. */
  private decideLane(veh: Vehicle, leader: Vehicle | null, lights: readonly { stopX: number; state: LightState }[]): void {
    const front = veh.x - veh.len / 2;
    const blocked =
      lights.some((l) => l.state !== 'green' && front > l.stopX - 20 && front - l.stopX < 800) ||
      this.opts.bumps.some((bx) => front > bx - 60 && front - bx < 420);
    if (blocked) return;
    const other: 0 | 1 = veh.lane === 0 ? 1 : 0;
    const clear = !this.vehicles.some(
      (o) =>
        o !== veh &&
        (o.lane === other || (o.changeT > 0 && o.fromLane === other)) &&
        Math.abs(o.x - veh.x) < (o.len + veh.len) / 2 + 160,
    );
    if (!clear) return;
    const gap = leader ? front - (leader.x + leader.len / 2) : Infinity;
    if (leader && wantsToOvertake(veh.cruise, veh.v, { gap, v: leader.v })) {
      veh.fromLane = veh.lane;
      veh.lane = other;
      veh.changeT = LANE_CHANGE_TIME;
      veh.passTimer = 1.8;
      veh.cool = LANE_CHANGE_TIME + 1.0;
    }
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
