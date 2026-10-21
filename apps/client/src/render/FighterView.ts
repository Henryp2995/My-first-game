import Phaser from 'phaser';
import {
  DEFAULT_RULES, FIGHTERS, GRABS, activeGrabBox, currentMove, hurtboxRect, activeHitboxes, hitboxRect,
  type FighterState, type GameEvent,
} from '@arena-rush/shared';
import { AnimationController, type AnimFrame } from '../anim/controller';
import { drawFighter } from './art';
import { createCharacterRenderer, type CharacterRenderer } from './characters';
import { FONT_DISPLAY } from '../theme';

/** Swing-trail colors: blades glow in their own color; everything else leaves a white smear. */
const TRAIL_COLORS: Partial<Record<string, number>> = { gundam: 0xff5fd2, vader: 0xff2a2a, goku: 0xffe066, naruto: 0x9ad8ff };

/**
 * Visual representation of one fighter. An AnimationController turns combat state into animation
 * frames; a CharacterRenderer (procedural art or sprites) draws them. Reads FighterState only.
 */
export class FighterView {
  /** Shadows, respawn halo and Naruto's shadow clone (visual only — never deals damage). */
  readonly backG: Phaser.GameObjects.Graphics;
  /** Translucent layer for the shadow clone. */
  readonly cloneG: Phaser.GameObjects.Graphics;
  readonly character: CharacterRenderer;
  /** Drawn on top: swing trails, energy orbs, auras, webs, debug boxes. */
  readonly fxG: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text;
  readonly judgeText: Phaser.GameObjects.Text;
  readonly anim: AnimationController;
  private frame: AnimFrame | null = null;
  private flash = 0;
  private clock = 0;
  private shakeFrames = 0;
  private judgeShow = 0;
  private judgeValue = 0;
  private trail: { x: number; y: number }[] = [];
  /** Frames left of the white flash on the shield bubble after a blocked hit. */
  private shieldFlash = 0;

  /**
   * @param tag text above the fighter ("P1", "CPU")
   * @param alt use the alternate costume (another player already has this fighter).
   */
  constructor(
    scene: Phaser.Scene,
    private readonly playerIndex: number,
    private readonly fighter: FighterState['fighter'],
    tag: string,
    private readonly color: number,
    colorCss: string,
    private readonly alt = false,
  ) {
    this.anim = new AnimationController(fighter, playerIndex);
    this.backG = scene.add.graphics();
    this.cloneG = scene.add.graphics();
    this.character = createCharacterRenderer(scene, fighter, alt);
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
    return [this.backG, this.cloneG, ...this.character.objects, this.fxG, this.label, this.judgeText];
  }

  /** The current animation state (for debugging and tests). */
  get animState(): AnimFrame['state'] | null {
    return this.frame?.state ?? null;
  }

  onEvent(e: GameEvent): void {
    this.anim.onEvent(e);
    if (e.type === 'hit' && e.victim === this.playerIndex) {
      this.flash = 8;
      this.shakeFrames = 10;
    } else if (e.type === 'shieldHit' && e.victim === this.playerIndex) {
      this.shieldFlash = 6;
    } else if (e.type === 'judge' && e.id === this.playerIndex) {
      this.judgeValue = e.value;
      this.judgeShow = 60;
    }
  }

  /** Advance animation and visual timers (once per 60 Hz sim frame). */
  tick(f: FighterState): void {
    this.clock++;
    if (this.flash > 0) this.flash--;
    if (this.shakeFrames > 0) this.shakeFrames--;
    if (this.judgeShow > 0) this.judgeShow--;
    if (this.shieldFlash > 0) this.shieldFlash--;
    this.frame = this.anim.update(f);
  }

