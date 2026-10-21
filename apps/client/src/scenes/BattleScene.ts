import Phaser from 'phaser';
import {
  createMatch, FIGHTERS, getStage, standings, stepMatch,
  type FighterState, type GameEvent, type MatchState, type StageCamera,
} from '@arena-rush/shared';
import { sound } from '../audio/sound';
import { CpuInputSource } from '../input/cpu';
import { KeyboardInputSource, P1_KEYS } from '../input/keyboard';
import type { InputSource } from '../input/source';
import { FIGHTER_UI_COLOR, shade } from '../render/art';
import { Backdrop, drawStage } from '../render/backdrop';
import { Effects } from '../render/effects';
import { FigureCache } from '../render/characters';
import { FighterView } from '../render/FighterView';
import { ProjectileView } from '../render/projectiles';
import { previewFrame } from '../anim/controller';
import { damageColor, FONT_BODY, GAME_HEIGHT, GAME_WIDTH, UI } from '../theme';
import { bodyText, displayText, installGlobalKeys, panel } from '../ui/widgets';
import { isAltCostume, slotColor, slotCss, slotDescription, slotLabel, type MatchSetup, type MatchSummary } from './types';

const STEP_MS = 1000 / 60;

interface HudCard {
  container: Phaser.GameObjects.Container;
  damage: Phaser.GameObjects.Text;
  stocks: Phaser.GameObjects.Graphics;

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
    this.match = createMatch(this.setup.players, { seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0, stage });
    // Every fighter is driven by an InputSource: the keyboard for the human, the CPU brain for the computer.
    this.sources = this.setup.players.map((slot, i): InputSource =>
      slot.control === 'cpu'
        ? new CpuInputSource(i, slot.difficulty, () => this.match, (Math.random() * 2 ** 32) >>> 0)
        : new KeyboardInputSource(P1_KEYS));

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
    this.timerText = add(displayText(this, GAME_WIDTH / 2, 38, '5:00', 32, '#ffffff', UI.inkCss, 0));
    add(bodyText(this, 16, 16, 'Esc pause · M mute', 13, 'rgba(255,255,255,0.65)', '500').setOrigin(0, 0));
    add(bodyText(this, GAME_WIDTH - 16, 16, 'YOU vs CPU', 13, 'rgba(255,255,255,0.65)', '900').setOrigin(1, 0));

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
      const tag = displayText(this, -118, -36, slotLabel(this.setup, i), 16, slotCss(this.setup, i), UI.inkCss, 5);
      const role = this.add.text(-50, -48 + 4, slotDescription(this.setup, i), {
        fontFamily: FONT_BODY, fontSize: '10px', fontStyle: '900', color: slotCss(this.setup, i),
      }).setOrigin(0, 0);
      const name = this.add.text(-50, -24, FIGHTERS[f.fighter].name.toUpperCase(), {
        fontFamily: FONT_BODY, fontSize: '14px', fontStyle: '900', color: '#ffffff',
      }).setOrigin(0, 0.5);
      const damage = displayText(this, 70, 8, '0%', 44, '#ffffff', UI.inkCss, 8);
      const stocks = this.add.graphics();
      const container = this.add.container(x, y, [bg, tag, role, name, stocks, damage]);
      add(container);
      this.cards.push({ container, damage, stocks, shownDamage: 0, shake: 0 });
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
    const secs = Math.ceil(this.match.timeLeft / 60);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    this.timerText.setText(`${m}:${s.toString().padStart(2, '0')}`);
    const urgent = secs <= 10 && this.match.phase === 'playing';
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
      for (let k = 0; k < this.match.rules.stocks; k++) {
        const filled = k < f.stocks;
        card.stocks.fillStyle(filled ? FIGHTER_UI_COLOR[f.fighter] : 0x000000, filled ? 1 : 0.3);
        card.stocks.fillCircle(-42 + k * 20, -6, 7);
        card.stocks.lineStyle(2, 0xffffff, filled ? 1 : 0.3);
        card.stocks.strokeCircle(-42 + k * 20, -6, 7);
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
    if (code === 'Escape' && this.match.phase !== 'ended') {
      this.paused = !this.paused;
      this.pauseOverlay.setVisible(this.paused);
      if (this.paused) sound.menuBack();
      else sound.menuSelect();
      this.acc = 0;
    } else if (code === 'Backquote') {
      this.debug = !this.debug;
    } else if (this.paused && code === 'KeyR') {
      this.scene.restart({ setup: this.setup });
    } else if (this.paused && code === 'KeyQ') {
      this.scene.start('Menu');
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
    const inputs = this.sources.map((s) => s.poll());
    const events = stepMatch(this.match, inputs);
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
      case 'jump':
        sound.jump(e.double);
        this.effects.dust(e.x, e.y, e.double ? 3 : 5);
        break;
      case 'land':
        sound.land();
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
        } else if (saberUser) sound.saber();
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
        if (!e.hit && e.kind !== 'batarang') this.effects.smoke(e.x, e.y, 4);
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
        sound.hit(e.launchSpeed);
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
      case 'eliminated':
        this.popup(`${slotLabel(this.setup, e.id)} OUT!`, 0, -260, slotCss(this.setup, e.id));
        break;
      case 'matchEnd':
        sound.gameSet();
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
  }
}
