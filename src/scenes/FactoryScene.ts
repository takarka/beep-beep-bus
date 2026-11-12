import Phaser from 'phaser';
import { audio } from '../audio/AudioEngine';
import { BusView, drawHeadlight, drawWheel } from '../bus/BusView';
import {
  BODY_TYPES,
  BUS_COLORS,
  DECOR_TYPES,
  DEFAULT_DESIGN,
  DOOR_COUNTS,
  LIGHT_TYPES,
  MAX_NUMBER_DIGITS,
  WHEEL_TYPES,
  loadDesign,
  normalizeNumber,
  saveDesign,
  type BusDesign,
} from '../bus/design';
import { BODY_SIZE } from '../bus/geometry';
import { C, FONT, GAME_H, GAME_W } from '../config';
import { loadProgress } from '../core/progress';
import { t, type TextKey } from '../i18n';
import { Icons, drawStar } from '../ui/draw';
import { Button, confetti, label } from '../ui/widgets';
import { addAudioToggles } from './MenuScene';

type G = Phaser.GameObjects.Graphics;
type StepId = 'body' | 'doors' | 'wheels' | 'color' | 'lights' | 'decor' | 'number';

const STEPS: StepId[] = ['body', 'doors', 'wheels', 'color', 'lights', 'decor', 'number'];
const STAGE_X = GAME_W / 2;
const STAGE_Y = 500;
const BUS_SCALE = 0.78;
const PANEL_Y = 622;

/** Little pictograms for the step progress bar. */
function stepIcon(g: G, step: StepId, s: number): void {
  g.lineStyle(3, C.ink, 1);
  switch (step) {
    case 'body':
      g.fillStyle(C.yellow, 1);
      g.fillRoundedRect(-s * 0.4, -s * 0.24, s * 0.8, s * 0.4, { tl: 4, tr: 10, bl: 3, br: 3 });
      g.strokeRoundedRect(-s * 0.4, -s * 0.24, s * 0.8, s * 0.4, { tl: 4, tr: 10, bl: 3, br: 3 });
      g.fillStyle(C.ink, 1);
      g.fillCircle(-s * 0.2, s * 0.2, s * 0.09);
      g.fillCircle(s * 0.22, s * 0.2, s * 0.09);
      break;
    case 'doors':
      g.fillStyle(C.glass, 1);
      g.fillRect(-s * 0.2, -s * 0.34, s * 0.4, s * 0.68);
      g.strokeRect(-s * 0.2, -s * 0.34, s * 0.4, s * 0.68);
      g.lineBetween(0, -s * 0.34, 0, s * 0.34);
      break;
    case 'wheels':
      drawWheel(g, 'classic', s * 0.34);
      break;
    case 'color':
      [C.red, C.yellow, C.blue].forEach((c, i) => {
        g.fillStyle(c, 1);
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
        g.fillCircle(Math.cos(a) * s * 0.17, Math.sin(a) * s * 0.17, s * 0.17);
      });
      break;
    case 'lights':
      drawHeadlight(g, 'round', 0, 0, s * 0.028);
      break;
    case 'decor':
      drawStar(g, 0, 0, s * 0.34, C.orange, C.ink, 3);
      break;
    case 'number':
      g.fillStyle(C.cream, 1);
      g.fillRoundedRect(-s * 0.36, -s * 0.22, s * 0.72, s * 0.44, 6);
      g.strokeRoundedRect(-s * 0.36, -s * 0.22, s * 0.72, s * 0.44, 6);
      break;
  }
}

