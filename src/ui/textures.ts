import Phaser from 'phaser';
import { C, GAME_W, luminance, mix, shade } from '../config';
import { mulberry32, pick, randInt } from '../core/rng';
import { envKey, paletteFor, type Env, type Palette } from '../core/world';
import { LANE_Y } from '../traffic/lanes';
import { CITY_H, SKYLINE_H, makeCity, makeSkyline } from './cityscape';

/**
 * All scenery is generated once at boot into textures, then used as
 * repeating TileSprites for parallax. Every texture tiles seamlessly.
 */

export const STREET_Y = 440; // top of the street texture on screen
export const GROUND_Y = LANE_Y.main; // where bus wheels touch the road
export const SIDEWALK_FEET_Y = 700; // where passengers stand on the near sidewalk
export const PASSENGER_VARIANTS = 9;
/** How high the hips of a sitting passenger are above the feet in the texture (px, grown-up). */
export const SIT_HIP = 28;

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

type Gen = (scene: Phaser.Scene, env: Env, p: Palette, key: string) => void;

const hills: Gen = (scene, env, p, key) => {
  const W = 2048;
  const Hh = 240;
  const g = make(scene);
  const night = env.time === 'night';
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
  if (env.city === 'almaty') {
    const peakCol = night ? 0x3b486e : 0x9eb4cc;
    const snowCol = night ? 0x9aa6c4 : 0xf4f8fb;
    const peakXs = [0, 170, 340, 520, 710, 880, 1080, 1260, 1460, 1650, 1840, 2048];
    const peakHs = [110, 28, 120, 18, 105, 36, 118, 22, 100, 32, 112, 110];
    const mPts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(0, Hh)];
    for (let i = 0; i < peakXs.length; i++) mPts.push(new Phaser.Math.Vector2(peakXs[i]!, peakHs[i]!));
    mPts.push(new Phaser.Math.Vector2(W, Hh));
    g.fillStyle(peakCol, 1);
    g.fillPoints(mPts, true);
    g.fillStyle(snowCol, 1);
    for (let i = 1; i < peakXs.length - 1; i += 2) {
      const px = peakXs[i]!;
      const py = peakHs[i]!;
      const lx = peakXs[i - 1]!;
      const ly = peakHs[i - 1]!;
      const rx = peakXs[i + 1]!;
      const ry = peakHs[i + 1]!;
      const k = 0.42;
      g.fillTriangle(px, py, px + (lx - px) * k, py + (ly - py) * k, px + (rx - px) * k, py + (ry - py) * k);
    }
  }
  layer(p.hillFar, 90, [[2, 35, 0.3], [5, 14, 1.2], [9, 6, 2]]);
  layer(p.hillNear, 150, [[3, 28, 2.1], [7, 10, 0.4]]);
  g.generateTexture(key, W, Hh);
  g.destroy();
};

/** Trees and lamp posts on the far sidewalk. Base of trunks at the bottom of the texture. */
const trees: Gen = (scene, env, p, key) => {
  const W = 1536;
  const Hh = 230;
  const rng = mulberry32(7);
  const decor = mulberry32(21);
  const g = make(scene);
  const night = env.time === 'night';
  const winter = env.season === 'winter';
  const snow = night ? 0x9aa6c4 : 0xf4f8fb;
  for (let x = 90; x < W - 60; x += randInt(rng, 170, 260)) {
    if (rng() < 0.3) {
      // retro lamp post: glows at night
      g.fillStyle(night ? 0x2b2d44 : 0x4a4650, 1);
      g.fillRect(x - 4, 40, 8, Hh - 40);
      g.fillStyle(p.ink, 1);
      g.fillRoundedRect(x - 18, 26, 36, 20, 8);
      if (night) {
        g.fillStyle(0xfff3b0, 0.18);
        g.fillCircle(x, 52, 52);
        g.fillStyle(0xfff3b0, 0.3);
        g.fillCircle(x, 52, 30);
      }
      g.fillStyle(0xfff3b0, 1);
      g.fillCircle(x, 50, 9);
      continue;
    }
    const s = 0.75 + rng() * 0.45;
    const leaf = pick(rng, p.foliage);
    const round = rng() < 0.5;
    g.lineStyle(4, p.ink, 1);
    g.fillStyle(p.trunk, 1);
    g.fillRect(x - 7 * s, Hh - 80 * s, 14 * s, 80 * s);
    g.strokeRect(x - 7 * s, Hh - 80 * s, 14 * s, 80 * s);
    if (round && winter) {
      // bare winter tree with snowy branches
      g.lineStyle(5, p.ink, 1);
      for (const [dx, dy] of [[-38, -125], [38, -125], [-18, -160], [18, -160], [0, -175]] as const) {
        g.lineBetween(x, Hh - 80 * s, x + dx * s, Hh + dy * s);
        g.fillStyle(snow, 1);
        g.fillCircle(x + dx * s, Hh + dy * s, 6 * s);
      }
    } else if (round) {
      g.fillStyle(leaf, 1);
      g.fillCircle(x, Hh - 110 * s, 48 * s);
      g.strokeCircle(x, Hh - 110 * s, 48 * s);
      g.fillStyle(shade(leaf, night ? 0.1 : 0.2), 1);
      g.fillCircle(x - 16 * s, Hh - 126 * s, 14 * s);
      if (env.season === 'spring') {
        // cherry blossom
        g.fillStyle(night ? 0xb98aa6 : 0xf7b6d2, 1);
        for (let i = 0; i < 9; i++) {
          const a = decor() * Math.PI * 2;
          const r = decor() * 40 * s;
          g.fillCircle(x + Math.cos(a) * r, Hh - 110 * s + Math.sin(a) * r, 4.5 * s);
        }
      }
    } else {
      const pts = [
        new Phaser.Math.Vector2(x, Hh - 200 * s),
        new Phaser.Math.Vector2(x + 44 * s, Hh - 70 * s),
        new Phaser.Math.Vector2(x - 44 * s, Hh - 70 * s),
      ];
      g.fillStyle(winter ? p.foliage[0]! : leaf, 1);
      g.fillPoints(pts, true);
      g.strokePoints(pts, true, true);
      if (winter) {
        g.fillStyle(snow, 1);
        g.fillTriangle(x, Hh - 200 * s + 2, x + 17 * s, Hh - 150 * s, x - 17 * s, Hh - 150 * s);
        g.fillTriangle(x - 8 * s, Hh - 128 * s, x + 26 * s, Hh - 110 * s, x - 30 * s, Hh - 104 * s);
      }
    }
  }
  g.generateTexture(key, W, Hh);
  g.destroy();
};

