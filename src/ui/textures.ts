import Phaser from 'phaser';
import { C, GAME_W, mix, shade } from '../config';
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
export const PASSENGER_VARIANTS = 8;
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

/** Little people. Feet at the bottom centre of a 64×120 texture. */
function passengers(scene: Phaser.Scene): void {
  const rng = mulberry32(99);
  const shirts = [C.red, C.blue, C.green, C.orange, C.purple, 0xf15bb5, 0x2ec4b6, C.yellow];
  const skins = [0xf6d5b8, 0xe8b894, 0xc68e64, 0x8d5a3b];
  const hairs = [0x2d2a32, 0x6b3e26, 0xc58b3c, 0x9c4a2f, 0x8a8a8a];
  for (let i = 0; i < PASSENGER_VARIANTS; i++) {
    const pants = pick(rng, [0x3d405b, 0x2d2a32, 0x6d597a]);
    for (const seated of [false, true]) {
    const g = make(scene);
    const kid = i % 3 === 2;
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
    const shirt = shirts[i % shirts.length]!;
    g.fillStyle(shirt, 1);
    const bodyTop = feet - hip - bodyH + 4;
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
    g.generateTexture(seated ? `paxSit${i}` : `pax${i}`, 64, 120);
    g.destroy();
    }
  }
}

/**
 * People seen from the side, walking to the right (the game flips them to walk left): four pictures of a step,
 * `side<variant>_<0..3>`: legs apart, passing (one leg lifted), legs apart the other way, passing. Feet at the bottom.
 */
function sidePeople(scene: Phaser.Scene): void {
  const rng = mulberry32(99);
  const shirts = [C.red, C.blue, C.green, C.orange, C.purple, 0xf15bb5, 0x2ec4b6, C.yellow];
  const skins = [0xf6d5b8, 0xe8b894, 0xc68e64, 0x8d5a3b];
  const hairs = [0x2d2a32, 0x6b3e26, 0xc58b3c, 0x9c4a2f, 0x8a8a8a];
  for (let i = 0; i < PASSENGER_VARIANTS; i++) {
    const pants = pick(rng, [0x3d405b, 0x2d2a32, 0x6d597a]); // the same trousers as the front view
    const kid = i % 3 === 2;
    const s = kid ? 0.75 : 1;
    const shirt = shirts[i % shirts.length]!;
    const skin = skins[i % skins.length]!;
    const cx = 32;
    const feet = 118;
    const legH = 34 * s;
    const bodyH = 42 * s;
    const headR = 15 * s;
    const hip = feet - legH;
    // swing of each foot and how high it is lifted, per picture
    const frames: Array<{ front: number; lift: number; liftRear: number }> = [
      { front: 1, lift: 0, liftRear: 0 },
      { front: 0, lift: 0, liftRear: 6 },
      { front: -1, lift: 0, liftRear: 0 },
      { front: 0, lift: 6, liftRear: 0 },
    ];
    frames.forEach((f, k) => {
      const g = make(scene);
      const leg = (dx: number, lift: number, color: number): void => {
        const fx = cx + dx * 15 * s;
        const fy = feet - lift * s;
        g.lineStyle(11 * s + 5, C.ink, 1);
        g.lineBetween(cx, hip, fx, fy);
        g.lineStyle(11 * s, color, 1);
        g.lineBetween(cx, hip, fx, fy);
        g.fillStyle(C.ink, 1); // shoe, pointing forward
        g.fillRoundedRect(fx - 5 * s, fy - 4 * s, 15 * s, 7 * s, 3);
      };
      const arm = (dx: number, color: number): void => {
        const sx = cx;
        const sy = hip - bodyH + 12 * s;
        g.lineStyle(8 * s + 4, C.ink, 1);
        g.lineBetween(sx, sy, sx + dx * 12 * s, sy + 28 * s);
        g.lineStyle(8 * s, color, 1);
        g.lineBetween(sx, sy, sx + dx * 12 * s, sy + 28 * s);
      };
      const dark = shade(shirt, -0.15);
      // the far leg and arm first, then the body, then the near leg and arm
      leg(-f.front * 0.9, f.liftRear, shade(pants, -0.2));
      arm(f.front, shade(dark, -0.15));
      g.lineStyle(3, C.ink, 1);
      g.fillStyle(shirt, 1);
      const bodyTop = hip - bodyH + 4;
      g.fillRoundedRect(cx - 13 * s, bodyTop, 26 * s, bodyH, { tl: 11 * s, tr: 11 * s, bl: 4, br: 4 });
      g.strokeRoundedRect(cx - 13 * s, bodyTop, 26 * s, bodyH, { tl: 11 * s, tr: 11 * s, bl: 4, br: 4 });
      leg(f.front * 0.9, f.lift, pants);
      arm(-f.front, dark);
      // head in profile: a nose, an eye, hair at the back and on top, a cap for some
      const hy = bodyTop - headR + 2;
      g.lineStyle(3, C.ink, 1);
      g.fillStyle(skin, 1);
      g.fillCircle(cx + 1, hy, headR);
      g.strokeCircle(cx + 1, hy, headR);
      g.fillCircle(cx + headR + 1, hy + 3, 3.5 * s);
      g.fillStyle(i % 4 === 1 ? C.red : hairs[i % hairs.length]!, 1);
      g.slice(cx - 1, hy - 1, headR + 1, Math.PI * 0.85, Math.PI * 2.05, false);
      g.fillPath();
      if (i % 4 === 1) g.fillRect(cx + 4, hy - 5, headR + 8, 5); // the peak of the cap
      g.fillStyle(C.ink, 1);
      g.fillCircle(cx + 7 * s, hy + 1, 2.2);
      g.lineStyle(2, C.ink, 1);
      g.beginPath();
      g.arc(cx + 5 * s, hy + 5, 4 * s, 0.4, 1.9);
      g.strokePath();
      g.generateTexture(`side${i}_${k}`, 64, 120);
      g.destroy();
    });
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
