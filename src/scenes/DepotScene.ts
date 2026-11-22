import Phaser from 'phaser';
import { audio } from '../audio/AudioEngine';
import { BusView } from '../bus/BusView';
import type { BusDesign } from '../bus/design';
import { BODY_SIZE } from '../bus/geometry';
import { planParts, type Part } from '../bus/parts';
import { C, GAME_H, GAME_W } from '../config';
import { MAX_FUEL, MAX_HEALTH } from '../core/rules';
import { t } from '../i18n';
import { Icons } from '../ui/draw';
import { Button, confetti, floatText, label } from '../ui/widgets';

export interface DepotData {
  design: BusDesign;
  health: number;
  fuel: number;
  fuelActive: boolean;
  /** Called when the child drives on, with the state of the bus. */
  onDone: (result: { health: number; fuel: number }) => void;
}

const FLOOR_Y = 585;
const FUEL_STEP = 20;

interface Marker {
  part: Part;
  done: number;
  at: { x: number; y: number };
  c: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Graphics;
  pips: Phaser.GameObjects.Graphics;
  zone: Phaser.GameObjects.Zone;
  /** Radius of the ring on screen. */
  r: number;
}

/**
 * The repair depot: its own screen. Every broken part of the bus pulses; the child taps it until it is fixed
 * (each part needs a couple of taps) and the health bar climbs to 100%. A pump fills the tank.
 */
export class DepotScene extends Phaser.Scene {
  private d!: DepotData;
  private bus!: BusView;
  private markers: Marker[] = [];
  private healthStart = 0;
  private health = 0;
  private fuel = 0;
  private hpBar!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private fuelBar!: Phaser.GameObjects.Graphics;
  private fuelText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private go!: Button;
  private celebrated = false;
  private hadParts = false;
  private left = false;

  constructor() {
    super('Depot');
  }

  init(data: DepotData): void {
    this.d = data;
    this.health = Math.min(MAX_HEALTH, Math.max(0, data.health));
    this.healthStart = this.health;
    this.fuel = data.fuel;
    this.markers = [];
    this.celebrated = false;
    this.left = false;
  }

  create(): void {
    this.cameras.main.fadeIn(250, 45, 42, 50);
    this.drawWorkshop();

    // the bus on the lift
    const { L, H } = BODY_SIZE[this.d.design.body];
    const s = Math.min(960 / (L + 30), 390 / (H + 50));
    this.bus = new BusView(this, GAME_W / 2, FLOOR_Y, this.d.design);
    this.bus.setScale(s);
    const parts = planParts(MAX_HEALTH - Math.round(this.health), this.bus.layout);
    this.hadParts = parts.length > 0;
    this.bus.setParts(parts);
    for (const part of parts) this.addMarker(part, parts);

    this.createTitle();
    this.createHealthBar();
    this.createFuelPanel();

    this.hint = label(this, GAME_W / 2, 668, '', { size: 30, color: C.cream, strokeThickness: 6 });
    this.tweens.add({ targets: this.hint, scale: { from: 1, to: 1.05 }, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });

    this.go = new Button(this, GAME_W - 110, 625, { r: 62, color: C.green, icon: (g, sz) => Icons.play(g, sz), onClick: () => this.leave() });
    label(this, GAME_W - 110, 698, t('depotGo'), { size: 22, strokeThickness: 5 });

    this.refresh();
    if (!this.hadParts) this.celebrated = true; // nothing to fix: no fanfare
  }

  // ---------------------------------------------------------------- the picture