/** Far sidewalk, road with lane dashes, curb and near sidewalk. Height 280, starts at STREET_Y. */
const street: Gen = (scene, env, p, key) => {
  const W = 512;
  const g = make(scene);
  const rng = mulberry32(5);
  const night = env.time === 'night';
  // far sidewalk
  g.fillStyle(p.grass, 1);
  g.fillRect(0, 0, W, 8);
  if (env.season === 'spring' || (env.city === 'shymkent' && env.season !== 'winter')) {
    const spots: ReadonlyArray<readonly [number, number]> = env.city === 'shymkent'
      ? [[22, C.red], [58, C.yellow], [105, C.red], [154, C.orange], [202, C.red], [260, C.yellow], [312, C.red], [365, C.orange], [420, C.red], [472, C.yellow]]
      : [[30, 0xf7b6d2], [110, 0xffd23f], [190, 0xffffff], [280, 0xf7b6d2], [360, 0xffd23f], [450, 0xffffff]];
    for (const [fx, c] of spots) {
      g.fillStyle(night ? mix(c, 0x1b2048, 0.4) : c, 1);
      g.fillCircle(fx, 3.5, env.city === 'shymkent' ? 3.4 : 2.6);
    }
  }
  g.fillStyle(p.sidewalk, 1);
  g.fillRect(0, 8, W, 34);
  g.fillStyle(p.sidewalkJoint, 1);
  for (let x = 0; x < W; x += 64) g.fillRect(x, 8, 3, 34);
  g.fillStyle(p.curb, 1);
  g.fillRect(0, 42, W, 8);
  // road
  g.fillStyle(p.road, 1);
  g.fillRect(0, 50, W, 130);
  // four lanes: a dashed line between the two lanes of each direction, a double yellow line in the middle
  g.fillStyle(p.roadLine, 1);
  for (let x = 0; x < W; x += 128) {
    g.fillRect(x + 32, 80, 64, 4);
    g.fillRect(x + 32, 146, 64, 4);
  }
  g.fillStyle(night ? 0xc9a93a : 0xf2c230, 1);
  g.fillRect(0, 111, W, 3);
  g.fillRect(0, 117, W, 3);
  // Bus lane "А" marking on the curb lane (visual only; all traffic still uses this lane)
  g.lineStyle(4.5, p.roadLine, night ? 0.65 : 0.85);
  const ax = 256;
  g.beginPath();
  g.moveTo(ax - 15, 176);
  g.lineTo(ax + 2, 154);
  g.lineTo(ax + 15, 176);
  g.strokePath();
  g.lineBetween(ax - 9, 168, ax + 10, 168);
  if (env.precip && env.season !== 'winter') {
    // wet road: soft puddle shines
    g.fillStyle(0xffffff, night ? 0.1 : 0.14);
    for (const [px, py, pw] of [[60, 134, 90], [250, 66, 70], [400, 164, 80], [170, 98, 60]] as const) g.fillEllipse(px, py, pw, 9);
  }
  // near curb + sidewalk
  g.fillStyle(p.curb, 1);
  g.fillRect(0, 180, W, 12);
  g.fillStyle(shade(p.curb, 0.3), 1);
  g.fillRect(0, 180, W, 3);
  g.fillStyle(p.sidewalk, 1);
  g.fillRect(0, 192, W, 88);
  g.fillStyle(p.sidewalkJoint, 1);
  for (let x = 0; x < W; x += 64) g.fillRect(x, 192, 3, 88);
  g.fillRect(0, 236, W, 2);
  if (env.season === 'autumn') {
    for (let i = 0; i < 14; i++) {
      g.fillStyle(pick(rng, p.foliage), 1);
      g.fillEllipse(10 + rng() * (W - 20), 196 + rng() * 76, 12, 6);
    }
  }
  if (env.season === 'winter') {
    g.fillStyle(night ? 0x9aa6c4 : 0xffffff, 1);
    for (const [mx, mw] of [[70, 110], [200, 80], [330, 120], [450, 70]] as const) g.fillEllipse(mx, 194, mw, 22);
    g.fillRect(0, 176, W, 5);
  }
  g.generateTexture(key, W, 280);
  g.destroy();
};

/** Textures for one season + time of day are made the first time they are needed. */
export function ensureEnvTextures(scene: Phaser.Scene, env: Env): void {
  const k = envKey(env);
  if (scene.textures.exists(`street_${k}`)) return;
  const p = paletteFor(env);
  hills(scene, env, p, `hills_${k}`);
  makeCity(scene, env, p, `city_${k}`);
  makeSkyline(scene, env, p, `skyline_${k}`);
  trees(scene, env, p, `trees_${k}`);
  street(scene, env, p, `street_${k}`);
}

type G = Phaser.GameObjects.Graphics;

/**
 * The look of each of the town's people: skin, hair, and what is on their head. They are people of Kazakhstan:
 * dark hair, warm skin tones, almond-shaped eyes, and a skullcap (tubeteika), a felt kalpak or a headscarf
 * on some, next to ordinary caps and bows. The same look is used in the front, seated and side pictures.
 */
