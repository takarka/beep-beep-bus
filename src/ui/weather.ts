import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import { precipKind, type Env } from '../core/world';

/**
 * Falling rain / snow / autumn leaves / spring petals as particle emitters.
 * `depth`: 80 draws over the bus (route), a negative depth keeps it behind buttons (menus).
 */
export function addWeatherFx(scene: Phaser.Scene, env: Env, opts: { depth?: number } = {}): void {
  const depth = opts.depth ?? 80;
  const night = env.time === 'night';

  if (env.precip && precipKind(env) === 'rain') {
    scene.add
      .rectangle(0, 0, GAME_W, GAME_H, night ? 0x0b1030 : 0x35405a, night ? 0.14 : 0.16)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(depth - 0.5);
    scene.add
      .particles(0, -40, 'raindrop', {
        x: { min: -100, max: GAME_W + 400 },
        speedX: { min: -230, max: -190 },
        speedY: { min: 1000, max: 1200 },
        lifespan: 800,
        frequency: 14,
        quantity: 2,
        rotate: 11,
        alpha: night ? 0.4 : 0.55,
        scale: { min: 0.8, max: 1.2 },
        tint: night ? 0x9fb4d6 : 0xd5e6f5,
        advance: 1000,
      })
      .setScrollFactor(0)
      .setDepth(depth);
    return;
  }

  if (env.precip) {
    scene.add
      .particles(0, -20, 'flake', {
        x: { min: -50, max: GAME_W + 50 },
        speedX: { min: -45, max: 45 },
        speedY: { min: 70, max: 140 },
        lifespan: 7500,
        frequency: 45,
        quantity: 1,
        scale: { min: 0.3, max: 0.8 },
        alpha: { min: 0.7, max: 1 },
        tint: night ? 0xdfe6ff : 0xffffff,
        advance: 6500,
      })
      .setScrollFactor(0)
      .setDepth(depth);
    return;
  }

  if (env.season === 'autumn' || env.season === 'spring') {
    const autumn = env.season === 'autumn';
    scene.add
      .particles(0, -20, autumn ? 'leaf' : 'petal', {
        x: { min: 0, max: GAME_W + 300 },
        speedX: { min: -120, max: -30 },
        speedY: { min: 45, max: 110 },
        lifespan: 8000,
        frequency: autumn ? 260 : 320,
        quantity: 1,
        rotate: { min: 0, max: 360 },
        scale: { min: 0.7, max: 1.2 },
        tint: autumn ? [0xe07a3f, 0xd9a441, 0xc4452d, 0xe6b84a] : [0xf7b6d2, 0xffffff, 0xffd9e6],
        alpha: night ? 0.7 : 0.95,
        advance: 6000,
      })
      .setScrollFactor(0)
      .setDepth(depth);
  }
}
