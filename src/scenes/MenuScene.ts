import Phaser from 'phaser';
import { audio } from '../audio/AudioEngine';
import { BusView } from '../bus/BusView';
import { DEFAULT_DESIGN, loadDesign } from '../bus/design';
import { C, GAME_W } from '../config';
import { loadProgress } from '../core/progress';
import { getSettings, updateSettings } from '../core/settings';
import { DICTS, LANGS, t } from '../i18n';
import { Icons } from '../ui/draw';
import { Backdrop, GROUND_Y } from '../ui/textures';
import { Button, label } from '../ui/widgets';

/** Sound + music toggles, reused by every scene. */
export function addAudioToggles(scene: Phaser.Scene, x: number, y: number): void {
  const soundBtn: Button = new Button(scene, x, y, {
    r: 34,
    color: C.blue,
    icon: (g, size) => Icons.sound(g, size, getSettings().sound),
    onClick: () => {
      updateSettings({ sound: !getSettings().sound });
      soundBtn.setIcon((g, size) => Icons.sound(g, size, getSettings().sound));
      audio.click();
    },
  });
  const musicBtn: Button = new Button(scene, x - 84, y, {
    r: 34,
    color: C.purple,
    icon: (g, size) => Icons.music(g, size, getSettings().music),
    onClick: () => {
      updateSettings({ music: !getSettings().music });
      musicBtn.setIcon((g, size) => Icons.music(g, size, getSettings().music));
    },
  });
  soundBtn.setScrollFactor(0).setDepth(90);
  musicBtn.setScrollFactor(0).setDepth(90);
}

export class MenuScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private scrollX = 0;
  private bus!: BusView;

  constructor() {
    super('Menu');
  }

  create(): void {
    audio.startMusic();
    this.scrollX = 0;
    this.backdrop = new Backdrop(this);

    const title = label(this, GAME_W / 2, 118, t('title'), { size: 92, color: C.yellow, strokeThickness: 14 });
    this.tweens.add({ targets: title, angle: { from: -2, to: 2 }, yoyo: true, repeat: -1, duration: 1400, ease: 'Sine.easeInOut' });

    const saved = loadDesign();
    this.bus = new BusView(this, GAME_W / 2 - 40, GROUND_Y, saved ?? { ...DEFAULT_DESIGN });
    this.bus.setScale(0.8);
    this.bus.setPassengers(3);
    // Tap the bus to honk — small kids love it.
    this.bus.setInteractive(new Phaser.Geom.Rectangle(-300, -400, 600, 400), Phaser.Geom.Rectangle.Contains);
    this.bus.on('pointerdown', () => {
      audio.horn();
      this.tweens.add({ targets: this.bus, scaleY: 0.74, yoyo: true, duration: 120 });
    });

    // Main play button → factory
    const play = new Button(this, GAME_W / 2 + 330, 300, {
      r: 82,
      color: C.green,
      icon: (g, s) => Icons.play(g, s),
      onClick: () => this.go('Factory'),
    });
    this.tweens.add({ targets: play, scale: { from: 1, to: 1.08 }, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });
    label(this, play.x, play.y + 112, t('play'), { size: 30 });

    // Quick start with the saved bus
    if (saved) {
      const level = loadProgress().level;
      new Button(this, GAME_W / 2 - 360, 300, {
        r: 62,
        color: C.orange,
        icon: (g, s) => Icons.flag(g, s),
        onClick: () => this.go('Drive', { level }),
      });
      label(this, GAME_W / 2 - 360, 392, `${t('drive')} · ${level}`, { size: 26 });
    }

    // Language badges
    LANGS.forEach((lang, i) => {
      const b = new Button(this, 80 + i * 124, 52, {
        w: 104,
        h: 60,
        color: getSettings().lang === lang ? C.yellow : C.cream,
        text: DICTS[lang].langBadge,
        textSize: 26,
        onClick: () => {
          updateSettings({ lang });
          this.scene.restart();
        },
      });
      b.setSelected(getSettings().lang === lang);
    });

    addAudioToggles(this, GAME_W - 56, 52);
  }

  private go(scene: string, data?: object): void {
    audio.select();
    this.cameras.main.fadeOut(250, 45, 42, 50);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene, data));
  }

  update(_: number, delta: number): void {
    const dt = delta / 1000;
    this.scrollX += dt * 90;
    this.backdrop.update(this.scrollX, dt);
    this.bus.roll(dt * 90, dt, 0.25);
  }
}
