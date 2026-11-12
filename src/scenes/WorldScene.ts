import Phaser from 'phaser';
import { BusView } from '../bus/BusView';
import { DEFAULT_DESIGN } from '../bus/design';
import { loadDesign } from '../bus/garage';
import { DRIVE_SCALE } from '../bus/geometry';
import { C, GAME_W } from '../config';
import { getSettings, updateSettings } from '../core/settings';
import { precipKind, resolveEnv, type Season, type TimeOfDay } from '../core/world';
import { loadProgress } from '../core/progress';
import { t } from '../i18n';
import { Icons } from '../ui/draw';
import { createScenery } from '../ui/scenery';
import { Button, label } from '../ui/widgets';
import { addAudioToggles } from './MenuScene';

const ROW_Y = 651;
const NIGHT_BTN = 0x2f3a78;

/** Pick the season, day or night and the weather; "auto" lets the level decide. */
export class WorldScene extends Phaser.Scene {
  private backdrop!: ReturnType<typeof createScenery>;
  private scrollX = 0;
  private bus!: BusView;

  constructor() {
    super('World');
  }

  create(): void {
    const world = getSettings().world;
    const env = resolveEnv(loadProgress().level, world);
    this.scrollX = 0;
    this.backdrop = createScenery(this, env, { behindUi: true });

    const design = loadDesign() ?? { ...DEFAULT_DESIGN };
    this.bus = new BusView(this, GAME_W / 2, 545, design);
    this.bus.setScale(DRIVE_SCALE[design.body] * 0.9);
    this.bus.setNight(env.time === 'night');
    this.bus.setPassengers(2);

    label(this, GAME_W / 2, 90, t('world'), { size: 60, color: C.yellow, strokeThickness: 10 });
    new Button(this, 56, 52, { r: 34, color: C.red, icon: (g, s) => Icons.home(g, s), onClick: () => this.scene.start('Menu') });
    addAudioToggles(this, GAME_W - 56, 52);

    const panel = this.add.graphics();
    panel.fillStyle(C.cream, 0.96);
    panel.fillRoundedRect(60, 598, GAME_W - 120, 114, 30);
    panel.lineStyle(5, C.ink, 1);
    panel.strokeRoundedRect(60, 598, GAME_W - 120, 114, 30);

    const x = (i: number) => 146 + i * 104;
    const pick = (patch: Partial<{ season: Season; time: TimeOfDay; precip: boolean; auto: boolean }>) => {
      updateSettings({ world: { auto: false, season: env.season, time: env.time, precip: env.precip, ...patch } });
      this.scene.restart();
    };
    const manual = !world.auto;

    const seasons: Array<[Season, number, (g: Phaser.GameObjects.Graphics, s: number) => void]> = [
      ['spring', 0xf15bb5, (g, s) => Icons.flower(g, s)],
      ['summer', 0xf4a261, (g, s) => Icons.sun(g, s, 0xffffff)],
      ['autumn', 0xd1603d, (g, s) => Icons.leaf(g, s, 0xffd23f)],
      ['winter', 0x4a90d9, (g, s) => Icons.snowflake(g, s)],
    ];
    seasons.forEach(([season, color, icon], i) => {
      const b = new Button(this, x(i), ROW_Y, { r: 36, color, icon, onClick: () => pick({ season }) });
      b.setSelected(manual && env.season === season);
    });

    const day = new Button(this, x(4.5), ROW_Y, { r: 36, color: 0x7cc6de, icon: (g, s) => Icons.sun(g, s), onClick: () => pick({ time: 'day' }) });
    day.setSelected(manual && env.time === 'day');
    const night = new Button(this, x(5.5), ROW_Y, { r: 36, color: NIGHT_BTN, icon: (g, s) => Icons.moon(g, s, NIGHT_BTN), onClick: () => pick({ time: 'night' }) });
    night.setSelected(manual && env.time === 'night');

    const clear = new Button(this, x(7), ROW_Y, { r: 36, color: 0x7cc6de, icon: (g, s) => Icons.sun(g, s), onClick: () => pick({ precip: false }) });
    clear.setSelected(manual && !env.precip);
    const snow = precipKind(env) === 'snow';
    const wet = new Button(this, x(8), ROW_Y, { r: 36, color: 0x6b7a8f, icon: (g, s) => Icons.cloudPrecip(g, s, snow), onClick: () => pick({ precip: true }) });
    wet.setSelected(manual && env.precip);

    const auto = new Button(this, x(9.5), ROW_Y, { r: 36, color: C.green, icon: (g, s) => Icons.dice(g, s), onClick: () => pick({ auto: true }) });
    auto.setSelected(world.auto);
  }

  update(_: number, delta: number): void {
    const dt = delta / 1000;
    this.scrollX += dt * 70;
    this.backdrop.update(this.scrollX, dt);
    this.bus.roll(dt * 70, dt, 0.2);
  }
}
