import Phaser from 'phaser';
import { mix, shade } from '../config';
import { mulberry32, pick, randInt, type Rng } from '../core/rng';
import type { Env, Palette } from '../core/world';

/**
 * The city behind the road, in two parallax layers: a hazy far skyline and the nearer buildings.
 * Every city has its own mix of buildings (Astana: glass towers and spires, Almaty: old blocks and
 * houses, Shymkent: low houses and domes), so the routes do not all look the same.
 */

export const CITY_W = 2048;
/** Height of the near-buildings texture (it sits with its bottom on the far sidewalk). */
export const CITY_H = 340;
export const SKYLINE_H = 260;

type G = Phaser.GameObjects.Graphics;
type Kind = 'block' | 'tower' | 'house' | 'domed' | 'stepped';

interface Ctx {
  g: G;
  rng: Rng;
  p: Palette;
  env: Env;
  night: boolean;
  snow: number;
}

const WEIGHTS: Record<string, Array<[Kind, number]>> = {
  astana: [['tower', 0.36], ['block', 0.28], ['stepped', 0.16], ['domed', 0.08], ['house', 0.12]],
  almaty: [['block', 0.42], ['house', 0.26], ['stepped', 0.12], ['tower', 0.1], ['domed', 0.1]],
  shymkent: [['house', 0.36], ['domed', 0.2], ['block', 0.3], ['stepped', 0.1], ['tower', 0.04]],
  default: [['block', 0.4], ['tower', 0.2], ['house', 0.2], ['stepped', 0.12], ['domed', 0.08]],
};

function pickKind(rng: Rng, city: string | undefined): Kind {
  const table = WEIGHTS[city ?? 'default'] ?? WEIGHTS.default!;
  let r = rng();
  for (const [k, w] of table) {
    r -= w;
    if (r <= 0) return k;
  }
  return 'block';
}

const make = (scene: Phaser.Scene): G => scene.make.graphics({ x: 0, y: 0 }, false);

const OUTLINE = 4;

function glass(c: Ctx, wall: number, lit: boolean): number {
  if (lit) return 0xfff3b0;
  return c.night ? shade(wall, -0.5) : mix(0x8fc3d9, shade(wall, -0.2), 0.4);
}

/** A grid of windows; `arched` windows have a round top, `balconies` get a little railing under each row. */
function windows(c: Ctx, wall: number, x: number, top: number, w: number, h: number, o: { rowH?: number; arched?: boolean; balconies?: boolean; strips?: boolean } = {}): void {
  const { g, rng, p } = c;
  const rowH = o.rowH ?? 40;
  const colW = o.strips ? Math.max(40, w / 3) : 34;
  const cols = Math.max(1, Math.floor((w - 16) / colW));
  const rows = Math.max(1, Math.floor((h - 26) / rowH));
  const cw = (w - 16) / cols;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const lit = rng() < p.litWindowChance;
      const wx = x + 8 + col * cw + 5;
      const wy = top + 16 + r * rowH;
      const ww = cw - 10;
      const wh = o.strips ? rowH * 0.42 : 22;
      g.fillStyle(glass(c, wall, lit), 1);
      if (o.arched) {
        g.fillRect(wx, wy + ww / 2, ww, wh - ww / 2 + 4);
        g.slice(wx + ww / 2, wy + ww / 2, ww / 2, Math.PI, 0, false);
        g.fillPath();
      } else g.fillRect(wx, wy, ww, wh);
      if (!lit && !c.night) {
        g.fillStyle(0xffffff, 0.45);
        g.fillRect(wx + 2, wy + 2, Math.max(3, ww * 0.25), 4);
      }
      if (o.balconies) {
        g.fillStyle(shade(wall, -0.3), 1);
        g.fillRect(wx - 3, wy + wh + 1, ww + 6, 4);
      }
    }
  }
}

function snowCap(c: Ctx, x: number, y: number, w: number): void {
  if (c.env.season !== 'winter') return;
  c.g.fillStyle(c.snow, 1);
  c.g.fillRoundedRect(x - 2, y - 7, w + 4, 11, 5);
}

