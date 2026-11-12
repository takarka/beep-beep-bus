import Phaser from 'phaser';
import { GAME_W } from '../config';
import type { LightState } from '../core/traffic';
import { mulberry32, pick, randRange, type Rng } from '../core/rng';
import { AI, ONCOMING_STOP_OFFSET, SPECS, nextSpeed, pickKind, spawnDelay, targetSpeed, type VehicleKind } from './ai';
import { CAR_COLORS, MINIBUS_COLORS, VehicleView } from './VehicleView';

/** Wheels of the oncoming lane touch the road here (just above the lane dashes). */
export const ONCOMING_GROUND_Y = 542;
/**
 * Drawing scale per kind, chosen so the proportions to our bus (about 380 px long, 150 px tall) look real:
 * a car is roughly 45% of its length, a small bus about 60%. A bit smaller than the near lane: perspective.
 */
const SCALES: Record<VehicleKind, number> = { car: 1.12, police: 1.12, minibus: 0.92 };
const MAX_VEHICLES = 7;
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

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly opts: { night: boolean; level: number },
  ) {}

  /** Puts a few vehicles on the road so it isn't empty at the start. */
  prewarm(scrollX: number): void {
    let x = scrollX + 140 + this.rng() * 200;
    while (x < scrollX + GAME_W + 200 && this.vehicles.length < 4) {
      const v = this.spawn(x);
      x += v.len + 330 + this.rng() * 350;
    }
  }

  private spawn(x: number): Vehicle {
    const kind = pickKind(this.rng, this.vehicles.some((v) => v.kind === 'police'));
    const spec = SPECS[kind];
    const color = kind === 'minibus' ? pick(this.rng, MINIBUS_COLORS) : pick(this.rng, CAR_COLORS);
    const view = new VehicleView(this.scene, kind, color, this.rng() < 0.5 ? 0 : 1, this.opts.night);
    view.setDepth(5);
    const scale = SCALES[kind];
    view.setScale(-scale, scale); // mirrored: drives left
    view.setPosition(x, ONCOMING_GROUND_Y);
    const cruise = randRange(this.rng, spec.cruise[0], spec.cruise[1]);
    const vehicle: Vehicle = { kind, view, x, v: cruise, cruise, len: spec.length * scale, scale };
    this.vehicles.push(vehicle);
    return vehicle;
  }

  update(dt: number, scrollX: number, signals: readonly SignalState[]): void {
    const lights = signals.map((s) => ({ stopX: s.lineX + ONCOMING_STOP_OFFSET, state: s.state }));

    // Leaders first: the vehicle with the smallest x is furthest along its way.
    const ordered = this.vehicles.slice().sort((a, b) => a.x - b.x);
    ordered.forEach((veh, i) => {
      const leader = i > 0 ? ordered[i - 1]! : null;
      const target = targetSpeed({
        cruise: veh.cruise,
        v: veh.v,
        front: veh.x - veh.len / 2,
        leaderRear: leader ? leader.x + leader.len / 2 : null,
        lights,
      });
      veh.v = nextSpeed(veh.v, target, dt);
      const dx = veh.v * dt;
      veh.x -= dx;
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

  private trySpawn(scrollX: number): boolean {
    if (this.vehicles.length >= MAX_VEHICLES) return false;
    const x = scrollX + GAME_W + SPAWN_AHEAD;
    // Wait while a queue (e.g. at a red light) still reaches the spawn point.
    if (this.vehicles.some((v) => Math.abs(v.x - x) < v.len / 2 + 110 + SPAWN_GAP + AI.minGap)) return false;
    this.spawn(x);
    return true;
  }
}
