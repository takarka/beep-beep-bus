import '@fontsource/rubik/700.css';
import '@fontsource/rubik/800.css';
import Phaser from 'phaser';
import { audio } from './audio/AudioEngine';
import { C, GAME_H, GAME_W } from './config';
import { getSettings, onSettingsChange } from './core/settings';
import { BootScene } from './scenes/BootScene';
import { DriveScene } from './scenes/DriveScene';
import { FactoryScene } from './scenes/FactoryScene';
import { GarageScene } from './scenes/GarageScene';
import { MenuScene } from './scenes/MenuScene';
import { WorldScene } from './scenes/WorldScene';
import { ResultScene } from './scenes/ResultScene';

async function start(): Promise<void> {
  // Phaser renders text to canvas, so the web font must be ready first.
  try {
    await Promise.race([
      Promise.all([document.fonts.load('800 32px Rubik', 'АӘҚӨ'), document.fonts.load('700 32px Rubik')]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch {
    /* fall back to system font */
  }

  const s = getSettings();
  audio.configure(s.sound, s.music);
  onSettingsChange((n) => audio.configure(n.sound, n.music));

  // Browsers only allow audio after a user gesture.
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: GAME_W,
    height: GAME_H,
    backgroundColor: C.ink,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    audio: { noAudio: true },
    render: { antialias: true, roundPixels: false },
    input: { activePointers: 3 },
    scene: [BootScene, MenuScene, GarageScene, WorldScene, FactoryScene, DriveScene, ResultScene],
  });

  // Offline support + "install to home screen" (production builds only)
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => undefined);
    });
  }

  // Expose for debugging and automated smoke tests.
  (window as unknown as { __game: Phaser.Game }).__game = game;
}

void start();
