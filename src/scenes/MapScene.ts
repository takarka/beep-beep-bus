import Phaser from 'phaser';
import { audio } from '../audio/AudioEngine';
import { BusView } from '../bus/BusView';
import { DEFAULT_DESIGN } from '../bus/design';
import { loadBusStatus, loadDesign } from '../bus/garage';
import { BODY_SIZE } from '../bus/geometry';
import { C, GAME_H, GAME_W, hex } from '../config';
import { CITIES, CITY_RANGES, LEVEL_COUNT, MAP_NODES, cityForLevel, type CityId, type MapNode } from '../core/campaign';
import { LOW_FUEL, MAX_FUEL, MAX_HEALTH } from '../core/rules';
import {
  completedCount,
  isCompleted,
  isUnlocked,
  loadProgress,
  totalScore,
  type Progress,
} from '../core/progress';
import { mulberry32 } from '../core/rng';
import { t, type TextKey } from '../i18n';
import { Icons, drawStar } from '../ui/draw';
import { drawLandmark, drawLock } from '../ui/landmarks';
import { drawLandmarkBig } from '../ui/landmarkScenes';
import { Button, confetti, label } from '../ui/widgets';
import { addAudioToggles } from './MenuScene';

type G = Phaser.GameObjects.Graphics;
type NodeState = 'locked' | 'current' | 'done';

const R = 46;
const BUS_LEN = 92;

/** One level on the map: a landmark badge with its state (locked / next / completed with stars). */
class NodeView extends Phaser.GameObjects.Container {
  state: NodeState = 'locked';
  private disc: G;
  private icon: G;
  private extras: G;
  private mark: G;
  private starsG: G;
  private lockG: G;
  private pulse: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, readonly level: number, private readonly node: MapNode) {
    super(scene, node.x, node.y);
    scene.add.existing(this);
    this.disc = scene.add.graphics();
    this.icon = scene.add.graphics();
    this.lockG = scene.add.graphics();
    this.extras = scene.add.graphics();
    this.mark = scene.add.graphics();
    this.starsG = scene.add.graphics();
    const num = scene.add.graphics({ x: -R * 0.72, y: -R * 0.72 });
    num.fillStyle(C.ink, 1);
    num.fillCircle(0, 0, 17);
    num.lineStyle(3, C.cream, 1);
    num.strokeCircle(0, 0, 17);
    const numText = label(scene, -R * 0.72, -R * 0.72 + 1, String(level), { size: 20, color: C.cream, strokeThickness: 0 });
    const name = label(scene, 0, R + 46, t(`lm_${node.landmark}` as TextKey), {
      size: 20,
      color: C.ink,
      stroke: C.cream,
      strokeThickness: 5,
      wrap: 200,
    });
    this.add([this.disc, this.icon, this.lockG, this.extras, this.mark, this.starsG, num, numText, name]);
    this.setDepth(20);
    this.setInteractive(new Phaser.Geom.Circle(0, 0, R + 10), Phaser.Geom.Circle.Contains);
    if (this.input) this.input.cursor = 'pointer';
  }

  setNodeState(state: NodeState, stars = 0): void {
    this.state = state;
    const locked = state === 'locked';
    this.disc.clear();
    this.disc.fillStyle(0x000000, 0.18);
    this.disc.fillCircle(0, 6, R);
    this.disc.fillStyle(locked ? 0xd8d2c4 : C.cream, 1);
    this.disc.fillCircle(0, 0, R);
    this.disc.lineStyle(8, state === 'done' ? C.green : state === 'current' ? C.yellow : 0x9a9fa8, 1);
    this.disc.strokeCircle(0, 0, R);
    this.disc.lineStyle(3, C.ink, 1);
    this.disc.strokeCircle(0, 0, R + 4);

    this.icon.clear();
    drawLandmark(this.icon, this.node.landmark, locked ? 0.3 : 1);
    this.icon.setScale(0.78);

    this.lockG.clear();
    if (locked) drawLock(this.lockG, 40);

    this.extras.clear();
    this.mark.clear();
    if (state === 'done' || state === 'current') {
      const bx = R * 0.74;
      this.extras.fillStyle(C.green, 1);
      this.extras.fillCircle(bx, bx, 18);
      this.extras.lineStyle(3, C.ink, 1);
      this.extras.strokeCircle(bx, bx, 18);
      this.mark.setPosition(bx, bx);
      if (state === 'done') Icons.check(this.mark, 30);
      else Icons.play(this.mark, 26);
    }

    this.starsG.clear();
    if (state === 'done') {
      for (let i = 0; i < 3; i++) drawStar(this.starsG, (i - 1) * 28, R + 14, 12, i < stars ? C.yellow : 0xd9cfbf, C.ink, 2);
    }

    this.pulse?.stop();
    this.pulse = null;
    this.setScale(1);
    if (state === 'current') {
      this.pulse = this.scene.tweens.add({ targets: this, scale: 1.08, yoyo: true, repeat: -1, duration: 650, ease: 'Sine.easeInOut' });
    }
  }

  /** A bouncy "stamp" when the state changes. */
  pop(): void {
    this.pulse?.stop();
    this.setScale(1.35);
    this.scene.tweens.add({
      targets: this,
      scale: 1,
      duration: 420,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (this.state === 'current') this.setNodeState('current');
      },
    });
  }

  shake(): void {
    this.scene.tweens.add({ targets: this, x: this.x + 8, yoyo: true, repeat: 3, duration: 55, onComplete: () => (this.x = this.node.x) });
  }
}

