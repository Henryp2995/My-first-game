import Phaser from 'phaser';
import { FIGHTER_ORDER } from '@arena-rush/shared';
import { music } from '../audio/music';
import { sound } from '../audio/sound';
import { FigureCache } from '../render/characters';
import { Backdrop } from '../render/backdrop';
import { previewFrame } from '../anim/controller';
import { FONT_BODY, GAME_HEIGHT, GAME_WIDTH, UI } from '../theme';
import { bodyText, displayText, fadeTo, installGlobalKeys, Menu, openAudioSettings, panel } from '../ui/widgets';

export class MenuScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private lineup!: Phaser.GameObjects.Graphics;
  private figures!: FigureCache;
  private menu!: Menu;
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private t = 0;

  constructor() {
    super('Menu');
  }

  create(): void {
    this.t = 0;
    this.overlay = [];
    this.cameras.main.fadeIn(250, 13, 11, 31);
    this.backdrop = new Backdrop(this);
    installGlobalKeys(this);
    music.play('menu');

    const shade = this.add.graphics();
    shade.fillGradientStyle(0x0d0b1f, 0x0d0b1f, 0x0d0b1f, 0x0d0b1f, 0.65, 0, 0.65, 0);
    shade.fillRect(0, 0, GAME_WIDTH * 0.6, GAME_HEIGHT);

    // Title with bouncing letters
    const title = 'ARENA RUSH';
    const startX = 330 - (title.length * 44) / 2;
    [...title].forEach((ch, i) => {
      if (ch === ' ') return;
      const letter = displayText(this, startX + i * 46, 120, ch, 76, i < 5 ? '#ffd23f' : '#ff6fb5', UI.inkCss, 12);
      this.tweens.add({
        targets: letter, y: 104, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: i * 70,
      });
    });
    displayText(this, 330, 185, 'PLATFORM  FIGHTER', 20, '#ffffff', UI.inkCss, 6).setLetterSpacing(4);

    this.menu = new Menu(this, 330, 290, [
      { label: () => 'PLAYER VS CPU', hint: 'Pick your fighter, rival & difficulty', action: () => fadeTo(this, 'Select') },
      { label: () => 'ONLINE PLAY', hint: 'Coming in Phase 3', action: () => fadeTo(this, 'Online') },
      { label: () => 'HOW TO PLAY', hint: 'Controls & rules', action: () => this.showHelp() },
      { label: () => `AUDIO${sound.muted ? ': MUTED' : ''}`, hint: 'Volume & mute · M mutes anytime', action: () => this.showAudio() },
    ]);

    const offAudio = sound.onSettingsChange(() => this.menu.refresh());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offAudio);

    this.lineup = this.add.graphics();
    this.figures = new FigureCache(this);

    bodyText(this, GAME_WIDTH / 2, GAME_HEIGHT - 16,
      'Unofficial, noncommercial fan project · Not affiliated with or endorsed by Nintendo · All art, music & sound procedurally generated',
      12, 'rgba(255,255,255,0.7)', '500');

    this.input.keyboard?.on('keydown-ESC', () => this.closeHelp());
  }

  private showAudio(): void {
    if (this.overlay.length) return;
    this.menu.active = false;
    openAudioSettings(this, () => {
      this.menu.active = true;
      this.menu.refresh();
    });
  }

  private showHelp(): void {
    if (this.overlay.length) return;
    this.menu.active = false;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const dim = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x0d0b1f, 0.75).setInteractive();
    const p = panel(this, cx, cy, 940, 560, UI.panel, 0xffffff, 0.97);
    const h = displayText(this, cx, cy - 240, 'HOW TO PLAY', 36, '#ffd23f');
    const rows: [string, string][] = [
      ['', 'PLAYER 1 (YOU)'],
      ['Move', 'A / D'],
      ['Jump / Double jump', 'W'],
      ['Drop through / Fast fall', 'S'],
      ['Light attack (air: aerial)', 'F'],
      ['Heavy attack', 'G'],
      ['Special', 'H'],
      ['Dodge', 'Left Shift'],
    ];
    const objs: Phaser.GameObjects.GameObject[] = [dim, p, h];
    rows.forEach((r, i) => {
      const y = cy - 180 + i * 38;
      const style = i === 0 ? '#ffd23f' : '#ffffff';
      objs.push(this.add.text(cx - 380, y, r[0], { fontFamily: FONT_BODY, fontSize: '19px', fontStyle: '700', color: UI.muted }).setOrigin(0, 0.5));
      objs.push(bodyText(this, cx + 200, y, r[1], 20, i === 0 ? '#ff4d5e' : style, '900'));
    });
    const rules = [
      'You (P1) vs the CPU · 3 stocks each · 5 minutes · knock the CPU past the dotted blast lines.',
      'Damage % goes up as you get hit — the higher it is, the farther you fly. CPU: Easy → Expert.',
      'Hold special to charge Luigi\'s rocket or Goku\'s Kamehameha · Spider-Man: special + ↑ in the air web-zips · Gundam has 3 jumps.',
      'Esc pauses a match · M toggles sound (volumes under AUDIO) · ` (backtick) shows hitboxes.',
    ];
    rules.forEach((line, i) => objs.push(bodyText(this, cx, cy + 140 + i * 26, line, 15, '#e8e5ff', '500')));
    objs.push(displayText(this, cx, cy + 250, 'PRESS ESC OR CLICK TO CLOSE', 16, '#b9b4e6', UI.inkCss, 4));
    dim.on('pointerdown', () => this.closeHelp());
    this.overlay = objs;
  }

  private closeHelp(): void {
    if (!this.overlay.length) return;
    sound.menuBack();
    this.overlay.forEach((o) => o.destroy());
    this.overlay = [];
    this.time.delayedCall(50, () => {
      this.menu.active = true;
    });
  }

  update(): void {
    this.t++;
    this.backdrop.update();
    const g = this.lineup;
    g.clear();
    // Platform under the lineup
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(940, 560, 560, 40);
    g.fillStyle(0x3fbf5f, 1);
    g.fillRoundedRect(680, 530, 520, 22, 10);
    g.fillStyle(0x7ff08f, 1);
    g.fillRoundedRect(690, 530, 500, 7, 4);
    g.fillStyle(0x8a74e8, 1);
    g.fillRoundedRect(690, 548, 500, 30, 8);
    // Three fighters at a time, cycling through the whole roster.
    const group = Math.floor(this.t / 240) % Math.ceil(FIGHTER_ORDER.length / 3);
    const fade = Math.min(1, (this.t % 240) / 20, (240 - (this.t % 240)) / 20);
    this.figures.begin();
    for (let i = 0; i < 3; i++) {
      const id = FIGHTER_ORDER[(group * 3 + i) % FIGHTER_ORDER.length];
      const frame = previewFrame(id, 'victory', this.t + i * 40);
      this.figures.draw(id, frame, 800 + i * 140, 530, i === 2 ? -1 : 1, 1.85, { alpha: fade });
    }
    this.figures.end();
  }
}