  private drawWorkshop(): void {
    const g = this.add.graphics();
    // back wall with a lighter upper part
    g.fillStyle(0x3f6f7a, 1);
    g.fillRect(0, 0, GAME_W, GAME_H);
    g.fillStyle(0x34606a, 1);
    g.fillRect(0, 330, GAME_W, FLOOR_Y - 330);
    g.lineStyle(3, 0x2b535c, 1);
    for (let x = 0; x < GAME_W; x += 160) g.lineBetween(x, 0, x, FLOOR_Y);
    // high windows
    for (const wx of [90, GAME_W - 230]) {
      g.fillStyle(0xbfe6f2, 1);
      g.fillRect(wx, 150, 140, 90);
      g.lineStyle(6, C.ink, 1);
      g.strokeRect(wx, 150, 140, 90);
      g.lineBetween(wx + 70, 150, wx + 70, 240);
      g.lineBetween(wx, 195, wx + 140, 195);
    }
    // tool board on the left wall
    g.fillStyle(0x8a6a4a, 1);
    g.lineStyle(5, C.ink, 1);
    g.fillRoundedRect(36, 290, 150, 150, 10);
    g.strokeRoundedRect(36, 290, 150, 150, 10);
    g.lineStyle(7, 0xcfd3d8, 1);
    g.lineBetween(64, 316, 64, 410);
    g.lineBetween(110, 316, 110, 392);
    g.lineBetween(156, 316, 156, 404);
    g.fillStyle(C.red, 1);
    g.fillRoundedRect(52, 404, 24, 22, 4);
    g.fillStyle(C.yellow, 1);
    g.fillRoundedRect(98, 386, 24, 22, 4);
    g.fillStyle(C.blue, 1);
    g.fillRoundedRect(144, 398, 24, 22, 4);
    // tyres on the right
    for (let i = 0; i < 3; i++) {
      g.fillStyle(0x2d2a32, 1);
      g.lineStyle(4, C.ink, 1);
      g.fillEllipse(GAME_W - 96, FLOOR_Y - 20 - i * 34, 120, 40);
      g.strokeEllipse(GAME_W - 96, FLOOR_Y - 20 - i * 34, 120, 40);
      g.fillStyle(0x9a9fa8, 1);
      g.fillEllipse(GAME_W - 96, FLOOR_Y - 20 - i * 34, 52, 18);
    }
    // hanging lamps with a warm glow
    for (const lx of [300, GAME_W / 2, GAME_W - 300]) {
      g.lineStyle(4, C.ink, 1);
      g.lineBetween(lx, 0, lx, 118);
      g.fillStyle(0x4a4650, 1);
      g.fillTriangle(lx - 40, 150, lx + 40, 150, lx, 112);
      g.fillStyle(C.yellow, 0.18);
      g.fillTriangle(lx - 90, 330, lx + 90, 330, lx, 150);
    }
    // floor with a hazard stripe at the front
    g.fillStyle(0x77747d, 1);
    g.fillRect(0, FLOOR_Y, GAME_W, GAME_H - FLOOR_Y);
    g.lineStyle(5, C.ink, 1);
    g.lineBetween(0, FLOOR_Y, GAME_W, FLOOR_Y);
    for (let x = -40; x < GAME_W; x += 56) {
      g.fillStyle(C.yellow, 1);
      g.fillPoints(
        [new Phaser.Math.Vector2(x, FLOOR_Y + 6), new Phaser.Math.Vector2(x + 28, FLOOR_Y + 6), new Phaser.Math.Vector2(x + 14, FLOOR_Y + 22), new Phaser.Math.Vector2(x - 14, FLOOR_Y + 22)],
        true,
      );
    }
    // the lift under the bus
    g.fillStyle(0x4a4650, 1);
    g.lineStyle(4, C.ink, 1);
    const { L } = BODY_SIZE[this.d.design.body];
    const half = Math.min(500, (L + 40) * 0.7);
    g.fillRoundedRect(GAME_W / 2 - half, FLOOR_Y - 6, half * 2, 14, 6);
    g.strokeRoundedRect(GAME_W / 2 - half, FLOOR_Y - 6, half * 2, 14, 6);
  }

  private createTitle(): void {
    const sign = this.add.graphics();
    sign.fillStyle(C.cream, 1);
    sign.lineStyle(6, C.ink, 1);
    sign.fillRoundedRect(GAME_W / 2 - 300, 20, 600, 78, 24);
    sign.strokeRoundedRect(GAME_W / 2 - 300, 20, 600, 78, 24);
    sign.fillStyle(C.orange, 1);
    sign.fillCircle(GAME_W / 2 - 250, 59, 28);
    sign.strokeCircle(GAME_W / 2 - 250, 59, 28);
    const w = this.add.graphics({ x: GAME_W / 2 - 250, y: 59 });
    Icons.wrench(w, 38, C.cream);
    label(this, GAME_W / 2 + 30, 60, t('depot'), { size: 44, color: C.ink, strokeThickness: 0 });
  }

