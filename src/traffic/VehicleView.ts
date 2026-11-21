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
  private badge: G | null = null;
  private blinkerG: G;
  private blinkerKey = -1;

  constructor(scene: Phaser.Scene, readonly kind: VehicleKind, color: number, variant: number, night: boolean) {
    super(scene, 0, 0);
    scene.add.existing(this);
    const shadow = scene.add.graphics();
    shadow.fillStyle(C.shadow, 0.18);
    const shadowW = kind === 'truck' ? 270 : kind === 'minibus' ? 260 : kind === 'ambulance' ? 210 : 170;
    shadow.fillEllipse(0, 2, shadowW, 14);
    this.add(shadow);

    if (kind === 'minibus') this.buildMinibus(color);
    else if (kind === 'truck') this.buildTruck(color);
    else if (kind === 'ambulance') this.buildAmbulance();
    else this.buildCar(color, variant, kind === 'police' ? 'police' : kind === 'taxi' ? 'taxi' : 'car');
    const beamX = kind === 'truck' ? 118 : kind === 'minibus' ? 114 : kind === 'ambulance' ? 92 : 76;
    if (night) this.addHeadlightBeam(beamX, -30);
    this.blinkerG = scene.add.graphics();
    this.add(this.blinkerG);
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

  private buildCar(color: number, variant: number, role: 'car' | 'police' | 'taxi'): void {
    const body = role === 'police' ? POLICE_WHITE : role === 'taxi' ? 0xffd23f : color;
    const g = this.scene.add.graphics();
    g.lineStyle(4, C.ink, 1);
    // cabin first, so the body overlaps its lower edge
    const cabin = variant === 1 ? [V(-58, -42), V(-44, -68), V(30, -68), V(50, -42)] : [V(-40, -42), V(-26, -68), V(28, -68), V(48, -42)];
    g.fillStyle(body, 1);
    g.fillPoints(cabin, true);
    g.strokePoints(cabin, true, true);
    g.fillRoundedRect(-75, -42, 150, 34, { tl: 8, tr: 16, bl: 6, br: 8 });
    g.strokeRoundedRect(-75, -42, 150, 34, { tl: 8, tr: 16, bl: 6, br: 8 });
    if (role === 'police') {
      g.fillStyle(POLICE_BLUE, 1);
      g.fillRect(-73, -26, 146, 11);
    } else if (role === 'taxi') {
      // checker strip along the door
      for (let i = 0; i < 8; i++) {
        g.fillStyle(i % 2 === 0 ? C.ink : C.cream, 1);
        g.fillRect(-44 + i * 10, -28, 10, 6);
        g.fillStyle(i % 2 === 1 ? C.ink : C.cream, 1);
        g.fillRect(-44 + i * 10, -22, 10, 6);
      }
      // roof TAXI sign
      g.fillStyle(0xffb703, 1);
      g.lineStyle(3, C.ink, 1);
      g.fillRoundedRect(-14, -77, 28, 9, 3);
      g.strokeRoundedRect(-14, -77, 28, 9, 3);
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
    if (role === 'police') {
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

  /** Box truck: tall cargo box at the back, cab at the front, big wheels. */
  private buildTruck(color: number): void {
    const g = this.scene.add.graphics();
    g.lineStyle(5, C.ink, 1);
    // cargo box
    g.fillStyle(color, 1);
    g.fillRoundedRect(-122, -118, 162, 92, { tl: 10, tr: 10, bl: 4, br: 4 });
    g.strokeRoundedRect(-122, -118, 162, 92, { tl: 10, tr: 10, bl: 4, br: 4 });
    g.fillStyle(shade(color, 0.2), 1);
    g.fillRect(-114, -108, 146, 16);
    // chassis
    g.fillStyle(0x4a4650, 1);
    g.fillRect(-120, -26, 240, 14);
    g.strokeRect(-120, -26, 240, 14);
    // cab
    const cabColor = 0xf1ead8;
    g.fillStyle(cabColor, 1);
    g.fillRoundedRect(44, -92, 76, 80, { tl: 8, tr: 20, bl: 4, br: 8 });
    g.strokeRoundedRect(44, -92, 76, 80, { tl: 8, tr: 20, bl: 4, br: 8 });
    // cab window
    g.fillStyle(C.glass, 1);
    g.lineStyle(3, C.ink, 1);
    const win = [V(54, -84), V(98, -84), V(112, -56), V(54, -56)];
    g.fillPoints(win, true);
    g.strokePoints(win, true, true);
    // headlight + taillight
    g.fillStyle(0xfff3b0, 1);
    g.fillEllipse(116, -34, 8, 12);
    g.strokeEllipse(116, -34, 8, 12);
    g.fillStyle(C.red, 1);
    g.fillRect(-123, -38, 5, 14);
    this.add(g);
    this.add(this.archs([-72, 82], 19));
    this.addWheel(-72, 19);
    this.addWheel(82, 19);
  }

  /** White ambulance van with a red stripe, red cross, and flashing roof light bar. */
  private buildAmbulance(): void {
    const g = this.scene.add.graphics();
    g.lineStyle(4, C.ink, 1);
    g.fillStyle(0xf8f9fa, 1);
    g.fillRoundedRect(-95, -92, 190, 80, { tl: 12, tr: 26, bl: 6, br: 8 });
    g.strokeRoundedRect(-95, -92, 190, 80, { tl: 12, tr: 26, bl: 6, br: 8 });
    // red stripe
    g.fillStyle(C.red, 1);
    g.fillRect(-93, -38, 186, 12);
    // windshield + side cab window
    g.fillStyle(C.glass, 1);
    g.lineStyle(3, C.ink, 1);
    const shield = [V(44, -82), V(74, -82), V(90, -52), V(44, -52)];
    g.fillPoints(shield, true);
    g.strokePoints(shield, true, true);
    // red cross on the side
    g.fillStyle(C.red, 1);
    g.fillRect(-38, -76, 12, 30);
    g.fillRect(-47, -67, 30, 12);
    // roof light bar
    g.fillStyle(C.ink, 1);
    g.fillRoundedRect(-12, -98, 24, 6, 2);
    this.lamps = this.scene.add.graphics({ x: 0, y: -102 });
    // lamps and bumpers
    g.fillStyle(0xfff3b0, 1);
    g.fillEllipse(91, -30, 8, 12);
    g.strokeEllipse(91, -30, 8, 12);
    g.fillStyle(C.red, 1);
    g.fillRect(-96, -42, 5, 14);
    g.fillStyle(0x4a4650, 1);
    g.fillRoundedRect(-99, -16, 10, 8, 3);
    g.fillRoundedRect(88, -16, 10, 8, 3);
    this.add(g);
    this.add(this.archs([-54, 54], 17));
    this.addWheel(-54, 17);
    this.addWheel(54, 17);
    if (this.lamps) this.add(this.lamps);
    this.siren(0);
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

  /** A red "!" over a driver who follows too close: he may run into us if we stop suddenly. */
  setHasty(on: boolean): void {
    if (on && !this.badge) {
      const y = this.kind === 'minibus' || this.kind === 'truck' ? -118 : this.kind === 'ambulance' ? -105 : -90;
      const g = this.scene.add.graphics({ x: 0, y });
      g.fillStyle(C.red, 1);
      g.lineStyle(4, C.ink, 1);
      g.fillCircle(0, 0, 15);
      g.strokeCircle(0, 0, 15);
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(-2.5, -9, 5, 11, 2);
      g.fillCircle(0, 7, 3);
      this.badge = g;
      this.add(g);
    }
    this.badge?.setVisible(on);
  }

  /** Flashing amber turn signals (front and rear) while changing lanes or turning off. */
  setBlinker(on: boolean, timeMs: number): void {
    const lit = on && Math.floor(timeMs / 220) % 2 === 0;
    const key = on ? (lit ? 2 : 1) : 0;
    if (key === this.blinkerKey) return;
    this.blinkerKey = key;
    const g = this.blinkerG;
    g.clear();
    if (!lit) return;
    const pts: Array<[number, number]> =
      this.kind === 'minibus'
        ? [[111, -48], [-114, -56]]
        : this.kind === 'truck'
          ? [[116, -48], [-121, -48]]
          : this.kind === 'ambulance'
            ? [[91, -44], [-94, -48]]
            : [[71, -22], [-74, -22]];
    for (const [bx, by] of pts) {
      g.fillStyle(0xffb703, 0.4);
      g.fillCircle(bx, by, 13);
      g.fillStyle(0xffb703, 1);
      g.lineStyle(2.5, C.ink, 1);
      g.fillRoundedRect(bx - 5, by - 4, 10, 8, 3);
      g.strokeRoundedRect(bx - 5, by - 4, 10, 8, 3);
    }
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