/** Things on a roof: a water tank, air-conditioners, an antenna (with a red light at night) or a billboard. */
function roofExtras(c: Ctx, x: number, top: number, w: number, wall: number): void {
  const { g, rng, p } = c;
  const kind = randInt(rng, 0, 4);
  const dark = shade(wall, -0.3);
  g.lineStyle(3, p.ink, 0.85);
  if (kind === 0) {
    // water tank on legs
    const tx = x + w * (0.25 + rng() * 0.4);
    g.fillStyle(dark, 1);
    g.fillRoundedRect(tx, top - 34, 34, 24, 6);
    g.strokeRoundedRect(tx, top - 34, 34, 24, 6);
    g.lineBetween(tx + 5, top - 10, tx + 5, top);
    g.lineBetween(tx + 29, top - 10, tx + 29, top);
  } else if (kind === 1) {
    // air-conditioner boxes
    for (let i = 0; i < 2; i++) {
      g.fillStyle(0xdfe3e8, 1);
      g.fillRect(x + 14 + i * 30, top - 14, 24, 14);
      g.strokeRect(x + 14 + i * 30, top - 14, 24, 14);
    }
  } else if (kind === 2) {
    // antenna
    const ax = x + w * (0.3 + rng() * 0.4);
    g.lineStyle(3, p.ink, 0.9);
    g.lineBetween(ax, top, ax, top - 46);
    g.lineBetween(ax - 10, top - 32, ax + 10, top - 32);
    g.lineBetween(ax - 7, top - 20, ax + 7, top - 20);
    if (c.night) {
      g.fillStyle(0xff5a5a, 1);
      g.fillCircle(ax, top - 48, 3.5);
    }
  } else if (kind === 3) {
    // a little billboard
    const bx = x + w * 0.2;
    g.lineStyle(3, p.ink, 0.9);
    g.lineBetween(bx + 14, top, bx + 14, top - 14);
    g.lineBetween(bx + 56, top, bx + 56, top - 14);
    g.fillStyle(pick(rng, p.buildings), 1);
    g.fillRoundedRect(bx, top - 44, 70, 32, 5);
    g.strokeRoundedRect(bx, top - 44, 70, 32, 5);
    g.fillStyle(0xffffff, 0.8);
    g.fillRect(bx + 10, top - 34, 30, 5);
    g.fillRect(bx + 10, top - 25, 46, 4);
  }
}

function block(c: Ctx, x: number, w: number, bottom: number): void {
  const { g, rng, p } = c;
  const h = randInt(rng, 130, 250);
  const top = bottom - h;
  const col = pick(rng, p.buildings);
  g.fillStyle(col, 1);
  g.lineStyle(OUTLINE, p.ink, 0.85);
  g.fillRect(x + 2, top, w - 4, h);
  g.strokeRect(x + 2, top, w - 4, h);
  // a darker roof band and a pale stripe along the middle floors
  g.fillStyle(shade(col, -0.22), 1);
  g.fillRect(x + 2, top, w - 4, 12);
  if (rng() < 0.5) {
    g.fillStyle(shade(col, 0.35), 1);
    g.fillRect(x + 2, top + h * 0.5 - 3, w - 4, 6);
  }
  snowCap(c, x + 2, top, w - 4);
  windows(c, col, x, top + 8, w, h - 8, { arched: rng() < 0.3, balconies: rng() < 0.4 });
  // an entrance with a small canopy
  g.fillStyle(shade(col, -0.4), 1);
  g.fillRect(x + w / 2 - 12, bottom - 30, 24, 30);
  g.fillStyle(pick(rng, [0xe63946, 0x3a86ff, 0x57cc99]), 1);
  g.fillRect(x + w / 2 - 20, bottom - 36, 40, 8);
  if (rng() < 0.7) roofExtras(c, x, top, w, col);
}