interface Look {
  skin: number;
  hair: number;
  style: 'short' | 'long' | 'ponytail' | 'bun';
  hat: 'none' | 'cap' | 'kalpak' | 'tubeteika' | 'scarf' | 'bow' | 'beanie';
  hatColor: number;
  glasses?: boolean;
  /** A child (smaller). */
  kid?: boolean;
  /** 0 T-shirt and trousers, 1 jacket, 2 dress, 3 rucksack. */
  outfit: 0 | 1 | 2 | 3;
  /** Colour of the top (otherwise one from the shirt palette). */
  cloth?: number;
  /** Colour of the legs under a dress (otherwise bare skin). */
  legs?: number;
}
const SKIN_A = 0xf1cfa8;
const SKIN_B = 0xe6b98c;
const SKIN_C = 0xd9a574;
const BLACK = 0x1f1d24;
const DARK_BROWN = 0x2b2118;
export const LOOKS: readonly Look[] = [
  { skin: SKIN_B, hair: BLACK, style: 'short', hat: 'none', hatColor: 0, outfit: 0 }, // 0 a man
  { skin: SKIN_A, hair: BLACK, style: 'short', hat: 'cap', hatColor: C.red, outfit: 1 }, // 1 a man in a cap
  { skin: SKIN_A, hair: BLACK, style: 'long', hat: 'bow', hatColor: C.red, kid: true, outfit: 2 }, // 2 a girl with long hair and a bow
  { skin: SKIN_C, hair: DARK_BROWN, style: 'ponytail', hat: 'none', hatColor: 0, outfit: 3 }, // 3 a woman with a ponytail
  { skin: SKIN_B, hair: BLACK, style: 'short', hat: 'tubeteika', hatColor: 0x2f3e8f, outfit: 0 }, // 4 a man in a skullcap
  { skin: SKIN_A, hair: BLACK, style: 'short', hat: 'beanie', hatColor: C.blue, kid: true, outfit: 1 }, // 5 a boy in a knitted hat
  { skin: SKIN_B, hair: DARK_BROWN, style: 'long', hat: 'scarf', hatColor: 0xe76f51, outfit: 2 }, // 6 a woman in a headscarf
  { skin: SKIN_C, hair: 0x8a8a92, style: 'bun', hat: 'none', hatColor: 0, glasses: true, outfit: 2, cloth: 0x6f9a9c, legs: 0x8d7b6c }, // 7 a grandmother in a dress
  { skin: SKIN_B, hair: 0x8a8a92, style: 'short', hat: 'scarf', hatColor: 0xf3e9d2, glasses: true, outfit: 2, cloth: 0x8d6e9e, legs: 0x8d7b6c }, // 8 a grandmother in a headscarf and a dress
];

/** Is this person a child (drawn smaller)? */
export const isKid = (variant: number): boolean => LOOKS[variant % LOOKS.length]?.kid === true;

const darker = (c: number): number => shade(c, -0.18);

/** What is worn on the head, over the hair, seen from the front (`side` false) or from the side (the face looks right). */
function drawHat(g: G, look: Look, hx: number, hy: number, R: number, s: number, side: boolean): void {
  g.lineStyle(3, C.ink, 1);
  const col = look.hatColor;
  if (look.hat === 'cap') {
    g.fillStyle(col, 1);
    g.slice(hx, hy - 1, R + 1.5, Math.PI, 2 * Math.PI, false);
    g.fillPath();
    g.fillStyle(darker(col), 1);
    if (side) g.fillRoundedRect(hx + 2, hy - 6 * s, R + 10, 5, 2);
    else g.fillRoundedRect(hx - R * 0.8, hy - 5 * s, R * 1.6, 5, 2);
  } else if (look.hat === 'kalpak') {
    // a tall white felt hat with a black band
    g.fillStyle(col, 1);
    g.fillPoints(
      [
        new Phaser.Math.Vector2(hx - R * 0.95, hy - R * 0.55),
        new Phaser.Math.Vector2(hx + R * 0.95, hy - R * 0.55),
        new Phaser.Math.Vector2(hx + R * 0.62, hy - R * 1.75),
        new Phaser.Math.Vector2(hx - R * 0.62, hy - R * 1.75),
      ],
      true,
    );
    g.strokePoints(
      [
        new Phaser.Math.Vector2(hx - R * 0.95, hy - R * 0.55),
        new Phaser.Math.Vector2(hx + R * 0.95, hy - R * 0.55),
        new Phaser.Math.Vector2(hx + R * 0.62, hy - R * 1.75),
        new Phaser.Math.Vector2(hx - R * 0.62, hy - R * 1.75),
      ],
      true,
      true,
    );
    g.fillStyle(C.ink, 1);
    g.fillRoundedRect(hx - R * 1.0, hy - R * 0.75, R * 2.0, 6 * s, 3);
  } else if (look.hat === 'tubeteika') {
    // a small round embroidered skullcap
    g.fillStyle(col, 1);
    g.slice(hx, hy - 1, R + 1.5, Math.PI * 1.04, Math.PI * 1.96, false);
    g.fillPath();
    g.fillStyle(0xffffff, 1);
    for (let k = 0; k < 5; k++) g.fillTriangle(hx - R * 0.8 + k * R * 0.4, hy - R * 0.55, hx - R * 0.6 + k * R * 0.4, hy - R * 0.55, hx - R * 0.7 + k * R * 0.4, hy - R * 0.85);
    g.fillStyle(0xffd23f, 1);
    g.fillRect(hx - R * 0.9, hy - R * 0.55, R * 1.8, 3);
  } else if (look.hat === 'scarf') {
    // a headscarf: over the head, framing the face, tied at the back
    g.fillStyle(col, 1);
    g.slice(hx, hy - 1, R + 2.5, Math.PI, 2 * Math.PI, false);
    g.fillPath();
    if (side) {
      g.fillRoundedRect(hx - R - 4 * s, hy - 4 * s, 9 * s, R * 1.5, 5);
      g.fillStyle(darker(col), 1);
      g.fillCircle(hx - R - 2 * s, hy + R * 0.8, 4 * s);
    } else {
      g.fillRoundedRect(hx - R - 3 * s, hy - 3 * s, 6 * s, R * 1.4, 4);
      g.fillRoundedRect(hx + R - 3 * s, hy - 3 * s, 6 * s, R * 1.4, 4);
    }
    g.fillStyle(luminance(col) > 0.75 ? 0xc9a06a : 0xffffff, 0.75);
    for (const [dx, dy] of [[-0.5, -1.0], [0.1, -1.3], [0.6, -0.9]] as const) g.fillCircle(hx + dx * R, hy + dy * R, 1.8);
  } else if (look.hat === 'beanie') {
    // a knitted winter hat with a ribbed edge, a stripe and a pompom
    g.fillStyle(col, 1);
    g.slice(hx, hy - 1, R + 2, Math.PI, 2 * Math.PI, false);
    g.fillPath();
    g.beginPath();
    g.arc(hx, hy - 1, R + 2, Math.PI, 2 * Math.PI, false);
    g.strokePath();
    g.fillStyle(0xffffff, 0.9);
    g.fillRect(hx - R * 0.95, hy - R * 0.95, R * 1.9, 3 * s);
    g.fillStyle(darker(col), 1);
    g.fillRoundedRect(hx - R - 2.5 * s, hy - R * 0.45 - 2 * s, 2 * R + 5 * s, 7 * s, 3);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(hx + (side ? -R * 0.2 : 0), hy - R - 5 * s, 5 * s);
    g.strokeCircle(hx + (side ? -R * 0.2 : 0), hy - R - 5 * s, 5 * s);
  } else if (look.hat === 'bow') {
    g.fillStyle(col, 1);
    const bx = side ? hx - R * 0.6 : hx + R * 0.7;
    const by = hy - R * 0.95;
    g.fillTriangle(bx, by, bx - 9 * s, by - 6 * s, bx - 9 * s, by + 6 * s);
    g.fillTriangle(bx, by, bx + 9 * s, by - 6 * s, bx + 9 * s, by + 6 * s);
    g.fillStyle(darker(col), 1);
    g.fillCircle(bx, by, 2.5 * s);
  }
}