  private createHealthBar(): void {
    const x = GAME_W / 2 - 230;
    const y = 112;
    const panel = this.add.graphics();
    panel.fillStyle(C.cream, 0.96);
    panel.lineStyle(4, C.ink, 1);
    panel.fillRoundedRect(x, y, 460, 40, 16);
    panel.strokeRoundedRect(x, y, 460, 40, 16);
    const icon = this.add.graphics({ x: x + 30, y: y + 20 });
    Icons.wrench(icon, 32, C.ink);
    this.hpBar = this.add.graphics();
    this.hpText = label(this, x + 400, y + 21, '', { size: 20, color: C.ink, strokeThickness: 0 });
  }

  private createFuelPanel(): void {
    if (!this.d.fuelActive) return;
    const x = 40;
    const y = 610;
    const pump = new Button(this, x + 52, y + 20, {
      r: 50,
      color: 0x3a86ff,
      icon: (g, sz) => Icons.pump(g, sz),
      onClick: () => this.fill(),
    });
    pump.setName('pump');
    const panel = this.add.graphics();
    panel.fillStyle(C.cream, 0.96);
    panel.lineStyle(4, C.ink, 1);
    panel.fillRoundedRect(x + 118, y + 2, 230, 36, 14);
    panel.strokeRoundedRect(x + 118, y + 2, 230, 36, 14);
    this.fuelBar = this.add.graphics();
    this.fuelText = label(this, x + 322, y + 21, '', { size: 18, color: C.ink, strokeThickness: 0 });
    this.tweens.add({ targets: pump, scale: { from: 1, to: 1.06 }, yoyo: true, repeat: -1, duration: 800, ease: 'Sine.easeInOut' });
  }

  // ---------------------------------------------------------------- broken parts

  /** The ring is as big as there is room for, so crowded parts can still be told apart by a finger. */
  private ringFor(part: Part, all: readonly Part[]): number {
    const at = this.bus.partWorld(part);
    let near = 1e9;
    for (const o of all) {
      if (o === part) continue;
      const w = this.bus.partWorld(o);
      near = Math.min(near, Math.hypot(w.x - at.x, w.y - at.y));
    }
    return Phaser.Math.Clamp(near * 0.42, 24, 40);
  }

  private addMarker(part: Part, all: readonly Part[]): void {
    const at = this.bus.partWorld(part);
    const r = this.ringFor(part, all);
    const c = this.add.container(at.x, at.y).setDepth(10);
    const ring = this.add.graphics();
    const pips = this.add.graphics();
    const wrench = this.add.graphics({ x: 0, y: -r - 12 });
    Icons.wrench(wrench, 34, C.orange);
    c.add([ring, pips, wrench]);
    this.tweens.add({ targets: ring, scale: { from: 0.88, to: 1.12 }, yoyo: true, repeat: -1, duration: 520 + Math.random() * 180, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: wrench, y: -r - 20, yoyo: true, repeat: -1, duration: 480, ease: 'Sine.easeInOut' });
    const zone = this.add.zone(at.x, at.y, r * 2 + 10, r * 2 + 10).setInteractive({ useHandCursor: true }).setDepth(11);
    const m: Marker = { part, done: 0, at, c, ring, pips, zone, r };
    zone.on('pointerdown', () => this.tapPart(m));
    this.drawMarker(m);
    this.markers.push(m);
  }

  private drawMarker(m: Marker): void {
    m.ring.clear();
    m.ring.lineStyle(7, C.ink, 1);
    m.ring.strokeCircle(0, 0, m.r);
    m.ring.lineStyle(5, C.orange, 1);
    m.ring.strokeCircle(0, 0, m.r);
    m.pips.clear();
    const n = m.part.taps;
    for (let i = 0; i < n; i++) {
      const px = (i - (n - 1) / 2) * 17;
      m.pips.fillStyle(i < m.done ? C.green : C.cream, 1);
      m.pips.lineStyle(3, C.ink, 1);
      m.pips.fillCircle(px, m.r + 16, 6);
      m.pips.strokeCircle(px, m.r + 16, 6);
    }
  }

