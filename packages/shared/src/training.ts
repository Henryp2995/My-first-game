/**
 * Training Mode: rules, the training dummy's behaviour, combo tracking and practice helpers.
 *
 * Everything here drives the *normal* simulation — the dummy only produces InputFrames, and the
 * helpers only edit match state between steps — so movement, damage, knockback, hitstun and
 * specials are exactly the real game's. Nothing in here is used by versus / online matches.
 */
import { makeRules, type RulesConfig } from './config';
import { CpuController } from './cpu';
import { GRABS, THROW_DIRS, type ThrowDir } from './grabs';
import { hitboxRect, hurtboxRect } from './combat';
import { rectsOverlap } from './geometry';
import { FIGHTERS } from './fighters';
import { nextRandom } from './rng';
import { emptyInput, makeInput, type InputFrame } from './input';
import {
  createFighter, currentMove, isActionable, isOnLedge, placeOnLedge, shieldMax, type FighterState, type GameEvent, type MatchState,
} from './match';
import { solidExtent, stageLedges } from './stage';

/** Unlimited stocks, no clock, no countdown — the match never ends on its own. */
export const TRAINING_RULES: RulesConfig = makeRules({ infiniteStocks: true, timed: false, countdownFrames: 0 });

export type DummyBehavior = 'stand' | 'shield' | 'grab' | 'escape' | 'jump' | 'defend' | 'attack' | 'recover' | 'cpu';
export const DUMMY_BEHAVIORS: DummyBehavior[] = ['stand', 'shield', 'grab', 'escape', 'jump', 'defend', 'attack', 'recover', 'cpu'];
export const DUMMY_BEHAVIOR_LABEL: Record<DummyBehavior, string> = {
  stand: 'Stand Still',
  shield: 'Hold Shield',
  grab: 'Attempt Grab',
  escape: 'Escape Grab',
  jump: 'Jump',
  defend: 'Defend (shield/roll)',
  attack: 'Attack',
  recover: 'Recover to Ledge',
  cpu: 'Normal CPU',
};

/** Which throw the Attempt Grab dummy uses. */
export type DummyThrow = ThrowDir | 'random';
export const DUMMY_THROWS: DummyThrow[] = ['forward', 'back', 'up', 'down', 'random'];

