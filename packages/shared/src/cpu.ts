import { hitboxRect, hurtboxRect } from './combat';
import { FIGHTERS, type FighterId, type MoveSlot } from './fighters';
import { rectsOverlap, type Rect } from './geometry';
import { emptyInput, type InputFrame } from './input';
import type { FighterAction, FighterState, MatchState } from './match';
import { nextRandom } from './rng';
import { solidExtent, solidSurfaceAt, type StageDef } from './stage';

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
  /** Countdown before acting on a ledge (-1 = not decided yet). */
  private ledgeWait = -1;
  /** Clock time of the last shield, so the CPU doesn't shield every single attack. */
  private lastShield = -999;

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
    const stage = stageGeo(m.stage);

    if (me.action === 'respawning') {
      if (this.respawnWait < 0) this.respawnWait = 15 + Math.floor(nextRandom(this.rng) * 45);
      if (--this.respawnWait <= 0) {
        this.respawnWait = -1;
        setDir(out, foe ? Math.sign(foe.x - me.x) || 1 : -Math.sign(me.x) || 1);
      }
      return out;
    }

    // On a ledge: wait a (difficulty-based) moment, then get up. Never just let go.
    if (me.action === 'ledge') {
      this.holding = null;
      this.recovering = false;
      this.ledgeGetup(m, me, foe, out);
      this.flushPress(out);
      return out;
    }
    this.ledgeWait = -1;
    if (me.action === 'ledgeClimb' || me.action === 'ledgeRoll' || me.action === 'shieldBreak') {
      this.holding = null;
      return out;
    }

    // Continue a held button (full jump, rocket charge, shield).
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
      this.recover(m, me, stage, out);
    } else {
      this.recovering = false;
      if (foe && !this.dodgeProjectile(m, me)) this.neutral(m, me, foe, stage, out);
    }
    this.flushPress(out);
    return out;
  }

  // ---------------------------------------------------------------------------
  // Recovery
  // ---------------------------------------------------------------------------

  private isOffstage(me: FighterState, g: StageGeo): boolean {
    if (me.grounded) return false;
    if (me.x < g.x1 - 8 || me.x > g.x2 + 8) return true;
    const top = g.topAt(me.x);
    return top !== null && me.y > top + 4; // below the deck: under the stage
  }

  private recover(m: MatchState, me: FighterState, g: StageGeo, out: InputFrame): void {
    const canAirDodge = canDodge(m, me);
    if (!this.recovering) {
      this.recovering = true;
      this.goodRecovery = this.chance(this.profile.recoverySkill);
    }
    const def = FIGHTERS[me.fighter];
    const side = me.x < g.centerX ? -1 : 1;
    const edgeX = side < 0 ? g.x1 : g.x2;
    const outside = (me.x - edgeX) * side; // > 0 when past the ledge
    // Height relative to the ledge we're heading for (or the deck we're under).
    const below = me.y - (outside > 0 ? g.edgeTop(side) : g.topAt(me.x) ?? g.edgeTop(side)); // > 0 when below
    const toward = outside > -12 ? -side : side; // under the stage: get out from underneath first
    const underStage = outside < 0 && below > 0;
    // Vanish reads its direction when it fires (end of startup), so keep aiming until then:
    // straight out from under the stage, otherwise up (and toward the stage when far away).
    const vanishDir = underStage ? side : outside > 140 ? toward : 0;
    const vanishUp = !underStage;
    const move = me.action === 'attack' && me.move ? def.moves[me.move] : null;
    if (move?.behavior?.type === 'vanish' && me.actionFrame < move.startup) {
      setDir(out, vanishDir);
      out.up = vanishUp;
      return;
    }
    // Web-zip also reads "up" when it fires.
    if (move?.behavior?.type === 'projectile' && move.behavior.airUpZip && me.actionFrame < move.startup) {
      setDir(out, toward);
      out.up = true;
      return;
    }
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
      } else if (canAirDodge) {
        this.press({ button: 'dodge', dir: toward, up: true });
      }
    } else if (me.fighter === 'sheik') {
      if (!used('special')) {
        this.press({ button: 'special', dir: vanishDir, up: vanishUp });
      } else if (canAirDodge) {
        this.press({ button: 'dodge', dir: toward, up: true });
      }
    } else if (def.moves.special.behavior?.type === 'projectile' && def.moves.special.behavior.airUpZip && !used('special') && !underStage) {
      this.press({ button: 'special', dir: toward, up: true }); // Spider-Man web-zip
    } else if (canAirDodge) {
      this.press({ button: 'dodge', dir: toward, up: true });
    }
  }

  private ledgeGetup(m: MatchState, me: FighterState, foe: Snapshot | null, out: InputFrame): void {
    const l = me.ledge;
    if (!l) return;
    if (this.ledgeWait < 0) {
      this.ledgeWait = m.rules.ledge.actionDelayFrames + this.profile.reactionFrames + Math.floor(nextRandom(this.rng) * 20);
    }
    if (--this.ledgeWait > 0) return;
    this.ledgeWait = -1;
    // A smart CPU avoids climbing straight into an opponent waiting at the edge.
    const guarded = !!foe && foe.grounded && Math.abs(foe.x - l.x) < 150;
    const r = nextRandom(this.rng);
    const choice = guarded && this.profile.smart ? (r < 0.5 ? 'roll' : 'jump') : r < 0.6 ? 'climb' : r < 0.8 ? 'jump' : 'roll';
    if (choice === 'climb') setDir(out, l.dir);
    else this.press({ button: choice === 'jump' ? 'jump' : 'dodge', dir: 0, hold: choice === 'jump' ? 10 : undefined });
  }

  /**
   * Defend against an incoming attack: hold shield for about as long as the attack lasts, or
   * dodge (roll away / spot dodge / air dodge). Shield is skipped when it's low, so the CPU lets
   * it regenerate instead of breaking it.
   */
  private defend(m: MatchState, me: FighterState, threatFrames: number, away: number): void {
    const shieldOk = me.grounded && me.shieldHp > 35 && this.clock - this.lastShield > 40;
    const dodgeOk = canDodge(m, me);
    if (shieldOk && (!dodgeOk || this.chance(0.6))) {
      this.lastShield = this.clock;
      this.press({ button: 'dodge', dir: 0, hold: Math.max(6, Math.min(30, threatFrames)) });
    } else if (dodgeOk) {
      if (me.grounded) this.press({ button: 'dodge', dir: away, down: away === 0 });
      else this.press({ button: 'dodge', dir: 0 });
    }
  }

  // ---------------------------------------------------------------------------
  // Neutral game
  // ---------------------------------------------------------------------------

  private neutral(m: MatchState, me: FighterState, foe: Snapshot, stage: StageGeo, out: InputFrame): void {
    const prof = this.profile;
    const dx = foe.x - me.x;
    const dy = foe.y - me.y; // negative: opponent is above
    const adx = Math.abs(dx);
    const dirTo = (Math.sign(dx) || me.facing) as 1 | -1;
    const actionable = me.action === 'idle' || me.action === 'run' || me.action === 'air';

    // React to an incoming attack.
    if (actionable && foe.action === 'attack' && foe.move && (canDodge(m, me) || (me.grounded && me.shieldHp > 35))) {
      const key = `${foe.id}:${foe.move}:${Math.floor((this.clock - foe.actionFrame) / 4)}`;
      const move = FIGHTERS[foe.fighter].moves[foe.move];
      const facingMe = foe.facing === Math.sign(me.x - foe.x) || move.hitboxes.some((h) => h.autoDirection);
      if (key !== this.dodgedKey && facingMe && foe.actionFrame < move.startup && adx < 150 && Math.abs(dy) < 120) {
        this.dodgedKey = key;
        if (this.chance(prof.dodgeRate)) {
          const away = me.grounded && this.chance(0.5) && this.safeToMove(me, stage, -dirTo) ? -dirTo : 0;
          this.defend(m, me, move.startup - foe.actionFrame + move.active + 4, away);
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

      if (actionable && this.chooseAttack(m, me, foe, dirTo, stage, adx, dy)) return;

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
      const overStage = me.x > stage.x1 + 30 && me.x < stage.x2 - 30;
      if (prof.smart && overStage && !me.grounded && me.vy > 0 && dy > 60 && !me.fastFalling && !this.prev.down) out.down = true;
    }
  }

  private chooseAttack(m: MatchState, me: FighterState, foe: Snapshot, dir: 1 | -1, stage: StageGeo, adx: number, dy: number): boolean {
    const prof = this.profile;
    if (!this.chance(prof.attackRate)) return false;
    const def = FIGHTERS[me.fighter];
    const overStage = me.x > stage.x1 + 20 && me.x < stage.x2 - 20;
    const ready = (slot: MoveSlot) => me.cooldowns[slot] <= 0 && !(!me.grounded && def.moves[slot].oncePerAirtime && me.airUsed.includes(slot));

    // Long-range specials.
    const special = def.moves.special;
    if (me.grounded && Math.abs(dy) < 50 && ready('special') && special.behavior?.type === 'projectile') {
      const kind = special.behavior.kind;
      const ownShotOut = m.projectiles.some((p) => p.owner === me.id && p.kind === kind);
      const inBand = kind === 'web' ? adx > 110 && adx < 480
        : kind === 'batarang' ? adx > 140 && adx < 520
          : kind === 'rifle' ? adx > 150 && adx < 760
            : adx > 180 && adx < 900;
      const odds = kind === 'beam' ? 0.18 : 0.28;
      if (!ownShotOut && inBand && Math.abs(dy) < 40 && foe.action !== 'hitstun' && this.chance(odds)) {
        // Kamehameha: smarter CPUs charge longer from farther away.
        const chargeMax = special.charge?.maxFrames ?? 0;
        const charge = chargeMax === 0 ? 0 : prof.smart
          ? Math.min(chargeMax, Math.round((adx - 150) / 12))
          : Math.floor(nextRandom(this.rng) * chargeMax * 0.5);
        this.press({ button: 'special', dir, hold: chargeMax ? special.startup + charge : undefined });
        return true;
      }
    }
    if (me.grounded && Math.abs(dy) < 50 && ready('special')) {
      if (me.fighter === 'luigi' && adx > 220 && adx < 620 && this.chance(0.25)) {
        const charge = prof.smart ? Math.min(55, Math.round((adx - 200) / 7)) : Math.floor(nextRandom(this.rng) * 40);
        this.press({ button: 'special', dir, hold: charge + 10 });
        return true;
      }
      const vanishTo = me.x + dir * (FIGHTERS.sheik.moves.special.behavior?.type === 'vanish' ? FIGHTERS.sheik.moves.special.behavior.distance : 0);
      const staysOnStage = vanishTo > stage.x1 + 40 && vanishTo < stage.x2 - 40;
      if (me.fighter === 'sheik' && staysOnStage && adx > 170 && adx < 300 && this.chance(0.12)) {
        this.press({ button: 'special', dir });
        return true;
      }
    }

    const candidates: MoveSlot[] = me.grounded ? ['light', 'heavy', 'special'] : ['aerial', 'heavy'];
    // Close-range specials (Judge, Rasengan) are picked like normal attacks; movement/projectile
    // specials (rocket, vanish, web, batarang, beam) are handled above.
    const meleeSpecial = !special.behavior || special.behavior.type === 'judge';
    if (meleeSpecial && !me.grounded) candidates.push('special');
    const quick: MoveSlot = me.grounded ? 'light' : 'aerial';
    const chainCapped = this.foeFree < BREATHER_FRAMES && this.jabChain >= prof.maxJabChain;
    const hits = candidates.filter((slot) => {
      if (!ready(slot)) return false;
      if (slot === quick && chainCapped) return false;
      if (slot === 'special' && !meleeSpecial) return false;
      // Key Drop, dive kicks and dashing specials (Rasengan) can carry a fighter offstage.
      if ((slot === 'aerial' || (slot === 'special' && !me.grounded)) && !overStage) return false;
      if (slot === 'special' && special.impulse?.vx && !this.safeToMove({ ...me, grounded: true }, stage, dir)) return false;
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
    // Chargeable heavies (Goku): smart CPUs charge a little into a stunned or slow opponent.
    const move = def.moves[slot];
    const hold = move.charge
      ? move.startup + (prof.smart && foe.action === 'hitstun' ? Math.min(move.charge.maxFrames, 12) : 0)
      : undefined;
    this.press({ button: slot === 'aerial' ? 'light' : slot, dir, hold });
    return true;
  }

  private safeToMove(me: FighterState, g: StageGeo, dir: number): boolean {
    if (!me.grounded || dir === 0) return true;
    const margin = 30;
    return !((dir < 0 && me.x < g.x1 + margin) || (dir > 0 && me.x > g.x2 - margin));
  }

  /** Dodge or hop over an enemy projectile that is about to hit. Returns true if it reacted. */
  private dodgeProjectile(m: MatchState, me: FighterState): boolean {
    const actionable = me.action === 'idle' || me.action === 'run' || me.action === 'air';
    if (!actionable || !m.projectiles.length) return false;
    for (const p of m.projectiles) {
      if (p.owner === me.id) continue;
      const key = `proj:${p.id}`;
      if (key === this.dodgedKey) continue;
      const dx = me.x - p.x;
      const approaching = p.vx !== 0 && Math.sign(p.vx) === Math.sign(dx);
      const sameHeight = Math.abs(me.y - 40 - p.y) < 60;
      // React when the projectile is ~12-20 frames away; reaction time eats into that window.
      const framesAway = Math.abs(dx) / (Math.abs(p.vx) / 60 || 1);
      if (!approaching || !sameHeight || framesAway > 20 || framesAway < 2) continue;
      this.dodgedKey = key;
      if (!this.chance(this.profile.dodgeRate)) return false;
      if (me.grounded && me.shieldHp > 35 && this.chance(0.7)) this.defend(m, me, Math.ceil(framesAway) + 8, 0);
      else if (canDodge(m, me)) this.press({ button: 'dodge', dir: 0, down: me.grounded });
      else if (me.grounded) this.press({ button: 'jump', dir: 0, hold: 10 }); // hop over it
      return true;
    }
    return false;
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

/** Same rule the simulation enforces: dodge cooldown, plus a limited number of air dodges per airtime. */
function canDodge(m: MatchState, me: FighterState): boolean {
  if (me.dodgeCooldown > 0) return false;
  return me.grounded || me.airDodgesUsed < m.rules.dodge.airDodgesPerAirtime;
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

/** The CPU's view of a stage's solid ground — works for any layout (flat, stepped, multi-platform). */
interface StageGeo {
  x1: number;
  x2: number;
  centerX: number;
  /** Top of solid ground at x, or null over a gap. */
  topAt(x: number): number | null;
  /** Top of the ledge on the given side (-1 left, 1 right). */
  edgeTop(side: number): number;
}

const geoCache = new WeakMap<StageDef, StageGeo>();

function stageGeo(stage: StageDef): StageGeo {
  let g = geoCache.get(stage);
  if (!g) {
    const { x1, x2 } = solidExtent(stage);
    const leftTop = solidSurfaceAt(stage, x1 + 1) ?? 0;
    const rightTop = solidSurfaceAt(stage, x2 - 1) ?? 0;
    g = {
      x1, x2, centerX: (x1 + x2) / 2,
      topAt: (x) => solidSurfaceAt(stage, x),
      edgeTop: (side) => (side < 0 ? leftTop : rightTop),
    };
    geoCache.set(stage, g);
  }
  return g;
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
