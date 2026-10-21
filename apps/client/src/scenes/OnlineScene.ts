import Phaser from 'phaser';
import { Backdrop } from '../render/backdrop';
import { GAME_HEIGHT, GAME_WIDTH, UI } from '../theme';
import { bodyText, displayText, fadeTo, installGlobalKeys, Menu, panel } from '../ui/widgets';

/**
 * Placeholder for Phase 3. Lays out the planned online flow so the menu structure exists;
 * see `src/net/types.ts` for the session contract the real implementation will fulfill.
 */
export class OnlineScene extends Phaser.Scene {
  private backdrop!: Backdrop;

  constructor() {
    super('Online');
  }

  create(): void {
    this.cameras.main.fadeIn(250, 13, 11, 31);
    this.backdrop = new Backdrop(this);
    installGlobalKeys(this);
    const cx = GAME_WIDTH / 2;
    panel(this, cx, GAME_HEIGHT / 2, 760, 560, UI.panel, 0xffffff, 0.95);
    displayText(this, cx, 120, 'ONLINE PLAY', 44, '#ffd23f');
    bodyText(this, cx, 170, 'Online matches for 2–4 friends arrive in Phase 3 (Colyseus, server-authoritative).', 17, '#e8e5ff', '500');
    const steps = ['Create Online Room', 'Join Room with Code', 'Multiplayer Lobby', 'Ready-Up', 'Connection Status'];
    steps.forEach((s, i) => {
      bodyText(this, cx, 225 + i * 40, `○  ${s}  ·  planned`, 20, '#8a84bf', '700');
    });
    new Menu(this, cx, 520, [
      { label: () => 'BACK', action: () => fadeTo(this, 'Menu') },
    ], 300);
    this.input.keyboard?.on('keydown-ESC', () => fadeTo(this, 'Menu'));
  }

  update(): void {
    this.backdrop.update();
  }
}