/** Head seen from the front: round face, almond eyes with brows, a small nose, a smile and rosy cheeks. */
function drawHeadFront(g: G, i: number, cx: number, hy: number, R: number, s: number): void {
  const look = LOOKS[i % LOOKS.length]!;
  g.lineStyle(3, C.ink, 1);
  // hair behind the head: long hair falls to the shoulders
  g.fillStyle(look.hair, 1);
  if (look.style === 'long' && look.hat !== 'scarf') {
    // long hair falls on both sides of the face (never across the chest)
    for (const x of [cx - R - 5 * s, cx + R - 2 * s]) {
      g.fillRoundedRect(x, hy - R * 0.3, 7 * s, R * 1.9, 4 * s);
      g.strokeRoundedRect(x, hy - R * 0.3, 7 * s, R * 1.9, 4 * s);
    }
  }
  // face and ears
  g.fillStyle(shade(look.skin, -0.1), 1);
  g.fillCircle(cx - R, hy + 2 * s, 3.4 * s);
  g.fillCircle(cx + R, hy + 2 * s, 3.4 * s);
  g.fillStyle(look.skin, 1);
  g.fillEllipse(cx, hy, 2 * R, 2.1 * R);
  g.strokeEllipse(cx, hy, 2 * R, 2.1 * R);
  // hair on top with a fringe; a bun on top for some
  if (look.hat !== 'kalpak' && look.hat !== 'tubeteika') {
    g.fillStyle(look.hair, 1);
    if (look.style === 'bun') g.fillCircle(cx, hy - R * 1.0, 6 * s);
    g.slice(cx, hy - 1, R + 1.5, Math.PI, 2 * Math.PI, false);
    g.fillPath();
    g.fillPoints(
      [
        new Phaser.Math.Vector2(cx - R + 1, hy - 2),
        new Phaser.Math.Vector2(cx + R - 1, hy - 2),
        new Phaser.Math.Vector2(cx + R * 0.45, hy - R * 0.28),
        new Phaser.Math.Vector2(cx - R * 0.05, hy - R * 0.12),
        new Phaser.Math.Vector2(cx - R * 0.55, hy - R * 0.3),
      ],
      true,
    );
    g.fillStyle(0xffffff, 0.18);
    g.fillEllipse(cx - R * 0.35, hy - R * 0.72, R * 0.7, R * 0.22); // a shine on the hair
  }
  drawHat(g, look, cx, hy, R, s, false);
  // almond eyes (a little lifted at the outer corners), brows, nose, mouth, cheeks
  for (const sign of [-1, 1]) {
    const ex = cx + sign * R * 0.4;
    const ey = hy + 3 * s;
    g.fillStyle(C.ink, 1);
    // the outer corner is lifted: mirrored for the right eye
    const eye = [[-4.2, 0.9], [-1.4, -2.2], [4.4, -1.8], [1.8, 2.3]] as const;
    g.fillPoints(eye.map(([dx, dy]) => new Phaser.Math.Vector2(ex + sign * dx * s, ey + dy * s)), true);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(ex + sign * 0.6 * s, ey - 0.6 * s, 1.1 * s);
    g.lineStyle(2, look.hair === 0x8a8a92 ? 0x6b6b72 : look.hair, 1);
    g.lineBetween(ex - 4 * s, ey - 4.5 * s, ex + 4 * s, ey - 5 * s);
    g.fillStyle(0xf28482, 0.5);
    g.fillCircle(cx + sign * R * 0.66, hy + 8 * s, 3 * s);
  }
  g.lineStyle(2, darker(look.skin), 1);
  g.lineBetween(cx - 0.5, hy + 5.5 * s, cx + 0.5, hy + 8 * s);
  g.lineStyle(2, C.ink, 1);
  g.beginPath();
  g.arc(cx, hy + 8.5 * s, 3.6 * s, 0.4, Math.PI - 0.4);
  g.strokePath();
  if (look.glasses) {
    g.lineStyle(2, C.ink, 1);
    g.strokeCircle(cx - R * 0.4, hy + 3 * s, 5.2 * s);
    g.strokeCircle(cx + R * 0.4, hy + 3 * s, 5.2 * s);
    g.lineBetween(cx - R * 0.4 + 5.2 * s, hy + 3 * s, cx + R * 0.4 - 5.2 * s, hy + 3 * s);
  }
}

