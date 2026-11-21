import Phaser from 'phaser';
import { GAME_H, mix, shade } from '../config';
import { bridgeLiftAt, type BridgeData } from '../core/bridge';
import { mulberry32 } from '../core/rng';
import { paletteFor, type Env } from '../core/world';
import { STREET_Y } from './textures';

type G = Phaser.GameObjects.Graphics;

const ROAD_TOP = STREET_Y + 50;
const ROAD_BOTTOM = STREET_Y + 180;
const LAKE_TOP = STREET_Y - 14;
const DECK_STEP = 32;

interface WaterColors {
  top: number;
  bottom: number;
  ripple: number;
  shadow: number;
  stone: number;
  stoneDark: number;
  rail: number;
  ice: boolean;
}

function waterColorsFor(env: Env): WaterColors {
  const night = env.time === 'night';
  const sunset = env.time === 'sunset';
  const winter = env.season === 'winter';
  const autumn = env.season === 'autumn';

  let top = winter ? 0x8cc9e6 : autumn ? 0x4b8eb5 : 0x4eaee0;
  let bottom = winter ? 0x5c9fc4 : autumn ? 0x2d5e86 : 0x2573b0;
  if (env.precip) {
    top = mix(top, 0x7c8e9e, 0.38);
    bottom = mix(bottom, 0x4e6070, 0.38);
  }
  if (sunset) {
    top = mix(top, 0xf29f6d, 0.42);
    bottom = mix(bottom, 0x4b3f72, 0.4);
  }
  if (night) {
    top = 0x1e325c;
    bottom = 0x101c38;
  }
  const stoneBase = winter ? 0xcfd8e2 : 0xd6cfc2;
  const stone = night ? mix(stoneBase, 0x1b2048, 0.58) : sunset ? mix(stoneBase, 0xd46a4c, 0.22) : stoneBase;
  const stoneDark = shade(stone, -0.2);
  const rail = night ? 0x424a68 : 0x5b6370;

  return {
    top,
    bottom,
    ripple: night ? 0x6280b5 : sunset ? 0xffd5a8 : winter ? 0xe8f6fc : 0xbce8ff,
    shadow: night ? 0x091024 : 0x174469,
    stone,
    stoneDark,
    rail,
    ice: winter,
  };
}

/**
 * Renders a long gently-arched bridge over a lake in retro-flat vector style.
 * Layers:
 * - depth -4.6: lake water, shorelines, reeds, lily pads / ice, under-bridge water shadow
 * - depth -4.5: subtle animated water shimmer
 * - depth -4.4: stone piers and wide oval arches under the bridge
 * - depth -4.2: curved 4-lane road deck, curbs, lane markings, fascia beam
 * - depth -4.1: far balustrade and vintage bridge lamps
 * - depth 10.5: low open near guardrail (in front of vehicles)
 */
