import Phaser from 'phaser';
import { C, FONT, hex, luminance, shade } from '../config';
import { drawStar } from '../ui/draw';
import { mulberry32 } from '../core/rng';
import { MAX_HEALTH } from '../core/rules';
import type { BusDesign, LightType, WheelType } from './design';
import { computeLayout, type BusLayout } from './geometry';
import { planParts, type Part } from './parts';

type G = Phaser.GameObjects.Graphics;

const SKIN = [0xf6d5b8, 0xe8b894, 0xc68e64, 0x8d5a3b];
const HAIR = [0x2d2a32, 0x6b3e26, 0xc58b3c, 0x9c4a2f, 0x4a4a4a];

/** Draws one wheel centred at (0, 0). Rotating the graphics spins the wheel. */
export function drawWheel(g: G, type: WheelType, r: number): void {
  g.lineStyle(4, C.ink, 1);
  g.fillStyle(C.tire, 1);
  g.fillCircle(0, 0, r);
  if (type === 'big') {
    g.lineStyle(5, 0x55505c, 1);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.lineBetween(Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74, Math.cos(a) * r * 0.94, Math.sin(a) * r * 0.94);
    }
  }
  if (type === 'sport') {
    g.fillStyle(C.red, 1);
    g.fillCircle(0, 0, r * 0.66);
    g.fillStyle(C.ink, 1);
    g.fillCircle(0, 0, r * 0.5);
    g.lineStyle(r * 0.18, C.red, 1);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.lineBetween(0, 0, Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
    }
    g.fillStyle(C.metal, 1);
    g.fillCircle(0, 0, r * 0.16);
    return;
  }
  if (type === 'retro') {
    g.fillStyle(C.cream, 1);
    g.fillCircle(0, 0, r * 0.78);
    g.fillStyle(C.tire, 1);
    g.fillCircle(0, 0, r * 0.6);
  }
  g.fillStyle(type === 'big' ? C.yellow : C.metal, 1);
  g.fillCircle(0, 0, r * 0.52);
  g.lineStyle(3, C.ink, 1);
  g.strokeCircle(0, 0, r * 0.52);
  g.fillStyle(C.ink, 1);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.fillCircle(Math.cos(a) * r * 0.32, Math.sin(a) * r * 0.32, r * 0.07);
  }
  g.fillStyle(0xffffff, 0.8);
  g.fillCircle(-r * 0.12, -r * 0.12, r * 0.08);
}

/** Draws one headlight centred at (x, y); `s` scales it (used big in the factory). */
export function drawHeadlight(g: G, type: LightType, x: number, y: number, s = 1): void {
  g.lineStyle(3 * Math.max(1, s * 0.7), C.ink, 1);
  const lamp = 0xfff3b0;
  switch (type) {
    case 'round':
      g.fillStyle(lamp, 1);
      g.fillCircle(x, y, 12 * s);
      g.strokeCircle(x, y, 12 * s);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(x - 4 * s, y - 4 * s, 4 * s);
      break;
    case 'square':
      g.fillStyle(lamp, 1);
      g.fillRoundedRect(x - 12 * s, y - 10 * s, 24 * s, 20 * s, 4 * s);
      g.strokeRoundedRect(x - 12 * s, y - 10 * s, 24 * s, 20 * s, 4 * s);
      g.fillStyle(0xffffff, 1);
      g.fillRect(x - 8 * s, y - 6 * s, 6 * s, 4 * s);
      break;
    case 'eyes':
      g.fillStyle(0xffffff, 1);
      g.fillEllipse(x, y, 26 * s, 30 * s);
      g.strokeEllipse(x, y, 26 * s, 30 * s);
      g.fillStyle(C.ink, 1);
      g.fillCircle(x + 4 * s, y + 2 * s, 7 * s);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(x + 6 * s, y - 1 * s, 2.5 * s);
      break;
    case 'star':
      drawStar(g, x, y, 15 * s, C.yellow, C.ink, 3 * Math.max(1, s * 0.7));
      break;
  }
}