/** Head seen from the side (looking right): a rounded skull and chin, a small nose, an ear, an almond eye. */
function drawHeadSide(g: G, i: number, hx: number, hy: number, R: number, s: number): void {
  const look = LOOKS[i % LOOKS.length]!;
  g.lineStyle(3, C.ink, 1);
  // hair behind the head
  g.fillStyle(look.hair, 1);
  if (look.style === 'long' && look.hat !== 'scarf') {
    g.fillRoundedRect(hx - R - 5 * s, hy - R * 0.6, R * 1.3, R * 2.3, 8 * s);
    g.strokeRoundedRect(hx - R - 5 * s, hy - R * 0.6, R * 1.3, R * 2.3, 8 * s);
  }
  if (look.style === 'ponytail') {
    g.fillRoundedRect(hx - R - 10 * s, hy - 3 * s, 14 * s, 8 * s, 4);
    g.strokeRoundedRect(hx - R - 10 * s, hy - 3 * s, 14 * s, 8 * s, 4);
  }
  if (look.style === 'bun') g.fillCircle(hx - R * 0.75, hy - R * 0.95, 6 * s);
  // a small soft nose first, then the skull over its inner half so only the bump shows
  g.fillStyle(look.skin, 1);
  g.fillCircle(hx + R - 0.5, hy + 4 * s, 3 * s);
  g.strokeCircle(hx + R - 0.5, hy + 4 * s, 3 * s);
  g.fillEllipse(hx + 1, hy + 1, 2 * R, 2.15 * R);
  g.strokeEllipse(hx + 1, hy + 1, 2 * R, 2.15 * R);
  g.fillStyle(shade(look.skin, -0.12), 1);
  g.fillCircle(hx - 3 * s, hy + 2 * s, 3.4 * s); // ear
  g.fillStyle(shade(look.skin, -0.3), 1);
  g.fillCircle(hx - 3 * s, hy + 2 * s, 1.6 * s);
  // hair on top and a fringe
  if (look.hat !== 'kalpak' && look.hat !== 'tubeteika' && look.hat !== 'scarf') {
    g.fillStyle(look.hair, 1);
    g.slice(hx - 1, hy - 1, R + 1.5, Math.PI * 0.9, 2 * Math.PI, false);
    g.fillPath();
    g.fillPoints(
      [
        new Phaser.Math.Vector2(hx + R - 1, hy - 3 * s),
        new Phaser.Math.Vector2(hx + R * 0.25, hy - R * 0.98),
        new Phaser.Math.Vector2(hx - R * 0.45, hy - R * 0.5),
        new Phaser.Math.Vector2(hx + R * 0.35, hy - 1 * s),
      ],
      true,
    );
    g.fillRect(hx - R - 1, hy - 3 * s, 5 * s, 7 * s);
    g.fillStyle(0xffffff, 0.18);
    g.fillEllipse(hx - R * 0.15, hy - R * 0.8, R * 0.8, R * 0.22);
  }
  drawHat(g, look, hx, hy, R, s, true);
  // an almond eye with a lid line, a brow, a little mouth and a rosy cheek
  const ex = hx + 7 * s;
  const ey = hy + 3 * s;
  g.fillStyle(C.ink, 1);
  g.fillPoints(
    [
      new Phaser.Math.Vector2(ex - 3.6 * s, ey + 0.8),
      new Phaser.Math.Vector2(ex - 1 * s, ey - 1.5 * s),
      new Phaser.Math.Vector2(ex + 2.2 * s, ey - 1.4 * s),
      new Phaser.Math.Vector2(ex + 3.8 * s, ey - 0.4),
      new Phaser.Math.Vector2(ex + 1.4 * s, ey + 1.6 * s),
      new Phaser.Math.Vector2(ex - 1.4 * s, ey + 1.7 * s),
    ],
    true,
  );
  g.lineStyle(2, look.hair === 0x8a8a92 ? 0x6b6b72 : look.hair, 1);
  g.lineBetween(ex - 3 * s, ey - 4.5 * s, ex + 4 * s, ey - 4 * s);
  g.lineStyle(2, C.ink, 1);
  g.beginPath();
  g.arc(hx + 6 * s, hy + 8.6 * s, 3 * s, 0.5, 1.7);
  g.strokePath();
  g.fillStyle(0xf28482, 0.5);
  g.fillCircle(hx + 3 * s, hy + 7 * s, 3 * s);
  if (look.glasses) {
    g.lineStyle(2, C.ink, 1);
    g.strokeCircle(ex, ey, 5.2 * s);
    g.lineBetween(ex - 5.2 * s, ey, hx - 3 * s, ey);
  }
}