function drawFactory(scene: Phaser.Scene): void {
  const g = scene.add.graphics().setDepth(-10);
  // wall
  g.fillStyle(0xf3d9a4, 1);
  g.fillRect(0, 0, GAME_W, GAME_H);
  g.fillStyle(0xeacb8f, 1);
  for (let x = 0; x < GAME_W; x += 160) g.fillRect(x, 0, 80, 520);
  // big windows
  for (let i = 0; i < 4; i++) {
    const x = 90 + i * 300;
    g.fillStyle(C.skyTop, 1);
    g.fillRoundedRect(x, 150, 200, 190, { tl: 100, tr: 100, bl: 6, br: 6 });
    g.lineStyle(10, 0x8c6d4f, 1);
    g.strokeRoundedRect(x, 150, 200, 190, { tl: 100, tr: 100, bl: 6, br: 6 });
    g.lineStyle(6, 0x8c6d4f, 1);
    g.lineBetween(x + 100, 150, x + 100, 340);
    g.lineBetween(x, 260, x + 200, 260);
  }
  // roof beams + hanging lamps
  g.fillStyle(0x8c6d4f, 1);
  g.fillRect(0, 120, GAME_W, 14);
  for (let x = 200; x < GAME_W; x += 440) {
    g.lineStyle(4, C.ink, 1);
    g.lineBetween(x, 134, x, 160);
    g.fillStyle(C.red, 1);
    g.slice(x, 186, 30, Math.PI, 0, false);
    g.fillPath();
    g.fillStyle(0xfff3b0, 0.4);
    g.fillTriangle(x - 30, 186, x + 30, 186, x, 186);
  }
  // floor
  g.fillStyle(0x6d6875, 1);
  g.fillRect(0, 520, GAME_W, 200);
  // stage with hazard stripes
  g.fillStyle(0x4a4650, 1);
  g.fillRoundedRect(STAGE_X - 400, STAGE_Y - 6, 800, 34, 8);
  for (let x = STAGE_X - 396; x < STAGE_X + 390; x += 36) {
    g.fillStyle(C.yellow, 1);
    g.fillTriangle(x, STAGE_Y + 24, x + 18, STAGE_Y - 2, x + 30, STAGE_Y - 2);
    g.fillTriangle(x, STAGE_Y + 24, x + 12, STAGE_Y + 24, x + 30, STAGE_Y - 2);
  }
  g.lineStyle(5, C.ink, 1);
  g.strokeRoundedRect(STAGE_X - 400, STAGE_Y - 6, 800, 34, 8);
}

export class FactoryScene extends Phaser.Scene {
  private design!: BusDesign;
  private bus!: BusView;
  private stepIdx = 0;
  private panel!: Phaser.GameObjects.Container;
  private stepDots: Button[] = [];
  private stepTitle!: Phaser.GameObjects.Text;
  private backBtn!: Button;
  private nextBtn!: Button;
  private numberDisplay!: Phaser.GameObjects.Container;
  private numberText!: Phaser.GameObjects.Text;
  private optionButtons: Array<{ btn: Button; isSelected: () => boolean }> = [];
  private finished = false;

  constructor() {
    super('Factory');
  }

  create(): void {
    this.stepIdx = 0;
    this.finished = false;
    this.stepDots = [];
    this.design = loadDesign() ?? { ...DEFAULT_DESIGN };
    this.cameras.main.fadeIn(250, 45, 42, 50);

    drawFactory(this);

    this.bus = new BusView(this, STAGE_X, STAGE_Y, this.design);
    this.bus.setScale(BUS_SCALE);

    // Progress dots (tap to jump to any step)
    const dotGap = 92;
    const x0 = GAME_W / 2 - ((STEPS.length - 1) * dotGap) / 2;
    STEPS.forEach((step, i) => {
      const b = new Button(this, x0 + i * dotGap, 50, {
        r: 32,
        color: C.cream,
        icon: (g, s) => stepIcon(g, step, s * 1.4),
        onClick: () => this.showStep(i),
      });
      this.stepDots.push(b);
    });
    this.stepTitle = label(this, GAME_W / 2, 118, '', { size: 34 });

    new Button(this, 56, 52, { r: 34, color: C.red, icon: (g, s) => Icons.home(g, s), onClick: () => this.scene.start('Menu') });
    addAudioToggles(this, GAME_W - 56, 52);

    this.backBtn = new Button(this, 70, 360, { r: 50, color: C.orange, icon: (g, s) => Icons.arrowLeft(g, s), onClick: () => this.showStep(this.stepIdx - 1) });
    this.nextBtn = new Button(this, GAME_W - 70, 360, { r: 56, color: C.green, icon: (g, s) => Icons.arrowRight(g, s), onClick: () => this.next() });

    // Big number display (only on the "number" step)
    this.numberDisplay = this.add.container(GAME_W - 210, 250);
    const nbg = this.add.graphics();
    nbg.fillStyle(0x1f1c24, 1);
    nbg.fillRoundedRect(-110, -55, 220, 110, 18);
    nbg.lineStyle(6, C.ink, 1);
    nbg.strokeRoundedRect(-110, -55, 220, 110, 18);
    this.numberText = this.add
      .text(0, 2, '', { fontFamily: FONT, fontStyle: '800', fontSize: '76px', color: '#ffb703' })
      .setOrigin(0.5);
    this.numberDisplay.add([nbg, this.numberText]);

    this.panel = this.add.container(0, 0);
    this.showStep(0);
  }

