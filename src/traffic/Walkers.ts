import Phaser from 'phaser';
import { GAME_W } from '../config';
import { mulberry32, type Rng } from '../core/rng';
import { PASSENGER_VARIANTS, STREET_Y, WALK_FRAMES } from '../ui/textures';

/**
 * Townspeople walking along both pavements: grown-ups, children, pairs, some with a dog, some under an
 * umbrella in the rain. They only decorate the street (they never step on the road) and keep it alive.
 * Each one is shown from the side, walking in the direction they go, in a eight-picture walking cycle; a honk makes the people on the screen jump.
 */

const NEAR_SCALE = 0.8;
const FAR_SCALE = 0.4;
const FAR_FEET: [number, number] = [STREET_Y + 26, STREET_Y + 38];
const NEAR_FEET: [number, number] = [660, 700];
const UMBRELLA_TINTS = [0xe63946, 0x3a86ff, 0xf4a261, 0x57cc99, 0x9d4edd, 0xffd23f];

interface Walker {
  img: Phaser.GameObjects.Image;
  dog: Phaser.GameObjects.Image | null;
  umbrella: Phaser.GameObjects.Image | null;
  variant: number;
  x: number;
  dir: 1 | -1;
  speed: number;
  feetY: number;
  scale: number;
  far: boolean;
  phase: number;
  /** Standing still for a moment (looking around), in seconds. */
  pause: number;
  /** 0..1 while jumping after a honk. */
  hop: number;
}

export interface WalkerOpts {
  night: boolean;
  rainy: boolean;
}

export class Walkers {
  private walkers: Walker[] = [];
  private rng: Rng = mulberry32(Math.floor(Math.random() * 1e9));
  private timer = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly opts: WalkerOpts,
  ) {}

  private target(far: boolean): number {
    const base = far ? 4 : 5;
    return Math.max(1, Math.round(base * (this.opts.night ? 0.55 : 1) * (this.opts.rainy ? 0.7 : 1)));
  }

  /** People already out when the route starts. */
  prewarm(scrollX: number): void {
    for (const far of [false, true]) for (let i = 0; i < this.target(far); i++) this.spawn(far, scrollX + this.rng() * GAME_W);
  }

  private spawn(far: boolean, x0: number, dirIn?: 1 | -1, speedIn?: number, kid?: boolean): void {
    let x = x0;
    const rng = this.rng;
    const dir = dirIn ?? (rng() < 0.5 ? 1 : -1);
    const scale = far ? FAR_SCALE : NEAR_SCALE;
    // keep people apart: if somebody is already there, step aside a little (children walk right beside their parent)
    if (!kid) for (let tries = 0; tries < 8 && this.walkers.some((o) => o.far === far && Math.abs(o.x - x) < 110 * scale + 40); tries++) x += (rng() < 0.5 ? -1 : 1) * (90 + rng() * 120);
    let variant = Math.floor(rng() * PASSENGER_VARIANTS);
    if (kid) variant = rng() < 0.5 ? 2 : 5; // the two children
    const feetY = (far ? FAR_FEET : NEAR_FEET)[0] + rng() * ((far ? FAR_FEET : NEAR_FEET)[1] - (far ? FAR_FEET : NEAR_FEET)[0]);
    const depth = far ? -4.8 + feetY / 100000 : 20 + (feetY - 650) / 1000;
    const img = this.scene.add.image(x, feetY, `side${variant}_1`).setOrigin(0.5, 1).setScale(scale).setDepth(depth);
    const speed = speedIn ?? (far ? 22 + rng() * 22 : 34 + rng() * 38);
    let dog: Phaser.GameObjects.Image | null = null;
    if (!kid && rng() < 0.16) dog = this.scene.add.image(x, feetY, 'dogB').setOrigin(0.5, 1).setScale(scale * 0.8).setDepth(depth);
    let umbrella: Phaser.GameObjects.Image | null = null;
    if (this.opts.rainy) {
      umbrella = this.scene.add
        .image(x, feetY - 96 * scale, 'umbrella')
        .setOrigin(0.5, 1)
        .setScale(scale * 1.1)
        .setTint(UMBRELLA_TINTS[Math.floor(rng() * UMBRELLA_TINTS.length)]!)
        .setDepth(depth + 0.0001);
    }
    this.walkers.push({ img, dog, umbrella, variant, x, dir, speed, feetY, scale, far, phase: rng() * 4, pause: 0, hop: 0 });
    // sometimes a parent with a child, walking together
    if (!kid && !dog && rng() < 0.18) this.spawn(far, x - dir * 34 * scale * 1.2, dir, speed, true);
  }

  update(dt: number, scrollX: number): void {
    // fill up from just outside the screen, walking towards or along it
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.5;
      for (const far of [false, true]) {
        if (this.walkers.filter((w) => w.far === far).length >= this.target(far)) continue;
        const r = this.rng();
        if (r < 0.45) this.spawn(far, scrollX + GAME_W + 120 + this.rng() * 300, -1);
        else if (r < 0.75) this.spawn(far, scrollX - 140 - this.rng() * 200, 1);
        else this.spawn(far, scrollX + GAME_W + 120 + this.rng() * 300, 1);
      }
    }

    this.walkers = this.walkers.filter((w) => {
      const gone = w.x < scrollX - 450 || w.x > scrollX + GAME_W + 900;
      if (gone) this.destroy(w);
      return !gone;
    });

    for (const w of this.walkers) {
      if (w.pause > 0) {
        w.pause -= dt;
      } else {
        w.x += w.dir * w.speed * dt;
        w.phase += (dt * w.speed) / (w.far ? 3 : 6);
        if (this.rng() < dt * 0.04) w.pause = 0.8 + this.rng() * 1.8; // now and then somebody stops to look around
      }
      if (w.hop > 0) w.hop = Math.max(0, w.hop - dt / 0.35);
      const frame = Math.floor(w.phase) % WALK_FRAMES;
      const standing = w.pause > 0;
      const bob = 0; // the pictures already rise and dip with each step
      const jump = Math.sin(Math.PI * (1 - w.hop)) * (w.hop > 0 ? 18 * w.scale : 0);
      // walking people are seen from the side, facing where they go; standing ones turn to look at the street
      w.img.setTexture(standing ? `pax${w.variant}` : `side${w.variant}_${frame}`);
      w.img.setFlipX(!standing && w.dir < 0);
      w.img.setPosition(w.x, w.feetY - bob - jump);
      w.img.setAngle(0);
      if (w.dog) {
        w.dog.setTexture(standing || Math.floor(frame / 2) % 2 === 1 ? 'dogB' : 'dogA');
        w.dog.setFlipX(w.dir < 0);
        w.dog.setPosition(w.x + w.dir * 52 * w.scale, w.feetY - (standing ? 0 : bob * 0.6));
      }
      if (w.umbrella) w.umbrella.setPosition(w.x, w.feetY - bob - jump - 90 * w.scale);
    }
  }

  /** The bus honks: everybody on the screen hops for a moment. */
  honk(scrollX: number): void {
    for (const w of this.walkers) {
      if (w.x > scrollX - 40 && w.x < scrollX + GAME_W + 40) {
        w.hop = 1;
        w.pause = Math.max(w.pause, 0.5);
      }
    }
  }

  private destroy(w: Walker): void {
    w.img.destroy();
    w.dog?.destroy();
    w.umbrella?.destroy();
  }
}
