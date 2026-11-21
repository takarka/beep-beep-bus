import Phaser from 'phaser';
import { audio } from '../audio/AudioEngine';
import { BusView } from '../bus/BusView';
import { DEFAULT_DESIGN } from '../bus/design';
import { loadDesign } from '../bus/garage';
import { DRIVE_SCALE } from '../bus/geometry';
import { C, GAME_W } from '../config';
import { isCompleted, loadProgress, recordResult } from '../core/progress';
import { MAP_NODES, cityForLevel } from '../core/campaign';
import { LOW_FUEL, MAX_FUEL, MAX_HEALTH, finalStars } from '../core/rules';
import { t, type TextKey } from '../i18n';
import { Icons, drawStar } from '../ui/draw';
import { drawLandmark } from '../ui/landmarks';
import { GROUND_Y } from '../ui/textures';
import { createScenery } from '../ui/scenery';
import { getSettings } from '../core/settings';
import { resolveEnv } from '../core/world';
import { Button, confetti, label } from '../ui/widgets';
import type { DriveResult } from './DriveScene';

export class ResultScene extends Phaser.Scene {
  private backdrop!: ReturnType<typeof createScenery>;
  private bus!: BusView;
  private scroll = 0;

  constructor() {
    super('Result');
  }

  create(r: DriveResult): void {
    this.cameras.main.fadeIn(300, 45, 42, 50);
    this.scroll = 0;
    const env = { ...resolveEnv(r.level, getSettings().world), city: cityForLevel(r.level) };
    this.backdrop = createScenery(this, env, { behindUi: true });
    const health = r.health ?? 100;
    const stars = finalStars(r.mistakes, health);
    const firstTime = !isCompleted(loadProgress(), r.level);
    recordResult(r.level, stars, r.score);

    const design = loadDesign() ?? { ...DEFAULT_DESIGN };
    this.bus = new BusView(this, 200, GROUND_Y, design);
    this.bus.setScale(DRIVE_SCALE[design.body] * 0.7);
    this.bus.setNight(env.time === 'night');
    this.bus.setDamage(1 - health / MAX_HEALTH);

    const cx = GAME_W / 2;
    const panel = this.add.graphics();
    panel.fillStyle(C.cream, 0.97);
    panel.fillRoundedRect(cx - 340, 18, 680, 680, 34);
    panel.lineStyle(6, C.ink, 1);
    panel.strokeRoundedRect(cx - 340, 18, 680, 680, 34);

    label(this, cx, 66, t('results'), { size: 46, color: C.yellow });
    const landmark = MAP_NODES[r.level - 1]?.landmark;
    label(this, cx, 114, `${t('level')} ${r.level}${landmark ? ' · ' + t(`lm_${landmark}` as TextKey) : ''}`, { size: 26, color: C.ink, strokeThickness: 0 });

    // Stars pop in one by one
    for (let i = 0; i < 3; i++) {
      const g = this.add.graphics({ x: cx + (i - 1) * 135, y: 200 });
      drawStar(g, 0, 0, 52, 0xd9cfbf, C.ink, 5);
      if (i < stars) {
        const s = this.add.graphics({ x: g.x, y: g.y }).setScale(0);
        drawStar(s, 0, 0, 52, C.yellow, C.ink, 5);
        this.tweens.add({
          targets: s,
          scale: 1,
          angle: { from: -90, to: 0 },
          delay: 400 + i * 450,
          duration: 450,
          ease: 'Back.easeOut',
          onStart: () => audio.star(i),
        });
      }
    }
    this.time.delayedCall(400 + stars * 450, () => {
      audio.fanfare();
      confetti(this, cx, 720, 80);
    });

    // Stats
    const stat = (x: number, color: number, icon: (g: Phaser.GameObjects.Graphics) => void, value: number) => {
      const g = this.add.graphics({ x, y: 300 });
      g.fillStyle(color, 1);
      g.lineStyle(4, C.ink, 1);
      g.fillCircle(0, 0, 28);
      g.strokeCircle(0, 0, 28);
      icon(g);
      label(this, x + 64, 302, String(value), { size: 36, color: C.ink, strokeThickness: 0 });
    };
    stat(cx - 220, C.yellow, (g) => drawStar(g, 0, 0, 17, C.cream, null), r.score);
    stat(cx - 35, C.blue, (g) => Icons.person(g, 38), r.passengers);
    stat(cx + 150, C.red, (g) => {
      g.lineStyle(7, C.cream, 1);
      g.lineBetween(-10, -10, 10, 10);
      g.lineBetween(-10, 10, 10, -10);
    }, r.mistakes);

    // Condition and remaining petrol (both carry over to the next route)
    const drawGauge = (x0: number, w: number, k: number, fillColor: number, text: string, icon: (g: Phaser.GameObjects.Graphics) => void) => {
      const ig = this.add.graphics({ x: x0 - 24, y: 358 });
      icon(ig);
      const bar = this.add.graphics();
      bar.fillStyle(0x9a9fa8, 1);
      bar.fillRoundedRect(x0, 350, w, 16, 8);
      bar.fillStyle(fillColor, 1);
      if (k > 0) bar.fillRoundedRect(x0, 350, Math.max(14, w * k), 16, 8);
      bar.lineStyle(3, C.ink, 1);
      bar.strokeRoundedRect(x0, 350, w, 16, 8);
      label(this, x0 + w + 36, 358, text, { size: 22, color: C.ink, strokeThickness: 0 });
    };
    const hk = Math.min(Math.max(health / MAX_HEALTH, 0), 1);
    const hpColor = hk >= 0.6 ? C.green : hk >= 0.3 ? C.yellow : C.red;
    if (r.fuelActive) {
      const fuel = r.fuel ?? MAX_FUEL;
      const fk = Math.min(Math.max(fuel / MAX_FUEL, 0), 1);
      const fuelColor = fuel <= LOW_FUEL ? C.red : fk >= 0.5 ? 0x3a86ff : C.yellow;
      drawGauge(cx - 240, 150, hk, hpColor, `${health}%`, (g) => Icons.wrench(g, 28, C.ink));
      drawGauge(cx + 56, 150, fk, fuelColor, `${fuel}%`, (g) => Icons.pump(g, 28, C.ink));
    } else {
      drawGauge(cx - 118, 250, hk, hpColor, `${health}%`, (g) => Icons.wrench(g, 30, C.ink));
    }

    // Landmark postcard: a short kid-friendly fact about where we arrived
    if (landmark) {
      const cardC = this.add.container(cx, 464);
      const card = this.add.graphics();
      card.fillStyle(0xfff8e7, 1);
      card.fillRoundedRect(-300, -70, 600, 140, 20);
      card.lineStyle(4, C.ink, 1);
      card.strokeRoundedRect(-300, -70, 600, 140, 20);
      // Illustration box
      card.fillStyle(0xe8f4f8, 1);
      card.fillRoundedRect(-282, -52, 104, 104, 16);
      card.lineStyle(3, C.ink, 0.85);
      card.strokeRoundedRect(-282, -52, 104, 104, 16);
      const icon = this.add.graphics({ x: -230, y: 0 });
      drawLandmark(icon, landmark, 1);
      icon.setScale(1.05);
      // City postal stamp badge in top-right
      const stampText = label(this, 274, -44, t(cityForLevel(r.level)), { size: 16, color: C.cream, strokeThickness: 0 }).setOrigin(1, 0.5);
      const sw = stampText.width + 20;
      card.fillStyle(C.red, 1);
      card.fillRoundedRect(284 - sw, -58, sw, 28, 8);
      card.lineStyle(2, C.ink, 0.9);
      card.strokeRoundedRect(284 - sw, -58, sw, 28, 8);
      // Landmark name & story
      const lmTitle = label(this, -160, -44, t(`lm_${landmark}` as TextKey), {
        size: 23,
        color: C.blue,
        strokeThickness: 0,
        align: 'left',
        wrap: 430 - sw,
      }).setOrigin(0, 0.5);
      const fact = label(this, -160, 16, t(`fact_${landmark}` as TextKey), {
        size: 20,
        color: C.ink,
        strokeThickness: 0,
        align: 'left',
        wrap: 440,
      }).setOrigin(0, 0.5);
      cardC.add([card, icon, stampText, lmTitle, fact]);
      cardC.setInteractive(new Phaser.Geom.Rectangle(-300, -70, 600, 140), Phaser.Geom.Rectangle.Contains);
      if (cardC.input) cardC.input.cursor = 'pointer';
      cardC.on('pointerdown', () => {
        audio.select();
        this.tweens.killTweensOf(cardC);
        cardC.setScale(1);
        this.tweens.add({ targets: cardC, scale: 1.03, yoyo: true, duration: 140, ease: 'Sine.easeInOut' });
      });
    }

    // Buttons (placed cleanly below the postcard)
    new Button(this, cx - 210, 618, { r: 40, color: C.red, icon: (g, s) => Icons.home(g, s), onClick: () => this.scene.start('Menu') });
    new Button(this, cx - 105, 618, { r: 40, color: C.purple, icon: (g, s) => Icons.bus(g, s), onClick: () => this.scene.start('Garage') });
    new Button(this, cx, 618, { r: 40, color: C.orange, icon: (g, s) => Icons.retry(g, s), onClick: () => this.scene.start('Drive', { level: r.level }) });
    const next = new Button(this, cx + 175, 618, {
      w: 210,
      h: 80,
      color: C.green,
      text: t('next'),
      textSize: 34,
      // back to the map: a first-time completion gets its check mark and the bus drives on
      onClick: () => this.scene.start('Map', firstTime ? { celebrate: r.level } : undefined),
    });
    this.tweens.add({ targets: next, scale: 1.08, yoyo: true, repeat: -1, duration: 600 });
  }

  update(_: number, delta: number): void {
    const dt = delta / 1000;
    this.scroll += dt * 60;
    this.backdrop.update(this.scroll, dt);
    this.bus.x += dt * 120;
    if (this.bus.x > GAME_W + 250) this.bus.x = -250;
    this.bus.roll(dt * 120, dt, 0.3);
  }
}
