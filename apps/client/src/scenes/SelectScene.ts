import Phaser from 'phaser';
import {
  CPU_DIFFICULTIES, CPU_PROFILES, FIGHTERS, FIGHTER_ORDER, weightRating,
  type CpuDifficulty, type FighterId,
} from '@arena-rush/shared';
import { sound } from '../audio/sound';
import { FIGHTER_UI_COLOR, shade } from '../render/art';
import { FigureCache } from '../render/characters';
import { Backdrop } from '../render/backdrop';
import { previewFrame } from '../anim/controller';
import { CPU_COLOR, CPU_CSS, FONT_BODY, GAME_HEIGHT, GAME_WIDTH, PLAYER_COLORS, PLAYER_CSS, UI } from '../theme';
import { bodyText, displayText, fadeTo, installGlobalKeys, panel } from '../ui/widgets';
import type { MatchSetup } from './types';

/** Player vs CPU setup flow: pick your fighter → pick the CPU's fighter → pick CPU difficulty → stage select. */
type Step = 'player' | 'cpu' | 'difficulty';
const STEPS: Step[] = ['player', 'cpu', 'difficulty'];

const STEP_TITLE: Record<Step, string> = {
  player: 'CHOOSE YOUR FIGHTER',
  cpu: 'CHOOSE YOUR OPPONENT',
  difficulty: 'CPU DIFFICULTY',
};

const DIFFICULTY_BLURB: Record<CpuDifficulty, string> = {
  easy: 'Slow reactions, lots of mistakes',
  normal: 'A fair fight for most players',
  hard: 'Quick, punishes openings, recovers well',
  expert: 'Near-instant reactions. Good luck!',
};

// Roster strip
const N = FIGHTER_ORDER.length;
// Cards shrink to fit the roster on one row (160 px wide for 7, ~130 px for 9).
const CARD_GAP = N > 7 ? 8 : 12;
const CARD_W = Math.min(160, Math.floor((GAME_WIDTH - 40 - (N - 1) * CARD_GAP) / N));
const CARD_H = 200;
const PREVIEW_SCALE = CARD_W >= 150 ? 1.2 : 1.0;
const ROSTER_Y = 218;
const cardX = (i: number) => GAME_WIDTH / 2 + (i - (N - 1) / 2) * (CARD_W + CARD_GAP);

// Detail panels
const PANEL_W = 600;
const PANEL_H = 286;
const PANEL_Y = 512;
const PANEL_X = [GAME_WIDTH / 2 - 312, GAME_WIDTH / 2 + 312];
const pillX = (k: number) => PANEL_X[1] + 60 + (k - 1.5) * 92;
const PILL_Y = PANEL_Y + 104;

const KEYS = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  confirm: ['KeyF', 'Enter', 'Space'],
  back: ['KeyG', 'Backspace'],
};

interface DetailPanel {
  name: Phaser.GameObjects.Text;
  tagline: Phaser.GameObjects.Text;
  bars: Phaser.GameObjects.Graphics;
  moves: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
}

