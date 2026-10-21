import Phaser from 'phaser';
import { displayText } from '../ui/widgets';
import { GAME_HEIGHT, GAME_WIDTH } from '../theme';

/** Waits briefly for web fonts so text renders with the right typeface, then shows the menu. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const t = displayText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 'LOADING…', 28);
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    const timeout = new Promise((r) => setTimeout(r, 1500));
    const load = fonts
      ? Promise.all([fonts.load('32px Bungee'), fonts.load('700 16px Rubik'), fonts.load('500 16px Rubik')])
      : Promise.resolve();
    Promise.race([load, timeout]).catch(() => undefined).then(() => {
      t.destroy();
      this.scene.start('Menu');
    });
  }
}