/** Little people. Feet at the bottom centre of a 64×120 texture. */
function passengers(scene: Phaser.Scene): void {
  const rng = mulberry32(99);
  const shirts = [C.red, C.blue, C.green, C.orange, C.purple, 0xf15bb5, 0x2ec4b6, C.yellow];
  for (let i = 0; i < PASSENGER_VARIANTS; i++) {
    const pants = pick(rng, [0x3d405b, 0x2d2a32, 0x6d597a]);
    for (const seated of [false, true]) {
    const g = make(scene);
    const look = LOOKS[i % LOOKS.length]!;
    const kid = look.kid === true;
    const s = kid ? 0.75 : 1;
    const cx = 32;
    const feet = 118;
    const legH = 34 * s;
    const bodyH = 42 * s;
    const headR = 15 * s;
    g.lineStyle(3, C.ink, 1);
    // legs: standing, or sitting (thighs forward along the seat, shins down)
    const hip = seated ? SIT_HIP * s : legH;
    g.fillStyle(pants, 1);
    if (seated) {
      g.fillRoundedRect(cx - 12 * s, feet - hip - 2, 36 * s, 12 * s, 4);
      g.strokeRoundedRect(cx - 12 * s, feet - hip - 2, 36 * s, 12 * s, 4);
      g.fillRoundedRect(cx + 14 * s, feet - hip + 6, 10 * s, hip - 6, 3);
      g.strokeRoundedRect(cx + 14 * s, feet - hip + 6, 10 * s, hip - 6, 3);
    } else {
      g.fillRoundedRect(cx - 12 * s, feet - legH, 10 * s, legH, 3);
      g.fillRoundedRect(cx + 2 * s, feet - legH, 10 * s, legH, 3);
    }
    // body
    const shirt = look.cloth ?? shirts[i % shirts.length]!;
    g.fillStyle(shirt, 1);
    const bodyTop = feet - hip - bodyH + 4;
    g.fillRoundedRect(cx - 16 * s, bodyTop, 32 * s, bodyH, { tl: 12 * s, tr: 12 * s, bl: 4, br: 4 });
    g.strokeRoundedRect(cx - 16 * s, bodyTop, 32 * s, bodyH, { tl: 12 * s, tr: 12 * s, bl: 4, br: 4 });
    if (look.outfit === 2) {
      // a dress: a skirt flaring over the legs (down to the knee, or over the lap when sitting)
      const sk = seated ? 10 * s : 22 * s;
      g.fillStyle(shirt, 1);
      g.fillPoints([new Phaser.Math.Vector2(cx - 15 * s, feet - hip - 4), new Phaser.Math.Vector2(cx + 15 * s, feet - hip - 4), new Phaser.Math.Vector2(cx + 20 * s, feet - hip + sk), new Phaser.Math.Vector2(cx - 20 * s, feet - hip + sk)], true);
      g.strokePoints([new Phaser.Math.Vector2(cx - 15 * s, feet - hip - 4), new Phaser.Math.Vector2(cx + 15 * s, feet - hip - 4), new Phaser.Math.Vector2(cx + 20 * s, feet - hip + sk), new Phaser.Math.Vector2(cx - 20 * s, feet - hip + sk)], true, true);
    }
    // arms
    g.fillStyle(shade(shirt, -0.15), 1);
    g.fillRoundedRect(cx - 22 * s, bodyTop + 6, 8 * s, 30 * s, 4);
    g.fillRoundedRect(cx + 14 * s, bodyTop + 6, 8 * s, 30 * s, 4);
    // head: round face, almond eyes, a fringe of dark hair, a hat for some
    const hy = bodyTop - headR + 2;
    drawHeadFront(g, i, cx, hy, headR, s);
    g.generateTexture(seated ? `paxSit${i}` : `pax${i}`, 64, 120);
    g.destroy();
    }
  }
}

/** Frames in one walking cycle of the side-view people. */
export const WALK_FRAMES = 8;

type Pt = { x: number; y: number };

/** A bent limb (two segments) with a dark outline and round ends, drawn as one piece so the joint is smooth. */
function limb(g: Phaser.GameObjects.Graphics, pts: Pt[], w: number, color: number): void {
  for (const [width, col] of [[w + 5, C.ink], [w, color]] as const) {
    g.lineStyle(width, col, 1);
    g.fillStyle(col, 1);
    for (let k = 0; k + 1 < pts.length; k++) g.lineBetween(pts[k]!.x, pts[k]!.y, pts[k + 1]!.x, pts[k + 1]!.y);
    for (const q of pts) g.fillCircle(q.x, q.y, width / 2);
  }
}

const rad = (deg: number): number => (deg * Math.PI) / 180;
/** The point `len` away from `from`, in the direction `deg` degrees from straight down (positive = forward, to the right). */
const away = (from: Pt, deg: number, len: number): Pt => ({ x: from.x + Math.sin(rad(deg)) * len, y: from.y + Math.cos(rad(deg)) * len });

/**
 * People seen from the side, walking to the right (the game flips them to walk left): a proper walking cycle
 * of `WALK_FRAMES` pictures, `side<variant>_<frame>`. Legs swing from the hip and bend at the knee, arms swing
 * the other way and bend at the elbow, the lowest foot always stands on the ground so the body rises and
 * dips like a real step. Each person has their own clothes (T-shirt, jacket, dress, rucksack) and hair.
 */
