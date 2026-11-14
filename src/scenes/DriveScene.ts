import Phaser from 'phaser';
import { audio } from '../audio/AudioEngine';
import { BusView } from '../bus/BusView';
import { DEFAULT_DESIGN } from '../bus/design';
import { loadDesign } from '../bus/garage';
import { DRIVE_SCALE } from '../bus/geometry';
import { getSettings, updateSettings } from '../core/settings';
import { C, GAME_H, GAME_W } from '../config';
import { START_X, generateLevel, type LevelData, type LightData, type StopData } from '../core/level';
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
  isWaitingBeforeLine,
} from '../core/rules';
import { TrafficLightModel, type LightState } from '../core/traffic';
import { t, type TextKey } from '../i18n';
import { Icons, drawMiniLight, drawStar, drawStopSign } from '../ui/draw';
import { GROUND_Y, PASSENGER_VARIANTS, SIDEWALK_FEET_Y, STREET_Y } from '../ui/textures';
import { createScenery } from '../ui/scenery';
import { landmarkForLevel } from '../core/campaign';
import { drawLandmark } from '../ui/landmarks';
import { drawLandmarkBig } from '../ui/landmarkScenes';
import { TrafficManager } from '../traffic/TrafficManager';
import { BUMP, MAX_HEALTH, bumpDamage, bumpResult, conditionOf, crashDamage, performanceFor } from '../core/rules';
import { LaneTraffic, type LaneCrash } from '../traffic/LaneTraffic';
import { Crossing } from '../traffic/Crossing';
import { precipKind, resolveEnv } from '../core/world';
import { Button, HoldButton, floatText, label } from '../ui/widgets';
import { addAudioToggles } from './MenuScene';

type G = Phaser.GameObjects.Graphics;

const ROAD_TOP = STREET_Y + 50;
const ROAD_BOTTOM = STREET_Y + 180;
const PAX_SCALE = 0.85;

interface StopRt {
  data: StopData;
  state: 'waiting' | 'serving' | 'done' | 'missed';
  people: Phaser.GameObjects.Image[];
  arrow: Phaser.GameObjects.Container;
  announced: boolean;
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

type Phase = 'driving' | 'serving' | 'finishing' | 'ended';

export interface DriveResult {
  level: number;
  score: number;
  mistakes: number;
  passengers: number;
  /** Condition of the bus at the end, 0..100. */
  health: number;
}

export class DriveScene extends Phaser.Scene {
  private level!: LevelData;
  private backdrop!: ReturnType<typeof createScenery>;
  private bus!: BusView;
  private score!: ScoreKeeper;
  private stops: StopRt[] = [];
  private signals: LightRt[] = [];
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
  /** Speed bumps the bus has already driven over. */
  private bumpsDone = new Set<number>();
  /** Seconds the bus is still shaken after hitting somebody (no gas). */
  private stun = 0;
  private crashCooldown = 0;
  private lastHorn = -1000;
  /** Screen x of the bus centre; leaves more road visible ahead of the bus. */
  private camLead = 360;
  private rng = mulberry32(1);

  private gas!: HoldButton;
  private brake!: HoldButton;
  private keys!: Record<'right' | 'left' | 'up' | 'down' | 'd' | 'a' | 'w' | 's', Phaser.Input.Keyboard.Key>;
  private scoreText!: Phaser.GameObjects.Text;
  private paxText!: Phaser.GameObjects.Text;
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
    this.phase = 'driving';
    this.v = 0;
    this.stillTime = 0;
    this.aboard = 0;
    this.paused = false;
    this.gasTouched = false;
    this.assist = getSettings().assist;
    this.stun = 0;
    this.crashCooldown = 0;
    this.bumpsDone = new Set<number>();
    this.health = MAX_HEALTH;
    this.smoke = null;
    this.smokeLevel = 0;
    this.coughTimer = 4;
    this.banner = null;
    this.pauseLayer = null;
    this.rng = mulberry32(this.level.level * 31 + 5);
  }

