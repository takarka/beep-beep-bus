import Phaser from 'phaser';
import { C, shade } from '../config';
import { drawWheel } from '../bus/BusView';
import { drawStar } from '../ui/draw';
import type { VehicleKind } from './ai';

type G = Phaser.GameObjects.Graphics;

export const CAR_COLORS = [0xe63946, 0x3a86ff, 0x57cc99, 0xf4a261, 0x9b5de5, 0xf15bb5, 0x2ec4b6, 0xf1ead8, 0xffd23f];
export const MINIBUS_COLORS = [0x57cc99, 0xf4a261, 0xf1ead8, 0x3a86ff];
const POLICE_WHITE = 0xf4f1de;
const POLICE_BLUE = 0x3a86ff;

const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

/**
 * A passing vehicle drawn from vector shapes. Drawn facing right (+x) with the origin at road level;
 * the traffic manager mirrors it so it drives left in the oncoming lane.
 */
export class VehicleView extends Phaser.GameObjects.Container {
  private wheels: G[] = [];
  private wheelR = 15;
  private lamps: G | null = null;
  private lastPhase = -1;

  constructor(scene: Phaser.Scene, readonly kind: VehicleKind, color: number, variant: number, night: boolean) {
    super(scene, 0, 0);
    scene.add.existing(this);
    const shadow = scene.add.graphics();
    shadow.fillStyle(C.shadow, 0.18);
    shadow.fillEllipse(0, 2, kind === 'minibus' ? 230 : 170, 14);
    this.add(shadow);

    if (kind === 'minibus') this.buildMinibus(color);
    else this.buildCar(color, variant, kind === 'police');
    if (night) this.addHeadlightBeam(kind === 'minibus' ? 105 : 76, kind === 'minibus' ? -30 : -30);
  }

  private addWheel(x: number, r: number): void {
    const g = this.scene.add.graphics({ x, y: -r });
    drawWheel(g, 'classic', r);
    this.wheels.push(g);
    this.wheelR = r;
    this.add(g);
  }

  private archs(xs: number[], r: number): G {
    const g = this.scene.add.graphics();
    g.fillStyle(0x1f1c24, 1);
    for (const x of xs) {
      g.slice(x, -r, r + 4, Math.PI, 0, false);
      g.fillPath();
    }
    return g;
  }

  private buildCar(color: number, variant: number, police: boolean): void {
    const body = police ? POLICE_WHITE : color;
    const g = this.scene.add.graphics();
    g.lineStyle(4, C.ink, 1);
    // cabin first, so the body overlaps its lower edge
    const cabin = variant === 1 ? [V(-58, -42), V(-44, -68), V(30, -68), V(50, -42)] : [V(-40, -42), V(-26, -68), V(28, -68), V(48, -42)];
    g.fillStyle(body, 1);
    g.fillPoints(cabin, true);
    g.strokePoints(cabin, true, true);
    g.fillRoundedRect(-75, -42, 150, 34, { tl: 8, tr: 16, bl: 6, br: 8 });
    g.strokeRoundedRect(-75, -42, 150, 34, { tl: 8, tr: 16, bl: 6, br: 8 });
    if (police) {
      g.fillStyle(POLICE_BLUE, 1);
      g.fillRect(-73, -26, 146, 11);
    }
    // windows
    g.fillStyle(C.glass, 1);
    g.lineStyle(3, C.ink, 1);
    const front = [V(10, -46), V(10, -64), V(26, -64), V(41, -46)];
    const rear = variant === 1 ? [V(-48, -46), V(-40, -64), V(-2, -64), V(-2, -46)] : [V(-33, -46), V(-23, -64), V(-2, -64), V(-2, -46)];
    for (const w of [front, rear]) {
      g.fillPoints(w, true);
      g.strokePoints(w, true, true);
    }
    g.lineStyle(2, shade(body, -0.3), 1);
    g.lineBetween(4, -42, 4, -27);
    // lamps and bumpers
    g.fillStyle(0xfff3b0, 1);
    g.lineStyle(3, C.ink, 1);
    g.fillEllipse(69, -31, 9, 13);
    g.strokeEllipse(69, -31, 9, 13);
    g.fillStyle(C.red, 1);
    g.fillRect(-76, -35, 5, 12);
    g.fillStyle(0x4a4650, 1);
    g.fillRoundedRect(-79, -16, 10, 8, 3);
    g.fillRoundedRect(68, -16, 10, 8, 3);
    if (police) {
      drawStar(g, -14, -33, 7, C.yellow, C.ink, 2);
      g.fillStyle(C.ink, 1);
      g.fillRoundedRect(-12, -74, 24, 6, 2);
      this.lamps = this.scene.add.graphics({ x: 0, y: -77 });
    }
    this.add(g);
    this.add(this.archs([-46, 46], 15));
    this.addWheel(-46, 15);
    this.addWheel(46, 15);
    if (this.lamps) this.add(this.lamps);
    this.siren(0);
  }