function drawMapBackground(scene: Phaser.Scene, city: CityId): void {
  const g = scene.add.graphics().setDepth(-10);
  const rng = mulberry32(city === 'astana' ? 3 : city === 'almaty' ? 17 : 29);
  const baseBg = city === 'astana' ? 0xe4ecc6 : city === 'almaty' ? 0xdde9c2 : 0xf2e6c2;
  const streetCol = city === 'shymkent' ? 0xfbf5e2 : 0xf3eed8;
  g.fillStyle(baseBg, 1);
  g.fillRect(0, 0, GAME_W, GAME_H);

  // city blocks: a soft street grid with a few avenues
  g.lineStyle(10, streetCol, 0.9);
  for (let x = 60; x < GAME_W; x += 170) g.lineBetween(x, 0, x, GAME_H);
  for (let y = 70; y < GAME_H; y += 140) g.lineBetween(0, y, GAME_W, y);
  g.lineStyle(14, streetCol, 0.9);
  g.lineBetween(0, 700, 1280, 0);
  g.lineBetween(0, 250, 700, 720);

  if (city === 'almaty') {
    // Zailiysky Alatau snow-capped mountains along the top of the map
    const peaks = [
      [0, 165], [120, 48], [260, 150], [420, 34], [580, 155], [760, 24],
      [940, 148], [1120, 38], [1280, 145],
    ] as const;
    const poly: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(0, 0), new Phaser.Math.Vector2(GAME_W, 0)];
    for (let i = peaks.length - 1; i >= 0; i--) poly.push(new Phaser.Math.Vector2(peaks[i]![0], peaks[i]![1]));
    g.fillStyle(0x9eb4cc, 0.92);
    g.fillPoints(poly, true);
    g.fillStyle(0xf4f8fb, 0.96);
    for (let i = 1; i < peaks.length - 1; i += 2) {
      const [px, py] = peaks[i]!;
      const [lx, ly] = peaks[i - 1]!;
      const [rx, ry] = peaks[i + 1]!;
      g.fillTriangle(px, py, px + (lx - px) * 0.44, py + (ly - py) * 0.44, px + (rx - px) * 0.44, py + (ry - py) * 0.44);
    }
  }

  // little houses
  const colors = city === 'shymkent'
    ? [0xe98a6b, 0xf2b56b, 0xdca06d, 0xd4a5a5, 0xf2c57c]
    : [0xe98a6b, 0xf2c57c, 0x9cc5a1, 0xd4a5a5, 0xa5b4d4];
  for (let i = 0; i < 65; i++) {
    const w = 18 + rng() * 22;
    const h = 16 + rng() * 18;
    const hx = rng() * GAME_W;
    const hy = (city === 'almaty' ? 140 : 20) + rng() * (GAME_H - (city === 'almaty' ? 160 : 40));
    g.fillStyle(colors[Math.floor(rng() * colors.length)]!, 0.5);
    g.fillRoundedRect(hx, hy, w, h, 4);
  }

  // parks & orchards
  const parks = city === 'astana'
    ? [[220, 120, 200, 90], [760, 600, 220, 90], [1060, 250, 220, 120], [60, 440, 160, 100], [520, 330, 140, 70]]
    : city === 'almaty'
      ? [[180, 260, 180, 100], [560, 340, 190, 95], [1060, 270, 200, 110], [260, 620, 210, 90], [920, 600, 220, 100]]
      : [[950, 430, 250, 150], [720, 265, 200, 110], [220, 220, 190, 95], [1060, 190, 170, 90], [260, 630, 210, 90]];
  for (const [x, y, w, h] of parks) {
    g.fillStyle(0xbfdc98, 1);
    g.fillEllipse(x!, y!, w!, h!);
    g.fillStyle(0x9ccb7a, 1);
    for (let i = 0; i < 6; i++) g.fillCircle(x! + (rng() - 0.5) * w! * 0.7, y! + (rng() - 0.5) * h! * 0.6, 7 + rng() * 5);
    if (city === 'almaty') {
      g.fillStyle(0xe63946, 0.85);
      for (let i = 0; i < 5; i++) g.fillCircle(x! + (rng() - 0.5) * w! * 0.6, y! + (rng() - 0.5) * h! * 0.5, 3.2);
    }
  }

  if (city === 'shymkent') {
    // Sunny tulip meadows
    for (const [tx, ty] of [[680, 560], [270, 380], [1060, 560], [540, 160]] as const) {
      for (let i = 0; i < 9; i++) {
        g.fillStyle(i % 2 === 0 ? C.red : C.yellow, 0.85);
        g.fillCircle(tx + (rng() - 0.5) * 90, ty + (rng() - 0.5) * 44, 4);
      }
    }
  }

  // City river
  if (city === 'almaty') {
    // Malaya Almatinka flowing down from the mountains
    const riverX = (y: number) => 850 - y * 0.42 + Math.sin(y / 115) * 48;
    const left: Phaser.Math.Vector2[] = [];
    const right: Phaser.Math.Vector2[] = [];
    for (let y = 110; y <= GAME_H + 20; y += 20) {
      left.push(new Phaser.Math.Vector2(riverX(y) - 24, y));
      right.push(new Phaser.Math.Vector2(riverX(y) + 24, y));
    }
    g.fillStyle(0x8fd0e8, 1);
    g.fillPoints([...left, ...right.slice().reverse()], true);
    g.lineStyle(4, 0x5fb0d0, 1);
    g.strokePoints(left, false, false);
    g.strokePoints(right, false, false);
  } else {
    const riverY = city === 'astana'
      ? (x: number) => 322 + Math.sin(x / 210 + 0.5) * 62 + (x / GAME_W) * 24
      : (x: number) => 475 - (x / GAME_W) * 165 + Math.sin(x / 190 + 0.4) * 44;
    const half = city === 'astana' ? 34 : 24;
    const top: Phaser.Math.Vector2[] = [];
    const bottom: Phaser.Math.Vector2[] = [];
    for (let x = -20; x <= GAME_W + 20; x += 20) {
      top.push(new Phaser.Math.Vector2(x, riverY(x) - half));
      bottom.push(new Phaser.Math.Vector2(x, riverY(x) + half));
    }
    g.fillStyle(0x8fd0e8, 1);
    g.fillPoints([...top, ...bottom.slice().reverse()], true);
    g.lineStyle(5, 0x5fb0d0, 1);
    g.strokePoints(top, false, false);
    g.strokePoints(bottom, false, false);
    g.lineStyle(4, 0xffffff, 0.55);
    for (let x = 40; x < GAME_W; x += 130) {
      g.beginPath();
      g.moveTo(x, riverY(x) - 6);
      g.lineTo(x + 26, riverY(x + 26) - 10);
      g.strokePath();
      g.beginPath();
      g.moveTo(x + 50, riverY(x + 50) + 12);
      g.lineTo(x + 74, riverY(x + 74) + 8);
      g.strokePath();
    }
  }

  // paper frame + compass
  g.lineStyle(12, C.ink, 1);
  g.strokeRoundedRect(6, 6, GAME_W - 12, GAME_H - 12, 18);
  const cx = GAME_W - 70;
  const cy = 150;
  g.fillStyle(C.cream, 1);
  g.fillCircle(cx, cy, 34);
  g.lineStyle(4, C.ink, 1);
  g.strokeCircle(cx, cy, 34);
  g.fillStyle(C.red, 1);
  g.fillTriangle(cx - 9, cy, cx + 9, cy, cx, cy - 27);
  g.fillStyle(C.ink, 1);
  g.fillTriangle(cx - 9, cy, cx + 9, cy, cx, cy + 27);
}