  create(): void {
    this.cameras.main.fadeIn(300, 45, 42, 50);
    this.cameras.main.setBounds(0, 0, this.level.length, GAME_H);
    const env = resolveEnv(this.level.level, getSettings().world);
    this.backdrop = createScenery(this, env);

    const design = loadDesign() ?? { ...DEFAULT_DESIGN };
    this.bus = new BusView(this, START_X, GROUND_Y, design);
    this.bus.setScale(DRIVE_SCALE[design.body]).setDepth(10);
    this.camLead = 140 + this.bus.lengthWorld() / 2;
    this.bus.setNight(env.time === 'night');
    this.traffic = new TrafficManager(this, { night: env.time === 'night', level: this.level.level, bumps: this.level.bumps });
    this.traffic.prewarm(Phaser.Math.Clamp(START_X - this.camLead, 0, this.level.length - GAME_W));
    this.lane = new LaneTraffic(this, { night: env.time === 'night', level: this.level.level, bumps: this.level.bumps });
    this.lane.prewarm(START_X);
    this.bus.setPassengers(0);

    const stopsTotal = this.level.items.filter((i) => i.kind === 'stop').length;
    let stopIdx = 0;
    for (const item of this.level.items) {
      if (item.kind === 'light') this.createLight(item);
      else this.createStop(item, ++stopIdx === stopsTotal);
    }
    this.level.bumps.forEach((bx) => this.createBump(bx));
    this.createFinish(env.time === 'night');
    this.createHud();
    this.createHealthBar();
    this.createControls();

    audio.startEngine();
    const rain = env.precip && precipKind(env) === 'rain';
    if (rain) audio.startRain();
    this.events.once('shutdown', () => {
      audio.stopEngine();
      audio.stopRain();
      audio.stopSiren();
    });

    this.showStartHint();
  }

  // ---------------------------------------------------------------- world