function tower(c: Ctx, x: number, w: number, bottom: number): void {
  const { g, rng, p } = c;
  const bw = Math.min(w, 150);
  const bx = x + (w - bw) / 2;
  const h = randInt(rng, 210, 280);
  const top = bottom - h;
  // a glassy tower: bluish-grey walls, bands of windows, a stepped top and a spire
  const col = mix(pick(rng, p.buildings), 0x8fb8d8, 0.55);
  g.fillStyle(col, 1);
  g.lineStyle(OUTLINE, p.ink, 0.85);
  g.fillRect(bx, top, bw, h);
  g.strokeRect(bx, top, bw, h);
  g.fillStyle(shade(col, 0.22), 1);
  g.fillRect(bx + bw * 0.62, top, bw * 0.38, h); // lit side
  g.lineStyle(OUTLINE - 1, p.ink, 0.85);
  g.strokeRect(bx, top, bw, h);
  windows(c, col, bx, top + 10, bw, h - 10, { rowH: 30, strips: true });
  // crown
  g.fillStyle(shade(col, -0.2), 1);
  g.lineStyle(OUTLINE - 1, p.ink, 0.85);
  g.fillRect(bx + bw * 0.2, top - 18, bw * 0.6, 18);
  g.strokeRect(bx + bw * 0.2, top - 18, bw * 0.6, 18);
  g.fillTriangle(bx + bw * 0.38, top - 18, bx + bw * 0.62, top - 18, bx + bw / 2, top - 78);
  g.lineStyle(3, p.ink, 0.9);
  g.lineBetween(bx + bw / 2, top - 78, bx + bw / 2, top - 98);
  if (c.night) {
    g.fillStyle(0xff5a5a, 1);
    g.fillCircle(bx + bw / 2, top - 100, 3.5);
  }
  snowCap(c, bx, top, bw);
  // a lower neighbour wing
  if (w > bw + 30 && rng() < 0.8) {
    const wh = randInt(rng, 70, 110);
    g.fillStyle(shade(col, -0.1), 1);
    g.lineStyle(OUTLINE, p.ink, 0.85);
    g.fillRect(x + 2, bottom - wh, bx - x - 2, wh);
    g.strokeRect(x + 2, bottom - wh, bx - x - 2, wh);
    windows(c, col, x, bottom - wh, bx - x, wh, { rowH: 30, strips: true });
  }
}

function house(c: Ctx, x: number, w: number, bottom: number): void {
  const { g, rng, p } = c;
  const h = randInt(rng, 90, 150);
  const top = bottom - h;
  const col = pick(rng, p.buildings);
  g.fillStyle(col, 1);
  g.lineStyle(OUTLINE, p.ink, 0.85);
  g.fillRect(x + 4, top, w - 8, h);
  g.strokeRect(x + 4, top, w - 8, h);
  // pitched roof
  const roofCol = pick(rng, c.night ? [0x6b3a3a, 0x3d405b] : [0xc4452d, 0x8a5a3b, 0x3d6f8a]);
  g.fillStyle(roofCol, 1);
  g.fillTriangle(x - 2, top + 2, x + w + 2, top + 2, x + w / 2, top - 46);
  g.strokeTriangle(x - 2, top + 2, x + w + 2, top + 2, x + w / 2, top - 46);
  if (c.env.season === 'winter') {
    g.fillStyle(c.snow, 1);
    g.fillTriangle(x + w / 2 - 38, top - 18, x + w / 2 + 38, top - 18, x + w / 2, top - 44);
  }
  // upper window and a ground-floor shop with a striped awning and a sign
  windows(c, col, x + 4, top, w - 8, 56, { rowH: 40 });
  const shopY = bottom - 44;
  g.fillStyle(glass(c, col, rng() < p.litWindowChance + 0.2), 1);
  g.fillRect(x + 14, shopY + 8, w - 28, 36);
  const a = pick(rng, [0xe63946, 0x3a86ff, 0x57cc99, 0xf4a261]);
  const stripes = Math.max(3, Math.floor((w - 20) / 14));
  const sw = (w - 20) / stripes;
  g.lineStyle(2, p.ink, 0.8);
  for (let i = 0; i < stripes; i++) {
    g.fillStyle(i % 2 ? 0xffffff : a, 1);
    g.fillRect(x + 10 + i * sw, shopY - 2, sw, 14);
    g.strokeRect(x + 10 + i * sw, shopY - 2, sw, 14);
  }
  if (rng() < 0.6) {
    // chimney
    g.fillStyle(shade(col, -0.3), 1);
    g.lineStyle(3, p.ink, 0.85);
    g.fillRect(x + w * 0.7, top - 40, 14, 30);
    g.strokeRect(x + w * 0.7, top - 40, 14, 30);
  }
}