/**
 * A bus drawn entirely from vector shapes, built from a BusDesign.
 * Origin: middle of the bus at road level. Faces right.
 */
export class BusView extends Phaser.GameObjects.Container {
  design!: BusDesign;
  layout!: BusLayout;
  private bodyC!: Phaser.GameObjects.Container;
  private headsG!: G;
  private wheels: G[] = [];
  private leaves: G[] = [];
  private passengers = 0;
  private bobT = 0;
  private beamOn = false;
  private joltTween: Phaser.Tweens.TweenChain | null = null;
  private damageG: G | null = null;
  private reverseG: G | null = null;
  private reverseOn = false;
  /** 0 = like new, 1 = wrecked. */
  private damage = 0;
  private parts: readonly Part[] = [];
  private hopY = 0;
  private tiltA = 0;
  private blinkerG: G | null = null;
  private blinkerKey = -1;
  private wiperG: G | null = null;
  private wiperTween: Phaser.Tweens.Tween | null = null;
  private wipersOn = false;

  constructor(scene: Phaser.Scene, x: number, y: number, design: BusDesign) {
    super(scene, x, y);
    scene.add.existing(this);
    this.setDesign(design);
  }

  setDesign(design: BusDesign): void {
    this.design = { ...design };
    this.removeAll(true);
    this.wheels = [];
    this.leaves = [];
    this.blinkerKey = -1;
    this.wiperTween?.stop();
    this.wiperTween = null;
    this.wiperG = null;
    this.build();
    this.setPassengers(this.passengers);
    if (this.wipersOn) this.applyWipers(true);
  }

  /** How battered the bus looks: 0 = new … 1 = wrecked. It is shown as concrete broken parts (see `planParts`). */
  setDamage(amount: number): void {
    this.damage = Math.min(Math.max(amount, 0), 1);
    this.setParts(planParts(this.damage * MAX_HEALTH, this.layout));
  }

  /** Shows exactly these parts as broken (the depot passes what is still left to fix). */
  setParts(parts: readonly Part[]): void {
    this.parts = parts;
    this.drawDamage();
  }

  private drawDamage(): void {
    const g = this.damageG;
    if (!g) return;
    g.clear();
    for (const part of this.parts) this.drawPart(g, part);
  }

