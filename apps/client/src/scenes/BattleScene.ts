import Phaser from 'phaser';
import {
  createMatch, DUMMY_BEHAVIOR_LABEL, emptyInput, FIGHTERS, getStage, GRABS, shieldMax, standings, stepMatch, TRAINING_RULES,
  type GrabStyle,
  type FighterState, type GameEvent, type MatchState, type StageCamera,
} from '@arena-rush/shared';
import { music } from '../audio/music';
import { sound } from '../audio/sound';
import { stageTrack } from '../audio/tracks';
import { CpuInputSource } from '../input/cpu';
import { keyboard, KeyboardInputSource, P1_KEYS } from '../input/keyboard';
import type { InputSource } from '../input/source';
import { FIGHTER_UI_COLOR, shade } from '../render/art';
import { Backdrop, drawStage } from '../render/backdrop';
import { Effects } from '../render/effects';
import { FigureCache } from '../render/characters';
import { FighterView } from '../render/FighterView';
import { ProjectileView } from '../render/projectiles';
import { previewFrame } from '../anim/controller';
import { damageColor, FONT_BODY, GAME_HEIGHT, GAME_WIDTH, UI } from '../theme';
import { COMBO_WINDOWS, stepDamagePreset, TrainingSession } from '../training/session';
import { bodyText, displayText, installGlobalKeys, openOptionsPanel, panel, toast, type OptionsPanel } from '../ui/widgets';
import { isAltCostume, isTraining, slotColor, slotCss, slotDescription, slotLabel, type MatchSetup, type MatchSummary } from './types';

const STEP_MS = 1000 / 60;

/** Effect color per grab style (character throw identity). */
const GRAB_COLORS: Record<GrabStyle, number> = {
  flat: 0x222222, comedic: 0x3fbf5f, ninja: 0x7ef9ff, web: 0xffffff, martial: 0xffe9a8,
  clone: 0xff9a3b, ki: 0xffe066, mech: 0xff5fd2, force: 0xb36bff,
};
const THROW_SHORT: Record<string, string> = { forward: 'F-throw', back: 'B-throw', up: 'U-throw', down: 'D-throw' };

interface HudCard {
  container: Phaser.GameObjects.Container;
  damage: Phaser.GameObjects.Text;
  stocks: Phaser.GameObjects.Graphics;
  /** Shield meter, shown while the shield is up or not full. */
  shield: Phaser.GameObjects.Graphics;

  shownDamage: number;
  shake: number;
}

export class BattleScene extends Phaser.Scene {
  private setup!: MatchSetup;
  private match!: MatchState;
  private sources: InputSource[] = [];
  private views: FighterView[] = [];
  private effects!: Effects;
  private projectiles!: ProjectileView;
  private camBounds!: StageCamera;
  private backdrop!: Backdrop;
  private world!: Phaser.GameObjects.Layer;
  private hud!: Phaser.GameObjects.Layer;
  private hudCam!: Phaser.Cameras.Scene2D.Camera;
  private acc = 0;
  private paused = false;
  private debug = false;
  private endTimer = -1;
  private cam = { x: 0, y: -180, zoom: 1 };
  private frameCount = 0;

  private timerText!: Phaser.GameObjects.Text;
  private centerText!: Phaser.GameObjects.Text;
  private cards: HudCard[] = [];
  private offscreen!: Phaser.GameObjects.Graphics;
  private offscreenLabels: Phaser.GameObjects.Text[] = [];
  private pauseOverlay!: Phaser.GameObjects.Container;
  private popups: Phaser.GameObjects.Text[] = [];
  /** Training Mode only. */
  private training: TrainingSession | null = null;
  private trainingPanel: OptionsPanel | null = null;
  private trainingHud: {
    combo: Phaser.GameObjects.Text; detail: Phaser.GameObjects.Text; dummy: Phaser.GameObjects.Text;
    shield: Phaser.GameObjects.Text; throwInfo: Phaser.GameObjects.Text; recent: Phaser.GameObjects.Text;
  } | null = null;
  private comboWasActive = false;
  /** HUD portraits and off-screen bubbles, drawn with the same renderer as the match. */
  private hudFigures!: FigureCache;

  constructor() {
    super('Battle');
  }

  init(data: { setup: MatchSetup }): void {
    this.setup = data.setup;
  }

