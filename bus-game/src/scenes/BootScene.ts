import Phaser from 'phaser';
import { generateAllTextures } from '../ui/textures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    generateAllTextures(this);
    this.input.addPointer(2); // gas + brake at the same time on touch screens
    this.scene.start('Menu');
  }
}
