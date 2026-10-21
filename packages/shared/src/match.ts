import { DT, DEFAULT_RULES, type RulesConfig } from './config';
import {
  hitboxRect, hitstopFrames, hitstunFrames, hurtboxRect, knockbackSpeed, launchVector,
} from './combat';
import {
  chargeFrames, FIGHTERS, hitboxWindow, moveTotalFrames,
  type FighterDef, type FighterId, type HitboxDef, type HitEffect, type MoveDef, type MoveSlot,
  type ProjectileBehavior, type ProjectileKind, type RestrainKind,
} from './fighters';
import { approach, clamp, lerp, rectsOverlap } from './geometry';
import { emptyInput, type InputFrame } from './input';
import { nextRandom, randomInt } from './rng';
import { SKYFALL_ARENA, stageLedges, type Ledge, type Platform, type StageDef } from './stage';

export type FighterAction =
  | 'idle' | 'run' | 'air' | 'attack' | 'hitstun' | 'dodge' | 'landing' | 'dead' | 'respawning'
  // Ledges: hanging, then climbing up or rolling onto the stage.
  | 'ledge' | 'ledgeClimb' | 'ledgeRoll'
  // Shields: held, the lag after dropping it, and the helpless stun after it breaks.
  | 'shield' | 'shieldRelease' | 'shieldBreak';

export type BufferedAction = 'light' | 'heavy' | 'special' | 'dodge';

export interface FighterMatchStats {
  kos: number;
  falls: number;
  damageDealt: number;
  damageTaken: number;
}

export interface FighterState {
  id: number;
  fighter: FighterId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Knockback velocity, tracked separately so it can decay independently of gravity. */
  kbx: number;
  kby: number;
  facing: 1 | -1;
  grounded: boolean;
  jumpsUsed: number;
  coyote: number;
  jumpBuffer: number;
  /** True while the jump button is still held after a jump (enables short hops). */
  jumpHeld: boolean;
  dropThrough: number;
  fastFalling: boolean;
  action: FighterAction;
  /** Frames into the current attack/dodge, or remaining landing lag. */
  actionFrame: number;
  move: MoveSlot | null;
  hitVictims: string[];
  judgeValue: number;
  charge: number;
  misfire: boolean;
  rocketLaunched: boolean;
  teleport: { dx: number; dy: number } | null;
  damage: number;
  stocks: number;
  eliminated: boolean;
  eliminatedAt: number;
  hitstun: number;
  hitstop: number;
  invuln: number;
  dodgeCooldown: number;
  cooldowns: Record<MoveSlot, number>;
  airUsed: MoveSlot[];
  airBoostUsed: boolean;
  /** Air dodges used since last touching the ground (or being hit). */
  airDodgesUsed: number;
  /** Hits taken in the current combo (resets after `comboResetFrames` of freedom). */
  comboHits: number;
  /** Consecutive frames this fighter has been free of hitstun/hitstop. */
  freeFrames: number;
  /** Frames left restrained (web or Force Choke), set from the move's fixed hitstun. */
  restrained: number;
  restrainKind: RestrainKind | null;
  buffer: { action: BufferedAction; frames: number } | null;
  respawnTimer: number;
  lastHitBy: number | null;
  /** The ledge being hung from / climbed (null otherwise). */
  ledge: Ledge | null;
  /** Frames until any ledge can be grabbed again. */
  ledgeCooldown: number;
  /** Ledge grabs since last landing or being hit. */
  ledgeGrabs: number;
  /** Ledge invulnerability already granted this airtime. */
  ledgeInvulnUsed: boolean;
  shieldHp: number;
  /** Frames before shield health starts regenerating. */
  shieldRegenDelay: number;
  /** Frames the shield is locked up after blocking a hit. */
  shieldStun: number;
  prevInput: InputFrame;
  stats: FighterMatchStats;
}

export type GameEvent =
  | { type: 'countdown'; value: number }
  | { type: 'jump'; id: number; double: boolean; x: number; y: number }
  /** `hard` = landing out of a strong launch (for visual feedback only). */
  | { type: 'land'; id: number; x: number; y: number; hard: boolean }
  | { type: 'attack'; id: number; slot: MoveSlot; moveId: string }
  | { type: 'judge'; id: number; value: number }
  | { type: 'rocket'; id: number; misfire: boolean; charge: number }
  | { type: 'vanish'; id: number; fromX: number; fromY: number }
  | { type: 'projectile'; id: number; projectileId: number; kind: ProjectileKind; x: number; y: number; charge: number }
  | { type: 'projectileEnd'; projectileId: number; kind: ProjectileKind; x: number; y: number; hit: boolean }
  | { type: 'webzip'; id: number; anchorX: number; anchorY: number }
  | {
    type: 'hit'; attacker: number; victim: number; damage: number; x: number; y: number;
    launchSpeed: number; launchX: number; launchY: number; hitstun: number; hitstop: number;
    /** Set when the hit came from a projectile. */
    projectile?: ProjectileKind;
  }
  | { type: 'dodge'; id: number }
  | { type: 'ko'; id: number; x: number; y: number; by: number | null }
  | { type: 'respawn'; id: number }
  | { type: 'ledgeGrab'; id: number; x: number; y: number }
  | { type: 'ledgeAction'; id: number; kind: 'climb' | 'jump' | 'roll' | 'release' }
  | { type: 'shield'; id: number; up: boolean }
  | { type: 'shieldHit'; attacker: number; victim: number; x: number; y: number; shieldDamage: number; health: number }
  | { type: 'shieldBreak'; id: number; x: number; y: number }
  | { type: 'eliminated'; id: number }
  | { type: 'matchEnd'; winner: number | null; reason: 'stocks' | 'time' };

export type MatchPhase = 'countdown' | 'playing' | 'ended';

/** A live projectile (web, batarang, energy beam). Plain data so match state stays serializable. */
export interface ProjectileState {
  id: number;
  owner: number;
  kind: ProjectileKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  age: number;
  life: number;
  speed: number;
  returnAfter: number;
  returning: boolean;
  piercing: boolean;
  /** Where it was fired from (beams render from here to the head). */
  originX: number;
  originY: number;
  /** Hit values, fixed at launch (including any charge bonus). */
  hit: HitEffect;
  hitVictims: number[];
}

export interface MatchState {
  frame: number;
  phase: MatchPhase;
  countdown: number;
  timeLeft: number;
  rngState: number;
  rules: RulesConfig;
  stage: StageDef;
  fighters: FighterState[];
  projectiles: ProjectileState[];
  nextProjectileId: number;
  winner: number | null;
  endReason: 'stocks' | 'time' | null;
  events: GameEvent[];
}

export interface PlayerSetup {
  fighter: FighterId;
}

export interface MatchOptions {
  rules?: RulesConfig;
  stage?: StageDef;
  seed?: number;
}

export function createFighter(id: number, fighter: FighterId, stage: StageDef, stocks: number, rules: RulesConfig = DEFAULT_RULES): FighterState {
  const spawn = stage.spawns[id % stage.spawns.length];
  return {
    id,
    fighter,
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    kbx: 0,
    kby: 0,
    facing: spawn.x <= 0 ? 1 : -1,
    grounded: true,
    jumpsUsed: 0,
    coyote: 0,
    jumpBuffer: 0,
    jumpHeld: false,
    dropThrough: 0,
    fastFalling: false,
    action: 'idle',
    actionFrame: 0,
    move: null,
    hitVictims: [],
    judgeValue: 0,
    charge: 0,
    misfire: false,
    rocketLaunched: false,
    teleport: null,
    damage: 0,
    stocks,
    eliminated: false,
    eliminatedAt: -1,
    hitstun: 0,
    hitstop: 0,
    invuln: 0,
    dodgeCooldown: 0,
    cooldowns: { light: 0, heavy: 0, special: 0, aerial: 0 },
    airUsed: [],
    airBoostUsed: false,
    airDodgesUsed: 0,
    comboHits: 0,
    freeFrames: 999,
    restrained: 0,
    restrainKind: null,
    buffer: null,
    respawnTimer: 0,
    lastHitBy: null,
    ledge: null,
    ledgeCooldown: 0,
    ledgeGrabs: 0,
    ledgeInvulnUsed: false,
    shieldHp: FIGHTERS[fighter].stats.shieldMax ?? rules.shield.maxHealth,
    shieldRegenDelay: 0,
    shieldStun: 0,
    prevInput: emptyInput(),
    stats: { kos: 0, falls: 0, damageDealt: 0, damageTaken: 0 },
  };
}