/** The road between two neighbouring levels: a gentle curve. */
function segment(i: number): Phaser.Curves.QuadraticBezier {
  const a = MAP_NODES[i]!;
  const b = MAP_NODES[i + 1]!;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const off = i % 2 === 0 ? 55 : -55;
  return new Phaser.Curves.QuadraticBezier(
    new Phaser.Math.Vector2(a.x, a.y),
    new Phaser.Math.Vector2(mx + (-dy / len) * off, my + (dx / len) * off),
    new Phaser.Math.Vector2(b.x, b.y),
  );
}

const segPoints = (i: number): Phaser.Math.Vector2[] => segment(i).getPoints(60);

/** Where the bus waits in front of a landmark: on the road just outside its badge. */
function restPoint(index: number): { x: number; y: number; seg: number; at: number } {
  const node = MAP_NODES[index]!;
  const firstIndex = CITY_RANGES[cityForLevel(index + 1)].start - 1;
  if (index > firstIndex) {
    const pts = segPoints(index - 1);
    for (let i = pts.length - 1; i >= 0; i--) {
      if (Math.hypot(pts[i]!.x - node.x, pts[i]!.y - node.y) >= R + 64) return { x: pts[i]!.x, y: pts[i]!.y, seg: index - 1, at: i };
    }
  }
  // the first landmark of a city has no road before it: park above the badge
  return { x: node.x, y: node.y - R - 12, seg: -1, at: 0 };
}

