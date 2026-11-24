import Phaser from 'phaser';
import { BusView } from '../bus/BusView';
import { BUS_COLORS, type BusDesign } from '../bus/design';
import { BODY_SIZE, DRIVE_SCALE } from '../bus/geometry';
import { GAME_W } from '../config';
import { bridgeLiftAt, bridgeSlopeDegAt, type BridgeData } from '../core/bridge';
import { mulberry32, pick, randInt, randRange, type Rng } from '../core/rng';
import type { LightState } from '../core/traffic';
import { DRIVERS, bumpZones, laneClear, lanePlan, nextSpeed, targetSpeed, wantsToOvertake, type Driver } from './ai';
import { LANE_CHANGE_TIME, LANE_Y, collidesInLane, laneY, occupiesLane, type LaneIndex } from './lanes';
import { resolveLane, type Body } from './collision';
import { depthForY } from './Crossing';
import { CAR_COLORS, MINIBUS_COLORS, VehicleView } from './VehicleView';

type LaneKind = 'car' | 'taxi' | 'truck' | 'minibus' | 'bus' | 'ambulance';

/** Drawing scale per kind (a car is about half as long as our bus) and the speeds drivers like. */
const KIND = {
  car: { length: 150, scale: 1.2, cruise: [185, 255] },
  taxi: { length: 150, scale: 1.2, cruise: [195, 265] },
  truck: { length: 245, scale: 1.0, cruise: [120, 160] },
  minibus: { length: 230, scale: 1.02, cruise: [150, 200] },
  ambulance: { length: 190, scale: 1.12, cruise: [285, 330] },
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
  /** 0 = our own lane, 1 = the passing lane (the one further from us, next to the middle line). */
  lane: 0 | 1;
  /** While changing lanes (changeT > 0) the vehicle blocks both lanes. */
  fromLane: 0 | 1;
  changeT: number;
  /** Seconds before it may change lanes again / may return from the passing lane. */
  cool: number;
  passTimer: number;
  /** Current height of the wheels on the road, and a little hop over a bump. */
  y: number;
  hop: number;
  /** Distance still to drive before it turns into a side street. */
  life: number;
  leaving: boolean;
  parked?: boolean;
  ambState?: 'approaching' | 'passed' | 'blocked';
  ambBlockedTime?: number;
  stopWait?: number;
  stopsDone?: Set<number>;
}

export interface SignalState {
  lineX: number;
  state: LightState;
}

export interface PlayerBody {
  x: number;
  len: number;
  v: number;
  lane?: LaneIndex;
  fromLane?: LaneIndex;
  changeT?: number;
  y?: number;
}

export interface LaneCrash {
  /** World x where they touched. */
  x: number;
  /** Road y of the lane where the crash happened. */
  y: number;
  impact: number;
  /** 'follower': our bus ran into somebody. 'leader': somebody ran into our bus. */
  player: 'follower' | 'leader' | null;
}