/** A mosque-like building: a hall, a big dome and two slim minarets. */
function domed(c: Ctx, x: number, w: number, bottom: number): void {
  const { g, rng, p } = c;
  const bw = Math.min(w, 200);
  const bx = x + (w - bw) / 2;
  const h = randInt(rng, 100, 130);
  const top = bottom - h;
  const col = pick(rng, c.night ? p.buildings : [0xf6ecd3, 0xe8d6a0, 0xf2e3c8]);
  const dome = c.night ? 0x4a7a8a : 0x2ec4b6;
  g.fillStyle(col, 1);
  g.lineStyle(OUTLINE, p.ink, 0.85);
  g.fillRect(bx + 24, top, bw - 48, h);
  g.strokeRect(bx + 24, top, bw - 48, h);
  // dome
  g.fillStyle(dome, 1);
  g.slice(bx + bw / 2, top, bw * 0.3, Math.PI, 0, false);
  g.fillPath();
  g.beginPath();
  g.arc(bx + bw / 2, top, bw * 0.3, Math.PI, 0, false);
  g.strokePath();
  g.fillStyle(0xffd23f, 1);
  g.fillRect(bx + bw / 2 - 2, top - bw * 0.3 - 18, 4, 18);
  g.fillCircle(bx + bw / 2, top - bw * 0.3 - 20, 5);
  // minarets
  for (const mx of [bx + 8, bx + bw - 20]) {
    g.fillStyle(col, 1);
    g.fillRect(mx, top - 50, 12, h + 50);
    g.strokeRect(mx, top - 50, 12, h + 50);
    g.fillStyle(dome, 1);
    g.fillTriangle(mx - 3, top - 50, mx + 15, top - 50, mx + 6, top - 86);
    g.fillStyle(0xffd23f, 1);
    g.fillRect(mx - 2, top - 30, 16, 5);
  }
  // arched door and windows
  g.fillStyle(shade(col, -0.45), 1);
  g.fillRect(bx + bw / 2 - 14, bottom - 46, 28, 46);
  g.slice(bx + bw / 2, bottom - 46, 14, Math.PI, 0, false);
  g.fillPath();
  for (const wx of [bx + 40, bx + bw - 58]) {
    g.fillStyle(glass(c, col, rng() < p.litWindowChance + 0.25), 1);
    g.fillRect(wx, top + 24, 18, 26);
    g.slice(wx + 9, top + 24, 9, Math.PI, 0, false);
    g.fillPath();
  }
  snowCap(c, bx + 24, top, bw - 48);
}

/** Two stacked blocks, the upper one narrower, with a pale cornice between them. */
function stepped(c: Ctx, x: number, w: number, bottom: number): void {
  const { g, rng, p } = c;
  const h1 = randInt(rng, 90, 130);
  const h2 = randInt(rng, 70, 110);
  const col = pick(rng, p.buildings);
  g.fillStyle(col, 1);
  g.lineStyle(OUTLINE, p.ink, 0.85);
  g.fillRect(x + 2, bottom - h1, w - 4, h1);
  g.strokeRect(x + 2, bottom - h1, w - 4, h1);
  windows(c, col, x, bottom - h1, w, h1, { balconies: true });
  const uw = w * 0.62;
  const ux = x + (w - uw) / 2;
  g.fillStyle(shade(col, 0.12), 1);
  g.fillRect(ux, bottom - h1 - h2, uw, h2);
  g.strokeRect(ux, bottom - h1 - h2, uw, h2);
  g.fillStyle(shade(col, -0.25), 1);
  g.fillRect(x - 2, bottom - h1 - 8, w + 4, 10);
  windows(c, col, ux, bottom - h1 - h2, uw, h2, { arched: true });
  g.fillStyle(shade(col, -0.25), 1);
  g.fillRect(ux - 3, bottom - h1 - h2 - 8, uw + 6, 10);
  snowCap(c, ux, bottom - h1 - h2 - 8, uw);
  if (rng() < 0.6) roofExtras(c, ux, bottom - h1 - h2 - 8, uw, col);
}

