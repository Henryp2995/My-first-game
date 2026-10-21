import Phaser from 'phaser';
import { CPU_DIFFICULTIES, CPU_PROFILES, FIGHTERS, FIGHTER_ORDER, type CpuDifficulty, type FighterId } from '@arena-rush/shared';
import { sound } from '../audio/sound';
import { drawFighter, FIGHTER_UI_COLOR, shade } from '../render/art';
import { Backdrop } from '../render/backdrop';
import { computePose } from '../render/pose';
import { CPU_COLOR, CPU_CSS, FONT_BODY, GAME_HEIGHT, GAME_WIDTH, PLAYER_COLORS, PLAYER_CSS, UI } from '../theme';
import { bodyText, displayText, fadeTo, installGlobalKeys, panel } from '../ui/widgets';
import type { MatchSetup } from './types';

/** Player vs CPU setup flow: pick your fighter → pick the CPU's fighter → pick CPU difficulty. */
type Step = 'player' | 'cpu' | 'difficulty' | 'ready';
const STEPS: Step[] = ['player', 'cpu', 'difficulty', 'ready'];

const STEP_TITLE: Record<Step, string> = {
  player: 'CHOOSE YOUR FIGHTER',
  cpu: 'CHOOSE YOUR OPPONENT',
  difficulty: 'CPU DIFFICULTY',
  ready: 'READY!',
};

const DIFFICULTY_BLURB: Record<CpuDifficulty, string> = {
  easy: 'Slow reactions, lots of mistakes',
  normal: 'A fair fight for most players',
  hard: 'Quick, punishes openings, recovers well',
  expert: 'Near-instant reactions. Good luck!',
};

const CARD_W = 340;
const CARD_H = 420;
const CARD_Y = 330;
const cardX = (i: number) => GAME_WIDTH / 2 + (i - 1) * 380;
const PANEL_Y = 630;
const CPU_PANEL_X = GAME_WIDTH - 300;
const pillX = (k: number) => CPU_PANEL_X + 40 + (k - 1.5) * 96;

const KEYS = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  confirm: ['KeyF', 'Enter', 'Space'],
  back: ['KeyG', 'Backspace'],
};