export interface LaneResult {
  /** Our bus after the collisions (position pushed back / speed shared), or null if it was not part of the lane. */
  player: PlayerBody | null;
  crashes: LaneCrash[];
  ambulanceEvent?: 'approaching' | 'yielded' | 'blocked';
  ambulanceLane?: LaneIndex;
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
  private ambulanceTimer: number;
  private readonly plan: ReturnType<typeof lanePlan>;
  private readonly zones;
  private readonly bridges: readonly BridgeData[];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly opts: {
      night: boolean;
      level: number;
      bumps: readonly number[];
      parked?: readonly number[];
      stops?: readonly number[];
      bridges?: readonly BridgeData[];
      /** No other vehicles at all (not even parked ones). */
      off?: boolean;
    },
  ) {
    this.plan = opts.off ? { ...lanePlan(opts.level), enabled: false } : lanePlan(opts.level);
    this.zones = bumpZones(opts.bumps, true);
    this.bridges = opts.bridges ?? [];
    this.aheadTimer = randRange(this.rng, 4, 8);
    this.behindTimer = randRange(this.rng, 7, 12);
    this.ambulanceTimer = randRange(this.rng, 14, 22);
  }

  get enabled(): boolean {
    return this.plan.enabled;
  }

  /** One vehicle already ahead of us at the start, plus any parked cars on the route. */
  prewarm(playerX: number): void {
    if (!this.opts.off) for (const px of this.opts.parked ?? []) this.spawnParked(px);
    if (!this.plan.enabled) return;
    this.spawn(playerX + 1100 + this.rng() * 500);
  }

  private spawnParked(x: number): void {
    const v = this.spawn(x, 0, 'car');
    v.parked = true;
    v.driver = 'careful';
    v.v = 0;
    v.cruise = 0;
    v.life = Infinity;
  }

  /** The nearest vehicle in front of x in the lane(s) our bus occupies: the gap to its rear and its speed. */
  leaderAhead(frontX: number, lane: LaneIndex = 0, fromLane: LaneIndex = lane, changeT = 0): { gap: number; v: number } | null {
    const me = { lane, fromLane, changeT };
    let best: LaneVehicle | null = null;
    for (const v of this.vehicles) {
      if (v.leaving || v.x - v.len / 2 < frontX - 5) continue;
      const shares = ([0, 1] as const).some((l) => occupiesLane(me, l) && occupiesLane(v, l));
      if (!shares) continue;
      if (!best || v.x < best.x) best = v;
    }
    return best ? { gap: best.x - best.len / 2 - frontX, v: best.v } : null;
  }

  private spawn(x: number, lane: 0 | 1 = 0, forceKind?: LaneKind): LaneVehicle {
    const y = lane === 0 ? LANE_Y.main : LANE_Y.passing;
    const roll = this.rng();
    const kind: LaneKind = forceKind ?? (roll < 0.42 ? 'car' : roll < 0.62 ? 'taxi' : roll < 0.76 ? 'minibus' : roll < 0.88 ? 'truck' : 'bus');
    const hasty: Driver = kind !== 'bus' && kind !== 'ambulance' && this.rng() < this.plan.hastyChance ? 'hasty' : 'careful';
    let view: VehicleView | BusView;
    let len: number;
    let scale: number;
    let cruise: number;
    if (kind === 'bus') {
      const body = pick(this.rng, ['city', 'city', 'bendy', 'van'] as const);
      const design: BusDesign = {
        body,
        doors: 2,
        wheels: 'classic',
        color: pick(this.rng, BUS_COLORS),
        lights: 'round',
        decor: pick(this.rng, ['none', 'stripe', 'dots', 'stars'] as const),
        number: String(randInt(this.rng, 1, 99)),
      };
      const bus = new BusView(this.scene, x, y, design);
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
      car.setScale(k.scale).setPosition(x, y);
      view = car;
      scale = k.scale;
      len = k.length * k.scale;
      cruise = randRange(this.rng, k.cruise[0], k.cruise[1]);
    }
    const lift0 = bridgeLiftAt(this.bridges, x);
    view.setY(y - lift0);
    view.setAngle(bridgeSlopeDegAt(this.bridges, x));
    view.setDepth(depthForY(y));
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
      lane,
      fromLane: lane,
      changeT: 0,
      cool: randRange(this.rng, 0.3, 1.5),
      passTimer: 0,
      y,
      hop: 0,
      life: randInt(this.rng, 2400, 4600),
      leaving: false,
    };
    this.vehicles.push(vehicle);
    return vehicle;
  }

  update(dt: number, scrollX: number, signals: readonly SignalState[], player: PlayerBody | null): LaneResult {
    // Mirrored coordinates (x → -x) let the oncoming-lane driver maths work for traffic going right.
    const lights = signals.map((s) => ({ stopX: -(s.lineX + SIGNALS_STOP_FROM), state: s.state }));

    const solid = this.vehicles.filter((v) => !v.leaving);
    // A vehicle that is changing lanes blocks both lanes until it has finished.
    const occupiesPlayer = (p: PlayerBody, lane: LaneIndex): boolean => {
      const pLane = p.lane ?? 0;
      return occupiesLane({ lane: pLane, fromLane: p.fromLane ?? pLane, changeT: p.changeT ?? 0 }, lane);
    };
    type Ent = { x: number; len: number; v: number; ref: LaneVehicle | null };
    const ents: Ent[] = solid.map((v) => ({ x: v.x, len: v.len, v: v.v, ref: v }));
    const playerEnt: Ent | null = player ? { x: player.x, len: player.len, v: player.v, ref: null } : null;
    const laneEnts = (lane: LaneIndex): Ent[] =>
      [...ents.filter((e) => occupiesLane(e.ref!, lane)), ...(playerEnt && player && occupiesPlayer(player, lane) ? [playerEnt] : [])].sort((a, b) => a.x - b.x);
    const lists: [Ent[], Ent[]] = [laneEnts(0), laneEnts(1)];

    for (const e of ents) {
      const veh = e.ref!;
      if (veh.parked) {
        veh.v = 0;
        continue;
      }
      const d = DRIVERS[veh.driver];
      // the nearest vehicle ahead, in whichever lane(s) this one occupies
      let leader: Ent | null = null;
      for (const lane of [0, 1] as const) {
        if (!occupiesLane(veh, lane)) continue;
        const list = lists[lane];
        const next = list[list.indexOf(e) + 1];
        if (next && (!leader || next.x < leader.x)) leader = next;
      }
      const ambCruise = veh.kind === 'ambulance' ? Math.max(veh.cruise, player ? player.v + 95 : 0, 380) : veh.cruise;
      const busStops =
        veh.kind === 'bus' && veh.lane === 0 && (veh.stopWait ?? 0) <= 0
          ? (this.opts.stops ?? [])
              .filter((zx) => !veh.stopsDone?.has(zx))
              .map((zx) => ({ stopX: -zx, state: 'red' as LightState }))
          : [];
      let target = targetSpeed({
        cruise: ambCruise * (veh.lane === 1 ? 1.18 : 1), // in the passing lane a driver speeds up to get by
        v: veh.v,
        front: -(veh.x + veh.len / 2),
        leaderRear: leader ? -(leader.x - leader.len / 2) : null,
        lights: busStops.length ? [...lights, ...busStops] : lights,
        zones: this.zones,
        headway: d.headway,
        minGap: d.minGap,
        brake: d.planBrake,
        lightBrake: d.brake,
      });
      if (veh.kind === 'bus' && veh.lane === 0) {
        if ((veh.stopWait ?? 0) > 0) {
          veh.stopWait = veh.stopWait! - dt;
          target = 0;
          if (veh.stopWait <= 0 && veh.view instanceof BusView) void veh.view.closeDoors();
        } else if (veh.v < 8) {
          const front = veh.x + veh.len / 2;
          const zx = (this.opts.stops ?? []).find((s) => !veh.stopsDone?.has(s) && front >= s - 90 && front <= s + 30);
          if (zx !== undefined) {
            veh.stopsDone ??= new Set();
            veh.stopsDone.add(zx);
            veh.stopWait = 2.2;
            target = 0;
            if (veh.view instanceof BusView) void veh.view.openDoors();
          }
        }
      }
      if (veh.stall > 0) {
        veh.stall -= dt;
        target = 0;
      }
      veh.v = nextSpeed(veh.v, target, dt, d.brake);

      // Lane changes: go round whatever is in the way, and come back to our own lane afterwards.
      veh.cool -= dt;
      veh.passTimer -= dt;
      if (veh.changeT > 0) veh.changeT -= dt;
      else if (veh.stall <= 0 && veh.cool <= 0) this.decideLane(veh, e, leader, lists, signals);
      // drift sideways
      const targetY = veh.lane === 0 ? LANE_Y.main : LANE_Y.passing;
      const step = ((LANE_Y.main - LANE_Y.passing) / LANE_CHANGE_TIME) * dt;
      veh.y += Phaser.Math.Clamp(targetY - veh.y, -step, step);
    }

    for (const v of this.vehicles) {
      if (v.parked) {
        v.v = 0;
        v.view.setBlinker(true, this.scene.time.now);
        continue;
      }
      const dx = v.v * dt;
      const before = v.x;
      v.x += dx;
      if (!v.leaving) for (const bx of this.opts.bumps) if (before < bx && v.x >= bx) this.hop(v);
      v.life -= dx;
      v.view.setX(v.x);
      if (!v.leaving) {
        const targetY = laneY(v.lane);
        const lift = bridgeLiftAt(this.bridges, v.x);
        const pitch = bridgeSlopeDegAt(this.bridges, v.x);
        v.view.setY(v.y - lift - v.hop);
        v.view.setDepth(depthForY(v.y));
        v.view.setAngle(Phaser.Math.Clamp((targetY - v.y) / 32, -1, 1) * 3 + pitch); // the nose points where it is going
      }
      v.view.setBlinker(v.changeT > 0 || v.leaving, this.scene.time.now);
      if (v.kind === 'ambulance' && v.view instanceof VehicleView) v.view.siren(this.scene.time.now);
      if (v.view instanceof BusView) v.view.roll(dx, dt, Math.min(1, v.v / 260));
      else v.view.roll(dx, v.scale);
    }

    // Solid bodies: nobody drives through anybody, in each lane, based on actual lateral wheel height.
    const bodyOf = new Map<LaneVehicle | null, Body>();
    for (const v of solid) bodyOf.set(v, { x: v.x, len: v.len, v: v.v });
    if (player) bodyOf.set(null, { x: player.x, len: player.len, v: player.v });
    const playerY = player ? (player.y ?? laneY(player.lane ?? 0)) : 0;
    const crashes: LaneCrash[] = [];
    for (const lane of [0, 1] as const) {
      const members: Array<LaneVehicle | null> = [
        ...solid.filter((v) => collidesInLane(v.y, lane)),
        ...(player && collidesInLane(playerY, lane) ? [null] : []),
      ];
      const hits = resolveLane(members.map((m) => bodyOf.get(m)!));
      for (const h of hits) {
        const f = members[h.follower] ?? null;
        const l = members[h.leader] ?? null;
        for (const veh of [f, l]) if (veh) veh.stall = Math.max(veh.stall, STALL);
        const lb = bodyOf.get(l)!;
        crashes.push({ x: lb.x - lb.len / 2, y: laneY(lane), impact: h.impact, player: f === null ? 'follower' : l === null ? 'leader' : null });
      }
    }
    for (const v of solid) {
      if (v.parked) {
        v.v = 0;
        continue;
      }
      const b = bodyOf.get(v)!;
      v.x = b.x;
      v.v = b.v;
      v.view.setX(v.x);
    }

    let ambulanceEvent: LaneResult['ambulanceEvent'];
    let ambulanceLane: LaneIndex | undefined;
    if (player) {
      for (const v of solid) {
        if (v.kind !== 'ambulance') continue;
        if (!v.ambState && v.x < player.x && player.x - v.x < 950) {
          v.ambState = 'approaching';
          v.ambBlockedTime = 0;
          ambulanceEvent = 'approaching';
          ambulanceLane = v.lane;
        } else if (v.ambState === 'approaching') {
          ambulanceLane = v.lane;
          if (v.x > player.x + player.len / 2 && !occupiesPlayer(player, v.lane)) {
            v.ambState = 'passed';
            ambulanceEvent = 'yielded';
          } else if (occupiesPlayer(player, v.lane) && v.x < player.x && player.x - player.len / 2 - (v.x + v.len / 2) < 170) {
            v.ambBlockedTime = (v.ambBlockedTime ?? 0) + dt;
            if (v.ambBlockedTime > 2.8) {
              v.ambState = 'blocked';
              ambulanceEvent = 'blocked';
            }
          }
        }
      }
    }

    this.warnHasty(player);
    this.leaveAndSpawn(dt, scrollX, player);
    const pb = bodyOf.get(null);
    return { player: player && pb ? { x: pb.x, len: player.len, v: pb.v } : null, crashes, ambulanceEvent, ambulanceLane };
  }

  /**
   * Overtaking. In our own lane a driver stuck behind something slower (our bus at a stop, a slow bus)
   * moves into the passing lane when it is clear, and moves back once it is clear of what it passed.
   * Not near a red light (it would only queue) and not on a speed bump.
   */
  private decideLane(
    veh: LaneVehicle,
    e: { x: number; len: number; v: number },
    leader: { x: number; len: number; v: number } | null,
    lists: [Array<{ x: number; len: number; v: number }>, Array<{ x: number; len: number; v: number }>],
    signals: readonly SignalState[],
  ): void {
    const front = veh.x + veh.len / 2;
    const blocked =
      signals.some((s) => s.state !== 'green' && s.lineX > front - 20 && s.lineX - front < 900) ||
      this.opts.bumps.some((bx) => bx > front - 60 && bx - front < 450);
    if (blocked) return;
    const me = { x: veh.x, len: veh.len, v: veh.v };
    const start = (to: 0 | 1): void => {
      veh.fromLane = veh.lane;
      veh.lane = to;
      veh.changeT = LANE_CHANGE_TIME;
      veh.passTimer = 1.6;
      veh.cool = LANE_CHANGE_TIME + 0.8;
    };
    if (veh.kind === 'ambulance' && veh.ambState === 'approaching') return;
    if (veh.lane === 0) {
      const gap = leader ? leader.x - leader.len / 2 - front : Infinity;
      if (leader && wantsToOvertake(veh.cruise, veh.v, { gap, v: leader.v }) && laneClear(me, lists[1].filter((o) => o !== e))) start(1);
    } else if (veh.passTimer <= 0 && laneClear(me, lists[0].filter((o) => o !== e), 90, 180)) {
      start(0);
    }
  }

  private hop(v: LaneVehicle): void {
    this.scene.tweens.add({ targets: v, hop: v.kind === 'bus' ? 8 : 7, yoyo: true, duration: 110, ease: 'Quad.easeOut' });
  }

  /** A hasty driver right behind us gets a red "!" so a child can see that braking hard is risky. */
  private warnHasty(player: PlayerBody | null): void {
    const pLane = player?.lane ?? 0;
    const pFrom = player?.fromLane ?? pLane;
    const pChangeT = player?.changeT ?? 0;
    for (const v of this.vehicles) {
      if (!(v.view instanceof VehicleView)) continue;
      const sameLane = player !== null && occupiesLane({ lane: pLane, fromLane: pFrom, changeT: pChangeT }, v.lane);
      const behind = sameLane && v.changeT <= 0 && v.x < player!.x && player!.x - player!.len / 2 - (v.x + v.len / 2) < 380;
      v.view.setHasty(v.driver === 'hasty' && behind && !v.leaving);
    }
  }

  private leaveAndSpawn(dt: number, scrollX: number, player: PlayerBody | null): void {
    this.vehicles = this.vehicles.filter((v) => {
      const offScreen = v.x + v.len / 2 < scrollX - 200 || v.x - v.len / 2 > scrollX + GAME_W + 200;
      const gone =
        v.x + v.len / 2 < scrollX - 1500 ||
        (!v.parked && v.x - v.len / 2 > scrollX + GAME_W + 2600) ||
        (!v.parked && v.life <= 0 && offScreen);
      if (gone) {
        this.scene.tweens.killTweensOf(v.view);
        v.view.destroy();
      }
      return !gone;
    });

    if (!this.plan.enabled || this.vehicles.length >= MAX_VEHICLES) return;
    this.aheadTimer -= dt;
    this.behindTimer -= dt;
    this.ambulanceTimer -= dt;
    // Some drivers start in the passing lane (they are the ones that come by quickly).
    const pickLane = (): 0 | 1 => (this.rng() < 0.22 ? 1 : 0);
    const free = (x: number, lane: 0 | 1, room: number): boolean =>
      !this.vehicles.some((v) => (v.lane === lane || (v.changeT > 0 && v.fromLane === lane)) && Math.abs(v.x - x) < v.len / 2 + room);
    if (this.opts.level >= 3 && this.ambulanceTimer <= 0 && player && !this.vehicles.some((v) => v.kind === 'ambulance')) {
      const x = scrollX - 350;
      const lane: 0 | 1 = player.lane ?? 0;
      if (free(x, lane, 420) && Math.abs(player.x - x) > 450) {
        const amb = this.spawn(x, lane, 'ambulance');
        amb.life = 5500;
        this.ambulanceTimer = randRange(this.rng, 22, 34);
      } else this.ambulanceTimer = 1.5;
    }
    if (this.aheadTimer <= 0) {
      const x = scrollX + GAME_W + 280;
      const lane = pickLane();
      if (free(x, lane, 450)) {
        this.spawn(x, lane);
        this.aheadTimer = randRange(this.rng, this.plan.ahead[0], this.plan.ahead[1]);
      } else this.aheadTimer = 1;
    }
    if (this.behindTimer <= 0 && player) {
      const x = scrollX - 330;
      const lane = pickLane();
      if (free(x, lane, 500) && Math.abs(player.x - x) > 500) {
        this.spawn(x, lane);
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
