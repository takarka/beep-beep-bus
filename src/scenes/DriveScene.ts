import Phaser from 'phaser';
import { audio } from '../audio/AudioEngine';
import { themeForCity } from '../audio/musicThemes';
import { voice } from '../audio/voice';
import { BusView } from '../bus/BusView';
import { DEFAULT_DESIGN, type BodyType } from '../bus/design';
import { loadBusStatus, loadDesign, saveBusStatus } from '../bus/garage';
import { DRIVE_SCALE } from '../bus/geometry';
import { getSettings, updateSettings } from '../core/settings';
import { C, GAME_H, GAME_W } from '../config';
import { bridgeLiftAt, bridgeSlopeDegAt } from '../core/bridge';
import { START_X, generateLevel, type LevelData, type LightData, type StopData, type StopPlace } from '../core/level';
import { mulberry32 } from '../core/rng';
import {
  POINTS,
  ScoreKeeper,
  crossedLine,
  hasMissedStop,
  isInStopZone,
  PHYSICS,
  brakingDistance,
  canStopBefore,
  countMatchingDestinations,
  isWaitingBeforeLine,
} from '../core/rules';
import { TrafficLightModel, type LightState } from '../core/traffic';
import { t, type TextKey } from '../i18n';
import { Icons, drawChildrenSign, drawCrosswalkSign, drawMiniLight, drawPlaceIcon, drawRoadStopSign, drawStar, drawStopSign } from '../ui/draw';
import { GROUND_Y, PASSENGER_VARIANTS, SIDEWALK_FEET_Y, STREET_Y } from '../ui/textures';
import { BridgeView } from '../ui/bridge';
import { createScenery } from '../ui/scenery';
import { cityForLevel, landmarkForLevel } from '../core/campaign';
import { drawLandmark } from '../ui/landmarks';
import { drawLandmarkBig } from '../ui/landmarkScenes';
import { TrafficManager } from '../traffic/TrafficManager';
import { BUMP, CHILDREN, LOW_FUEL, MAX_FUEL, MAX_HEALTH, NITRO, bumpDamage, bumpResult, childrenZoneResult, conditionOf, crashDamage, fuelPerformance, fuelUse, nitroStep, performanceFor } from '../core/rules';
import { LaneTraffic, type LaneCrash } from '../traffic/LaneTraffic';
import { Crossing, depthForY } from '../traffic/Crossing';
import { createLaneMotion, startLaneChange, stepLaneChange, type LaneIndex, type LaneMotion } from '../traffic/lanes';
import { precipKind, resolveEnv } from '../core/world';
import { Button, HoldButton, floatText, label } from '../ui/widgets';
import { addAudioToggles } from './MenuScene';

type G = Phaser.GameObjects.Graphics;

const ROAD_TOP = STREET_Y + 50;
const ROAD_BOTTOM = STREET_Y + 180;
const PAX_SCALE = 0.85;

interface StopPerson {
  img: Phaser.GameObjects.Image;
  arm: G;
  bubble: Phaser.GameObjects.Container;
  destination: StopPlace;
}

interface StopRt {
  data: StopData;
  state: 'waiting' | 'serving' | 'done' | 'missed';
  people: StopPerson[];
  arrow: Phaser.GameObjects.Container;
  announced: boolean;
  waving?: boolean;
  laneHinted?: boolean;
  last: boolean;
}

interface LightRt {
  data: LightData;
  model: TrafficLightModel;
  lamps: G;
  forced: boolean;
  rewarded: boolean;
  hintFor: LightState | null;
  waitedAtRed: boolean;
  /** People crossing on the zebra while the light is red. */
  crossing: Crossing;
  prevState: LightState;
}

interface StationRt {
  zoneEnd: number;
  /** A gas station (petrol) or a repair depot (the child fixes the bus by hand). */
  kind: 'fuel' | 'depot';
  state: 'waiting' | 'serving' | 'done' | 'skipped';
  arrow: Phaser.GameObjects.Container;
  announced: boolean;
  /** x of the two pumps on the sidewalk. */
  pumps: number[];
}

interface CrosswalkRt {
  lineX: number;
  crossing: Crossing;
  spawned: boolean;
  rewarded: boolean;
  hinted: boolean;
  penalty: boolean;
}

interface StopSignRt {
  lineX: number;
  stopped: boolean;
  hold: number;
  hinted: boolean;
  penalty: boolean;
}

type Phase = 'driving' | 'serving' | 'finishing' | 'ended';

export interface DriveResult {
  level: number;
  score: number;
  mistakes: number;
  passengers: number;
  /** Condition of the bus at the end, 0..100. */
  health: number;
  /** Remaining petrol at the end, 0..100. */
  fuel?: number;
  fuelActive?: boolean;
}

export class DriveScene extends Phaser.Scene {
  private level!: LevelData;
  private backdrop!: ReturnType<typeof createScenery>;
  private bus!: BusView;
  private score!: ScoreKeeper;
  private stops: StopRt[] = [];
  private signals: LightRt[] = [];
  private crosswalks: CrosswalkRt[] = [];
  private stopSigns: StopSignRt[] = [];
  private bridgeViews: BridgeView[] = [];
  private phase: Phase = 'driving';
  private v = 0;
  private stillTime = 0;
  private aboard = 0;
  private paused = false;
  private gasTouched = false;
  private assist = false;
  private traffic!: TrafficManager;
  private lane!: LaneTraffic;
  /** 100 = like new. Crashes and hard bumps wear the bus out. */
  private health = MAX_HEALTH;
  private hpC!: Phaser.GameObjects.Container;
  private hpBar!: G;
  private hpText!: Phaser.GameObjects.Text;
  private smoke: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private smokeLevel = 0;
  private coughTimer = 4;
  /** Petrol: 100 = full. Level 1 has no petrol system. */
  private fuel = MAX_FUEL;
  private fuelActive = false;
  private fuelC!: Phaser.GameObjects.Container;
  private fuelBar!: G;
  private fuelText!: Phaser.GameObjects.Text;
  private lowFuelShown = false;
  private emptyShown = false;
  private emptyTimer = 0;
  private stations: StationRt[] = [];
  private stillTimeSt = 0;
  /** Nitro: a short burst of speed. */
  private nitro: number = NITRO.max;
  private nitroLocked = false;
  private boosting = false;
  private nitroBtn!: HoldButton;
  private laneBtn!: Button;
  private busLane: LaneMotion = createLaneMotion(0);
  private lastBlinkerPhase = -1;
  private nitroC!: Phaser.GameObjects.Container;
  private nitroBar!: G;
  private nitroShown = -1;
  private flame: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private streaks: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  /** Speed bumps the bus has already driven over. */
  private bumpsDone = new Set<number>();
  private childrenDone = new Set<number>();
  private childrenHinted = new Set<number>();
  /** Seconds the bus is still shaken after hitting somebody (no gas). */
  private stun = 0;
  private crashCooldown = 0;
  private lastHorn = -1000;
  private busBody: BodyType = 'city';
  private rainActive = false;
  private wiperTimer = 0;
  private wasMovingFast = false;
  /** Screen x of the bus centre; leaves more road visible ahead of the bus. */
  private camLead = 360;
  private rng = mulberry32(1);

