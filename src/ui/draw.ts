import Phaser from 'phaser';
import { C } from '../config';

type G = Phaser.GameObjects.Graphics;

export function starPoints(x: number, y: number, ro: number, ri: number, n = 5): Phaser.Math.Vector2[] {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const r = i % 2 === 0 ? ro : ri;
    pts.push(new Phaser.Math.Vector2(x + Math.cos(a) * r, y + Math.sin(a) * r));
  }
  return pts;
}

export function drawStar(g: G, x: number, y: number, ro: number, fill: number, stroke: number | null = C.ink, lw = 4): void {
  const pts = starPoints(x, y, ro, ro * 0.48);
  g.fillStyle(fill, 1);
  g.fillPoints(pts, true);
  if (stroke !== null) {
    g.lineStyle(lw, stroke, 1);
    g.strokePoints(pts, true, true);
  }
}

/**
 * Simple vector icons, drawn centred at (0, 0) inside a box of size `s`.
 * Keeping icons in code means no image assets and they scale crisply.
 */
export const Icons = {
  play(g: G, s: number, color: number = C.cream) {
    g.fillStyle(color, 1);
    g.fillTriangle(-s * 0.28, -s * 0.36, -s * 0.28, s * 0.36, s * 0.38, 0);
  },
  arrowRight(g: G, s: number, color: number = C.cream) {
    g.fillStyle(color, 1);
    g.fillRect(-s * 0.34, -s * 0.11, s * 0.4, s * 0.22);
    g.fillTriangle(s * 0.02, -s * 0.32, s * 0.02, s * 0.32, s * 0.38, 0);
  },
  arrowLeft(g: G, s: number, color: number = C.cream) {
    g.fillStyle(color, 1);
    g.fillRect(-s * 0.06, -s * 0.11, s * 0.4, s * 0.22);
    g.fillTriangle(-s * 0.02, -s * 0.32, -s * 0.02, s * 0.32, -s * 0.38, 0);
  },
  home(g: G, s: number, color: number = C.cream) {
    g.fillStyle(color, 1);
    g.fillTriangle(-s * 0.38, -s * 0.02, s * 0.38, -s * 0.02, 0, -s * 0.38);
    g.fillRect(-s * 0.26, -s * 0.04, s * 0.52, s * 0.36);
  },
  pause(g: G, s: number, color: number = C.cream) {
    g.fillStyle(color, 1);
    g.fillRoundedRect(-s * 0.26, -s * 0.3, s * 0.18, s * 0.6, 3);
    g.fillRoundedRect(s * 0.08, -s * 0.3, s * 0.18, s * 0.6, 3);
  },
  sound(g: G, s: number, on: boolean, color: number = C.cream) {
    g.fillStyle(color, 1);
    g.fillRect(-s * 0.34, -s * 0.12, s * 0.16, s * 0.24);
    g.fillTriangle(-s * 0.2, -s * 0.12, -s * 0.2, s * 0.12, 0, -s * 0.32);
    g.fillTriangle(-s * 0.2, s * 0.12, 0, s * 0.32, 0, -s * 0.32);
    g.lineStyle(s * 0.07, color, 1);
    if (on) {
      g.beginPath();
      g.arc(0, 0, s * 0.18, -0.9, 0.9);
      g.strokePath();
      g.beginPath();
      g.arc(0, 0, s * 0.32, -0.9, 0.9);
      g.strokePath();
    } else {
      g.lineBetween(s * 0.1, -s * 0.14, s * 0.36, s * 0.14);
      g.lineBetween(s * 0.1, s * 0.14, s * 0.36, -s * 0.14);
    }
  },
  music(g: G, s: number, on: boolean, color: number = C.cream) {
    g.fillStyle(color, 1);
    g.fillEllipse(-s * 0.16, s * 0.22, s * 0.24, s * 0.18);
    g.fillEllipse(s * 0.2, s * 0.14, s * 0.24, s * 0.18);
    g.fillRect(-s * 0.06, -s * 0.3, s * 0.07, s * 0.52);
    g.fillRect(s * 0.3, -s * 0.38, s * 0.07, s * 0.52);
    g.fillPoints(
      [
        new Phaser.Math.Vector2(-s * 0.06, -s * 0.3),
        new Phaser.Math.Vector2(s * 0.37, -s * 0.38),
        new Phaser.Math.Vector2(s * 0.37, -s * 0.24),
        new Phaser.Math.Vector2(-s * 0.06, -s * 0.16),
      ],
      true,
    );
    if (!on) {
      g.lineStyle(s * 0.08, C.red, 1);
      g.lineBetween(-s * 0.38, -s * 0.38, s * 0.38, s * 0.38);
    }
  },
  retry(g: G, s: number, color: number = C.cream) {
    g.lineStyle(s * 0.12, color, 1);
    g.beginPath();
    g.arc(0, 0, s * 0.27, -2.6, 2.2);
    g.strokePath();
    g.fillStyle(color, 1);
    const ax = Math.cos(-2.6) * s * 0.27;
    const ay = Math.sin(-2.6) * s * 0.27;
    g.fillTriangle(ax - s * 0.17, ay - s * 0.02, ax + s * 0.13, ay - s * 0.14, ax + s * 0.05, ay + s * 0.18);
  },
  /** Little bus (used for "back to the factory"). */
  bus(g: G, s: number, color: number = C.yellow) {
    g.lineStyle(Math.max(2, s * 0.05), C.ink, 1);
    g.fillStyle(color, 1);
    g.fillRoundedRect(-s * 0.4, -s * 0.26, s * 0.8, s * 0.42, { tl: s * 0.06, tr: s * 0.16, bl: s * 0.04, br: s * 0.04 });
    g.strokeRoundedRect(-s * 0.4, -s * 0.26, s * 0.8, s * 0.42, { tl: s * 0.06, tr: s * 0.16, bl: s * 0.04, br: s * 0.04 });
    g.fillStyle(C.glass, 1);
    g.fillRect(-s * 0.32, -s * 0.18, s * 0.18, s * 0.14);
    g.fillRect(-s * 0.08, -s * 0.18, s * 0.18, s * 0.14);
    g.fillRect(s * 0.16, -s * 0.18, s * 0.16, s * 0.14);
    g.fillStyle(C.ink, 1);
    g.fillCircle(-s * 0.2, s * 0.18, s * 0.1);
    g.fillCircle(s * 0.22, s * 0.18, s * 0.1);
  },
  dice(g: G, s: number) {
    g.fillStyle(C.cream, 1);
    g.fillRoundedRect(-s * 0.32, -s * 0.32, s * 0.64, s * 0.64, s * 0.12);
    g.fillStyle(C.ink, 1);
    for (const [x, y] of [[-1, -1], [1, 1], [0, 0], [1, -1], [-1, 1]] as const)
      g.fillCircle(x * s * 0.15, y * s * 0.15, s * 0.06);
  },
  backspace(g: G, s: number, color: number = C.cream) {
    g.fillStyle(color, 1);
    g.fillPoints(
      [
        new Phaser.Math.Vector2(-s * 0.38, 0),
        new Phaser.Math.Vector2(-s * 0.16, -s * 0.24),
        new Phaser.Math.Vector2(s * 0.36, -s * 0.24),
        new Phaser.Math.Vector2(s * 0.36, s * 0.24),
        new Phaser.Math.Vector2(-s * 0.16, s * 0.24),
      ],
      true,
    );
    g.lineStyle(s * 0.07, C.ink, 1);
    g.lineBetween(-s * 0.02, -s * 0.1, s * 0.2, s * 0.1);
    g.lineBetween(-s * 0.02, s * 0.1, s * 0.2, -s * 0.1);
  },
  check(g: G, s: number, color: number = C.cream) {
    g.lineStyle(s * 0.14, color, 1);
    g.beginPath();
    g.moveTo(-s * 0.3, 0);
    g.lineTo(-s * 0.08, s * 0.22);
    g.lineTo(s * 0.32, -s * 0.22);
    g.strokePath();
  },
  person(g: G, s: number, color: number = C.cream) {
    g.fillStyle(color, 1);
    g.fillCircle(0, -s * 0.2, s * 0.15);
    g.fillRoundedRect(-s * 0.2, -s * 0.02, s * 0.4, s * 0.38, { tl: s * 0.18, tr: s * 0.18, bl: 2, br: 2 });
  },
  flag(g: G, s: number) {
    g.fillStyle(C.ink, 1);
    g.fillRect(-s * 0.3, -s * 0.38, s * 0.07, s * 0.76);
    const cell = s * 0.13;
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 3; j++) {
        g.fillStyle((i + j) % 2 === 0 ? C.cream : C.ink, 1);
        g.fillRect(-s * 0.23 + i * cell, -s * 0.38 + j * cell, cell, cell);
      }
    g.lineStyle(2, C.ink, 1);
    g.strokeRect(-s * 0.23, -s * 0.38, cell * 4, cell * 3);
  },
  /** Gas pedal: green, with forward chevrons. */
  gas(g: G, s: number) {
    g.fillStyle(C.cream, 1);
    for (const dx of [-0.16, 0.12]) {
      g.fillPoints(
        [
          new Phaser.Math.Vector2(s * (dx - 0.12), -s * 0.26),
          new Phaser.Math.Vector2(s * (dx + 0.06), -s * 0.26),
          new Phaser.Math.Vector2(s * (dx + 0.24), 0),
          new Phaser.Math.Vector2(s * (dx + 0.06), s * 0.26),
          new Phaser.Math.Vector2(s * (dx - 0.12), s * 0.26),
          new Phaser.Math.Vector2(s * (dx + 0.06), 0),
        ],
        true,
      );
    }
  },
  /** Brake pedal: an open hand ("stop"). */
  brake(g: G, s: number) {
    g.fillStyle(C.cream, 1);
    g.fillRoundedRect(-s * 0.22, -s * 0.06, s * 0.44, s * 0.36, s * 0.12);
    for (let i = 0; i < 4; i++) g.fillRoundedRect(-s * 0.22 + i * s * 0.115, -s * 0.34, s * 0.09, s * 0.34, s * 0.045);
    g.fillRoundedRect(s * 0.16, -s * 0.06, s * 0.2, s * 0.09, s * 0.045);
  },
};