  private next(): void {
    if (this.stepIdx < STEPS.length - 1) this.showStep(this.stepIdx + 1);
    else this.finish();
  }

  private showStep(i: number): void {
    if (this.finished || i < 0 || i >= STEPS.length) return;
    this.stepIdx = i;
    const step = STEPS[i]!;
    this.stepDots.forEach((d, j) => {
      d.setSelected(j === i);
      d.setColor(j < i ? C.green : j === i ? C.yellow : C.cream);
    });
    this.stepTitle.setText(t(`step_${step}` as TextKey));
    this.tweens.add({ targets: this.stepTitle, scale: { from: 0.6, to: 1 }, duration: 260, ease: 'Back.easeOut' });

    this.backBtn.setVisible(i > 0);
    const last = i === STEPS.length - 1;
    this.nextBtn.setIcon(last ? (g, s) => Icons.check(g, s) : (g, s) => Icons.arrowRight(g, s));
    this.tweens.killTweensOf(this.nextBtn);
    this.nextBtn.setScale(1);
    if (last) this.tweens.add({ targets: this.nextBtn, scale: 1.15, yoyo: true, repeat: -1, duration: 500 });

    this.numberDisplay.setVisible(step === 'number');
    this.numberText.setText(this.design.number);
    this.buildPanel(step);
  }

  private buildPanel(step: StepId): void {
    this.panel.removeAll(true);
    this.optionButtons = [];
    const bg = this.add.graphics();
    bg.fillStyle(C.cream, 0.95);
    bg.fillRoundedRect(130, PANEL_Y - 82, GAME_W - 260, 168, 26);
    bg.lineStyle(5, C.ink, 1);
    bg.strokeRoundedRect(130, PANEL_Y - 82, GAME_W - 260, 168, 26);
    this.panel.add(bg);

    const d = this.design;
    switch (step) {
      case 'body':
        this.cards(BODY_TYPES, (v) => d.body === v, (v) => this.set({ body: v }), (c, v) => this.miniBus(c, { ...d, body: v }));
        break;
      case 'doors':
        this.cards(DOOR_COUNTS, (v) => d.doors === v, (v) => this.set({ doors: v }), (c, v) => this.miniBus(c, { ...d, doors: v }));
        break;
      case 'wheels':
        this.cards(WHEEL_TYPES, (v) => d.wheels === v, (v) => this.set({ wheels: v }), (c, v) => {
          const g = this.add.graphics();
          drawWheel(g, v, 46);
          c.add(g);
        });
        break;
      case 'lights':
        this.cards(LIGHT_TYPES, (v) => d.lights === v, (v) => this.set({ lights: v }), (c, v) => {
          const g = this.add.graphics();
          g.fillStyle(d.color, 1);
          g.fillRoundedRect(-60, -44, 120, 88, 20);
          g.lineStyle(4, C.ink, 1);
          g.strokeRoundedRect(-60, -44, 120, 88, 20);
          drawHeadlight(g, v, 0, 0, 2.4);
          c.add(g);
        });
        break;
      case 'decor':
        this.cards(DECOR_TYPES, (v) => d.decor === v, (v) => this.set({ decor: v }), (c, v) => this.miniBus(c, { ...d, decor: v }));
        break;
      case 'color': {
        const gap = 112;
        const x0 = GAME_W / 2 - ((BUS_COLORS.length - 1) * gap) / 2;
        BUS_COLORS.forEach((color, i) => {
          const btn = new Button(this, x0 + i * gap, PANEL_Y, { r: 42, color, silent: true, onClick: () => this.set({ color }) });
          this.panel.add(btn);
          this.optionButtons.push({ btn, isSelected: () => this.design.color === color });
        });
        break;
      }
      case 'number':
        this.keypad();
        break;
    }
    this.refreshSelection();
  }

  /** Lays out up to 4 big option cards in the panel. */
  private cards<T>(
    values: readonly T[],
    isSel: (v: T) => boolean,
    onPick: (v: T) => void,
    render: (c: Phaser.GameObjects.Container, v: T) => void,
  ): void {
    const w = 218;
    const gap = 240;
    const x0 = GAME_W / 2 - ((values.length - 1) * gap) / 2;
    values.forEach((v, i) => {
      const btn = new Button(this, x0 + i * gap, PANEL_Y, { w, h: 138, color: 0xffffff, silent: true, onClick: () => onPick(v) });
      const content = this.add.container(0, 0);
      render(content, v);
      btn.add(content);
      this.panel.add(btn);
      this.optionButtons.push({ btn, isSelected: () => isSel(v) });
    });
  }

