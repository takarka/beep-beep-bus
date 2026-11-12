import Phaser from 'phaser';
import { audio } from '../audio/AudioEngine';
import { BusView } from '../bus/BusView';
import { GARAGE_SIZE, loadGarage, removeBus, saveGarage, selectBus } from '../bus/garage';
import { BODY_SIZE } from '../bus/geometry';
import { C, GAME_W } from '../config';
import { t } from '../i18n';
import { Icons } from '../ui/draw';
import { createScenery, currentEnv } from '../ui/scenery';
import { Button, label } from '../ui/widgets';
import { addAudioToggles } from './MenuScene';

const CARD_W = 340;
const CARD_H = 330;
const CARD_Y = 385;
const CARD_GAP = 380;

/** Up to three saved buses: pick one to drive, edit it, delete it, or build a new one. */
export class GarageScene extends Phaser.Scene {
  private backdrop!: ReturnType<typeof createScenery>;
  private scrollX = 0;
  private confirmSlot: number | null = null;

  constructor() {
    super('Garage');
  }

  create(): void {
    this.cameras.main.fadeIn(200, 45, 42, 50);
    this.scrollX = 0;
    this.confirmSlot = null;
    this.backdrop = createScenery(this, currentEnv(), { behindUi: true });
    const garage = loadGarage();

    label(this, GAME_W / 2, 78, t('garage'), { size: 64, color: C.yellow, strokeThickness: 10 });
    new Button(this, 56, 52, { r: 34, color: C.red, icon: (g, s) => Icons.home(g, s), onClick: () => this.scene.start('Menu') });
    addAudioToggles(this, GAME_W - 56, 52);

    for (let i = 0; i < GARAGE_SIZE; i++) {
      const x = GAME_W / 2 + (i - 1) * CARD_GAP;
      const design = garage.slots[i];
      const selected = design !== null && garage.current === i;

      const card = this.add.graphics();
      card.fillStyle(C.cream, 0.97);
      card.fillRoundedRect(x - CARD_W / 2, CARD_Y - CARD_H / 2, CARD_W, CARD_H, 28);
      card.lineStyle(6, C.ink, 1);
      card.strokeRoundedRect(x - CARD_W / 2, CARD_Y - CARD_H / 2, CARD_W, CARD_H, 28);
      if (selected) {
        card.lineStyle(10, C.yellow, 1);
        card.strokeRoundedRect(x - CARD_W / 2 - 8, CARD_Y - CARD_H / 2 - 8, CARD_W + 16, CARD_H + 16, 34);
      }
      label(this, x - CARD_W / 2 + 34, CARD_Y - CARD_H / 2 + 34, String(i + 1), { size: 30, color: C.ink, strokeThickness: 0 });

      if (!design) {
        // Empty place: one big "+" builds a new bus here
        const plus = new Button(this, x, CARD_Y, {
          r: 70,
          color: C.green,
          icon: (g, s) => Icons.plus(g, s),
          onClick: () => this.go('Factory', { slot: i }),
        });
        this.tweens.add({ targets: plus, scale: { from: 1, to: 1.06 }, yoyo: true, repeat: -1, duration: 800, ease: 'Sine.easeInOut' });
        continue;
      }

      // Bus preview; tapping the card makes it the current bus
      const { L, H } = BODY_SIZE[design.body];
      const s = Math.min(290 / (L + 30), 175 / (H + 60));
      const bus = new BusView(this, x, CARD_Y - 55 + (H + 40) * s * 0.5, design);
      bus.setScale(s);
      const pick = this.add.zone(x, CARD_Y - 55, CARD_W, 220).setInteractive();
      pick.on('pointerup', () => {
        if (selected) return;
        audio.select();
        saveGarage(selectBus(garage, i));
        this.scene.restart();
      });

      const by = CARD_Y + 105;
      new Button(this, x - 90, by, {
        r: 38,
        color: C.green,
        icon: (g, sz) => Icons.play(g, sz),
        onClick: () => {
          saveGarage(selectBus(garage, i));
          this.go('Map');
        },
      });
      new Button(this, x, by, {
        r: 38,
        color: C.orange,
        icon: (g, sz) => Icons.pencil(g, sz),
        onClick: () => this.go('Factory', { slot: i }),
      });
      const del: Button = new Button(this, x + 90, by, {
        r: 38,
        color: 0xb9b0a0,
        icon: (g, sz) => Icons.cross(g, sz),
        onClick: () => {
          // Two taps, so a small finger can't delete a bus by accident.
          if (this.confirmSlot === i) {
            audio.oops();
            saveGarage(removeBus(garage, i));
            this.scene.restart();
            return;
          }
          this.confirmSlot = i;
          del.setColor(C.red);
          del.setIcon((g, sz) => Icons.check(g, sz));
          this.time.delayedCall(2500, () => {
            if (this.confirmSlot !== i) return;
            this.confirmSlot = null;
            del.setColor(0xb9b0a0);
            del.setIcon((g, sz) => Icons.cross(g, sz));
          });
        },
      });
    }
  }

  private go(scene: string, data?: object): void {
    audio.select();
    this.scene.start(scene, data);
  }

  update(_: number, delta: number): void {
    const dt = delta / 1000;
    this.scrollX += dt * 40;
    this.backdrop.update(this.scrollX, dt);
  }
}