/** Traffic-light pictogram used in hints. */
export function drawMiniLight(g: G, s: number, lit: 'red' | 'yellow' | 'green'): void {
  g.fillStyle(C.ink, 1);
  g.fillRoundedRect(-s * 0.2, -s * 0.46, s * 0.4, s * 0.92, s * 0.1);
  const on = { red: C.red, yellow: C.yellow, green: C.green };
  (['red', 'yellow', 'green'] as const).forEach((c, i) => {
    g.fillStyle(c === lit ? on[c] : 0x555060, 1);
    g.fillCircle(0, -s * 0.3 + i * s * 0.3, s * 0.12);
  });
}

/** Round blue bus-stop sign with a little bus. */
export function drawStopSign(g: G, x: number, y: number, r: number): void {
  g.fillStyle(C.blue, 1);
  g.lineStyle(4, C.ink, 1);
  g.fillCircle(x, y, r);
  g.strokeCircle(x, y, r);
  g.fillStyle(C.cream, 1);
  g.fillRoundedRect(x - r * 0.6, y - r * 0.38, r * 1.2, r * 0.6, r * 0.12);
  g.fillStyle(C.blue, 1);
  g.fillRect(x - r * 0.48, y - r * 0.28, r * 0.28, r * 0.2);
  g.fillRect(x - r * 0.14, y - r * 0.28, r * 0.28, r * 0.2);
  g.fillRect(x + r * 0.2, y - r * 0.28, r * 0.26, r * 0.2);
  g.fillStyle(C.cream, 1);
  g.fillCircle(x - r * 0.32, y + r * 0.3, r * 0.14);
  g.fillCircle(x + r * 0.32, y + r * 0.3, r * 0.14);
}