export function createMatch(players: PlayerSetup[], options: MatchOptions = {}): MatchState {
  const rules = options.rules ?? DEFAULT_RULES;
  const stage = options.stage ?? SKYFALL_ARENA;
  return {
    frame: 0,
    phase: rules.countdownFrames > 0 ? 'countdown' : 'playing',
    countdown: rules.countdownFrames,
    timeLeft: rules.matchFrames,
    rngState: (options.seed ?? 0x1234abcd) >>> 0,
    rules,
    stage,
    fighters: players.map((p, i) => createFighter(i, p.fighter, stage, rules.stocks, rules)),
    projectiles: [],
    nextProjectileId: 1,
    winner: null,
    endReason: null,
    events: [],
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function fighterDef(f: FighterState): FighterDef {
  return FIGHTERS[f.fighter];
}

export function currentMove(f: FighterState): MoveDef | null {
  return f.move ? FIGHTERS[f.fighter].moves[f.move] : null;
}

export function isActionable(f: FighterState): boolean {
  return f.action === 'idle' || f.action === 'run' || f.action === 'air';
}

export function isIntangible(f: FighterState, rules: RulesConfig): boolean {
  if (f.action === 'dead' || f.action === 'respawning' || f.eliminated) return true;
  if (f.invuln > 0) return true;
  if (f.action === 'ledgeClimb' && f.actionFrame < rules.ledge.climbIntangibleFrames) return true;
  if (f.action === 'ledgeRoll' && f.actionFrame < rules.ledge.rollIntangibleFrames) return true;
  if (f.action === 'dodge' && f.actionFrame < rules.dodge.invulnFrames) return true;
  const move = currentMove(f);
  if (f.action === 'attack' && move?.intangible) {
    const [s, e] = move.intangible;
    if (f.actionFrame >= s && f.actionFrame < e) return true;
  }
  return false;
}

/** Hitboxes of `f` that are active on its current frame. */
export function activeHitboxes(f: FighterState): HitboxDef[] {
  if (f.action !== 'attack') return [];
  const move = currentMove(f);
  if (!move) return [];
  if (move.behavior?.type === 'rocket' && !f.rocketLaunched) return [];
  return move.hitboxes.filter((hb) => {
    const [s, e] = hitboxWindow(move, hb);
    return f.actionFrame >= s && f.actionFrame < e;
  });
}

/** Ranks fighters: survivors first, then by stocks, elimination time, and damage. */
export function standings(m: MatchState): FighterState[] {
  return [...m.fighters].sort((a, b) => {
    if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
    if (a.stocks !== b.stocks) return b.stocks - a.stocks;
    if (a.eliminatedAt !== b.eliminatedAt) return b.eliminatedAt - a.eliminatedAt;
    return a.damage - b.damage;
  });
}

// ---------------------------------------------------------------------------
// Step
// ---------------------------------------------------------------------------

/** Advances the match by one fixed 60 Hz frame. Returns the events produced this frame. */
export function stepMatch(m: MatchState, inputs: InputFrame[]): GameEvent[] {
  m.events = [];
  if (m.phase === 'ended') return m.events;

  if (m.phase === 'countdown') {
    if (m.countdown % 60 === 0) m.events.push({ type: 'countdown', value: m.countdown / 60 });
    m.countdown--;
    for (let i = 0; i < m.fighters.length; i++) m.fighters[i].prevInput = { ...(inputs[i] ?? emptyInput()) };
    if (m.countdown <= 0) {
      m.phase = 'playing';
      m.events.push({ type: 'countdown', value: 0 });
    }
    return m.events;
  }

  m.frame++;
  for (let i = 0; i < m.fighters.length; i++) {
    updateFighter(m, m.fighters[i], inputs[i] ?? emptyInput());
  }
  updateProjectiles(m);
  resolveHits(m);
  for (const f of m.fighters) {
    checkBlastZone(m, f);
    f.freeFrames = f.action === 'hitstun' || f.hitstop > 0 ? 0 : f.freeFrames + 1;
    if (f.action !== 'hitstun' || f.restrained <= 0) {
      f.restrained = 0;
      f.restrainKind = null;
    } else if (f.hitstop === 0) {
      f.restrained--;
    }
  }

  if (m.rules.timed) m.timeLeft = Math.max(0, m.timeLeft - 1);
  checkMatchEnd(m);
  return m.events;
}

function updateBuffers(m: MatchState, f: FighterState, input: InputFrame): void {
  const prev = f.prevInput;
  const pressed = (k: keyof InputFrame) => input[k] && !prev[k];
  if (pressed('jump')) f.jumpBuffer = m.rules.jumpBufferFrames;
  else if (f.jumpBuffer > 0) f.jumpBuffer--;

  const frames = m.rules.attackBufferFrames;
  if (pressed('special')) f.buffer = { action: 'special', frames };
  else if (pressed('heavy')) f.buffer = { action: 'heavy', frames };
  else if (pressed('light')) f.buffer = { action: 'light', frames };
  else if (pressed('dodge')) f.buffer = { action: 'dodge', frames };
  else if (f.buffer && --f.buffer.frames <= 0) f.buffer = null;
}

function updateFighter(m: MatchState, f: FighterState, input: InputFrame): void {
  if (f.eliminated) {
    f.prevInput = { ...input };
    return;
  }
  updateBuffers(m, f, input);

  if (f.hitstop > 0) {
    f.hitstop--;
    f.prevInput = { ...input };
    return;
  }

  if (f.invuln > 0) f.invuln--;
  if (f.dodgeCooldown > 0) f.dodgeCooldown--;
  if (f.dropThrough > 0) f.dropThrough--;
  if (f.ledgeCooldown > 0) f.ledgeCooldown--;
  regenShield(m, f);
  if (!f.grounded && f.coyote > 0) f.coyote--;
  for (const k of Object.keys(f.cooldowns) as MoveSlot[]) if (f.cooldowns[k] > 0) f.cooldowns[k]--;

  if (f.action === 'dead') {
    if (--f.respawnTimer <= 0) respawn(m, f);
    f.prevInput = { ...input };
    return;
  }

  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);

  if (f.action === 'respawning') {
    f.respawnTimer--;
    const wantsToLeave = dir !== 0 || input.down || f.jumpBuffer > 0 || f.buffer !== null;
    if (f.respawnTimer <= 0 || wantsToLeave) {
      f.action = 'air';
      f.invuln = m.rules.respawnInvulnFrames;
      f.jumpsUsed = 1;
    } else {
      f.prevInput = { ...input };
      return;
    }
  }

  if (f.action === 'ledge' || f.action === 'ledgeClimb' || f.action === 'ledgeRoll') {
    // Hanging and ledge get-ups are fully scripted: no gravity, no free movement.
    updateLedge(m, f, input, dir);
    f.prevInput = { ...input };
    return;
  }

  switch (f.action) {
    case 'hitstun':
      if (--f.hitstun <= 0) f.action = f.grounded ? 'idle' : 'air';
      break;
    case 'shield':
      updateShield(m, f, input, dir);
      break;
    case 'shieldRelease':
      if (--f.actionFrame <= 0) f.action = f.grounded ? 'idle' : 'air';
      break;
    case 'shieldBreak':
      if (--f.actionFrame <= 0) {
        f.action = f.grounded ? 'idle' : 'air';
        f.shieldHp = Math.max(f.shieldHp, m.rules.shield.breakRecoverHealth);
        f.shieldRegenDelay = 0;
      }
      break;
    case 'landing':
      if (--f.actionFrame <= 0) f.action = 'idle';
      break;
    case 'dodge':
      if (++f.actionFrame >= m.rules.dodge.totalFrames) f.action = f.grounded ? 'idle' : 'air';
      break;
    case 'attack':
      updateAttack(m, f, input, dir);
      break;
    default:
      break;
  }

  if (isActionable(f)) tryActions(m, f, input, dir);
  physics(m, f, input, dir);
  f.prevInput = { ...input };
}

function tryActions(m: MatchState, f: FighterState, input: InputFrame, dir: number): void {
  const def = fighterDef(f);
  const s = def.stats;

  if (f.buffer?.action === 'dodge') {
    if (f.grounded) {
      // Ground: dodge + direction = roll, dodge + down = spot dodge, dodge alone = shield.
      const roll = dir !== 0;
      const spot = !roll && input.down;
      if ((roll || spot) && f.dodgeCooldown <= 0) {
        startDodge(m, f, input, roll ? dir : 0);
        f.buffer = null;
        return;
      }
      if ((!roll && !spot) || input.dodge) {
        startShield(m, f);
        f.buffer = null;
        return;
      }
    } else {
      const airDodgeSpent = f.airDodgesUsed >= m.rules.dodge.airDodgesPerAirtime;
      if (f.dodgeCooldown <= 0 && !airDodgeSpent) {
        startDodge(m, f, input, dir);
        f.buffer = null;
        return;
      }
    }
  } else if (f.buffer) {
    let slot: MoveSlot = f.buffer.action as MoveSlot;
    if (!f.grounded && slot === 'light') slot = 'aerial';
    const move = def.moves[slot];
    const blockedInAir = !f.grounded && move.oncePerAirtime && f.airUsed.includes(slot);
    if (f.cooldowns[slot] <= 0 && !blockedInAir) {
      startMove(m, f, slot, dir);
      f.buffer = null;
      return;
    }
  }

  // Still holding the shield button (e.g. landed or finished a move while holding it): shield up.
  if (f.grounded && input.dodge && f.prevInput.dodge && dir === 0 && !input.down && f.jumpBuffer === 0 && f.shieldHp >= 1) {
    startShield(m, f);
    return;
  }

  // Drop through a one-way platform.
  if (f.grounded && input.down && !f.prevInput.down && standingPlatform(m, f)?.oneWay) {
    f.dropThrough = m.rules.dropThroughFrames;
    f.grounded = false;
    f.y += 2;
    f.vy = m.rules.movement.dropThroughSpeed;
    f.action = 'air';
    return;
  }

  if (f.jumpBuffer > 0) {
    if ((f.grounded || f.coyote > 0) && f.jumpsUsed === 0) {
      f.vy = -s.jumpVelocity;
      f.grounded = false;
      f.coyote = 0;
      f.jumpsUsed = 1;
      f.jumpBuffer = 0;
      f.jumpHeld = true;
      f.fastFalling = false;
      f.action = 'air';
      m.events.push({ type: 'jump', id: f.id, double: false, x: f.x, y: f.y });
    } else if (!f.grounded && Math.max(f.jumpsUsed, 1) < s.maxJumps) {
      f.jumpsUsed = Math.max(f.jumpsUsed, 1) + 1;
      f.vy = -s.doubleJumpVelocity;
      f.kby = Math.min(f.kby, 0);
      if (dir !== 0) {
        f.vx = dir * s.airSpeed;
        f.facing = dir as 1 | -1;
      }
      f.jumpBuffer = 0;
      f.jumpHeld = true;
      f.fastFalling = false;
      m.events.push({ type: 'jump', id: f.id, double: true, x: f.x, y: f.y });
    }
  }
}

function startDodge(m: MatchState, f: FighterState, input: InputFrame, dir: number): void {
  const d = m.rules.dodge;
  f.action = 'dodge';
  f.actionFrame = 0;
  f.dodgeCooldown = d.cooldownFrames;
  f.fastFalling = false;
  if (f.grounded) {
    f.vx = dir * d.rollSpeed;
  } else {
    f.airDodgesUsed++;
    const dy = input.up || input.jump ? -1 : input.down ? 1 : 0;
    const len = Math.hypot(dir, dy) || 1;
    if (dir !== 0 || dy !== 0) {
      f.vx = (dir / len) * d.airDodgeSpeed;
      f.vy = (dy / len) * d.airDodgeSpeed;
    } else {
      f.vy *= m.rules.movement.neutralAirDodgeDamping;
    }
  }
  m.events.push({ type: 'dodge', id: f.id });
}

function startMove(m: MatchState, f: FighterState, slot: MoveSlot, dir: number): void {
  const move = fighterDef(f).moves[slot];
  f.action = 'attack';
  f.move = slot;
  f.actionFrame = 0;
  f.hitVictims = [];
  f.charge = 0;
  f.misfire = false;
  f.rocketLaunched = false;
  f.judgeValue = 0;
  f.teleport = null;
  if (dir !== 0) f.facing = dir as 1 | -1;
  if (!f.grounded && move.oncePerAirtime) f.airUsed.push(slot);
  m.events.push({ type: 'attack', id: f.id, slot, moveId: move.id });

  if (move.behavior?.type === 'judge') {
    const outcomes = move.behavior.outcomes;
    const outcome = outcomes[randomInt(m, 0, outcomes.length - 1)];
    f.judgeValue = outcome.value;
    if (outcome.selfDamage) {
      f.damage = clamp(f.damage + outcome.selfDamage, 0, m.rules.combat.maxDamage);
    }
    m.events.push({ type: 'judge', id: f.id, value: outcome.value });
  }
}

function endMove(f: FighterState, move: MoveDef): void {
  if (f.move) f.cooldowns[f.move] = move.cooldown;
  f.move = null;
  f.action = f.grounded ? 'idle' : 'air';
  f.teleport = null;
}

function updateAttack(m: MatchState, f: FighterState, input: InputFrame, dir: number): void {
  const move = currentMove(f);
  if (!move) {
    f.action = f.grounded ? 'idle' : 'air';
    return;
  }
  const b = move.behavior;

  // Chargeable moves (Luigi's rocket, Goku's strike & Kamehameha): hold the move's button on the
  // last startup frame to charge.
  const maxCharge = chargeFrames(move);
  const button = f.move === 'aerial' ? 'light' : f.move;
  if (
    maxCharge > 0 && button && f.actionFrame === move.startup - 1 && !f.rocketLaunched &&
    input[button] && f.charge < maxCharge
  ) {
    f.charge++;
    return;
  }

  f.actionFrame++;
  const fr = f.actionFrame;

  if (b?.type === 'rocket' && fr === move.startup) {
    const ratio = f.charge / b.maxChargeFrames;
    f.misfire = nextRandom(m) < b.misfireChance;
    const speed = f.misfire ? b.misfireSpeed : lerp(b.minSpeed, b.maxSpeed, ratio);
    f.vx = f.facing * speed;
    f.vy = 0;
    f.rocketLaunched = true;
    m.events.push({ type: 'rocket', id: f.id, misfire: f.misfire, charge: ratio });
  }

  if (b?.type === 'vanish' && fr === move.startup) {
    let dx = dir;
    const dy = input.up || input.jump ? -1 : input.down ? 1 : 0;
    if (dx === 0 && dy === 0) dx = f.facing;
    const len = Math.hypot(dx, dy);
    f.teleport = { dx: (dx / len) * b.distance, dy: (dy / len) * b.distance };
    if (dx !== 0) f.facing = (dx > 0 ? 1 : -1);
    m.events.push({ type: 'vanish', id: f.id, fromX: f.x, fromY: f.y });
    f.vx = 0;
    f.vy = 0;
    f.kbx = 0;
    f.kby = 0;
    if (f.teleport.dy < 0) f.grounded = false;
  }

  if (b?.type === 'projectile' && fr === move.startup) {
    if (b.airUpZip && !f.grounded && (input.up || input.jump)) {
      // Web-zip: pull upward instead of firing.
      f.vx = b.airUpZip.vx * f.facing;
      f.vy = b.airUpZip.vy;
      f.kbx = 0;
      f.kby = 0;
      f.fastFalling = false;
      m.events.push({ type: 'webzip', id: f.id, anchorX: f.x + f.facing * 110, anchorY: f.y - 300 });
    } else {
      spawnProjectile(m, f, move, b);
    }
  }

  const imp = move.impulse;
  if (imp && fr === imp.frame) {
    const allowed = (!imp.airOnly || !f.grounded) && !(imp.oncePerAirtime && f.airBoostUsed);
    if (allowed) {
      if (imp.vx !== undefined) f.vx = imp.vx * f.facing;
      if (imp.vy !== undefined) f.vy = imp.vy;
      if (imp.vy !== undefined && imp.vy < 0) f.grounded = false;
      if (imp.oncePerAirtime) f.airBoostUsed = true;
    }
  }

  if (fr >= moveTotalFrames(move)) endMove(f, move);
}

function rocketFlying(f: FighterState, move: MoveDef | null): boolean {
  return (
    !!move && move.behavior?.type === 'rocket' && f.rocketLaunched &&
    f.actionFrame >= move.startup && f.actionFrame < move.startup + move.active
  );
}

function physics(m: MatchState, f: FighterState, input: InputFrame, dir: number): void {
  const s = fighterDef(f).stats;
  const move = f.action === 'attack' ? currentMove(f) : null;
  const flying = rocketFlying(f, move);
  const vanishing = move?.behavior?.type === 'vanish' && f.actionFrame < move.startup;

  const mv = m.rules.movement;
  const cb = m.rules.combat;

  // Fast fall: hold (or tap) down in the air once past the peak of a jump.
  if (!f.grounded && input.down && !f.fastFalling && f.vy > mv.fastFallMinVy &&
      (isActionable(f) || f.action === 'attack')) {
    f.fastFalling = true;
    f.vy = Math.max(f.vy, s.fastFallSpeed);
  }

  // Horizontal control
  if (f.action === 'hitstun') {
    if (f.grounded) f.vx = approach(f.vx, 0, s.groundFriction * DT);
    // Stunned fighters can still steer a little (helps recovery without cancelling the launch).
    else f.vx = approach(f.vx, dir * s.airSpeed * cb.hitstunDriftSpeed, s.airAccel * cb.hitstunDriftAccel * DT);
  } else if (flying) {
    // Rocket keeps its launch speed.
  } else if (f.action === 'dodge') {
    const rolling = f.actionFrame < m.rules.dodge.invulnFrames;
    if (f.grounded) f.vx = approach(f.vx, 0, (rolling ? mv.rollFriction : mv.dodgeEndFriction) * s.groundFriction * DT);
    else f.vx = approach(f.vx, 0, s.airFriction * mv.dodgeEndFriction * DT);
  } else if (f.action === 'shield' || f.action === 'shieldRelease' || f.action === 'shieldBreak') {
    // Shielding roots you in place; blocked hits slide you back. A broken shield is helpless.
    f.vx = approach(f.vx, 0, (f.grounded ? s.groundFriction : s.airFriction) * DT);
  } else if (f.action === 'attack' || f.action === 'landing') {
    if (f.grounded) f.vx = approach(f.vx, 0, s.groundFriction * DT);
    else if (dir !== 0) f.vx = approach(f.vx, dir * s.airSpeed, s.airAccel * DT);
    else f.vx = approach(f.vx, 0, s.airFriction * DT);
  } else if (isActionable(f)) {
    if (f.grounded) {
      if (dir !== 0) {
        const turning = f.vx * dir < 0;
        const accel = turning ? s.groundAccel + s.groundFriction : s.groundAccel;
        f.vx = approach(f.vx, dir * s.runSpeed, accel * DT);
        f.facing = dir as 1 | -1;
        f.action = 'run';
      } else {
        f.vx = approach(f.vx, 0, s.groundFriction * DT);
        f.action = 'idle';
      }
    } else {
      if (dir !== 0) f.vx = approach(f.vx, dir * s.airSpeed, s.airAccel * DT);
      else f.vx = approach(f.vx, 0, s.airFriction * DT);
      f.action = 'air';
    }
  }

  // Force Choke: held suspended, rising slightly, with momentum bled off.
  const held = f.action === 'hitstun' && f.restrained > 0 && f.restrainKind === 'force';
  if (held) {
    f.vx = approach(f.vx, 0, s.groundFriction * DT);
    f.kbx = approach(f.kbx, 0, 3000 * DT);
  }

  // Vertical
  if (!f.grounded) {
    if (flying) {
      f.vy = 0;
    } else if (held) {
      f.vy = approach(f.vy, -25, 2000 * DT);
      f.kby = approach(f.kby, 0, 3000 * DT);
    } else if (vanishing) {
      f.vy *= 0.8;
    } else {
      const cap = f.fastFalling ? s.fastFallSpeed : s.maxFallSpeed;
      // Never slow a fighter that is already faster than the cap (e.g. Key Drop impulse).
      if (f.vy < cap) f.vy = Math.min(f.vy + s.gravity * DT, cap);
    }
    // Variable jump height: releasing jump early cuts the rise.
    if (f.jumpHeld && !input.jump && f.vy < 0 && f.action !== 'hitstun') {
      f.vy *= mv.shortHopCut;
      f.jumpHeld = false;
    }
    if (f.vy >= 0) f.jumpHeld = false;
  }

  if (f.grounded && f.kby < 0) f.grounded = false;

  const prevX = f.x;
  const prevY = f.y;
  f.x += (f.vx + f.kbx) * DT + (f.teleport?.dx ?? 0);
  f.y += (f.vy + f.kby) * DT + (f.teleport?.dy ?? 0);
  f.teleport = null;

  // Knockback decays linearly along its direction.
  const kbMag = Math.hypot(f.kbx, f.kby);
  if (kbMag > 0) {
    const next = Math.max(0, kbMag - cb.knockbackDecay * DT);
    f.kbx *= next / kbMag;
    f.kby *= next / kbMag;
  }

  const wasGrounded = f.grounded;
  collide(m, f, prevX, prevY);

  if (wasGrounded && f.grounded && !standingPlatform(m, f)) {
    f.grounded = false;
    if (isActionable(f)) f.coyote = m.rules.coyoteFrames;
  }
  // Shields only exist on the ground (pushed off an edge → falling).
  if ((f.action === 'shield' || f.action === 'shieldRelease') && !f.grounded) {
    f.action = 'air';
    f.shieldStun = 0;
  }
  tryLedgeGrab(m, f, input);
}

function withinPlatformX(p: Platform, x: number, tolerance: number): boolean {
  return x >= p.x1 - tolerance && x <= p.x2 + tolerance;
}

export function standingPlatform(m: MatchState, f: FighterState): Platform | null {
  for (const p of m.stage.platforms) {
    if (p.oneWay && f.dropThrough > 0) continue;
    if (Math.abs(f.y - p.y) < 0.5 && withinPlatformX(p, f.x, m.rules.movement.edgeTolerance)) return p;
  }
  return null;
}

function collide(m: MatchState, f: FighterState, prevX: number, prevY: number): void {
  const s = fighterDef(f).stats;
  const hw = s.width / 2;
  const movingDown = f.vy + f.kby >= 0;
  const tol = m.rules.movement.edgeTolerance;
  const cb = m.rules.combat;

  for (const p of m.stage.platforms) {
    const top = p.y;
    if (p.oneWay) {
      if (f.dropThrough > 0 || f.grounded) continue;
      if (movingDown && prevY <= top + 0.01 && f.y >= top && withinPlatformX(p, f.x, tol)) land(m, f, top);
      continue;
    }

    const bottom = p.y + p.height;
    const overlapX = f.x + hw > p.x1 && f.x - hw < p.x2;
    if (!f.grounded && movingDown && prevY <= top + 0.01 && f.y >= top && withinPlatformX(p, f.x, tol)) {
      land(m, f, top);
    } else if (prevY - s.height >= bottom - 0.01 && f.y - s.height < bottom && overlapX) {
      // Bonk the underside.
      f.y = bottom + s.height;
      if (f.vy < 0) f.vy = 0;
      if (f.kby < 0) f.kby = -f.kby * cb.ceilingBounceRestitution;
    } else if (f.y > top + 0.01 && f.y - s.height < bottom && overlapX) {
      const center = (p.x1 + p.x2) / 2;
      const towardStage = (f.x < center && f.vx + f.kbx > 0) || (f.x > center && f.vx + f.kbx < 0);
      const rising = f.vy + f.kby < 0;
      // Steps between platforms (not real ledges) are climbed automatically; at a real ledge an
      // airborne fighter must grab it instead, unless their feet are already at the lip.
      const corner: 1 | -1 = f.x < center ? 1 : -1;
      const autoStep = f.grounded || f.y - top <= 12 || !isLedgeCorner(m, p, corner);
      if (autoStep && f.y - top <= m.rules.ledgeSnap && f.action !== 'hitstun' && (towardStage || rising)) {
        // Close enough to the lip of a step: pop up onto the platform.
        f.x = clamp(f.x, p.x1 + 2, p.x2 - 2);
        f.vy = Math.min(f.vy, 0);
        f.kby = 0;
        land(m, f, top);
      } else {
        f.x = prevX <= center ? p.x1 - hw : p.x2 + hw;
        if (f.x < center ? f.vx > 0 : f.vx < 0) f.vx = 0;
        f.kbx = -f.kbx * cb.wallBounceRestitution;
      }
    }
  }
}

function land(m: MatchState, f: FighterState, top: number): void {
  f.y = top;
  const s = fighterDef(f).stats;
  const cb = m.rules.combat;
  const impact = f.vy + f.kby;
  if (f.kby > cb.groundBounceSpeed) {
    // Spiked into the ground hard enough to bounce.
    f.kby = -f.kby * cb.groundBounceRestitution;
    f.vy = 0;
    return;
  }
  const wasAirborne = !f.grounded;
  f.grounded = true;
  f.vy = 0;
  f.kby = 0;
  f.jumpsUsed = 0;
  f.coyote = 0;
  f.fastFalling = false;
  f.jumpHeld = false;
  f.airUsed = [];
  f.airBoostUsed = false;
  f.airDodgesUsed = 0;
  f.ledgeGrabs = 0;
  f.ledgeInvulnUsed = false;
  if (f.action === 'hitstun') {
    // Hitting the floor ends a long tumble quickly instead of sliding around stunned.
    f.hitstun = Math.min(f.hitstun, cb.hitstunLandingCap);
  }
  if (wasAirborne) {
    const hard = f.action === 'hitstun' && impact > cb.hardLandingSpeed * 0.5 ||
      impact > cb.hardLandingSpeed;
    m.events.push({ type: 'land', id: f.id, x: f.x, y: f.y, hard });
    if (f.action === 'air') f.action = 'idle';
    const move = currentMove(f);
    if (f.action === 'attack' && move?.landingLag !== undefined) {
      if (f.move) f.cooldowns[f.move] = move.cooldown;
      f.move = null;
      f.action = 'landing';
      f.actionFrame = move.landingLag;
    }
  }
  // Clamp horizontal speed on landing so air speed doesn't carry into a run cap violation.
  const cap = s.runSpeed * m.rules.movement.landingSpeedCap;
  if (Math.abs(f.vx) > cap && f.action !== 'attack' && f.action !== 'hitstun') {
    f.vx = Math.sign(f.vx) * cap;
  }
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

interface PendingHit {
  attacker: FighterState;
  victim: FighterState;
  /**
   * Everything about the attack is captured when the overlap is detected, so that two fighters
   * hitting each other on the same frame (a trade) both take their hits — even though applying
   * the first hit interrupts the other fighter's attack.
   */
  move: MoveDef | null;
  values: HitValues;
  direction: 1 | -1;
  x: number;
  y: number;
  /** Projectile hits don't freeze the (distant) attacker. */
  projectile: ProjectileState | null;
}

function resolveHits(m: MatchState): void {
  const pending: PendingHit[] = [];
  for (const att of m.fighters) {
    if (att.hitstop > 0 || att.action !== 'attack') continue;
    const move = currentMove(att);
    const boxes = activeHitboxes(att);
    if (!move || boxes.length === 0) continue;
    for (const hb of boxes) {
      const rect = hitboxRect(att, hb);
      for (const vic of m.fighters) {
        if (vic === att || isIntangible(vic, m.rules)) continue;
        // One hit per hit group per move activation (multi-hit moves use several groups).
        const key = `${hb.group ?? 0}:${vic.id}`;
        if (att.hitVictims.includes(key)) continue;
        const hurt = hurtboxRect(vic, fighterDef(vic).stats);
        if (!rectsOverlap(rect, hurt)) continue;
        att.hitVictims.push(key);
        const x = (Math.max(rect.x, hurt.x) + Math.min(rect.x + rect.w, hurt.x + hurt.w)) / 2;
        const y = (Math.max(rect.y, hurt.y) + Math.min(rect.y + rect.h, hurt.y + hurt.h)) / 2;
        let direction: 1 | -1 = att.facing;
        if (hb.autoDirection && vic.x !== att.x) direction = vic.x > att.x ? 1 : -1;
        pending.push({
          attacker: att, victim: vic, move, values: resolveHitboxValues(att, move, hb), direction, x, y, projectile: null,
        });
      }
    }
  }

  // Projectiles use the same hurtboxes, intangibility rules and hit pipeline.
  for (const p of m.projectiles) {
    const owner = m.fighters[p.owner];
    const rect = projectileRect(p);
    for (const vic of m.fighters) {
      if (vic.id === p.owner || p.hitVictims.includes(vic.id) || isIntangible(vic, m.rules)) continue;
      const hurt = hurtboxRect(vic, fighterDef(vic).stats);
      if (!rectsOverlap(rect, hurt)) continue;
      p.hitVictims.push(vic.id);
      const direction: 1 | -1 = p.vx !== 0 ? (p.vx > 0 ? 1 : -1) : (vic.x >= p.x ? 1 : -1);
      pending.push({
        attacker: owner, victim: vic, move: null, values: hitEffectValues(p.hit), direction,
        x: (Math.max(rect.x, hurt.x) + Math.min(rect.x + rect.w, hurt.x + hurt.w)) / 2,
        y: (Math.max(rect.y, hurt.y) + Math.min(rect.y + rect.h, hurt.y + hurt.h)) / 2,
        projectile: p,
      });
      if (!p.piercing) p.life = 0; // non-piercing projectiles end on their first hit
    }
  }
  m.projectiles = m.projectiles.filter((p) => {
    if (p.life > 0) return true;
    m.events.push({ type: 'projectileEnd', projectileId: p.id, kind: p.kind, x: p.x, y: p.y, hit: p.hitVictims.length > 0 });
    return false;
  });

  for (const h of pending) applyHit(m, h);
}

export interface HitValues {
  damage: number;
  baseKnockback: number;
  knockbackGrowth: number;
  angle: number;
  hitstunMultiplier: number;
  stunFrames?: number;
  restrain?: RestrainKind;
  shieldDamage?: number;
  unblockable?: boolean;
}

function hitEffectValues(h: HitEffect): HitValues {
  return {
    damage: h.damage, baseKnockback: h.baseKnockback, knockbackGrowth: h.knockbackGrowth, angle: h.angle,
    hitstunMultiplier: h.hitstunMultiplier ?? 1, stunFrames: h.stunFrames, restrain: h.restrain,
    shieldDamage: h.shieldDamage, unblockable: h.unblockable,
  };
}

/** Applies a move's charge bonus (0 when uncharged) to hit values. */
function applyCharge(v: HitValues, move: MoveDef, charge: number): HitValues {
  if (!move.charge || charge <= 0) return v;
  const ratio = Math.min(1, charge / move.charge.maxFrames);
  return {
    ...v,
    damage: Math.round(v.damage * (1 + ratio * move.charge.damageBonus)),
    baseKnockback: v.baseKnockback * (1 + ratio * move.charge.knockbackBonus),
  };
}

export function projectileRect(p: ProjectileState) {
  return { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
}

function spawnProjectile(m: MatchState, f: FighterState, move: MoveDef, b: ProjectileBehavior): void {
  const x = f.x + b.offsetX * f.facing;
  const y = f.y + b.offsetY;
  const hit = applyCharge(hitEffectValues(b.hit), move, f.charge);
  const p: ProjectileState = {
    id: m.nextProjectileId++,
    owner: f.id,
    kind: b.kind,
    x, y,
    vx: b.speed * f.facing,
    vy: 0,
    w: b.w,
    h: b.h,
    age: 0,
    life: b.life,
    speed: b.speed,
    returnAfter: b.returnAfter ?? 0,
    returning: false,
    piercing: !!b.piercing,
    originX: x,
    originY: y,
    hit,
    hitVictims: [],
  };
  m.projectiles.push(p);
  const ratio = move.charge ? Math.min(1, f.charge / move.charge.maxFrames) : 0;
  m.events.push({ type: 'projectile', id: f.id, projectileId: p.id, kind: p.kind, x, y, charge: ratio });
}

function updateProjectiles(m: MatchState): void {
  const bz = m.stage.blastZone;
  for (const p of m.projectiles) {
    p.age++;
    p.life--;
    const owner = m.fighters[p.owner];
    // Boomerangs turn around and home back to their owner.
    if (p.returnAfter > 0 && p.age >= p.returnAfter && owner && owner.action !== 'dead' && !owner.eliminated) {
      p.returning = true;
      const tx = owner.x;
      const ty = owner.y - fighterDef(owner).stats.height * 0.6;
      const d = Math.hypot(tx - p.x, ty - p.y) || 1;
      p.vx = ((tx - p.x) / d) * p.speed;
      p.vy = ((ty - p.y) / d) * p.speed;
      if (d < 30) p.life = 0; // caught
    }
    p.x += p.vx * DT;
    p.y += p.vy * DT;
    if (p.x < bz.left || p.x > bz.right || p.y < bz.top || p.y > bz.bottom) p.life = 0;
    // Physical projectiles break on solid ground; energy beams pass over it.
    if (p.kind !== 'beam') {
      for (const pl of m.stage.platforms) {
        if (!pl.oneWay && p.x > pl.x1 && p.x < pl.x2 && p.y > pl.y && p.y < pl.y + pl.height) p.life = 0;
      }
    }
  }
}

/** Resolves the effective damage/knockback of a hitbox, accounting for move behaviors. */
export function resolveHitboxValues(f: FighterState, move: MoveDef, hb: HitboxDef): HitValues {
  let damage = hb.damage;
  let baseKnockback = hb.baseKnockback;
  let knockbackGrowth = hb.knockbackGrowth;
  let angle = hb.angle;
  let hitstunMultiplier = hb.hitstunMultiplier ?? 1;
  const b = move.behavior;
  if (b?.type === 'judge') {
    const o = b.outcomes.find((x) => x.value === f.judgeValue) ?? b.outcomes[0];
    damage = o.damage;
    baseKnockback = o.baseKnockback;
    knockbackGrowth = o.knockbackGrowth;
    angle = o.angle;
    hitstunMultiplier = o.hitstunMultiplier ?? 1;
  } else if (b?.type === 'rocket') {
    const ratio = f.charge / b.maxChargeFrames;
    damage = f.misfire ? b.misfireDamage : Math.round(lerp(b.minDamage, b.maxDamage, ratio));
    baseKnockback = f.misfire ? b.misfireBaseKnockback : lerp(b.minBaseKnockback, b.maxBaseKnockback, ratio);
  }
  return applyCharge(
    {
      damage, baseKnockback, knockbackGrowth, angle, hitstunMultiplier, stunFrames: hb.stunFrames, restrain: hb.restrain,
      shieldDamage: hb.shieldDamage, unblockable: hb.unblockable,
    },
    move,
    f.charge,
  );
}

function applyHit(m: MatchState, h: PendingHit): void {
  const { attacker: att, victim: vic, move, values: v, direction: dir } = h;
  const cb = m.rules.combat;
  if (vic.action === 'shield' && !v.unblockable) {
    applyShieldHit(m, h);
    return;
  }
  // A hit ends a shield break (and restores enough shield), and knocks fighters off ledges.
  if (vic.action === 'shieldBreak') vic.shieldHp = Math.max(vic.shieldHp, m.rules.shield.breakRecoverHealth);
  vic.shieldStun = 0;
  vic.ledge = null;
  vic.ledgeGrabs = 0;
  vic.ledgeInvulnUsed = false;

  vic.damage = Math.min(cb.maxDamage, vic.damage + v.damage);
  const speed = knockbackSpeed(vic.damage, v.damage, v.baseKnockback, v.knockbackGrowth, fighterDef(vic).stats.weight, cb.knockback);
  const launch = launchVector(v.angle, dir, speed);
  // A downward launch on a grounded fighter pops them up off the floor instead.
  if (vic.grounded && launch.y > 0) launch.y = -launch.y * cb.groundedSpikeBounce;

  // Combo tracking: hits that land before the victim got a breather shrink hitstun slightly.
  vic.comboHits = vic.freeFrames < cb.comboResetFrames ? vic.comboHits + 1 : 0;

  vic.kbx = launch.x;
  vic.kby = launch.y;
  vic.vx = 0;
  vic.vy = 0;
  if (launch.y < 0) vic.grounded = false;
  vic.hitstun = v.stunFrames !== undefined
    ? Math.max(1, Math.round(v.stunFrames * Math.max(cb.comboHitstunFloor, Math.pow(cb.comboHitstunDecay, vic.comboHits))))
    : hitstunFrames(speed, m.rules, v.hitstunMultiplier, vic.comboHits);
  vic.restrained = v.restrain ? vic.hitstun : 0;
  vic.restrainKind = v.restrain ?? null;
  vic.action = 'hitstun';
  vic.move = null;
  vic.fastFalling = false;
  vic.jumpHeld = false;
  vic.facing = (-dir) as 1 | -1;
  // Getting hit gives back the double jump, recovery moves and air dodge (never more than normal).
  vic.jumpsUsed = Math.min(vic.jumpsUsed, 1);
  vic.airUsed = [];
  vic.airBoostUsed = false;
  vic.airDodgesUsed = 0;
  vic.buffer = null;
  vic.lastHitBy = att.id;

  const stop = hitstopFrames(v.damage, m.rules);
  vic.hitstop = stop;
  if (!h.projectile) att.hitstop = Math.max(att.hitstop, stop);

  att.stats.damageDealt += v.damage;
  vic.stats.damageTaken += v.damage;

  // Rebound (Luigi's rocket) — only if the attacker is still in that move (not traded out of it).
  if (move?.stopOnHit && att.action === 'attack' && currentMove(att) === move) {
    att.vx = -att.facing * cb.reboundSpeedX;
    att.vy = -cb.reboundSpeedY;
    att.grounded = false;
    att.actionFrame = move.startup + move.active;
  }

  m.events.push({
    type: 'hit', attacker: att.id, victim: vic.id, damage: v.damage, x: h.x, y: h.y,
    launchSpeed: speed, launchX: launch.x, launchY: launch.y, hitstun: vic.hitstun, hitstop: stop,
    ...(h.projectile ? { projectile: h.projectile.kind } : {}),
  });
}

// ---------------------------------------------------------------------------
// Stocks, respawn, match end
// ---------------------------------------------------------------------------

function checkBlastZone(m: MatchState, f: FighterState): void {
  if (f.action === 'dead' || f.eliminated || f.action === 'respawning') return;
  const bz = m.stage.blastZone;
  if (f.x >= bz.left && f.x <= bz.right && f.y >= bz.top && f.y <= bz.bottom) return;
  koFighter(m, f);
}

export function koFighter(m: MatchState, f: FighterState): void {
  const bz = m.stage.blastZone;
  m.events.push({
    type: 'ko',
    id: f.id,
    x: clamp(f.x, bz.left, bz.right),
    y: clamp(f.y, bz.top, bz.bottom),
    by: f.lastHitBy,
  });
  if (f.lastHitBy !== null && f.lastHitBy !== f.id) m.fighters[f.lastHitBy].stats.kos++;
  f.stats.falls++;
  if (!m.rules.infiniteStocks) f.stocks = Math.max(0, f.stocks - 1);
  f.action = 'dead';
  f.move = null;
  f.ledge = null;
  f.vx = f.vy = f.kbx = f.kby = 0;
  f.hitstun = 0;
  f.hitstop = 0;
  f.lastHitBy = null;
  if (f.stocks <= 0 && !m.rules.infiniteStocks) {
    f.eliminated = true;
    f.eliminatedAt = m.frame;
    m.events.push({ type: 'eliminated', id: f.id });
  } else {
    f.respawnTimer = m.rules.respawnDelayFrames;
  }
}

function respawn(m: MatchState, f: FighterState): void {
  const point = m.stage.respawns[f.id % m.stage.respawns.length];
  f.x = point.x;
  f.y = point.y;
  f.vx = f.vy = f.kbx = f.kby = 0;
  f.damage = 0;
  f.grounded = false;
  f.jumpsUsed = 0;
  f.fastFalling = false;
  f.airUsed = [];
  f.airBoostUsed = false;
  f.airDodgesUsed = 0;
  f.comboHits = 0;
  f.buffer = null;
  f.jumpBuffer = 0;
  f.cooldowns = { light: 0, heavy: 0, special: 0, aerial: 0 };
  f.ledge = null;
  f.ledgeCooldown = 0;
  f.ledgeGrabs = 0;
  f.ledgeInvulnUsed = false;
  f.shieldHp = shieldMax(m.rules, f);
  f.shieldRegenDelay = 0;
  f.shieldStun = 0;
  f.action = 'respawning';
  f.respawnTimer = m.rules.respawnHoverFrames;
  f.facing = point.x <= 0 ? 1 : -1;
  m.events.push({ type: 'respawn', id: f.id });
}

function checkMatchEnd(m: MatchState): void {
  if (m.phase !== 'playing' || m.fighters.length < 2) return;
  const alive = m.fighters.filter((f) => !f.eliminated);
  if (alive.length <= 1) {
    endMatch(m, alive[0]?.id ?? null, 'stocks');
  } else if (m.rules.timed && m.timeLeft <= 0) {
    const ranked = standings(m);
    const [a, b] = ranked;
    const tie = a.stocks === b.stocks && a.damage === b.damage && !a.eliminated && !b.eliminated;
    endMatch(m, tie ? null : a.id, 'time');
  }
}

function endMatch(m: MatchState, winner: number | null, reason: 'stocks' | 'time'): void {
  m.phase = 'ended';
  m.winner = winner;
  m.endReason = reason;
  m.events.push({ type: 'matchEnd', winner, reason });
}

// ---------------------------------------------------------------------------
// Ledges
// ---------------------------------------------------------------------------

export function isOnLedge(f: FighterState): boolean {
  return f.action === 'ledge' || f.action === 'ledgeClimb' || f.action === 'ledgeRoll';
}

/** Where a fighter's feet sit while hanging from `l`: just outside the wall, head poking above the lip. */
export function hangPosition(f: FighterState, l: Ledge, rules: RulesConfig): { x: number; y: number } {
  const s = fighterDef(f).stats;
  return { x: l.x - l.dir * (s.width / 2 + 1), y: l.y + s.height - rules.ledge.hangHeadroom };
}

function isLedgeCorner(m: MatchState, p: Platform, dir: 1 | -1): boolean {
  return stageLedges(m.stage, m.rules.ledge.wallClearance).some((l) => l.platformId === p.id && l.dir === dir);
}

function tryLedgeGrab(m: MatchState, f: FighterState, input: InputFrame): void {
  const L = m.rules.ledge;
  if (f.grounded || f.ledgeCooldown > 0 || input.down || f.ledgeGrabs >= L.maxGrabsPerAirtime) return;
  // Only from free fall, or during a special (most recoveries are specials).
  const recovering = f.action === 'attack' && f.move === 'special';
  if (f.action !== 'air' && !recovering) return;
  if (f.action === 'air' && f.vy + f.kby < 0) return; // on the way down only
  const hw = fighterDef(f).stats.width / 2;
  let best: Ledge | null = null;
  let bestD = Infinity;
  for (const l of stageLedges(m.stage, L.wallClearance)) {
    const hang = hangPosition(f, l, m.rules);
    const dx = Math.abs(f.x - hang.x);
    const dy = f.y - hang.y; // > 0: below the hang position
    if (dx > L.grabRangeX || dy < -L.grabAbove || dy > L.grabBelow) continue;
    if ((f.x - l.x) * l.dir > hw * 0.5) continue; // over the stage, not beside the ledge
    if (m.fighters.some((o) => o !== f && isOnLedge(o) && o.ledge?.x === l.x && o.ledge?.y === l.y)) continue;
    const d = dx + Math.abs(dy);
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  if (best) grabLedge(m, f, best);
}

function grabLedge(m: MatchState, f: FighterState, l: Ledge): void {
  const L = m.rules.ledge;
  const move = currentMove(f);
  if (f.action === 'attack' && move && f.move) f.cooldowns[f.move] = move.cooldown;
  const hang = hangPosition(f, l, m.rules);
  f.action = 'ledge';
  f.actionFrame = 0;
  f.move = null;
  f.ledge = l;
  f.x = hang.x;
  f.y = hang.y;
  f.vx = f.vy = f.kbx = f.kby = 0;
  f.facing = l.dir;
  f.grounded = false;
  f.fastFalling = false;
  f.jumpHeld = false;
  f.buffer = null;
  f.jumpBuffer = 0;
  f.charge = 0;
  f.ledgeGrabs++;
  if (!f.ledgeInvulnUsed) {
    // First grab this airtime: brief invulnerability and the double jump / recovery back.
    f.ledgeInvulnUsed = true;
    f.invuln = Math.max(f.invuln, L.invulnFrames);
    f.jumpsUsed = Math.min(f.jumpsUsed, 1);
    f.airUsed = [];
    f.airBoostUsed = false;
    f.airDodgesUsed = 0;
  }
  m.events.push({ type: 'ledgeGrab', id: f.id, x: l.x, y: l.y });
}

/** Training helper: hang `f` on `l` as a fresh first grab (with ledge invulnerability). */
export function placeOnLedge(m: MatchState, f: FighterState, l: Ledge): void {
  f.ledgeGrabs = 0;
  f.ledgeInvulnUsed = false;
  f.ledgeCooldown = 0;
  f.hitstun = 0;
  f.hitstop = 0;
  if (f.action !== 'attack') f.move = null;
  grabLedge(m, f, l);
}

function leaveLedge(m: MatchState, f: FighterState, kind: 'jump' | 'release'): void {
  const L = m.rules.ledge;
  const l = f.ledge!;
  const s = fighterDef(f).stats;
  f.ledge = null;
  f.invuln = 0;
  f.ledgeCooldown = L.regrabCooldownFrames;
  f.action = 'air';
  f.actionFrame = 0;
  f.grounded = false;
  if (kind === 'jump') {
    f.vy = -s.jumpVelocity * L.jumpScale;
    f.vx = l.dir * s.airSpeed * 0.3;
    f.jumpsUsed = Math.max(f.jumpsUsed, 1);
    f.jumpBuffer = 0;
    f.jumpHeld = false; // always a full jump
    m.events.push({ type: 'jump', id: f.id, double: false, x: f.x, y: f.y });
  } else {
    f.x -= l.dir * 2;
    f.vy = 0;
  }
  m.events.push({ type: 'ledgeAction', id: f.id, kind });
}

function updateLedge(m: MatchState, f: FighterState, input: InputFrame, dir: number): void {
  const L = m.rules.ledge;
  const l = f.ledge;
  if (!l) {
    f.action = 'air';
    return;
  }
  const s = fighterDef(f).stats;
  const hang = hangPosition(f, l, m.rules);
  f.vx = f.vy = f.kbx = f.kby = 0;
  f.grounded = false;

  if (f.action === 'ledge') {
    f.x = hang.x;
    f.y = hang.y;
    f.actionFrame++;
    if (f.actionFrame >= L.maxHangFrames) return leaveLedge(m, f, 'release');
    if (f.actionFrame < L.actionDelayFrames) return;
    if (f.jumpBuffer > 0) return leaveLedge(m, f, 'jump');
    if (f.buffer?.action === 'dodge') {
      f.buffer = null;
      return startLedgeGetup(m, f, 'ledgeRoll');
    }
    f.buffer = null; // no ledge attacks
    if (input.up || dir === l.dir) return startLedgeGetup(m, f, 'ledgeClimb');
    if (input.down || dir === -l.dir) return leaveLedge(m, f, 'release');
    return;
  }

  // Climb / roll: rise up the wall, then move onto the platform (never past its ends).
  const roll = f.action === 'ledgeRoll';
  const total = roll ? L.rollFrames : L.climbFrames;
  f.actionFrame++;
  const hw = s.width / 2;
  const inside = (x: number) => clamp(x, l.minX + hw, l.maxX - hw);
  const endX = inside(l.x + l.dir * (hw + (roll ? L.rollDistance : 6)));
  const riseEnd = roll ? 0.35 : 0.55;
  const t = Math.min(1, f.actionFrame / total);
  const smooth = (u: number) => u * u * (3 - 2 * u);
  if (t < riseEnd) {
    f.x = hang.x;
    f.y = lerp(hang.y, l.y, smooth(t / riseEnd));
  } else {
    f.x = lerp(hang.x, endX, smooth((t - riseEnd) / (1 - riseEnd)));
    f.y = l.y;
  }
  if (f.actionFrame >= total) {
    f.x = endX;
    f.ledge = null;
    f.action = 'idle';
    f.actionFrame = 0;
    land(m, f, l.y);
  }
}

function startLedgeGetup(m: MatchState, f: FighterState, action: 'ledgeClimb' | 'ledgeRoll'): void {
  f.action = action;
  f.actionFrame = 0;
  f.invuln = 0; // ledge invulnerability ends; the get-up has its own short intangibility
  m.events.push({ type: 'ledgeAction', id: f.id, kind: action === 'ledgeRoll' ? 'roll' : 'climb' });
}

// ---------------------------------------------------------------------------
// Shields
// ---------------------------------------------------------------------------

export function shieldMax(rules: RulesConfig, f: FighterState): number {
  return fighterDef(f).stats.shieldMax ?? rules.shield.maxHealth;
}

function startShield(m: MatchState, f: FighterState): void {
  if (f.shieldHp < 1) return;
  f.action = 'shield';
  f.actionFrame = 0;
  f.shieldStun = 0;
  m.events.push({ type: 'shield', id: f.id, up: true });
}

function regenShield(m: MatchState, f: FighterState): void {
  if (f.action === 'shield' || f.action === 'shieldBreak') return;
  if (f.shieldRegenDelay > 0) {
    f.shieldRegenDelay--;
    return;
  }
  f.shieldHp = Math.min(shieldMax(m.rules, f), f.shieldHp + m.rules.shield.regenPerSecond * DT);
}

function updateShield(m: MatchState, f: FighterState, input: InputFrame, dir: number): void {
  const cfg = m.rules.shield;
  f.actionFrame++;
  f.shieldRegenDelay = cfg.regenDelayFrames;
  f.shieldHp -= cfg.drainPerSecond * DT;
  if (f.shieldHp <= 0) return breakShield(m, f);
  if (f.shieldStun > 0) {
    f.shieldStun--;
    return;
  }
  // No attacking out of shield; jumping out of it is allowed.
  if (f.buffer && f.buffer.action !== 'dodge') f.buffer = null;
  if (f.jumpBuffer > 0) {
    f.action = 'idle';
    f.buffer = null;
    m.events.push({ type: 'shield', id: f.id, up: false });
    return;
  }
  const pressed = (k: keyof InputFrame) => input[k] && !f.prevInput[k];
  const rollDir = pressed('left') || pressed('right') ? dir : 0;
  if (f.dodgeCooldown <= 0 && (rollDir !== 0 || pressed('down'))) {
    f.action = 'idle';
    f.buffer = null;
    m.events.push({ type: 'shield', id: f.id, up: false });
    startDodge(m, f, input, rollDir);
    return;
  }
  if (!input.dodge && f.actionFrame >= cfg.minFrames) {
    f.action = 'shieldRelease';
    f.actionFrame = cfg.releaseFrames;
    m.events.push({ type: 'shield', id: f.id, up: false });
  }
}

function applyShieldHit(m: MatchState, h: PendingHit): void {
  const { attacker: att, victim: vic, move, values: v, direction: dir } = h;
  const cfg = m.rules.shield;
  const dmg = v.shieldDamage ?? v.damage * cfg.damageMultiplier + cfg.damageBase;
  vic.shieldHp -= dmg;
  vic.shieldStun = Math.min(cfg.stunMax, Math.max(1, Math.round(cfg.stunBase + v.damage * cfg.stunPerDamage)));
  vic.vx = dir * (cfg.pushbackBase + v.damage * cfg.pushbackPerDamage);
  const stop = hitstopFrames(v.damage, m.rules);
  vic.hitstop = stop;
  if (!h.projectile) att.hitstop = Math.max(att.hitstop, stop);
  // Luigi's rocket still bounces off.
  if (move?.stopOnHit && att.action === 'attack' && currentMove(att) === move) {
    att.vx = -att.facing * m.rules.combat.reboundSpeedX;
    att.vy = -m.rules.combat.reboundSpeedY;
    att.grounded = false;
    att.actionFrame = move.startup + move.active;
  }
  m.events.push({
    type: 'shieldHit', attacker: att.id, victim: vic.id, x: h.x, y: h.y, shieldDamage: dmg, health: Math.max(0, vic.shieldHp),
  });
  if (vic.shieldHp <= 0) breakShield(m, vic);
}

function breakShield(m: MatchState, f: FighterState): void {
  const cfg = m.rules.shield;
  f.action = 'shieldBreak';
  f.actionFrame = cfg.breakStunFrames;
  f.shieldHp = 0;
  f.shieldStun = 0;
  f.vy = -cfg.breakLaunchSpeed;
  f.vx = 0;
  f.grounded = false;
  f.buffer = null;
  f.jumpBuffer = 0;
  m.events.push({ type: 'shieldBreak', id: f.id, x: f.x, y: f.y });
}
