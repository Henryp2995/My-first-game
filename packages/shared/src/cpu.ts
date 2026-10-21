import { hitboxRect, hurtboxRect } from './combat';
import { FIGHTERS, type FighterId, type MoveSlot } from './fighters';
import { rectsOverlap, type Rect } from './geometry';
import { emptyInput, type InputFrame } from './input';
import type { FighterAction, FighterState, MatchState } from './match';
import { nextRandom } from './rng';
import type { Platform } from './stage';

export type CpuDifficulty = 'easy' | 'normal' | 'hard' | 'expert';
export const CPU_DIFFICULTIES: CpuDifficulty[] = ['easy', 'normal', 'hard', 'expert'];

export interface CpuProfile {
  label: string;
  /** How stale (in frames) the CPU's view of its opponent is. */
  reactionFrames: number;
  /** Frames between neutral-game decisions. */
  thinkInterval: number;
  /** Chance per decision to advance on the opponent instead of waiting. */
  aggression: number;
  /** Chance per decision to throw out an attack that is in range. */
  attackRate: number;
  /** Chance to dodge a visible incoming attack. */
  dodgeRate: number;
  /** Chance per offstage episode to recover properly (double jump + recovery move). */
  recoverySkill: number;
  /** Chance per decision to stand still. */
  hesitation: number;
  /** Uses heavies on high-percent opponents and fast falls to land sooner. */
  smart: boolean;
  /** Random error (px) added to the CPU's preferred spacing. */
  spacingError: number;
  /** Max quick attacks chained into a stunned opponent before mixing up (prevents jab-locks). */
  maxJabChain: number;
}

export const CPU_PROFILES: Record<CpuDifficulty, CpuProfile> = {
  easy: {
    label: 'Easy', reactionFrames: 24, thinkInterval: 14, aggression: 0.5, attackRate: 0.3,
    dodgeRate: 0.04, recoverySkill: 0.45, hesitation: 0.3, smart: false, spacingError: 45, maxJabChain: 1,
  },
  normal: {
    label: 'Normal', reactionFrames: 15, thinkInterval: 9, aggression: 0.75, attackRate: 0.55,
    dodgeRate: 0.18, recoverySkill: 0.85, hesitation: 0.12, smart: false, spacingError: 25, maxJabChain: 2,
  },
  hard: {
    label: 'Hard', reactionFrames: 9, thinkInterval: 5, aggression: 0.9, attackRate: 0.8,
    dodgeRate: 0.4, recoverySkill: 1, hesitation: 0.04, smart: true, spacingError: 12, maxJabChain: 2,
  },
  expert: {
    label: 'Expert', reactionFrames: 4, thinkInterval: 2, aggression: 1, attackRate: 1,
    dodgeRate: 0.65, recoverySkill: 1, hesitation: 0, smart: true, spacingError: 4, maxJabChain: 3,
  },
};

/** What the CPU "sees" of a fighter, recorded each frame so it can react with a delay. */
interface Snapshot {
  id: number;
  fighter: FighterId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  action: FighterAction;
  actionFrame: number;
  move: MoveSlot | null;
  damage: number;
  grounded: boolean;
}

type Button = 'light' | 'heavy' | 'special' | 'dodge' | 'jump';

interface Press {
  button: Button;
  dir: number;
  up?: boolean;
  down?: boolean;
  /** Keep the button held for this many frames after the press (full jumps, rocket charge). */
  hold?: number;
}

const KO_PERCENT = 95;
/** Free frames an opponent needs before the CPU may start a new jab string. */
const BREATHER_FRAMES = 15;

/**
 * Computer opponent. It never touches MatchState — it only reads it and returns an InputFrame,
 * exactly like a keyboard (or, later, a network client) would.
 */