  private buildMinibus(color: number): void {
    const g = this.scene.add.graphics();
    g.lineStyle(5, C.ink, 1);
    g.fillStyle(shade(color, -0.12), 1);
    g.fillRoundedRect(-30, -81, 60, 9, 3);
    g.strokeRoundedRect(-30, -81, 60, 9, 3);
    g.fillStyle(color, 1);
    g.fillRoundedRect(-105, -72, 210, 64, { tl: 10, tr: 28, bl: 6, br: 8 });
    g.strokeRoundedRect(-105, -72, 210, 64, { tl: 10, tr: 28, bl: 6, br: 8 });
    g.fillStyle(shade(color, -0.25), 1);
    g.fillRect(-103, -24, 206, 10);
    // windows and the sliding door
    g.fillStyle(C.glass, 1);
    g.lineStyle(3, C.ink, 1);
    for (const x of [-94, -52, -10]) {
      g.fillRoundedRect(x, -64, 38, 26, 4);
      g.strokeRoundedRect(x, -64, 38, 26, 4);
    }
    const shield = [V(66, -64), V(66, -40), V(98, -40), V(88, -56), V(78, -64)];
    g.fillPoints(shield, true);
    g.strokePoints(shield, true, true);
    g.fillStyle(shade(color, -0.1), 1);
    g.fillRect(32, -67, 28, 58);
    g.strokeRect(32, -67, 28, 58);
    g.fillStyle(C.glass, 1);
    g.fillRoundedRect(36, -62, 20, 28, 3);
    g.strokeRoundedRect(36, -62, 20, 28, 3);
    // lamps and bumpers
    g.fillStyle(0xfff3b0, 1);
    g.fillEllipse(102, -29, 9, 14);
    g.strokeEllipse(102, -29, 9, 14);
    g.fillStyle(C.red, 1);
    g.fillRect(-106, -40, 5, 14);
    g.fillStyle(0x4a4650, 1);
    g.fillRoundedRect(-109, -16, 10, 8, 3);
    g.fillRoundedRect(98, -16, 10, 8, 3);
    this.add(g);
    this.add(this.archs([-66, 64], 17));
    this.addWheel(-66, 17);
    this.addWheel(64, 17);
  }

  private addHeadlightBeam(x: number, y: number): void {
    const beam = this.scene.add.graphics();
    beam.setBlendMode(Phaser.BlendModes.ADD);
    for (const f of [1, 0.7, 0.42, 0.2]) {
      beam.fillStyle(0xfff0a0, 0.07);
      beam.fillPoints([V(x, y - 4), V(x + 300 * f, y - 36 * f), V(x + 300 * f, y + 30 * f), V(x, y + 5)], true);
    }
    beam.fillStyle(0xfff0a0, 0.25);
    beam.fillCircle(x, y, 14);
    this.add(beam);
  }

  /** Spin the wheels for `dist` world px of travel. */
  roll(dist: number, scale: number): void {
    const a = dist / (this.wheelR * scale);
    for (const w of this.wheels) w.rotation += a;
  }

  /** Police light bar: red and blue take turns. */
  siren(timeMs: number): void {
    if (!this.lamps) return;
    const phase = Math.floor(timeMs / 230) % 2;
    if (phase === this.lastPhase) return;
    this.lastPhase = phase;
    const g = this.lamps;
    g.clear();
    for (const [x, c, on] of [[-6, C.red, phase === 0], [6, POLICE_BLUE, phase === 1]] as const) {
      if (on) {
        g.fillStyle(c, 0.3);
        g.fillCircle(x, 0, 16);
      }
      g.fillStyle(on ? c : shade(c, -0.55), 1);
      g.lineStyle(2, C.ink, 1);
      g.fillCircle(x, 0, 5);
      g.strokeCircle(x, 0, 5);
    }
  }
}