  create(): void {
    this.acc = 0;
    this.paused = false;
    this.endTimer = -1;
    this.frameCount = 0;
    this.cards = [];
    this.offscreenLabels = [];
    this.popups = [];

    const stage = getStage(this.setup.stage);
    this.camBounds = stage.camera;
    this.cam = { x: stage.camera.centerX, y: stage.camera.centerY, zoom: 1 };
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    const training = isTraining(this.setup);
    // Training uses the same simulation with unlimited stocks and no clock; versus rules are untouched.
    this.match = createMatch(this.setup.players, { seed, stage, rules: training ? TRAINING_RULES : undefined });
    // Every fighter is driven by an InputSource: the keyboard for the human, the CPU brain for the computer.
    // (In training the dummy is driven by the TrainingSession instead.)
    this.sources = this.setup.players.map((slot, i): InputSource =>
      slot.control === 'cpu'
        ? new CpuInputSource(i, slot.difficulty, () => this.match, (Math.random() * 2 ** 32) >>> 0)
        : slot.control === 'dummy'
          ? { poll: () => emptyInput() }
          : new KeyboardInputSource(P1_KEYS));
    this.trainingPanel = null;
    this.trainingHud = null;
    this.comboWasActive = false;
    this.training = training
      ? new TrainingSession(
        this.match,
        this.setup.players.findIndex((p) => p.control === 'human'),
        this.setup.players.findIndex((p) => p.control === 'dummy'),
        {},
        seed,
      )
      : null;

    this.world = this.add.layer();
    this.hud = this.add.layer();

    // The parallax backdrop is laid out relative to the camera scroll at the stage's default view.
    const sx0 = stage.camera.centerX - GAME_WIDTH / 2;
    const sy0 = stage.camera.centerY - GAME_HEIGHT / 2;
    this.backdrop = new Backdrop(this, sx0, sy0, stage.theme);
    this.world.add(this.backdrop.objects);
    this.world.add(drawStage(this, this.match.stage));
    this.views = this.match.fighters.map((f) => new FighterView(
      this, f.id, f.fighter, slotLabel(this.setup, f.id), slotColor(this.setup, f.id), slotCss(this.setup, f.id), isAltCostume(this.setup, f.id),
    ));
    for (const v of this.views) this.world.add(v.objects);
    this.projectiles = new ProjectileView(this);
    this.world.add(this.projectiles.g);
    this.effects = new Effects(this);
    this.world.add(this.effects.g);

    const main = this.cameras.main;
    main.centerOn(stage.camera.centerX, stage.camera.centerY);
    this.hudCam = this.cameras.add(0, 0, GAME_WIDTH, GAME_HEIGHT);
    main.ignore(this.hud);
    this.hudCam.ignore(this.world);
    this.events.on('ui-object', (o: Phaser.GameObjects.GameObject) => this.hud.add(o));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off('ui-object'));

    this.hudFigures = new FigureCache(this, (objs) => this.hud.add(objs));
    this.buildHud();
    main.fadeIn(250, 13, 11, 31);
    this.hudCam.fadeIn(250, 13, 11, 31);