export class SelectScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private step: Step = 'player';
  private playerIndex = 0;
  private cpuIndex = 2;
  private difficulty = 1;
  private confirmedAt: [number, number] = [-999, -999];
  private figures!: FigureCache;
  private cursorGfx!: Phaser.GameObjects.Graphics;
  private pillGfx!: Phaser.GameObjects.Graphics;
  private pillText: Phaser.GameObjects.Text[] = [];
  private badges: Phaser.GameObjects.Text[] = [];
  private title!: Phaser.GameObjects.Text;
  private subtitle!: Phaser.GameObjects.Text;
  private details: DetailPanel[] = [];
  private leaving = false;
  private t = 0;
  private previous: MatchSetup | null = null;

  constructor() {
    super('Select');
  }

  init(data: { previous?: MatchSetup }): void {
    this.previous = data?.previous ?? null;
  }

  create(): void {
    this.t = 0;
    this.step = 'player';
    this.leaving = false;
    this.figures = new FigureCache(this);
    this.badges = [];
    this.pillText = [];
    this.details = [];
    this.confirmedAt = [-999, -999];
    this.cameras.main.fadeIn(250, 13, 11, 31);
    this.backdrop = new Backdrop(this);
    installGlobalKeys(this);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0d0b1f, 0.5);

    // Restore the last match's picks (when coming back from Results or stage select).
    const prevHuman = this.previous?.players.find((p) => p.control === 'human');
    const prevCpu = this.previous?.players.find((p) => p.control === 'cpu');
    this.playerIndex = prevHuman ? Math.max(0, FIGHTER_ORDER.indexOf(prevHuman.fighter)) : 0;
    this.cpuIndex = prevCpu ? Math.max(0, FIGHTER_ORDER.indexOf(prevCpu.fighter)) : 2;
    this.difficulty = prevCpu?.control === 'cpu' ? CPU_DIFFICULTIES.indexOf(prevCpu.difficulty) : 1;

    this.title = displayText(this, GAME_WIDTH / 2, 36, '', 36, '#ffd23f', UI.inkCss, 9);
    this.subtitle = bodyText(this, GAME_WIDTH / 2, 76, '', 15, '#ffffff', '700');

    FIGHTER_ORDER.forEach((id, i) => this.buildCard(id, i));
    this.cursorGfx = this.add.graphics();
    this.badges.push(displayText(this, 0, 0, 'P1', 18, '#ffffff', shadeCss(PLAYER_COLORS[0]), 0));
    this.badges.push(displayText(this, 0, 0, 'CPU', 16, '#ffffff', shadeCss(CPU_COLOR), 0));

    this.buildDetailPanel(0);
    this.buildDetailPanel(1);

    // Difficulty pills (in the CPU panel)
    this.pillGfx = this.add.graphics();
    CPU_DIFFICULTIES.forEach((d, k) => {
      this.pillText.push(bodyText(this, pillX(k), PILL_Y, CPU_PROFILES[d].label.toUpperCase(), 12, '#ffffff', '900'));
      const zone = this.add.zone(pillX(k), PILL_Y, 84, 26).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        if (this.step === 'player') return;
        this.difficulty = k;
        this.step = 'difficulty';
        this.advance();
      });
    });

    bodyText(this, GAME_WIDTH / 2, 702,
      'A / D  choose   ·   F  confirm   ·   G  back   ·   Esc  menu   ·   M  mute   ·   mouse works too',
      13, 'rgba(255,255,255,0.65)', '500');

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e.code));
    this.refresh();
  }

  private buildCard(id: FighterId, i: number): void {
    const x = cardX(i);
    const top = ROSTER_Y - CARD_H / 2;
    const color = FIGHTER_UI_COLOR[id];
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(x - CARD_W / 2 + 5, top + 6, CARD_W, CARD_H, 14);
    g.fillStyle(UI.panel, 0.97);
    g.fillRoundedRect(x - CARD_W / 2, top, CARD_W, CARD_H, 14);
    g.fillStyle(id === 'gnw' ? 0xc9d4a6 : shade(color, 0.5), 1);
    g.fillRoundedRect(x - CARD_W / 2 + 7, top + 7, CARD_W - 14, 150, 10);
    if (id === 'gnw') {
      g.lineStyle(1, 0xb4bf90, 1);
      for (let gx = x - CARD_W / 2 + 12; gx < x + CARD_W / 2 - 8; gx += 7) g.lineBetween(gx, top + 9, gx, top + 155);
    } else {
      g.fillStyle(color, 0.35);
      g.fillCircle(x, top + 80, Math.min(56, CARD_W * 0.38));
    }
    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(x, top + 146, Math.min(90, CARD_W * 0.6), 10);

    const name = displayText(this, x, top + 178, FIGHTERS[id].name.toUpperCase(), CARD_W >= 150 ? 17 : 15, '#ffffff', UI.inkCss, 5);
    while (name.width > CARD_W - 14 && Number.parseInt(String(name.style.fontSize), 10) > 9) {
      name.setFontSize(Number.parseInt(String(name.style.fontSize), 10) - 1);
    }


    const zone = this.add.zone(x, ROSTER_Y, CARD_W, CARD_H).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => {
      if (this.step === 'player') this.playerIndex = i;
      else if (this.step === 'cpu') this.cpuIndex = i;
      else return;
      this.advance();
    });
    zone.on('pointerover', () => {
      if (this.step === 'player' && this.playerIndex !== i) {
        this.playerIndex = i;
        sound.menuMove();
        this.refresh();
      } else if (this.step === 'cpu' && this.cpuIndex !== i) {
        this.cpuIndex = i;
        sound.menuMove();
        this.refresh();
      }
    });
  }

  private buildDetailPanel(who: 0 | 1): void {
    const cx = PANEL_X[who];
    const color = who === 0 ? PLAYER_COLORS[0] : CPU_COLOR;
    panel(this, cx, PANEL_Y, PANEL_W, PANEL_H, UI.panel, color, 0.96, 18);
    const left = cx - PANEL_W / 2;
    const g = this.add.graphics();
    g.fillStyle(shade(color, 0.35), 1);
    g.fillRoundedRect(left + 14, PANEL_Y - PANEL_H / 2 + 14, 170, PANEL_H - 28, 12);
    displayText(this, left + 46, PANEL_Y - PANEL_H / 2 + 34, who === 0 ? 'P1' : 'CPU', who === 0 ? 24 : 20,
      who === 0 ? PLAYER_CSS[0] : CPU_CSS, UI.inkCss, 5);
    bodyText(this, left + 140, PANEL_Y - PANEL_H / 2 + 34, who === 0 ? 'YOU' : 'COMPUTER', 11, who === 0 ? PLAYER_CSS[0] : CPU_CSS, '900');
    const tx = left + 210;
    const name = this.add.text(tx, PANEL_Y - PANEL_H / 2 + 22, '', { fontFamily: '"Bungee", "Arial Black", sans-serif', fontSize: '26px', color: '#ffffff', stroke: UI.inkCss, strokeThickness: 5 });
    const tagline = this.add.text(tx, PANEL_Y - PANEL_H / 2 + 62, '', { fontFamily: FONT_BODY, fontSize: '14px', fontStyle: '700', color: UI.muted });
    const bars = this.add.graphics();
    ['SPEED', 'POWER', 'WEIGHT', 'JUMP'].forEach((label, k) => {
      this.add.text(tx, PANEL_Y - PANEL_H / 2 + 98 + k * 26, label, { fontFamily: FONT_BODY, fontSize: '14px', fontStyle: '900', color: '#ffffff' }).setOrigin(0, 0.5);
    });
    const moves = this.add.text(tx, PANEL_Y + 62, '', { fontFamily: FONT_BODY, fontSize: '13px', fontStyle: '500', color: '#b9b4e6', wordWrap: { width: PANEL_W - 230 } });
    const status = this.add.text(tx, PANEL_Y + PANEL_H / 2 - 24, '', { fontFamily: FONT_BODY, fontSize: '14px', fontStyle: '900', color: UI.muted });
    this.details.push({ name, tagline, bars, moves, status });
  }

  private onKey(code: string): void {
    if (this.leaving) return;
    if (code === 'Escape') {
      sound.menuBack();
      fadeTo(this, 'Menu');
      return;
    }
    if (KEYS.left.includes(code)) this.move(-1);
    else if (KEYS.right.includes(code)) this.move(1);
    else if (KEYS.confirm.includes(code)) this.advance();
    else if (KEYS.back.includes(code)) this.goBack();
  }

  private move(d: number): void {
    if (this.step === 'player') this.playerIndex = wrap(this.playerIndex + d, N);
    else if (this.step === 'cpu') this.cpuIndex = wrap(this.cpuIndex + d, N);
    else this.difficulty = wrap(this.difficulty + d, CPU_DIFFICULTIES.length);
    sound.menuMove();
    this.refresh();
  }

  private advance(): void {
    if (this.leaving) return;
    sound.menuSelect();
    if (this.step === 'player' || this.step === 'cpu') {
      const who = this.step === 'player' ? 0 : 1;
      this.confirmedAt[who] = this.t;
      const x = cardX(who === 0 ? this.playerIndex : this.cpuIndex);
      const flash = this.add.circle(x, ROSTER_Y - 20, 30, who === 0 ? PLAYER_COLORS[0] : CPU_COLOR, 0.8);
      this.tweens.add({ targets: flash, radius: 110, alpha: 0, duration: 350, onComplete: () => flash.destroy() });
    }
    if (this.step === 'difficulty') {
      this.toStageSelect();
      return;
    }
    this.step = STEPS[STEPS.indexOf(this.step) + 1];
    this.refresh();
  }

  private goBack(): void {
    const i = STEPS.indexOf(this.step);
    if (i === 0) return;
    sound.menuBack();
    this.step = STEPS[i - 1];
    this.refresh();
  }

  private toStageSelect(): void {
    this.leaving = true;
    const setup: MatchSetup = {
      players: [
        { fighter: FIGHTER_ORDER[this.playerIndex], control: 'human' },
        { fighter: FIGHTER_ORDER[this.cpuIndex], control: 'cpu', difficulty: CPU_DIFFICULTIES[this.difficulty] },
      ],
      stage: this.previous?.stage,
    };
    fadeTo(this, 'StageSelect', { setup });
  }

  private refresh(): void {
    const at = STEPS.indexOf(this.step);
    this.title.setText(STEP_TITLE[this.step]);
    this.subtitle.setText(
      this.step === 'player' ? 'Step 1 of 3  ·  Pick the fighter YOU will control'
        : this.step === 'cpu' ? 'Step 2 of 3  ·  Pick the fighter the CPU will control (mirror matches allowed)'
          : 'Step 3 of 3  ·  Choose how tough the CPU is, then pick a stage',
    );

    ([0, 1] as const).forEach((who) => {
      const d = this.details[who];
      const id = FIGHTER_ORDER[who === 0 ? this.playerIndex : this.cpuIndex];
      const def = FIGHTERS[id];
      const hidden = who === 1 && at < 1;
      const mirror = who === 1 && this.playerIndex === this.cpuIndex;
      d.name.setText(hidden ? '???' : def.name.toUpperCase() + (mirror ? ' (ALT)' : ''));
      d.name.setFontSize(def.name.length > 12 ? 20 : 26);
      d.tagline.setText(hidden ? 'Waiting for P1…' : def.tagline);
      // The CPU panel needs room for the difficulty pills, so it gets a one-line summary.
      d.moves.setText(hidden ? '' : who === 0
        ? `Special: ${def.moves.special.name}  ·  Heavy: ${def.moves.heavy.name}\nWeight class: ${def.ratings.weight}  ·  Difficulty: ${def.ratings.difficulty}`
        : `Special: ${def.moves.special.name}  ·  ${def.ratings.weight} · ${def.ratings.difficulty}`);
      const g = d.bars;
      g.clear();
      const bx = PANEL_X[who] - PANEL_W / 2 + 300;
      const values = hidden ? [0, 0, 0, 0] : [def.ratings.speed, def.ratings.power, weightRating(def), def.ratings.jump];
      values.forEach((v, k) => {
        const y = PANEL_Y - PANEL_H / 2 + 98 + k * 26;
        for (let pip = 0; pip < 5; pip++) {
          g.fillStyle(pip < v ? UI.accent : 0x3a3473, 1);
          g.fillRoundedRect(bx + pip * 34, y - 8, 28, 16, 4);
        }
      });
      const locked = who === 0 ? at > 0 : at > 1;
      if (who === 0) d.status.setText(locked ? '✔ LOCKED IN' : 'Choosing…').setColor(locked ? '#7ff08f' : UI.muted);
      else d.status.setText(at < 2 ? (at === 1 ? 'Choosing fighter…' : '') : `${CPU_PROFILES[CPU_DIFFICULTIES[this.difficulty]].label}: ${DIFFICULTY_BLURB[CPU_DIFFICULTIES[this.difficulty]]}`)
        .setColor(at === 2 ? '#ffd23f' : UI.muted);
    });

    const g = this.pillGfx;
    g.clear();
    CPU_DIFFICULTIES.forEach((_, k) => {
      const selected = k === this.difficulty;
      const active = this.step === 'difficulty';
      g.fillStyle(selected ? (active ? UI.accent : 0x6c6796) : 0x2c2660, at >= 1 || selected ? 1 : 0.5);
      g.fillRoundedRect(pillX(k) - 42, PILL_Y - 13, 84, 26, 8);
      if (selected && active) {
        g.lineStyle(3, 0xffffff, 1);
        g.strokeRoundedRect(pillX(k) - 42, PILL_Y - 13, 84, 26, 8);
      }
      this.pillText[k].setColor(selected && active ? UI.inkCss : selected ? '#ffffff' : '#8a84bf');
    });
  }

  update(): void {
    this.t++;
    this.backdrop.update();
    const at = STEPS.indexOf(this.step);

    // Roster previews: a fighter strikes its victory pose right after being picked.
    this.figures.begin();
    FIGHTER_ORDER.forEach((id, i) => {
      const recent = (i === this.playerIndex && this.t - this.confirmedAt[0] < 90)
        || (i === this.cpuIndex && this.t - this.confirmedAt[1] < 90);
      const frame = posed(id, recent ? 'victory' : 'preview', this.t + i * 30);
      this.figures.draw(id, frame, cardX(i), ROSTER_Y - CARD_H / 2 + 146, 1, PREVIEW_SCALE, { slot: 'card' });
    });

    // Detail panel previews
    ([0, 1] as const).forEach((who) => {
      if (who === 1 && at < 1) return;
      const idx = who === 0 ? this.playerIndex : this.cpuIndex;
      const id = FIGHTER_ORDER[idx];
      const alt = who === 1 && this.playerIndex === this.cpuIndex;
      const frame = posed(id, 'preview', this.t);
      this.figures.draw(id, frame, PANEL_X[who] - PANEL_W / 2 + 99, PANEL_Y + PANEL_H / 2 - 30, 1, 1.75, { alt, slot: `panel${who}` });
    });
    this.figures.end();

    // Cursors on the roster strip
    const g = this.cursorGfx;
    g.clear();
    const pulse = 0.6 + Math.sin(this.t * 0.15) * 0.4;
    const cursors = [
      { index: this.playerIndex, color: PLAYER_COLORS[0], label: 'P1', locked: at > 0, visible: true },
      { index: this.cpuIndex, color: CPU_COLOR, label: 'CPU', locked: at > 1, visible: at >= 1 },
    ];
    cursors.forEach((c, p) => {
      this.badges[p].setVisible(c.visible);
      if (!c.visible) return;
      const x = cardX(c.index);
      const inset = p === 1 && this.playerIndex === this.cpuIndex ? 6 : 0;
      const w = CARD_W + 10 - inset * 2;
      const h = CARD_H + 10 - inset * 2;
      g.lineStyle(c.locked ? 6 : 5, c.color, c.locked ? 1 : pulse);
      g.strokeRoundedRect(x - w / 2, ROSTER_Y - h / 2, w, h, 16);
      const bx = x + (p === 0 ? -CARD_W / 2 + 26 : CARD_W / 2 - 30);
      const by = ROSTER_Y - CARD_H / 2 - 2;
      const bw = p === 0 ? 46 : 56;
      g.fillStyle(c.color, 1);
      g.fillRoundedRect(bx - bw / 2, by - 14, bw, 28, 8);
      g.lineStyle(2, 0xffffff, 1);
      g.strokeRoundedRect(bx - bw / 2, by - 14, bw, 28, 8);
      this.badges[p].setPosition(bx, by).setText(c.locked ? `${c.label}✔` : c.label).setFontSize(c.locked ? 13 : 16);
    });
  }
}

function posed(id: FighterId, action: 'victory' | 'preview', t: number) {
  return previewFrame(id, action === 'victory' ? 'victory' : 'idle', t);
}

function wrap(i: number, n: number): number {
  return (i + n) % n;
}

function shadeCss(n: number): string {
  return `#${shade(n, 0.5).toString(16).padStart(6, '0')}`;
}