/** Frames between the dummy's periodic actions. */
const GRAB_EVERY = 45;
/** How long the Attempt Grab dummy holds before throwing. */
const DUMMY_HOLD_FRAMES = 30;
/** Mash rate (frames between presses) for an escaping dummy. */
const DUMMY_MASH_EVERY = 3;
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
  private rng: { rngState: number };
  /** Throw used by the Attempt Grab behaviour. */
  throwChoice: DummyThrow = 'forward';
  /** Mash out of grabs (any scripted behaviour). Off = the dummy only escapes when the hold times out. */
  escapeMash = false;

  constructor(readonly id: number, behavior: DummyBehavior = 'stand', private readonly seed = 0x7a11) {
    this.rng = { rngState: seed >>> 0 };
    this.setBehavior(behavior);
  }

  get behavior(): DummyBehavior {
    return this._behavior;
  }

  setBehavior(b: DummyBehavior): void {
    this._behavior = b;
    this.clock = 0;
    this.queue = [];
    // "Recover" borrows the CPU's recovery + ledge logic (only while offstage / on a ledge).
    this.cpu = b === 'cpu' ? new CpuController(this.id, 'normal', this.seed)
      : b === 'recover' ? new CpuController(this.id, 'hard', this.seed) : null;
  }

  decide(m: MatchState): InputFrame {
    this.clock++;
    if (this.cpu) {
      const cpuInput = this.cpu.decide(m);
      if (this._behavior === 'cpu') return cpuInput;
      const me = m.fighters[this.id];
      return me && this.needsRecovery(m, me) ? cpuInput : emptyInput();
    }
    const me = m.fighters[this.id];
    if (m.phase !== 'playing' || !me || me.eliminated || me.action === 'dead' || me.action === 'respawning') {
      this.queue = [];
      return emptyInput();
    }
    // Being hit cancels whatever it was about to do.
    if (me.action === 'hitstun') this.queue = [];
    if (me.action === 'grabbed') {
      this.queue = [];
      const mash = this._behavior === 'escape' || this.escapeMash;
      return mash && this.clock % DUMMY_MASH_EVERY === 0 ? makeInput({ jump: true }) : emptyInput();
    }
    if (me.action === 'holding') return this.holdInput(me);
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
      case 'shield':
        // Keep the shield button held; it re-raises by itself after a break or release lag.
        if (me.grounded) this.queue = [{ dodge: true }];
        return;
      case 'grab': {
        const foe = this.foe(m);
        if (!foe || this.clock % GRAB_EVERY !== 0 || !isActionable(me) || !me.grounded) return;
        const toward = foe.x >= me.x ? 1 : -1;
        if (me.facing !== toward) {
          this.queue.push(toward > 0 ? { right: true } : { left: true }, {});
          return;
        }
        if (this.inGrabRange(me, foe)) this.queue.push({ grab: true }, {});
        return;
      }
      case 'jump':
        // Hold jump a few frames for a full jump, straight up.
        if (this.clock % JUMP_EVERY === 0 && me.grounded && isActionable(me)) this.queue = Array(8).fill({ jump: true });
        return;
      case 'defend': {
        if (!me.grounded || !isActionable(me) || !this.threatened(m, me)) return;
        const foe = this.foe(m);
        const away = foe && foe.x > me.x ? { left: true } : { right: true };
        // Shield while it's healthy; roll away once it's low (instead of letting it break).
        if (me.shieldHp > shieldMax(m.rules, me) * 0.3) this.queue = Array(24).fill({ dodge: true });
        else if (me.dodgeCooldown === 0) this.queue = [{ dodge: true, ...away }, {}];
        return;
      }
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

  private inGrabRange(me: FighterState, foe: FighterState): boolean {
    const box = GRABS[me.fighter].box;
    const r = hitboxRect(me, { ...box, damage: 0, baseKnockback: 0, knockbackGrowth: 0, angle: 0 });
    return foe.grounded && rectsOverlap(r, hurtboxRect(foe, FIGHTERS[foe.fighter].stats));
  }

  /** Holding someone: wait a moment, then use the configured throw. */
  private holdInput(me: FighterState): InputFrame {
    if (me.actionFrame < DUMMY_HOLD_FRAMES) return emptyInput();
    const dir = this.throwChoice === 'random' ? THROW_DIRS[Math.floor(nextRandom(this.rng) * 4)] : this.throwChoice;
    if (dir === 'up') return makeInput({ up: true });
    if (dir === 'down') return makeInput({ down: true });
    const fwd = dir === 'forward' ? me.facing : -me.facing;
    return makeInput(fwd > 0 ? { right: true } : { left: true });
  }

  /** Offstage, under the stage, hanging on a ledge, or tumbling: time to (let the CPU) recover. */
  private needsRecovery(m: MatchState, me: FighterState): boolean {
    if (isOnLedge(me) || me.action === 'hitstun') return true;
    if (me.grounded) return false;
    const { x1, x2 } = solidExtent(m.stage);
    return me.x < x1 || me.x > x2 || me.y > 10;
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

/** Sets a fighter's shield health directly (clamped to 0..max; at least 1 so it isn't "broken"). */
export function setFighterShield(m: MatchState, id: number, health: number): void {
  const f = m.fighters[id];
  if (!f) return;
  f.shieldHp = Math.min(shieldMax(m.rules, f), Math.max(1, Number.isFinite(health) ? health : 1));
}

/** Hangs a fighter on the ledge nearest to them (Training: ledge practice). */
export function hangOnNearestLedge(m: MatchState, id: number): boolean {
  const f = m.fighters[id];
  const ledges = stageLedges(m.stage, m.rules.ledge.wallClearance);
  if (!f || !ledges.length || f.action === 'dead' || f.action === 'respawning') return false;
  const free = ledges.filter((l) => !m.fighters.some((o) => o !== f && isOnLedge(o) && o.ledge?.x === l.x && o.ledge?.y === l.y));
  const pick = (free.length ? free : ledges).reduce((a, b) => (Math.abs(b.x - f.x) < Math.abs(a.x - f.x) ? b : a));
  placeOnLedge(m, f, pick);
  return true;
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
    const fresh = createFighter(f.id, f.fighter, m.stage, f.stocks, m.rules);
    const { damage, stats, stocks } = f;
    Object.assign(f, fresh, { damage, stats, stocks });
  }
  m.projectiles = [];
}