const BUS_ON_ROAD = 8;

function drawRoad(g: G, curve: Phaser.Curves.QuadraticBezier, built: boolean): void {
  const pts = curve.getPoints(40);
  if (built) {
    for (const [w, c] of [[24, C.ink], [17, 0x6d7078]] as const) {
      g.lineStyle(w, c, 1);
      g.strokePoints(pts, false, false);
    }
    g.fillStyle(C.roadLine, 1);
    for (let i = 1; i < pts.length - 1; i += 2) g.fillCircle(pts[i]!.x, pts[i]!.y, 2.6);
  } else {
    g.fillStyle(0xa49b86, 1);
    for (let i = 1; i < pts.length - 1; i += 2) g.fillCircle(pts[i]!.x, pts[i]!.y, 5);
  }
}

/** The campaign map across Astana, Almaty, and Shymkent: every level is a landmark with stars and a postcard story. */
export class MapScene extends Phaser.Scene {
  private nodes: NodeView[] = [];
  private bus!: BusView;
  private busScale = 0.19;
  private moving = false;
  private busy = false;
  private scoreText!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private playBtn!: Button;
  private city: CityId = 'astana';
  private postcardModal: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Map');
  }

  create(data?: { celebrate?: number; city?: CityId }): void {
    this.cameras.main.fadeIn(250, 45, 42, 50);
    audio.setMusicTheme('menu');
    audio.setMusicIntensity(0.45);
    this.nodes = [];
    this.moving = false;
    this.busy = false;
    this.postcardModal = null;
    const progress = loadProgress();
    // A level that was just completed for the first time gets a stamp + the bus drives on to the next one.
    const cel = data?.celebrate && isCompleted(progress, data.celebrate) ? data.celebrate : 0;
    this.city = data?.city ?? cityForLevel(cel || progress.level);

    drawMapBackground(this, this.city);
    this.createRoads(progress, cel);
    this.createNodes(progress, cel);
    this.createHud(progress, cel);
    this.createBus(progress, cel);
    this.createPlayButton(progress, cel);

    const kb = this.input.keyboard;
    kb?.on('keydown-ENTER', () => {
      if (!this.postcardModal) this.playNext(progress);
    });

    if (cel) this.celebrate(progress, cel);
  }

  private visualState(p: Progress, level: number, cel: number): NodeState {
    if (cel && level === cel) return 'current';
    if (cel && level === cel + 1) return 'locked';
    if (isCompleted(p, level)) return 'done';
    return isUnlocked(p, level) ? 'current' : 'locked';
  }

  private createRoads(p: Progress, cel: number): void {
    const g = this.add.graphics().setDepth(-4);
    const { start, end } = CITY_RANGES[this.city];
    for (let i = start - 1; i < end - 1; i++) {
      const done = isCompleted(p, i + 1) && i + 1 !== cel;
      drawRoad(g, segment(i), done);
    }
  }

  private createNodes(p: Progress, cel: number): void {
    const { start, end } = CITY_RANGES[this.city];
    for (let level = start; level <= end; level++) {
      const node = MAP_NODES[level - 1]!;
      const nv = new NodeView(this, level, node);
      nv.setNodeState(this.visualState(p, level, cel), p.stars[String(level)] ?? 0);
      nv.on('pointerup', () => this.onTap(nv));
      this.nodes.push(nv);
    }
  }

  private createHud(p: Progress, cel: number): void {
    new Button(this, 56, 52, { r: 34, color: C.red, icon: (g, s) => Icons.home(g, s), onClick: () => this.scene.start('Menu') });
    new Button(this, 140, 52, { r: 34, color: C.purple, icon: (g, s) => Icons.bus(g, s), onClick: () => this.scene.start('Garage') });
    new Button(this, 224, 52, {
      r: 34,
      color: C.blue,
      icon: (g, s) => Icons.postcard(g, s),
      onClick: () => {
        if (this.busy || this.postcardModal) return;
        const { start, end } = CITY_RANGES[this.city];
        let initial = start;
        for (let l = start; l <= end; l++) if (isCompleted(p, l) && l !== cel) initial = l;
        this.openPostcards(initial);
      },
    });
    addAudioToggles(this, GAME_W - 56, 52);
    CITIES.forEach((c, idx) => {
      const active = c === this.city;
      const range = CITY_RANGES[c];
      let doneInCity = 0;
      for (let l = range.start; l <= range.end; l++) if (isCompleted(p, l) && l !== cel) doneInCity++;
      const totalInCity = range.end - range.start + 1;
      const unlocked = isUnlocked(p, range.start) && !(cel > 0 && range.start === cel + 1);
      const b = new Button(this, GAME_W / 2 - 170 + idx * 170, 50, {
        w: 156,
        h: 50,
        color: active ? C.yellow : unlocked ? C.cream : 0xd8d2c4,
        text: doneInCity === totalInCity ? `${t(c)} ✓` : t(c),
        textSize: 20,
        onClick: () => {
          if (!this.busy && !this.postcardModal && c !== this.city) this.scene.restart({ city: c });
        },
      });
      b.setSelected(active);
      b.setDepth(45);
    });

    // overall progress: points + completed levels
    const done = completedCount(p) - (cel && isCompleted(p, cel) ? 1 : 0);
    const panel = this.add.graphics().setDepth(40);
    panel.fillStyle(C.cream, 0.96);
    panel.fillRoundedRect(20, 100, 290, 60, 20);
    panel.lineStyle(5, C.ink, 1);
    panel.strokeRoundedRect(20, 100, 290, 60, 20);
    drawStar(panel, 52, 131, 20, C.yellow, C.ink, 3);
    const score = totalScore(p) - (cel ? p.scores[String(cel)] ?? 0 : 0);
    this.scoreText = this.add.text(80, 131, String(score), { fontFamily: 'Rubik, sans-serif', fontStyle: '800', fontSize: '30px', color: hex(C.ink) }).setOrigin(0, 0.5).setDepth(41);
    panel.fillStyle(C.green, 1);
    panel.fillCircle(192, 131, 18);
    panel.lineStyle(3, C.ink, 1);
    panel.strokeCircle(192, 131, 18);
    const check = this.add.graphics({ x: 192, y: 131 }).setDepth(41);
    Icons.check(check, 30);
    this.countText = this.add.text(220, 131, `${done}/${LEVEL_COUNT}`, { fontFamily: 'Rubik, sans-serif', fontStyle: '800', fontSize: '28px', color: hex(C.ink) }).setOrigin(0, 0.5).setDepth(41);

    // Current bus condition & petrol (carries over between levels)
    const st = loadBusStatus();
    const sp = this.add.graphics().setDepth(40);
    sp.fillStyle(C.cream, 0.96);
    sp.fillRoundedRect(20, 168, 290, 38, 14);
    sp.lineStyle(4, C.ink, 1);
    sp.strokeRoundedRect(20, 168, 290, 38, 14);
    const miniBar = (x: number, k: number, fill: number, icon: (g: G) => void) => {
      const ig = this.add.graphics({ x: x + 16, y: 187 }).setDepth(41);
      icon(ig);
      const bw = 90;
      sp.fillStyle(0x9a9fa8, 1);
      sp.fillRoundedRect(x + 34, 179, bw, 16, 7);
      sp.fillStyle(fill, 1);
      if (k > 0) sp.fillRoundedRect(x + 34, 179, Math.max(12, bw * k), 16, 7);
      sp.lineStyle(3, C.ink, 1);
      sp.strokeRoundedRect(x + 34, 179, bw, 16, 7);
    };
    const hk = st.health / MAX_HEALTH;
    const fk = st.fuel / MAX_FUEL;
    miniBar(26, hk, hk >= 0.6 ? C.green : hk >= 0.3 ? C.yellow : C.red, (g) => Icons.wrench(g, 24, C.ink));
    miniBar(166, fk, st.fuel <= LOW_FUEL ? C.red : fk >= 0.5 ? 0x3a86ff : C.yellow, (g) => Icons.pump(g, 24, C.ink));
  }

  private openPostcards(startLevel: number): void {
    const p = loadProgress();
    let lvl = Math.max(1, Math.min(LEVEL_COUNT, startLevel));
    this.postcardModal?.destroy();
    const modal = this.add.container(0, 0).setDepth(120);
    this.postcardModal = modal;

    const shade = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x1b2048, 0.65).setInteractive();
    const cx = GAME_W / 2;
    const cy = GAME_H / 2;
    const cardHit = this.add.rectangle(cx, cy, 860, 540, 0x000000, 0).setInteractive();
    const cardBg = this.add.graphics();
    cardBg.fillStyle(0xfff8e7, 1);
    cardBg.fillRoundedRect(cx - 430, cy - 270, 860, 540, 28);
    cardBg.lineStyle(6, C.ink, 1);
    cardBg.strokeRoundedRect(cx - 430, cy - 270, 860, 540, 28);
    // Illustration frame
    cardBg.fillStyle(0xe6f3f9, 1);
    cardBg.fillRoundedRect(cx - 400, cy - 176, 440, 300, 20);
    cardBg.lineStyle(4, C.ink, 0.9);
    cardBg.strokeRoundedRect(cx - 400, cy - 176, 440, 300, 20);

    const content = this.add.container(0, 0);
    const close = () => {
      this.input.keyboard?.off('keydown-LEFT', onLeft);
      this.input.keyboard?.off('keydown-RIGHT', onRight);
      this.input.keyboard?.off('keydown-ESC', close);
      modal.destroy();
      if (this.postcardModal === modal) this.postcardModal = null;
    };
    shade.on('pointerup', close);

    const closeBtn = new Button(this, cx + 388, cy - 230, { r: 28, color: C.red, icon: (g, s) => Icons.cross(g, s), onClick: close });
    const prevBtn = new Button(this, cx - 350, cy + 195, {
      r: 36,
      color: C.orange,
      icon: (g, s) => Icons.arrowLeft(g, s),
      onClick: () => render(lvl === 1 ? LEVEL_COUNT : lvl - 1),
    });
    const nextBtn = new Button(this, cx - 250, cy + 195, {
      r: 36,
      color: C.orange,
      icon: (g, s) => Icons.arrowRight(g, s),
      onClick: () => render(lvl === LEVEL_COUNT ? 1 : lvl + 1),
    });

    const render = (nextLvl: number) => {
      lvl = nextLvl;
      content.removeAll(true);
      const landmark = MAP_NODES[lvl - 1]!.landmark;
      const city = cityForLevel(lvl);
      const done = isCompleted(p, lvl);
      const unlocked = isUnlocked(p, lvl);
      const stars = p.stars[String(lvl)] ?? 0;

      // City pill in top-left of card
      const cityLabel = label(this, cx - 392, cy - 228, t(city), { size: 20, color: C.cream, strokeThickness: 0 }).setOrigin(0, 0.5);
      const stamp = this.add.graphics();
      stamp.fillStyle(C.blue, 1);
      stamp.fillRoundedRect(cx - 404, cy - 246, cityLabel.width + 24, 36, 12);
      stamp.lineStyle(3, C.ink, 1);
      stamp.strokeRoundedRect(cx - 404, cy - 246, cityLabel.width + 24, 36, 12);
      const header = label(this, cx, cy - 228, `${t('postcards')} · ${lvl}/${LEVEL_COUNT}`, { size: 28, color: C.ink, strokeThickness: 0 });

      const lmG = this.add.graphics({ x: cx - 180, y: cy + 106 }).setScale(0.76);
      drawLandmarkBig(lmG, landmark, false);
      content.add([stamp, cityLabel, header, lmG]);

      if (!done) {
        lmG.setAlpha(0.22);
        const lockG = this.add.graphics({ x: cx - 180, y: cy - 26 });
        drawLock(lockG, 72);
        content.add(lockG);
      }

      const rx = cx + 230;
      const title = label(this, rx, cy - 128, t(`lm_${landmark}` as TextKey), { size: 28, color: C.blue, strokeThickness: 0, wrap: 310 });
      const starsG = this.add.graphics();
      for (let i = 0; i < 3; i++) drawStar(starsG, rx + (i - 1) * 46, cy - 68, 17, i < stars ? C.yellow : 0xd9cfbf, C.ink, 3);
      const story = label(this, rx, cy + 28, done ? t(`fact_${landmark}` as TextKey) : t('lockedFact'), {
        size: 22,
        color: C.ink,
        strokeThickness: 0,
        wrap: 310,
      });
      const countLbl = label(this, cx - 120, cy + 195, `${completedCount(p)}/${LEVEL_COUNT}`, { size: 24, color: C.ink, strokeThickness: 0 });
      content.add([title, starsG, story, countLbl]);

      if (unlocked) {
        const goBtn = new Button(this, rx, cy + 186, {
          w: 220,
          h: 68,
          color: C.green,
          text: t('go'),
          textSize: 28,
          onClick: () => {
            close();
            this.play(lvl);
          },
        });
        content.add(goBtn);
      }
    };

    const onLeft = () => render(lvl === 1 ? LEVEL_COUNT : lvl - 1);
    const onRight = () => render(lvl === LEVEL_COUNT ? 1 : lvl + 1);
    this.input.keyboard?.on('keydown-LEFT', onLeft);
    this.input.keyboard?.on('keydown-RIGHT', onRight);
    this.input.keyboard?.on('keydown-ESC', close);

    modal.add([shade, cardHit, cardBg, content, closeBtn, prevBtn, nextBtn]);
    render(lvl);
  }

  private createBus(p: Progress, cel: number): void {
    const design = loadDesign() ?? { ...DEFAULT_DESIGN };
    this.busScale = BUS_LEN / BODY_SIZE[design.body].L;
    const targetLvl = cel || p.level;
    const at = restPoint(targetLvl - 1);
    this.bus = new BusView(this, at.x, at.y + BUS_ON_ROAD, design);
    this.bus.setScale(this.busScale).setDepth(30);
    this.bus.setDamage(1 - loadBusStatus().health / MAX_HEALTH);
    this.bus.setPassengers(2);
    if (cityForLevel(targetLvl) !== this.city) {
      this.bus.setVisible(false);
    } else {
      this.tweens.add({ targets: this.bus, y: this.bus.y - 5, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.easeInOut' });
    }
  }

  /** A big "continue" button: the child doesn't have to aim at the right landmark. */
  private createPlayButton(p: Progress, cel: number): void {
    const btn = new Button(this, GAME_W - 148, 636, { w: 270, h: 88, color: C.green, onClick: () => this.playNext(p) });
    const icon = this.add.graphics({ x: -96, y: 0 });
    Icons.play(icon, 48);
    const text = label(this, 26, 0, completedCount(p) === 0 ? t('play') : t('continue'), { size: 28 });
    if (text.width > 170) text.setScale(170 / text.width); // long words (Kazakh) still fit
    btn.add([icon, text]);
    btn.setDepth(45);
    this.playBtn = btn;
    if (cel) {
      btn.setVisible(false);
    } else {
      this.tweens.add({ targets: btn, scale: 1.06, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });
    }
  }

  /** Shows the button once the celebration is over. */
  private revealPlay(): void {
    this.playBtn.setVisible(true).setScale(0);
    this.tweens.add({ targets: this.playBtn, scale: 1, duration: 400, ease: 'Back.easeOut' });
    this.time.delayedCall(450, () =>
      this.tweens.add({ targets: this.playBtn, scale: 1.06, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' }),
    );
  }

  /** The level that comes next: the highlighted one, or the last level once everything is done. */
  private playNext(p: Progress): void {
    if (this.postcardModal) return;
    this.play(this.nodes.find((n) => n.state === 'current')?.level ?? p.level);
  }

  private onTap(nv: NodeView): void {
    if (this.busy || this.postcardModal) return;
    if (nv.state === 'locked') {
      audio.oops();
      nv.shake();
      return;
    }
    this.play(nv.level);
  }

  private play(level: number): void {
    if (this.busy) return;
    this.busy = true;
    audio.horn((loadDesign() ?? DEFAULT_DESIGN).body);
    this.cameras.main.fadeOut(250, 45, 42, 50);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Drive', { level }));
  }

  private celebrate(p: Progress, cel: number): void {
    this.busy = true;
    const node = this.nodes.find((n) => n.level === cel)!;
    const stars = p.stars[String(cel)] ?? 1;
    const { end } = CITY_RANGES[this.city];
    this.time.delayedCall(700, () => {
      node.setNodeState('done', stars);
      node.pop();
      audio.reward();
      // the totals count up with the new result
      const now = loadProgress();
      this.scoreText.setText(String(totalScore(now)));
      this.countText.setText(`${completedCount(now)}/${LEVEL_COUNT}`);
      this.tweens.add({ targets: [this.scoreText, this.countText], scale: { from: 1.4, to: 1 }, duration: 350, ease: 'Back.easeOut' });
      if (stars === 3) confetti(this, node.x, node.y + 200, 40);
    });

    if (cel >= LEVEL_COUNT) {
      this.time.delayedCall(1500, () => this.finale());
      return;
    }
    if (cel >= end) {
      const nextCity = cityForLevel(cel + 1);
      this.time.delayedCall(1400, () => {
        audio.fanfare();
        confetti(this, GAME_W / 2, GAME_H, 80);
        const banner = this.add.container(GAME_W / 2, 330).setDepth(100).setScale(0);
        const msg = label(this, 0, 0, `${t('cityUnlocked')} ${t(nextCity)}`, { size: 42, color: C.yellow, strokeThickness: 8 });
        const w = msg.width + 80;
        const g = this.add.graphics();
        g.fillStyle(C.green, 1);
        g.fillRoundedRect(-w / 2, -52, w, 104, 28);
        g.lineStyle(6, C.ink, 1);
        g.strokeRoundedRect(-w / 2, -52, w, 104, 28);
        banner.add([g, msg]);
        this.tweens.add({ targets: banner, scale: 1, duration: 450, ease: 'Back.easeOut' });
      });
      this.time.delayedCall(3200, () => this.scene.restart({ city: nextCity }));
      return;
    }
    this.time.delayedCall(1700, () => {
      const curve = segment(cel - 1);
      // the way: from the waiting spot before this landmark, over it, to the waiting spot before the next one
      const from = restPoint(cel - 1);
      const to = restPoint(cel);
      const path: Phaser.Math.Vector2[] = [];
      if (from.seg >= 0) path.push(...segPoints(from.seg).slice(from.at));
      else path.push(new Phaser.Math.Vector2(from.x, from.y));
      path.push(...segPoints(cel - 1).slice(0, to.at + 1));
      const road = this.add.graphics().setDepth(-3).setAlpha(0);
      drawRoad(road, curve, true);
      this.tweens.add({ targets: road, alpha: 1, duration: 1500 });
      audio.horn((loadDesign() ?? DEFAULT_DESIGN).body);
      this.moving = true;
      const prog = { t: 0 };
      this.tweens.killTweensOf(this.bus);
      this.tweens.add({
        targets: prog,
        t: 1,
        duration: 1700,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          const f = prog.t * (path.length - 1);
          const i = Math.min(Math.floor(f), path.length - 2);
          const a = path[i]!;
          const b = path[i + 1]!;
          const k = f - i;
          this.bus.setPosition(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k + BUS_ON_ROAD);
        },
        onComplete: () => {
          this.moving = false;
          const next = this.nodes.find((n) => n.level === cel + 1);
          if (next) {
            next.setNodeState('current');
            next.pop();
          }
          audio.select();
          this.tweens.add({ targets: this.bus, y: this.bus.y - 5, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.easeInOut' });
          this.busy = false;
          this.revealPlay();
        },
      });
    });
  }

  private finale(): void {
    audio.fanfare();
    confetti(this, GAME_W / 2, GAME_H, 120);
    const c = this.add.container(GAME_W / 2, 330).setDepth(100);
    const txt = label(this, 0, 0, t('allDone'), { size: 52, color: C.yellow, strokeThickness: 10 });
    const w = txt.width + 80;
    const g = this.add.graphics();
    g.fillStyle(C.green, 1);
    g.fillRoundedRect(-w / 2, -60, w, 120, 30);
    g.lineStyle(6, C.ink, 1);
    g.strokeRoundedRect(-w / 2, -60, w, 120, 30);
    c.add([g, txt]);
    c.setScale(0);
    this.tweens.add({ targets: c, scale: 1, duration: 500, ease: 'Back.easeOut' });
    this.tweens.add({ targets: c, alpha: 0, delay: 4500, duration: 600, onComplete: () => c.destroy() });
    this.busy = false;
    this.revealPlay();
  }

  update(_: number, delta: number): void {
    if (this.moving) this.bus.roll((delta / 1000) * 90, delta / 1000, 0.4);
  }
}
