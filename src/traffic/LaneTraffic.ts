import Phaser from 'phaser';
import { BusView } from '../bus/BusView';
import { BUS_COLORS, type BusDesign } from '../bus/design';
import { BODY_SIZE, DRIVE_SCALE } from '../bus/geometry';
import { GAME_W } from '../config';
import { mulberry32, pick, randInt, randRange, type Rng } from '../core/rng';
import type { LightState } from '../core/traffic';
import { GROUND_Y } from '../ui/textures';
import { DRIVERS, bumpZones, lanePlan, nextSpeed, targetSpeed, type Driver } from './ai';
import { resolveLane, type Body } from './collision';
import { depthForY } from './Crossing';
import { CAR_COLORS, MINIBUS_COLORS, VehicleView } from './VehicleView';

type LaneKind = 'car' | 'minibus' | 'bus';

/** Drawing scale per kind (a car is about half as long as our bus) and the speeds drivers like. */
const KIND = {
  car: { length: 150, scale: 1.2, cruise: [185, 255] },
  minibus: { length: 230, scale: 1.02, cruise: [150, 200] },
} as const;
const BUS_CRUISE: readonly [number, number] = [140, 190];
const SIGNALS_STOP_FROM = 0; // vehicles stop right at the line, like our bus should
const MAX_VEHICLES = 6;
/** Seconds a vehicle stands still after a crash. */
const STALL = 1.8;

interface LaneVehicle {
  kind: LaneKind;
  driver: Driver;
  view: VehicleView | BusView;
  /** World x of the centre. */
  x: number;
  v: number;
  cruise: number;
  /** World length (scaled). */
  len: number;
  scale: number;
  stall: number;
  /** Distance still to drive before it turns into a side street. */
  life: number;
  leaving: boolean;
}

export interface SignalState {
  lineX: number;
  state: LightState;
}

export interface PlayerBody {
  x: number;
  len: number;
  v: number;
}

export interface LaneCrash {
  /** World x where they touched. */
  x: number;
  impact: number;
  /** 'follower': our bus ran into somebody. 'leader': somebody ran into our bus. */
  player: 'follower' | 'leader' | null;
}

export interface LaneResult {
  /** Our bus after the collisions (position pushed back / speed shared), or null if it was not part of the lane. */
  player: PlayerBody | null;
  crashes: LaneCrash[];
}

/**
 * Other road users in our own lane, driving the same way. They are solid: nobody drives through
 * anybody, our bus included. They stop for red lights and keep their distance, but "hasty" drivers
 * follow too close and can run into us when we stop suddenly.
 */
