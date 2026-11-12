import Phaser from 'phaser';
import { C, GAME_W, shade } from '../config';
import { mulberry32, pick, randInt } from '../core/rng';

/**
 * All scenery is generated once at boot into textures, then used as
 * repeating TileSprites for parallax. Every texture tiles seamlessly.
 */

export const STREET_Y = 440; // top of the street texture on screen
export const GROUND_Y = 598; // where bus wheels touch the road
export const SIDEWALK_FEET_Y = 700; // where passengers stand on the near sidewalk
export const PASSENGER_VARIANTS = 8;

function make(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  return scene.make.graphics({ x: 0, y: 0 }, false);
}

function cloud(scene: Phaser.Scene): void {
  const g = make(scene);
  g.fillStyle(0xffffff, 1);
  const puff = (x: number, y: number, s: number) => {
    g.fillCircle(x + 60 * s, y + 60 * s, 40 * s);
    g.fillCircle(x + 110 * s, y + 45 * s, 50 * s);
    g.fillCircle(x + 165 * s, y + 62 * s, 38 * s);
    g.fillRoundedRect(x + 30 * s, y + 60 * s, 170 * s, 40 * s, 20 * s);
  };
  puff(20, 10, 1);
  puff(480, 60, 0.7);
  puff(800, 0, 0.85);
  g.generateTexture('cloud', 1200, 200);
  g.destroy();
}

function hills(scene: Phaser.Scene): void {
  const W = 2048;
  const Hh = 240;
  const g = make(scene);
  const layer = (color: number, base: number, amps: Array<[number, number, number]>) => {
    g.fillStyle(color, 1);
    const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(0, Hh)];
    for (let x = 0; x <= W; x += 16) {
      let y = base;
      for (const [k, a, ph] of amps) y += Math.sin((x / W) * Math.PI * 2 * k + ph) * a;
      pts.push(new Phaser.Math.Vector2(x, y));
    }
    pts.push(new Phaser.Math.Vector2(W, Hh));
    g.fillPoints(pts, true);
  };
  layer(C.hillFar, 90, [[2, 35, 0.3], [5, 14, 1.2], [9, 6, 2]]);
  layer(C.hillNear, 150, [[3, 28, 2.1], [7, 10, 0.4]]);
  g.generateTexture('hills', W, Hh);
  g.destroy();
}

function city(scene: Phaser.Scene): void {
  const W = 2048;
  const Hh = 300;
  const rng = mulberry32(42);
  const g = make(scene);
  const colors = [0xe98a6b, 0xf2c57c, 0x7fb7be, 0xd4a5a5, 0xa5b4d4, 0xe8d6a0, 0x9cc5a1];
  let x = 0;
  while (x < W) {
    let w = randInt(rng, 120, 210);
    if (W - (x + w) < 120) w = W - x;
    const h = randInt(rng, 120, 270);
    const top = Hh - h;
    const col = pick(rng, colors);
    g.fillStyle(col, 1);
    g.lineStyle(4, C.ink, 0.85);
    g.fillRect(x + 2, top, w - 4, h);
    g.strokeRect(x + 2, top, w - 4, h);
    // roof detail
    const roof = randInt(rng, 0, 2);
    g.fillStyle(shade(col, -0.25), 1);
    if (roof === 0) g.fillRect(x + 2, top - 10, w - 4, 10);
    if (roof === 1) {
      g.fillRect(x + w * 0.6, top - 30, 24, 30);
      g.strokeRect(x + w * 0.6, top - 30, 24, 30);
    }
    // windows
    const cols = Math.max(2, Math.floor((w - 20) / 34));
    const rows = Math.floor((h - 30) / 40);
    const cw = (w - 20) / cols;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const lit = rng() < 0.25;
        g.fillStyle(lit ? 0xfff3b0 : shade(col, -0.35), 1);
        g.fillRect(x + 12 + c * cw + 4, top + 18 + r * 40, cw - 10, 22);
      }
    x += w;
  }
  g.generateTexture('city', W, Hh);
  g.destroy();
}