export class CpuController {
  readonly profile: CpuProfile;
  private rng: { rngState: number };
  private history: Snapshot[] = [];
  private prev: InputFrame = emptyInput();
  private queued: Press | null = null;
  private holding: { button: Button; frames: number; dir: number; up: boolean } | null = null;
  private moveDir = 0;
  private nextThink = 0;
  private clock = 0;
  private recovering = false;
  private goodRecovery = true;
  private dodgedKey = '';
  private respawnWait = -1;
  /** Quick attacks thrown before the opponent got a real breather. */
  private jabChain = 0;
  /** Consecutive frames the opponent has been free to act (not stunned). */
  private foeFree = 0;
  /** Frames to back off after a capped jab string. */
  private backOff = 0;

  constructor(readonly id: number, readonly difficulty: CpuDifficulty = 'normal', seed = 0x5eed) {
    this.profile = CPU_PROFILES[difficulty];
    this.rng = { rngState: (seed ^ (id * 0x9e3779b9)) >>> 0 };
  }

  private chance(p: number): boolean {
    return nextRandom(this.rng) < p;
  }

  decide(m: MatchState): InputFrame {
    this.clock++;
    const me = m.fighters[this.id];
    const foe = this.pickTarget(m, me);
    if (foe) {
      this.history.push(snapshot(foe));
      if (this.history.length > 60) this.history.shift();
      this.foeFree = foe.action === 'hitstun' || foe.hitstop > 0 ? 0 : this.foeFree + 1;
    }
    let out = emptyInput();
    if (m.phase === 'playing' && me && !me.eliminated && me.action !== 'dead') {
      out = this.think(m, me, foe ? this.perceived(foe.id) : null);
    }
    this.prev = out;
    return out;
  }