function sidePeople(scene: Phaser.Scene): void {
  const rng = mulberry32(99);
  const shirts = [C.red, C.blue, C.green, C.orange, C.purple, 0xf15bb5, 0x2ec4b6, C.yellow];
  const SHOES = [0xffffff, C.ink, 0xe63946, 0xf6d5b8];
  for (let i = 0; i < PASSENGER_VARIANTS; i++) {
    const pants = pick(rng, [0x3d405b, 0x2d2a32, 0x6d597a]); // the same trousers as the front view
    const look = LOOKS[i % LOOKS.length]!;
    const kid = look.kid === true;
    const s = kid ? 0.78 : 1;
    const shirt = look.cloth ?? shirts[i % shirts.length]!;
    const skin = LOOKS[i % LOOKS.length]!.skin;
    const outfit = look.outfit;
    const legSkin = look.legs ?? skin; // bare legs, or tights
    const shoe = SHOES[i % SHOES.length]!;
    const thigh = 17 * s;
    const shin = 17 * s;
    const torsoH = 38 * s;
    const headR = 14 * s;

    for (let k = 0; k < WALK_FRAMES; k++) {
      const g = make(scene);
      const phase = k / WALK_FRAMES;
      // one leg's angles for a phase: the hip swings, the knee bends most as the leg swings through
      const legAt = (p: number): { hip: number; knee: number } => ({
        hip: 26 * Math.sin(2 * Math.PI * p),
        knee: 6 + 54 * Math.pow(Math.max(0, Math.cos(2 * Math.PI * p)), 1.4),
      });
      const near = legAt(phase);
      const far = legAt(phase + 0.5);
      // joints relative to the hip at (0, 0): used to find how low each foot hangs
      const jointsOf = (l: { hip: number; knee: number }): { knee: Pt; ankle: Pt } => {
        const knee = away({ x: 0, y: 0 }, l.hip, thigh);
        return { knee, ankle: away(knee, l.hip - l.knee, shin) };
      };
      const jn = jointsOf(near);
      const jf = jointsOf(far);
      const shoeH = 6 * s;
      const hipY = 118 - shoeH - Math.max(jn.ankle.y, jf.ankle.y); // lowest foot on the ground
      const hip: Pt = { x: 30, y: hipY };
      const at = (q: Pt): Pt => ({ x: hip.x + q.x, y: hip.y + q.y });
      const drawLeg = (j: { knee: Pt; ankle: Pt }, col: number, ang: number): void => {
        limb(g, [at({ x: 0, y: 0 }), at(j.knee), at(j.ankle)], 11 * s, col);
        // the shoe points forward and follows the shin a little
        const a = at(j.ankle);
        g.fillStyle(shoe, 1);
        g.lineStyle(3, C.ink, 1);
        g.fillRoundedRect(a.x - 4 * s, a.y - 1, 15 * s, shoeH, 3);
        g.strokeRoundedRect(a.x - 4 * s, a.y - 1, 15 * s, shoeH, 3);
        void ang;
      };

      // torso (a slight forward lean), shoulders at the top
      const lean = 4;
      const top = away(hip, -lean, -torsoH); // straight up, leaning forward
      const shoulder: Pt = { x: top.x, y: top.y + 6 * s };
      const armAt = (p: number): { up: Pt; hand: Pt } => {
        const swing = -24 * Math.sin(2 * Math.PI * p);
        const flex = 8 + 22 * Math.max(0, swing / 24);
        const elbow = away(shoulder, swing, 15 * s);
        const hand = away(elbow, swing + flex, 14 * s);
        return { up: elbow, hand };
      };
      const drawArm = (pp: number, col: number): void => {
        const a = armAt(pp);
        limb(g, [shoulder, a.up, a.hand], 7 * s, col);
        g.fillStyle(skin, 1);
        g.lineStyle(2.5, C.ink, 1);
        g.fillCircle(a.hand.x, a.hand.y + 1, 4.2 * s);
        g.strokeCircle(a.hand.x, a.hand.y + 1, 4.2 * s);
      };
      const sleeve = outfit === 1 ? shade(shirt, -0.2) : shirt;

      // the far side first (leg, arm), then the rucksack, the body, the near side, the head
      drawLeg(jf, shade(outfit === 2 ? legSkin : pants, -0.2), far.hip);
      drawArm(phase + 0.5, shade(sleeve, -0.2));
      if (outfit === 3) {
        g.fillStyle(shade(shirt, 0.0) === C.blue ? C.orange : C.blue, 1);
        g.lineStyle(3, C.ink, 1);
        g.fillRoundedRect(top.x - 22 * s, top.y + 6 * s, 14 * s, 26 * s, 6);
        g.strokeRoundedRect(top.x - 22 * s, top.y + 6 * s, 14 * s, 26 * s, 6);
      }
      // trunk: a rounded shape wider at the shoulders; a dress flares to the knee, a jacket hangs lower
      const wst = 12 * s;
      const bottomY = hip.y + (outfit === 1 ? 5 * s : 0);
      g.fillStyle(shirt, 1);
      g.lineStyle(3, C.ink, 1);
      g.fillRoundedRect(Math.min(top.x, hip.x) - wst, top.y, wst * 2 + Math.abs(top.x - hip.x), bottomY - top.y, { tl: 11 * s, tr: 11 * s, bl: 5, br: 5 });
      g.strokeRoundedRect(Math.min(top.x, hip.x) - wst, top.y, wst * 2 + Math.abs(top.x - hip.x), bottomY - top.y, { tl: 11 * s, tr: 11 * s, bl: 5, br: 5 });
      if (outfit === 2) {
        const sw = Math.sin(rad(near.hip)) * 4;
        g.fillPoints(
          [
            new Phaser.Math.Vector2(hip.x - wst, hip.y - 6 * s),
            new Phaser.Math.Vector2(hip.x + wst, hip.y - 6 * s),
            new Phaser.Math.Vector2(hip.x + wst + 6 * s + sw, hip.y + 15 * s),
            new Phaser.Math.Vector2(hip.x - wst - 6 * s + sw, hip.y + 15 * s),
          ],
          true,
        );
        g.strokePoints(
          [
            new Phaser.Math.Vector2(hip.x - wst, hip.y - 6 * s),
            new Phaser.Math.Vector2(hip.x + wst, hip.y - 6 * s),
            new Phaser.Math.Vector2(hip.x + wst + 6 * s + sw, hip.y + 15 * s),
            new Phaser.Math.Vector2(hip.x - wst - 6 * s + sw, hip.y + 15 * s),
          ],
          true,
          true,
        );
        g.fillStyle(shade(shirt, 0.3), 1);
        g.fillRect(hip.x - wst + 1, hip.y - 8 * s, wst * 2 - 2, 4 * s); // belt
      } else if (outfit === 1) {
        g.lineStyle(2.5, C.ink, 0.7);
        g.lineBetween(top.x + 6 * s, top.y + 2, hip.x + 6 * s, bottomY - 2); // zip
        g.fillStyle(shade(shirt, -0.3), 1);
        g.fillRect(top.x - 5 * s, top.y - 2, 12 * s, 6 * s); // collar
      } else {
        g.fillStyle(shade(pants, 0.1), 1);
        g.fillRect(hip.x - wst + 2, hip.y - 7 * s, wst * 2 + 1, 5 * s); // belt of the trousers
      }
      drawLeg(jn, outfit === 2 ? legSkin : pants, near.hip);
      drawArm(phase, sleeve);

      // neck and head in profile
      const hx = top.x + 2;
      const hy = top.y - headR + 2 * s;
      g.fillStyle(skin, 1);
      g.lineStyle(3, C.ink, 1);
      g.fillRect(hx - 4 * s, top.y - 6 * s, 8 * s, 9 * s);
      drawHeadSide(g, i, hx, hy, headR, s);

      g.generateTexture(`side${i}_${k}`, 64, 120);
      g.destroy();
    }
  }
}