    installGlobalKeys(this);
    music.duck(false);
    music.play(stageTrack(stage.id));
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKey(e.code));
  }

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------

  private buildHud(): void {
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.hud.add(o);
      return o;
    };

    add(panel(this, GAME_WIDTH / 2, 38, 150, 56, UI.ink, 0xffffff, 0.85, 14));
    this.timerText = add(displayText(this, GAME_WIDTH / 2, 38, this.training ? 'TRAINING' : '5:00', this.training ? 20 : 32, this.training ? '#7ef9a0' : '#ffffff', UI.inkCss, 0));
    add(bodyText(this, 16, 16, this.training ? 'Esc training menu · R reset positions · T reset dummy % · B dummy behavior · J grab · M mute' : 'Esc pause · J grab · M mute',
      13, 'rgba(255,255,255,0.65)', '500').setOrigin(0, 0));
    add(bodyText(this, GAME_WIDTH - 16, 16, this.training ? 'YOU vs DUMMY' : 'YOU vs CPU', 13, 'rgba(255,255,255,0.65)', '900').setOrigin(1, 0));
    if (this.training) this.buildTrainingHud(add);

    const n = this.match.fighters.length;
    this.match.fighters.forEach((f, i) => {
      const x = GAME_WIDTH / 2 + (i - (n - 1) / 2) * 310;
      const y = GAME_HEIGHT - 64;
      const color = slotColor(this.setup, i);
      const bg = this.add.graphics();
      bg.fillStyle(0x000000, 0.35);
      bg.fillRoundedRect(-136, -44, 280, 96, 18);
      bg.fillStyle(shade(color, 0.32), 0.95);
      bg.fillRoundedRect(-140, -48, 280, 96, 18);
      bg.lineStyle(4, color, 1);
      bg.strokeRoundedRect(-140, -48, 280, 96, 18);
      bg.fillStyle(UI.ink, 0.6);
      bg.fillCircle(-96, 0, 38);
      bg.lineStyle(3, 0xffffff, 0.9);
      bg.strokeCircle(-96, 0, 38);
      // The dummy's card already says TRAINING DUMMY, and a long tag would sit under the portrait.
      const label = slotLabel(this.setup, i);
      const tag = displayText(this, -118, -36, label.length > 3 ? '' : label, 16, slotCss(this.setup, i), UI.inkCss, 5);
      const role = this.add.text(-50, -48 + 4, slotDescription(this.setup, i), {
        fontFamily: FONT_BODY, fontSize: '10px', fontStyle: '900', color: slotCss(this.setup, i),
      }).setOrigin(0, 0);
      const name = this.add.text(-50, -24, FIGHTERS[f.fighter].name.toUpperCase(), {
        fontFamily: FONT_BODY, fontSize: '14px', fontStyle: '900', color: '#ffffff',
      }).setOrigin(0, 0.5);
      const damage = displayText(this, 70, 8, '0%', 44, '#ffffff', UI.inkCss, 8);
      const stocks = this.add.graphics();
      const shield = this.add.graphics();
      const container = this.add.container(x, y, [bg, tag, role, name, stocks, shield, damage]);
      add(container);
      this.cards.push({ container, damage, stocks, shield, shownDamage: 0, shake: 0 });
    });

    this.offscreen = add(this.add.graphics());
    this.match.fighters.forEach((_, i) => {
      this.offscreenLabels.push(add(displayText(this, 0, 0, slotLabel(this.setup, i), 13, '#ffffff', UI.inkCss, 4).setVisible(false)));
    });

    this.centerText = add(displayText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, '', 120, '#ffd23f', UI.inkCss, 16).setVisible(false));

    const dim = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0d0b1f, 0.7);
    const pt = displayText(this, 0, -60, 'PAUSED', 72, '#ffd23f');
    const ph = bodyText(this, 0, 30, 'Esc  resume     ·     R  restart     ·     Q  quit to menu', 20, '#ffffff', '700');
    this.pauseOverlay = add(this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2, [dim, pt, ph]).setVisible(false));
  }

  private buildTrainingHud(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T): void {
    const x = 16;
    const y = 46;
    const bg = add(this.add.graphics());
    bg.fillStyle(UI.ink, 0.55);
    bg.fillRoundedRect(x - 6, y - 6, 340, 166, 12);
    const combo = add(displayText(this, x + 4, y + 16, '', 26, '#ffd23f', UI.inkCss, 6).setOrigin(0, 0.5));
    const detail = add(bodyText(this, x + 4, y + 44, '', 13, '#ffffff', '700').setOrigin(0, 0.5));
    const dummy = add(bodyText(this, x + 4, y + 66, '', 13, '#ffffff', '700').setOrigin(0, 0.5));
    const shield = add(bodyText(this, x + 4, y + 88, '', 13, '#7ee0ff', '700').setOrigin(0, 0.5));
    const throwInfo = add(bodyText(this, x + 4, y + 110, '', 13, '#ffd2a8', '700').setOrigin(0, 0.5));
    const recent = add(bodyText(this, x + 4, y + 134, '', 12, '#b9b4e6', '700').setOrigin(0, 0.5));
    this.trainingHud = { combo, detail, dummy, shield, throwInfo, recent };
  }

  private updateTrainingHud(): void {
    const t = this.training;
    const h = this.trainingHud;
    if (!t || !h) return;
    const c = t.combo;
    const on = t.settings.comboCounter;
    h.combo.setVisible(on).setText(c.hits > 0 ? `${c.hits} HIT${c.hits === 1 ? '' : 'S'}` : 'COMBO —');
    h.combo.setColor(c.active ? '#ffd23f' : '#b9b4e6');
    h.detail.setVisible(on).setText(`Combo ${c.damage.toFixed(1)}%  ·  Last hit ${c.lastDamage.toFixed(1)}%  ·  Best ${c.best}`);
    const d = this.match.fighters[t.dummyId];
    h.dummy.setText(`Dummy ${FIGHTERS[d.fighter].name} ${Math.round(d.damage)}%  ·  ${DUMMY_BEHAVIOR_LABEL[t.settings.behavior]}`);
    const p = this.match.fighters[t.playerId];
    const shieldText = (f: FighterState) => (f.action === 'shieldBreak' ? 'BROKEN' : `${Math.round((f.shieldHp / shieldMax(this.match.rules, f)) * 100)}%`);
    const ledgeText = (f: FighterState) => (f.action === 'ledge' ? ' ⟂ledge' : '');
    h.shield.setText(`Shield: you ${shieldText(p)}${ledgeText(p)} · dummy ${shieldText(d)}${ledgeText(d)}`);
    const lt = t.lastThrow;
    h.throwInfo.setText(lt
      ? `Last throw (${lt.by}): ${THROW_SHORT[lt.dir]} ${lt.damage}% → ${Math.round(lt.launch)} px/s at ${Math.round(lt.percent)}%`
      : 'Last throw: —  (J grab · A/D/W/S throw)');
    h.recent.setText(t.recent.length ? `You: ${t.recent.join(' › ')}` : 'You: —');
    // Celebrate a finished combo of 2+ hits.
    if (on && this.comboWasActive && !c.active && c.hits >= 2) this.popup(`${c.hits} HIT COMBO!`, d.x, d.y - 120, '#ffd23f');
    this.comboWasActive = c.active;
  }

  private openTrainingMenu(): void {
    const t = this.training;
    if (!t || this.trainingPanel) return;
    this.paused = true;
    t.paused = true;
    music.duck(true);
    let entry: string | null = null;
    const onOff = (v: boolean) => (v ? 'ON' : 'OFF');
    this.trainingPanel = openOptionsPanel(this, {
      title: 'TRAINING',
      width: 680,
      rowH: 34,
      rows: [
        {
          label: 'DUMMY BEHAVIOR',
          value: () => `◀  ${DUMMY_BEHAVIOR_LABEL[t.settings.behavior]}  ▶`,
          adjust: (d) => t.cycleBehavior(d),
        },
        {
          label: 'DUMMY DAMAGE',
          value: () => (entry !== null ? `${entry || '0'}_ %` : `◀  ${Math.round(t.dummyDamage)}%  ▶`),
          adjust: (d) => {
            entry = null;
            t.setDummyDamage(stepDamagePreset(Math.round(t.dummyDamage), d));
          },
          // Type any value 0–999; it applies as you type.
          onKey: (e) => {
            const digit = /^(?:Digit|Numpad)(\d)$/.exec(e.code)?.[1];
            if (digit !== undefined) {
              entry = ((entry ?? '') + digit).replace(/^0+(?=\d)/, '').slice(0, 3);
              t.setDummyDamage(Number(entry));
              sound.menuMove();
              return true;
            }
            if (e.code === 'Backspace' && entry !== null) {
              entry = entry.slice(0, -1);
              t.setDummyDamage(Number(entry || 0));
              return true;
            }
            if (entry !== null && e.code !== 'ArrowLeft' && e.code !== 'ArrowRight' && e.code !== 'KeyA' && e.code !== 'KeyD') entry = null;
            return false;
          },
        },
        { label: 'RESET DUMMY DAMAGE', value: () => 'Enter', valueColor: () => UI.muted, press: () => t.resetDummyDamage() },
        {
          label: 'DUMMY SHIELD',
          value: () => `◀  ${Math.round(t.dummyShieldPercent)}%  ▶`,
          adjust: (d) => t.cycleDummyShield(d),
        },
        {
          label: 'DUMMY THROW (Attempt Grab)',
          value: () => `◀  ${t.dummyThrow[0].toUpperCase()}${t.dummyThrow.slice(1)}  ▶`,
          adjust: (d) => t.cycleDummyThrow(d),
        },
        {
          label: 'DUMMY GRAB ESCAPE',
          value: () => (t.dummyEscapeMash ? 'Mash' : 'Off (passive)'),
          press: () => t.toggleDummyEscape(),
          adjust: () => t.toggleDummyEscape(),
        },
        { label: 'LEDGE: HANG DUMMY', value: () => 'Enter', valueColor: () => UI.muted, press: () => t.hangOnLedge('dummy') },
        { label: 'LEDGE: HANG ME', value: () => 'Enter', valueColor: () => UI.muted, press: () => t.hangOnLedge('player') },
        { label: 'RESET POSITIONS', value: () => 'Enter', valueColor: () => UI.muted, press: () => this.resetTrainingPositions(false) },
        {
          label: 'COMBO COUNTER',
          value: () => onOff(t.settings.comboCounter),
          press: () => { t.settings.comboCounter = !t.settings.comboCounter; },
          adjust: () => { t.settings.comboCounter = !t.settings.comboCounter; },
        },
        {
          label: 'COMBO WINDOW',
          value: () => `◀  ${COMBO_WINDOWS[t.settings.comboWindow].label}  ▶`,
          adjust: (d) => t.setComboWindow(t.settings.comboWindow + d),
        },
        {
          label: 'HITBOXES',
          value: () => onOff(this.debug),
          press: () => this.setHitboxes(!this.debug),
          adjust: () => this.setHitboxes(!this.debug),
        },
        { label: 'RESUME', press: () => this.trainingPanel?.close() },
        { label: 'CHANGE FIGHTERS', press: () => this.leaveTraining('Select') },
        { label: 'EXIT TO MAIN MENU', press: () => this.leaveTraining('Menu') },
      ],
      hint: 'W/S choose · A/D change · type digits for a custom % · Enter select · Esc resume',
      onClose: () => {
        this.trainingPanel = null;
        this.paused = false;
        t.paused = false;
        this.acc = 0;
        keyboard.flush();
        music.duck(false);
      },
    });
  }

  private setHitboxes(on: boolean): void {
    this.debug = on;
    if (this.training) this.training.settings.hitboxes = on;
  }

  private resetTrainingPositions(announce = true): void {
    if (!this.training) return;
    this.training.resetPositions();
    this.comboWasActive = false;
    this.cameras.main.flash(120, 255, 255, 255);
    sound.respawn();
    if (announce) toast(this, 'POSITIONS RESET');
  }

  private leaveTraining(scene: 'Menu' | 'Select'): void {
    music.duck(false);
    this.scene.start(scene, scene === 'Select' ? { previous: this.setup } : {});
  }

  private showCenter(text: string, color: string, duration = 700, size = 120): void {
    const t = this.centerText;
    this.tweens.killTweensOf(t);
    t.setText(text).setColor(color).setFontSize(size).setVisible(true).setAlpha(1).setScale(1.8);
    this.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'Back.out' });
    if (duration > 0) {
      this.tweens.add({ targets: t, alpha: 0, delay: duration, duration: 250, onComplete: () => t.setVisible(false) });
    }
  }

  private popup(text: string, x: number, y: number, color: string): void {
    const t = displayText(this, x, y, text, 22, color, UI.inkCss, 6);
    this.world.add(t);
    this.popups.push(t);
    this.tweens.add({
      targets: t, y: y - 50, alpha: 0, duration: 900, ease: 'Cubic.out',
      onComplete: () => {
        t.destroy();
        this.popups = this.popups.filter((p) => p !== t);
      },
    });
  }

  private updateHud(): void {
    this.updateTrainingHud();
    const secs = Math.ceil(this.match.timeLeft / 60);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (!this.training) this.timerText.setText(`${m}:${s.toString().padStart(2, '0')}`);
    const urgent = secs <= 10 && this.match.phase === 'playing' && this.match.rules.timed;
    this.timerText.setColor(urgent ? '#ff4d5e' : '#ffffff');
    this.timerText.setScale(urgent ? 1 + Math.max(0, Math.sin(this.frameCount * 0.2)) * 0.12 : 1);

    this.match.fighters.forEach((f, i) => {
      const card = this.cards[i];
      // Count up smoothly toward the real damage.
      card.shownDamage += (f.damage - card.shownDamage) * 0.35;
      if (Math.abs(f.damage - card.shownDamage) < 0.5) card.shownDamage = f.damage;
      const shown = Math.round(card.shownDamage);
      card.damage.setText(f.eliminated ? 'OUT' : `${shown}%`);
      card.damage.setColor(damageColor(shown));
      const jitter = card.shake > 0 ? (Math.random() - 0.5) * card.shake : 0;
      card.damage.setPosition(70 + jitter, 8 + (card.shake > 0 ? (Math.random() - 0.5) * card.shake : 0));
      if (card.shake > 0) card.shake *= 0.85;
      if (card.shake < 0.3) card.shake = 0;
      card.container.setAlpha(f.eliminated ? 0.45 : 1);

      card.stocks.clear();
      for (let k = 0; k < (this.match.rules.infiniteStocks ? 0 : this.match.rules.stocks); k++) {
        const filled = k < f.stocks;
        card.stocks.fillStyle(filled ? FIGHTER_UI_COLOR[f.fighter] : 0x000000, filled ? 1 : 0.3);
        card.stocks.fillCircle(-42 + k * 20, -6, 7);
        card.stocks.lineStyle(2, 0xffffff, filled ? 1 : 0.3);
        card.stocks.strokeCircle(-42 + k * 20, -6, 7);
      }

      // Shield meter (only when relevant: shielding, broken, or still regenerating).
      const max = shieldMax(this.match.rules, f);
      const ratio = Math.max(0, Math.min(1, f.shieldHp / max));
      card.shield.clear();
      if (!f.eliminated && (ratio < 0.999 || f.action === 'shield')) {
        const broken = f.action === 'shieldBreak';
        card.shield.fillStyle(0x000000, 0.45);
        card.shield.fillRoundedRect(-50, 36, 180, 7, 3);
        card.shield.fillStyle(broken ? 0xff3b3b : ratio < 0.3 ? 0xff7a3b : ratio < 0.6 ? 0xffb347 : 0x7ee0ff, 1);
        if (ratio > 0) card.shield.fillRoundedRect(-50, 36, Math.max(7, 180 * ratio), 7, 3);
      }

      const frame = previewFrame(f.fighter, f.action === 'hitstun' ? 'hit' : 'idle', f.action === 'hitstun' ? 0 : this.frameCount);
      this.hudFigures.draw(f.fighter, frame, card.container.x - 96, card.container.y + 30, 1, 0.75, {
        alt: isAltCostume(this.setup, i), slot: `card${i}`, alpha: f.eliminated ? 0.45 : 1,
      });
    });
  }

  private updateOffscreen(): void {
    const g = this.offscreen;
    g.clear();
    const wv = this.cameras.main.worldView;
    this.match.fighters.forEach((f, i) => {
      const label = this.offscreenLabels[i];
      const visible = f.action !== 'dead' && !f.eliminated;
      const inside = f.x > wv.x && f.x < wv.right && f.y > wv.y + 40 && f.y - 60 < wv.bottom;
      if (!visible || inside) {
        label.setVisible(false);
        return;
      }
      const sx = Phaser.Math.Clamp(((f.x - wv.x) / wv.width) * GAME_WIDTH, 46, GAME_WIDTH - 46);
      const sy = Phaser.Math.Clamp(((f.y - 30 - wv.y) / wv.height) * GAME_HEIGHT, 46, GAME_HEIGHT - 150);
      g.fillStyle(0x000000, 0.35);
      g.fillCircle(sx + 3, sy + 4, 36);
      g.fillStyle(0xffffff, 0.92);
      g.fillCircle(sx, sy, 36);
      g.lineStyle(5, slotColor(this.setup, i), 1);
      g.strokeCircle(sx, sy, 36);
      const frame = previewFrame(f.fighter, f.action === 'hitstun' ? 'hit' : 'idle', f.action === 'hitstun' ? 0 : this.frameCount);
      this.hudFigures.draw(f.fighter, frame, sx, sy + 24, f.facing, 0.5, { alt: isAltCostume(this.setup, i), slot: `bubble${i}` });
      label.setPosition(sx, sy - 44).setVisible(true).setColor(slotCss(this.setup, i));
    });
  }

  // ---------------------------------------------------------------------------
  // Input / flow
  // ---------------------------------------------------------------------------

  private onKey(code: string): void {
    if (this.training) {
      this.onTrainingKey(code);
      return;
    }
    if (code === 'Escape' && this.match.phase !== 'ended') {
      this.paused = !this.paused;
      this.pauseOverlay.setVisible(this.paused);
      if (this.paused) sound.menuBack();
      else sound.menuSelect();
      music.duck(this.paused);
      this.acc = 0;
    } else if (code === 'Backquote') {
      this.debug = !this.debug;
    } else if (this.paused && code === 'KeyR') {
      this.scene.restart({ setup: this.setup });
    } else if (this.paused && code === 'KeyQ') {
      music.duck(false);
      this.scene.start('Menu', {});
    }
  }

  private onTrainingKey(code: string): void {
    const t = this.training!;
    if (this.trainingPanel) return; // the panel handles its own keys (including Esc to close)
    if (code === 'Escape') this.openTrainingMenu();
    else if (code === 'Backquote') this.setHitboxes(!this.debug);
    else if (code === 'KeyR') this.resetTrainingPositions();
    else if (code === 'KeyT') {
      t.resetDummyDamage();
      sound.menuSelect();
      toast(this, 'DUMMY DAMAGE 0%');
    } else if (code === 'KeyB') {
      const b = t.cycleBehavior(1);
      sound.menuMove();
      toast(this, `DUMMY: ${DUMMY_BEHAVIOR_LABEL[b].toUpperCase()}`);
    }
  }

  private finish(): void {
    const m = this.match;
    const summary: MatchSummary = {
      setup: this.setup,
      winner: m.winner,
      reason: m.endReason ?? 'stocks',
      durationFrames: m.frame,
      ranking: standings(m).map((f) => f.id),
      results: m.fighters.map((f) => ({ fighter: f.fighter, stocks: f.stocks, damage: f.damage, stats: { ...f.stats } })),
    };
    this.cameras.main.fadeOut(300, 255, 255, 255);
    this.hudCam.fadeOut(300, 255, 255, 255);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('Results', summary));
  }

  // ---------------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------------

  update(_time: number, delta: number): void {
    if (!this.paused) {
      this.acc += Math.min(delta, 250);
      while (this.acc >= STEP_MS) {
        this.acc -= STEP_MS;
        this.tick();
      }
    }
    for (let i = 0; i < this.views.length; i++) this.views[i].draw(this.match.fighters[i], this.debug);
    this.projectiles.draw(this.match.projectiles, this.frameCount);
    this.effects.draw();
    this.updateCamera();
    this.hudFigures.begin();
    this.updateHud();
    this.updateOffscreen();
    this.hudFigures.end();
  }

  private tick(): void {
    this.frameCount++;
    const events = this.training
      ? this.training.step(this.sources[this.training.playerId].poll())
      : stepMatch(this.match, this.sources.map((s) => s.poll()));
    for (const e of events) this.handleEvent(e);
    this.views.forEach((v, i) => v.tick(this.match.fighters[i]));
    this.effects.tick();
    this.backdrop.update();

    for (const f of this.match.fighters) this.ambientEffects(f);

    if (this.endTimer > 0 && --this.endTimer === 0) this.finish();
  }

  private ambientEffects(f: FighterState): void {
    if (f.action === 'dead' || f.eliminated) return;
    const kb = Math.hypot(f.kbx, f.kby);
    if (f.action === 'hitstun' && kb > 500 && f.hitstop === 0) {
      // Directional speed lines every frame, smoke puffs every other frame.
      const color = slotColor(this.setup, f.id);
      this.effects.streak(f.x + (Math.random() - 0.5) * 24, f.y - 35 + (Math.random() - 0.5) * 30, f.kbx + f.vx, f.kby + f.vy, kb > 1300 ? color : 0xffffff);
      if (this.frameCount % 2 === 0) this.effects.trail(f.x, f.y - 35, color, kb > 1300);
    }
    const move = f.move ? FIGHTERS[f.fighter].moves[f.move] : null;
    if (move?.behavior?.type === 'rocket' && f.action === 'attack') {
      if (f.rocketLaunched && f.actionFrame < move.startup + move.active) {
        if (f.misfire) {
          this.effects.fire(f.x - f.facing * 30, f.y - 40);
          this.effects.fire(f.x - f.facing * 40, f.y - 36);
        } else if (this.frameCount % 2 === 0) {
          this.effects.trail(f.x - f.facing * 30, f.y - 40, 0x2fb350, false);
        }
      } else if (!f.rocketLaunched && f.charge > 0 && this.frameCount % 8 === 0) {
        sound.charge();
        this.effects.dust(f.x, f.y, 1, -f.facing);
      }
    }
    if (move?.behavior?.type === 'vanish' && f.actionFrame === move.startup && f.hitstop === 0) {
      this.effects.burst(f.x, f.y - 38, 0x7ef9ff);
      this.effects.smoke(f.x, f.y - 38, 6);
    }
    if (f.fighter === 'gundam' && f.action === 'run' && f.grounded && this.frameCount % 14 === 0) sound.mechStep();
    if (f.action === 'run' && f.grounded && this.frameCount % 12 === 0) {
      this.effects.dust(f.x - f.facing * 10, f.y, 1, -f.facing);
    }
  }

  private handleEvent(e: GameEvent): void {
    for (const v of this.views) v.onEvent(e);
    const fighters = this.match.fighters;
    switch (e.type) {
      case 'countdown':
        if (e.value > 0) {
          sound.countdown();
          this.showCenter(String(e.value), '#ffffff', 600);
        } else {
          sound.go();
          this.showCenter('GO!', '#ffd23f', 500);
        }
        break;
      case 'grabWhiff':
        sound.grabWhiff();
        break;
      case 'grab': {
        const style = GRABS[fighters[e.grabber].fighter].style;
        sound.grabConnect();
        this.effects.burst(e.x, e.y, GRAB_COLORS[style]);
        if (style === 'web') {
          const g = fighters[e.grabber];
          this.effects.webLine(g.x + g.facing * 10, g.y - 50, e.x, e.y);
        }
        if (e.shielded) this.popup('SHIELD GRAB!', e.x, e.y - 90, '#b36bff');
        break;
      }
      case 'grabClash':
        sound.grabEscape();
        this.effects.burst(e.x, e.y, 0xffffff);
        break;
      case 'pummel':
        sound.pummel();
        this.effects.hit(e.x, e.y, 150, slotColor(this.setup, e.grabber));
        break;
      case 'throw': {
        const g = fighters[e.grabber];
        const style = GRABS[g.fighter].style;
        sound.throwSwing(style);
        const color = GRAB_COLORS[style];
        if (style === 'mech' || (e.dir === 'down' && style !== 'web')) {
          this.effects.landImpact(e.x, g.y, 900);
          this.cameras.main.shake(120, style === 'mech' ? 0.008 : 0.004);
        }
        if (style === 'web') this.effects.webLine(g.x, g.y - 50, e.x, e.y);
        else if (style === 'clone' || style === 'ninja') this.effects.smoke(e.x, e.y, 6);
        else if (style === 'comedic') this.effects.confetti(e.x - 40, e.y - 30, 80, [0x3fbf5f, 0xffffff, 0xff4d5e]);
        this.effects.burst(e.x, e.y, color);
        break;
      }
      case 'grabEscape':
        sound.grabEscape();
        this.effects.smoke(e.x, e.y, 5);
        break;
      case 'ledgeGrab':
        sound.ledgeGrab();
        this.effects.ledgeSpark(e.x, e.y);
        break;
      case 'ledgeAction':
        if (e.kind === 'climb' || e.kind === 'roll') sound.ledgeClimb();
        break;
      case 'shield':
        if (e.up) sound.shieldUp();
        break;
      case 'shieldHit': {
        const v = fighters[e.victim];
        sound.shieldHit(e.health / shieldMax(this.match.rules, v));
        this.effects.burst(e.x, e.y, 0x7ee0ff);
        break;
      }
      case 'shieldBreak': {
        sound.shieldBreak();
        const f = fighters[e.id];
        this.effects.shieldShatter(e.x, e.y - FIGHTERS[f.fighter].stats.height * 0.5, slotColor(this.setup, e.id));
        this.cameras.main.shake(260, 0.01);
        this.cameras.main.flash(90, 255, 255, 255);
        this.popup('SHIELD BREAK!', e.x, e.y - 130, '#ff8a3b');
        break;
      }
      case 'jump':
        if (fighters[e.id].fighter === 'gundam') sound.thruster();
        else sound.jump(e.double);
        this.effects.dust(e.x, e.y, e.double ? 3 : 5);
        break;
      case 'land':
        sound.land(e.hard);
        if (e.hard) {
          this.effects.landImpact(e.x, e.y, 1000);
          this.cameras.main.shake(90, 0.003);
        } else {
          this.effects.dust(e.x, e.y, 3);
        }
        break;
      case 'attack': {
        const who = fighters[e.id].fighter;
        const saberUser = who === 'gundam' || who === 'vader';
        if (e.slot === 'special') {
          if (who === 'gnw') sound.special('judge');
          else if (who === 'goku') sound.beamCharge();
          else if (who === 'naruto') sound.rasengan();
          else if (who === 'vader') sound.choke();
        } else if (saberUser) sound.saber(e.slot === 'heavy');
        else if (e.slot === 'heavy') sound.heavy();
        else sound.light();
        break;
      }
      case 'projectile':
        if (e.kind === 'web') sound.web();
        else if (e.kind === 'batarang') sound.batarang();
        else if (e.kind === 'rifle') {
          sound.rifle();
          this.effects.burst(e.x, e.y, 0xff5fd2);
        }
        else {
          sound.beamFire(e.charge);
          this.cameras.main.shake(160 + e.charge * 200, 0.003 + e.charge * 0.004);
          this.effects.burst(e.x, e.y, 0x6fd8ff);
        }
        break;
      case 'projectileEnd':
        if (!e.hit && e.kind !== 'batarang') {
          this.effects.smoke(e.x, e.y, 4);
          sound.fizzle();
        }
        break;
      case 'webzip': {
        sound.webzip();
        const f = fighters[e.id];
        this.effects.webLine(f.x, f.y - 60, e.anchorX, e.anchorY);
        break;
      }
      case 'judge': {
        sound.judgeNumber(e.value);
        const f = fighters[e.id];
        this.popup(`${e.value}`, f.x, f.y - 110, e.value === 9 ? '#ffd23f' : e.value === 1 ? '#ff6f6f' : '#ffffff');
        break;
      }
      case 'rocket': {
        sound.special('rocket');
        const f = fighters[e.id];
        if (e.misfire) {
          this.popup('MISFIRE!', f.x, f.y - 110, '#ff8a1f');
          this.cameras.main.shake(200, 0.006);
        }
        this.effects.dust(f.x, f.y, 6, -f.facing);
        break;
      }
      case 'vanish':
        sound.special('vanish');
        this.effects.smoke(e.fromX, e.fromY - 38, 12);
        break;
      case 'dodge':
        sound.dodge();
        break;
      case 'hit': {
        sound.hit(e.launchSpeed, `${e.attacker}>${e.victim}`);
        if (e.launchSpeed > 1300) sound.launch(e.launchSpeed);
        this.effects.hit(e.x, e.y, e.launchSpeed, slotColor(this.setup, e.attacker), e.launchX, e.launchY);
        // Shake only for heavier hits, and keep it subtle so the action stays readable.
        const strength = Math.min(1, e.launchSpeed / 2000);
        if (strength > 0.35) this.cameras.main.shake(60 + strength * 160, 0.002 + strength * 0.005);
        this.cards[e.victim].shake = 6 + strength * 18;
        break;
      }
      case 'ko': {
        sound.ko();
        const color = slotColor(this.setup, e.id);
        this.effects.ko(e.x, e.y, color, 0, -200);
        this.cameras.main.shake(380, 0.012);
        this.cameras.main.flash(120, 255, 255, 255);
        this.cards[e.id].shake = 30;
        break;
      }
      case 'respawn':
        sound.respawn();
        break;
      case 'eliminated':
        this.popup(`${slotLabel(this.setup, e.id)} OUT!`, 0, -260, slotCss(this.setup, e.id));
        break;
      case 'matchEnd':
        sound.gameSet();
        music.stop(1.2);
        this.showCenter(e.reason === 'time' ? 'TIME!' : 'GAME!', '#ffffff', 0, 140);
        this.endTimer = 150;
        break;
      default:
        break;
    }
  }

  private updateCamera(): void {
    const main = this.cameras.main;
    const alive = this.match.fighters.filter((f) => f.action !== 'dead' && !f.eliminated);
    const cb = this.camBounds;
    let tx = cb.centerX;
    let ty = cb.centerY;
    let tz = 1;
    if (alive.length > 0 && this.match.phase !== 'countdown') {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const f of alive) {
        minX = Math.min(minX, f.x);
        maxX = Math.max(maxX, f.x);
        minY = Math.min(minY, f.y - 80);
        maxY = Math.max(maxY, f.y);
      }
      // Always keep the middle of the stage loosely framed.
      minX = Math.min(minX, cb.centerX - 300);
      maxX = Math.max(maxX, cb.centerX + 300);
      maxY = Math.max(maxY, 40);
      const spanX = maxX - minX + 420;
      const spanY = maxY - minY + 360;
      tz = Phaser.Math.Clamp(Math.min(GAME_WIDTH / spanX, GAME_HEIGHT / spanY), cb.minZoom, cb.maxZoom);
      tx = Phaser.Math.Clamp((minX + maxX) / 2, cb.minX, cb.maxX);
      ty = Phaser.Math.Clamp((minY + maxY) / 2 + 40, cb.minY, cb.maxY);
    }
    const k = 0.08;
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.cam.zoom += (tz - this.cam.zoom) * k;
    main.setZoom(this.cam.zoom);
    main.centerOn(this.cam.x, this.cam.y);
    this.backdrop.setZoom(this.cam.zoom);
  }
}
