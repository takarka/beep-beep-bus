import Phaser from 'phaser';
import { C, shade } from '../config';
import { drawWheel } from '../bus/BusView';
import { drawStar } from '../ui/draw';
import type { VehicleKind } from './ai';

type G = Phaser.GameObjects.Graphics;

export const CAR_COLORS = [0xe63946, 0x3a86ff, 0x57cc99, 0xf4a261, 0x9b5de5, 0xf15bb5, 0x2ec4b6, 0xf1ead8, 0xffd23f];
export const MINIBUS_COLORS = [0xffd23f, 0x57cc99, 0xf4a261, 0x3a86ff, 0xf1ead8];
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
    shadow.fillEllipse(0, 2, kind === 'minibus' ? 260 : 170, 14);
    this.add(shadow);

    if (kind === 'minibus') this.buildMinibus(color);
    else this.buildCar(color, variant, kind === 'police');
    if (night) this.addHeadlightBeam(kind === 'minibus' ? 114 : 76, -30);
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

  /** A small city bus (midibus): tall box body, big side windows, folding front door, route sign, big wheels. */
  private buildMinibus(color: number): void {
    const g = this.scene.add.graphics();
    const dark = shade(color, -0.25);
    const body = { tl: 12, tr: 24, bl: 6, br: 8 };
    g.lineStyle(5, C.ink, 1);
    // roof air-conditioner hatch
    g.fillStyle(shade(color, -0.12), 1);
    g.fillRoundedRect(-62, -122, 72, 11, 4);
    g.strokeRoundedRect(-62, -122, 72, 11, 4);
    // body
    g.fillStyle(color, 1);
    g.fillRoundedRect(-115, -112, 230, 102, body);
    g.strokeRoundedRect(-115, -112, 230, 102, body);
    g.fillStyle(dark, 1);
    g.fillRect(-113, -28, 226, 16);
    g.fillStyle(0xffffff, 0.85);
    g.fillRect(-113, -47, 226, 6);
    // route sign above the windows
    g.fillStyle(0x1f1c24, 1);
    g.fillRoundedRect(36, -108, 62, 11, 3);
    g.fillStyle(0xffb703, 1);
    g.fillRect(42, -105, 50, 5);
    // big side windows
    g.fillStyle(C.glass, 1);
    g.lineStyle(3, C.ink, 1);
    for (const x of [-105, -66, -27, 12]) {
      g.fillRoundedRect(x, -90, 34, 40, 5);
      g.strokeRoundedRect(x, -90, 34, 40, 5);
      g.lineStyle(3, 0xffffff, 0.5);
      g.lineBetween(x + 6, -56, x + 14, -84);
      g.lineStyle(3, C.ink, 1);
    }
    // folding front door with two glass leaves and a step
    const dx = 56;
    const dw = 36;
    g.fillStyle(shade(color, -0.1), 1);
    g.fillRect(dx, -98, dw, 88);
    g.strokeRect(dx, -98, dw, 88);
    g.fillStyle(C.glass, 1);
    for (const lx of [dx + 3, dx + dw / 2 + 1]) {
      g.fillRoundedRect(lx, -92, dw / 2 - 4, 56, 3);
      g.strokeRoundedRect(lx, -92, dw / 2 - 4, 56, 3);
    }
    g.lineBetween(dx + dw / 2, -98, dx + dw / 2, -10);
    g.fillStyle(0x4a4650, 1);
    g.fillRect(dx + 2, -15, dw - 4, 5);
    // windshield seen from the side, at the flat front
    const shield = [V(100, -94), V(100, -50), V(112, -56), V(112, -84)];
    g.fillStyle(C.glass, 1);
    g.fillPoints(shield, true);
    g.strokePoints(shield, true, true);
    // lamps and bumpers
    g.fillStyle(0xfff3b0, 1);
    g.fillEllipse(111, -30, 8, 14);
    g.strokeEllipse(111, -30, 8, 14);
    g.fillStyle(C.red, 1);
    g.fillRect(-116, -44, 5, 16);
    g.fillStyle(0x4a4650, 1);
    g.fillRoundedRect(-119, -16, 10, 8, 3);
    g.fillRoundedRect(108, -16, 10, 8, 3);
    this.add(g);
    this.add(this.archs([-72, 68], 20));
    this.addWheel(-72, 20);
    this.addWheel(68, 20);
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
