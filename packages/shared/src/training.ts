/**
 * Training Mode: rules, the training dummy's behaviour, combo tracking and practice helpers.
 *
 * Everything here drives the *normal* simulation — the dummy only produces InputFrames, and the
 * helpers only edit match state between steps — so movement, damage, knockback, hitstun and
 * specials are exactly the real game's. Nothing in here is used by versus / online matches.
 */
import { makeRules, type RulesConfig } from './config';
import { CpuController } from './cpu';
import { emptyInput, makeInput, type InputFrame } from './input';
import { createFighter, currentMove, isActionable, type FighterState, type GameEvent, type MatchState } from './match';

/** Unlimited stocks, no clock, no countdown — the match never ends on its own. */
export const TRAINING_RULES: RulesConfig = makeRules({ infiniteStocks: true, timed: false, countdownFrames: 0 });

export type DummyBehavior = 'stand' | 'jump' | 'defend' | 'attack' | 'cpu';
export const DUMMY_BEHAVIORS: DummyBehavior[] = ['stand', 'jump', 'defend', 'attack', 'cpu'];
export const DUMMY_BEHAVIOR_LABEL: Record<DummyBehavior, string> = {
  stand: 'Stand Still',
  jump: 'Jump',
  defend: 'Defend',
  attack: 'Attack',
  cpu: 'Normal CPU',
};

/** Frames between the dummy's periodic actions. */
const JUMP_EVERY = 80;
const ATTACK_EVERY = 70;
/** How close the player must be before the Attack dummy swings (it never walks over). */
const ATTACK_REACH_X = 190;
const ATTACK_REACH_Y = 110;
/** Defend: react to attacks / projectiles inside this range. */
const THREAT_RANGE = 170;

/**
 * Training-only brain for the dummy. Separate from the versus CpuController; the "Normal CPU"
 * behaviour simply wraps a fresh CpuController.
 */
export class TrainingDummyController {
  private clock = 0;
  private queue: Partial<InputFrame>[] = [];
  private cpu: CpuController | null = null;
  private heavyNext = false;
  private _behavior: DummyBehavior = 'stand';

  constructor(readonly id: number, behavior: DummyBehavior = 'stand', private readonly seed = 0x7a11) {
    this.setBehavior(behavior);
  }

  get behavior(): DummyBehavior {
    return this._behavior;
  }

  setBehavior(b: DummyBehavior): void {
    this._behavior = b;
    this.clock = 0;
    this.queue = [];
    this.cpu = b === 'cpu' ? new CpuController(this.id, 'normal', this.seed) : null;
  }

  decide(m: MatchState): InputFrame {
    this.clock++;
    if (this.cpu) return this.cpu.decide(m);
    const me = m.fighters[this.id];
    if (m.phase !== 'playing' || !me || me.eliminated || me.action === 'dead' || me.action === 'respawning') {
      this.queue = [];
      return emptyInput();
    }
    // Being hit cancels whatever it was about to do.
    if (me.action === 'hitstun') this.queue = [];
    if (this.queue.length === 0) this.plan(m, me);
    const next = this.queue.shift();
    return next ? makeInput(next) : emptyInput();
  }

  private foe(m: MatchState): FighterState | null {
    return m.fighters.find((f) => f.id !== this.id && !f.eliminated && f.action !== 'dead') ?? null;
  }

  private plan(m: MatchState, me: FighterState): void {
    switch (this._behavior) {
      case 'stand':
        return;
      case 'jump':
        // Hold jump a few frames for a full jump, straight up.
        if (this.clock % JUMP_EVERY === 0 && me.grounded && isActionable(me)) this.queue = Array(8).fill({ jump: true });
        return;
      case 'defend':
        if (isActionable(me) && me.dodgeCooldown === 0 && this.threatened(m, me)) this.queue = [{ dodge: true }, {}];
        return;
      case 'attack': {
        const foe = this.foe(m);
        if (!foe || this.clock % ATTACK_EVERY !== 0 || !isActionable(me) || !me.grounded) return;
        const dx = foe.x - me.x;
        if (Math.abs(dx) > ATTACK_REACH_X || Math.abs(foe.y - me.y) > ATTACK_REACH_Y) return;
        const toward = dx >= 0 ? 1 : -1;
        const button = this.heavyNext ? 'heavy' : 'light';
        this.heavyNext = !this.heavyNext;
        // Turn to face the player (one frame of input), then swing in place.
        if (me.facing !== toward) this.queue.push(toward > 0 ? { right: true } : { left: true });
        this.queue.push({ [button]: true }, {});
        return;
      }
      default:
        return;
    }
  }

  private threatened(m: MatchState, me: FighterState): boolean {
    const foe = this.foe(m);
    if (foe && foe.action === 'attack') {
      const move = currentMove(foe);
      const startingUp = move ? foe.actionFrame < move.startup : false;
      if (startingUp && Math.hypot(foe.x - me.x, foe.y - me.y) < THREAT_RANGE) return true;
    }
    return m.projectiles.some((p) => {
      if (p.owner === this.id) return false;
      const dx = me.x - p.x;
      const closing = Math.sign(p.vx) === Math.sign(dx) || p.vx === 0;
      return closing && Math.abs(dx) < THREAT_RANGE && Math.abs(me.y - 40 - p.y) < 90;
    });
  }
}

/**
 * Counts hits on one fighter as a combo while they can't escape: every hit after the first
 * must land while the victim is still in hitstun/hitstop (or within `graceFrames` of leaving
 * it). Getting free, being KO'd or respawning ends the combo.
 */
export class ComboTracker {
  hits = 0;
  damage = 0;
  lastDamage = 0;
  best = 0;
  /** True while the current combo can still be extended. */
  active = false;

  constructor(readonly victim: number, public graceFrames = 0) {}

  update(m: MatchState, events: readonly GameEvent[]): void {
    for (const e of events) {
      if (e.type === 'hit' && e.victim === this.victim && e.attacker !== this.victim) {
        if (!this.active) {
          this.hits = 0;
          this.damage = 0;
        }
        this.active = true;
        this.hits++;
        this.damage += e.damage;
        this.lastDamage = e.damage;
        this.best = Math.max(this.best, this.hits);
      } else if ((e.type === 'ko' || e.type === 'respawn') && e.id === this.victim) {
        this.active = false;
      }
    }
    const v = m.fighters[this.victim];
    if (this.active && v && v.freeFrames > this.graceFrames) this.active = false;
  }

  reset(): void {
    this.hits = 0;
    this.damage = 0;
    this.lastDamage = 0;
    this.active = false;
  }
}

/** Sets a fighter's damage directly (clamped to the game's 0–999%). */
export function setFighterDamage(m: MatchState, id: number, percent: number): void {
  const f = m.fighters[id];
  if (!f) return;
  const v = Number.isFinite(percent) ? Math.round(percent) : 0;
  f.damage = Math.min(m.rules.combat.maxDamage, Math.max(0, v));
}

/**
 * Puts every fighter back on their starting spawn, standing still and actionable: velocity,
 * knockback, hitstun, attacks, charges and air state are all cleared. Damage and stats are kept.
 * Projectiles are removed so nothing hits anyone right after the reset.
 */
export function resetPositions(m: MatchState): void {
  for (const f of m.fighters) {
    const fresh = createFighter(f.id, f.fighter, m.stage, f.stocks);
    const { damage, stats, stocks } = f;
    Object.assign(f, fresh, { damage, stats, stocks });
  }
  m.projectiles = [];
}
