import type Phaser from 'phaser';
import { C } from '../config';

type G = Phaser.GameObjects.Graphics;

const WOOD = 0xb07a4a;
const WOOD_DARK = 0x8a5c36;
const METAL = 0x4a4650;
const GLASS = 0xbfe6f2;
const SHELTER_H = 158;

/** A park bench seen from the front: a back rest, a seat and two legs. `x` is the left end, `feet` the ground. */
export function drawBench(g: G, x: number, feet: number, w: number): void {
  g.lineStyle(3, C.ink, 1);
  // legs
  g.lineStyle(5, C.ink, 1);
  g.lineBetween(x + 10, feet - 30, x + 10, feet);
  g.lineBetween(x + w - 10, feet - 30, x + w - 10, feet);
  // back rest (two slats)
  g.lineStyle(3, C.ink, 1);
  for (const dy of [74, 56]) {
    g.fillStyle(WOOD, 1);
    g.fillRoundedRect(x, feet - dy, w, 14, 4);
    g.strokeRoundedRect(x, feet - dy, w, 14, 4);
  }
  g.lineStyle(4, C.ink, 1);
  g.lineBetween(x + 14, feet - 74, x + 14, feet - 34);
  g.lineBetween(x + w - 14, feet - 74, x + w - 14, feet - 34);
  // seat
  g.lineStyle(3, C.ink, 1);
  g.fillStyle(WOOD_DARK, 1);
  g.fillRoundedRect(x - 4, feet - 36, w + 8, 12, 4);
  g.strokeRoundedRect(x - 4, feet - 36, w + 8, 12, 4);
  g.lineStyle(2, C.ink, 0.5);
  for (let sx = x + 24; sx < x + w - 10; sx += 26) g.lineBetween(sx, feet - 36, sx, feet - 24);
}

/**
 * A modern bus shelter: a flat roof on two posts, see-through glass walls (you can see the passengers
 * through them) and a wooden bench inside. `x` is the left post, `w` the width, `feet` the ground.
 */
export function drawShelter(g: G, x: number, feet: number, w: number, night: boolean): void {
  const roofY = feet - SHELTER_H;

  // glass back wall: pale blue, mostly clear, with a frame and a couple of shiny streaks
  g.fillStyle(GLASS, 0.3);
  g.fillRect(x, roofY + 14, w, SHELTER_H - 14);
  g.lineStyle(3, C.ink, 0.5);
  g.strokeRect(x, roofY + 14, w, SHELTER_H - 14);
  g.lineBetween(x + w / 2, roofY + 14, x + w / 2, feet);
  g.lineStyle(7, 0xffffff, 0.35);
  g.lineBetween(x + w * 0.16, roofY + 40, x + w * 0.3, roofY + 110);
  g.lineBetween(x + w * 0.6, roofY + 40, x + w * 0.74, roofY + 110);
  g.lineStyle(3, 0xffffff, 0.35);
  g.lineBetween(x + w * 0.2, roofY + 40, x + w * 0.34, roofY + 110);
  g.lineBetween(x + w * 0.64, roofY + 40, x + w * 0.78, roofY + 110);

  // the bench inside, against the glass
  drawBench(g, x + 22, feet - 6, w - 44);

  // posts
  g.fillStyle(METAL, 1);
  g.lineStyle(3, C.ink, 1);
  for (const px of [x - 4, x + w - 4]) {
    g.fillRect(px, roofY + 8, 8, SHELTER_H - 8);
    g.strokeRect(px, roofY + 8, 8, SHELTER_H - 8);
  }

  // roof: a slab with an overhang and a yellow edge (the colour of the bus zone)
  g.fillStyle(METAL, 1);
  g.fillRoundedRect(x - 18, roofY, w + 36, 16, 5);
  g.strokeRoundedRect(x - 18, roofY, w + 36, 16, 5);
  g.fillStyle(C.yellow, 1);
  g.fillRect(x - 14, roofY + 10, w + 28, 5);
  if (night) {
    // a warm light under the roof
    g.fillStyle(C.yellow, 0.22);
    g.fillTriangle(x + 6, roofY + 16, x + w - 6, roofY + 16, x + w / 2, feet - 20);
    g.fillStyle(0xfff3b0, 1);
    g.fillRoundedRect(x + w / 2 - 22, roofY + 14, 44, 5, 2);
  }
}
