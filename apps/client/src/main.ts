import Phaser from 'phaser';
import { keyboard } from './input/keyboard';
import { sound } from './audio/sound';
import { GAME_HEIGHT, GAME_WIDTH } from './theme';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { SelectScene } from './scenes/SelectScene';
import { BattleScene } from './scenes/BattleScene';
import { ResultsScene } from './scenes/ResultsScene';
import { OnlineScene } from './scenes/OnlineScene';
import { GalleryScene } from './scenes/GalleryScene';

keyboard.install();
const unlock = () => sound.unlock();
window.addEventListener('keydown', unlock);
window.addEventListener('pointerdown', unlock);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0d0b1f',
  antialias: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  fps: { target: 60 },
  scene: new URLSearchParams(location.search).has('gallery')
    ? [GalleryScene]
    : [BootScene, MenuScene, SelectScene, BattleScene, ResultsScene, OnlineScene],
});

// Exposed for debugging in the browser console.
(window as unknown as { arenaRush: Phaser.Game }).arenaRush = game;
