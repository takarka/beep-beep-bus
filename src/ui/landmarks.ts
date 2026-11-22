import Phaser from 'phaser';
import { C } from '../config';
import type { LandmarkId } from '../core/campaign';

type G = Phaser.GameObjects.Graphics;

const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
const GOLD = 0xe6b84a;
const SKY = 0x8fd0e8;
const BRICK = 0xe98a6b;
const SILVER = 0xc3c8cf;

/**
 * Simple vector drawings of Astana's landmarks, centred at (0, 0) in a box of about 64×64.
 * `a` fades the picture (locked levels).
 */
export function drawLandmark(g: G, id: LandmarkId, a = 1): void {
  g.lineStyle(3, C.ink, a);
  const fill = (c: number) => g.fillStyle(c, a);
  switch (id) {
    case 'station': {
      fill(BRICK);
      g.fillRect(-28, -4, 56, 28);
      g.strokeRect(-28, -4, 56, 28);
      fill(C.blue);
      g.fillRect(-32, -10, 64, 8);
      g.strokeRect(-32, -10, 64, 8);
      fill(C.cream);
      g.fillRect(-7, -30, 14, 22);
      g.strokeRect(-7, -30, 14, 22);
      fill(C.ink);
      g.fillCircle(0, -20, 4);
      fill(C.glass);
      for (const x of [-20, 6, 14]) g.fillRect(x, 4, 8, 12);
      break;
    }
    case 'concert': {
      fill(C.cream);
      g.fillRect(-28, 4, 56, 20);
      g.strokeRect(-28, 4, 56, 20);
      fill(SKY);
      g.slice(0, 6, 30, Math.PI, 0, false);
      g.fillPath();
      g.beginPath();
      g.arc(0, 6, 30, Math.PI, 0, false);
      g.strokePath();
      fill(C.ink);
      for (const x of [-18, -6, 6, 18]) g.fillRect(x - 2, 8, 4, 16);
      break;
    }
    case 'triumph': {
      fill(C.cream);
      for (const x of [-28, 14]) {
        g.fillRect(x, -22, 14, 46);
        g.strokeRect(x, -22, 14, 46);
      }
      g.fillRect(-28, -28, 56, 14);
      g.strokeRect(-28, -28, 56, 14);
      fill(C.ink);
      g.fillRect(-12, -10, 24, 34);
      fill(GOLD);
      g.fillCircle(0, -21, 5);
      break;
    }
    case 'shatyr': {
      fill(SKY);
      g.fillPoints([V(-30, 24), V(-4, -18), V(0, -24), V(4, -18), V(30, 24)], true);
      g.strokePoints([V(-30, 24), V(-4, -18), V(0, -24), V(4, -18), V(30, 24)], true, true);
      g.lineStyle(3, C.ink, a);
      g.lineBetween(0, -24, 0, -34);
      g.lineStyle(2, C.ink, a * 0.6);
      g.lineBetween(-12, 24, -2, -14);
      g.lineBetween(12, 24, 2, -14);
      break;
    }
    case 'peace': {
      fill(GOLD);
      g.fillPoints([V(-30, 24), V(0, -28), V(30, 24)], true);
      g.strokePoints([V(-30, 24), V(0, -28), V(30, 24)], true, true);
      g.lineStyle(2, C.ink, a * 0.6);
      for (const y of [-6, 6, 16]) g.lineBetween(-((y + 28) * 30) / 52, y, ((y + 28) * 30) / 52, y);
      fill(SKY);
      g.fillCircle(0, 4, 5);
      break;
    }
    case 'baiterek': {
      fill(C.cream);
      g.fillPoints([V(-4, 26), V(-2, -6), V(2, -6), V(4, 26)], true);
      g.strokePoints([V(-4, 26), V(-2, -6), V(2, -6), V(4, 26)], true, true);
      g.lineStyle(3, C.ink, a);
      g.lineBetween(-14, -6, -2, 4);
      g.lineBetween(14, -6, 2, 4);
      fill(GOLD);
      g.fillCircle(0, -18, 14);
      g.strokeCircle(0, -18, 14);
      fill(0xffffff);
      g.fillCircle(-5, -23, 4);
      break;
    }
    case 'akorda': {
      fill(C.cream);
      g.fillRect(-28, 4, 56, 20);
      g.strokeRect(-28, 4, 56, 20);
      fill(C.blue);
      g.slice(0, 4, 18, Math.PI, 0, false);
      g.fillPath();
      g.beginPath();
      g.arc(0, 4, 18, Math.PI, 0, false);
      g.strokePath();
      g.lineStyle(3, GOLD, a);
      g.lineBetween(0, -14, 0, -26);
      fill(C.ink);
      for (const x of [-20, -8, 4, 16]) g.fillRect(x, 10, 5, 14);
      break;
    }
    case 'mosque': {
      fill(C.cream);
      g.fillRect(-18, 2, 36, 22);
      g.strokeRect(-18, 2, 36, 22);
      g.slice(0, 2, 18, Math.PI, 0, false);
      g.fillPath();
      g.beginPath();
      g.arc(0, 2, 18, Math.PI, 0, false);
      g.strokePath();
      for (const x of [-30, 22]) {
        fill(C.cream);
        g.fillRect(x, -14, 8, 38);
        g.strokeRect(x, -14, 8, 38);
        fill(GOLD);
        g.fillTriangle(x - 1, -14, x + 9, -14, x + 4, -26);
      }
      fill(GOLD);
      g.fillCircle(0, -20, 3);
      break;
    }
    case 'kazakheli': {
      fill(SILVER);
      for (const x of [-18, 10]) {
        g.fillRect(x, -18, 8, 42);
        g.strokeRect(x, -18, 8, 42);
      }
      g.fillRect(-26, 20, 52, 6);
      g.strokeRect(-26, 20, 52, 6);
      fill(GOLD);
      g.fillPoints([V(-26, -20), V(0, -32), V(26, -20), V(0, -10)], true);
      g.strokePoints([V(-26, -20), V(0, -32), V(26, -20), V(0, -10)], true, true);
      break;
    }
    case 'nuralem': {
      fill(SILVER);
      g.fillCircle(0, -4, 25);
      g.strokeCircle(0, -4, 25);
      g.lineStyle(2, C.ink, a * 0.5);
      g.strokeEllipse(0, -4, 22, 50);
      g.lineBetween(-25, -4, 25, -4);
      g.lineBetween(-20, -16, 20, -16);
      g.lineBetween(-20, 8, 20, 8);
      fill(0xffffff);
      g.fillCircle(-9, -14, 5);
      fill(C.cream);
      g.fillRect(-12, 20, 24, 7);
      g.lineStyle(3, C.ink, a);
      g.strokeRect(-12, 20, 24, 7);
      break;
    }
    case 'arena': {
      fill(C.cream);
      g.fillEllipse(0, 4, 62, 40);
      g.strokeEllipse(0, 4, 62, 40);
      fill(C.green);
      g.fillEllipse(0, 4, 38, 20);
      g.lineStyle(2, 0xffffff, a);
      g.strokeEllipse(0, 4, 38, 20);
      g.lineBetween(0, -6, 0, 14);
      g.lineStyle(3, C.ink, a);
      g.beginPath();
      g.arc(0, 4, 31, Math.PI * 1.05, Math.PI * 1.95, false);
      g.strokePath();
      break;
    }
    case 'airport': {
      fill(C.cream);
      g.fillEllipse(0, 0, 60, 14);
      g.strokeEllipse(0, 0, 60, 14);
      fill(C.blue);
      g.fillPoints([V(-6, -2), V(8, -2), V(-14, -28), V(-22, -28)], true);
      g.fillPoints([V(-6, 2), V(8, 2), V(-14, 28), V(-22, 28)], true);
      g.fillPoints([V(-26, -2), V(-18, -2), V(-30, -14), V(-34, -14)], true);
      fill(C.ink);
      for (const x of [-4, 6, 16]) g.fillCircle(x, -1, 2);
      break;
    }
    case 'koktobe': {
      fill(0x5ea85b);
      g.fillPoints([V(-30, 26), V(-6, -2), V(30, 26)], true);
      g.strokePoints([V(-30, 26), V(-6, -2), V(30, 26)], true, true);
      // Cable line & tiny cabin
      g.lineStyle(2, C.ink, a);
      g.lineBetween(-28, -18, -6, -2);
      fill(C.red);
      g.fillRoundedRect(-24, -18, 11, 8, 2);
      g.strokeRoundedRect(-24, -18, 11, 8, 2);
      // TV tower
      g.lineStyle(3, C.ink, a);
      fill(SILVER);
      g.fillRect(6, -26, 7, 46);
      g.strokeRect(6, -26, 7, 46);
      g.lineBetween(9.5, -26, 9.5, -34);
      fill(C.red);
      g.fillRoundedRect(2, -20, 15, 6, 2);
      g.strokeRoundedRect(2, -20, 15, 6, 2);
      fill(C.cream);
      g.fillRoundedRect(3, -10, 13, 5, 2);
      g.strokeRoundedRect(3, -10, 13, 5, 2);
      break;
    }
    case 'medeu': {
      fill(0x9eb4cc);
      g.fillPoints([V(-30, 12), V(-12, -26), V(8, 12)], true);
      g.strokePoints([V(-30, 12), V(-12, -26), V(8, 12)], true, true);
      g.fillPoints([V(-4, 12), V(14, -22), V(30, 12)], true);
      g.strokePoints([V(-4, 12), V(14, -22), V(30, 12)], true, true);
      fill(0xffffff);
      g.fillTriangle(-12, -26, -18, -14, -6, -14);
      g.fillTriangle(14, -22, 8, -10, 20, -10);
      fill(C.cream);
      g.fillRect(-26, 2, 52, 10);
      g.strokeRect(-26, 2, 52, 10);
      fill(SKY);
      g.fillEllipse(0, 18, 56, 17);
      g.strokeEllipse(0, 18, 56, 17);
      g.lineStyle(2, 0xffffff, a * 0.85);
      g.strokeEllipse(0, 18, 38, 9);
      break;
    }
    case 'shymbulak': {
      fill(0xe3edf5);
      g.fillPoints([V(-30, 24), V(-10, -24), V(10, 24)], true);
      g.strokePoints([V(-30, 24), V(-10, -24), V(10, 24)], true, true);
      fill(0xf4f8fb);
      g.fillPoints([V(-6, 24), V(14, -28), V(30, 24)], true);
      g.strokePoints([V(-6, 24), V(14, -28), V(30, 24)], true, true);
      // Alpine chalet
      fill(0x8a5a3b);
      g.fillRect(6, 11, 18, 13);
      g.strokeRect(6, 11, 18, 13);
      fill(C.red);
      g.fillTriangle(4, 11, 15, 3, 26, 11);
      // Gondola cable & cabin
      g.lineStyle(2, C.ink, a);
      g.lineBetween(-28, -19, 26, -7);
      fill(C.red);
      g.fillRoundedRect(-12, -19, 14, 10, 3);
      g.strokeRoundedRect(-12, -19, 14, 10, 3);
      fill(C.glass);
      g.fillRect(-9, -17, 8, 4);
      break;
    }
    case 'circus': {
      fill(C.red);
      g.slice(0, 7, 28, Math.PI, 0, false);
      g.fillPath();
      g.beginPath();
      g.arc(0, 7, 28, Math.PI, 0, false);
      g.strokePath();
      g.lineStyle(2, C.cream, a * 0.85);
      for (const dx of [-12, 0, 12]) g.lineBetween(0, -20, dx, 7);
      g.lineStyle(3, C.ink, a);
      fill(C.cream);
      g.fillRect(-26, 7, 52, 17);
      g.strokeRect(-26, 7, 52, 17);
      fill(C.ink);
      g.fillRoundedRect(-7, 11, 14, 13, { tl: 7, tr: 7, bl: 0, br: 0 });
      fill(GOLD);
      g.fillCircle(0, -22, 4);
      g.strokeCircle(0, -22, 4);
      break;
    }
    case 'panfilov': {
      // Green park trees flanking the cathedral
      fill(0x5ea85b);
      g.fillCircle(-24, 12, 10);
      g.strokeCircle(-24, 12, 10);
      g.fillCircle(24, 12, 10);
      g.strokeCircle(24, 12, 10);
      // Cathedral body & green roof
      fill(GOLD);
      g.fillRect(-17, -2, 34, 26);
      g.strokeRect(-17, -2, 34, 26);
      fill(C.green);
      g.fillPoints([V(-20, -2), V(0, -22), V(20, -2)], true);
      g.strokePoints([V(-20, -2), V(0, -22), V(20, -2)], true, true);
      fill(GOLD);
      g.fillCircle(0, -25, 5);
      g.strokeCircle(0, -25, 5);
      fill(C.cream);
      for (const x of [-9, 5]) g.fillRect(x, 6, 4, 10);
      break;
    }
    case 'almaty_station': {
      fill(C.cream);
      g.fillRect(-28, -4, 56, 28);
      g.strokeRect(-28, -4, 56, 28);
      fill(C.green);
      g.fillRect(-32, -10, 64, 7);
      g.strokeRect(-32, -10, 64, 7);
      fill(C.cream);
      g.fillRect(-11, -18, 22, 42);
      g.strokeRect(-11, -18, 22, 42);
      fill(C.ink);
      g.fillCircle(0, -11, 3.5);
      g.fillRoundedRect(-7, 6, 14, 18, { tl: 7, tr: 7, bl: 0, br: 0 });
      fill(C.glass);
      for (const x of [-22, 16]) g.fillRect(x, 2, 6, 12);
      break;
    }
    case 'dendropark': {
      // Classic archway & stream beneath lush trees
      fill(C.cream);
      g.fillRect(-16, -4, 32, 8);
      g.strokeRect(-16, -4, 32, 8);
      g.fillRect(-14, 4, 6, 16);
      g.fillRect(8, 4, 6, 16);
      fill(0x5ea85b);
      g.fillCircle(-18, -8, 13);
      g.strokeCircle(-18, -8, 13);
      g.fillCircle(18, -10, 14);
      g.strokeCircle(18, -10, 14);
      fill(0x7fb069);
      g.fillCircle(0, -16, 12);
      g.strokeCircle(0, -16, 12);
      fill(SKY);
      g.fillEllipse(0, 22, 34, 8);
      g.strokeEllipse(0, 22, 34, 8);
      break;
    }
    case 'baidibek': {
      fill(0x9a8f80);
      g.fillPoints([V(-28, 26), V(0, 4), V(28, 26)], true);
      g.strokePoints([V(-28, 26), V(0, 4), V(28, 26)], true, true);
      fill(C.cream);
      g.fillRect(-8, 10, 16, 16);
      fill(GOLD);
      g.fillRect(-5, -18, 10, 30);
      g.strokeRect(-5, -18, 10, 30);
      g.lineStyle(4, GOLD, a);
      g.lineBetween(-16, -21, 16, -21);
      g.lineStyle(3, C.ink, a);
      g.fillCircle(0, -26, 5);
      g.strokeCircle(0, -26, 5);
      break;
    }
    case 'citadel': {
      fill(0xdcb877);
      g.fillRect(-20, -8, 40, 32);
      g.strokeRect(-20, -8, 40, 32);
      for (const x of [-28, 16]) {
        g.fillRect(x, -16, 12, 40);
        g.strokeRect(x, -16, 12, 40);
      }
      for (const x of [-16, -4, 8]) {
        g.fillRect(x, -14, 7, 6);
        g.strokeRect(x, -14, 7, 6);
      }
      fill(0x6b3e26);
      g.fillRoundedRect(-8, 6, 16, 18, { tl: 8, tr: 8, bl: 0, br: 0 });
      g.strokeRoundedRect(-8, 6, 16, 18, { tl: 8, tr: 8, bl: 0, br: 0 });
      break;
    }
    case 'tulip': {
      fill(SKY);
      g.fillEllipse(0, 20, 52, 12);
      g.strokeEllipse(0, 20, 52, 12);
      fill(0x5ea85b);
      g.fillRect(-3, -2, 6, 20);
      g.strokeRect(-3, -2, 6, 20);
      fill(C.red);
      g.fillCircle(-6, -12, 9);
      g.fillCircle(6, -12, 9);
      g.fillCircle(0, -10, 10);
      g.strokeCircle(0, -10, 10);
      fill(C.yellow);
      g.fillTriangle(-6, -16, 0, -26, 6, -16);
      break;
    }
    case 'shymkent_zoo': {
      fill(C.orange);
      g.fillRect(-26, -14, 10, 38);
      g.strokeRect(-26, -14, 10, 38);
      g.fillRect(16, -14, 10, 38);
      g.strokeRect(16, -14, 10, 38);
      fill(C.yellow);
      g.fillRoundedRect(-30, -22, 60, 11, 4);
      g.strokeRoundedRect(-30, -22, 60, 11, 4);
      // Giraffe peeking between the posts
      fill(GOLD);
      g.fillRect(-3, -4, 6, 26);
      g.strokeRect(-3, -4, 6, 26);
      g.fillEllipse(2, -7, 12, 8);
      g.strokeEllipse(2, -7, 12, 8);
      break;
    }
    case 'shymkent_airport': {
      fill(C.cream);
      g.fillRect(-26, 2, 52, 22);
      g.strokeRect(-26, 2, 52, 22);
      fill(C.orange);
      g.fillRoundedRect(-30, -4, 60, 8, 4);
      g.strokeRoundedRect(-30, -4, 60, 8, 4);
      fill(C.glass);
      g.fillRect(-20, 6, 40, 9);
      // Climbing jet
      fill(C.cream);
      g.fillEllipse(-4, -18, 36, 9);
      g.strokeEllipse(-4, -18, 36, 9);
      fill(C.orange);
      g.fillPoints([V(-6, -18), V(4, -18), V(-10, -30), V(-16, -30)], true);
      break;
    }
  }
}

export function drawLock(g: G, s: number): void {
  g.lineStyle(s * 0.12, C.ink, 1);
  g.beginPath();
  g.arc(0, -s * 0.08, s * 0.2, Math.PI, 0, false);
  g.strokePath();
  g.fillStyle(0x9a9fa8, 1);
  g.fillRoundedRect(-s * 0.3, -s * 0.08, s * 0.6, s * 0.42, s * 0.08);
  g.lineStyle(s * 0.07, C.ink, 1);
  g.strokeRoundedRect(-s * 0.3, -s * 0.08, s * 0.6, s * 0.42, s * 0.08);
  g.fillStyle(C.ink, 1);
  g.fillCircle(0, s * 0.1, s * 0.06);
}