export class SelectScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private step: Step = 'player';
  private playerIndex = 0;
  private cpuIndex = 2;
  private difficulty = 1;
  private confirmedAt: [number, number] = [-999, -999];
  private previews: Phaser.GameObjects.Graphics[] = [];
  private cursorGfx!: Phaser.GameObjects.Graphics;
  private pillGfx!: Phaser.GameObjects.Graphics;
  private pillText: Phaser.GameObjects.Text[] = [];
  private badges: Phaser.GameObjects.Text[] = [];
  private title!: Phaser.GameObjects.Text;
  private subtitle!: Phaser.GameObjects.Text;
  private panels!: { p1Name: Phaser.GameObjects.Text; p1Status: Phaser.GameObjects.Text; cpuName: Phaser.GameObjects.Text; cpuStatus: Phaser.GameObjects.Text };
  private banner!: Phaser.GameObjects.Container;
  private startTimer = -1;
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
    this.startTimer = -1;
    this.step = 'player';
    this.previews = [];
    this.badges = [];
    this.pillText = [];
    this.confirmedAt = [-999, -999];
    this.cameras.main.fadeIn(250, 13, 11, 31);
    this.backdrop = new Backdrop(this);
    installGlobalKeys(this);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0d0b1f, 0.45);

    // Restore the last match's picks (when coming back from Results).
    const prevHuman = this.previous?.players.find((p) => p.control === 'human');
    const prevCpu = this.previous?.players.find((p) => p.control === 'cpu');
    this.playerIndex = prevHuman ? FIGHTER_ORDER.indexOf(prevHuman.fighter) : 0;
    this.cpuIndex = prevCpu ? FIGHTER_ORDER.indexOf(prevCpu.fighter) : 2;
    this.difficulty = prevCpu?.control === 'cpu' ? CPU_DIFFICULTIES.indexOf(prevCpu.difficulty) : 1;

    this.title = displayText(this, GAME_WIDTH / 2, 40, '', 38, '#ffd23f', UI.inkCss, 10);
    this.subtitle = bodyText(this, GAME_WIDTH / 2, 82, '', 15, '#ffffff', '700');

    FIGHTER_ORDER.forEach((id, i) => this.buildCard(id, i));
    this.cursorGfx = this.add.graphics();
    this.badges.push(displayText(this, 0, 0, 'P1', 22, '#ffffff', shadeCss(PLAYER_COLORS[0]), 0));
    this.badges.push(displayText(this, 0, 0, 'CPU', 20, '#ffffff', shadeCss(CPU_COLOR), 0));

    // P1 panel
    panel(this, 300, PANEL_Y, 520, 110, UI.panel, PLAYER_COLORS[0], 0.95, 16);
    displayText(this, 90, PANEL_Y - 14, 'P1', 34, PLAYER_CSS[0], UI.inkCss, 6);
    bodyText(this, 90, PANEL_Y + 22, 'YOU', 13, PLAYER_CSS[0], '900');
    const p1Name = displayText(this, 320, PANEL_Y - 22, '', 22, '#ffffff', UI.inkCss, 5);
    const p1Status = bodyText(this, 320, PANEL_Y + 8, '', 15, UI.muted, '700');
    bodyText(this, 320, PANEL_Y + 36, 'A / D  choose   ·   F  confirm   ·   G  back', 13, '#8a84bf', '500');

    // CPU panel with difficulty pills
    panel(this, CPU_PANEL_X, PANEL_Y, 520, 110, UI.panel, CPU_COLOR, 0.95, 16);
    displayText(this, CPU_PANEL_X - 210, PANEL_Y - 14, 'CPU', 30, CPU_CSS, UI.inkCss, 6);
    bodyText(this, CPU_PANEL_X - 210, PANEL_Y + 22, 'COMPUTER', 11, CPU_CSS, '900');
    const cpuName = displayText(this, CPU_PANEL_X + 40, PANEL_Y - 32, '', 20, '#ffffff', UI.inkCss, 5);
    this.pillGfx = this.add.graphics();
    CPU_DIFFICULTIES.forEach((d, k) => {
      this.pillText.push(bodyText(this, pillX(k), PANEL_Y + 2, CPU_PROFILES[d].label.toUpperCase(), 13, '#ffffff', '900'));
      const zone = this.add.zone(pillX(k), PANEL_Y + 2, 88, 28).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        if (this.step === 'player' || this.step === 'ready') return;
        this.difficulty = k;
        this.step = 'difficulty';
        this.advance();
      });
    });
    const cpuStatus = bodyText(this, CPU_PANEL_X + 40, PANEL_Y + 34, '', 13, UI.muted, '700');
    this.panels = { p1Name, p1Status, cpuName, cpuStatus };

    // Ready banner
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.4);
    bg.fillRect(-GAME_WIDTH / 2, -46, GAME_WIDTH, 100);
    bg.fillStyle(UI.accent, 1);
    bg.fillRect(-GAME_WIDTH / 2, -40, GAME_WIDTH, 80);
    const txt = displayText(this, 0, -2, 'READY TO FIGHT!', 44, UI.inkCss, '#ffffff', 0);
    const sub = this.add.text(0, 30, 'F  start now   ·   G  change picks', { fontFamily: FONT_BODY, fontSize: '14px', fontStyle: '700', color: '#3b3470' }).setOrigin(0.5);
    this.banner = this.add.container(GAME_WIDTH / 2, 330, [bg, txt, sub]).setVisible(false).setDepth(10);

    bodyText(this, GAME_WIDTH / 2, 702, 'Esc: back to menu   ·   M: mute   ·   mouse works too', 13, 'rgba(255,255,255,0.6)', '500');

    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e.code));
    this.refresh();
  }

  private buildCard(id: FighterId, i: number): void {
    const def = FIGHTERS[id];
    const x = cardX(i);
    const color = FIGHTER_UI_COLOR[id];
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3);
    g.fillRoundedRect(x - CARD_W / 2 + 8, CARD_Y - CARD_H / 2 + 10, CARD_W, CARD_H, 20);
    g.fillStyle(UI.panel, 0.96);
    g.fillRoundedRect(x - CARD_W / 2, CARD_Y - CARD_H / 2, CARD_W, CARD_H, 20);
    // Portrait area
    g.fillStyle(id === 'gnw' ? 0xc9d4a6 : shade(color, 0.55), 1);
    g.fillRoundedRect(x - CARD_W / 2 + 12, CARD_Y - CARD_H / 2 + 12, CARD_W - 24, 180, 14);
    if (id === 'gnw') {
      // LCD-style screen with faint segment grid
      g.lineStyle(1, 0xb4bf90, 1);
      for (let gx = x - CARD_W / 2 + 20; gx < x + CARD_W / 2 - 12; gx += 8) {
        g.lineBetween(gx, CARD_Y - CARD_H / 2 + 14, gx, CARD_Y - CARD_H / 2 + 190);
      }
    } else {
      g.fillStyle(color, 0.35);
      g.fillCircle(x, CARD_Y - CARD_H / 2 + 104, 74);
    }
    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(x, CARD_Y - CARD_H / 2 + 180, 140, 16);

    const name = def.name.toUpperCase();
    displayText(this, x, CARD_Y + 10, name, name.length > 10 ? 22 : 28, '#ffffff', UI.inkCss, 6);
    bodyText(this, x, CARD_Y + 38, def.tagline, 14, UI.muted, '500');

    const stats: [string, number][] = [['SPEED', def.ratings.speed], ['POWER', def.ratings.power], ['JUMP', def.ratings.jump]];
    stats.forEach(([label, v], k) => {
      const y = CARD_Y + 74 + k * 28;
      this.add.text(x - 140, y, label, { fontFamily: FONT_BODY, fontSize: '15px', fontStyle: '900', color: '#ffffff' }).setOrigin(0, 0.5);
      for (let pip = 0; pip < 5; pip++) {
        g.fillStyle(pip < v ? UI.accent : 0x3a3473, 1);
        g.fillRoundedRect(x - 30 + pip * 34, y - 8, 28, 16, 4);
      }
    });
    bodyText(this, x, CARD_Y + 164, `Weight: ${def.ratings.weight}   ·   Difficulty: ${def.ratings.difficulty}`, 14, '#e8e5ff', '700');
    bodyText(this, x, CARD_Y + 188, `${def.moves.special.name} · ${def.moves.heavy.name}`, 13, '#8a84bf', '500');

    const preview = this.add.graphics();
    this.previews.push(preview);

    const zone = this.add.zone(x, CARD_Y, CARD_W, CARD_H).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => {
      if (this.step === 'player') this.playerIndex = i;
      else if (this.step === 'cpu') this.cpuIndex = i;
      else return;
      this.advance();
    });
  }

  private onKey(code: string): void {
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
    if (this.step === 'player') this.playerIndex = wrap(this.playerIndex + d, FIGHTER_ORDER.length);
    else if (this.step === 'cpu') this.cpuIndex = wrap(this.cpuIndex + d, FIGHTER_ORDER.length);
    else if (this.step === 'difficulty') this.difficulty = wrap(this.difficulty + d, CPU_DIFFICULTIES.length);
    else return;
    sound.menuMove();
    this.refresh();
  }

  private advance(): void {
    if (this.step === 'ready') {
      this.startMatch();
      return;
    }
    sound.menuSelect();
    if (this.step === 'player' || this.step === 'cpu') {
      const who = this.step === 'player' ? 0 : 1;
      this.confirmedAt[who] = this.t;
      const x = cardX(who === 0 ? this.playerIndex : this.cpuIndex);
      const flash = this.add.circle(x, CARD_Y - 104, 40, who === 0 ? PLAYER_COLORS[0] : CPU_COLOR, 0.8);
      this.tweens.add({ targets: flash, radius: 140, alpha: 0, duration: 350, onComplete: () => flash.destroy() });
    }
    this.step = STEPS[STEPS.indexOf(this.step) + 1];
    if (this.step === 'ready') this.startTimer = 90;
    this.refresh();
  }

  private goBack(): void {
    const i = STEPS.indexOf(this.step);
    if (i === 0) return;
    sound.menuBack();
    this.step = STEPS[i - 1];
    this.startTimer = -1;
    this.refresh();
  }

  private refresh(): void {
    const step = this.step;
    const at = STEPS.indexOf(step);
    this.title.setText(STEP_TITLE[step]);
    this.subtitle.setText(
      step === 'player' ? 'Step 1 of 3  ·  Pick the fighter YOU will control'
        : step === 'cpu' ? 'Step 2 of 3  ·  Pick the fighter the CPU will control'
          : step === 'difficulty' ? 'Step 3 of 3  ·  A / D to choose how tough the CPU is, F to confirm'
            : 'Starting…',
    );

    const playerFighter = FIGHTERS[FIGHTER_ORDER[this.playerIndex]];
    const cpuFighter = FIGHTERS[FIGHTER_ORDER[this.cpuIndex]];
    const diff = CPU_DIFFICULTIES[this.difficulty];
    this.panels.p1Name.setText(playerFighter.name.toUpperCase());
    this.panels.p1Status.setText(at > 0 ? '✔ LOCKED IN' : 'Choosing…').setColor(at > 0 ? '#7ff08f' : UI.muted);
    const mirror = this.playerIndex === this.cpuIndex;
    this.panels.cpuName.setText(at >= 1 ? cpuFighter.name.toUpperCase() + (mirror ? ' (ALT)' : '') : '???');
    this.panels.cpuStatus.setText(
      at < 2 ? (at === 1 ? 'Choosing fighter…' : 'Waiting for P1…') : DIFFICULTY_BLURB[diff],
    ).setColor(at >= 3 ? '#7ff08f' : UI.muted);

    const g = this.pillGfx;
    g.clear();
    CPU_DIFFICULTIES.forEach((_, k) => {
      const selected = k === this.difficulty;
      const active = step === 'difficulty';
      g.fillStyle(selected ? (active ? UI.accent : 0x6c6796) : 0x2c2660, at >= 2 || selected ? 1 : 0.5);
      g.fillRoundedRect(pillX(k) - 44, PANEL_Y - 12, 88, 28, 8);
      if (selected && active) {
        g.lineStyle(3, 0xffffff, 1);
        g.strokeRoundedRect(pillX(k) - 44, PANEL_Y - 12, 88, 28, 8);
      }
      this.pillText[k].setColor(selected && active ? UI.inkCss : selected ? '#ffffff' : '#8a84bf');
    });

    this.banner.setVisible(step === 'ready');
    if (step === 'ready') {
      this.banner.setScale(0.6);
      this.tweens.add({ targets: this.banner, scale: 1, duration: 220, ease: 'Back.out' });
    }
  }

  private startMatch(): void {
    if (this.startTimer === -2) return;
    this.startTimer = -2;
    const setup: MatchSetup = {
      players: [
        { fighter: FIGHTER_ORDER[this.playerIndex], control: 'human' },
        { fighter: FIGHTER_ORDER[this.cpuIndex], control: 'cpu', difficulty: CPU_DIFFICULTIES[this.difficulty] },
      ],
    };
    fadeTo(this, 'Battle', { setup });
  }

  update(): void {
    this.t++;
    this.backdrop.update();
    if (this.startTimer > 0 && --this.startTimer === 0) this.startMatch();
    const at = STEPS.indexOf(this.step);

    // Previews: a fighter strikes its victory pose right after being picked.
    FIGHTER_ORDER.forEach((id, i) => {
      const g = this.previews[i];
      g.clear();
      const recent = (i === this.playerIndex && this.t - this.confirmedAt[0] < 90)
        || (i === this.cpuIndex && this.t - this.confirmedAt[1] < 90);
      const pose = computePose({
        fighter: id, action: recent ? 'victory' : 'preview', move: null, actionFrame: 0, grounded: true,
        vx: 0, vy: 0, runSpeed: 1, t: this.t + i * 30, flip: -1, tumble: false, charge: 0, rocketLaunched: false,
      });
      drawFighter(g, id, pose, cardX(i), CARD_Y - CARD_H / 2 + 180, 1, 1.7);
    });

    // Cursors: P1 (red) always; CPU (gray) once it's being picked.
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
      const inset = p === 1 && this.playerIndex === this.cpuIndex ? 8 : 0;
      const w = CARD_W + 16 - inset * 2;
      const h = CARD_H + 16 - inset * 2;
      g.lineStyle(c.locked ? 8 : 6, c.color, c.locked ? 1 : pulse);
      g.strokeRoundedRect(x - w / 2, CARD_Y - h / 2, w, h, 24);
      const bx = x + (p === 0 ? -CARD_W / 2 + 36 : CARD_W / 2 - 40);
      const by = CARD_Y - CARD_H / 2 - 4;
      const bw = p === 0 ? 60 : 72;
      g.fillStyle(c.color, 1);
      g.fillRoundedRect(bx - bw / 2, by - 18, bw, 36, 10);
      g.lineStyle(3, 0xffffff, 1);
      g.strokeRoundedRect(bx - bw / 2, by - 18, bw, 36, 10);
      this.badges[p].setPosition(bx, by).setText(c.locked ? `${c.label}✔` : c.label).setFontSize(c.locked ? 16 : 20);
    });
  }
}

function wrap(i: number, n: number): number {
  return (i + n) % n;
}

function shadeCss(n: number): string {
  return `#${shade(n, 0.5).toString(16).padStart(6, '0')}`;
}
