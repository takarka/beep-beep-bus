import Phaser from 'phaser';
import { C, mix } from '../config';
import type { LandmarkId } from '../core/campaign';

type G = Phaser.GameObjects.Graphics;

const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
const GOLD = 0xe6b84a;
const SKY = 0x8fd0e8;
const SILVER = 0xc3c8cf;
const STONE = 0xf1ead8;
const NIGHT = 0x1b2048;

/**
 * Big picture of a landmark for the finish of a level. Drawn standing on the far sidewalk:
 * origin = middle of the building at ground level, up is negative, about 460 px wide and at most 345 px tall.
 * At night everything is dimmed and the windows are lit.
 */
export function drawLandmarkBig(g: G, id: LandmarkId, night = false): void {
  const tone = (c: number) => (night ? mix(c, NIGHT, 0.45) : c);
  const glass = night ? 0xfff3b0 : C.glass;
  const ink = C.ink;
  g.lineStyle(5, ink, 1);

  const rect = (c: number, x: number, y: number, w: number, h: number, r = 0) => {
    g.fillStyle(tone(c), 1);
    if (r) {
      g.fillRoundedRect(x, y, w, h, r);
      g.strokeRoundedRect(x, y, w, h, r);
    } else {
      g.fillRect(x, y, w, h);
      g.strokeRect(x, y, w, h);
    }
  };
  const poly = (c: number, pts: Phaser.Math.Vector2[]) => {
    g.fillStyle(tone(c), 1);
    g.fillPoints(pts, true);
    g.strokePoints(pts, true, true);
  };
  const disc = (c: number, x: number, y: number, r: number) => {
    g.fillStyle(tone(c), 1);
    g.fillCircle(x, y, r);
    g.strokeCircle(x, y, r);
  };
  const dome = (c: number, x: number, y: number, r: number, squash = 1) => {
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI - (i / 24) * Math.PI;
      pts.push(V(x + Math.cos(a) * r, y - Math.sin(a) * r * squash));
    }
    poly(c, pts);
  };
  const win = (x: number, y: number, w: number, h: number, round = 4) => {
    g.fillStyle(glass, 1);
    g.fillRoundedRect(x, y, w, h, round);
    g.lineStyle(3, ink, 1);
    g.strokeRoundedRect(x, y, w, h, round);
    g.lineStyle(5, ink, 1);
  };
  const archWin = (x: number, y: number, w: number, h: number) => {
    g.fillStyle(glass, 1);
    g.fillRoundedRect(x, y, w, h, { tl: w / 2, tr: w / 2, bl: 2, br: 2 });
    g.lineStyle(3, ink, 1);
    g.strokeRoundedRect(x, y, w, h, { tl: w / 2, tr: w / 2, bl: 2, br: 2 });
    g.lineStyle(5, ink, 1);
  };
  const line = (w: number, x1: number, y1: number, x2: number, y2: number, c: number = ink, a = 1) => {
    g.lineStyle(w, c, a);
    g.lineBetween(x1, y1, x2, y2);
    g.lineStyle(5, ink, 1);
  };

  switch (id) {
    case 'station': {
      // Nurly Zhol railway station: low wings and a tall glass hall with a clock
      for (const sx of [-1, 1]) {
        rect(0xe98a6b, sx < 0 ? -230 : 80, -92, 150, 92);
        rect(C.blue, sx < 0 ? -236 : 74, -104, 162, 14);
        for (let i = 0; i < 4; i++) win((sx < 0 ? -212 : 98) + i * 34, -74, 24, 36);
      }
      g.fillStyle(tone(SKY), 1);
      g.fillRoundedRect(-80, -180, 160, 180, { tl: 80, tr: 80, bl: 0, br: 0 });
      g.strokeRoundedRect(-80, -180, 160, 180, { tl: 80, tr: 80, bl: 0, br: 0 });
      for (const x of [-40, 0, 40]) line(3, x, -176, x, 0, ink, 0.55);
      line(3, -78, -80, 78, -80, ink, 0.55);
      rect(0x3b3640, -26, -60, 52, 60);
      rect(STONE, -16, -226, 32, 50);
      disc(0xffffff, 0, -204, 13);
      line(3, 0, -204, 0, -212);
      line(3, 0, -204, 7, -200);
      break;
    }
    case 'concert': {
      // Central Concert Hall "Kazakhstan": a flat glassy dome on a colonnade
      rect(STONE, -215, -72, 430, 72);
      for (let i = 0; i < 9; i++) rect(0xffffff, -196 + i * 46, -64, 16, 64);
      dome(SKY, 0, -72, 215, 0.62);
      for (let i = 1; i < 6; i++) {
        const a = Math.PI - (i / 6) * Math.PI;
        line(3, Math.cos(a) * 215, -72 - Math.sin(a) * 133 * 0.0 - 0, Math.cos(a) * 20, -72 - Math.sin(a) * 133, ink, 0.45);
      }
      line(4, 0, -205, 0, -240, GOLD);
      disc(GOLD, 0, -246, 8);
      rect(0xe3d3b3, -90, -10, 180, 10);
      rect(0x3b3640, -34, -56, 68, 46, 6);
      break;
    }
    case 'triumph': {
      // Triumph of Astana: two huge pillars joined by an arch, a golden figure on top
      rect(STONE, -175, -215, 78, 215);
      rect(STONE, 97, -215, 78, 215);
      rect(STONE, -175, -262, 350, 52);
      g.fillStyle(tone(0x3b3640), 1);
      g.fillRoundedRect(-97, -215, 194, 215, { tl: 97, tr: 97, bl: 0, br: 0 });
      for (const x of [-150, -128, 112, 134]) win(x, -190, 10, 120, 3);
      for (let i = 0; i < 7; i++) win(-130 + i * 40, -250, 14, 26, 3);
      poly(0xc9b690, [V(-14, -262), V(14, -262), V(0, -320)]);
      disc(GOLD, 0, -300, 16);
      line(5, -30, -262, -4, -300, GOLD);
      line(5, 30, -262, 4, -300, GOLD);
      break;
    }
    case 'shatyr': {
      // Khan Shatyr: a giant tent with concave sides and a mast
      const left: Phaser.Math.Vector2[] = [];
      const right: Phaser.Math.Vector2[] = [];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const y = -285 * Math.pow(t, 2.2);
        left.push(V(-225 + 217 * t, y));
        right.push(V(225 - 217 * t, y));
      }
      poly(SKY, [...left, ...right.reverse()]);
      for (const f of [-0.75, -0.45, -0.2, 0.2, 0.45, 0.75]) line(3, f * 225, 0, f * 14, -250, 0xffffff, 0.65);
      for (const h of [60, 130, 200]) {
        const half = 225 * (1 - Math.pow(h / 285, 1 / 2.2)) + 8 * (h / 285);
        line(3, -half, -h, half, -h, 0xffffff, 0.55);
      }
      line(8, 0, -285, 0, -345, 0xffffff);
      line(3, 0, -285, 0, -345, ink);
      rect(STONE, -245, -34, 490, 34);
      rect(0x3b3640, -50, -30, 100, 30, 6);
      for (let i = 0; i < 7; i++) if (Math.abs(-215 + i * 72) > 60) win(-224 + i * 72, -26, 24, 18, 3);
      break;
    }
    case 'peace': {
      // Palace of Peace and Reconciliation: a stepped pyramid with a glass top
      poly(GOLD, [V(-195, 0), V(0, -265), V(195, 0)]);
      for (const y of [-60, -118, -176]) {
        const half = 195 * (1 + y / 265);
        line(4, -half, y, half, y, ink, 0.7);
      }
      poly(SKY, [V(-48, -214), V(0, -282), V(48, -214)]);
      line(3, 0, -282, 0, -214, 0xffffff, 0.8);
      line(3, -24, -248, 24, -248, 0xffffff, 0.8);
      disc(0xffffff, 0, -166, 12);
      rect(0x3b3640, -34, -56, 68, 56, 8);
      rect(STONE, -215, -12, 430, 12);
      break;
    }
    case 'baiterek': {
      // Baiterek: a slender tower with a golden sphere, like a tree holding an egg
      for (const sx of [-1, 1]) line(15, sx * 74, 0, sx * 10, -140, ink);
      for (const sx of [-1, 1]) line(9, sx * 74, 0, sx * 10, -140, 0xd9d2c0);
      poly(0xd9d2c0, [V(-16, 0), V(-11, -230), V(11, -230), V(16, 0)]);
      for (const y of [-60, -120, -180]) line(3, -13, y, 13, y, ink, 0.6);
      rect(STONE, -105, -14, 210, 14);
      line(10, -48, -240, -9, -230, ink);
      line(10, 48, -240, 9, -230, ink);
      disc(GOLD, 0, -288, 56);
      g.lineStyle(3, ink, 0.55);
      g.strokeEllipse(0, -288, 40, 112);
      g.lineBetween(-56, -288, 56, -288);
      g.fillStyle(tone(SKY), 1);
      g.fillCircle(0, -288, 26);
      g.strokeCircle(0, -288, 26);
      g.lineStyle(5, ink, 1);
      g.fillStyle(0xffffff, night ? 0.5 : 0.8);
      g.fillCircle(-24, -316, 8);
      line(5, 0, -344, 0, -332);
      break;
    }
    case 'akorda': {
      // Ak Orda: the presidential palace, white with columns and a blue dome with a spire
      rect(0xffffff, -215, -112, 430, 112);
      for (let i = 0; i < 11; i++) rect(0xe8e4d8, -194 + i * 38, -104, 15, 96);
      rect(0xffffff, -95, -152, 190, 152);
      for (let i = 0; i < 5; i++) rect(0xe8e4d8, -78 + i * 38, -144, 15, 136);
      rect(0xffffff, -52, -196, 104, 46);
      dome(C.blue, 0, -196, 62, 1.0);
      line(5, 0, -258, 0, -300, GOLD);
      poly(C.red, [V(0, -300), V(34, -290), V(0, -280)]);
      for (const x of [-160, -120, 112, 152]) archWin(x, -92, 18, 40);
      rect(0xe3d3b3, -235, -12, 470, 12);
      break;
    }
    case 'mosque': {
      // Hazrat Sultan mosque: a big white dome, smaller domes and four minarets
      rect(STONE, -140, -104, 280, 104);
      dome(0xffffff, 0, -104, 112, 1.0);
      for (const sx of [-1, 1]) dome(0xffffff, sx * 118, -104, 44, 1.0);
      for (const sx of [-1, 1]) {
        for (const off of [166, 214]) {
          const x = sx * off;
          rect(STONE, x - 11, -250, 22, 250);
          poly(GOLD, [V(x - 14, -250), V(x + 14, -250), V(x, -296)]);
          rect(0xe3d3b3, x - 15, -204, 30, 8);
        }
      }
      line(4, 0, -216, 0, -250, GOLD);
      disc(GOLD, 0, -258, 8);
      for (let i = 0; i < 6; i++) archWin(-100 + i * 36, -84, 22, 52);
      break;
    }
    case 'kazakheli': {
      // Kazak Eli monument: two tall steles and a golden Samruk bird between them
      rect(SILVER, -92, -258, 48, 258);
      rect(SILVER, 44, -258, 48, 258);
      poly(SILVER, [V(-92, -258), V(-44, -258), V(-68, -290)]);
      poly(SILVER, [V(44, -258), V(92, -258), V(68, -290)]);
      g.lineStyle(7, tone(GOLD), 1);
      g.strokeCircle(0, -250, 54);
      g.lineStyle(5, ink, 1);
      poly(GOLD, [V(-104, -258), V(-46, -300), V(-6, -272), V(0, -246), V(6, -272), V(46, -300), V(104, -258), V(48, -262), V(0, -212), V(-48, -262)]);
      disc(0xffffff, 0, -268, 5);
      rect(STONE, -170, -22, 340, 22);
      rect(0xe3d3b3, -135, -40, 270, 18);
      g.fillStyle(tone(SKY), 1);
      g.fillEllipse(-190, -6, 70, 16);
      g.fillEllipse(190, -6, 70, 16);
      break;
    }
    case 'nuralem': {
      // Nur Alem: a huge silver sphere (EXPO 2017)
      rect(STONE, -150, -34, 300, 34);
      rect(0xe3d3b3, -110, -52, 220, 18);
      disc(0xdfe3e8, 0, -178, 128);
      g.lineStyle(3, ink, 0.45);
      g.strokeEllipse(0, -178, 90, 256);
      g.strokeEllipse(0, -178, 190, 256);
      g.lineBetween(-128, -178, 128, -178);
      g.lineBetween(-110, -238, 110, -238);
      g.lineBetween(-110, -118, 110, -118);
      g.fillStyle(0xffffff, night ? 0.35 : 0.8);
      g.fillCircle(-52, -232, 22);
      g.lineStyle(5, ink, 1);
      break;
    }
    case 'arena': {
      // Astana Arena: a stadium with a retractable roof, floodlights and flags
      rect(0xcfd5dc, -232, -112, 464, 112, 40);
      for (let i = 0; i < 9; i++) line(3, -200 + i * 50, -104, -200 + i * 50, -8, ink, 0.35);
      dome(0xf1f5f8, 0, -112, 232, 0.5);
      for (let i = 1; i < 7; i++) {
        const a = Math.PI - (i / 7) * Math.PI;
        line(3, Math.cos(a) * 232, -112, Math.cos(a) * 30, -112 - Math.sin(a) * 116, ink, 0.4);
      }
      g.fillStyle(tone(0x3b3640), 1);
      for (const x of [-120, -30, 60]) g.fillRoundedRect(x, -60, 60, 60, { tl: 30, tr: 30, bl: 0, br: 0 });
      for (const sx of [-1, 1]) {
        line(8, sx * 214, -112, sx * 214, -250, ink);
        rect(0xfff3b0, sx * 214 - 22, -272, 44, 24, 4);
        poly(C.green, [V(sx * 214, -250), V(sx * 214 + sx * 28, -240), V(sx * 214, -230)]);
      }
      break;
    }
    case 'airport': {
      // Airport: terminal with a glass front, a control tower and a plane in the sky
      rect(STONE, -230, -92, 330, 92);
      rect(C.blue, -240, -106, 350, 14);
      g.fillStyle(glass, 1);
      g.fillRect(-218, -78, 306, 46);
      g.strokeRect(-218, -78, 306, 46);
      for (let i = 1; i < 10; i++) line(3, -218 + i * 30.6, -78, -218 + i * 30.6, -32, ink, 0.5);
      rect(0x3b3640, -30, -30, 60, 30);
      rect(STONE, 118, -214, 28, 214);
      poly(glass, [V(98, -214), V(166, -214), V(180, -262), V(84, -262)]);
      for (const x of [112, 132, 152]) line(3, x, -214, x + (x - 132) * 0.4, -262, ink, 0.5);
      rect(0x3b3640, 76, -272, 112, 12, 4);
      line(4, 132, -272, 132, -310);
      // little plane
      g.fillStyle(tone(0xffffff), 1);
      g.fillEllipse(-118, -190, 84, 18);
      g.strokeEllipse(-118, -190, 84, 18);
      poly(C.blue, [V(-124, -194), V(-100, -194), V(-132, -236), V(-146, -236)]);
      poly(C.blue, [V(-124, -186), V(-100, -186), V(-132, -150), V(-146, -150)]);
      poly(C.blue, [V(-152, -194), V(-144, -194), V(-160, -214), V(-166, -214)]);
      break;
    }
    case 'koktobe': {
      // Kok-Tobe: green hill, stepped TV tower with observation pods and a cable car
      poly(0x5ea85b, [V(-230, 0), V(-90, -148), V(60, -80), V(215, 0)]);
      poly(0x4b8e49, [V(-230, 0), V(-140, -90), V(-20, 0)]);
      // Cable car line & lit cabin
      line(4, -210, -215, -70, -110, ink);
      rect(C.red, -162, -172, 46, 32, 7);
      win(-154, -165, 30, 14, 3);
      // TV tower
      poly(SILVER, [V(32, -32), V(44, -270), V(76, -270), V(88, -32)]);
      rect(STONE, 16, -36, 88, 36, 4);
      win(42, -26, 36, 26, 3);
      // Observation decks
      rect(C.red, 26, -218, 68, 22, 6);
      win(36, -213, 48, 12, 3);
      rect(STONE, 30, -158, 60, 18, 5);
      win(38, -154, 44, 10, 2);
      // Antenna spire & warning light
      line(5, 60, -270, 60, -334, ink);
      disc(C.red, 60, -334, 7);
      break;
    }
    case 'medeu': {
      // Medeu: mountain peaks, protective dam, floodlights and gleaming high-altitude ice rink
      poly(0x8aa0b8, [V(-230, 0), V(-115, -265), V(15, 0)]);
      poly(0x9eb4cc, [V(-25, 0), V(110, -235), V(230, 0)]);
      poly(0xf4f8fb, [V(-115, -265), V(-160, -172), V(-70, -172)]);
      poly(0xf4f8fb, [V(110, -235), V(68, -152), V(152, -152)]);
      // Stadium & dam terrace
      rect(STONE, -205, -72, 410, 72, 10);
      for (let i = -3; i <= 3; i++) win(i * 48 - 14, -62, 28, 16, 3);
      // Floodlights
      for (const sx of [-185, -95, 95, 185]) {
        line(6, sx, -72, sx, -155, ink);
        rect(night ? 0xfff3b0 : 0xdfe3e8, sx - 18, -172, 36, 18, 4);
      }
      // Ice rink
      g.fillStyle(tone(SKY), 1);
      g.fillEllipse(0, -18, 340, 34);
      g.strokeEllipse(0, -18, 340, 34);
      g.lineStyle(3, 0xffffff, 0.8);
      g.strokeEllipse(0, -18, 250, 20);
      g.lineStyle(5, ink, 1);
      break;
    }
    case 'shymbulak': {
      // Shymbulak: snowy peaks, gondola cableway and cosy alpine lodge
      poly(0xe3edf5, [V(-230, 0), V(-100, -280), V(35, 0)]);
      poly(0xf4f8fb, [V(-30, 0), V(110, -305), V(230, 0)]);
      poly(0xc7daea, [V(-100, -280), V(-138, -175), V(-72, -175)]);
      // Cableway pylons & wires
      line(6, -155, 0, -155, -205, ink);
      line(6, 155, 0, 155, -120, ink);
      line(4, -220, -225, 220, -100, ink);
      for (const [cx, cy] of [[-75, -182], [75, -140]] as const) {
        line(3, cx, cy, cx, cy + 16, ink);
        rect(C.red, cx - 24, cy + 16, 48, 34, 8);
        win(cx - 16, cy + 23, 32, 16, 3);
      }
      // Alpine lodge
      rect(0x8a5a3b, -80, -76, 160, 76);
      poly(C.red, [V(-96, -76), V(0, -124), V(96, -76)]);
      win(-60, -56, 34, 28);
      win(26, -56, 34, 28);
      rect(0x3b3640, -16, -46, 32, 46, 4);
      break;
    }
    case 'circus': {
      // Almaty Circus: colonnade base, yurt-shaped ribbed roof and ornate crown
      rect(STONE, -195, -96, 390, 96, 8);
      for (let i = -3; i <= 3; i++) if (i !== 0) archWin(i * 48 - 14, -76, 28, 52);
      rect(0x3b3640, -36, -56, 72, 56, 6);
      // Striped yurta dome
      dome(C.red, 0, -96, 195, 0.72);
      for (const f of [-0.65, -0.35, 0, 0.35, 0.65]) line(4, f * 195, -96, f * 30, -230, 0xffffff, 0.65);
      rect(GOLD, -198, -108, 396, 14, 4);
      line(5, 0, -236, 0, -278, GOLD);
      disc(GOLD, 0, -284, 14);
      break;
    }
    case 'panfilov': {
      // Panfilov Park & Ascension Cathedral: colourful wooden domes and park trees
      for (const tx of [-185, 185]) {
        rect(0x8a5a3b, tx - 10, -70, 20, 70);
        disc(0x5ea85b, tx, -108, 48);
      }
      // Bell tower on the left
      rect(GOLD, -145, -205, 52, 205);
      poly(C.green, [V(-152, -205), V(-119, -275), V(-86, -205)]);
      disc(GOLD, -119, -285, 10);
      win(-131, -178, 24, 38);
      // Main cathedral
      rect(GOLD, -95, -145, 225, 145);
      poly(C.green, [V(-110, -145), V(18, -235), V(146, -145)]);
      for (const [dx, dy, r] of [[-48, -165, 24], [18, -242, 30], [84, -165, 24]] as const) {
        disc(GOLD, dx, dy, r);
        line(4, dx, dy - r, dx, dy - r - 22, GOLD);
      }
      for (const x of [-56, 18, 86]) archWin(x - 14, -112, 28, 52);
      rect(0x3b3640, -10, -52, 46, 52, 6);
      break;
    }
    case 'almaty_station': {
      // Almaty Railway Station: symmetric facade, central clock portico and arched portal
      rect(STONE, -215, -112, 430, 112);
      rect(C.green, -226, -128, 452, 16, 4);
      for (let i = -3; i <= 3; i++) if (Math.abs(i) > 1) archWin(i * 52 - 14, -88, 28, 48);
      // Central portico
      rect(0xfff8e7, -64, -172, 128, 172);
      poly(C.green, [V(-74, -172), V(0, -215), V(74, -172)]);
      archWin(-28, -138, 56, 70);
      rect(0x3b3640, -28, -56, 56, 56, 6);
      disc(0xffffff, 0, -184, 15);
      line(3, 0, -184, 0, -193);
      line(3, 0, -184, 8, -184);
      break;
    }
    case 'dendropark': {
      // Dendropark: classical colonnade entrance, pond with bridge and lush canopy
      for (const [x, r, col] of [[-165, 62, 0x4b8e49], [165, 62, 0x4b8e49], [-92, 74, 0x5ea85b], [92, 74, 0x5ea85b]] as const) {
        rect(0x8a5a3b, x - 11, -96, 22, 96);
        disc(col, x, -135, r);
      }
      // Entrance colonnade
      rect(STONE, -78, -120, 156, 26, 6);
      for (const x of [-60, -22, 16, 54]) rect(0xffffff, x - 7, -94, 14, 94);
      // Pond & footbridge
      g.fillStyle(tone(SKY), 1);
      g.fillEllipse(0, -14, 210, 32);
      g.strokeEllipse(0, -14, 210, 32);
      rect(0x8a5a3b, -56, -32, 112, 14, 5);
      break;
    }
    case 'baidibek': {
      // Baidibek Bi: terraced hill, tall pedestal and golden figure overlooking Shymkent
      poly(0x9a8f80, [V(-210, 0), V(-60, -96), V(60, -96), V(210, 0)]);
      poly(0x7fb069, [V(-210, 0), V(-130, -56), V(-70, 0)]);
      poly(0x7fb069, [V(70, 0), V(130, -56), V(210, 0)]);
      // Central staircase
      rect(STONE, -26, -96, 52, 96);
      for (let y = -16; y >= -80; y -= 16) line(3, -24, y, 24, y, ink, 0.5);
      // Monument pedestal & figure
      rect(STONE, -34, -182, 68, 86);
      rect(GOLD, -16, -280, 32, 98);
      line(10, -54, -262, 54, -262, GOLD);
      disc(GOLD, 0, -298, 20);
      break;
    }
    case 'citadel': {
      // Shymkent Citadel: fortified sandstone walls, watchtowers and carved gates
      rect(0xdcb877, -165, -136, 330, 136);
      for (let x = -150; x <= 130; x += 44) rect(0xdcb877, x, -164, 24, 28);
      // Flanking watchtowers
      for (const tx of [-185, 145]) {
        rect(0xc9a362, tx, -196, 46, 196, 6);
        for (const bx of [tx + 2, tx + 26]) rect(0xc9a362, bx, -220, 18, 24);
        win(tx + 15, -158, 16, 32, 6);
        win(tx + 15, -96, 16, 32, 6);
      }
      // Pointed Timurid gate
      g.fillStyle(tone(0x3a86ff), 1);
      g.fillRoundedRect(-52, -108, 104, 108, { tl: 44, tr: 44, bl: 0, br: 0 });
      g.strokeRoundedRect(-52, -108, 104, 108, { tl: 44, tr: 44, bl: 0, br: 0 });
      rect(0x6b3e26, -34, -78, 68, 78, 6);
      break;
    }
    case 'tulip': {
      // Tulip Square: grand fountain pool, water arcs and glowing scarlet tulip sculpture
      rect(STONE, -190, -26, 380, 26, 8);
      g.fillStyle(tone(SKY), 1);
      g.fillEllipse(0, -26, 340, 26);
      g.strokeEllipse(0, -26, 340, 26);
      // Water jets
      g.lineStyle(4, 0xffffff, 0.8);
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.arc(sx * 72, -28, 50, sx < 0 ? -Math.PI * 0.85 : -Math.PI * 0.9, sx < 0 ? -Math.PI * 0.1 : -Math.PI * 0.15, false);
        g.strokePath();
      }
      g.lineStyle(5, ink, 1);
      // Giant tulip sculpture
      rect(0x5ea85b, -12, -148, 24, 122);
      poly(C.red, [V(-54, -196), V(0, -144), V(54, -196), V(38, -268), V(0, -238), V(-38, -268)]);
      poly(C.yellow, [V(-26, -210), V(0, -278), V(26, -210), V(0, -158)]);
      // Small tulips at base
      for (const tx of [-145, -105, 105, 145]) {
        line(4, tx, -26, tx, -52, 0x5ea85b);
        disc(C.red, tx, -58, 10);
      }
      break;
    }
    case 'shymkent_zoo': {
      // Shymkent Zoo: twin-tower arch gate, giraffe and pink flamingo
      // Giraffe peeking on the left
      rect(GOLD, -102, -162, 22, 162);
      rect(GOLD, -106, -182, 42, 24, 10);
      for (const y of [-140, -110, -80]) disc(0x8a5a3b, -91, y, 5);
      // Pink flamingo on the right
      line(4, 92, 0, 92, -52, C.orange);
      disc(0xf15bb5, 92, -62, 22);
      // Zoo archway
      for (const x of [-185, 135]) {
        rect(C.orange, x, -200, 50, 200, 6);
        poly(C.green, [V(x - 6, -200), V(x + 25, -242), V(x + 56, -200)]);
        win(x + 12, -162, 26, 36);
      }
      rect(C.yellow, -195, -214, 390, 44, 12);
      for (const x of [-80, 0, 80]) disc(C.green, x, -192, 10);
      break;
    }
    case 'shymkent_airport': {
      // Shymkent Airport: sunlit wave-roof terminal, glass facade, tower and ascending plane
      rect(STONE, -215, -100, 320, 100);
      rect(C.orange, -228, -118, 346, 20, 10);
      g.fillStyle(glass, 1);
      g.fillRect(-198, -82, 286, 48);
      g.strokeRect(-198, -82, 286, 48);
      for (let i = 1; i < 8; i++) line(3, -198 + i * 35.75, -82, -198 + i * 35.75, -34, ink, 0.5);
      rect(0x3b3640, -30, -34, 60, 34);
      // Control tower
      rect(STONE, 124, -208, 28, 208);
      poly(glass, [V(104, -208), V(172, -208), V(184, -252), V(92, -252)]);
      rect(C.orange, 86, -262, 104, 12, 4);
      line(4, 138, -262, 138, -298);
      // Plane climbing
      g.fillStyle(tone(0xffffff), 1);
      g.fillEllipse(-96, -192, 86, 18);
      g.strokeEllipse(-96, -192, 86, 18);
      poly(C.orange, [V(-102, -196), V(-78, -196), V(-110, -238), V(-124, -238)]);
      poly(C.orange, [V(-102, -188), V(-78, -188), V(-110, -152), V(-124, -152)]);
      break;
    }
  }
}