  private miniBus(c: Phaser.GameObjects.Container, design: BusDesign): void {
    const { L, H } = BODY_SIZE[design.body];
    const s = Math.min(196 / (L + 30), 118 / (H + 60));
    const bus = new BusView(this, 0, (H + 40) * s * 0.5, design);
    bus.setScale(s);
    c.add(bus);
  }

  private keypad(): void {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'del', 'dice'];
    const gap = 80;
    const x0 = GAME_W / 2 - ((keys.length - 1) * gap) / 2;
    keys.forEach((k, i) => {
      const isDigit = /\d/.test(k);
      const btn = new Button(this, x0 + i * gap, PANEL_Y, {
        w: 68,
        h: 96,
        color: isDigit ? C.blue : k === 'del' ? C.orange : C.purple,
        text: isDigit ? k : undefined,
        textSize: 44,
        icon: k === 'del' ? (g, s) => Icons.backspace(g, s) : k === 'dice' ? (g, s) => Icons.dice(g, s) : undefined,
        silent: true,
        onClick: () => this.pressKey(k),
      });
      this.panel.add(btn);
    });
  }

  private pressKey(k: string): void {
    let n = this.design.number;
    if (k === 'del') n = n.slice(0, -1);
    else if (k === 'dice') n = String(Phaser.Math.Between(1, 999));
    else n = n.length >= MAX_NUMBER_DIGITS ? k : n === '0' ? k : n + k;
    audio.pop();
    this.design = { ...this.design, number: n };
    this.bus.setDesign(this.design);
    this.numberText.setText(n);
    this.tweens.add({ targets: this.numberText, scale: { from: 1.3, to: 1 }, duration: 200 });
    if (n) saveDesign(this.design);
  }

  private set(patch: Partial<BusDesign>): void {
    this.design = { ...this.design, ...patch };
    saveDesign(this.design);
    this.bus.setDesign(this.design);
    audio.select();
    this.sparkle();
    this.tweens.add({ targets: this.bus, scaleX: BUS_SCALE * 1.06, scaleY: BUS_SCALE * 0.94, yoyo: true, duration: 120, ease: 'Sine.easeOut' });
    this.refreshSelection();
  }

  private refreshSelection(): void {
    for (const o of this.optionButtons) o.btn.setSelected(o.isSelected());
  }

  private sparkle(): void {
    const em = this.add.particles(STAGE_X, STAGE_Y - 120, 'dot', {
      speed: { min: 120, max: 380 },
      lifespan: 600,
      scale: { start: 0.9, end: 0 },
      tint: [C.yellow, 0xffffff, C.orange],
      emitting: false,
    });
    em.explode(24);
    this.time.delayedCall(800, () => em.destroy());
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.design = { ...this.design, number: normalizeNumber(this.design.number) };
    saveDesign(this.design);
    this.bus.setDesign(this.design);
    this.panel.setVisible(false);
    this.numberDisplay.setVisible(false);
    this.backBtn.setVisible(false);
    this.nextBtn.setVisible(false);

    audio.fanfare();
    confetti(this, GAME_W / 2, GAME_H, 90);
    const msg = label(this, GAME_W / 2, 300, t('busReady'), { size: 72, color: C.yellow, strokeThickness: 12 });
    this.tweens.add({ targets: msg, scale: { from: 0, to: 1 }, duration: 500, ease: 'Back.easeOut' });

    this.time.delayedCall(1300, () => {
      audio.horn();
      this.tweens.add({ targets: this.bus, x: GAME_W + 400, duration: 1500, ease: 'Cubic.easeIn' });
      this.events.on('update', (_t: number, dt: number) => this.bus.roll(dt * 0.6, dt / 1000, 0.8));
    });
    this.time.delayedCall(2700, () => {
      const go = new Button(this, GAME_W / 2, 560, {
        w: 360,
        h: 110,
        color: C.green,
        text: t('go'),
        textSize: 48,
        onClick: () => this.scene.start('Drive', { level: loadProgress().level }),
      });
      this.tweens.add({ targets: go, scale: { from: 0, to: 1 }, duration: 400, ease: 'Back.easeOut' });
      this.tweens.add({ targets: go, angle: { from: -2, to: 2 }, yoyo: true, repeat: -1, duration: 400, delay: 400 });
    });
  }
}