  private gas!: HoldButton;
  private brake!: HoldButton;
  private keys!: Record<'right' | 'left' | 'd' | 'a' | 'shift' | 'n', Phaser.Input.Keyboard.Key>;
  private scoreText!: Phaser.GameObjects.Text;
  private paxText!: Phaser.GameObjects.Text;
  private aboardDestinations: StopPlace[] = [];
  private destHud!: Phaser.GameObjects.Container;
  private progressBus!: G;
  private toBar: (worldX: number) => number = () => 0;
  private banner: Phaser.GameObjects.Container | null = null;
  private pauseLayer: Phaser.GameObjects.Container | null = null;
  private startHint: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Drive');
  }

  init(data: { level?: number }): void {
    this.level = generateLevel(Math.max(1, data.level ?? 1));
    this.score = new ScoreKeeper();
    this.stops = [];
    this.signals = [];
    this.crosswalks = [];
    this.stopSigns = [];
    this.bridgeViews = [];
    this.phase = 'driving';
    this.v = 0;
    this.stillTime = 0;
    this.aboard = 0;
    this.aboardDestinations = [];
    this.paused = false;
    this.gasTouched = false;
    this.assist = getSettings().assist;
    this.stun = 0;
    this.crashCooldown = 0;
    this.bumpsDone = new Set<number>();
    this.childrenDone = new Set<number>();
    this.childrenHinted = new Set<number>();
    const status = loadBusStatus();
    this.health = status.health;
    this.smoke = null;
    this.smokeLevel = 0;
    this.coughTimer = 4;
    this.fuelActive = this.level.level >= 2;
    this.fuel = this.fuelActive ? status.fuel : MAX_FUEL;
    this.lowFuelShown = this.fuelActive && this.fuel <= LOW_FUEL;
    this.emptyShown = false;
    this.emptyTimer = 0;
    this.stations = [];
    this.stillTimeSt = 0;
    this.nitro = NITRO.max;
    this.nitroLocked = false;
    this.boosting = false;
    this.nitroShown = -1;
    this.busLane = createLaneMotion(0);
    this.lastBlinkerPhase = -1;
    this.flame = null;
    this.streaks = null;
    this.banner = null;
    this.pauseLayer = null;
    this.rng = mulberry32(this.level.level * 31 + 5);
  }

  create(): void {
    this.time.paused = false;
    this.tweens.resumeAll();
    this.cameras.main.fadeIn(300, 45, 42, 50);
    this.cameras.main.setBounds(0, 0, this.level.length, GAME_H);
    const env = { ...resolveEnv(this.level.level, getSettings().world), city: cityForLevel(this.level.level) };
    this.backdrop = createScenery(this, env);

    const design = loadDesign() ?? { ...DEFAULT_DESIGN };
    this.busBody = design.body;
    this.bus = new BusView(this, START_X, GROUND_Y, design);
    this.bus.setScale(DRIVE_SCALE[design.body]).setDepth(10);
    this.camLead = 140 + this.bus.lengthWorld() / 2;
    this.bus.setNight(env.time === 'night');
    this.bus.setWipers(env.precip);
    this.bus.setDamage(1 - this.health / MAX_HEALTH);
    this.updateSmoke();
    this.traffic = new TrafficManager(this, {
      night: env.time === 'night',
      level: this.level.level,
      bumps: this.level.bumps,
      bridges: this.level.bridges,
    });
    this.traffic.prewarm(Phaser.Math.Clamp(START_X - this.camLead, 0, this.level.length - GAME_W));
    this.lane = new LaneTraffic(this, {
      night: env.time === 'night',
      level: this.level.level,
      bumps: this.level.bumps,
      parked: this.level.parked,
      stops: this.level.items.filter((i) => i.kind === 'stop').map((i) => i.zoneEnd),
      bridges: this.level.bridges,
    });
    this.lane.prewarm(START_X);
    this.bus.setPassengers(0);
    this.bridgeViews = this.level.bridges.map((b) => new BridgeView(this, b, env));

    const stopsTotal = this.level.items.filter((i) => i.kind === 'stop').length;
    let stopIdx = 0;
    for (const item of this.level.items) {
      if (item.kind === 'light') this.createLight(item);
      else this.createStop(item, ++stopIdx === stopsTotal);
    }
    this.level.bumps.forEach((bx) => this.createBump(bx));
    this.level.crosswalks.forEach((cx) => this.createCrosswalk(cx));
    this.level.stopSigns.forEach((sx) => this.createStopSign(sx));
    this.level.children.forEach((cx) => this.createChildrenSign(cx));
    this.level.stations.forEach((sx) => this.createStation(sx, 'fuel'));
    this.level.depots.forEach((sx) => this.createStation(sx, 'depot'));
    this.createFinish(env.time === 'night');
    this.createHud();
    this.createHealthBar();
    this.createNitroGauge();
    if (this.fuelActive) this.createFuelGauge();
    this.createControls();

    audio.setMusicTheme(themeForCity(env.city), { night: env.time === 'night' });
    audio.setMusicIntensity(0.2);
    audio.setMusicPaused(false);
    audio.startEngine();
    const precip = env.precip ? precipKind(env) : null;
    this.rainActive = precip === 'rain';
    this.wiperTimer = 0.8;
    this.wasMovingFast = false;
    if (precip === 'rain') audio.startAmbience('rain');
    else if (precip === 'snow') audio.startAmbience('snow');
    else if (env.time === 'night') audio.startAmbience('night');
    this.events.once('shutdown', () => {
      this.time.paused = false;
      this.tweens.resumeAll();
      audio.stopEngine();
      audio.stopAmbience();
      audio.stopSiren();
      audio.nitroOff();
      audio.setMusicPaused(false);
      voice.stop();
    });

    this.showStartHint();
  }

  // ---------------------------------------------------------------- world

  private drawZebra(x: number): void {
    const road = this.add.graphics().setDepth(-4);
    // Stop lines: ours across our two lanes (the lower half of the road), the oncoming one,
    // on the far side of the zebra crossing, across the two oncoming lanes.
    road.fillStyle(C.roadLine, 1);
    const centre = ROAD_TOP + 66;
    const stopLine = (lx: number, y0: number, y1: number) =>
      road.fillPoints(
        [
          new Phaser.Math.Vector2(lx - 6 - 12 * ((y0 - ROAD_TOP) / (ROAD_BOTTOM - ROAD_TOP)), y0),
          new Phaser.Math.Vector2(lx + 6 - 12 * ((y0 - ROAD_TOP) / (ROAD_BOTTOM - ROAD_TOP)), y0),
          new Phaser.Math.Vector2(lx + 6 - 12 * ((y1 - ROAD_TOP) / (ROAD_BOTTOM - ROAD_TOP)), y1),
          new Phaser.Math.Vector2(lx - 6 - 12 * ((y1 - ROAD_TOP) / (ROAD_BOTTOM - ROAD_TOP)), y1),
        ],
        true,
      );
    stopLine(x, centre, ROAD_BOTTOM);
    stopLine(x + 185, ROAD_TOP, centre - 4);
    // Zebra crossing: the bars run ALONG the road, one behind the other across its width,
    // and people walk over them (bars across the road would be a pattern for cars, not for people).
    road.fillStyle(C.roadLine, 0.92);
    const rows = 7;
    const roadH = ROAD_BOTTOM - ROAD_TOP;
    let y = ROAD_TOP + 8;
    for (let r = 0; r < rows; r++) {
      const near = r / (rows - 1); // 0 = far side of the road, 1 = near side
      const barH = 8 + 4 * near; // nearer bars look a little thicker
      const slant = -12 * ((y - ROAD_TOP) / roadH); // same slant as the stop line
      road.fillRoundedRect(x + 26 + slant, y, 144, barH, 3);
      y += barH + 6 + 3 * near;
    }
  }

  private createLight(data: LightData): void {
    const x = data.lineX;
    this.drawZebra(x);

    // pole + head on the far sidewalk
    const px = x + 200;
    const pole = this.add.graphics().setDepth(-3);
    pole.fillStyle(0x4a4650, 1);
    pole.lineStyle(4, C.ink, 1);
    pole.fillRect(px - 7, 300, 14, STREET_Y + 44 - 300);
    pole.strokeRect(px - 7, 300, 14, STREET_Y + 44 - 300);
    pole.fillStyle(0x3b3640, 1);
    pole.fillRoundedRect(px - 40, 120, 80, 196, 18);
    pole.lineStyle(5, C.ink, 1);
    pole.strokeRoundedRect(px - 40, 120, 80, 196, 18);

    const lamps = this.add.graphics({ x: px, y: 0 }).setDepth(-2);
    const rt: LightRt = {
      data,
      model: new TrafficLightModel(mulberry32(data.seed), data.initial),
      lamps,
      forced: false,
      rewarded: false,
      hintFor: null,
      waitedAtRed: false,
      crossing: new Crossing(this, x + 26, x + 170),
      prevState: data.initial,
    };
    this.signals.push(rt);
    this.drawLamps(rt);
  }

  /** Uncontrolled zebra crossing with a blue pedestrian sign on the far sidewalk. */
  private createCrosswalk(x: number): void {
    this.drawZebra(x);
    const sx = x + 200;
    const pole = this.add.graphics().setDepth(-3);
    pole.fillStyle(0x4a4650, 1);
    pole.lineStyle(3, C.ink, 1);
    pole.fillRect(sx - 5, 290, 10, STREET_Y + 44 - 290);
    pole.strokeRect(sx - 5, 290, 10, STREET_Y + 44 - 290);
    drawCrosswalkSign(pole, sx, 265, 34);
    this.crosswalks.push({
      lineX: x,
      crossing: new Crossing(this, x + 26, x + 170),
      spawned: false,
      rewarded: false,
      hinted: false,
      penalty: false,
    });
  }

  /** Stop line across our lanes with a red octagonal STOP sign on the near sidewalk. */
  private createStopSign(x: number): void {
    const road = this.add.graphics().setDepth(-4);
    const centre = ROAD_TOP + 66;
    const roadH = ROAD_BOTTOM - ROAD_TOP;
    const slant0 = -12 * ((centre - ROAD_TOP) / roadH);
    const slant1 = -12;
    road.fillStyle(C.roadLine, 1);
    road.fillPoints(
      [
        new Phaser.Math.Vector2(x - 7 + slant0, centre),
        new Phaser.Math.Vector2(x + 7 + slant0, centre),
        new Phaser.Math.Vector2(x + 7 + slant1, ROAD_BOTTOM),
        new Phaser.Math.Vector2(x - 7 + slant1, ROAD_BOTTOM),
      ],
      true,
    );

    const sx = x + 36;
    const sign = this.add.graphics().setDepth(20);
    sign.fillStyle(0x4a4650, 1);
    sign.lineStyle(3, C.ink, 1);
    sign.fillRect(sx - 5, 530, 10, SIDEWALK_FEET_Y + 4 - 530);
    sign.strokeRect(sx - 5, 530, 10, SIDEWALK_FEET_Y + 4 - 530);
    drawRoadStopSign(sign, sx, 515, 36);
    label(this, sx, 515, 'STOP', { size: 17, color: C.cream, strokeThickness: 0 }).setDepth(21);

    this.stopSigns.push({ lineX: x, stopped: false, hold: 0, hinted: false, penalty: false });
  }

  /** Triangular "Children" sign on the near sidewalk: slow down as you pass. */
  private createChildrenSign(x: number): void {
    const sign = this.add.graphics().setDepth(20);
    sign.fillStyle(0x4a4650, 1);
    sign.lineStyle(3, C.ink, 1);
    sign.fillRect(x - 4, 584, 8, SIDEWALK_FEET_Y + 4 - 584);
    sign.strokeRect(x - 4, 584, 8, SIDEWALK_FEET_Y + 4 - 584);
    drawChildrenSign(sign, x, 554, 34);
  }

  private drawLamps(rt: LightRt): void {
    const g = rt.lamps;
    g.clear();
    const order: LightState[] = ['red', 'yellow', 'green'];
    const colors: Record<LightState, number> = { red: C.red, yellow: C.yellow, green: C.green };
    order.forEach((s, i) => {
      const y = 158 + i * 60;
      const on = rt.model.state === s;
      if (on) {
        g.fillStyle(colors[s], 0.3);
        g.fillCircle(0, y, 40);
      }
      g.fillStyle(on ? colors[s] : 0x5a5462, 1);
      g.fillCircle(0, y, 23);
      g.lineStyle(4, C.ink, 1);
      g.strokeCircle(0, y, 23);
      if (on) {
        g.fillStyle(0xffffff, 0.6);
        g.fillCircle(-7, y - 7, 6);
      }
    });
  }

  /** A yellow-and-black speed bump across the road, with a warning sign before it. */
  private createBump(bx: number): void {
    const g = this.add.graphics().setDepth(-4);
    const w = 52;
    const h = ROAD_BOTTOM - ROAD_TOP;
    const rows = 9;
    const slant = 12; // the same slant as the zebra crossing
    for (let i = 0; i < rows; i++) {
      const y0 = ROAD_TOP + (h * i) / rows;
      const y1 = ROAD_TOP + (h * (i + 1)) / rows;
      const o0 = -slant * (i / rows);
      const o1 = -slant * ((i + 1) / rows);
      g.fillStyle(i % 2 === 0 ? 0xffd23f : 0x2d2a32, 1);
      g.fillPoints(
        [new Phaser.Math.Vector2(bx - w / 2 + o0, y0), new Phaser.Math.Vector2(bx + w / 2 + o0, y0), new Phaser.Math.Vector2(bx + w / 2 + o1, y1), new Phaser.Math.Vector2(bx - w / 2 + o1, y1)],
        true,
      );
    }
    // round, raised look: a light edge on the left, a shadow on the right
    g.lineStyle(5, 0xfff3b0, 0.9);
    g.lineBetween(bx - w / 2, ROAD_TOP, bx - w / 2 - slant, ROAD_BOTTOM);
    g.lineStyle(7, C.ink, 0.45);
    g.lineBetween(bx + w / 2 + 2, ROAD_TOP, bx + w / 2 + 2 - slant, ROAD_BOTTOM);

    // warning sign on the near sidewalk, a little before the bump
    const sx = bx - 420;
    const sign = this.add.graphics().setDepth(20);
    sign.fillStyle(0x4a4650, 1);
    sign.fillRect(sx - 4, 590, 8, SIDEWALK_FEET_Y + 4 - 590);
    sign.fillStyle(C.cream, 1);
    sign.lineStyle(6, C.red, 1);
    const tri = [new Phaser.Math.Vector2(sx, 520), new Phaser.Math.Vector2(sx + 36, 586), new Phaser.Math.Vector2(sx - 36, 586)];
    sign.fillPoints(tri, true);
    sign.strokePoints(tri, true, true);
    sign.lineStyle(5, C.ink, 1);
    sign.beginPath();
    sign.arc(sx, 578, 20, Math.PI * 1.1, Math.PI * 1.9, false);
    sign.strokePath();
    sign.lineBetween(sx - 24, 578, sx + 24, 578);
  }

  private createStop(data: StopData, last: boolean): void {
    const busLen = this.bus.lengthWorld();
    const x1 = data.zoneEnd;
    const x0 = x1 - busLen + 10;

    // Yellow "bus zone" on the road
    const road = this.add.graphics().setDepth(-4);
    road.fillStyle(C.yellow, 0.25);
    road.fillRect(x0, ROAD_TOP + 66, x1 - x0, ROAD_BOTTOM - ROAD_TOP - 66);
    road.lineStyle(6, C.yellow, 1);
    road.strokeRect(x0, ROAD_TOP + 66, x1 - x0, ROAD_BOTTOM - ROAD_TOP - 66);
    road.lineStyle(4, C.yellow, 0.8);
    for (let x = x0 + 20; x < x1 - 10; x += 40) road.lineBetween(x, ROAD_BOTTOM - 4, x + 26, ROAD_TOP + 70);

    // Bus-stop sign + destination theme badge on the near sidewalk, just ahead of the bus front.
    const sign = this.add.graphics().setDepth(20);
    const sx = x1 + 70;
    sign.fillStyle(0x4a4650, 1);
    sign.lineStyle(3, C.ink, 1);
    sign.fillRect(sx - 5, 470, 10, SIDEWALK_FEET_Y + 4 - 470);
    sign.strokeRect(sx - 5, 470, 10, SIDEWALK_FEET_Y + 4 - 470);
    drawStopSign(sign, sx, 530, 30);
    drawPlaceIcon(sign, data.place, sx, 468, 25);

    // Waiting passengers with animated waving arm and destination speech bubble
    const people: StopPerson[] = [];
    const span = Math.max(80, x1 - x0 - 80);
    for (let i = 0; i < data.waiting; i++) {
      const px = x0 + 40 + (span * (i + 0.5)) / data.waiting;
      const dest = data.destinations[i] ?? data.place;
      const img = this.add
        .image(px, SIDEWALK_FEET_Y, `pax${Math.floor(this.rng() * PASSENGER_VARIANTS)}`)
        .setOrigin(0.5, 1)
        .setScale(PAX_SCALE)
        .setDepth(21);
      const arm = this.add.graphics({ x: px + 11, y: SIDEWALK_FEET_Y - 56 }).setDepth(22);
      arm.lineStyle(3, C.ink, 1);
      arm.fillStyle(0xf6d5b8, 1);
      arm.fillRoundedRect(-4, -22, 8, 24, 4);
      arm.strokeRoundedRect(-4, -22, 8, 24, 4);
      arm.setAngle(15);

      const bubble = this.add.container(px, SIDEWALK_FEET_Y - 124).setDepth(24);
      const bg = this.add.graphics();
      bg.fillStyle(0xffffff, 0.96);
      bg.lineStyle(3, C.ink, 1);
      bg.fillRoundedRect(-22, -20, 44, 36, 10);
      bg.strokeRoundedRect(-22, -20, 44, 36, 10);
      bg.fillTriangle(-5, 15, 5, 15, 0, 23);
      bg.lineBetween(-5, 16, 0, 23);
      bg.lineBetween(5, 16, 0, 23);
      drawPlaceIcon(bg, dest, 0, -2, 13);
      bubble.add(bg);

      // idle sway & gentle bubble float
      this.tweens.add({ targets: img, angle: { from: -3, to: 3 }, yoyo: true, repeat: -1, duration: 600 + this.rng() * 400, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: bubble, y: SIDEWALK_FEET_Y - 130, yoyo: true, repeat: -1, duration: 750 + this.rng() * 250, ease: 'Sine.easeInOut' });
      people.push({ img, arm, bubble, destination: dest });
    }

    // Bouncing arrow above the zone
    const arrow = this.add.container((x0 + x1) / 2, 250).setDepth(30);
    const ag = this.add.graphics();
    ag.fillStyle(C.yellow, 1);
    ag.lineStyle(5, C.ink, 1);
    const pts = [
      new Phaser.Math.Vector2(-18, -50),
      new Phaser.Math.Vector2(18, -50),
      new Phaser.Math.Vector2(18, -10),
      new Phaser.Math.Vector2(38, -10),
      new Phaser.Math.Vector2(0, 30),
      new Phaser.Math.Vector2(-38, -10),
      new Phaser.Math.Vector2(-18, -10),
    ];
    ag.fillPoints(pts, true);
    ag.strokePoints(pts, true, true);
    arrow.add(ag);
    if (data.waiting === 0) arrow.setVisible(false);
    this.tweens.add({ targets: arrow, y: 280, yoyo: true, repeat: -1, duration: 450, ease: 'Sine.easeInOut' });

    this.stops.push({ data, state: 'waiting', people, arrow, announced: false, last });
  }

  /** The finish is the landmark of this level (Baiterek, Astana Arena, ...), standing behind the road. */
  private createFinish(night: boolean): void {
    const x = this.level.finishX;
    const id = landmarkForLevel(this.level.level);
    const cx = x + 260;
    const farSidewalkBack = STREET_Y + 44;
    const g = this.add.graphics({ x: cx, y: farSidewalkBack }).setDepth(-3);
    drawLandmarkBig(g, id, night);
    // name board in front of it
    const board = this.add.container(cx, farSidewalkBack - 14).setDepth(-2);
    const name = label(this, 0, 0, t(`lm_${id}` as TextKey), { size: 24, color: C.ink, strokeThickness: 0 });
    const bw = name.width + 40;
    const bg = this.add.graphics();
    bg.fillStyle(C.cream, 1);
    bg.fillRoundedRect(-bw / 2, -22, bw, 44, 14);
    bg.lineStyle(4, C.ink, 1);
    bg.strokeRoundedRect(-bw / 2, -22, bw, 44, 14);
    board.add([bg, name]);
    // checkered finish line on the road
    const road = this.add.graphics().setDepth(-4);
    const cell = 16;
    for (let row = 0; row < Math.ceil((ROAD_BOTTOM - ROAD_TOP) / cell); row++)
      for (let col = 0; col < 2; col++) {
        road.fillStyle((row + col) % 2 ? C.ink : C.cream, 1);
        road.fillRect(x + col * cell, ROAD_TOP + row * cell, cell, Math.min(cell, ROAD_BOTTOM - ROAD_TOP - row * cell));
      }
    // flags
    const flag = this.add.graphics({ x: x + 10, y: 150 }).setDepth(-2);
    Icons.flag(flag, 90);
  }

  // ---------------------------------------------------------------- HUD + controls

  private hudPanel(x: number, w: number): G {
    const g = this.add.graphics().setScrollFactor(0).setDepth(90);
    g.fillStyle(C.cream, 0.95);
    g.fillRoundedRect(x, 22, w, 62, 20);
    g.lineStyle(5, C.ink, 1);
    g.strokeRoundedRect(x, 22, w, 62, 20);
    return g;
  }

  private createHud(): void {
    const sp = this.hudPanel(20, 170);
    drawStar(sp, 56, 53, 22, C.yellow, C.ink, 3);
    this.scoreText = label(this, 128, 54, '0', { size: 36, color: C.ink, strokeThickness: 0 }).setScrollFactor(0).setDepth(91);

    const pp = this.hudPanel(204, 140);
    pp.fillStyle(C.blue, 1);
    pp.fillCircle(240, 53, 22);
    const pi = this.add.graphics({ x: 240, y: 55 }).setScrollFactor(0).setDepth(91);
    Icons.person(pi, 34);
    this.paxText = label(this, 300, 54, '0', { size: 36, color: C.ink, strokeThickness: 0 }).setScrollFactor(0).setDepth(91);

    // Route progress bar with markers
    const bx0 = 370;
    const bx1 = 860;
    const bar = this.hudPanel(bx0 - 20, bx1 - bx0 + 70);
    bar.lineStyle(8, 0x9a8f80, 1);
    bar.lineBetween(bx0, 53, bx1, 53);
    const toBar = (wx: number) => bx0 + ((wx - START_X) / (this.level.finishX - START_X)) * (bx1 - bx0);
    this.toBar = toBar;
    for (const b of this.level.bridges) {
      const mx0 = toBar(b.x0);
      const mx1 = toBar(b.x1);
      // Blue water band + subtle arch mark on the progress bar
      bar.fillStyle(0x4eaee0, 0.9);
      bar.fillRoundedRect(mx0, 53, Math.max(10, mx1 - mx0), 8, 3);
      bar.lineStyle(4, C.ink, 0.85);
      bar.beginPath();
      const mid = (mx0 + mx1) / 2;
      bar.moveTo(mx0, 53);
      bar.lineTo(mid, 47);
      bar.lineTo(mx1, 53);
      bar.strokePath();
    }
    for (const item of this.level.items) {
      if (item.kind === 'light') {
        const mg = this.add.graphics({ x: toBar(item.lineX), y: 53 }).setScrollFactor(0).setDepth(91);
        drawMiniLight(mg, 34, 'red');
      } else {
        drawStopSign(bar, toBar(item.zoneEnd), 53, 12);
        drawPlaceIcon(bar, item.place, toBar(item.zoneEnd), 31, 9);
      }
    }
    for (const cx of this.level.crosswalks) {
      drawCrosswalkSign(bar, toBar(cx), 53, 9);
    }
    for (const sx of this.level.stopSigns) {
      drawRoadStopSign(bar, toBar(sx), 53, 10);
    }
    for (const [xs, depot] of [...this.level.stations.map((x) => [x, false] as const), ...this.level.depots.map((x) => [x, true] as const)]) {
      const pg = this.add.graphics({ x: toBar(xs), y: 53 }).setScrollFactor(0).setDepth(91);
      pg.fillStyle(depot ? C.orange : 0x3a86ff, 1);
      pg.lineStyle(3, C.ink, 1);
      pg.fillCircle(0, 0, 13);
      pg.strokeCircle(0, 0, 13);
      if (depot) Icons.wrench(pg, 17);
      else Icons.pump(pg, 17);
    }
    const fg = this.add.graphics({ x: bx1 + 22, y: 53 }).setScrollFactor(0).setDepth(91);
    Icons.flag(fg, 40);
    this.progressBus = this.add.graphics({ x: bx0, y: 53 }).setScrollFactor(0).setDepth(92);
    this.progressBus.fillStyle(this.bus.design.color, 1);
    this.progressBus.lineStyle(3, C.ink, 1);
    this.progressBus.fillRoundedRect(-16, -14, 32, 22, { tl: 4, tr: 9, bl: 3, br: 3 });
    this.progressBus.strokeRoundedRect(-16, -14, 32, 22, { tl: 4, tr: 9, bl: 3, br: 3 });
    this.progressBus.fillStyle(C.ink, 1);
    this.progressBus.fillCircle(-8, 10, 5);
    this.progressBus.fillCircle(9, 10, 5);

    const pause = new Button(this, GAME_W - 308, 52, { r: 34, color: C.orange, icon: (g, s) => Icons.pause(g, s), onClick: () => this.setPaused(true) });
    pause.setScrollFactor(0, 0, true).setDepth(90);
    addAudioToggles(this, GAME_W - 56, 52);

    this.destHud = this.add.container(584, 90).setScrollFactor(0).setDepth(90);
    this.refreshDestinationHud();
  }

  /** Shows compact icons of where passengers currently aboard want to get off. */
  private refreshDestinationHud(): void {
    if (!this.destHud) return;
    this.destHud.removeAll(true);
    if (this.aboardDestinations.length === 0) return;

    const counts = new Map<StopPlace, number>();
    for (const d of this.aboardDestinations) counts.set(d, (counts.get(d) ?? 0) + 1);
    const entries = [...counts.entries()];
    const w = 14 + entries.length * 58;
    const panel = this.add.graphics();
    panel.fillStyle(C.cream, 0.95);
    panel.fillRoundedRect(0, 0, w, 34, 14);
    panel.lineStyle(4, C.ink, 1);
    panel.strokeRoundedRect(0, 0, w, 34, 14);
    this.destHud.add(panel);

    entries.forEach(([place, count], idx) => {
      const ix = 22 + idx * 58;
      const g = this.add.graphics();
      drawPlaceIcon(g, place, ix, 17, 12);
      const txt = label(this, ix + 22, 18, String(count), { size: 17, color: C.ink, strokeThickness: 0 });
      this.destHud.add([g, txt]);
    });
  }

  private createControls(): void {
    this.brake = new HoldButton(this, 100, GAME_H - 84, 44, C.red, (g, s) => Icons.brake(g, s)); // the same size as the nitro button
    this.gas = new HoldButton(this, GAME_W - 120, GAME_H - 110, 76, C.green, (g, s) => Icons.gas(g, s));
    for (const b of [this.brake, this.gas]) b.setScrollFactor(0, 0, true).setDepth(95);

    // Horn: reacts the moment it is touched
    const horn = new Button(this, GAME_W - 292, GAME_H - 84, {
      r: 50,
      color: C.yellow,
      icon: (g, s) => Icons.horn(g, s, C.ink),
      silent: true,
      onDown: () => this.honk(),
      onClick: () => undefined,
    });
    horn.setScrollFactor(0, 0, true).setDepth(95);

    // Lane change: tap to switch between the main lane and the passing lane
    this.laneBtn = new Button(this, 212, GAME_H - 84, {
      r: 44,
      color: C.blue,
      icon: (g, s) => Icons.laneChange(g, s, true),
      onDown: () => this.requestLane(this.busLane.lane === 0 ? 1 : 0),
      onClick: () => undefined,
    });
    this.laneBtn.setScrollFactor(0, 0, true).setDepth(95);

    // Nitro: hold it for a burst of speed
    this.nitroBtn = new HoldButton(this, GAME_W - 292 - 112, GAME_H - 84, 44, C.orange, (g, s) => Icons.flame(g, s));
    this.nitroBtn.setScrollFactor(0, 0, true).setDepth(95);

    const kb = this.input.keyboard;
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      this.keys = kb.addKeys({
        right: K.RIGHT, left: K.LEFT, d: K.D, a: K.A, shift: K.SHIFT, n: K.N,
      }) as DriveScene['keys'];
      kb.on('keydown-ESC', () => this.setPaused(!this.paused));
      kb.on('keydown-P', () => this.setPaused(!this.paused));
      kb.on('keydown-H', () => this.honk());
      kb.on('keydown-SPACE', () => this.honk());
      kb.on('keydown-UP', () => this.requestLane(1));
      kb.on('keydown-W', () => this.requestLane(1));
      kb.on('keydown-DOWN', () => this.requestLane(0));
      kb.on('keydown-S', () => this.requestLane(0));
      kb.addCapture('SPACE'); // never scroll the page
      kb.addCapture('UP');
      kb.addCapture('DOWN');
    }
    // coming back from the depot: forget keys and pedals that were released while the route was asleep
    this.events.on('wake', () => {
      this.input.keyboard?.resetKeys();
      this.gas.reset();
      this.brake.reset();
      this.nitroBtn.reset();
      this.cameras.main.fadeIn(250, 45, 42, 50);
    });
  }

  private requestLane(to: LaneIndex): void {
    if (this.paused || this.phase !== 'driving' || this.stun > 0) return;
    if (startLaneChange(this.busLane, to)) {
      this.lastBlinkerPhase = -1;
      this.refreshLaneBtn();
    }
  }

  private refreshLaneBtn(): void {
    this.laneBtn.setIcon((g, s) => Icons.laneChange(g, s, this.busLane.lane === 0));
  }

  private honk(): void {
    if (this.paused || this.phase === 'ended') return;
    const now = this.time.now;
    if (now - this.lastHorn < 350) return;
    this.lastHorn = now;
    audio.horn(this.busBody);
    const lift = bridgeLiftAt(this.level.bridges, this.bus.x);
    floatText(this, this.bus.frontWorldX() - 40, 400 - lift, t('beep'), C.yellow, 44);
    const s = this.bus.scaleX;
    this.tweens.add({ targets: this.bus, scaleY: s * 0.93, yoyo: true, duration: 90, onComplete: () => this.bus.setScale(s) });
  }

  private showStartHint(): void {
    const c = this.add.container(GAME_W - 120, GAME_H - 260).setScrollFactor(0).setDepth(96);
    const g = this.add.graphics();
    g.fillStyle(C.yellow, 1);
    g.lineStyle(5, C.ink, 1);
    const pts = [
      new Phaser.Math.Vector2(-16, -46),
      new Phaser.Math.Vector2(16, -46),
      new Phaser.Math.Vector2(16, -6),
      new Phaser.Math.Vector2(34, -6),
      new Phaser.Math.Vector2(0, 30),
      new Phaser.Math.Vector2(-34, -6),
      new Phaser.Math.Vector2(-16, -6),
    ];
    g.fillPoints(pts, true);
    g.strokePoints(pts, true, true);
    c.add(g);
    this.tweens.add({ targets: c, y: GAME_H - 240, yoyo: true, repeat: -1, duration: 400 });
    this.startHint = c;
    this.showBanner(t('holdGas'), C.green, 4000);
  }

  private showBanner(text: string, color: number, ms = 1600, icon?: (g: G) => void): void {
    this.banner?.destroy();
    // Centred over the bus (left part of the screen) so it never hides the traffic light ahead.
    const txt = label(this, 0, 0, text, { size: 36, color: C.cream });
    const w0 = txt.width + (icon ? 110 : 60);
    const cx = Phaser.Math.Clamp(this.camLead + 40, w0 / 2 + 16, GAME_W - w0 / 2 - 16);
    const c = this.add.container(cx, 160).setScrollFactor(0).setDepth(97);
    txt.x = icon ? 30 : 0;
    const w = txt.width + (icon ? 110 : 60);
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillRoundedRect(-w / 2, -40, w, 80, 26);
    g.lineStyle(5, C.ink, 1);
    g.strokeRoundedRect(-w / 2, -40, w, 80, 26);
    c.add([g, txt]);
    if (icon) {
      const ig = this.add.graphics({ x: -w / 2 + 45, y: 0 });
      icon(ig);
      c.add(ig);
    }
    c.setScale(0);
    this.tweens.add({ targets: c, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, alpha: 0, delay: ms, duration: 300, onComplete: () => c.destroy() });
    this.banner = c;
  }

  private setPaused(on: boolean): void {
    if (this.phase === 'ended' || on === this.paused) return;
    this.paused = on;
    if (on) {
      if (this.boosting) this.setBoosting(false);
      this.tweens.pauseAll();
      this.time.paused = true;
      audio.setEngine(0);
      audio.setMusicPaused(true);
      voice.stop();
      const layer = this.add.container(0, 0).setScrollFactor(0).setDepth(200);
      const dim = this.add.rectangle(0, 0, GAME_W, GAME_H, C.ink, 0.6).setOrigin(0).setInteractive();
      const panel = this.add.graphics();
      panel.fillStyle(C.cream, 1);
      panel.fillRoundedRect(GAME_W / 2 - 370, 180, 740, 340, 30);
      panel.lineStyle(6, C.ink, 1);
      panel.strokeRoundedRect(GAME_W / 2 - 370, 180, 740, 340, 30);
      const title = label(this, GAME_W / 2, 250, t('paused'), { size: 54, color: C.yellow });
      const cx = GAME_W / 2;
      const resume = new Button(this, cx, 395, { r: 68, color: C.green, icon: (g, s) => Icons.play(g, s), onClick: () => this.setPaused(false) });
      const retry = new Button(this, cx - 160, 405, { r: 46, color: C.orange, icon: (g, s) => Icons.retry(g, s), onClick: () => this.scene.restart({ level: this.level.level }) });
      const home = new Button(this, cx - 290, 405, { r: 46, color: C.red, icon: (g, s) => Icons.home(g, s), onClick: () => this.scene.start('Menu') });
      const edit = new Button(this, cx + 160, 405, { r: 46, color: C.purple, icon: (g, s) => Icons.bus(g, s), onClick: () => this.scene.start('Garage') });
      const helper: Button = new Button(this, cx + 290, 405, {
        r: 46,
        color: this.assist ? C.green : 0xb9b0a0,
        icon: (g, s) => Icons.wheel(g, s),
        onClick: () => {
          this.assist = !this.assist;
          updateSettings({ assist: this.assist });
          helper.setColor(this.assist ? C.green : 0xb9b0a0);
        },
      });
      const helperLabel = label(this, cx + 290, 484, t('assist'), { size: 20, color: C.ink, strokeThickness: 0, wrap: 120 });
      const editLabel = label(this, cx + 160, 484, t('garage'), { size: 20, color: C.ink, strokeThickness: 0, wrap: 120 });
      layer.add([dim, panel, title, resume, retry, home, edit, helper, helperLabel, editLabel]);
      // Children need scrollFactor 0 too, otherwise their hit areas shift with the camera.
      layer.setScrollFactor(0, 0, true);
      this.pauseLayer = layer;
    } else {
      this.tweens.resumeAll();
      this.time.paused = false;
      audio.setMusicPaused(false);
      this.pauseLayer?.destroy();
      this.pauseLayer = null;
      this.gas.reset();
      this.brake.reset();
    }
  }

  // ---------------------------------------------------------------- scoring helpers

  private award(delta: number, worldX: number): void {
    const applied = this.score.add(delta);
    const shown = delta < 0 ? delta : applied;
    floatText(this, worldX, 330, `${shown > 0 ? '+' : ''}${shown}`, delta >= 0 ? C.yellow : C.red);
    this.refreshHud();
  }

  private refreshHud(): void {
    if (this.scoreText.text !== String(this.score.score)) {
      this.scoreText.setText(String(this.score.score));
      this.tweens.add({ targets: this.scoreText, scale: { from: 1.4, to: 1 }, duration: 250 });
    }
    this.paxText.setText(String(this.aboard));
  }

  private mistake(text: string, delta: number, worldX: number): void {
    this.award(delta, worldX);
    audio.oops();
    this.cameras.main.shake(250, 0.006);
    this.showBanner(text, C.red, 1800);
    if (this.score.takeWarning()) this.startSiren();
  }

  /** Three mistakes in a row: the police siren wails and the screen flashes red and blue for 3 seconds. */
  private startSiren(): void {
    audio.siren(3);
    this.showBanner(t('siren'), C.blue, 3000, (g) => {
      g.fillStyle(C.red, 1);
      g.fillCircle(-12, 0, 13);
      g.fillStyle(0x3a86ff, 1);
      g.fillCircle(12, 0, 13);
      g.lineStyle(3, C.ink, 1);
      g.strokeCircle(-12, 0, 13);
      g.strokeCircle(12, 0, 13);
    });
    const flash = this.add.graphics().setScrollFactor(0).setDepth(150);
    let n = 0;
    this.time.addEvent({
      delay: 220,
      repeat: 13,
      callback: () => {
        const red = n++ % 2 === 0;
        flash.clear();
        flash.fillStyle(red ? 0xe63946 : 0x3a86ff, 0.26);
        flash.fillRect(0, 0, GAME_W / 2, GAME_H);
        flash.fillStyle(red ? 0x3a86ff : 0xe63946, 0.26);
        flash.fillRect(GAME_W / 2, 0, GAME_W / 2, GAME_H);
      },
    });
    this.time.delayedCall(3100, () => flash.destroy());
  }

  /** The front wheels of the bus reach a speed bump: shake, slow down, and judge the speed. */
  private checkBumps(prevX: number): void {
    const axle = this.bus.layout.wheelXs[this.bus.layout.wheelXs.length - 1]! * this.bus.scaleX;
    for (const bx of this.level.bumps) {
      if (this.bumpsDone.has(bx) || !(prevX + axle < bx && this.bus.x + axle >= bx)) continue;
      this.bumpsDone.add(bx);
      const r = bumpResult(this.v);
      this.bus.jolt(r.power);
      audio.bump(r.power);
      this.damageBus(bumpDamage(r));
      if (r.kind === 'hard') {
        this.cameras.main.shake(280, 0.006 + 0.008 * r.power);
        this.mistakeBump(bx);
      } else if (r.kind === 'gentle') {
        this.award(r.points, this.bus.x);
        audio.reward();
        this.showBanner(t('careful'), C.green, 1300, (g) => drawStar(g, 0, 0, 26, C.yellow, C.ink, 3));
      }
      this.v *= r.speedFactor;
    }
  }

  private mistakeBump(bx: number): void {
    this.mistake(t('tooFast'), POINTS.speedBump, bx);
  }

  // ---------------------------------------------------------------- nitro

  private createNitroGauge(): void {
    const c = this.add.container(584, 90).setScrollFactor(0).setDepth(90);
    const panel = this.add.graphics();
    panel.fillStyle(C.cream, 0.95);
    panel.fillRoundedRect(0, 0, 214, 34, 14);
    panel.lineStyle(4, C.ink, 1);
    panel.strokeRoundedRect(0, 0, 214, 34, 14);
    const icon = this.add.graphics({ x: 26, y: 17 });
    Icons.flame(icon, 30, C.ink);
    this.nitroBar = this.add.graphics();
    c.add([panel, icon, this.nitroBar]);
    this.nitroC = c;
    this.refreshNitroBar();
  }

  private refreshNitroBar(): void {
    const shown = Math.round(this.nitro / 2) + (this.nitroLocked ? 1000 : 0); // redraw only when the bar visibly changes
    if (shown === this.nitroShown) return;
    this.nitroShown = shown;
    const w = 142;
    const k = this.nitro / NITRO.max;
    const g = this.nitroBar;
    g.clear();
    g.fillStyle(0x9a9fa8, 1);
    g.fillRoundedRect(54, 8, w, 18, 8);
    g.fillStyle(this.nitroLocked ? 0xb9b0a0 : C.orange, 1);
    if (k > 0) g.fillRoundedRect(54, 8, Math.max(14, w * k), 18, 8);
    g.lineStyle(3, C.ink, 1);
    g.strokeRoundedRect(54, 8, w, 18, 8);
  }

  /** The boost starts or stops: a whoosh, fire behind the bus, speed lines. */
  private setBoosting(on: boolean): void {
    this.boosting = on;
    if (on) {
      audio.nitroOn();
      this.cameras.main.shake(180, 0.004);
      if (!this.flame) {
        this.flame = this.add.particles(0, 0, 'dot', {
          lifespan: 320,
          speedX: { min: -420, max: -260 },
          speedY: { min: -50, max: 50 },
          scale: { start: 1.6, end: 0 },
          alpha: { start: 0.95, end: 0 },
          tint: [0xffd23f, 0xf4a261, 0xe63946],
          blendMode: 'ADD',
          frequency: 14,
          quantity: 2,
          emitting: false,
        });
        this.flame.setDepth(11);
        this.streaks = this.add.particles(GAME_W + 20, 0, 'raindrop', {
          y: { min: 130, max: 560 },
          speedX: { min: -1900, max: -1500 },
          lifespan: 600,
          rotate: 90,
          alpha: { start: 0.55, end: 0 },
          scale: { min: 1, max: 2 },
          frequency: 22,
          emitting: false,
        });
        this.streaks.setScrollFactor(0).setDepth(85);
      }
      this.flame.start();
      this.streaks?.start();
    } else {
      audio.nitroOff();
      this.flame?.stop();
      this.streaks?.stop();
    }
  }

  private nitroEffects(): void {
    if (this.boosting && this.flame) {
      const L = this.bus.layout;
      const lift = bridgeLiftAt(this.level.bridges, this.bus.x);
      // at the height of the rear window: lower down it would hide behind the brake pedal on a touch screen
      this.flame.setPosition(this.bus.x + L.backX * this.bus.scaleX - 6, this.busLane.y - lift - 95);
    }
  }

  /** Nitro as a reward for good driving (a properly served bus stop). */
  private addNitro(amount: number): void {
    this.nitro = Math.min(NITRO.max, this.nitro + amount);
    if (this.nitroLocked && this.nitro >= NITRO.minToStart) this.nitroLocked = false;
    this.nitroShown = -1;
    this.refreshNitroBar();
    this.tweens.add({ targets: this.nitroC, scale: { from: 1.25, to: 1 }, duration: 300, ease: 'Back.easeOut' });
  }

  // ---------------------------------------------------------------- petrol and the gas station

  /**
   * A coloured zone on the road and a sign on the sidewalk: stop here like at a bus stop.
   * Gas station (blue): two pumps. Repair depot (orange): a workshop building.
   */
  private createStation(zoneEnd: number, kind: 'fuel' | 'depot'): void {
    const busLen = this.bus.lengthWorld();
    const x1 = zoneEnd;
    const x0 = x1 - busLen + 10;
    const BLUE = kind === 'depot' ? C.orange : 0x3a86ff;
    const sign = (g: Phaser.GameObjects.Graphics, size: number, color?: number): void => (kind === 'depot' ? Icons.wrench(g, size, color) : Icons.pump(g, size, color));

    const road = this.add.graphics().setDepth(-4);
    road.fillStyle(BLUE, 0.22);
    road.fillRect(x0, ROAD_TOP + 66, x1 - x0, ROAD_BOTTOM - ROAD_TOP - 66);
    road.lineStyle(6, BLUE, 1);
    road.strokeRect(x0, ROAD_TOP + 66, x1 - x0, ROAD_BOTTOM - ROAD_TOP - 66);
    road.lineStyle(4, BLUE, 0.7);
    for (let x = x0 + 20; x < x1 - 10; x += 40) road.lineBetween(x, ROAD_BOTTOM - 4, x + 26, ROAD_TOP + 70);

    // two pumps on the near sidewalk (a depot has a workshop instead)
    const pumps = kind === 'fuel' ? [x1 - 215, x1 - 115] : [];
    const pg = this.add.graphics().setDepth(21);
    const feet = SIDEWALK_FEET_Y + 6;
    if (kind === 'depot') this.drawWorkshop(pg, x1 - 330, x1 - 20, feet);
    for (const px of pumps) {
      pg.fillStyle(0x4a4650, 1);
      pg.lineStyle(4, C.ink, 1);
      pg.fillRoundedRect(px - 30, feet - 8, 60, 10, 4);
      pg.fillStyle(C.red, 1);
      pg.fillRoundedRect(px - 22, feet - 104, 44, 98, 8);
      pg.strokeRoundedRect(px - 22, feet - 104, 44, 98, 8);
      pg.fillStyle(C.cream, 1);
      pg.fillRoundedRect(px - 16, feet - 96, 32, 26, 4);
      pg.strokeRoundedRect(px - 16, feet - 96, 32, 26, 4);
      pg.fillStyle(C.ink, 1);
      pg.fillRect(px - 11, feet - 90, 22, 8);
      pg.fillStyle(C.yellow, 1);
      pg.fillRect(px - 22, feet - 56, 44, 8);
      pg.lineStyle(5, C.ink, 1);
      pg.lineBetween(px + 22, feet - 78, px + 34, feet - 60);
      pg.lineBetween(px + 34, feet - 60, px + 34, feet - 34);
    }

    // round blue sign with a pump, just ahead of the zone
    const signG = this.add.graphics().setDepth(20);
    const sx = x1 + 80;
    signG.fillStyle(0x4a4650, 1);
    signG.lineStyle(3, C.ink, 1);
    signG.fillRect(sx - 5, 540, 10, SIDEWALK_FEET_Y + 4 - 540);
    signG.strokeRect(sx - 5, 540, 10, SIDEWALK_FEET_Y + 4 - 540);
    signG.fillStyle(BLUE, 1);
    signG.lineStyle(4, C.ink, 1);
    signG.fillCircle(sx, 530, 32);
    signG.strokeCircle(sx, 530, 32);
    const icon = this.add.graphics({ x: sx, y: 530 }).setDepth(21);
    sign(icon, 42);

    // a warning board far before the station, so the child sees it coming
    const wx = x1 - 1200;
    const board = this.add.graphics().setDepth(20);
    board.fillStyle(0x4a4650, 1);
    board.fillRect(wx - 4, 590, 8, SIDEWALK_FEET_Y + 4 - 590);
    board.fillStyle(BLUE, 1);
    board.lineStyle(4, C.ink, 1);
    board.fillRoundedRect(wx - 34, 520, 68, 68, 12);
    board.strokeRoundedRect(wx - 34, 520, 68, 68, 12);
    const bi = this.add.graphics({ x: wx, y: 554 }).setDepth(21);
    sign(bi, 46);

    // bouncing blue arrow above the zone
    const arrow = this.add.container((x0 + x1) / 2, 250).setDepth(30);
    const ag = this.add.graphics();
    ag.fillStyle(BLUE, 1);
    ag.lineStyle(5, C.ink, 1);
    const pts = [
      new Phaser.Math.Vector2(-18, -50),
      new Phaser.Math.Vector2(18, -50),
      new Phaser.Math.Vector2(18, -10),
      new Phaser.Math.Vector2(38, -10),
      new Phaser.Math.Vector2(0, 30),
      new Phaser.Math.Vector2(-38, -10),
      new Phaser.Math.Vector2(-18, -10),
    ];
    ag.fillPoints(pts, true);
    ag.strokePoints(pts, true, true);
    arrow.add(ag);
    this.tweens.add({ targets: arrow, y: 280, yoyo: true, repeat: -1, duration: 450, ease: 'Sine.easeInOut' });

    this.stations.push({ zoneEnd, kind, state: 'waiting', arrow, announced: false, pumps });
  }

  private createFuelGauge(): void {
    const c = this.add.container(302, 90).setScrollFactor(0).setDepth(90);
    const panel = this.add.graphics();
    panel.fillStyle(C.cream, 0.95);
    panel.fillRoundedRect(0, 0, 272, 34, 14);
    panel.lineStyle(4, C.ink, 1);
    panel.strokeRoundedRect(0, 0, 272, 34, 14);
    const icon = this.add.graphics({ x: 26, y: 17 });
    Icons.pump(icon, 30, C.ink);
    this.fuelBar = this.add.graphics();
    this.fuelText = label(this, 172, 18, '100%', { size: 15, color: C.ink, strokeThickness: 0 });
    c.add([panel, icon, this.fuelBar, this.fuelText]);
    this.fuelC = c;
    this.refreshFuelBar();
  }

  private refreshFuelBar(): void {
    if (!this.fuelActive) return;
    const w = 184;
    const k = this.fuel / MAX_FUEL;
    const g = this.fuelBar;
    g.clear();
    g.fillStyle(0x9a9fa8, 1);
    g.fillRoundedRect(54, 8, w, 18, 8);
    g.fillStyle(this.fuel <= LOW_FUEL ? C.red : k >= 0.5 ? 0x3a86ff : C.yellow, 1);
    if (k > 0) g.fillRoundedRect(54, 8, Math.max(14, w * k), 18, 8);
    g.lineStyle(3, C.ink, 1);
    g.strokeRoundedRect(54, 8, w, 18, 8);
    this.fuelText.setText(`${Math.round(this.fuel)}%`);
  }

  /** Driving burns petrol: faster and harder pushing on the gas burns more. */
  private useFuel(dx: number, dt: number, accelerating: boolean, boosting = false): void {
    if (!this.fuelActive || this.phase === 'finishing') return;
    const before = Math.round(this.fuel);
    this.fuel = Math.max(0, this.fuel - fuelUse(dx, dt, this.v, accelerating, boosting));
    if (Math.round(this.fuel) !== before) this.refreshFuelBar();

    if (this.fuel <= LOW_FUEL && this.fuel > 0 && !this.lowFuelShown) {
      this.lowFuelShown = true;
      audio.lowFuel();
      voice.speak('lowFuel');
      this.showBanner(t('lowFuel'), C.orange, 2400, (g) => Icons.pump(g, 40, C.cream));
      this.tweens.add({ targets: this.fuelC, scale: { from: 1.3, to: 1 }, duration: 320, ease: 'Back.easeOut' });
    }
    if (this.fuel <= 0) {
      // Dry: the bus crawls; after a few seconds somebody brings petrol (it costs points).
      if (!this.emptyShown) {
        this.emptyShown = true;
        audio.oops();
        this.showBanner(t('noFuel'), C.red, 2600, (g) => Icons.pump(g, 40, C.cream));
      }
      this.emptyTimer += dt;
      if (this.emptyTimer > 5) {
        this.emptyTimer = 0;
        this.emptyShown = false;
        this.lowFuelShown = false;
        this.fuel = 25;
        this.refreshFuelBar();
        this.mistake(t('noFuel'), POINTS.noFuel, this.bus.x);
      }
    } else {
      this.emptyTimer = 0;
    }
  }

  /** Helper mode stops at a gas station when the tank runs low and at a depot when the bus is in a bad way. */
  private stationWanted(st: StationRt): boolean {
    return st.kind === 'fuel' ? this.fuelActive && this.fuel < 45 : this.health < 60;
  }

  private updateStations(dt: number, front: number, gas: boolean): void {
    for (const s of this.stations) {
      if (s.state !== 'waiting') continue;
      const z = s.zoneEnd;
      const needed = s.kind === 'fuel' ? this.fuelActive && this.fuel < 75 : this.health < 85;
      if (!s.announced && z - front < 1000 && front < z) {
        s.announced = true;
        if (needed) {
          audio.dingDong();
          this.showBanner(t(s.kind === 'fuel' ? 'station' : 'depot'), s.kind === 'fuel' ? 0x3a86ff : C.orange, 1600, (g) => (s.kind === 'fuel' ? Icons.pump(g, 40, C.cream) : Icons.wrench(g, 40, C.cream)));
        }
      }
      if (hasMissedStop(front, z)) {
        s.state = 'skipped'; // driving past is allowed (no penalty); the tank and the bus decide if that was wise
        this.tweens.add({ targets: s.arrow, alpha: 0, duration: 300 });
        continue;
      }
      if (this.phase === 'driving' && isInStopZone(front, z) && this.v < 3 && !gas) {
        if (this.busLane.lane === 0 && this.busLane.changeT <= 0) {
          this.stillTimeSt += dt;
          if (this.stillTimeSt > 0.25) {
            this.stillTimeSt = 0;
            if (s.kind === 'fuel') void this.serveStation(s);
            else this.openDepot(s);
          }
        }
      } else if (isInStopZone(front, z)) {
        this.stillTimeSt = 0;
      }
    }
  }

  /** The workshop of a repair depot: brick hall, a big roller door, a wrench sign and a stack of tyres. */
  private drawWorkshop(g: Phaser.GameObjects.Graphics, x0: number, x1: number, feet: number): void {
    const top = feet - 190;
    g.fillStyle(0xd9674a, 1);
    g.lineStyle(5, C.ink, 1);
    g.fillRect(x0, top, x1 - x0, feet - top);
    g.strokeRect(x0, top, x1 - x0, feet - top);
    g.lineStyle(2, 0xa84a34, 1);
    for (let y = top + 20; y < feet; y += 20) g.lineBetween(x0 + 2, y, x1 - 2, y);
    // roof
    g.fillStyle(0x4a4650, 1);
    g.lineStyle(5, C.ink, 1);
    g.fillRect(x0 - 12, top - 16, x1 - x0 + 24, 20);
    g.strokeRect(x0 - 12, top - 16, x1 - x0 + 24, 20);
    // roller door
    const dx = x0 + 28;
    const dw = x1 - x0 - 120;
    g.fillStyle(0xcfd3d8, 1);
    g.fillRect(dx, top + 52, dw, feet - top - 52);
    g.strokeRect(dx, top + 52, dw, feet - top - 52);
    g.lineStyle(3, 0x8d949c, 1);
    for (let y = top + 70; y < feet - 4; y += 18) g.lineBetween(dx + 3, y, dx + dw - 3, y);
    // round sign with a wrench above the door
    g.fillStyle(C.orange, 1);
    g.lineStyle(4, C.ink, 1);
    g.fillCircle(x0 + dw / 2 + 28, top + 24, 22);
    g.strokeCircle(x0 + dw / 2 + 28, top + 24, 22);
    const w = this.add.graphics({ x: x0 + dw / 2 + 28, y: top + 24 }).setDepth(22);
    Icons.wrench(w, 30, C.cream);
    // tyres
    for (let i = 0; i < 3; i++) {
      const tx = x1 - 50;
      const ty = feet - 14 - i * 26;
      g.fillStyle(0x2d2a32, 1);
      g.lineStyle(3, C.ink, 1);
      g.fillEllipse(tx, ty, 62, 28);
      g.strokeEllipse(tx, ty, 62, 28);
      g.fillStyle(0x9a9fa8, 1);
      g.fillEllipse(tx, ty, 26, 12);
    }
  }

  /** Fills the tank for free (the gas station only sells petrol; fixing the bus is the depot's job). */
  private async serveStation(st: StationRt): Promise<void> {
    this.phase = 'serving';
    st.state = 'serving';
    this.v = 0;
    this.tweens.add({ targets: st.arrow, alpha: 0, duration: 300 });

    const fuel0 = this.fuel;
    const needFuel = MAX_FUEL - fuel0;

    // the hose from the nearest pump to the fuel flap of the bus
    const s = this.bus.scaleX;
    const flapX = this.bus.x + (this.bus.layout.backX + 150) * s;
    const flapY = GROUND_Y + (this.bus.layout.bottom - 62) * s;
    const pumpX = st.pumps.reduce((best, p) => (Math.abs(p - flapX) < Math.abs(best - flapX) ? p : best), st.pumps[0]!);
    const curve = new Phaser.Curves.QuadraticBezier(
      new Phaser.Math.Vector2(pumpX + 34, 672),
      new Phaser.Math.Vector2((pumpX + 34 + flapX) / 2, 730),
      new Phaser.Math.Vector2(flapX, flapY),
    );
    const hose = this.add.graphics().setDepth(22);
    const pts = curve.getPoints(30);
    hose.lineStyle(10, C.ink, 1);
    hose.strokePoints(pts, false, false);
    hose.lineStyle(5, C.yellow, 1);
    hose.strokePoints(pts, false, false);
    hose.fillStyle(C.ink, 1);
    hose.fillCircle(flapX, flapY, 7);
    hose.setAlpha(0);
    this.tweens.add({ targets: hose, alpha: 1, duration: 250 });

    audio.fuel();
    const ms = Phaser.Math.Clamp(needFuel * 30, 1000, 3800);
    const prog = { t: 0 };
    await this.tween({
      targets: prog,
      t: 1,
      duration: ms,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        this.fuel = fuel0 + needFuel * prog.t;
        this.refreshFuelBar();
      },
    });
    this.fuel = MAX_FUEL;
    this.refreshFuelBar();
    this.tweens.add({ targets: hose, alpha: 0, duration: 250, onComplete: () => hose.destroy() });

    // a reward for filling up before it was too late
    if (fuel0 < 60) this.award(POINTS.refuel, this.bus.x);
    this.lowFuelShown = false;
    this.emptyShown = false;
    audio.reward();
    this.showBanner(t('fueled'), C.green, 1800, (g) => Icons.pump(g, 40, C.cream));
    st.state = 'done';
    this.phase = 'driving';
  }

  /**
   * The repair depot: the route is put to sleep and the Depot screen opens, where the child fixes every
   * broken part by tapping it (and can fill the tank). When it closes, the route wakes up where it stopped.
   */
  private openDepot(st: StationRt): void {
    this.phase = 'serving';
    st.state = 'serving';
    this.v = 0;
    audio.setEngine(0);
    this.tweens.add({ targets: st.arrow, alpha: 0, duration: 300 });
    const health0 = this.health;
    this.scene.launch('Depot', {
      design: this.bus.design,
      health: this.health,
      fuel: this.fuel,
      fuelActive: this.fuelActive,
      onDone: (r: { health: number; fuel: number }) => this.closeDepot(st, health0, r),
    });
    this.scene.sleep();
  }

  private closeDepot(st: StationRt, health0: number, r: { health: number; fuel: number }): void {
    this.scene.wake();
    this.health = Math.min(MAX_HEALTH, Math.max(health0, r.health));
    this.bus.setDamage(1 - this.health / MAX_HEALTH);
    this.refreshHealthBar();
    this.updateSmoke();
    if (this.fuelActive) {
      if (r.fuel > this.fuel) this.lowFuelShown = false;
      this.fuel = Math.max(this.fuel, r.fuel);
      if (this.fuel > LOW_FUEL) {
        this.emptyShown = false;
        this.emptyTimer = 0;
      }
      this.refreshFuelBar();
    }
    if (health0 < 85 && this.health >= MAX_HEALTH) {
      this.award(POINTS.repaired, this.bus.x);
      this.showBanner(t('repaired'), C.green, 1800, (g) => Icons.wrench(g, 40, C.cream));
    }
    st.state = 'done';
    this.phase = 'driving';
  }

  // ---------------------------------------------------------------- wear and tear

  private createHealthBar(): void {
    const c = this.add.container(20, 90).setScrollFactor(0).setDepth(90);
    const panel = this.add.graphics();
    panel.fillStyle(C.cream, 0.95);
    panel.fillRoundedRect(0, 0, 272, 34, 14);
    panel.lineStyle(4, C.ink, 1);
    panel.strokeRoundedRect(0, 0, 272, 34, 14);
    const icon = this.add.graphics({ x: 26, y: 17 });
    Icons.wrench(icon, 30, C.ink);
    this.hpBar = this.add.graphics();
    this.hpText = label(this, 172, 18, '100%', { size: 15, color: C.ink, strokeThickness: 0 });
    c.add([panel, icon, this.hpBar, this.hpText]);
    this.hpC = c;
    this.refreshHealthBar();
  }

  private refreshHealthBar(): void {
    const w = 184;
    const k = this.health / MAX_HEALTH;
    const g = this.hpBar;
    g.clear();
    g.fillStyle(0x9a9fa8, 1);
    g.fillRoundedRect(54, 8, w, 18, 8);
    g.fillStyle(k >= 0.6 ? C.green : k >= 0.3 ? C.yellow : C.red, 1);
    if (k > 0) g.fillRoundedRect(54, 8, Math.max(14, w * k), 18, 8);
    g.lineStyle(3, C.ink, 1);
    g.strokeRoundedRect(54, 8, w, 18, 8);
    this.hpText.setText(`${Math.round(this.health)}%`);
  }

  /** Crashes and hard bumps wear the bus out: it looks battered, smokes, and drives slower. */
  private damageBus(amount: number): void {
    if (amount <= 0) return;
    const before = this.health;
    this.health = Math.max(0, this.health - amount);
    const lost = Math.round(before - this.health);
    if (lost <= 0) return;
    this.bus.setDamage(1 - this.health / MAX_HEALTH);
    this.refreshHealthBar();
    this.tweens.add({ targets: this.hpC, scale: { from: 1.3, to: 1 }, duration: 320, ease: 'Back.easeOut' });
    floatText(this, this.bus.x + 40, 400, `-${lost}%`, C.red, 40);
    this.updateSmoke();
    const was = conditionOf(before);
    const now = conditionOf(this.health);
    if (now !== was && (now === 'damaged' || now === 'critical')) {
      this.time.delayedCall(900, () => this.showBanner(t(now === 'critical' ? 'limping' : 'damaged'), C.orange, 2400, (g) => Icons.wrench(g, 40, C.cream)));
    }
  }

  /** Light smoke below 50%, heavy dark smoke below 25%. */
  private updateSmoke(): void {
    const level = this.health < 25 ? 2 : this.health < 50 ? 1 : 0;
    if (level === this.smokeLevel) return;
    this.smoke?.destroy();
    this.smoke = null;
    this.smokeLevel = level;
    if (level === 0) return;
    this.smoke = this.add.particles(0, 0, 'dot', {
      lifespan: 900,
      speedY: { min: -90, max: -45 },
      speedX: { min: -40, max: 10 },
      scale: { start: 0.5, end: 2.2 },
      alpha: { start: level === 2 ? 0.75 : 0.55, end: 0 },
      tint: level === 2 ? [0x4a4650, 0x2d2a32] : [0xe0e0e0, 0xb0b0b0],
      frequency: level === 2 ? 50 : 120,
      quantity: 1,
    });
    this.smoke.setDepth(13);
  }

  /** A worn bus smokes from the front, and a very worn engine coughs now and then. */
  private wearEffects(dt: number): void {
    if (this.smoke) {
      const L = this.bus.layout;
      const lift = bridgeLiftAt(this.level.bridges, this.bus.x);
      this.smoke.setPosition(this.bus.x + (L.boxFrontX - 70) * this.bus.scaleX, this.busLane.y - lift + (L.top + 18) * this.bus.scaleX);
    }
    if (this.health < 40 && this.v > 30) {
      this.coughTimer -= dt;
      if (this.coughTimer <= 0) {
        this.coughTimer = 3 + Math.random() * 3;
        audio.cough();
        this.cameras.main.shake(120, 0.0025);
      }
    }
  }

  private onCrash(c: LaneCrash): void {
    const cam = this.cameras.main;
    const visible = c.x > cam.scrollX - 120 && c.x < cam.scrollX + GAME_W + 120;
    if (c.player === 'follower') {
      // We drove into somebody: our mistake.
      if (this.crashCooldown > 0) return;
      this.crashCooldown = 2.5;
      this.stun = 1.1;
      audio.crash();
      this.sparks(c.x, c.y);
      this.damageBus(crashDamage(c.impact, true));
      this.mistake(t('crash'), POINTS.crash, this.bus.x);
    } else if (c.player === 'leader') {
      // Somebody ran into us: not our fault, but it hurts.
      if (this.crashCooldown > 0) return;
      this.crashCooldown = 1.5;
      audio.crash();
      this.sparks(c.x, c.y);
      cam.shake(300, 0.012);
      this.damageBus(crashDamage(c.impact, false));
      this.showBanner(t('bumped'), C.orange, 1800);
    } else if (visible) {
      audio.crash();
      this.sparks(c.x, c.y);
    }
  }

  private sparks(worldX: number, roadY = this.busLane.y): void {
    const lift = bridgeLiftAt(this.level.bridges, worldX);
    const em = this.add.particles(worldX, roadY - lift - 70, 'dot', {
      speed: { min: 90, max: 340 },
      lifespan: 520,
      scale: { start: 0.8, end: 0 },
      tint: [0xffd23f, 0xffffff, 0xf4a261],
      emitting: false,
    });
    em.setDepth(60);
    em.explode(18);
    this.time.delayedCall(700, () => em.destroy());
  }

  // ---------------------------------------------------------------- bus stop sequence

  private tween(cfg: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => this.tweens.add({ ...cfg, onComplete: () => resolve() }));
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, () => resolve()));
  }

  private nearestDoor(x: number): number {
    const doors = this.bus.doorWorldXs();
    return doors.reduce((best, d) => (Math.abs(d - x) < Math.abs(best - x) ? d : best), doors[0]!);
  }

  private async serveStop(stop: StopRt): Promise<void> {
    this.phase = 'serving';
    stop.state = 'serving';
    this.v = 0;
    this.tweens.add({ targets: stop.arrow, alpha: 0, duration: 300 });
    audio.doorOpen();
    await this.bus.openDoors();

    // Riders get off (those whose destination matches this stop get a bonus; on the last stop everyone exits)
    const { exiting: matched, remaining } = countMatchingDestinations(this.aboardDestinations, stop.data.place);
    const leaving = stop.last ? this.aboard : matched;
    this.aboardDestinations = stop.last ? [] : remaining;
    this.refreshDestinationHud();
    const doors = this.bus.doorWorldXs();
    for (let i = 0; i < leaving; i++) {
      const dx = doors[i % doors.length]!;
      const img = this.add
        .image(dx, GROUND_Y - 20, `pax${Math.floor(this.rng() * PASSENGER_VARIANTS)}`)
        .setOrigin(0.5, 1)
        .setScale(PAX_SCALE * 0.8)
        .setAlpha(0)
        .setDepth(21);
      this.aboard--;
      this.bus.setPassengers(this.aboard);
      this.score.passenger();
      if (i < matched) {
        this.score.add(POINTS.destination);
        floatText(this, dx, 360, `+${POINTS.passenger + POINTS.destination}`, C.green, 38);
        audio.destinationBonus();
      } else {
        floatText(this, dx, 360, `+${POINTS.passenger}`, C.yellow, 34);
        audio.coin();
      }
      this.refreshHud();
      await this.tween({ targets: img, alpha: 1, y: SIDEWALK_FEET_Y, scale: PAX_SCALE, duration: 320, ease: 'Quad.easeOut' });
      const dir = i % 2 === 0 ? -1 : 1;
      this.tweens.add({ targets: img, angle: { from: -6, to: 6 }, yoyo: true, repeat: 4, duration: 150 });
      this.tweens.add({ targets: img, x: dx + dir * 420, alpha: 0, duration: 1600, onComplete: () => img.destroy() });
      await this.wait(150);
    }

    // Waiting people get on
    for (const p of stop.people) {
      this.tweens.killTweensOf(p.img);
      this.tweens.killTweensOf(p.arm);
      this.tweens.killTweensOf(p.bubble);
      p.arm.destroy();
      this.tweens.add({ targets: p.bubble, alpha: 0, scale: 0.6, duration: 180, onComplete: () => p.bubble.destroy() });
      p.img.setAngle(0);
      const door = this.nearestDoor(p.img.x);
      const dist = Math.abs(door - p.img.x);
      const walk = this.tweens.add({ targets: p.img, angle: { from: -6, to: 6 }, yoyo: true, repeat: -1, duration: 140 });
      if (dist > 2) await this.tween({ targets: p.img, x: door, duration: Math.max(150, dist * 3.2), ease: 'Linear' });
      walk.stop();
      p.img.setAngle(0);
      await this.tween({ targets: p.img, y: GROUND_Y - 24, scale: PAX_SCALE * 0.75, alpha: 0, duration: 300, ease: 'Quad.easeIn' });
      p.img.destroy();
      this.aboard++;
      this.aboardDestinations.push(p.destination);
      this.bus.setPassengers(this.aboard);
      this.refreshDestinationHud();
      this.score.passenger();
      floatText(this, door, 360, `+${POINTS.passenger}`, C.yellow, 34);
      audio.coin();
      this.refreshHud();
    }
    stop.people = [];

    await this.wait(250);
    audio.doorClose();
    await this.bus.closeDoors();
    stop.state = 'done';
    this.award(POINTS.stopServed, this.bus.x);
    this.addNitro(NITRO.stopReward);
    audio.reward();
    voice.speak('wellDone');
    this.showBanner(t('wellDone'), C.green, 1400, (g) => drawStar(g, 0, 0, 26, C.yellow, C.ink, 3));
    this.phase = 'driving';
  }

  // ---------------------------------------------------------------- main loop

  update(_: number, delta: number): void {
    if (this.paused || this.phase === 'ended') return;
    const dt = Math.min(delta / 1000, 0.05);
    const k = this.keys;
    let gas = Boolean(this.gas.isDown || (k && (k.right.isDown || k.d.isDown)));
    let brake = Boolean(this.brake.isDown || (k && (k.left.isDown || k.a.isDown)));

    // "Helper" mode: the bus brakes by itself before red lights and bus stops, and pulls back to the curb lane for stops.
    if (this.assist && this.phase === 'driving') {
      const f0 = this.bus.frontWorldX();
      if (this.busLane.lane === 0 && this.level.parked.some((px) => px - f0 > -40 && px - f0 < 650)) {
        this.requestLane(1);
      }
      if (this.busLane.lane === 1) {
        const stopSoon = this.stops.some((s) => s.state === 'waiting' && s.data.zoneEnd - f0 > -40 && s.data.zoneEnd - f0 < 750);
        const stSoon = this.stations.some(
          (st) => st.state === 'waiting' && st.zoneEnd - f0 > -40 && st.zoneEnd - f0 < 750 && this.stationWanted(st),
        );
        if (stopSoon || stSoon) this.requestLane(0);
      }
      if (this.autoBrakeNeeded(f0)) {
        gas = false;
        brake = true;
      }
    }

    // Shaken after a crash: no gas for a moment.
    if (this.stun > 0) {
      this.stun -= dt;
      gas = false;
      brake = true;
    }

    // Nitro: a burst of speed while the button (or Shift / N) is held, never together with the brake.
    const wantBoost = Boolean(this.nitroBtn.isDown || (k && (k.shift.isDown || k.n.isDown))) && this.phase === 'driving' && !brake;
    const nit = nitroStep({ nitro: this.nitro, locked: this.nitroLocked }, wantBoost, dt);
    if (nit.boosting !== this.boosting) this.setBoosting(nit.boosting);
    this.nitro = nit.nitro;
    this.nitroLocked = nit.locked;
    if (nit.boosting) gas = true; // the boost always pushes the gas
    this.refreshNitroBar();

    if (gas && !this.gasTouched) {
      this.gasTouched = true;
      voice.speak('go');
      this.startHint?.destroy();
      this.startHint = null;
    }

    const perf = performanceFor(this.health);
    const fp = this.fuelActive ? fuelPerformance(this.fuel) : 1; // an empty tank: a crawl
    const maxNormal = this.level.maxSpeed * perf.speedFactor * fp;
    const max = this.boosting ? maxNormal * NITRO.speedFactor : maxNormal;
    const vBefore = this.v;
    if (this.phase === 'driving') {
      if (brake) this.v -= PHYSICS.brake * dt;
      else if (gas) this.v += PHYSICS.accel * perf.accelFactor * fp * (this.boosting ? NITRO.accelFactor : 1) * dt;
      else this.v -= PHYSICS.coast * dt;
    } else if (this.phase === 'finishing') {
      this.v = Math.max(this.v, 260);
    } else {
      this.v = 0;
    }
    // We never exceed the limit by pushing; but speed left over from a boost bleeds off smoothly instead of snapping.
    if (this.v > max) this.v = vBefore > max ? Math.max(max, vBefore - 320 * dt) : max;
    this.v = Math.max(0, this.v);

    const prevFront = this.bus.frontWorldX();
    const prevX = this.bus.x;
    const dx = this.v * dt;
    this.bus.x += dx;
    const steerAngle = stepLaneChange(this.busLane, dt);
    const busLift = bridgeLiftAt(this.level.bridges, this.bus.x);
    const busPitch = bridgeSlopeDegAt(this.level.bridges, this.bus.x);
    this.bus.setRoadPose(this.busLane.y - busLift, steerAngle + busPitch);
    this.bus.setDepth(depthForY(this.busLane.y));
    const blinking = this.busLane.changeT > 0;
    this.bus.setBlinker(blinking, this.time.now);
    if (blinking) {
      const phase = Math.floor(this.time.now / 220) % 2;
      if (phase !== this.lastBlinkerPhase) {
        this.lastBlinkerPhase = phase;
        audio.blinker(phase === 0);
      }
    } else {
      this.lastBlinkerPhase = -1;
    }
    const cam = this.cameras.main;

    // Other road users. A red light (or pedestrians on a zebra) holds them while people are crossing.
    this.crashCooldown = Math.max(0, this.crashCooldown - dt);
    const states = [
      ...this.signals.map((l) => ({
        lineX: l.data.lineX,
        state: l.crossing.busy ? ('red' as LightState) : l.model.state,
      })),
      ...this.crosswalks.map((c) => ({
        lineX: c.lineX,
        state: c.crossing.busy ? ('red' as LightState) : ('green' as LightState),
      })),
    ];
    if (this.phase !== 'finishing') {
      // Traffic in our direction is solid: we can't drive through it, and it may run into us.
      const res = this.lane.update(dt, cam.scrollX, states, {
        x: this.bus.x,
        len: this.bus.lengthWorld(),
        v: this.v,
        lane: this.busLane.lane,
        fromLane: this.busLane.fromLane,
        changeT: this.busLane.changeT,
        y: this.busLane.y,
      });
      if (res.player) {
        this.bus.x = res.player.x;
        this.v = Phaser.Math.Clamp(res.player.v, 0, maxNormal * NITRO.speedFactor + 150);
      }
      res.crashes.forEach((c) => this.onCrash(c));
      if (res.ambulanceEvent === 'approaching') {
        audio.ambulanceSiren(1.8);
        voice.speak('ambulance', { priority: true });
        this.showBanner(t('yieldAmbulance'), C.red, 2000, (g) => {
          g.fillStyle(C.cream, 1);
          g.fillCircle(0, 0, 22);
          g.fillStyle(C.red, 1);
          g.fillRect(-5, -14, 10, 28);
          g.fillRect(-14, -5, 28, 10);
        });
      } else if (res.ambulanceEvent === 'yielded') {
        this.award(POINTS.yieldAmbulance, this.bus.x);
        audio.reward();
        this.showBanner(t('wellDone'), C.green, 1300, (g) => drawStar(g, 0, 0, 26, C.yellow, C.ink, 3));
      } else if (res.ambulanceEvent === 'blocked') {
        this.mistake(t('blockAmbulance'), POINTS.blockAmbulance, this.bus.x);
      }
      if (this.assist && res.ambulanceLane !== undefined && res.ambulanceLane === this.busLane.lane && this.busLane.changeT <= 0) {
        this.requestLane(res.ambulanceLane === 0 ? 1 : 0);
      }
    } else {
      this.lane.update(dt, cam.scrollX, states, null);
    }
    const front = this.bus.frontWorldX();
    const speedRatio = Math.min(1.3, this.v / maxNormal);
    this.bus.roll(dx, dt, Math.min(1.4, this.v / maxNormal));
    audio.setEngine(speedRatio);
    audio.setMusicIntensity(0.18 + Math.min(1, speedRatio) * 0.82);
    if (this.v > 85) this.wasMovingFast = true;
    else if (this.v === 0 && this.wasMovingFast) {
      this.wasMovingFast = false;
      if (this.stun <= 0) audio.airBrake();
    }
    if (this.rainActive) {
      this.wiperTimer -= dt;
      if (this.wiperTimer <= 0) {
        this.wiperTimer = 1.45;
        audio.wiper();
      }
    }
    this.nitroEffects();
    this.checkBumps(prevX);
    this.wearEffects(dt);
    this.useFuel(dx, dt, gas && this.phase === 'driving', this.boosting);

    // Camera + parallax
    cam.scrollX = Phaser.Math.Clamp(this.bus.x - this.camLead, 0, this.level.length - GAME_W);
    this.backdrop.update(cam.scrollX, dt);
    for (const bv of this.bridgeViews) bv.update(dt);
    this.traffic.update(dt, cam.scrollX, states);

    this.progressBus.x = Phaser.Math.Clamp(this.toBar(this.bus.x), 370, 860);

    this.updateLights(dt, prevFront, front, gas);
    this.updateCrosswalks(dt, prevFront, front, gas);
    this.updateStopSigns(dt, prevFront, front, gas);
    this.updateChildrenSigns(prevFront, front);
    this.updateStops(dt, front, gas);
    this.updateStations(dt, front, gas);

    if (this.phase === 'driving' && front >= this.level.finishX) this.finishRoute();
  }

  /** True when the helper should be braking: the bus would otherwise overshoot a stop point. */
  private autoBrakeNeeded(front: number): boolean {
    const d = brakingDistance(this.v) + 25;
    for (const L of this.signals) {
      const target = L.data.lineX - 45;
      if (L.model.state !== 'green' && front <= target + 4 && target - front <= d) return true;
    }
    for (const c of this.crosswalks) {
      const target = c.lineX - 45;
      if (c.crossing.busy && front <= target + 4 && target - front <= d) return true;
    }
    for (const s of this.stopSigns) {
      if (s.stopped) continue;
      const target = s.lineX - 45;
      if (front <= target + 4 && target - front <= d) return true;
    }
    for (const s of this.stops) {
      if (s.state !== 'waiting') continue;
      if (s.data.waiting === 0 && !this.aboardDestinations.includes(s.data.place)) continue;
      const target = s.data.zoneEnd - 70;
      if (front <= target + 4 && target - front <= d) return true;
    }
    // Gas station / depot: stop there when the tank is getting empty or the bus is in a bad way.
    for (const st of this.stations) {
      if (st.state !== 'waiting' || !this.stationWanted(st)) continue;
      const target = st.zoneEnd - 70;
      if (front <= target + 4 && target - front <= d) return true;
    }
    for (const cx of this.level.children) {
      if (this.childrenDone.has(cx)) continue;
      const dist = cx - front;
      if (dist < -10 || dist > 650) continue;
      if (this.v > Math.sqrt((CHILDREN.gentle - 15) ** 2 + 2 * PHYSICS.brake * Math.max(0, dist - 20))) return true;
    }
    // Speed bumps: be down to a gentle speed when the front wheels get there.
    // (It is the front axle that hits the bump, a good way behind the nose of the bus.)
    const axle = this.bus.x + this.bus.layout.wheelXs[this.bus.layout.wheelXs.length - 1]! * this.bus.scaleX;
    for (const bx of this.level.bumps) {
      if (this.bumpsDone.has(bx)) continue;
      const dist = bx - axle;
      if (dist < -10 || dist > 700) continue;
      if (this.v > Math.sqrt((BUMP.gentle - 15) ** 2 + 2 * PHYSICS.brake * Math.max(0, dist - 20))) return true;
    }
    // A vehicle in front of us in the lane(s) we occupy: keep behind it, gently.
    const lead = this.lane.leaderAhead(front, this.busLane.lane, this.busLane.fromLane, this.busLane.changeT);
    if (lead && lead.gap <= 70 + Math.max(0, this.v - lead.v) * 0.7) return true;
    return false;
  }

  private updateLights(dt: number, prevFront: number, front: number, gas: boolean): void {
    for (const L of this.signals) {
      const lineX = L.data.lineX;
      if (L.data.teach && !L.forced && front < lineX && lineX - front < 900) {
        L.model.forceToRed();
        L.forced = true;
        this.drawLamps(L);
      }
      // Fairness: a yellow light never turns red while the bus is too close and too fast to stop.
      // And a red light waits until everybody has crossed the zebra.
      const hold =
        (L.model.state === 'yellow' && front < lineX && !canStopBefore(front, lineX, this.v)) ||
        (L.model.state === 'red' && L.crossing.busy);
      if (!hold && L.model.update(dt)) {
        this.drawLamps(L);
        if (L.model.state === 'green' && L.waitedAtRed && front < lineX) {
          audio.select();
          voice.speak('greenLight');
          this.showBanner(t('greenGo'), C.green, 1300, (g) => drawMiniLight(g, 56, 'green'));
          L.waitedAtRed = false;
        }
      }
      const state = L.model.state;
      // Red for the cars: people start to cross (mostly on every red; always on the first one, to teach it).
      if (state === 'red' && L.prevState !== 'red' && Math.abs(lineX - front) < 1600 && (L.data.teach || Math.random() < 0.8)) {
        L.crossing.spawnGroup();
      }
      L.prevState = state;
      L.crossing.update(dt);
      const ahead = front < lineX && lineX - front < 800;

      if (ahead && state !== 'green' && L.hintFor !== state) {
        L.hintFor = state;
        if (state === 'red') {
          voice.speak('redLight', { priority: true });
          this.showBanner(t('redStop'), C.red, 1800, (g) => drawMiniLight(g, 56, 'red'));
        }
      }
      if (state === 'green') L.hintFor = null;

      if (state === 'red' && this.v < 5 && !gas && isWaitingBeforeLine(front, lineX)) {
        L.waitedAtRed = true;
        if (!L.rewarded) {
          L.rewarded = true;
          this.award(POINTS.waitedAtRed, this.bus.x);
          audio.reward();
          this.showBanner(t('wellDone'), C.green, 1300, (g) => drawStar(g, 0, 0, 26, C.yellow, C.ink, 3));
        }
      }

      if (this.phase === 'driving' && crossedLine(prevFront, front, lineX) && state === 'red') {
        this.mistake(t('ranRed'), POINTS.ranRedLight, this.bus.x);
        this.cameras.main.flash(200, 230, 57, 70);
      }
    }
  }

  private updateCrosswalks(dt: number, prevFront: number, front: number, gas: boolean): void {
    for (const c of this.crosswalks) {
      if (!c.spawned && front < c.lineX && c.lineX - front < 950) {
        c.spawned = true;
        c.crossing.spawnGroup();
      }
      c.crossing.update(dt);
      if (c.crossing.busy && !c.hinted && front < c.lineX && c.lineX - front < 700) {
        c.hinted = true;
        voice.speak('pedestrians');
        this.showBanner(t('crosswalk'), C.blue, 1700, (g) => drawCrosswalkSign(g, 0, 0, 26));
      }
      if (c.crossing.busy && this.v < 5 && !gas && isWaitingBeforeLine(front, c.lineX) && !c.rewarded) {
        c.rewarded = true;
        this.award(POINTS.yielded, this.bus.x);
        audio.reward();
        this.showBanner(t('wellDone'), C.green, 1300, (g) => drawStar(g, 0, 0, 26, C.yellow, C.ink, 3));
      }
      if (this.phase === 'driving' && crossedLine(prevFront, front, c.lineX) && c.crossing.busy && !c.penalty) {
        c.penalty = true;
        this.mistake(t('ranCrosswalk'), POINTS.ranCrosswalk, this.bus.x);
        this.cameras.main.flash(200, 230, 57, 70);
      }
    }
  }

  private updateStopSigns(dt: number, prevFront: number, front: number, gas: boolean): void {
    for (const s of this.stopSigns) {
      if (!s.stopped && !s.hinted && front < s.lineX && s.lineX - front < 700) {
        s.hinted = true;
        voice.speak('stopSign');
        this.showBanner(t('stopSign'), C.red, 1600, (g) => drawRoadStopSign(g, 0, 0, 26));
      }
      if (!s.stopped && this.phase === 'driving' && isWaitingBeforeLine(front, s.lineX) && this.v < 5 && !gas) {
        s.hold += dt;
        if (s.hold >= 0.2) {
          s.stopped = true;
          this.award(POINTS.stopSign, this.bus.x);
          audio.reward();
          this.showBanner(t('greenGo'), C.green, 1200, (g) => drawStar(g, 0, 0, 26, C.yellow, C.ink, 3));
        }
      } else if (!s.stopped) {
        s.hold = 0;
      }
      if (this.phase === 'driving' && crossedLine(prevFront, front, s.lineX) && !s.stopped && !s.penalty) {
        s.penalty = true;
        this.mistake(t('ranStopSign'), POINTS.ranStopSign, this.bus.x);
        this.cameras.main.flash(200, 230, 57, 70);
      }
    }
  }

  private updateChildrenSigns(prevFront: number, front: number): void {
    for (const cx of this.level.children) {
      if (!this.childrenHinted.has(cx) && front < cx && cx - front < 700) {
        this.childrenHinted.add(cx);
        voice.speak('children');
        this.showBanner(t('childrenSign'), C.orange, 1700, (g) => drawChildrenSign(g, 0, 0, 26));
      }
      if (!this.childrenDone.has(cx) && prevFront < cx && front >= cx) {
        this.childrenDone.add(cx);
        const res = childrenZoneResult(this.v);
        if (res === 'gentle') {
          this.award(POINTS.carefulChildren, this.bus.x);
          audio.reward();
          this.showBanner(t('careful'), C.green, 1300, (g) => drawStar(g, 0, 0, 26, C.yellow, C.ink, 3));
        } else if (res === 'fast') {
          this.mistake(t('tooFast'), POINTS.fastChildren, cx);
        }
      }
    }
  }

  private updateStops(dt: number, front: number, gas: boolean): void {
    for (const s of this.stops) {
      if (s.state !== 'waiting') continue;
      const z = s.data.zoneEnd;
      const wantingOff = this.aboardDestinations.filter((d) => d === s.data.place).length;
      const stopNeeded = s.data.waiting > 0 || wantingOff > 0;
      if (stopNeeded && !s.arrow.visible) s.arrow.setVisible(true);

      if (!s.waving && z - front < 1000 && front < z && s.people.length > 0) {
        s.waving = true;
        for (const p of s.people) {
          this.tweens.add({ targets: p.arm, angle: { from: -48, to: 22 }, yoyo: true, repeat: -1, duration: 170, ease: 'Sine.easeInOut' });
        }
      }
      if (!s.announced && z - front < 1000 && front < z) {
        s.announced = true;
        if (wantingOff > 0) {
          audio.dingDong();
          voice.speak('stop');
          this.showBanner(`${t(`place_${s.data.place}` as TextKey)} — ${t('dropOffHere')}`, C.green, 1900, (g) => drawPlaceIcon(g, s.data.place, 0, 0, 26));
        } else if (s.data.waiting > 0) {
          audio.dingDong();
          voice.speak('stop');
          this.showBanner(`${t('busStop')} · ${t(`place_${s.data.place}` as TextKey)}`, C.blue, 1600, (g) => drawPlaceIcon(g, s.data.place, 0, 0, 26));
        }
      }
      if (hasMissedStop(front, z)) {
        if (!stopNeeded) {
          s.state = 'done';
          s.arrow.setVisible(false);
          continue;
        }
        s.state = 'missed';
        this.tweens.add({ targets: s.arrow, alpha: 0, duration: 300 });
        for (const p of s.people) {
          this.tweens.add({ targets: [p.img, p.arm, p.bubble], y: '-=30', yoyo: true, repeat: 2, duration: 160 });
        }
        this.mistake(t('missedStop'), POINTS.missedStop, this.bus.x);
        continue;
      }
      if (this.phase === 'driving' && isInStopZone(front, z) && this.v < 3 && !gas) {
        if (this.busLane.lane === 0 && this.busLane.changeT <= 0) {
          this.stillTime += dt;
          if (this.stillTime > 0.25) {
            this.stillTime = 0;
            void this.serveStop(s);
          }
        } else if (stopNeeded && !s.laneHinted) {
          s.laneHinted = true;
          this.showBanner(t('returnLane'), C.blue, 1800, (g) => Icons.laneChange(g, 38, false));
        }
      } else if (isInStopZone(front, z)) {
        this.stillTime = 0;
      }
    }
  }

  private finishRoute(): void {
    this.phase = 'finishing';
    if (startLaneChange(this.busLane, 0)) this.refreshLaneBtn();
    this.gas.reset();
    this.brake.reset();
    audio.horn(this.busBody);
    voice.speak('finish', { priority: true });
    const arrived = landmarkForLevel(this.level.level);
    this.showBanner(t(`lm_${arrived}` as TextKey), C.blue, 2400, (g) => {
      drawLandmark(g, arrived);
      g.setScale(0.7);
    });
    this.time.delayedCall(1300, () => {
      this.phase = 'ended';
      audio.stopEngine();
      // Carry over the bus's wear and petrol to the next route (only on completed routes).
      const health = Math.round(this.health);
      const fuel = Math.round(this.fuel);
      saveBusStatus(this.fuelActive ? { health, fuel } : { health });
      this.cameras.main.fadeOut(400, 45, 42, 50);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        const result: DriveResult = {
          level: this.level.level,
          score: this.score.score,
          mistakes: this.score.mistakes,
          passengers: this.score.passengersMoved,
          health,
          fuel,
          fuelActive: this.fuelActive,
        };
        this.scene.start('Result', result);
      });
    });
  }
}