export class BridgeView {
  private readonly shimmer: G;
  private readonly shimmerSpots: Array<{ x: number; y: number; w: number; phase: number; speed: number }>;
  private readonly rippleColor: number;
  private readonly night: boolean;
  private time = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly data: BridgeData,
    env: Env,
  ) {
    const p = paletteFor(env);
    const wc = waterColorsFor(env);
    this.rippleColor = wc.ripple;
    this.night = env.time === 'night';
    const rng = mulberry32(Math.round(data.x0 * 3 + data.x1));
    const lift = (x: number) => bridgeLiftAt([data], x);

    const lake = scene.add.graphics().setDepth(-4.6);
    this.shimmer = scene.add.graphics().setDepth(-4.5);
    const arches = scene.add.graphics().setDepth(-4.4);
    const deck = scene.add.graphics().setDepth(-4.2);
    const farRail = scene.add.graphics().setDepth(-4.1);
    const nearRail = scene.add.graphics().setDepth(10.5);

    this.drawLake(lake, env, p.grass, p.ink, wc, rng, lift);
    this.shimmerSpots = this.makeShimmerSpots(rng, lift);
    const lampXs = this.drawUnderStructure(arches, p.ink, wc, lift);
    this.drawDeck(deck, env, p, wc, lift);
    this.drawFarRailing(farRail, env, p.ink, wc, lift, lampXs);
    this.drawNearRailing(nearRail, p.ink, wc, lift);
    if (env.time === 'night' || env.time === 'sunset') {
      this.drawLampReflections(lake, lampXs, env.time === 'night');
    }
    this.redrawShimmer();
  }

  private drawLake(
    g: G,
    env: Env,
    grassColor: number,
    ink: number,
    wc: WaterColors,
    rng: () => number,
    lift: (x: number) => number,
  ): void {
    const { x0, x1 } = this.data;
    const pad = 110;
    const lx0 = x0 - pad;
    const lx1 = x1 + pad;

    // Main lake body (completely covers flat street TileSprite underneath)
    g.fillGradientStyle(wc.top, wc.top, wc.bottom, wc.bottom, 1);
    g.fillRect(lx0, LAKE_TOP, lx1 - lx0, GAME_H - LAKE_TOP + 4);

    // Subtle horizontal water depth bands
    g.fillStyle(wc.bottom, 0.22);
    g.fillRect(lx0, STREET_Y + 120, lx1 - lx0, GAME_H - (STREET_Y + 120));
    g.fillStyle(wc.top, 0.25);
    g.fillRect(lx0, LAKE_TOP, lx1 - lx0, 56);

    // Soft cast shadow of the bridge deck on the lake surface
    const shadowPts: Phaser.Math.Vector2[] = [];
    for (let x = x0; x <= x1; x += DECK_STEP) {
      shadowPts.push(new Phaser.Math.Vector2(x, ROAD_BOTTOM + 24 - lift(x) * 0.28));
    }
    shadowPts.push(new Phaser.Math.Vector2(x1, ROAD_BOTTOM + 66));
    for (let x = x1; x >= x0; x -= DECK_STEP) {
      shadowPts.push(new Phaser.Math.Vector2(x, ROAD_BOTTOM + 66 - lift(x) * 0.22));
    }
    g.fillStyle(wc.shadow, 0.26);
    g.fillPoints(shadowPts, true);

    // Far shoreline bank along the top of the lake
    g.fillStyle(grassColor, 1);
    const farShore: Phaser.Math.Vector2[] = [
      new Phaser.Math.Vector2(lx0, LAKE_TOP - 10),
      new Phaser.Math.Vector2(lx1, LAKE_TOP - 10),
    ];
    for (let x = lx1; x >= lx0; x -= 64) {
      const wave = Math.sin(x * 0.015) * 4;
      farShore.push(new Phaser.Math.Vector2(x, LAKE_TOP + 6 + wave));
    }
    g.fillPoints(farShore, true);
    g.lineStyle(3, ink, 0.65);
    g.beginPath();
    for (let x = lx0; x <= lx1; x += 64) {
      const y = LAKE_TOP + 6 + Math.sin(x * 0.015) * 4;
      if (x === lx0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.strokePath();

    // Left and right grassy shore embankments transitioning from flat street into the lake
    const drawBank = (side: -1 | 1) => {
      const bx = side < 0 ? x0 : x1;
      const outer = side < 0 ? lx0 - 16 : lx1 + 16;
      const inner = bx + (side < 0 ? 52 : -52);
      const pts = [
        new Phaser.Math.Vector2(outer, LAKE_TOP - 6),
        new Phaser.Math.Vector2(bx + (side < 0 ? 22 : -22), LAKE_TOP + 8),
        new Phaser.Math.Vector2(inner, STREET_Y + 90),
        new Phaser.Math.Vector2(inner + (side < 0 ? 18 : -18), GAME_H + 4),
        new Phaser.Math.Vector2(outer, GAME_H + 4),
      ];
      g.fillStyle(grassColor, 1);
      g.fillPoints(pts, true);
      g.lineStyle(4, ink, 0.85);
      g.beginPath();
      g.moveTo(pts[1]!.x, pts[1]!.y);
      g.lineTo(pts[2]!.x, pts[2]!.y);
      g.lineTo(pts[3]!.x, pts[3]!.y);
      g.strokePath();

      // Reeds / cattails near the water's edge
      const reedCol = env.season === 'winter' ? 0xa9b7c4 : env.season === 'autumn' ? 0xb58d47 : 0x4f8a4b;
      for (let i = 0; i < 6; i++) {
        const rx = bx + side * (-10 - i * 16) + (rng() - 0.5) * 10;
        const ry = STREET_Y + 190 + i * 16;
        g.lineStyle(3, reedCol, 1);
        g.lineBetween(rx, ry, rx + (rng() - 0.5) * 10, ry - 26 - rng() * 14);
        if (i % 2 === 0) {
          g.fillStyle(0x6b4423, 1);
          g.fillRoundedRect(rx - 3, ry - 32, 6, 12, 3);
        }
      }
    };
    drawBank(-1);
    drawBank(1);

    // Seasonal lake details: lily pads (non-winter) or floating ice floes (winter)
    const detailCount = 9;
    for (let i = 0; i < detailCount; i++) {
      const t = 0.08 + (i + 0.3 + rng() * 0.4) * (0.84 / detailCount);
      const dx = x0 + (x1 - x0) * t;
      const dy = ROAD_BOTTOM + 42 + rng() * (GAME_H - ROAD_BOTTOM - 58);
      if (wc.ice) {
        g.fillStyle(env.time === 'night' ? 0x8da6c4 : 0xeaf6fc, 0.85);
        g.lineStyle(2, ink, 0.45);
        g.fillEllipse(dx, dy, 44 + rng() * 34, 12 + rng() * 5);
        g.strokeEllipse(dx, dy, 44 + rng() * 34, 12 + rng() * 5);
      } else {
        const padCol = env.time === 'night' ? 0x265946 : 0x5aa469;
        g.fillStyle(padCol, 0.92);
        g.lineStyle(2, ink, 0.65);
        g.fillEllipse(dx, dy, 26 + rng() * 12, 10 + rng() * 4);
        g.strokeEllipse(dx, dy, 26 + rng() * 12, 10 + rng() * 4);
        if (i % 3 === 0) {
          g.fillStyle(env.time === 'night' ? 0xc28ea4 : 0xffb3c6, 1);
          g.fillCircle(dx + 3, dy - 2, 4.5);
        }
      }
    }
  }

  private drawLampReflections(g: G, lampXs: readonly number[], night: boolean): void {
    const col = night ? 0xffe599 : 0xffc87c;
    const alpha = night ? 0.24 : 0.16;
    for (const lx of lampXs) {
      for (let i = 0; i < 4; i++) {
        const ry = ROAD_BOTTOM + 38 + i * 16;
        const rw = 26 - i * 4;
        g.fillStyle(col, alpha * (1 - i * 0.18));
        g.fillEllipse(lx, ry, rw, 5);
      }
    }
  }

  private makeShimmerSpots(rng: () => number, lift: (x: number) => number): Array<{ x: number; y: number; w: number; phase: number; speed: number }> {
    const spots: Array<{ x: number; y: number; w: number; phase: number; speed: number }> = [];
    const { x0, x1 } = this.data;
    const count = 34;
    for (let i = 0; i < count; i++) {
      const x = x0 + 60 + rng() * (x1 - x0 - 120);
      const belowDeck = i % 3 !== 0;
      const y = belowDeck
        ? ROAD_BOTTOM + 34 + rng() * (GAME_H - ROAD_BOTTOM - 46)
        : LAKE_TOP + 16 + rng() * Math.max(18, STREET_Y + 18 - lift(x) - (LAKE_TOP + 16));
      spots.push({
        x,
        y,
        w: 24 + rng() * 46,
        phase: rng() * Math.PI * 2,
        speed: 1.4 + rng() * 1.4,
      });
    }
    return spots;
  }

  private redrawShimmer(): void {
    const g = this.shimmer;
    g.clear();
    const baseAlpha = this.night ? 0.22 : 0.45;
    for (const s of this.shimmerSpots) {
      const a = baseAlpha * (0.45 + 0.55 * Math.sin(this.time * s.speed + s.phase));
      const dx = Math.sin(this.time * 0.8 + s.phase) * 5;
      g.fillStyle(this.rippleColor, a);
      g.fillRoundedRect(s.x - s.w / 2 + dx, s.y, s.w, 3.5, 2);
    }
  }

  /**
   * Stone abutments, piers standing in the lake, and wide elliptical arches beneath the curved deck.
   * Returns world x positions for bridge lamp posts.
   */
  private drawUnderStructure(g: G, ink: number, wc: WaterColors, lift: (x: number) => number): number[] {
    const { x0, x1 } = this.data;
    const span = x1 - x0;
    const archCount = 5;
    const bayW = span / archCount;
    const pierW = 46;
    const deckBottom = (x: number) => ROAD_BOTTOM + 32 - lift(x);

    // Draw each bay's spandrel wall with a wide oval/elliptical arch cutout underneath
    for (let i = 0; i < archCount; i++) {
      const bx0 = x0 + i * bayW;
      const bx1 = bx0 + bayW;
      const inner0 = bx0 + pierW * 0.5;
      const inner1 = bx1 - pierW * 0.5;
      const steps = 18;
      const pts: Phaser.Math.Vector2[] = [];

      // Top edge follows the curved bridge deck bottom
      for (let s = 0; s <= steps; s++) {
        const x = inner0 + ((inner1 - inner0) * s) / steps;
        pts.push(new Phaser.Math.Vector2(x, deckBottom(x) - 6));
      }
      // Bottom edge traces a graceful wide elliptical arch rising between the piers
      const springY = GAME_H - 18;
      for (let s = steps; s >= 0; s--) {
        const u = s / steps;
        const x = inner0 + (inner1 - inner0) * u;
        const crownY = deckBottom(x) + 12;
        const archShape = Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2)); // true ellipse!
        const y = springY - (springY - crownY) * archShape;
        pts.push(new Phaser.Math.Vector2(x, y));
      }

      g.fillStyle(wc.stoneDark, 1);
      g.fillPoints(pts, true);

      // Crisp outline along the oval arch rim
      g.lineStyle(4, ink, 0.9);
      g.beginPath();
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        const x = inner0 + (inner1 - inner0) * u;
        const crownY = deckBottom(x) + 12;
        const archShape = Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
        const y = springY - (springY - crownY) * archShape;
        if (s === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokePath();
    }

    // Piers standing in the lake + shore abutments at both ends
    for (let i = 0; i <= archCount; i++) {
      const px = x0 + i * bayW;
      const topY = deckBottom(px) - 6;
      const isEnd = i === 0 || i === archCount;
      const w = isEnd ? 64 : pierW;
      const waterY = isEnd ? GAME_H + 4 : GAME_H - 10;

      g.fillStyle(wc.stone, 1);
      g.lineStyle(4, ink, 1);
      g.fillRoundedRect(px - w / 2, topY, w, waterY - topY, 6);
      g.strokeRoundedRect(px - w / 2, topY, w, waterY - topY, 6);

      // Decorative pier cap
      g.fillStyle(shade(wc.stone, 0.12), 1);
      g.fillRoundedRect(px - w / 2 - 5, topY - 4, w + 10, 12, 4);
      g.strokeRoundedRect(px - w / 2 - 5, topY - 4, w + 10, 12, 4);

      // Water ripple ring around each in-lake pier base
      if (!isEnd) {
        g.fillStyle(wc.ripple, 0.65);
        g.fillEllipse(px, waterY, w + 28, 10);
      }
    }

    // Lamp positions along the bridge (aligned above piers and mid-bays)
    const lampXs: number[] = [];
    for (let x = x0 + 180; x <= x1 - 180; x += 320) lampXs.push(x);
    return lampXs;
  }

  private drawDeck(g: G, env: Env, p: ReturnType<typeof paletteFor>, wc: WaterColors, lift: (x: number) => number): void {
    const { x0, x1 } = this.data;
    const night = env.time === 'night';

    const xs: number[] = [];
    for (let x = x0; x < x1; x += DECK_STEP) xs.push(x);
    xs.push(x1);

    const fillBand = (yTop: number, yBot: number, color: number, alpha = 1) => {
      const pts: Phaser.Math.Vector2[] = [];
      for (const x of xs) pts.push(new Phaser.Math.Vector2(x, yTop - lift(x)));
      for (let i = xs.length - 1; i >= 0; i--) {
        const x = xs[i]!;
        pts.push(new Phaser.Math.Vector2(x, yBot - lift(x)));
      }
      g.fillStyle(color, alpha);
      g.fillPoints(pts, true);
    };

    const strokeCurve = (yBase: number, width: number, color: number, alpha = 1) => {
      g.lineStyle(width, color, alpha);
      g.beginPath();
      xs.forEach((x, idx) => {
        const y = yBase - lift(x);
        if (idx === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.strokePath();
    };

    // Far narrow walkway + curb
    fillBand(STREET_Y + 26, STREET_Y + 42, p.sidewalk);
    fillBand(STREET_Y + 42, ROAD_TOP, p.curb);
    // 4-lane asphalt road surface
    fillBand(ROAD_TOP, ROAD_BOTTOM, p.road);
    // Near curb + concrete bridge deck side fascia
    fillBand(ROAD_BOTTOM, ROAD_BOTTOM + 12, p.curb);
    fillBand(ROAD_BOTTOM, ROAD_BOTTOM + 3, shade(p.curb, 0.3));
    fillBand(ROAD_BOTTOM + 12, ROAD_BOTTOM + 34, wc.stone);

    // Crisp outlines on the deck fascia
    strokeCurve(ROAD_BOTTOM + 12, 3, p.ink, 0.85);
    strokeCurve(ROAD_BOTTOM + 34, 4, p.ink, 1);

    // Double yellow centre line following the gentle oval curve
    const yellow = night ? 0xc9a93a : 0xf2c230;
    strokeCurve(STREET_Y + 112.5, 3, yellow, 1);
    strokeCurve(STREET_Y + 118.5, 3, yellow, 1);

    // Dashed white lane lines (same y offsets as street texture: +80 and +146)
    g.lineStyle(4, p.roadLine, 1);
    for (const yOff of [STREET_Y + 82, STREET_Y + 148]) {
      for (let x = x0 + 32; x < x1 - 48; x += 128) {
        const ex = Math.min(x + 64, x1 - 16);
        g.beginPath();
        g.moveTo(x, yOff - lift(x));
        const mid = (x + ex) / 2;
        g.lineTo(mid, yOff - lift(mid));
        g.lineTo(ex, yOff - lift(ex));
        g.strokePath();
      }
    }

    // Subtle expansion joints at both bridge ends
    for (const jx of [x0, x1]) {
      const l = lift(jx);
      g.lineStyle(4, p.ink, 0.45);
      g.lineBetween(jx, ROAD_TOP - l, jx - 10, ROAD_BOTTOM - l);
    }
  }

  private drawFarRailing(g: G, env: Env, ink: number, wc: WaterColors, lift: (x: number) => number, lampXs: readonly number[]): void {
    const { x0, x1 } = this.data;
    const night = env.time === 'night';
    const sunset = env.time === 'sunset';
    const baseY = STREET_Y + 26;
    const railH = 32;

    // Vertical balusters
    g.lineStyle(3, wc.rail, 0.95);
    for (let x = x0 + 18; x < x1; x += 28) {
      const y = baseY - lift(x);
      g.lineBetween(x, y, x, y - railH);
    }

    // Top and mid handrails following the oval curve
    const strokeRail = (yOff: number, w: number, col: number) => {
      g.lineStyle(w, col, 1);
      g.beginPath();
      for (let x = x0; x <= x1; x += DECK_STEP) {
        const y = baseY - yOff - lift(x);
        if (x === x0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.lineTo(x1, baseY - yOff - lift(x1));
      g.strokePath();
    };
    strokeRail(railH, 7, ink);
    strokeRail(railH, 4, wc.stone);
    strokeRail(railH * 0.45, 3, ink);

    // Stone posts along the far balustrade
    for (let x = x0; x <= x1; x += 160) {
      const px = Math.min(x, x1);
      const y = baseY - lift(px);
      g.fillStyle(wc.stone, 1);
      g.lineStyle(3, ink, 1);
      g.fillRoundedRect(px - 6, y - railH - 6, 12, railH + 8, 3);
      g.strokeRoundedRect(px - 6, y - railH - 6, 12, railH + 8, 3);
    }

    // Vintage bridge lamp posts
    for (const lx of lampXs) {
      const y = baseY - lift(lx);
      const topY = y - 138;
      g.fillStyle(wc.rail, 1);
      g.lineStyle(3, ink, 1);
      g.fillRect(lx - 4, topY, 8, y - topY);
      g.strokeRect(lx - 4, topY, 8, y - topY);
      // Curved lamp arm & lantern cap
      g.fillStyle(ink, 1);
      g.fillRoundedRect(lx - 15, topY - 12, 30, 14, 6);
      if (night || sunset) {
        g.fillStyle(0xfff3b0, night ? 0.2 : 0.12);
        g.fillCircle(lx, topY + 6, night ? 48 : 34);
        g.fillStyle(0xfff3b0, night ? 0.34 : 0.22);
        g.fillCircle(lx, topY + 6, 24);
      }
      g.fillStyle(night || sunset ? 0xfff3b0 : 0xfff9db, 1);
      g.fillCircle(lx, topY + 6, 8);
      g.lineStyle(2.5, ink, 1);
      g.strokeCircle(lx, topY + 6, 8);
    }
  }

  /** Low, open foreground guardrail so vehicles clearly drive across the bridge without being hidden. */
  private drawNearRailing(g: G, ink: number, wc: WaterColors, lift: (x: number) => number): void {
    const { x0, x1 } = this.data;
    const baseY = ROAD_BOTTOM + 12;
    const railH = 22;

    // Posts
    for (let x = x0; x <= x1; x += 120) {
      const px = Math.min(x, x1);
      const y = baseY - lift(px);
      g.fillStyle(wc.stone, 1);
      g.lineStyle(3, ink, 1);
      g.fillRoundedRect(px - 4, y - railH - 2, 8, railH + 6, 2);
      g.strokeRoundedRect(px - 4, y - railH - 2, 8, railH + 6, 2);
    }

    // Two slim curved rails
    const drawRail = (yOff: number, w: number, col: number) => {
      g.lineStyle(w, col, 1);
      g.beginPath();
      for (let x = x0; x <= x1; x += DECK_STEP) {
        const y = baseY - yOff - lift(x);
        if (x === x0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.lineTo(x1, baseY - yOff - lift(x1));
      g.strokePath();
    };
    drawRail(railH, 6, ink);
    drawRail(railH, 3, wc.stone);
    drawRail(railH * 0.45, 3, ink);
  }

  /** Animates subtle lake water shimmer. */
  update(dt: number): void {
    this.time += dt;
    this.redrawShimmer();
  }
}