/** A little dog (two walking pictures) and an umbrella, for the people who walk about the town. */
function townFolk(scene: Phaser.Scene): void {
  for (const [name, spread] of [['dogA', 7], ['dogB', 2]] as const) {
    const g = make(scene);
    g.lineStyle(3, C.ink, 1);
    g.fillStyle(0xc68e64, 1);
    // legs
    for (const lx of [10, 18, 36, 44]) {
      const off = lx < 30 ? (lx === 10 ? -spread : spread) : lx === 36 ? spread : -spread;
      g.fillRoundedRect(lx + off * 0.5, 22, 6, 14, 2);
    }
    // tail, body, head, ear, nose
    g.lineBetween(8, 14, 2, 6);
    g.fillRoundedRect(8, 10, 40, 18, 8);
    g.strokeRoundedRect(8, 10, 40, 18, 8);
    g.fillCircle(52, 10, 9);
    g.strokeCircle(52, 10, 9);
    g.fillStyle(0x8a5a3b, 1);
    g.fillEllipse(48, 4, 7, 12);
    g.fillStyle(C.ink, 1);
    g.fillCircle(58, 9, 2.5);
    g.fillCircle(54, 7, 1.8);
    g.generateTexture(name, 64, 40);
    g.destroy();
  }
  const u = make(scene);
  u.fillStyle(0xffffff, 1);
  u.lineStyle(3, C.ink, 1);
  u.slice(40, 36, 36, Math.PI, 0, false);
  u.fillPath();
  u.beginPath();
  u.arc(40, 36, 36, Math.PI, 0, false);
  u.closePath();
  u.strokePath();
  u.lineBetween(40, 36, 40, 70);
  u.generateTexture('umbrella', 80, 72);
  u.destroy();
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

/** Tiny white shapes for rain, snow, leaves and petals; tinted by the particle emitters. */
function weatherTextures(scene: Phaser.Scene): void {
  const g = make(scene);
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, 3, 26);
  g.generateTexture('raindrop', 3, 26);
  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillCircle(7, 7, 7);
  g.generateTexture('flake', 14, 14);
  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillEllipse(9, 6, 18, 10);
  g.generateTexture('leaf', 18, 12);
  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillEllipse(6, 5, 12, 8);
  g.generateTexture('petal', 12, 10);
  g.destroy();
}

export function generateAllTextures(scene: Phaser.Scene): void {
  cloud(scene);
  passengers(scene);
  townFolk(scene);
  sidePeople(scene);
  confettiTex(scene);
  weatherTextures(scene);
}

const SUMMER_DAY: Env = { season: 'summer', time: 'day', precip: false };

/** Sky, sun or moon, clouds, hills, city, trees and street as parallax layers, for any season / time of day. */
export class Backdrop {
  private clouds: Phaser.GameObjects.TileSprite;
  private hills: Phaser.GameObjects.TileSprite;
  private skyline: Phaser.GameObjects.TileSprite;
  private city: Phaser.GameObjects.TileSprite;
  private trees: Phaser.GameObjects.TileSprite;
  private street: Phaser.GameObjects.TileSprite | null;
  private drift = 0;

  constructor(scene: Phaser.Scene, opts: { street?: boolean; env?: Env } = {}) {
    const env = opts.env ?? SUMMER_DAY;
    const p = paletteFor(env);
    const k = envKey(env);
    ensureEnvTextures(scene, env);

    const sky = scene.add.graphics().setScrollFactor(0).setDepth(-10);
    sky.fillGradientStyle(p.skyTop, p.skyTop, p.skyBottom, p.skyBottom, 1);
    sky.fillRect(0, 0, GAME_W, 720);
    if (p.sunVisible) {
      sky.fillStyle(C.sun, 0.35);
      sky.fillCircle(1080, 120, 80);
      sky.fillStyle(C.sun, 1);
      sky.fillCircle(1080, 120, 56);
    }
    if (p.moonVisible) {
      sky.fillStyle(0xfff6d8, 0.12);
      sky.fillCircle(1080, 120, 92);
      sky.fillStyle(0xfff3d6, 1);
      sky.fillCircle(1080, 120, 50);
      sky.fillStyle(0xe3dcc0, 1);
      for (const [dx, dy, r] of [[-14, -10, 10], [12, 14, 8], [14, -18, 5]] as const) sky.fillCircle(1080 + dx, 120 + dy, r);
      this.addStars(scene, env.precip ? 18 : 70);
    }

    this.clouds = scene.add.tileSprite(0, 40, GAME_W, 200, 'cloud').setOrigin(0).setScrollFactor(0).setDepth(-9);
    this.clouds.setTint(p.cloudTint).setAlpha(p.moonVisible ? 0.75 : 0.95);
    this.hills = scene.add.tileSprite(0, 200, GAME_W, 240, `hills_${k}`).setOrigin(0).setScrollFactor(0).setDepth(-8);
    this.skyline = scene.add.tileSprite(0, STREET_Y - SKYLINE_H, GAME_W, SKYLINE_H, `skyline_${k}`).setOrigin(0).setScrollFactor(0).setDepth(-7.5);
    this.city = scene.add.tileSprite(0, STREET_Y + 10 - CITY_H, GAME_W, CITY_H, `city_${k}`).setOrigin(0).setScrollFactor(0).setDepth(-7);
    this.trees = scene.add.tileSprite(0, STREET_Y + 32 - 230, GAME_W, 230, `trees_${k}`).setOrigin(0).setScrollFactor(0).setDepth(-6);
    this.street =
      opts.street === false
        ? null
        : scene.add.tileSprite(0, STREET_Y, GAME_W, 280, `street_${k}`).setOrigin(0).setScrollFactor(0).setDepth(-5);
  }

  private addStars(scene: Phaser.Scene, count: number): void {
    const rng = mulberry32(11);
    const still = scene.add.graphics().setScrollFactor(0).setDepth(-9.5);
    const twinkle = scene.add.graphics().setScrollFactor(0).setDepth(-9.5);
    for (let i = 0; i < count; i++) {
      const x = rng() * GAME_W;
      const y = rng() * 280;
      const r = 1 + rng() * 2;
      (i % 6 === 0 ? twinkle : still).fillStyle(0xfff6d8, 0.5 + rng() * 0.5).fillCircle(x, y, r);
    }
    scene.tweens.add({ targets: twinkle, alpha: { from: 1, to: 0.25 }, yoyo: true, repeat: -1, duration: 1300, ease: 'Sine.easeInOut' });
  }

  /** scrollX: world camera x. dt in seconds (for cloud drift). */
  update(scrollX: number, dt: number): void {
    this.drift += dt * 12;
    this.clouds.tilePositionX = scrollX * 0.05 + this.drift;
    this.hills.tilePositionX = scrollX * 0.15;
    this.skyline.tilePositionX = scrollX * 0.25;
    this.city.tilePositionX = scrollX * 0.4;
    this.trees.tilePositionX = scrollX * 0.85;
    if (this.street) this.street.tilePositionX = scrollX;
  }
}