const DRAW: Record<Kind, (c: Ctx, x: number, w: number, bottom: number) => void> = { block, tower, house, domed, stepped };
const WIDTH: Record<Kind, [number, number]> = { block: [130, 210], tower: [130, 190], house: [110, 170], domed: [180, 230], stepped: [130, 200] };

/** The nearer buildings: all kinds, side by side, filling the texture exactly so it tiles. */
export function makeCity(scene: Phaser.Scene, env: Env, p: Palette, key: string): void {
  const g = make(scene);
  const rng = mulberry32(42 + (env.city === 'almaty' ? 1 : env.city === 'shymkent' ? 2 : env.city === 'astana' ? 3 : 0));
  const night = env.time === 'night';
  const c: Ctx = { g, rng, p, env, night, snow: night ? 0x9aa6c4 : 0xf4f8fb };
  let x = 0;
  let last: Kind | null = null;
  while (x < CITY_W) {
    let kind = pickKind(rng, env.city);
    if (kind === last && kind !== 'block') kind = 'block'; // no two of the same fancy kind in a row
    const [lo, hi] = WIDTH[kind];
    let w = randInt(rng, lo, hi);
    if (CITY_W - (x + w) < 120) w = CITY_W - x;
    DRAW[kind](c, x, w, CITY_H);
    last = kind;
    x += w;
  }
  g.generateTexture(key, CITY_W, CITY_H);
  g.destroy();
}

/** A hazy skyline far behind: only silhouettes, almost the colour of the sky. */
export function makeSkyline(scene: Phaser.Scene, env: Env, p: Palette, key: string): void {
  const g = make(scene);
  const rng = mulberry32(1234 + (env.city === 'almaty' ? 1 : env.city === 'shymkent' ? 2 : 0));
  const haze = env.city === 'shymkent' ? 0.62 : 0.7;
  const col = mix(shade(p.buildings[2] ?? 0x7fb7be, -0.1), p.skyBottom, haze);
  const dark = mix(col, p.skyBottom, 0.25);
  let x = 0;
  while (x < CITY_W) {
    let w = randInt(rng, 70, 150);
    if (CITY_W - (x + w) < 70) w = CITY_W - x;
    const h = randInt(rng, 70, 200);
    const tall = rng() < 0.18 && env.city !== 'shymkent';
    g.fillStyle(rng() < 0.5 ? col : dark, 1);
    g.fillRect(x, SKYLINE_H - h, w, h);
    if (tall) {
      // a tower with a spire
      g.fillRect(x + w * 0.3, SKYLINE_H - h - 40, w * 0.4, 40);
      g.fillTriangle(x + w * 0.38, SKYLINE_H - h - 40, x + w * 0.62, SKYLINE_H - h - 40, x + w / 2, SKYLINE_H - h - 100);
    } else if (rng() < 0.25) {
      // a dome
      g.slice(x + w / 2, SKYLINE_H - h, w * 0.3, Math.PI, 0, false);
      g.fillPath();
    }
    // a few lit windows far away at night
    if (env.time === 'night') {
      g.fillStyle(0xfff3b0, 0.55);
      for (let i = 0; i < 6; i++) g.fillRect(x + 6 + rng() * (w - 14), SKYLINE_H - h + 10 + rng() * (h - 20), 4, 5);
    }
    x += w;
  }
  g.generateTexture(key, CITY_W, SKYLINE_H);
  g.destroy();
}