/** Trees and lamp posts on the far sidewalk. Base of trunks at the bottom of the texture. */
function trees(scene: Phaser.Scene): void {
  const W = 1536;
  const Hh = 230;
  const rng = mulberry32(7);
  const g = make(scene);
  for (let x = 90; x < W - 60; x += randInt(rng, 170, 260)) {
    if (rng() < 0.3) {
      // retro lamp post
      g.fillStyle(0x4a4650, 1);
      g.fillRect(x - 4, 40, 8, Hh - 40);
      g.fillStyle(C.ink, 1);
      g.fillRoundedRect(x - 18, 26, 36, 20, 8);
      g.fillStyle(0xfff3b0, 1);
      g.fillCircle(x, 50, 9);
      continue;
    }
    const s = 0.75 + rng() * 0.45;
    g.fillStyle(0x8a5a3b, 1);
    g.lineStyle(4, C.ink, 1);
    g.fillRect(x - 7 * s, Hh - 80 * s, 14 * s, 80 * s);
    g.strokeRect(x - 7 * s, Hh - 80 * s, 14 * s, 80 * s);
    const leaf = pick(rng, [0x6aa84f, 0x7fb069, 0x5e9c5a]);
    g.fillStyle(leaf, 1);
    if (rng() < 0.5) {
      g.fillCircle(x, Hh - 110 * s, 48 * s);
      g.strokeCircle(x, Hh - 110 * s, 48 * s);
      g.fillStyle(shade(leaf, 0.2), 1);
      g.fillCircle(x - 16 * s, Hh - 126 * s, 14 * s);
    } else {
      const pts = [
        new Phaser.Math.Vector2(x, Hh - 200 * s),
        new Phaser.Math.Vector2(x + 44 * s, Hh - 70 * s),
        new Phaser.Math.Vector2(x - 44 * s, Hh - 70 * s),
      ];
      g.fillPoints(pts, true);
      g.strokePoints(pts, true, true);
    }
  }
  g.generateTexture('trees', W, Hh);
  g.destroy();
}

/** Far sidewalk, road with lane dashes, curb and near sidewalk. Height 280, starts at STREET_Y. */
function street(scene: Phaser.Scene): void {
  const W = 512;
  const g = make(scene);
  // far sidewalk
  g.fillStyle(C.grass, 1);
  g.fillRect(0, 0, W, 8);
  g.fillStyle(C.sidewalk, 1);
  g.fillRect(0, 8, W, 34);
  g.fillStyle(C.sidewalkJoint, 1);
  for (let x = 0; x < W; x += 64) g.fillRect(x, 8, 3, 34);
  g.fillStyle(C.curb, 1);
  g.fillRect(0, 42, W, 8);
  // road
  g.fillStyle(C.road, 1);
  g.fillRect(0, 50, W, 130);
  g.fillStyle(shade(C.road, 0.06), 1);
  for (let x = 0; x < W; x += 128) g.fillRect(x + 30, 70, 40, 3);
  g.fillStyle(C.roadLine, 1);
  for (let x = 0; x < W; x += 128) g.fillRect(x + 32, 110, 64, 6);
  // near curb + sidewalk
  g.fillStyle(C.curb, 1);
  g.fillRect(0, 180, W, 12);
  g.fillStyle(shade(C.curb, 0.3), 1);
  g.fillRect(0, 180, W, 3);
  g.fillStyle(C.sidewalk, 1);
  g.fillRect(0, 192, W, 88);
  g.fillStyle(C.sidewalkJoint, 1);
  for (let x = 0; x < W; x += 64) g.fillRect(x, 192, 3, 88);
  g.fillRect(0, 236, W, 2);
  g.generateTexture('street', W, 280);
  g.destroy();
}

