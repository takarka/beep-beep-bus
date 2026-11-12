import Phaser from 'phaser';
import { audio } from '../audio/AudioEngine';
import { C, FONT, hex, shade } from '../config';

type G = Phaser.GameObjects.Graphics;

export interface TextOpts {
  size?: number;
  color?: number;
  stroke?: number;
  strokeThickness?: number;
  align?: 'left' | 'center' | 'right';
  wrap?: number;
}

export function label(scene: Phaser.Scene, x: number, y: number, text: string, o: TextOpts = {}): Phaser.GameObjects.Text {
  const size = o.size ?? 32;
  return scene.add
    .text(x, y, text, {
      fontFamily: FONT,
      fontStyle: '800',
      fontSize: `${size}px`,
      color: hex(o.color ?? C.cream),
      stroke: hex(o.stroke ?? C.ink),
      strokeThickness: o.strokeThickness ?? Math.max(4, Math.round(size / 6)),
      align: o.align ?? 'center',
      wordWrap: o.wrap ? { width: o.wrap } : undefined,
    })
    .setOrigin(0.5);
}

export interface ButtonOpts {
  /** Radius for a round button. */
  r?: number;
  /** Width/height for a rounded-rect button (used when r is not set). */
  w?: number;
  h?: number;
  color: number;
  icon?: (g: G, size: number) => void;
  iconSize?: number;
  text?: string;
  textSize?: number;
  onClick: () => void;
  silent?: boolean;
}

/** Big, chunky, retro button with a 3D "lip". Works for mouse and touch. */
export class Button extends Phaser.GameObjects.Container {
  private face: G;
  private iconG: G;
  private ring: G;
  private txt?: Phaser.GameObjects.Text;
  private pressed = false;
  private opts: ButtonOpts;
  private baseScale = 1;

  constructor(scene: Phaser.Scene, x: number, y: number, opts: ButtonOpts) {
    super(scene, x, y);
    this.opts = opts;
    scene.add.existing(this);
    this.ring = scene.add.graphics();
    this.face = scene.add.graphics();
    this.iconG = scene.add.graphics();
    this.add([this.ring, this.face, this.iconG]);
    if (opts.text) {
      this.txt = label(scene, 0, 0, opts.text, { size: opts.textSize ?? 28 });
      this.add(this.txt);
    }
    this.redraw();

    const hit =
      opts.r !== undefined
        ? new Phaser.Geom.Circle(0, 0, opts.r + 6)
        : new Phaser.Geom.Rectangle(-(opts.w ?? 100) / 2 - 4, -(opts.h ?? 80) / 2 - 4, (opts.w ?? 100) + 8, (opts.h ?? 80) + 12);
    const contains = opts.r !== undefined ? Phaser.Geom.Circle.Contains : Phaser.Geom.Rectangle.Contains;
    this.setInteractive(hit, contains);
    if (this.input) this.input.cursor = 'pointer';

    this.on('pointerdown', () => {
      this.pressed = true;
      this.setScale(this.baseScale * 0.92);
      if (!opts.silent) audio.click();
    });
    this.on('pointerup', () => {
      if (!this.pressed) return;
      this.pressed = false;
      this.setScale(this.baseScale);
      opts.onClick();
    });
    this.on('pointerout', () => {
      this.pressed = false;
      this.setScale(this.baseScale);
    });
  }

  setBaseScale(s: number): this {
    this.baseScale = s;
    return this.setScale(s);
  }

  setIcon(icon: (g: G, size: number) => void): void {
    this.opts.icon = icon;
    this.redraw();
  }

  setColor(color: number): void {
    this.opts.color = color;
    this.redraw();
  }

  setSelected(on: boolean): void {
    this.ring.clear();
    if (!on) return;
    const o = this.opts;
    this.ring.lineStyle(7, C.yellow, 1);
    if (o.r !== undefined) this.ring.strokeCircle(0, 0, o.r + 9);
    else this.ring.strokeRoundedRect(-(o.w ?? 100) / 2 - 8, -(o.h ?? 80) / 2 - 8, (o.w ?? 100) + 16, (o.h ?? 80) + 22, 22);
  }