  private createLight(data: LightData): void {
    const x = data.lineX;
    const road = this.add.graphics().setDepth(-4);
    // stop line
    road.fillStyle(C.roadLine, 1);
    road.fillPoints(
      [
        new Phaser.Math.Vector2(x - 6, ROAD_TOP),
        new Phaser.Math.Vector2(x + 6, ROAD_TOP),
        new Phaser.Math.Vector2(x - 4, ROAD_BOTTOM),
        new Phaser.Math.Vector2(x - 16, ROAD_BOTTOM),
      ],
      true,
    );
    // Zebra crossing: the bars run ALONG the road, one behind the other across its width,
    // and people walk over them (bars across the road would be a pattern for cars, not for people).
    road.fillStyle(C.roadLine, 0.92);
    {
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

    // Bus-stop sign + shelter roof on the near sidewalk, just ahead of the bus front.
    const sign = this.add.graphics().setDepth(20);
    const sx = x1 + 70;
    sign.fillStyle(0x4a4650, 1);
    sign.lineStyle(3, C.ink, 1);
    sign.fillRect(sx - 5, 540, 10, SIDEWALK_FEET_Y + 4 - 540);
    sign.strokeRect(sx - 5, 540, 10, SIDEWALK_FEET_Y + 4 - 540);
    drawStopSign(sign, sx, 530, 32);

    // Waiting passengers
    const people: Phaser.GameObjects.Image[] = [];
    const span = x1 - x0 - 80;
    for (let i = 0; i < data.waiting; i++) {
      const px = x0 + 40 + (span * (i + 0.5)) / data.waiting;
      const img = this.add
        .image(px, SIDEWALK_FEET_Y, `pax${Math.floor(this.rng() * PASSENGER_VARIANTS)}`)
        .setOrigin(0.5, 1)
        .setScale(PAX_SCALE)
        .setDepth(21);
      // idle sway
      this.tweens.add({ targets: img, angle: { from: -3, to: 3 }, yoyo: true, repeat: -1, duration: 600 + this.rng() * 400, ease: 'Sine.easeInOut' });
      people.push(img);
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
    const bx1 = 900;
    const bar = this.hudPanel(bx0 - 20, bx1 - bx0 + 70);
    bar.lineStyle(8, 0x9a8f80, 1);
    bar.lineBetween(bx0, 53, bx1, 53);
    const toBar = (wx: number) => bx0 + ((wx - START_X) / (this.level.finishX - START_X)) * (bx1 - bx0);
    this.toBar = toBar;
    for (const item of this.level.items) {
      if (item.kind === 'light') {
        const mg = this.add.graphics({ x: toBar(item.lineX), y: 53 }).setScrollFactor(0).setDepth(91);
        drawMiniLight(mg, 34, 'red');
      } else {
        drawStopSign(bar, toBar(item.zoneEnd), 53, 12);
      }
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

    const pause = new Button(this, GAME_W - 224, 52, { r: 34, color: C.orange, icon: (g, s) => Icons.pause(g, s), onClick: () => this.setPaused(true) });
    pause.setScrollFactor(0, 0, true).setDepth(90);
    addAudioToggles(this, GAME_W - 56, 52);
  }

  private createControls(): void {
    this.brake = new HoldButton(this, 120, GAME_H - 110, 76, C.red, (g, s) => Icons.brake(g, s));
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

    const kb = this.input.keyboard;
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      this.keys = kb.addKeys({
        right: K.RIGHT, left: K.LEFT, up: K.UP, down: K.DOWN, d: K.D, a: K.A, w: K.W, s: K.S,
      }) as DriveScene['keys'];
      kb.on('keydown-ESC', () => this.setPaused(!this.paused));
      kb.on('keydown-P', () => this.setPaused(!this.paused));
      kb.on('keydown-H', () => this.honk());
      kb.on('keydown-SPACE', () => this.honk());
      kb.addCapture('SPACE'); // never scroll the page
    }
  }

  private honk(): void {
    if (this.paused || this.phase === 'ended') return;
    const now = this.time.now;
    if (now - this.lastHorn < 350) return;
    this.lastHorn = now;
    audio.horn();
    floatText(this, this.bus.frontWorldX() - 40, 400, t('beep'), C.yellow, 44);
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
      this.tweens.pauseAll();
      this.time.paused = true;
      audio.setEngine(0);
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
      this.smoke.setPosition(this.bus.x + (L.boxFrontX - 70) * this.bus.scaleX, GROUND_Y + (L.top + 18) * this.bus.scaleX);
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
      this.sparks(c.x);
      this.damageBus(crashDamage(c.impact, true));
      this.mistake(t('crash'), POINTS.crash, this.bus.x);
    } else if (c.player === 'leader') {
      // Somebody ran into us: not our fault, but it hurts.
      if (this.crashCooldown > 0) return;
      this.crashCooldown = 1.5;
      audio.crash();
      this.sparks(c.x);
      cam.shake(300, 0.012);
      this.damageBus(crashDamage(c.impact, false));
      this.showBanner(t('bumped'), C.orange, 1800);
    } else if (visible) {
      audio.crash();
      this.sparks(c.x);
    }
  }

  private sparks(worldX: number): void {
    const em = this.add.particles(worldX, GROUND_Y - 70, 'dot', {
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

    // Riders get off
    const leaving = stop.last ? this.aboard : Math.min(stop.data.exiting, this.aboard);
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
      floatText(this, dx, 360, `+${POINTS.passenger}`, C.yellow, 34);
      audio.coin();
      this.refreshHud();
      await this.tween({ targets: img, alpha: 1, y: SIDEWALK_FEET_Y, scale: PAX_SCALE, duration: 320, ease: 'Quad.easeOut' });
      const dir = i % 2 === 0 ? -1 : 1;
      this.tweens.add({ targets: img, angle: { from: -6, to: 6 }, yoyo: true, repeat: 4, duration: 150 });
      this.tweens.add({ targets: img, x: dx + dir * 420, alpha: 0, duration: 1600, onComplete: () => img.destroy() });
      await this.wait(150);
    }

    // Waiting people get on
    for (const p of stop.people) {
      this.tweens.killTweensOf(p);
      p.setAngle(0);
      const door = this.nearestDoor(p.x);
      const dist = Math.abs(door - p.x);
      const walk = this.tweens.add({ targets: p, angle: { from: -6, to: 6 }, yoyo: true, repeat: -1, duration: 140 });
      if (dist > 2) await this.tween({ targets: p, x: door, duration: Math.max(150, dist * 3.2), ease: 'Linear' });
      walk.stop();
      p.setAngle(0);
      await this.tween({ targets: p, y: GROUND_Y - 24, scale: PAX_SCALE * 0.75, alpha: 0, duration: 300, ease: 'Quad.easeIn' });
      p.destroy();
      this.aboard++;
      this.bus.setPassengers(this.aboard);
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
    audio.reward();
    this.showBanner(t('wellDone'), C.green, 1400, (g) => drawStar(g, 0, 0, 26, C.yellow, C.ink, 3));
    this.phase = 'driving';
  }

  // ---------------------------------------------------------------- main loop

  update(_: number, delta: number): void {
    if (this.paused || this.phase === 'ended') return;
    const dt = Math.min(delta / 1000, 0.05);
    const k = this.keys;
    let gas = Boolean(this.gas.isDown || (k && (k.right.isDown || k.up.isDown || k.d.isDown || k.w.isDown)));
    let brake = Boolean(this.brake.isDown || (k && (k.left.isDown || k.down.isDown || k.a.isDown || k.s.isDown)));

    // "Helper" mode: the bus brakes by itself before red lights and bus stops.
    if (this.assist && this.phase === 'driving' && this.autoBrakeNeeded(this.bus.frontWorldX())) {
      gas = false;
      brake = true;
    }

    // Shaken after a crash: no gas for a moment.
    if (this.stun > 0) {
      this.stun -= dt;
      gas = false;
      brake = true;
    }

    if (gas && !this.gasTouched) {
      this.gasTouched = true;
      this.startHint?.destroy();
      this.startHint = null;
    }

    const perf = performanceFor(this.health);
    const max = this.level.maxSpeed * perf.speedFactor;
    if (this.phase === 'driving') {
      if (brake) this.v -= PHYSICS.brake * dt;
      else if (gas) this.v += PHYSICS.accel * perf.accelFactor * dt;
      else this.v -= PHYSICS.coast * dt;
    } else if (this.phase === 'finishing') {
      this.v = Math.max(this.v, 260);
    } else {
      this.v = 0;
    }
    this.v = Phaser.Math.Clamp(this.v, 0, max);

    const prevFront = this.bus.frontWorldX();
    const prevX = this.bus.x;
    const dx = this.v * dt;
    this.bus.x += dx;
    const cam = this.cameras.main;

    // Other road users. A red light also holds them while people are crossing.
    this.crashCooldown = Math.max(0, this.crashCooldown - dt);
    const states = this.signals.map((l) => ({
      lineX: l.data.lineX,
      state: l.crossing.busy ? ('red' as LightState) : l.model.state,
    }));
    if (this.phase !== 'finishing') {
      // Traffic in our own lane is solid: we can't drive through it, and it may run into us.
      const res = this.lane.update(dt, cam.scrollX, states, { x: this.bus.x, len: this.bus.lengthWorld(), v: this.v });
      if (res.player) {
        this.bus.x = res.player.x;
        this.v = Phaser.Math.Clamp(res.player.v, 0, max + 150);
      }
      res.crashes.forEach((c) => this.onCrash(c));
    }
    const front = this.bus.frontWorldX();
    this.bus.roll(dx, dt, this.v / max);
    audio.setEngine(this.v / max);
    this.checkBumps(prevX);
    this.wearEffects(dt);

    // Camera + parallax
    cam.scrollX = Phaser.Math.Clamp(this.bus.x - this.camLead, 0, this.level.length - GAME_W);
    this.backdrop.update(cam.scrollX, dt);
    this.traffic.update(dt, cam.scrollX, states);

    this.progressBus.x = Phaser.Math.Clamp(this.toBar(this.bus.x), 370, 900);

    this.updateLights(dt, prevFront, front, gas);
    this.updateStops(dt, front, gas);

    if (this.phase === 'driving' && front >= this.level.finishX) this.finishRoute();
  }

  /** True when the helper should be braking: the bus would otherwise overshoot a stop point. */
  private autoBrakeNeeded(front: number): boolean {
    const d = brakingDistance(this.v) + 25;
    for (const L of this.signals) {
      const target = L.data.lineX - 45;
      if (L.model.state !== 'green' && front <= target + 4 && target - front <= d) return true;
    }
    for (const s of this.stops) {
      if (s.state !== 'waiting') continue;
      const target = s.data.zoneEnd - 70;
      if (front <= target + 4 && target - front <= d) return true;
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
    // A vehicle in front of us: keep behind it, gently.
    const lead = this.lane.leaderAhead(front);
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
        if (state === 'red') this.showBanner(t('redStop'), C.red, 1800, (g) => drawMiniLight(g, 56, 'red'));
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

  private updateStops(dt: number, front: number, gas: boolean): void {
    for (const s of this.stops) {
      if (s.state !== 'waiting') continue;
      const z = s.data.zoneEnd;
      if (!s.announced && z - front < 1000 && front < z) {
        s.announced = true;
        audio.dingDong();
        this.showBanner(t('busStop'), C.blue, 1500, (g) => drawStopSign(g, 0, 0, 26));
      }
      if (hasMissedStop(front, z)) {
        s.state = 'missed';
        this.tweens.add({ targets: s.arrow, alpha: 0, duration: 300 });
        for (const p of s.people) this.tweens.add({ targets: p, y: SIDEWALK_FEET_Y - 30, yoyo: true, repeat: 2, duration: 160 });
        this.mistake(t('missedStop'), POINTS.missedStop, this.bus.x);
        continue;
      }
      if (this.phase === 'driving' && isInStopZone(front, z) && this.v < 3 && !gas) {
        this.stillTime += dt;
        if (this.stillTime > 0.25) {
          this.stillTime = 0;
          void this.serveStop(s);
        }
      } else if (isInStopZone(front, z)) {
        this.stillTime = 0;
      }
    }
  }

  private finishRoute(): void {
    this.phase = 'finishing';
    this.lane.clear();
    this.gas.reset();
    this.brake.reset();
    audio.horn();
    const arrived = landmarkForLevel(this.level.level);
    this.showBanner(t(`lm_${arrived}` as TextKey), C.blue, 2400, (g) => {
      drawLandmark(g, arrived);
      g.setScale(0.7);
    });
    this.time.delayedCall(1300, () => {
      this.phase = 'ended';
      audio.stopEngine();
      this.cameras.main.fadeOut(400, 45, 42, 50);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        const result: DriveResult = {
          level: this.level.level,
          score: this.score.score,
          mistakes: this.score.mistakes,
          passengers: this.score.passengersMoved,
          health: Math.round(this.health),
        };
        this.scene.start('Result', result);
      });
    });
  }
}
