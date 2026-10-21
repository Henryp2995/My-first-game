import Phaser from 'phaser';
import { music } from '../audio/music';
import { FIGHTERS, STAGE_ORDER, STAGES, solidExtent, type StageId } from '@arena-rush/shared';
import { sound } from '../audio/sound';
import { Backdrop, drawStagePreview } from '../render/backdrop';
import { GAME_HEIGHT, GAME_WIDTH, PLAYER_CSS, UI } from '../theme';
import { bodyText, displayText, fadeTo, installGlobalKeys } from '../ui/widgets';
import { slotCss, slotDescription, type MatchSetup } from './types';

const CARD_W = 370;
const CARD_H = 380;
const CARD_Y = 330;
const PREVIEW_H = 220;
const cardX = (i: number) => GAME_WIDTH / 2 + (i - 1) * 400;
const BUTTON_Y = 626;

/** Picks the stage after character select. Back returns to character select with picks intact. */
export class StageSelectScene extends Phaser.Scene {
  private setup!: MatchSetup;
  private index = 0;
  private backdrop!: Backdrop;
  private cursor!: Phaser.GameObjects.Graphics;
  private buttons: { bg: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text; x: number; w: number; primary: boolean }[] = [];
  private hoverButton = -1;
  private leaving = false;
  private t = 0;

  constructor() {
    super('StageSelect');
  }

  init(data: { setup: MatchSetup }): void {
    this.setup = data.setup;
    this.index = Math.max(0, STAGE_ORDER.indexOf(data.setup.stage ?? 'skyfall'));
  }

  create(): void {
    this.t = 0;
    this.leaving = false;
    this.buttons = [];
    this.hoverButton = -1;
    this.cameras.main.fadeIn(250, 13, 11, 31);
    this.backdrop = new Backdrop(this);
    installGlobalKeys(this);
    music.play('stageSelect');
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0d0b1f, 0.55);

    displayText(this, GAME_WIDTH / 2, 40, 'CHOOSE A STAGE', 38, '#ffd23f', UI.inkCss, 9);
    const [p1, cpu] = this.setup.players;
    const vs = this.add.text(GAME_WIDTH / 2, 84, '', { fontFamily: 'Rubik, sans-serif', fontSize: '16px', fontStyle: '900', color: '#ffffff' }).setOrigin(0.5);
    vs.setText(`${FIGHTERS[p1.fighter].name.toUpperCase()}   vs   ${FIGHTERS[cpu.fighter].name.toUpperCase()}  (${slotDescription(this.setup, 1)})`);
    bodyText(this, GAME_WIDTH / 2 - vs.width / 2 - 26, 84, 'P1', 15, PLAYER_CSS[0], '900');
    bodyText(this, GAME_WIDTH / 2 + vs.width / 2 + 30, 84, 'CPU', 15, slotCss(this.setup, 1), '900');

    STAGE_ORDER.forEach((id, i) => this.buildCard(id, i));
    this.cursor = this.add.graphics();

    this.buildButton('◀  BACK', GAME_WIDTH / 2 - 170, 220, false, () => this.back());
    this.buildButton('FIGHT!', GAME_WIDTH / 2 + 170, 260, true, () => this.confirm());

