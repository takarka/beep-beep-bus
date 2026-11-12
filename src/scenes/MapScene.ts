import Phaser from 'phaser';
import { audio } from '../audio/AudioEngine';
import { BusView } from '../bus/BusView';
import { DEFAULT_DESIGN } from '../bus/design';
import { loadDesign } from '../bus/garage';
import { BODY_SIZE } from '../bus/geometry';
import { C, GAME_H, GAME_W, hex } from '../config';
import { LEVEL_COUNT, MAP_NODES, type MapNode } from '../core/campaign';
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

function drawMapBackground(scene: Phaser.Scene): void {
  const g = scene.add.graphics().setDepth(-10);
  const rng = mulberry32(3);
  g.fillStyle(0xe4ecc6, 1);
  g.fillRect(0, 0, GAME_W, GAME_H);

  // city blocks: a soft street grid with a few avenues
  g.lineStyle(10, 0xf3eed8, 0.9);
  for (let x = 60; x < GAME_W; x += 170) g.lineBetween(x, 0, x, GAME_H);
  for (let y = 70; y < GAME_H; y += 140) g.lineBetween(0, y, GAME_W, y);
  g.lineStyle(14, 0xf3eed8, 0.9);
  g.lineBetween(0, 700, 1280, 0);
  g.lineBetween(0, 250, 700, 720);

  // little houses
  const colors = [0xe98a6b, 0xf2c57c, 0x9cc5a1, 0xd4a5a5, 0xa5b4d4];
  for (let i = 0; i < 70; i++) {
    const w = 18 + rng() * 22;
    const h = 16 + rng() * 18;
    g.fillStyle(colors[Math.floor(rng() * colors.length)]!, 0.5);
    g.fillRoundedRect(rng() * GAME_W, rng() * GAME_H, w, h, 4);
  }

  // parks
  g.fillStyle(0xbfdc98, 1);
  for (const [x, y, w, h] of [[220, 120, 200, 90], [760, 600, 220, 90], [1060, 250, 220, 120], [60, 440, 160, 100], [520, 330, 140, 70]] as const) {
    g.fillEllipse(x, y, w, h);
    g.fillStyle(0x9ccb7a, 1);
    for (let i = 0; i < 6; i++) g.fillCircle(x + (rng() - 0.5) * w * 0.7, y + (rng() - 0.5) * h * 0.6, 7 + rng() * 5);
    g.fillStyle(0xbfdc98, 1);
  }

  // the Ishim (Esil) river
  const riverY = (x: number) => 322 + Math.sin(x / 210 + 0.5) * 62 + (x / GAME_W) * 24;
  const top: Phaser.Math.Vector2[] = [];
  const bottom: Phaser.Math.Vector2[] = [];
  for (let x = -20; x <= GAME_W + 20; x += 20) {
    top.push(new Phaser.Math.Vector2(x, riverY(x) - 34));
    bottom.push(new Phaser.Math.Vector2(x, riverY(x) + 34));
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

  // paper frame + compass
  g.lineStyle(12, C.ink, 1);
  g.strokeRoundedRect(6, 6, GAME_W - 12, GAME_H - 12, 18);
  const cx = GAME_W - 70;
  const cy = GAME_H - 70;
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

/** The campaign map of Astana: every level is a landmark; finished ones get stars and a check mark. */
export class MapScene extends Phaser.Scene {
  private nodes: NodeView[] = [];
  private bus!: BusView;
  private busScale = 0.19;
  private moving = false;
  private busy = false;
  private scoreText!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;

  constructor() {
    super('Map');
  }

  create(data?: { celebrate?: number }): void {
    this.cameras.main.fadeIn(250, 45, 42, 50);
    this.nodes = [];
    this.moving = false;
    this.busy = false;
    const progress = loadProgress();
    // A level that was just completed for the first time gets a stamp + the bus drives on to the next one.
    const cel = data?.celebrate && isCompleted(progress, data.celebrate) ? data.celebrate : 0;

    drawMapBackground(this);
    this.createRoads(progress, cel);
    this.createNodes(progress, cel);
    this.createHud(progress, cel);
    this.createBus(progress, cel);

    const kb = this.input.keyboard;
    kb?.on('keydown-ENTER', () => this.play(this.nodes.find((n) => n.state === 'current')?.level ?? 1));

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
    for (let i = 0; i < LEVEL_COUNT - 1; i++) {
      const done = isCompleted(p, i + 1) && i + 1 !== cel;
      drawRoad(g, segment(i), done);
    }
  }

  private createNodes(p: Progress, cel: number): void {
    MAP_NODES.forEach((node, i) => {
      const level = i + 1;
      const nv = new NodeView(this, level, node);
      nv.setNodeState(this.visualState(p, level, cel), p.stars[String(level)] ?? 0);
      nv.on('pointerup', () => this.onTap(nv));
      this.nodes.push(nv);
    });
  }

  private createHud(p: Progress, cel: number): void {
    new Button(this, 56, 52, { r: 34, color: C.red, icon: (g, s) => Icons.home(g, s), onClick: () => this.scene.start('Menu') });
    new Button(this, 140, 52, { r: 34, color: C.purple, icon: (g, s) => Icons.bus(g, s), onClick: () => this.scene.start('Garage') });
    addAudioToggles(this, GAME_W - 56, 52);
    label(this, GAME_W / 2, 56, t('astana'), { size: 58, color: C.yellow, strokeThickness: 10 });

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
  }

  private createBus(p: Progress, cel: number): void {
    const design = loadDesign() ?? { ...DEFAULT_DESIGN };
    this.busScale = BUS_LEN / BODY_SIZE[design.body].L;
    const at = MAP_NODES[(cel || p.level) - 1]!;
    this.bus = new BusView(this, at.x, at.y - R - 4, design);
    this.bus.setScale(this.busScale).setDepth(30);
    this.bus.setPassengers(2);
    this.tweens.add({ targets: this.bus, y: this.bus.y - 5, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.easeInOut' });
  }

  private onTap(nv: NodeView): void {
    if (this.busy) return;
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
    audio.horn();
    this.cameras.main.fadeOut(250, 45, 42, 50);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Drive', { level }));
  }

  private celebrate(p: Progress, cel: number): void {
    this.busy = true;
    const node = this.nodes[cel - 1]!;
    const stars = p.stars[String(cel)] ?? 1;
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
    this.time.delayedCall(1700, () => {
      const curve = segment(cel - 1);
      const road = this.add.graphics().setDepth(-3).setAlpha(0);
      drawRoad(road, curve, true);
      this.tweens.add({ targets: road, alpha: 1, duration: 1500 });
      audio.horn();
      this.moving = true;
      const prog = { t: 0 };
      this.tweens.killTweensOf(this.bus);
      this.tweens.add({
        targets: prog,
        t: 1,
        duration: 1700,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          const pt = curve.getPoint(prog.t);
          this.bus.setPosition(pt.x, pt.y - R - 4);
        },
        onComplete: () => {
          this.moving = false;
          const next = this.nodes[cel]!;
          next.setNodeState('current');
          next.pop();
          audio.select();
          this.tweens.add({ targets: this.bus, y: this.bus.y - 5, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.easeInOut' });
          this.busy = false;
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
  }

  update(_: number, delta: number): void {
    if (this.moving) this.bus.roll((delta / 1000) * 90, delta / 1000, 0.4);
  }
}