/** Little people. Feet at the bottom centre of a 64×120 texture. */
function passengers(scene: Phaser.Scene): void {
  const rng = mulberry32(99);
  const shirts = [C.red, C.blue, C.green, C.orange, C.purple, 0xf15bb5, 0x2ec4b6, C.yellow];
  const skins = [0xf6d5b8, 0xe8b894, 0xc68e64, 0x8d5a3b];
  const hairs = [0x2d2a32, 0x6b3e26, 0xc58b3c, 0x9c4a2f, 0x8a8a8a];
  for (let i = 0; i < PASSENGER_VARIANTS; i++) {
    const g = make(scene);
    const kid = i % 3 === 2;
    const s = kid ? 0.75 : 1;
    const cx = 32;
    const feet = 118;
    const legH = 34 * s;
    const bodyH = 42 * s;
    const headR = 15 * s;
    g.lineStyle(3, C.ink, 1);
    // legs
    g.fillStyle(pick(rng, [0x3d405b, 0x2d2a32, 0x6d597a]), 1);
    g.fillRoundedRect(cx - 12 * s, feet - legH, 10 * s, legH, 3);
    g.fillRoundedRect(cx + 2 * s, feet - legH, 10 * s, legH, 3);
    // body
    const shirt = shirts[i % shirts.length]!;
    g.fillStyle(shirt, 1);
    const bodyTop = feet - legH - bodyH + 4;
    g.fillRoundedRect(cx - 16 * s, bodyTop, 32 * s, bodyH, { tl: 12 * s, tr: 12 * s, bl: 4, br: 4 });
    g.strokeRoundedRect(cx - 16 * s, bodyTop, 32 * s, bodyH, { tl: 12 * s, tr: 12 * s, bl: 4, br: 4 });
    // arms
    g.fillStyle(shade(shirt, -0.15), 1);
    g.fillRoundedRect(cx - 22 * s, bodyTop + 6, 8 * s, 30 * s, 4);
    g.fillRoundedRect(cx + 14 * s, bodyTop + 6, 8 * s, 30 * s, 4);
    // head
    const skin = skins[i % skins.length]!;
    const hy = bodyTop - headR + 2;
    g.fillStyle(skin, 1);
    g.fillCircle(cx, hy, headR);
    g.strokeCircle(cx, hy, headR);
    // hair or hat
    if (i % 4 === 1) {
      g.fillStyle(C.red, 1);
      g.slice(cx, hy - 2, headR + 1, Math.PI, 0, false);
      g.fillPath();
      g.fillRect(cx, hy - 4, headR + 8, 5);
    } else {
      g.fillStyle(hairs[i % hairs.length]!, 1);
      g.slice(cx, hy - 1, headR + 1, Math.PI, 0, false);
      g.fillPath();
    }
    // face
    g.fillStyle(C.ink, 1);
    g.fillCircle(cx - 5 * s, hy + 2, 2.2);
    g.fillCircle(cx + 5 * s, hy + 2, 2.2);
    g.lineStyle(2, C.ink, 1);
    g.beginPath();
    g.arc(cx, hy + 5, 5 * s, 0.3, Math.PI - 0.3);
    g.strokePath();
    g.fillStyle(0xf28482, 0.6);
    g.fillCircle(cx - 9 * s, hy + 6, 3);
    g.fillCircle(cx + 9 * s, hy + 6, 3);
    g.generateTexture(`pax${i}`, 64, 120);
    g.destroy();
  }
}

function confettiTex(scene: Phaser.Scene): void {
  const g = make(scene);
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 12, 7);
  g.generateTexture('confetti', 12, 7);
  g.destroy();
  const s = make(scene);
  s.fillStyle(0xffffff, 1);
  s.fillCircle(8, 8, 8);
  s.generateTexture('dot', 16, 16);
  s.destroy();
}

export function generateAllTextures(scene: Phaser.Scene): void {
  cloud(scene);
  hills(scene);
  city(scene);
  trees(scene);
  street(scene);
  passengers(scene);
  confettiTex(scene);
}

/** Sky, sun, clouds, hills, city, trees and street as parallax layers. */
export class Backdrop {
  private clouds: Phaser.GameObjects.TileSprite;
  private hills: Phaser.GameObjects.TileSprite;
  private city: Phaser.GameObjects.TileSprite;
  private trees: Phaser.GameObjects.TileSprite;
  private street: Phaser.GameObjects.TileSprite | null;
  private drift = 0;

  constructor(scene: Phaser.Scene, opts: { street?: boolean } = {}) {
    const sky = scene.add.graphics().setScrollFactor(0).setDepth(-10);
    sky.fillGradientStyle(C.skyTop, C.skyTop, C.skyBottom, C.skyBottom, 1);
    sky.fillRect(0, 0, GAME_W, 720);
    sky.fillStyle(C.sun, 0.35);
    sky.fillCircle(1080, 120, 80);
    sky.fillStyle(C.sun, 1);
    sky.fillCircle(1080, 120, 56);

    this.clouds = scene.add.tileSprite(0, 40, GAME_W, 200, 'cloud').setOrigin(0).setScrollFactor(0).setDepth(-9);
    this.clouds.setTileScale(1, 1).setAlpha(0.95);
    this.hills = scene.add.tileSprite(0, 200, GAME_W, 240, 'hills').setOrigin(0).setScrollFactor(0).setDepth(-8);
    this.city = scene.add.tileSprite(0, STREET_Y - 290, GAME_W, 300, 'city').setOrigin(0).setScrollFactor(0).setDepth(-7);
    this.trees = scene.add.tileSprite(0, STREET_Y + 32 - 230, GAME_W, 230, 'trees').setOrigin(0).setScrollFactor(0).setDepth(-6);
    this.street =
      opts.street === false
        ? null
        : scene.add.tileSprite(0, STREET_Y, GAME_W, 280, 'street').setOrigin(0).setScrollFactor(0).setDepth(-5);
  }

  /** scrollX: world camera x. dt in seconds (for cloud drift). */
  update(scrollX: number, dt: number): void {
    this.drift += dt * 12;
    this.clouds.tilePositionX = scrollX * 0.05 + this.drift;
    this.hills.tilePositionX = scrollX * 0.15;
    this.city.tilePositionX = scrollX * 0.4;
    this.trees.tilePositionX = scrollX * 0.85;
    if (this.street) this.street.tilePositionX = scrollX;
  }
}