export class LaneTraffic {
  private vehicles: LaneVehicle[] = [];
  private rng: Rng = mulberry32(Math.floor(Math.random() * 1e9));
  private aheadTimer: number;
  private behindTimer: number;
  private readonly plan: ReturnType<typeof lanePlan>;
  private readonly zones;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly opts: { night: boolean; level: number; bumps: readonly number[] },
  ) {
    this.plan = lanePlan(opts.level);
    this.zones = bumpZones(opts.bumps, true);
    this.aheadTimer = randRange(this.rng, 4, 8);
    this.behindTimer = randRange(this.rng, 7, 12);
  }

  get enabled(): boolean {
    return this.plan.enabled;
  }

  /** One vehicle already ahead of us at the start, so the road is not empty. */
  prewarm(playerX: number): void {
    if (!this.plan.enabled) return;
    this.spawn(playerX + 1100 + this.rng() * 500);
  }

  /** The nearest vehicle in front of x: the gap to its rear and its speed. */
  leaderAhead(frontX: number): { gap: number; v: number } | null {
    let best: LaneVehicle | null = null;
    for (const v of this.vehicles) {
      if (v.leaving || v.x - v.len / 2 < frontX - 5) continue;
      if (!best || v.x < best.x) best = v;
    }
    return best ? { gap: best.x - best.len / 2 - frontX, v: best.v } : null;
  }

  private spawn(x: number): LaneVehicle {
    const roll = this.rng();
    const kind: LaneKind = roll < 0.6 ? 'car' : roll < 0.8 ? 'minibus' : 'bus';
    const hasty: Driver = kind !== 'bus' && this.rng() < this.plan.hastyChance ? 'hasty' : 'careful';
    let view: VehicleView | BusView;
    let len: number;
    let scale: number;
    let cruise: number;
    if (kind === 'bus') {
      const body = pick(this.rng, ['city', 'city', 'bendy', 'double'] as const);
      const design: BusDesign = {
        body,
        doors: 2,
        wheels: 'classic',
        color: pick(this.rng, BUS_COLORS),
        lights: 'round',
        decor: pick(this.rng, ['none', 'stripe', 'dots', 'stars'] as const),
        number: String(randInt(this.rng, 1, 99)),
      };
      const bus = new BusView(this.scene, x, GROUND_Y, design);
      bus.setScale(DRIVE_SCALE[body]).setNight(this.opts.night);
      bus.setPassengers(randInt(this.rng, 0, 4));
      view = bus;
      scale = DRIVE_SCALE[body];
      len = (BODY_SIZE[body].L + 0) * scale;
      cruise = randRange(this.rng, BUS_CRUISE[0], BUS_CRUISE[1]);
    } else {
      const k = KIND[kind];
      const color = kind === 'minibus' ? pick(this.rng, MINIBUS_COLORS) : pick(this.rng, CAR_COLORS);
      const car = new VehicleView(this.scene, kind, color, this.rng() < 0.5 ? 0 : 1, this.opts.night);
      car.setScale(k.scale).setPosition(x, GROUND_Y);
      view = car;
      scale = k.scale;
      len = k.length * k.scale;
      cruise = randRange(this.rng, k.cruise[0], k.cruise[1]);
    }
    view.setDepth(depthForY(GROUND_Y));
    const vehicle: LaneVehicle = {
      kind,
      driver: hasty,
      view,
      x,
      v: cruise,
      cruise,
      len,
      scale,
      stall: 0,
      life: randInt(this.rng, 2200, 4200),
      leaving: false,
    };
    this.vehicles.push(vehicle);
    return vehicle;
  }

  update(dt: number, scrollX: number, signals: readonly SignalState[], player: PlayerBody | null): LaneResult {
    // Mirrored coordinates (x → -x) let the oncoming-lane driver maths work for traffic going right.
    const lights = signals.map((s) => ({ stopX: -(s.lineX + SIGNALS_STOP_FROM), state: s.state }));

    const solid = this.vehicles.filter((v) => !v.leaving);
    const sorted: Array<{ x: number; len: number; ref: LaneVehicle | null }> = solid.map((v) => ({ x: v.x, len: v.len, ref: v }));
    if (player) sorted.push({ x: player.x, len: player.len, ref: null });
    sorted.sort((a, b) => a.x - b.x);

    sorted.forEach((e, i) => {
      const veh = e.ref;
      if (!veh) return;
      const leader = sorted[i + 1];
      const d = DRIVERS[veh.driver];
      let target = targetSpeed({
        cruise: veh.cruise,
        v: veh.v,
        front: -(veh.x + veh.len / 2),
        leaderRear: leader ? -(leader.x - leader.len / 2) : null,
        lights,
        zones: this.zones,
        headway: d.headway,
        minGap: d.minGap,
        brake: d.planBrake,
      });
      if (veh.stall > 0) {
        veh.stall -= dt;
        target = 0;
      }
      veh.v = nextSpeed(veh.v, target, dt, d.brake);
    });

    for (const v of this.vehicles) {
      const dx = v.v * dt;
      const before = v.x;
      v.x += dx;
      if (!v.leaving) for (const bx of this.opts.bumps) if (before < bx && v.x >= bx) this.hop(v);
      v.life -= dx;
      v.view.setX(v.x);
      if (v.view instanceof BusView) v.view.roll(dx, dt, Math.min(1, v.v / 260));
      else v.view.roll(dx, v.scale);
    }

    // Solid bodies: nobody drives through anybody.
    const refs: Array<LaneVehicle | null> = solid.slice();
    const bodies: Body[] = solid.map((v) => ({ x: v.x, len: v.len, v: v.v }));
    if (player) {
      refs.push(null);
      bodies.push({ x: player.x, len: player.len, v: player.v });
    }
    const hits = resolveLane(bodies);
    solid.forEach((v, i) => {
      v.x = bodies[i]!.x;
      v.v = bodies[i]!.v;
      v.view.setX(v.x);
    });
    const crashes: LaneCrash[] = hits.map((h) => {
      const f = refs[h.follower] ?? null;
      const l = refs[h.leader] ?? null;
      for (const veh of [f, l]) if (veh) veh.stall = Math.max(veh.stall, STALL);
      const lb = bodies[h.leader]!;
      return { x: lb.x - lb.len / 2, impact: h.impact, player: f === null ? 'follower' : l === null ? 'leader' : null };
    });

    this.warnHasty(player);
    this.leaveAndSpawn(dt, scrollX, player);
    return { player: player ? { x: bodies[bodies.length - 1]!.x, len: player.len, v: bodies[bodies.length - 1]!.v } : null, crashes };
  }

  private hop(v: LaneVehicle): void {
    this.scene.tweens.add({ targets: v.view, y: GROUND_Y - (v.kind === 'bus' ? 8 : 7), yoyo: true, duration: 110, ease: 'Quad.easeOut' });
  }

  /** A hasty driver right behind us gets a red "!" so a child can see that braking hard is risky. */
  private warnHasty(player: PlayerBody | null): void {
    for (const v of this.vehicles) {
      if (!(v.view instanceof VehicleView)) continue;
      const behind = player !== null && v.x < player.x && player.x - player.len / 2 - (v.x + v.len / 2) < 380;
      v.view.setHasty(v.driver === 'hasty' && behind && !v.leaving);
    }
  }

  private leaveAndSpawn(dt: number, scrollX: number, player: PlayerBody | null): void {
    for (const v of this.vehicles) {
      // Turn into a side street (only when it is not hemmed in right behind us).
      if (!v.leaving && v.life <= 0 && v.stall <= 0) {
        v.leaving = true;
        this.scene.tweens.add({ targets: v.view, y: GROUND_Y + 80, alpha: 0, duration: 900, ease: 'Sine.easeIn' });
      }
    }
    this.vehicles = this.vehicles.filter((v) => {
      const gone = v.x < scrollX - 1500 || v.x > scrollX + GAME_W + 2600 || (v.leaving && v.view.alpha <= 0.02);
      if (gone) {
        this.scene.tweens.killTweensOf(v.view);
        v.view.destroy();
      }
      return !gone;
    });

    if (!this.plan.enabled || this.vehicles.length >= MAX_VEHICLES) return;
    this.aheadTimer -= dt;
    this.behindTimer -= dt;
    if (this.aheadTimer <= 0) {
      const x = scrollX + GAME_W + 280;
      if (!this.vehicles.some((v) => Math.abs(v.x - x) < v.len / 2 + 450)) {
        this.spawn(x);
        this.aheadTimer = randRange(this.rng, this.plan.ahead[0], this.plan.ahead[1]);
      } else this.aheadTimer = 1;
    }
    if (this.behindTimer <= 0 && player) {
      const x = scrollX - 330;
      if (!this.vehicles.some((v) => Math.abs(v.x - x) < v.len / 2 + 500) && Math.abs(player.x - x) > 500) {
        this.spawn(x);
        this.behindTimer = randRange(this.rng, this.plan.behind[0], this.plan.behind[1]);
      } else this.behindTimer = 1;
    }
  }

  /** The route is over: let everybody drive on, nothing collides any more. */
  clear(): void {
    for (const v of this.vehicles) {
      this.scene.tweens.killTweensOf(v.view);
      v.view.destroy();
    }
    this.vehicles = [];
  }
}