  draw(f: FighterState, debug = false): void {
    const bg = this.backG;
    const fx = this.fxG;
    bg.clear();
    fx.clear();
    this.cloneG.clear();
    const frame = this.frame;
    if (!frame) {
      this.character.hide();
      this.label.setVisible(false);
      this.judgeText.setVisible(false);
      this.trail = [];
      return;
    }

    // KO: a final tumble where the fighter left the stage (drawn at the blast-zone edge).
    if (frame.ko) {
      this.label.setVisible(false);
      this.judgeText.setVisible(false);
      this.character.draw(frame, frame.ko.x, frame.ko.y, f.facing, { scale: 1 - frame.ko.t * 0.6, alpha: 1 - frame.ko.t });
      return;
    }

    this.label.setVisible(true);
    const def = FIGHTERS[f.fighter];
    const move = currentMove(f);
    let alpha = frame.pose.alpha;
    if (f.invuln > 0 && Math.floor(this.clock / 4) % 2 === 0) alpha *= 0.45;
    let x = f.x;
    const y = f.y;
    if (f.hitstop > 0 && this.shakeFrames > 0) x += (this.clock % 2 === 0 ? 1 : -1) * 3;

    // Respawn platform halo.
    if (f.action === 'respawning') {
      bg.fillStyle(this.color, 0.35);
      bg.fillEllipse(x, y + 6, 90, 22);
      bg.lineStyle(3, 0xffffff, 0.9);
      bg.strokeEllipse(x, y + 6, 90, 22);
      bg.fillStyle(0xffffff, 0.12);
      bg.fillTriangle(x - 45, y + 6, x + 45, y + 6, x, y + 120);
    }
    // Contact shadow (squashes with the body).
    if (f.grounded) {
      bg.fillStyle(0x000000, 0.2);
      bg.fillEllipse(x, y + 2, def.stats.width * 1.6 * frame.squashX, 9);
    }
    // Naruto's Rasengan: a shadow clone appears behind him while the orb forms (visual only).
    if (move?.id === 'naruto-rasengan' && f.action === 'attack' && f.actionFrame < move.startup + 6) {
      const fade = f.actionFrame < move.startup ? Math.min(1, f.actionFrame / 5) : 1 - (f.actionFrame - move.startup) / 6;
      this.cloneG.setAlpha(0.45 * fade);
      drawFighter(this.cloneG, f.fighter, { ...frame.pose, flip: false }, x - f.facing * 30, y, f.facing, 1, false, this.alt, frame);
    }

    const res = this.character.draw(frame, x, y, f.facing, {
      flash: this.flash > 0 && this.flash % 4 < 2,
      alpha,
    });

    this.drawTrail(frame, res.weaponTip ?? res.handF);
    this.drawMoveEffects(f, res.handF, x, y);
    this.drawShield(f, x, y);
    if (f.action === 'shieldBreak') this.drawDizzy(res.top, x);
    if (f.action === 'holding' && f.actionFrame >= DEFAULT_RULES.grab.holdInputDelay) this.drawThrowArrows(x, y - def.stats.height * 0.5);
    if (f.action === 'grabbed') this.drawEscapeMeter(f, x, res.top - 26);

    // Player tag arrow
    const tagY = res.top - 8;
    fx.fillStyle(this.color, 1);
    fx.fillTriangle(x - 7, tagY - 8, x + 7, tagY - 8, x, tagY);
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
      const hb = hurtboxRect(f, def.stats);
      fx.lineStyle(1.5, 0xffff00, 0.9);
      fx.strokeRect(hb.x, hb.y, hb.w, hb.h);
      for (const box of activeHitboxes(f)) {
        const r = hitboxRect(f, box);
        fx.fillStyle(0xff0000, 0.35);
        fx.fillRect(r.x, r.y, r.w, r.h);
      }
      // Grab box: outlined during startup, filled purple while active.
      const active = activeGrabBox(f);
      if (active) {
        fx.fillStyle(0xb36bff, 0.45);
        fx.fillRect(active.x, active.y, active.w, active.h);
      } else if (f.action === 'grab' && f.grabPartner === null) {
        const r = hitboxRect(f, { ...GRABS[f.fighter].box, damage: 0, baseKnockback: 0, knockbackGrowth: 0, angle: 0 });
        fx.lineStyle(1.5, 0xb36bff, 0.8);
        fx.strokeRect(r.x, r.y, r.w, r.h);
      }
    }
  }

  /**
   * Translucent shield bubble: shrinks with shield health, shifts from the player's color to red
   * when low, and flashes white when it blocks a hit. Visual only — the sim decides what's blocked.
   */
  private drawShield(f: FighterState, x: number, y: number): void {
    if (f.action !== 'shield') return;
    const s = FIGHTERS[f.fighter].stats;
    const max = s.shieldMax ?? DEFAULT_RULES.shield.maxHealth;
    const ratio = Math.max(0, Math.min(1, f.shieldHp / max));
    const r = s.height * 0.62 * (0.42 + 0.58 * ratio);
    const cy = y - s.height * 0.5;
    const low = ratio < 0.3;
    const color = low ? (Math.floor(this.clock / 5) % 2 === 0 ? 0xff3b3b : 0xff9a3b) : ratio < 0.6 ? 0xffb347 : this.color;
    const fx = this.fxG;
    fx.fillStyle(color, 0.22 + (1 - ratio) * 0.12);
    fx.fillCircle(x, cy, r);
    fx.lineStyle(3, color, 0.85);
    fx.strokeCircle(x, cy, r);
    fx.fillStyle(0xffffff, 0.35);
    fx.fillEllipse(x - r * 0.35, cy - r * 0.4, r * 0.5, r * 0.28);
    if (this.shieldFlash > 0) {
      fx.fillStyle(0xffffff, 0.12 * this.shieldFlash);
      fx.fillCircle(x, cy, r + 2);
    }
  }

  /** "Throw ready" hint: four arrows around a fighter holding someone. */
  private drawThrowArrows(x: number, cy: number): void {
    const fx = this.fxG;
    const pulse = 0.55 + Math.sin(this.clock * 0.25) * 0.35;
    const r = 58;
    fx.fillStyle(0xffffff, pulse);
    const tri = (ax: number, ay: number, dx: number, dy: number) => {
      const px = -dy;
      const py = dx;
      fx.fillTriangle(ax + dx * 9, ay + dy * 9, ax + px * 7, ay + py * 7, ax - px * 7, ay - py * 7);
    };
    tri(x + r, cy, 1, 0);
    tri(x - r, cy, -1, 0);
    tri(x, cy - r - 10, 0, -1);
    tri(x, cy + r - 10, 0, 1);
  }

  /** How close a grabbed fighter is to breaking free (fills as the hold runs out). */
  private drawEscapeMeter(f: FighterState, x: number, y: number): void {
    const fx = this.fxG;
    const left = Math.max(0, Math.min(1, f.grabTimer / DEFAULT_RULES.grab.holdMaxFrames));
    fx.fillStyle(0x000000, 0.55);
    fx.fillRoundedRect(x - 30, y, 60, 7, 3);
    fx.fillStyle(0xffd23f, 1);
    fx.fillRoundedRect(x - 30, y, Math.max(4, 60 * (1 - left)), 7, 3);
  }

  /** Stars circling the head during a shield-break stun. */
  private drawDizzy(top: number, x: number): void {
    const fx = this.fxG;
    for (let i = 0; i < 3; i++) {
      const a = this.clock * 0.12 + (i * Math.PI * 2) / 3;
      const sx = x + Math.cos(a) * 22;
      const sy = top - 4 + Math.sin(a) * 6;
      fx.fillStyle(0xffe14d, 1);
      fx.fillCircle(sx, sy, 4.5);
      fx.fillStyle(0xffffff, 1);
      fx.fillCircle(sx, sy, 2);
    }
  }

  /** Smear trail behind the striking hand / blade during an attack's active frames. */
  private drawTrail(frame: AnimFrame, tip: { x: number; y: number }): void {
    const swinging = frame.attackPhase === 'active' && ['light', 'heavy', 'aerial'].includes(frame.state);
    if (swinging) {
      this.trail.push({ ...tip });
      if (this.trail.length > 7) this.trail.shift();
    } else if (this.trail.length) {
      this.trail.shift();
    }
    if (this.trail.length < 2) return;
    const color = TRAIL_COLORS[this.fighter] ?? 0xffffff;
    const heavy = frame.state === 'heavy';
    for (let i = 1; i < this.trail.length; i++) {
      const k = i / this.trail.length;
      this.fxG.lineStyle((heavy ? 12 : 6) * k, color, 0.5 * k);
      this.fxG.lineBetween(this.trail[i - 1].x, this.trail[i - 1].y, this.trail[i].x, this.trail[i].y);
    }
  }

  private drawMoveEffects(f: FighterState, hand: { x: number; y: number }, x: number, y: number): void {
    const fx = this.fxG;
    const move = currentMove(f);
    const t = this.clock;
    if (f.restrained > 0 && f.restrainKind === 'force') {
      // Force Choke: dark-red grip at the throat, pulsing aura, dangling.
      const h = FIGHTERS[f.fighter].stats.height;
      const pulse = 0.5 + Math.sin(t * 0.4) * 0.3;
      fx.fillStyle(0x6a0010, 0.18 * pulse + 0.1);
      fx.fillEllipse(x, y - h * 0.5, 64, h * 1.1);
      fx.lineStyle(3, 0xff3355, pulse);
      fx.strokeEllipse(x, y - h * 0.78, 26, 9);
      fx.lineStyle(1.5, 0xff8899, 0.6);
      for (let k = 0; k < 3; k++) {
        const a = t * 0.3 + k * 2.1;
        fx.lineBetween(x + Math.cos(a) * 30, y - h * 0.5 + Math.sin(a) * 40, x + Math.cos(a) * 18, y - h * 0.5 + Math.sin(a) * 24);
      }
    }
    if (f.restrained > 0 && f.restrainKind === 'web') {
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
    if (move.id === 'vader-choke' && f.actionFrame >= move.startup - 6 && f.actionFrame < move.startup + move.active + 8) {
      // The Force gathers in his outstretched hand.
      const r = 7 + Math.sin(t * 0.5) * 2;
      fx.fillStyle(0xff2a44, 0.25);
      fx.fillCircle(hand.x, hand.y, r * 2.2);
      fx.lineStyle(2, 0xff5566, 0.7);
      fx.strokeCircle(hand.x, hand.y, r + ((t * 2) % 14));
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
}
