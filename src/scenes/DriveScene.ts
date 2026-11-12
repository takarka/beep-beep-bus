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
import { t } from '../i18n';
import { Icons, drawMiniLight, drawStar, drawStopSign } from '../ui/draw';
import { GROUND_Y, PASSENGER_VARIANTS, SIDEWALK_FEET_Y, STREET_Y } from '../ui/textures';
import { createScenery } from '../ui/scenery';
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
}

type Phase = 'driving' | 'serving' | 'finishing' | 'ended';

export interface DriveResult {
  level: number;
  score: number;
  mistakes: number;
  passengers: number;
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
    this.bus.setPassengers(0);

    const stopsTotal = this.level.items.filter((i) => i.kind === 'stop').length;
    let stopIdx = 0;
    for (const item of this.level.items) {
      if (item.kind === 'light') this.createLight(item);
      else this.createStop(item, ++stopIdx === stopsTotal);
    }
    this.createFinish();
    this.createHud();
    this.createControls();

    audio.startEngine();
    const rain = env.precip && precipKind(env) === 'rain';
    if (rain) audio.startRain();
    this.events.once('shutdown', () => {
      audio.stopEngine();
      audio.stopRain();
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
    // zebra crossing
    road.fillStyle(C.roadLine, 0.9);
    for (let sx = x + 26; sx < x + 170; sx += 30) {
      road.fillPoints(
        [
          new Phaser.Math.Vector2(sx + 8, ROAD_TOP),
          new Phaser.Math.Vector2(sx + 24, ROAD_TOP),
          new Phaser.Math.Vector2(sx + 12, ROAD_BOTTOM),
          new Phaser.Math.Vector2(sx - 4, ROAD_BOTTOM),
        ],
        true,
      );
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

  private createFinish(): void {
    const x = this.level.finishX;
    const g = this.add.graphics().setDepth(-3);
    // depot building on the far side
    g.fillStyle(0xd4a5a5, 1);
    g.lineStyle(5, C.ink, 1);
    g.fillRect(x - 40, 210, 520, STREET_Y + 44 - 210);
    g.strokeRect(x - 40, 210, 520, STREET_Y + 44 - 210);
    g.fillStyle(C.red, 1);
    g.fillRect(x - 60, 190, 560, 36);
    g.strokeRect(x - 60, 190, 560, 36);
    g.fillStyle(0x3b3640, 1);
    g.fillRoundedRect(x + 20, 270, 200, STREET_Y + 44 - 270, { tl: 90, tr: 90, bl: 0, br: 0 });
    g.fillRoundedRect(x + 250, 270, 200, STREET_Y + 44 - 270, { tl: 90, tr: 90, bl: 0, br: 0 });
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

    if (gas && !this.gasTouched) {
      this.gasTouched = true;
      this.startHint?.destroy();
      this.startHint = null;
    }

    const max = this.level.maxSpeed;
    if (this.phase === 'driving') {
      if (brake) this.v -= PHYSICS.brake * dt;
      else if (gas) this.v += PHYSICS.accel * dt;
      else this.v -= PHYSICS.coast * dt;
    } else if (this.phase === 'finishing') {
      this.v = Math.max(this.v, 260);
    } else {
      this.v = 0;
    }
    this.v = Phaser.Math.Clamp(this.v, 0, max);

    const prevFront = this.bus.frontWorldX();
    const dx = this.v * dt;
    this.bus.x += dx;
    const front = this.bus.frontWorldX();
    this.bus.roll(dx, dt, this.v / max);
    audio.setEngine(this.v / max);

    // Camera + parallax
    const cam = this.cameras.main;
    cam.scrollX = Phaser.Math.Clamp(this.bus.x - this.camLead, 0, this.level.length - GAME_W);
    this.backdrop.update(cam.scrollX, dt);

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
      const hold = L.model.state === 'yellow' && front < lineX && !canStopBefore(front, lineX, this.v);
      if (!hold && L.model.update(dt)) {
        this.drawLamps(L);
        if (L.model.state === 'green' && L.waitedAtRed && front < lineX) {
          audio.select();
          this.showBanner(t('greenGo'), C.green, 1300, (g) => drawMiniLight(g, 56, 'green'));
          L.waitedAtRed = false;
        }
      }
      const state = L.model.state;
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
    this.gas.reset();
    this.brake.reset();
    audio.horn();
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
        };
        this.scene.start('Result', result);
      });
    });
  }
}