  private pickTarget(m: MatchState, me: FighterState | undefined): FighterState | null {
    if (!me) return null;
    let best: FighterState | null = null;
    let bestD = Infinity;
    for (const f of m.fighters) {
      if (f.id === this.id || f.eliminated || f.action === 'dead') continue;
      const d = Math.hypot(f.x - me.x, f.y - me.y);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    if (best && this.history.length && this.history[this.history.length - 1].id !== best.id) this.history = [];
    return best;
  }

  private perceived(id: number): Snapshot | null {
    const h = this.history;
    if (!h.length || h[h.length - 1].id !== id) return null;
    return h[Math.max(0, h.length - 1 - this.profile.reactionFrames)];
  }

  private think(m: MatchState, me: FighterState, foe: Snapshot | null): InputFrame {
    const out = emptyInput();
    const stage = mainPlatform(m);

    if (me.action === 'respawning') {
      if (this.respawnWait < 0) this.respawnWait = 15 + Math.floor(nextRandom(this.rng) * 45);
      if (--this.respawnWait <= 0) {
        this.respawnWait = -1;
        setDir(out, foe ? Math.sign(foe.x - me.x) || 1 : -Math.sign(me.x) || 1);
      }
      return out;
    }

    // Continue a held button (full jump, rocket charge).
    if (this.holding) {
      out[this.holding.button] = true;
      setDir(out, this.holding.dir);
      out.up = this.holding.up;
      if (--this.holding.frames <= 0) this.holding = null;
    }

    // Knocked around: drift back toward the stage (directional influence).
    if (me.action === 'hitstun') {
      setDir(out, -Math.sign(me.x) || 1);
      this.recovering = false;
      return out;
    }

    if (this.isOffstage(me, stage)) {
      this.recover(me, stage, out);
    } else {
      this.recovering = false;
      if (foe) this.neutral(m, me, foe, stage, out);
    }
    this.flushPress(out);
    return out;
  }

  // ---------------------------------------------------------------------------
  // Recovery
  // ---------------------------------------------------------------------------

  private isOffstage(me: FighterState, p: Platform): boolean {
    if (me.grounded) return false;
    return me.x < p.x1 - 8 || me.x > p.x2 + 8 || me.y > p.y + 4;
  }

  private recover(me: FighterState, p: Platform, out: InputFrame): void {
    if (!this.recovering) {
      this.recovering = true;
      this.goodRecovery = this.chance(this.profile.recoverySkill);
    }
    const def = FIGHTERS[me.fighter];
    const side = me.x < (p.x1 + p.x2) / 2 ? -1 : 1;
    const edgeX = side < 0 ? p.x1 : p.x2;
    const outside = (me.x - edgeX) * side; // > 0 when past the ledge
    const below = me.y - p.y; // > 0 when below the stage top
    const toward = outside > -12 ? -side : side; // under the stage: get out from underneath first
    if (!this.holding) setDir(out, toward);

    const jumpsLeft = me.jumpsUsed < def.stats.maxJumps;
    const falling = me.vy + me.kby > 0;
    // A sloppy recovery waits too long before committing.
    const urgency = this.goodRecovery ? -40 : 200;

    if (jumpsLeft && falling && (below > urgency || outside > 260)) {
      this.press({ button: 'jump', dir: toward, hold: 14 });
      return;
    }
    if (!this.goodRecovery || jumpsLeft || !falling || below < -30) return;

    const used = (slot: MoveSlot) => me.airUsed.includes(slot) || me.cooldowns[slot] > 0;
    if (me.fighter === 'luigi') {
      if (!me.airBoostUsed && me.cooldowns.heavy <= 0) {
        this.press({ button: 'heavy', dir: toward });
      } else if (!used('special') && outside > 120 && below < 160) {
        this.press({ button: 'special', dir: toward });
      } else if (me.dodgeCooldown <= 0) {
        this.press({ button: 'dodge', dir: toward, up: true });
      }
    } else if (me.fighter === 'sheik') {
      if (!used('special')) {
        this.press({ button: 'special', dir: outside > 140 ? toward : 0, up: true });
      } else if (me.dodgeCooldown <= 0) {
        this.press({ button: 'dodge', dir: toward, up: true });
      }
    } else if (me.dodgeCooldown <= 0) {
      this.press({ button: 'dodge', dir: toward, up: true });
    }
  }

  // ---------------------------------------------------------------------------
  // Neutral game
  // ---------------------------------------------------------------------------

  private neutral(m: MatchState, me: FighterState, foe: Snapshot, stage: Platform, out: InputFrame): void {
    const prof = this.profile;
    const dx = foe.x - me.x;
    const dy = foe.y - me.y; // negative: opponent is above
    const adx = Math.abs(dx);
    const dirTo = (Math.sign(dx) || me.facing) as 1 | -1;
    const actionable = me.action === 'idle' || me.action === 'run' || me.action === 'air';

    // React to an incoming attack.
    if (actionable && foe.action === 'attack' && foe.move && me.dodgeCooldown <= 0) {
      const key = `${foe.id}:${foe.move}:${Math.floor((this.clock - foe.actionFrame) / 4)}`;
      const move = FIGHTERS[foe.fighter].moves[foe.move];
      const facingMe = foe.facing === Math.sign(me.x - foe.x) || move.hitboxes.some((h) => h.autoDirection);
      if (key !== this.dodgedKey && facingMe && foe.actionFrame < move.startup && adx < 150 && Math.abs(dy) < 120) {
        this.dodgedKey = key;
        if (this.chance(prof.dodgeRate)) {
          const away = me.grounded && this.chance(0.5) && this.safeToMove(me, stage, -dirTo) ? -dirTo : 0;
          this.press({ button: 'dodge', dir: away });
          return;
        }
      }
    }

    // Let a stunned opponent go after a capped jab string so the human always gets a chance to act.
    // The string only resets once the opponent has had ~1/4 s of real freedom.
    const pressuring = this.foeFree < BREATHER_FRAMES;
    if (!pressuring) this.jabChain = 0;
    if (this.backOff > 0) {
      this.backOff--;
      if (actionable) setDir(out, this.safeToMove(me, stage, -dirTo) ? -dirTo : 0);
      return;
    }

    const think = this.clock >= this.nextThink;
    if (think) {
      this.nextThink = this.clock + prof.thinkInterval;
      if (this.chance(prof.hesitation)) {
        this.moveDir = 0;
      } else {
        const spacing = 45 + nextRandom(this.rng) * prof.spacingError;
        if (adx > spacing && this.chance(prof.aggression)) this.moveDir = dirTo;
        else if (adx < 25) this.moveDir = -dirTo;
        else this.moveDir = 0;
      }

      if (actionable && this.chooseAttack(me, foe, dirTo, stage, adx, dy)) return;

      // Chase vertically.
      if (me.grounded && dy < -110 && adx < 220 && this.chance(0.6)) {
        this.press({ button: 'jump', dir: dirTo, hold: dy < -200 ? 16 : 10 });
      } else if (me.grounded && dy > 100 && onOneWay(m, me)) {
        out.down = true; // drop through toward the opponent
      }
    }

    if (actionable && !this.holding) {
      const dir = this.moveDir !== 0 && this.safeToMove(me, stage, this.moveDir) ? this.moveDir : 0;
      setDir(out, dir);
      // Smarter CPUs fast fall onto opponents below them.
      if (prof.smart && !me.grounded && me.vy > 0 && dy > 60 && !me.fastFalling && !this.prev.down) out.down = true;
    }
  }

  private chooseAttack(me: FighterState, foe: Snapshot, dir: 1 | -1, stage: Platform, adx: number, dy: number): boolean {
    const prof = this.profile;
    if (!this.chance(prof.attackRate)) return false;
    const def = FIGHTERS[me.fighter];
    const overStage = me.x > stage.x1 + 20 && me.x < stage.x2 - 20;
    const ready = (slot: MoveSlot) => me.cooldowns[slot] <= 0 && !(!me.grounded && def.moves[slot].oncePerAirtime && me.airUsed.includes(slot));

    // Long-range specials.
    if (me.grounded && Math.abs(dy) < 50 && ready('special')) {
      if (me.fighter === 'luigi' && adx > 220 && adx < 620 && this.chance(0.25)) {
        const charge = prof.smart ? Math.min(55, Math.round((adx - 200) / 7)) : Math.floor(nextRandom(this.rng) * 40);
        this.press({ button: 'special', dir, hold: charge + 10 });
        return true;
      }
      if (me.fighter === 'sheik' && adx > 170 && adx < 300 && this.chance(0.12)) {
        this.press({ button: 'special', dir });
        return true;
      }
    }

    const candidates: MoveSlot[] = me.grounded ? ['light', 'heavy', 'special'] : ['aerial', 'heavy'];
    if (me.fighter === 'gnw' && !me.grounded) candidates.push('special');
    const quick: MoveSlot = me.grounded ? 'light' : 'aerial';
    const chainCapped = this.foeFree < BREATHER_FRAMES && this.jabChain >= prof.maxJabChain;
    const hits = candidates.filter((slot) => {
      if (!ready(slot)) return false;
      if (slot === quick && chainCapped) return false;
      if (slot === 'special' && me.fighter !== 'gnw') return false;
      if (slot === 'aerial' && !overStage) return false; // Key Drop & co. are suicide offstage
      return wouldHit(me, slot, foe, dir);
    });
    if (!hits.length) {
      if (chainCapped) {
        this.jabChain = 0;
        this.backOff = 12 + Math.floor(nextRandom(this.rng) * 18);
      }
      return false;
    }

    // Smart CPUs build damage with quick hits: close the gap instead of whiffing slow moves.
    if (prof.smart && foe.damage < 60 && !hits.includes(quick) && this.chance(0.75)) return false;

    let slot: MoveSlot;
    if (prof.smart && foe.damage >= KO_PERCENT && hits.includes('heavy')) slot = 'heavy';
    else if (prof.smart && foe.damage < 60 && hits.includes(me.grounded ? 'light' : 'aerial')) slot = me.grounded ? 'light' : 'aerial';
    else {
      const weights: Record<MoveSlot, number> = { light: 0.55, aerial: 0.6, heavy: 0.3, special: 0.15 };
      const total = hits.reduce((s, h) => s + weights[h], 0);
      let r = nextRandom(this.rng) * total;
      slot = hits[hits.length - 1];
      for (const h of hits) {
        r -= weights[h];
        if (r <= 0) {
          slot = h;
          break;
        }
      }
    }
    if (slot === quick) this.jabChain++;
    this.press({ button: slot === 'aerial' ? 'light' : slot, dir });
    return true;
  }

  private safeToMove(me: FighterState, p: Platform, dir: number): boolean {
    if (!me.grounded || dir === 0) return true;
    const margin = 30;
    return !((dir < 0 && me.x < p.x1 + margin) || (dir > 0 && me.x > p.x2 - margin));
  }

  // ---------------------------------------------------------------------------
  // Button handling: the sim only reacts to press edges, so a button must be released
  // for a frame before it can be pressed again.
  // ---------------------------------------------------------------------------

  private press(p: Press): void {
    this.queued = p;
  }

  private flushPress(out: InputFrame): void {
    const p = this.queued;
    if (!p) return;
    if (this.prev[p.button]) {
      out[p.button] = false; // release this frame, press next frame
      return;
    }
    this.queued = null;
    out[p.button] = true;
    setDir(out, p.dir);
    out.up = !!p.up;
    out.down = !!p.down;
    if (p.hold) this.holding = { button: p.button, frames: p.hold, dir: p.dir, up: !!p.up };
  }
}

function setDir(out: InputFrame, dir: number): void {
  out.left = dir < 0;
  out.right = dir > 0;
}

function snapshot(f: FighterState): Snapshot {
  return {
    id: f.id, fighter: f.fighter, x: f.x, y: f.y, vx: f.vx + f.kbx, vy: f.vy + f.kby, facing: f.facing, action: f.action,
    actionFrame: f.actionFrame, move: f.move, damage: f.damage, grounded: f.grounded,
  };
}

function mainPlatform(m: MatchState): Platform {
  let best = m.stage.platforms[0];
  for (const p of m.stage.platforms) if (!p.oneWay && p.x2 - p.x1 > best.x2 - best.x1) best = p;
  return best;
}

function onOneWay(m: MatchState, me: FighterState): boolean {
  return m.stage.platforms.some((p) => p.oneWay && Math.abs(me.y - p.y) < 1 && me.x >= p.x1 - 6 && me.x <= p.x2 + 6);
}

/** Would starting `slot` right now (facing `dir`) overlap the opponent's hurtbox? Uses the real hitbox data. */
function wouldHit(me: FighterState, slot: MoveSlot, foe: Snapshot, dir: 1 | -1): boolean {
  const move = FIGHTERS[me.fighter].moves[slot];
  // Pad the target by how far the opponent could drift during startup.
  const lead = 4 + Math.min(40, (move.startup / 60) * (Math.abs(foe.vx) + Math.abs(foe.vy)) * 0.6);
  const hurt = hurtboxRect(foe, FIGHTERS[foe.fighter].stats);
  const target: Rect = { x: hurt.x - lead, y: hurt.y - lead, w: hurt.w + lead * 2, h: hurt.h + lead * 2 };
  // Falling aerials (Key Drop) travel downward while active.
  const drop = move.impulse?.vy && move.impulse.vy > 0 ? 120 : 0;
  const pos = { x: me.x, y: me.y, facing: dir };
  return move.hitboxes.some((hb) => {
    const r = hitboxRect(pos, hb);
    return rectsOverlap({ ...r, h: r.h + drop }, target);
  });
}