  private redraw(): void {
    const o = this.opts;
    const f = this.face;
    f.clear();
    const lip = shade(o.color, -0.3);
    if (o.r !== undefined) {
      f.fillStyle(lip, 1);
      f.fillCircle(0, 6, o.r);
      f.fillStyle(o.color, 1);
      f.fillCircle(0, 0, o.r);
      f.lineStyle(5, C.ink, 1);
      f.strokeCircle(0, 0, o.r);
      f.fillStyle(0xffffff, 0.25);
      f.fillEllipse(-o.r * 0.3, -o.r * 0.45, o.r * 0.7, o.r * 0.32);
    } else {
      const w = o.w ?? 100;
      const h = o.h ?? 80;
      f.fillStyle(lip, 1);
      f.fillRoundedRect(-w / 2, -h / 2 + 6, w, h, 18);
      f.fillStyle(o.color, 1);
      f.fillRoundedRect(-w / 2, -h / 2, w, h, 18);
      f.lineStyle(5, C.ink, 1);
      f.strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
    }
    this.iconG.clear();
    if (o.icon) {
      const size = o.iconSize ?? (o.r !== undefined ? o.r * 1.2 : Math.min(o.w ?? 100, o.h ?? 80) * 0.7);
      o.icon(this.iconG, size);
    }
  }
}

/** A press-and-hold pedal (gas / brake). Supports multi-touch. */
export class HoldButton extends Phaser.GameObjects.Container {
  private pointers = new Set<number>();
  private face: G;
  private iconG: G;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly r: number,
    private readonly color: number,
    icon: (g: G, s: number) => void,
  ) {
    super(scene, x, y);
    scene.add.existing(this);
    this.face = scene.add.graphics();
    this.iconG = scene.add.graphics();
    icon(this.iconG, r * 1.25);
    this.add([this.face, this.iconG]);
    this.draw(false);
    this.setInteractive(new Phaser.Geom.Circle(0, 0, r + 14), Phaser.Geom.Circle.Contains);

    this.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.pointers.add(p.id);
      this.draw(true);
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (this.pointers.delete(p.id)) this.draw(this.isDown);
    };
    this.on('pointerout', release);
    scene.input.on('pointerup', release);
    scene.input.on('pointerupoutside', release);
    this.once('destroy', () => {
      scene.input.off('pointerup', release);
      scene.input.off('pointerupoutside', release);
    });
  }

  get isDown(): boolean {
    return this.pointers.size > 0;
  }

  reset(): void {
    this.pointers.clear();
    this.draw(false);
  }

  private draw(down: boolean): void {
    const f = this.face;
    f.clear();
    const off = down ? 4 : 0;
    f.fillStyle(shade(this.color, -0.3), 1);
    f.fillRoundedRect(-this.r, -this.r + 10, this.r * 2, this.r * 2, 28);
    f.fillStyle(down ? shade(this.color, -0.08) : this.color, 1);
    f.fillRoundedRect(-this.r, -this.r + off, this.r * 2, this.r * 2, 28);
    f.lineStyle(6, C.ink, 1);
    f.strokeRoundedRect(-this.r, -this.r + off, this.r * 2, this.r * 2, 28);
    f.lineStyle(4, shade(this.color, -0.2), 1);
    for (let i = -2; i <= 2; i++) f.lineBetween(-this.r * 0.6, i * this.r * 0.32 + off + this.r * 0.05, this.r * 0.6, i * this.r * 0.32 + off + this.r * 0.05);
    this.iconG.y = off;
  }
}

/** Floating "+10" style text that rises and fades. */
export function floatText(scene: Phaser.Scene, x: number, y: number, text: string, color: number, size = 44): void {
  const t = label(scene, x, y, text, { size, color });
  t.setDepth(60);
  scene.tweens.add({ targets: t, y: y - 90, alpha: 0, duration: 1300, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  scene.tweens.add({ targets: t, scale: { from: 0.4, to: 1 }, duration: 260, ease: 'Back.easeOut' });
}

/** Confetti burst from a point. Uses the "confetti" texture made in BootScene. */
export function confetti(scene: Phaser.Scene, x: number, y: number, count = 60): void {
  const em = scene.add.particles(x, y, 'confetti', {
    speed: { min: 250, max: 650 },
    angle: { min: 220, max: 320 },
    gravityY: 900,
    rotate: { min: 0, max: 360 },
    lifespan: 2200,
    scale: { min: 0.6, max: 1.2 },
    tint: [C.red, C.yellow, C.green, C.blue, C.purple, 0xf15bb5, C.orange],
    emitting: false,
  });
  em.setDepth(80);
  em.setScrollFactor(0);
  em.explode(count);
  scene.time.delayedCall(2600, () => em.destroy());
}
