import Phaser from "phaser";
import { audio } from "../audio/AudioEngine";
import { BusView } from "../bus/BusView";
import {
  GARAGE_SIZE,
  freshStatus,
  loadGarage,
  removeBus,
  saveGarage,
  selectBus,
} from "../bus/garage";
import { BODY_SIZE } from "../bus/geometry";
import { C, GAME_W } from "../config";
import { LOW_FUEL, MAX_FUEL, MAX_HEALTH } from "../core/rules";
import { t } from "../i18n";
import { Icons } from "../ui/draw";
import { createScenery, currentEnv } from "../ui/scenery";
import { Button, label } from "../ui/widgets";
import { addAudioToggles } from "./MenuScene";

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
    super("Garage");
  }

  create(): void {
    this.cameras.main.fadeIn(200, 45, 42, 50);
    this.scrollX = 0;
    this.confirmSlot = null;
    const env = currentEnv();
    audio.setMusicTheme('menu', { night: env.time === 'night' });
    audio.setMusicIntensity(0.35);
    this.backdrop = createScenery(this, env, { behindUi: true });
    const garage = loadGarage();

    label(this, GAME_W / 2, 78, t("garage"), {
      size: 64,
      color: C.yellow,
      strokeThickness: 10,
    });
    new Button(this, 56, 52, {
      r: 34,
      color: C.red,
      icon: (g, s) => Icons.home(g, s),
      onClick: () => this.scene.start("Menu"),
    });
    addAudioToggles(this, GAME_W - 56, 52);

    for (let i = 0; i < GARAGE_SIZE; i++) {
      const x = GAME_W / 2 + (i - 1) * CARD_GAP;
      const design = garage.slots[i];
      const selected = design !== null && garage.current === i;

      const card = this.add.graphics();
      card.fillStyle(C.cream, 0.97);
      card.fillRoundedRect(
        x - CARD_W / 2,
        CARD_Y - CARD_H / 2,
        CARD_W,
        CARD_H,
        28,
      );
      card.lineStyle(6, C.ink, 1);
      card.strokeRoundedRect(
        x - CARD_W / 2,
        CARD_Y - CARD_H / 2,
        CARD_W,
        CARD_H,
        28,
      );
      if (selected) {
        card.lineStyle(10, C.yellow, 1);
        card.strokeRoundedRect(
          x - CARD_W / 2 - 8,
          CARD_Y - CARD_H / 2 - 8,
          CARD_W + 16,
          CARD_H + 16,
          34,
        );
      }
      label(
        this,
        x - CARD_W / 2 + 34,
        CARD_Y - CARD_H / 2 + 34,
        String(i + 1),
        { size: 30, color: C.ink, strokeThickness: 0 },
      );

      if (!design) {
        // Empty place: one big "+" builds a new bus here
        const plus = new Button(this, x, CARD_Y, {
          r: 70,
          color: C.green,
          icon: (g, s) => Icons.plus(g, s),
          onClick: () => this.go("Factory", { slot: i }),
        });
        this.tweens.add({
          targets: plus,
          scale: { from: 1, to: 1.06 },
          yoyo: true,
          repeat: -1,
          duration: 800,
          ease: "Sine.easeInOut",
        });
        continue;
      }

      // Bus preview; tapping the card makes it the current bus
      const st = garage.status[i] ?? freshStatus();
      const { L, H } = BODY_SIZE[design.body];
      const s = Math.min(290 / (L + 30), 155 / (H + 60));
      const bus = new BusView(
        this,
        x,
        CARD_Y - 70 + (H + 40) * s * 0.5,
        design,
      );
      bus.setScale(s);
      bus.setDamage(1 - st.health / MAX_HEALTH);

      // Compact condition & petrol gauges for this bus
      const barY = CARD_Y + 38;
      const mini = (
        bx: number,
        k: number,
        fill: number,
        icon: (g: Phaser.GameObjects.Graphics) => void,
      ) => {
        const ig = this.add.graphics({ x: bx, y: barY });
        icon(ig);
        const bw = 96;
        card.fillStyle(0x9a9fa8, 1);
        card.fillRoundedRect(bx + 18, barY - 7, bw, 14, 6);
        card.fillStyle(fill, 1);
        if (k > 0)
          card.fillRoundedRect(bx + 18, barY - 7, Math.max(12, bw * k), 14, 6);
        card.lineStyle(2.5, C.ink, 1);
        card.strokeRoundedRect(bx + 18, barY - 7, bw, 14, 6);
      };
      const hk = st.health / MAX_HEALTH;
      const fk = st.fuel / MAX_FUEL;
      mini(
        x - 128,
        hk,
        hk >= 0.6 ? C.green : hk >= 0.3 ? C.yellow : C.red,
        (g) => Icons.wrench(g, 22, C.ink),
      );
      mini(
        x + 14,
        fk,
        st.fuel <= LOW_FUEL ? C.red : fk >= 0.5 ? 0x3a86ff : C.yellow,
        (g) => Icons.pump(g, 22, C.ink),
      );

      const pick = this.add.zone(x, CARD_Y - 55, CARD_W, 220).setInteractive();
      pick.on("pointerup", () => {
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
          this.go("Map");
        },
      });
      new Button(this, x, by, {
        r: 38,
        color: C.orange,
        icon: (g, sz) => Icons.pencil(g, sz),
        onClick: () => this.go("Factory", { slot: i }),
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
