import Phaser from 'phaser';
import { C, FONT, hex, luminance, shade } from '../config';
import { drawStar } from '../ui/draw';
import type { BusDesign, LightType, WheelType } from './design';
import { computeLayout, type BusLayout } from './geometry';

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
    this.build();
    this.setPassengers(this.passengers);
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
    const double = L.deckY !== null;

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
    g.fillStyle(shade(body, -0.1), 1);
    g.lineStyle(4, ink, 1);
    const roofX = L.backX + boxW * 0.3;
    g.fillRoundedRect(roofX, L.top - 14, boxW * 0.28, 18, { tl: 8, tr: 8, bl: 2, br: 2 });
    g.strokeRoundedRect(roofX, L.top - 14, boxW * 0.28, 18, { tl: 8, tr: 8, bl: 2, br: 2 });

    // Main body
    const radii = { tl: 18, tr: L.hood ? 14 : double ? 34 : 44, bl: 10, br: L.hood ? 4 : 14 };
    g.fillStyle(body, 1);
    g.fillRoundedRect(L.backX, L.top, boxW, H, radii);
    // Darker skirt along the bottom
    g.fillStyle(bodyDark, 1);
    g.fillRoundedRect(L.backX + 2, L.bottom - 22, boxW - 4, 20, { tl: 2, tr: 2, bl: 9, br: L.hood ? 3 : 12 });

    // Decor (drawn before windows/doors so they sit on top)
    const lowerTop = L.deckY ?? L.top;
    const winBottom = Math.max(...L.windows.filter((w) => w.y > lowerTop - 1).map((w) => w.y + w.h));
    const bandY = winBottom + 10;
    const bandH = L.bottom - 26 - bandY;
    switch (d.decor) {
      case 'stripe':
        g.fillStyle(accent, 1);
        g.fillRect(L.backX + 3, bandY + bandH * 0.25, boxW - 6, Math.max(8, bandH * 0.4));
        if (double) g.fillRect(L.backX + 3, (L.deckY as number) - 8, boxW - 6, 12);
        else g.fillRect(L.backX + 3, L.top + 34 - 7, boxW - 6, 5);
        break;
      case 'dots':
        g.fillStyle(accent, 0.9);
        for (let x = L.backX + 30; x < L.boxFrontX - 24; x += 34)
          g.fillCircle(x, bandY + bandH / 2 + ((x / 34) % 2 ? -4 : 4), Math.min(9, bandH * 0.32));
        break;
      case 'stars':
        for (let x = L.backX + 40; x < L.boxFrontX - 30; x += 70)
          drawStar(g, x, bandY + bandH / 2, Math.min(15, bandH * 0.5), accent, null);
        break;
      case 'none':
        break;
    }

    // Body outline on top of decor
    g.lineStyle(5, ink, 1);
    g.strokeRoundedRect(L.backX, L.top, boxW, H, radii);
    if (double) {
      g.lineStyle(3, bodyDark, 1);
      g.lineBetween(L.backX + 4, L.deckY as number, L.boxFrontX - 4, L.deckY as number);
    }

    // Windows (glass)
    for (const w of L.windows) {
      g.fillStyle(C.glass, 1);
      g.fillRoundedRect(w.x, w.y, w.w, w.h, 8);
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
      g2.strokeRoundedRect(w.x, w.y, w.w, w.h, 8);
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
      fontSize: '20px',
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
      fontSize: d.number.length > 2 ? '20px' : '26px',
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
        leaf.fillStyle(shade(body, -0.08), 1);
        leaf.lineStyle(3, ink, 1);
        leaf.fillRect(x0, 0, half, door.h);
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
    g3.fillStyle(0x4a4650, 1);
    g3.lineStyle(3, ink, 1);
    g3.fillRoundedRect(L.frontX - 10, L.bottom - 16, 16, 14, 4);
    g3.strokeRoundedRect(L.frontX - 10, L.bottom - 16, 16, 14, 4);
    g3.fillRoundedRect(L.backX - 6, L.bottom - 16, 14, 14, 4);
    g3.strokeRoundedRect(L.backX - 6, L.bottom - 16, 14, 14, 4);
    g3.fillStyle(C.red, 1);
    g3.fillRoundedRect(L.taillight.x - 6, L.taillight.y - 10, 10, 20, 3);
    g3.strokeRoundedRect(L.taillight.x - 6, L.taillight.y - 10, 10, 20, 3);
    drawHeadlight(g3, d.lights, L.headlight.x, L.headlight.y);

    // Wheel arches
    g3.fillStyle(0x1f1c24, 1);
    for (const wx of L.wheelXs) {
      g3.slice(wx, -L.wheelR, L.wheelR + 7, Math.PI, 0, false);
      g3.fillPath();
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