  private drawPart(g: G, part: Part): void {
    const L = this.layout;
    const at = part;
    const rng = mulberry32((part.index + 3) * 104729 + part.kind.charCodeAt(0));
    switch (part.kind) {
      case 'scratch': {
        g.lineStyle(3, C.ink, 0.5);
        for (let k = 0; k < 3; k++) {
          const x = at.x + k * 9 - 9;
          const y = at.y + rng() * 8;
          g.lineBetween(x, y, x + 16 + rng() * 22, y - 5 - rng() * 12);
        }
        break;
      }
      case 'dent': {
        g.fillStyle(0x000000, 0.26);
        g.fillEllipse(at.x, at.y, 40 + rng() * 26, 20 + rng() * 12);
        g.lineStyle(2, 0xffffff, 0.4);
        g.beginPath();
        g.arc(at.x, at.y, 14 + rng() * 8, Math.PI * 1.1, Math.PI * 1.7, false);
        g.strokePath();
        break;
      }
      case 'window': {
        g.lineStyle(2.5, C.ink, 0.8);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + rng() * 0.5;
          const len = 14 + rng() * 18;
          g.lineBetween(at.x, at.y, at.x + Math.cos(a) * len, at.y + Math.sin(a) * len * 0.7);
        }
        g.lineStyle(1.5, C.ink, 0.6);
        g.strokeCircle(at.x, at.y, 8 + rng() * 5);
        break;
      }
      case 'windshield': {
        const s = L.windshield;
        g.lineStyle(2.5, C.ink, 0.85);
        g.lineBetween(s.x + 2, s.y + 6, s.x + s.w - 2, s.y + s.h * 0.6);
        g.lineBetween(s.x + s.w - 2, s.y + 10, s.x + 3, s.y + s.h * 0.8);
        break;
      }
      case 'soot': {
        g.fillStyle(0x000000, 0.3);
        g.fillEllipse(at.x, at.y, 70, 40);
        g.fillEllipse(at.x - 56, at.y - 10, 50, 26);
        break;
      }
      case 'headlight': {
        g.fillStyle(0x2d2a32, 0.8);
        g.fillCircle(at.x, at.y, 13);
        g.lineStyle(2.5, 0xffffff, 0.85);
        g.lineBetween(at.x - 9, at.y - 8, at.x + 9, at.y + 9);
        g.lineBetween(at.x + 8, at.y - 9, at.x - 8, at.y + 8);
        break;
      }
      case 'bumper': {
        g.fillStyle(0x4a4650, 1);
        g.lineStyle(3, C.ink, 1);
        g.fillPoints([new Phaser.Math.Vector2(L.frontX - 16, L.bottom - 8), new Phaser.Math.Vector2(L.frontX + 8, L.bottom - 2), new Phaser.Math.Vector2(L.frontX + 4, L.bottom + 8), new Phaser.Math.Vector2(L.frontX - 20, L.bottom + 1)], true);
        break;
      }
      case 'wheel': {
        // a flat tyre: a dark sagging patch at the bottom and a puncture star
        const r = L.wheelR;
        g.fillStyle(0x1b1920, 0.85);
        g.fillEllipse(at.x, -r * 0.18, r * 1.7, r * 0.5);
        g.lineStyle(3, C.yellow, 1);
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI + 0.4;
          g.lineBetween(at.x - Math.cos(a) * 9, -r * 0.62 - Math.sin(a) * 9, at.x + Math.cos(a) * 9, -r * 0.62 + Math.sin(a) * 9);
        }
        break;
      }
    }
  }

  /** White reversing lights at the back (they glow when the bus drives backwards). */
  setReverse(on: boolean): void {
    if (on === this.reverseOn) return;
    this.reverseOn = on;
    this.drawReverse();
  }

  private drawReverse(): void {
    const g = this.reverseG;
    if (!g) return;
    g.clear();
    if (!this.reverseOn) return;
    const L = this.layout;
    const x = L.taillight.x - 2;
    const y = L.taillight.y + 14;
    g.fillStyle(0xffffff, 0.22);
    g.fillTriangle(x - 4, y - 8, x - 4, y + 12, x - 120, y + 26);
    g.fillStyle(0xffffff, 1);
    g.lineStyle(2, C.ink, 1);
    g.fillRoundedRect(x - 6, y - 6, 10, 14, 3);
    g.strokeRoundedRect(x - 6, y - 6, 10, 14, 3);
  }

  /** Where a broken part is on screen (for tapping it). */
  partWorld(part: Part): { x: number; y: number } {
    return { x: this.x + part.x * this.scaleX, y: this.y + part.y * this.scaleY };
  }

  /** Positions the bus on the road, composing its lane height & steering tilt with any speed-bump jolt. */
  setRoadPose(y: number, steerAngle = 0): void {
    this.setY(y - this.hopY);
    this.setAngle(steerAngle + this.tiltA);
  }

  /** Flashing amber turn signals (front and rear) while changing lanes. */
  setBlinker(on: boolean, timeMs: number): void {
    const g = this.blinkerG;
    if (!g) return;
    const lit = on && Math.floor(timeMs / 220) % 2 === 0;
    const key = on ? (lit ? 2 : 1) : 0;
    if (key === this.blinkerKey) return;
    this.blinkerKey = key;
    g.clear();
    if (!lit) return;
    const L = this.layout;
    const pts: Array<[number, number]> = [
      [L.frontX - 10, L.headlight.y - 20],
      [L.backX + 4, L.taillight.y - 18],
    ];
    for (const [bx, by] of pts) {
      g.fillStyle(0xffb703, 0.38);
      g.fillCircle(bx, by, 18);
      g.fillStyle(0xffb703, 1);
      g.lineStyle(3, C.ink, 1);
      g.fillRoundedRect(bx - 6, by - 5, 12, 10, 4);
      g.strokeRoundedRect(bx - 6, by - 5, 12, 10, 4);
    }
  }

  /** Shaken by a speed bump: the front lifts, then the rear, then the bus settles. `power` is 0..1. */
  jolt(power: number): void {
    if (this.joltTween) {
      this.joltTween.stop();
      this.hopY = 0;
      this.tiltA = 0;
    }
    const hop = 5 + 24 * power;
    const tilt = 1.2 + 3.4 * power;
    this.joltTween = this.scene.tweens.chain({
      targets: this,
      tweens: [
        { hopY: hop * 0.5, tiltA: -tilt, duration: 90, ease: 'Quad.easeOut' },
        { hopY: hop, tiltA: tilt * 0.8, duration: 110 + 60 * power, ease: 'Sine.easeInOut' },
        { hopY: 0, tiltA: 0, duration: 180 + 140 * power, ease: 'Bounce.easeOut' },
      ],
    });
    this.joltTween.once('complete', () => {
      this.joltTween = null;
    });
  }

  /** Night driving: the headlights throw a glowing beam down the road. */
  setNight(on: boolean): void {
    if (on === this.beamOn) return;
    this.beamOn = on;
    this.setDesign(this.design);
  }

  /** Rain/snow: animated windshield wiper sweeping back and forth. */
  setWipers(on: boolean): void {
    if (on === this.wipersOn) return;
    this.wipersOn = on;
    this.applyWipers(on);
  }

  private applyWipers(on: boolean): void {
    this.wiperTween?.stop();
    this.wiperTween = null;
    if (!on) {
      this.wiperG?.setVisible(false);
      return;
    }
    if (!this.wiperG) {
      const ws = this.layout.windshield;
      const g = this.scene.add.graphics({ x: ws.x + ws.w * 0.5, y: ws.y + ws.h - 4 });
      g.lineStyle(4, C.ink, 1);
      g.lineBetween(0, 0, 2, -ws.h * 0.72);
      g.fillStyle(C.ink, 1);
      g.fillCircle(0, 0, 4);
      this.add(g);
      this.wiperG = g;
    }
    this.wiperG.setVisible(true).setAngle(-12);
    this.wiperTween = this.scene.tweens.add({
      targets: this.wiperG,
      angle: 32,
      yoyo: true,
      repeat: -1,
      duration: 520,
      ease: 'Sine.easeInOut',
    });
  }

  /** World x positions of the door centres (for passengers to walk to). */
  doorWorldXs(): number[] {
    return this.layout.doors.map((d) => this.x + (d.x + d.w / 2) * this.scaleX);
  }

  frontWorldX(): number {
    return this.x + this.layout.frontX * this.scaleX;
  }

  lengthWorld(): number {
    return (this.layout.frontX - this.layout.backX) * this.scaleX;
  }

  setPassengers(n: number): void {
    this.passengers = n;
    const g = this.headsG;
    g.clear();
    const wins = this.layout.windows;
    const count = Math.min(n, wins.length);
    for (let i = 0; i < count; i++) {
      // Spread riders around the bus in a fixed, pleasant-looking order.
      const w = wins[(i * 5 + 2) % wins.length]!;
      const cx = w.x + w.w / 2 + ((i % 3) - 1) * 6;
      const cy = w.y + w.h - 12;
      const r = Math.min(14, w.w * 0.22);
      g.fillStyle(SKIN[i % SKIN.length]!, 1);
      g.fillCircle(cx, cy, r);
      g.fillStyle(HAIR[(i * 3) % HAIR.length]!, 1);
      g.slice(cx, cy, r, Math.PI, 0, false);
      g.fillPath();
      g.fillStyle(C.ink, 1);
      g.fillCircle(cx + r * 0.35, cy + 2, 2);
    }
  }

  /** Spin wheels and bounce gently according to distance travelled. */
  roll(dx: number, dt: number, speed01: number): void {
    const r = this.layout.wheelR * this.scaleX;
    for (const w of this.wheels) w.rotation += dx / r;
    this.bobT += dt * (6 + speed01 * 10);
    this.bodyC.y = speed01 > 0.02 ? Math.sin(this.bobT) * (0.8 + speed01 * 1.6) : 0;
  }

  openDoors(): Promise<void> {
    return this.tweenDoors(0.14, 380);
  }

  closeDoors(): Promise<void> {
    return this.tweenDoors(1, 320);
  }

  private tweenDoors(scaleX: number, duration: number): Promise<void> {
    return new Promise((resolve) => {
      if (this.leaves.length === 0) return resolve();
      this.scene.tweens.add({
        targets: this.leaves,
        scaleX,
        duration,
        ease: 'Sine.easeInOut',
        onComplete: () => resolve(),
      });
    });
  }

  private build(): void {
    const d = this.design;
    const L = (this.layout = computeLayout(d));
    const scene = this.scene;
    const ink = C.ink;
    const body = d.color;
    const bodyDark = shade(body, -0.22);
    const accent = luminance(body) > 0.68 ? C.red : C.cream;

    // Ground shadow
    const shadow = new Phaser.GameObjects.Graphics(scene);
    shadow.fillStyle(C.shadow, 0.18);
    shadow.fillEllipse(0, 2, L.frontX - L.backX + 40, 22);
    this.add(shadow);

    this.bodyC = new Phaser.GameObjects.Container(scene, 0, 0);
    this.add(this.bodyC);

    const g = new Phaser.GameObjects.Graphics(scene);
    this.bodyC.add(g);
    const H = L.bottom - L.top;
    const boxW = L.boxFrontX - L.backX;
    const van = d.body === 'van';

    // Hood (school bus)
    if (L.hood) {
      g.fillStyle(body, 1);
      g.lineStyle(5, ink, 1);
      const hw = L.hood.x1 - L.hood.x0 + 12;
      g.fillRoundedRect(L.hood.x0 - 12, L.hood.top, hw, L.bottom - L.hood.top, { tl: 4, tr: 26, bl: 4, br: 12 });
      g.strokeRoundedRect(L.hood.x0 - 12, L.hood.top, hw, L.bottom - L.hood.top, { tl: 4, tr: 26, bl: 4, br: 12 });
      g.lineStyle(3, bodyDark, 1);
      for (let i = 0; i < 3; i++) {
        const gx = L.hood.x0 + 14 + i * 12;
        g.lineBetween(gx, L.hood.top + 14, gx, L.hood.top + 40);
      }
    }

    // Roof unit (retro detail)
    if (!van) {
      g.fillStyle(shade(body, -0.1), 1);
      g.lineStyle(4, ink, 1);
      const roofX = L.joint ? L.joint.x1 + 60 : L.backX + boxW * 0.3;
      const roofW = L.joint ? 140 : boxW * 0.28;
      g.fillRoundedRect(roofX, L.top - 14, roofW, 18, { tl: 8, tr: 8, bl: 2, br: 2 });
      g.strokeRoundedRect(roofX, L.top - 14, roofW, 18, { tl: 8, tr: 8, bl: 2, br: 2 });
    }

    // Main body
    const radii = { tl: 18, tr: L.hood ? 14 : 44, bl: 10, br: L.hood ? 4 : 14 };
    const winBottom = Math.max(...L.windows.map((w) => w.y + w.h));
    // The van is two-tone: the paint you chose below the windows, a cream roof and nose above.
    const belt = winBottom + 10;
    const vanRadii = { tl: 46, tr: 36, bl: 14, br: 18 };
    if (van) {
      g.fillStyle(0xfff6e0, 1);
      g.fillRoundedRect(L.backX, L.top, boxW, H, vanRadii);
      g.fillStyle(body, 1);
      g.fillRoundedRect(L.backX, belt, boxW, L.bottom - belt, { tl: 0, tr: 0, bl: 14, br: 18 });
      // white wedge of the nose (the "V") at the front, a darker waist line and a chrome strip
      g.fillStyle(0xfff6e0, 1);
      g.fillPoints([new Phaser.Math.Vector2(L.frontX - 44, belt), new Phaser.Math.Vector2(L.frontX, belt), new Phaser.Math.Vector2(L.frontX, L.bottom - 10), new Phaser.Math.Vector2(L.frontX - 16, L.bottom - 10)], true);
      g.lineStyle(3, bodyDark, 1);
      g.lineBetween(L.backX + 4, belt, L.frontX - 44, belt);
      g.lineStyle(3, 0xe8edf2, 1);
      g.lineBetween(L.backX + 4, belt + 4, L.frontX - 40, belt + 4);
      // engine louvres at the back
      g.lineStyle(3, bodyDark, 1);
      for (let i = 0; i < 4; i++) g.lineBetween(L.backX + 14 + i * 7, belt + 12, L.backX + 14 + i * 7, belt + 28);
    } else {
      g.fillStyle(body, 1);
      g.fillRoundedRect(L.backX, L.top, boxW, H, radii);
      // Darker skirt along the bottom
      g.fillStyle(bodyDark, 1);
      g.fillRoundedRect(L.backX + 2, L.bottom - 22, boxW - 4, 20, { tl: 2, tr: 2, bl: 9, br: L.hood ? 3 : 12 });
    }

    // Decor (drawn before windows/doors so they sit on top)
    const bandY = van ? belt + 4 : winBottom + 10;
    const bandH = van ? L.bottom - 8 - bandY : L.bottom - 26 - bandY;
    switch (d.decor) {
      case 'stripe':
        g.fillStyle(accent, 1);
        if (van) g.fillRect(L.backX + 3, belt + 12, boxW - 6, 7);
        else {
          g.fillRect(L.backX + 3, bandY + bandH * 0.25, boxW - 6, Math.max(8, bandH * 0.4));
          g.fillRect(L.backX + 3, L.top + 34 - 7, boxW - 6, 5);
        }
        break;
      case 'dots':
        g.fillStyle(accent, 0.9);
        for (let x = L.backX + 30; x < L.boxFrontX - 24; x += 34)
          g.fillCircle(x, bandY + bandH / 2 + ((x / 34) % 2 ? -4 : 4), Math.min(van ? 7 : 9, bandH * 0.32));
        break;
      case 'stars':
        for (let x = L.backX + 40; x < L.boxFrontX - 30; x += van ? 56 : 70)
          drawStar(g, x, bandY + bandH / 2, Math.min(van ? 11 : 15, bandH * 0.5), accent, null);
        break;
      case 'none':
        break;
    }

    // Body outline on top of decor
    g.lineStyle(5, ink, 1);
    g.strokeRoundedRect(L.backX, L.top, boxW, H, van ? vanRadii : radii);
    if (van) {
      // a round badge on the nose (a plain one: no brand)
      g.fillStyle(0xdfe3e8, 1);
      g.lineStyle(3, ink, 1);
      g.fillCircle(L.frontX - 14, belt + 18, 8);
      g.strokeCircle(L.frontX - 14, belt + 18, 8);
    }

    // Accordion joint of the articulated bus: dark folded bellows between the two sections.
    if (L.joint) {
      const j = L.joint;
      const jt = L.top + 3;
      const jb = L.bottom - 3;
      g.fillStyle(0x24212a, 1);
      g.fillRoundedRect(j.x0, jt, j.x1 - j.x0, jb - jt, 8);
      g.lineStyle(4, 0x58525f, 1);
      for (let x = j.x0 + 8; x < j.x1 - 4; x += 8) g.lineBetween(x, jt + 8, x, jb - 8);
      g.lineStyle(5, ink, 1);
      g.strokeRoundedRect(j.x0, jt, j.x1 - j.x0, jb - jt, 8);
      // rubber "roof" cap over the bellows
      g.fillStyle(0x3b3640, 1);
      g.fillRoundedRect(j.x0 - 4, L.top - 6, j.x1 - j.x0 + 8, 16, 6);
      g.strokeRoundedRect(j.x0 - 4, L.top - 6, j.x1 - j.x0 + 8, 16, 6);
    }

    // Windows (glass)
    for (const w of L.windows) {
      g.fillStyle(C.glass, 1);
      g.fillRoundedRect(w.x, w.y, w.w, w.h, van ? 12 : 8);
    }
    g.fillStyle(C.glass, 1);
    g.fillRoundedRect(L.windshield.x, L.windshield.y, L.windshield.w, L.windshield.h, { tl: 4, tr: 12, bl: 4, br: 6 });

    // Passenger heads sit between glass and frames
    this.headsG = new Phaser.GameObjects.Graphics(scene);
    this.bodyC.add(this.headsG);

    const g2 = new Phaser.GameObjects.Graphics(scene);
    this.bodyC.add(g2);
    g2.lineStyle(4, ink, 1);
    for (const w of L.windows) {
      g2.strokeRoundedRect(w.x, w.y, w.w, w.h, van ? 12 : 8);
      g2.lineStyle(4, 0xffffff, 0.55);
      g2.lineBetween(w.x + 8, w.y + w.h * 0.55, w.x + w.w * 0.45, w.y + 6);
      g2.lineStyle(4, ink, 1);
    }
    g2.strokeRoundedRect(L.windshield.x, L.windshield.y, L.windshield.w, L.windshield.h, { tl: 4, tr: 12, bl: 4, br: 6 });

    // Doorways (dark interior behind the door leaves)
    for (const door of L.doors) {
      g2.fillStyle(C.doorway, 1);
      g2.fillRect(door.x, door.y, door.w, door.h);
      g2.fillStyle(shade(C.doorway, 0.25), 1);
      g2.fillRect(door.x + 4, door.y + door.h - 10, door.w - 8, 8);
    }

    // Route board with the bus number (LED style)
    const rs = L.routeSign;
    g2.fillStyle(0x1f1c24, 1);
    g2.fillRoundedRect(rs.x, rs.y, rs.w, rs.h, 5);
    g2.lineStyle(3, ink, 1);
    g2.strokeRoundedRect(rs.x, rs.y, rs.w, rs.h, 5);
    const routeText = new Phaser.GameObjects.Text(scene, rs.x + rs.w / 2, rs.y + rs.h / 2 + 1, d.number, {
      fontFamily: FONT,
      fontStyle: '800',
      fontSize: `${Math.round(rs.h * 0.8)}px`,
      color: '#ffb703',
    }).setOrigin(0.5);

    // Big painted number at the back
    const nb = L.numberBadge;
    g2.fillStyle(C.cream, 1);
    g2.lineStyle(4, ink, 1);
    g2.fillCircle(nb.x, nb.y, nb.r);
    g2.strokeCircle(nb.x, nb.y, nb.r);
    const numText = new Phaser.GameObjects.Text(scene, nb.x, nb.y + 1, d.number, {
      fontFamily: FONT,
      fontStyle: '800',
      fontSize: `${Math.round(nb.r * (d.number.length > 2 ? 0.8 : 1))}px`,
      color: hex(ink),
    }).setOrigin(0.5);

    this.bodyC.add([routeText, numText]);

    // Door leaves (two per door, fold to the sides when opening)
    for (const door of L.doors) {
      const half = door.w / 2;
      for (const side of [-1, 1] as const) {
        const leaf = new Phaser.GameObjects.Graphics(scene);
        leaf.x = side < 0 ? door.x : door.x + door.w;
        leaf.y = door.y;
        const x0 = side < 0 ? 0 : -half;
        leaf.lineStyle(3, ink, 1);
        if (van) {
          // two-tone like the rest of the van: cream above the waist line, the chosen colour below
          const bl = belt - door.y;
          leaf.fillStyle(0xfff6e0, 1);
          leaf.fillRect(x0, 0, half, door.h);
          leaf.fillStyle(shade(body, -0.05), 1);
          leaf.fillRect(x0, bl, half, door.h - bl);
        } else {
          leaf.fillStyle(shade(body, -0.08), 1);
          leaf.fillRect(x0, 0, half, door.h);
        }
        leaf.strokeRect(x0, 0, half, door.h);
        leaf.fillStyle(C.glass, 1);
        leaf.fillRoundedRect(x0 + 5, 6, half - 10, door.h * 0.62, 4);
        leaf.strokeRoundedRect(x0 + 5, 6, half - 10, door.h * 0.62, 4);
        this.leaves.push(leaf);
        this.bodyC.add(leaf);
      }
    }

    // Lights and bumpers
    const g3 = new Phaser.GameObjects.Graphics(scene);
    this.bodyC.add(g3);
    g3.fillStyle(van ? 0xdfe3e8 : 0x4a4650, 1); // chrome bumpers on the van
    g3.lineStyle(3, ink, 1);
    g3.fillRoundedRect(L.frontX - 10, L.bottom - 16, 16, 14, 4);
    g3.strokeRoundedRect(L.frontX - 10, L.bottom - 16, 16, 14, 4);
    g3.fillRoundedRect(L.backX - 6, L.bottom - 16, 14, 14, 4);
    g3.strokeRoundedRect(L.backX - 6, L.bottom - 16, 14, 14, 4);
    g3.fillStyle(C.red, 1);
    g3.fillRoundedRect(L.taillight.x - 6, L.taillight.y - 10, 10, 20, 3);
    g3.strokeRoundedRect(L.taillight.x - 6, L.taillight.y - 10, 10, 20, 3);
    drawHeadlight(g3, d.lights, L.headlight.x, L.headlight.y);

    // Dents, scratches and cracks (drawn last so they lie over the paint and the glass)
    this.damageG = new Phaser.GameObjects.Graphics(scene);
    this.bodyC.add(this.damageG);
    this.drawDamage();
    this.reverseG = new Phaser.GameObjects.Graphics(scene);
    this.bodyC.add(this.reverseG);
    this.drawReverse();

    // Amber turn signals (blink while changing lanes)
    this.blinkerG = new Phaser.GameObjects.Graphics(scene);
    this.bodyC.add(this.blinkerG);

    // Wheel arches
    g3.fillStyle(0x1f1c24, 1);
    for (const wx of L.wheelXs) {
      g3.slice(wx, -L.wheelR, L.wheelR + 7, Math.PI, 0, false);
      g3.fillPath();
    }

    if (this.beamOn) {
      const beam = new Phaser.GameObjects.Graphics(scene);
      beam.setBlendMode(Phaser.BlendModes.ADD);
      const hx = L.headlight.x + 8;
      const hy = L.headlight.y;
      const v = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
      // Soft falloff: several nested cones, each a little shorter and narrower.
      for (const f of [1, 0.78, 0.56, 0.36, 0.2]) {
        beam.fillStyle(0xfff0a0, 0.065);
        beam.fillPoints([v(hx, hy - 6), v(hx + 640 * f, hy - 70 * f), v(hx + 640 * f, hy + 62 * f), v(hx, hy + 8)], true);
      }
      beam.fillStyle(0xfff0a0, 0.28);
      beam.fillCircle(hx - 6, hy, 26);
      this.add(beam);
    }

    // Wheels (outside bodyC so the body can bounce on its "suspension")
    for (const wx of L.wheelXs) {
      const wg = new Phaser.GameObjects.Graphics(scene);
      wg.setPosition(wx, -L.wheelR);
      drawWheel(wg, d.wheels, L.wheelR);
      this.wheels.push(wg);
      this.add(wg);
    }
  }
}