  private tapPart(m: Marker): void {
    if (this.left || !this.markers.includes(m)) return;
    m.done++;
    this.health = Math.min(MAX_HEALTH, this.health + m.part.value / m.part.taps);
    this.spark(m.at.x, m.at.y);
    audio.clank();
    // the bus shudders a little under the tool
    const s = this.bus.scaleX;
    this.tweens.add({ targets: this.bus, scaleY: s * 0.985, yoyo: true, duration: 70, onComplete: () => this.bus.setScale(s) });
    this.tweens.add({ targets: m.c, scale: { from: 1.25, to: 1 }, duration: 160, ease: 'Back.easeOut' });

    if (m.done >= m.part.taps) {
      this.markers = this.markers.filter((x) => x !== m);
      this.bus.setParts(this.markers.map((x) => x.part));
      this.spark(m.at.x, m.at.y, 14);
      audio.coin();
      floatText(this, m.at.x, m.at.y - 30, `+${m.part.value}`, C.green, 38);
      m.zone.destroy();
      this.tweens.add({ targets: m.c, scale: 1.6, alpha: 0, duration: 260, onComplete: () => m.c.destroy() });
    } else {
      this.drawMarker(m);
    }
    this.refresh();
    if (this.markers.length === 0) this.celebrate();
  }

  private spark(x: number, y: number, count = 8): void {
    for (let i = 0; i < count; i++) {
      const dot = this.add.graphics({ x, y }).setDepth(30);
      dot.fillStyle(i % 2 ? C.yellow : C.orange, 1);
      dot.fillCircle(0, 0, 5 + (i % 3));
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const r = 40 + Math.random() * 40;
      this.tweens.add({ targets: dot, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, alpha: 0, scale: 0.3, duration: 380, ease: 'Cubic.easeOut', onComplete: () => dot.destroy() });
    }
  }

  private celebrate(): void {
    if (this.celebrated) return;
    this.celebrated = true;
    this.health = MAX_HEALTH;
    this.refresh();
    audio.fanfare();
    confetti(this, GAME_W / 2, 560, 70);
    this.tweens.add({ targets: this.go, scale: { from: 1, to: 1.14 }, yoyo: true, repeat: -1, duration: 500, ease: 'Sine.easeInOut' });
  }

  // ---------------------------------------------------------------- fuel

  private fill(): void {
    if (this.left || this.fuel >= MAX_FUEL) return;
    this.fuel = Math.min(MAX_FUEL, this.fuel + FUEL_STEP);
    audio.glug();
    const pump = this.children.getByName('pump') as Button | null;
    if (pump) this.tweens.add({ targets: pump, scale: { from: 1.2, to: 1 }, duration: 180, ease: 'Back.easeOut' });
    this.refresh();
    if (this.fuel >= MAX_FUEL) audio.coin();
  }

  // ---------------------------------------------------------------- readouts

  private refresh(): void {
    const x = GAME_W / 2 - 230;
    const y = 112;
    const k = this.health / MAX_HEALTH;
    const g = this.hpBar;
    g.clear();
    g.fillStyle(0x9a9fa8, 1);
    g.fillRoundedRect(x + 56, y + 9, 290, 22, 9);
    g.fillStyle(k >= 0.7 ? C.green : k >= 0.4 ? C.yellow : C.red, 1);
    if (k > 0) g.fillRoundedRect(x + 56, y + 9, Math.max(16, 290 * k), 22, 9);
    g.lineStyle(3, C.ink, 1);
    g.strokeRoundedRect(x + 56, y + 9, 290, 22, 9);
    this.hpText.setText(`${Math.round(this.health)}%`);

    if (this.d.fuelActive) {
      const fx = 40 + 118;
      const fy = 610;
      const fk = this.fuel / MAX_FUEL;
      const f = this.fuelBar;
      f.clear();
      f.fillStyle(0x9a9fa8, 1);
      f.fillRoundedRect(fx + 12, fy + 9, 150, 20, 8);
      f.fillStyle(fk >= 0.5 ? 0x3a86ff : fk > 0.25 ? C.yellow : C.red, 1);
      if (fk > 0) f.fillRoundedRect(fx + 12, fy + 9, Math.max(14, 150 * fk), 20, 8);
      f.lineStyle(3, C.ink, 1);
      f.strokeRoundedRect(fx + 12, fy + 9, 150, 20, 8);
      this.fuelText.setText(`${Math.round(this.fuel)}%`);
    }

    this.hint.setText(this.markers.length > 0 ? t('depotTap') : this.d.fuelActive && this.fuel < MAX_FUEL ? t('depotFuel') : t('depotDone'));
  }

  private leave(): void {
    if (this.left) return;
    this.left = true;
    audio.select();
    const result = { health: Math.round(this.markers.length === 0 && this.hadParts ? MAX_HEALTH : Math.max(this.healthStart, this.health)), fuel: this.fuel };
    this.cameras.main.fadeOut(200, 45, 42, 50);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.d.onDone(result);
      this.scene.stop();
    });
  }
}
