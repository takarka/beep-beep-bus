import Phaser from 'phaser';
import { audio } from '../audio/AudioEngine';
import { BusView } from '../bus/BusView';
import { DEFAULT_DESIGN, loadDesign } from '../bus/design';
import { DRIVE_SCALE } from '../bus/geometry';
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

const ASSIST_OFF = 0xb9b0a0;

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
    const design = saved ?? { ...DEFAULT_DESIGN };
    this.bus = new BusView(this, GAME_W / 2, GROUND_Y, design);
    this.bus.setScale(DRIVE_SCALE[design.body]);
    this.bus.setPassengers(3);
    // Tap the bus to honk: small kids love it.
    this.bus.setInteractive(new Phaser.Geom.Rectangle(-420, -400, 840, 400), Phaser.Geom.Rectangle.Contains);
    this.bus.on('pointerdown', () => {
      audio.horn();
      const s = this.bus.scaleX;
      this.tweens.add({ targets: this.bus, scaleY: s * 0.93, yoyo: true, duration: 120, onComplete: () => this.bus.setScale(s) });
    });

    // Play: straight to the route if the bus is already built, otherwise to the factory.
    const play = new Button(this, GAME_W - 190, 290, {
      r: 82,
      color: C.green,
      icon: (g, s) => Icons.play(g, s),
      onClick: () => this.go(saved ? 'Drive' : 'Factory', saved ? { level: loadProgress().level } : undefined),
    });
    this.tweens.add({ targets: play, scale: { from: 1, to: 1.08 }, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });
    label(this, play.x, play.y + 112, t('play'), { size: 30 });
    if (saved) label(this, play.x, play.y + 150, `${t('level')} ${loadProgress().level}`, { size: 22, strokeThickness: 4 });

    // Edit the bus: always reachable from here (and from pause / results)
    new Button(this, 190, 290, {
      r: 62,
      color: C.purple,
      icon: (g, s) => Icons.bus(g, s),
      onClick: () => this.go('Factory'),
    });
    label(this, 190, 290 + 94, t('myBus'), { size: 28 });

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

    // Fullscreen (not available on iPhone Safari: there the game is installed to the home screen instead)
    if (this.scale.fullscreen.available) {
      new Button(this, GAME_W - 224, 52, {
        r: 34,
        color: C.orange,
        icon: (g, s) => Icons.fullscreen(g, s),
        onClick: () => {
          this.scale.toggleFullscreen();
          const lock = (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock;
          if (lock) void lock.call(screen.orientation, 'landscape').catch(() => undefined);
        },
      });
    }

    // "Helper" mode for the youngest players: the bus brakes by itself.
    const helper: Button = new Button(this, 70, 650, {
      r: 36,
      color: getSettings().assist ? C.green : ASSIST_OFF,
      icon: (g, s) => Icons.wheel(g, s),
      onClick: () => {
        const on = !getSettings().assist;
        updateSettings({ assist: on });
        helper.setColor(on ? C.green : ASSIST_OFF);
      },
    });
    label(this, 118, 650, t('assist'), { size: 28, color: C.ink, stroke: C.cream, strokeThickness: 5 }).setOrigin(0, 0.5);
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
