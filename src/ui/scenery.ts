import Phaser from 'phaser';
import { loadProgress } from '../core/progress';
import { getSettings } from '../core/settings';
import { resolveEnv, type Env } from '../core/world';
import { addWeatherFx } from './weather';
import { Backdrop } from './textures';

/** The setting the child will see next: picked on the weather screen, or by level. */
export const currentEnv = (): Env => resolveEnv(loadProgress().level, getSettings().world);

/** Background + weather particles. `behindUi`: keep rain/snow under buttons (menus). */
export function createScenery(scene: Phaser.Scene, env: Env, opts: { street?: boolean; behindUi?: boolean } = {}): Backdrop {
  const backdrop = new Backdrop(scene, { street: opts.street, env });
  addWeatherFx(scene, env, { depth: opts.behindUi ? -4 : 80 });
  return backdrop;
}