    bodyText(this, GAME_WIDTH / 2, 700, 'A / D  choose   ·   F / Enter  fight   ·   G / Esc  back to characters   ·   mouse works too', 13, 'rgba(255,255,255,0.65)', '500');

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (this.leaving) return;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.move(-1);
      else if (e.code === 'KeyD' || e.code === 'ArrowRight') this.move(1);
      else if (e.code === 'KeyF' || e.code === 'Enter' || e.code === 'Space') this.confirm();
      else if (e.code === 'KeyG' || e.code === 'Escape' || e.code === 'Backspace') this.back();
    });
    this.refreshButtons();
  }

  private buildCard(id: StageId, i: number): void {
    const stage = STAGES[id];
    const x = cardX(i);
    const top = CARD_Y - CARD_H / 2;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(x - CARD_W / 2 + 6, top + 8, CARD_W, CARD_H, 18);
    g.fillStyle(UI.panel, 0.97);
    g.fillRoundedRect(x - CARD_W / 2, top, CARD_W, CARD_H, 18);
    drawStagePreview(this, stage, x, top + 12 + PREVIEW_H / 2, CARD_W - 24, PREVIEW_H);
    const frame = this.add.graphics();
    frame.lineStyle(2, 0xffffff, 0.35);
    frame.strokeRoundedRect(x - CARD_W / 2 + 12, top + 12, CARD_W - 24, PREVIEW_H, 6);

    displayText(this, x, top + PREVIEW_H + 44, stage.name.toUpperCase(), 24, '#ffffff', UI.inkCss, 6);
    this.add.text(x, top + PREVIEW_H + 76, stage.description, {
      fontFamily: 'Rubik, sans-serif', fontSize: '14px', fontStyle: '500', color: UI.muted, align: 'center',
      wordWrap: { width: CARD_W - 40 },
    }).setOrigin(0.5, 0);
    const solid = stage.platforms.filter((p) => !p.oneWay).length;
    const soft = stage.platforms.length - solid;
    const { x1, x2 } = solidExtent(stage);
    bodyText(this, x, top + CARD_H - 22,
      `${solid} solid · ${soft} soft platform${soft === 1 ? '' : 's'} · ${Math.round(x2 - x1)} px wide`, 12, '#8a84bf', '700');

    const zone = this.add.zone(x, CARD_Y, CARD_W, CARD_H).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => {
      if (this.index !== i && !this.leaving) {
        this.index = i;
        sound.menuMove();
      }
    });
    zone.on('pointerdown', () => {
      this.index = i;
      this.confirm();
    });
  }

  private buildButton(text: string, x: number, w: number, primary: boolean, action: () => void): void {
    const bg = this.add.graphics();
    const label = displayText(this, x, BUTTON_Y, text, 24, '#ffffff', UI.inkCss, 5);
    const idx = this.buttons.length;
    this.buttons.push({ bg, label, x, w, primary });
    const zone = this.add.zone(x, BUTTON_Y, w, 54).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => {
      this.hoverButton = idx;
      this.refreshButtons();
    });
    zone.on('pointerout', () => {
      this.hoverButton = -1;
      this.refreshButtons();
    });
    zone.on('pointerdown', action);
  }

  private refreshButtons(): void {
    this.buttons.forEach((b, i) => {
      const hot = i === this.hoverButton || (b.primary && this.hoverButton === -1);
      b.bg.clear();
      b.bg.fillStyle(0x000000, 0.3);
      b.bg.fillRoundedRect(b.x - b.w / 2 + 4, BUTTON_Y - 27 + 6, b.w, 54, 14);
      b.bg.fillStyle(hot ? UI.accent : UI.panel, 1);
      b.bg.fillRoundedRect(b.x - b.w / 2, BUTTON_Y - 27, b.w, 54, 14);
      b.bg.lineStyle(3, hot ? 0xffffff : 0x5a52a8, 1);
      b.bg.strokeRoundedRect(b.x - b.w / 2, BUTTON_Y - 27, b.w, 54, 14);
      b.label.setColor(hot ? UI.inkCss : '#ffffff').setStroke(hot ? '#ffffff' : UI.inkCss, hot ? 0 : 5);
    });
  }

  private move(d: number): void {
    this.index = (this.index + d + STAGE_ORDER.length) % STAGE_ORDER.length;
    sound.menuMove();
  }

  private confirm(): void {
    if (this.leaving) return;
    this.leaving = true;
    sound.menuSelect();
    const setup: MatchSetup = { ...this.setup, stage: STAGE_ORDER[this.index] };
    fadeTo(this, 'Battle', { setup });
  }

  private back(): void {
    if (this.leaving) return;
    this.leaving = true;
    sound.menuBack();
    fadeTo(this, 'Select', { previous: { ...this.setup, stage: STAGE_ORDER[this.index] } });
  }

  update(): void {
    this.t++;
    this.backdrop.update();
    const g = this.cursor;
    g.clear();
    const x = cardX(this.index);
    const pulse = 0.65 + Math.sin(this.t * 0.15) * 0.35;
    g.lineStyle(7, UI.accent, pulse);
    g.strokeRoundedRect(x - CARD_W / 2 - 8, CARD_Y - CARD_H / 2 - 8, CARD_W + 16, CARD_H + 16, 24);
    g.fillStyle(UI.accent, 1);
    g.fillTriangle(x - 14, CARD_Y - CARD_H / 2 - 30, x + 14, CARD_Y - CARD_H / 2 - 30, x, CARD_Y - CARD_H / 2 - 12);
  }
}
