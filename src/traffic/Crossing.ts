import Phaser from 'phaser';
import { GROUND_Y, PASSENGER_VARIANTS, SIDEWALK_FEET_Y, STREET_Y } from '../ui/textures';

/** Draw order along the road: whatever stands further down the screen is in front. */
export const depthForY = (y: number): number => 10 + (y - GROUND_Y) / 1000;

const FAR_FEET_Y = STREET_Y + 38; // far sidewalk
const NEAR_FEET_Y = SIDEWALK_FEET_Y + 14; // near sidewalk, just under the bottom edge
const WALK_SPEED: readonly [number, number] = [82, 108];

interface Walker {
  img: Phaser.GameObjects.Image;
  /** -1: from the near sidewalk to the far one, +1: the other way. */
  dir: -1 | 1;
  speed: number;
}

/**
 * People who cross the road on the zebra at a traffic light. They start walking when the light turns
 * red for the cars; while anybody is still on the road the light stays red (see `busy`).
 */
export class Crossing {
  private walkers: Walker[] = [];
  private pending = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    /** World x range of the zebra. */
    readonly x0: number,
    readonly x1: number,
  ) {}

  /** Somebody is crossing (or about to start): vehicles must wait. */
  get busy(): boolean {
    return this.pending > 0 || this.walkers.length > 0;
  }

  /** 1–3 people, one after another. */
  spawnGroup(): void {
    const n = 1 + Math.floor(Math.random() * 3);
    this.pending += n;
    for (let i = 0; i < n; i++) {
      this.scene.time.delayedCall(150 + i * 380, () => {
        this.pending--;
        this.spawnOne();
      });
    }
  }

  private spawnOne(): void {
    const dir: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
    const y = dir < 0 ? NEAR_FEET_Y : FAR_FEET_Y;
    const x = this.x0 + 20 + Math.random() * (this.x1 - this.x0 - 40);
    const img = this.scene.add.image(x, y, `pax${Math.floor(Math.random() * PASSENGER_VARIANTS)}`).setOrigin(0.5, 1);
    this.scene.tweens.add({ targets: img, angle: { from: -5, to: 5 }, yoyo: true, repeat: -1, duration: 170 });
    this.walkers.push({ img, dir, speed: WALK_SPEED[0] + Math.random() * (WALK_SPEED[1] - WALK_SPEED[0]) });
    this.place(this.walkers[this.walkers.length - 1]!, y);
  }

  /** Smaller further away (far sidewalk), and in front of or behind the vehicles according to height. */
  private place(w: Walker, y: number): void {
    const k = Phaser.Math.Clamp((y - FAR_FEET_Y) / (NEAR_FEET_Y - FAR_FEET_Y), 0, 1);
    w.img.setY(y).setScale(0.5 + 0.34 * k).setDepth(depthForY(y));
  }

  update(dt: number): void {
    for (const w of this.walkers.slice()) {
      const y = w.img.y + w.dir * w.speed * dt;
      this.place(w, y);
      if ((w.dir < 0 && y <= FAR_FEET_Y) || (w.dir > 0 && y >= NEAR_FEET_Y)) {
        this.walkers.splice(this.walkers.indexOf(w), 1);
        this.scene.tweens.killTweensOf(w.img);
        this.scene.tweens.add({ targets: w.img, alpha: 0, duration: 250, onComplete: () => w.img.destroy() });
      }
    }
  }
}
