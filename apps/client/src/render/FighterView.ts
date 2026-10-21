import Phaser from 'phaser';
import {
  FIGHTERS, currentMove, hurtboxRect, activeHitboxes, hitboxRect,
  type FighterState, type GameEvent,
} from '@arena-rush/shared';
import { drawFighter } from './art';
import { computePose } from './pose';
import { FONT_DISPLAY } from '../theme';

/** Visual representation of one fighter. Reads FighterState; never mutates it. */
export class FighterView {
  /** Drawn behind the fighter: Naruto's shadow clone (visual only — never deals damage). */
  readonly cloneG: Phaser.GameObjects.Graphics;
  readonly g: Phaser.GameObjects.Graphics;
  /** Drawn on top: energy orbs, auras, webs. */
  readonly fxG: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text;
  readonly judgeText: Phaser.GameObjects.Text;
  private flash = 0;
  private flipT = -1;
  private tumble = false;
  private clock = 0;
  private shakeFrames = 0;
  private judgeShow = 0;
  private judgeValue = 0;

  /**
   * @param tag text above the fighter ("P1", "CPU")
   * @param alt use the alternate costume (another player already has this fighter).
   */
  constructor(
    scene: Phaser.Scene,
    private readonly playerIndex: number,
    tag: string,
    private readonly color: number,
    colorCss: string,
    private readonly alt = false,
  ) {
    this.cloneG = scene.add.graphics();
    this.g = scene.add.graphics();
    this.fxG = scene.add.graphics();
    this.label = scene.add.text(0, 0, tag, {
      fontFamily: FONT_DISPLAY,
      fontSize: '16px',
      color: colorCss,
      stroke: '#14112b',
      strokeThickness: 5,
    }).setOrigin(0.5, 1);
    this.judgeText = scene.add.text(0, 0, '', {
      fontFamily: FONT_DISPLAY,
      fontSize: '22px',
      color: '#141414',
    }).setOrigin(0.5).setVisible(false);
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.cloneG, this.g, this.fxG, this.label, this.judgeText];
  }

  onEvent(e: GameEvent): void {
    if (e.type === 'hit' && e.victim === this.playerIndex) {
      this.flash = 8;
      this.shakeFrames = 10;
      this.tumble = e.launchSpeed > 1100;
    } else if (e.type === 'jump' && e.id === this.playerIndex && e.double) {
      this.flipT = 0;
    } else if (e.type === 'judge' && e.id === this.playerIndex) {
      this.judgeValue = e.value;
      this.judgeShow = 60;
    } else if (e.type === 'respawn' && e.id === this.playerIndex) {
      this.tumble = false;
    }
  }

  /** Advance per-frame visual timers (called once per sim frame). */
  tick(): void {
    this.clock++;
    if (this.flash > 0) this.flash--;
    if (this.shakeFrames > 0) this.shakeFrames--;
    if (this.judgeShow > 0) this.judgeShow--;
    if (this.flipT >= 0) {
      this.flipT += 1 / 22;
      if (this.flipT >= 1) this.flipT = -1;
    }
  }

  private drawMoveEffects(f: FighterState, hand: { x: number; y: number }, x: number, y: number): void {
    const fx = this.fxG;
    const move = currentMove(f);
    const t = this.clock;
    if (f.webbed > 0) {
      // Restrained: web strands wrapped around the body.
      fx.lineStyle(2, 0xffffff, 0.9);
      const h = FIGHTERS[f.fighter].stats.height;
      for (let i = 0; i < 4; i++) {
        const yy = y - h * (0.2 + i * 0.2);
        fx.lineBetween(x - 22, yy - 6, x + 22, yy + 6);
        fx.lineBetween(x - 22, yy + 6, x + 22, yy - 6);
      }
      fx.strokeEllipse(x, y - h * 0.5, 50, h * 0.9);
    }
    if (!move || f.action !== 'attack') return;
    const ratio = move.charge ? Math.min(1, f.charge / move.charge.maxFrames) : 0;
    if (move.id === 'goku-kamehameha' && f.actionFrame < move.startup + move.active) {
      const r = 6 + Math.min(1, f.actionFrame / move.startup) * 6 + ratio * 12 + Math.sin(t * 0.6) * 1.5;
      fx.fillStyle(0x4fc3ff, 0.35);
      fx.fillCircle(hand.x, hand.y, r * 1.8);
      fx.fillStyle(0x9ae8ff, 0.8);
      fx.fillCircle(hand.x, hand.y, r);
      fx.fillStyle(0xffffff, 1);
      fx.fillCircle(hand.x, hand.y, r * 0.45);
    }
    if (move.id === 'goku-chargedstrike' && f.charge > 0 && f.actionFrame < move.startup) {
      const h = FIGHTERS[f.fighter].stats.height;
      fx.lineStyle(3, 0xffe066, 0.4 + ratio * 0.5);
      fx.strokeEllipse(x, y - h * 0.5, 54 + ratio * 26 + Math.sin(t * 0.8) * 4, h * 1.15 + ratio * 20);
    }
    if (move.id === 'naruto-rasengan' && f.actionFrame < move.startup + move.active) {
      const grow = Math.min(1, f.actionFrame / move.startup);
      const r = 4 + grow * 10;
      fx.fillStyle(0x6fc8ff, 0.4);
      fx.fillCircle(hand.x, hand.y, r * 1.6);
      fx.fillStyle(0xbfe9ff, 0.95);
      fx.fillCircle(hand.x, hand.y, r);
      fx.lineStyle(2, 0xffffff, 0.9);
      for (let k = 0; k < 3; k++) {
        const a = t * 0.5 + (k * Math.PI * 2) / 3;
        fx.beginPath();
        fx.arc(hand.x, hand.y, r * 0.75, a, a + 1.6);
        fx.strokePath();
      }
    }
  }

  draw(f: FighterState, debug = false): void {
    const g = this.g;
    g.clear();
    this.cloneG.clear();
    this.fxG.clear();
    const hidden = f.action === 'dead' || f.eliminated;
    this.label.setVisible(!hidden);
    if (hidden) {
      this.judgeText.setVisible(false);
      return;
    }
    if (f.action !== 'air') this.flipT = -1;
    if (f.action !== 'hitstun') this.tumble = false;

    const def = FIGHTERS[f.fighter];
    const move = currentMove(f);
    const pose = computePose({
      fighter: f.fighter,
      action: f.action,
      move,
      actionFrame: f.actionFrame,
      grounded: f.grounded,
      vx: f.vx,
      vy: f.vy + f.kby,
      runSpeed: def.stats.runSpeed,
      t: this.clock,
      flip: this.flipT,
      tumble: this.tumble,
      charge: move?.behavior?.type === 'rocket' ? f.charge / move.behavior.maxChargeFrames : 0,
      rocketLaunched: f.rocketLaunched,
    });

    let alpha = pose.alpha;
    if (f.invuln > 0 && Math.floor(this.clock / 4) % 2 === 0) alpha *= 0.45;
    let x = f.x;
    const y = f.y;
    if (f.hitstop > 0 && this.shakeFrames > 0) x += (this.clock % 2 === 0 ? 1 : -1) * 3;

    const color = this.color;

    // Respawn platform halo.
    if (f.action === 'respawning') {
      g.fillStyle(color, 0.35);
      g.fillEllipse(x, y + 6, 90, 22);
      g.lineStyle(3, 0xffffff, 0.9);
      g.strokeEllipse(x, y + 6, 90, 22);
      g.fillStyle(0xffffff, 0.12);
      g.fillTriangle(x - 45, y + 6, x + 45, y + 6, x, y + 120);
    }

    // Player color ground shadow ring.
    if (f.grounded) {
      g.fillStyle(0x000000, 0.18);
      g.fillEllipse(x, y + 2, def.stats.width * 1.5, 8);
    }

    // Naruto's Rasengan: a shadow clone appears behind him while the orb forms.
    if (move?.id === 'naruto-rasengan' && f.action === 'attack' && f.actionFrame < move.startup + 6) {
      const fade = f.actionFrame < move.startup ? Math.min(1, f.actionFrame / 5) : 1 - (f.actionFrame - move.startup) / 6;
      this.cloneG.setAlpha(0.45 * fade);
      drawFighter(this.cloneG, f.fighter, { ...pose, flip: false }, x - f.facing * 30, y, f.facing, 1, false, this.alt);
    }

    g.setAlpha(alpha);
    const res = drawFighter(g, f.fighter, pose, x, y, f.facing, 1, this.flash > 0 && this.flash % 4 < 2, this.alt);
    this.drawMoveEffects(f, res.handF, x, y);

    // Player tag arrow
    const tagY = res.top - 8;
    g.fillStyle(color, 1);
    g.fillTriangle(x - 7, tagY - 8, x + 7, tagY - 8, x, tagY);
    this.label.setPosition(x, tagY - 9);
    this.label.setAlpha(alpha < 0.2 ? 0.4 : 1);

    // Judge sign number
    if (res.propAnchor && f.judgeValue > 0) {
      this.judgeText.setText(String(f.judgeValue)).setPosition(res.propAnchor.x, res.propAnchor.y).setVisible(true);
    } else if (this.judgeShow > 0 && this.judgeValue > 0) {
      this.judgeText.setText(String(this.judgeValue)).setPosition(x, tagY - 36).setVisible(this.judgeShow > 30);
    } else {
      this.judgeText.setVisible(false);
    }

    if (debug) {
      g.setAlpha(1);
      const hb = hurtboxRect(f, def.stats);
      g.lineStyle(1.5, 0xffff00, 0.9);
      g.strokeRect(hb.x, hb.y, hb.w, hb.h);
      for (const box of activeHitboxes(f)) {
        const r = hitboxRect(f, box);
        g.fillStyle(0xff0000, 0.35);
        g.fillRect(r.x, r.y, r.w, r.h);
      }
    }
  }
}
