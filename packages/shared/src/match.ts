import { DT, DEFAULT_RULES, type RulesConfig } from './config';
import {
  hitboxRect, hitstopFrames, hitstunFrames, hurtboxRect, knockbackSpeed, launchVector,
} from './combat';
import {
  chargeFrames, FIGHTERS, hitboxWindow, moveTotalFrames,
  type FighterDef, type FighterId, type HitboxDef, type HitEffect, type MoveDef, type MoveSlot,
  type ProjectileBehavior, type ProjectileKind,
} from './fighters';
import { approach, clamp, lerp, rectsOverlap } from './geometry';
import { emptyInput, type InputFrame } from './input';
import { nextRandom, randomInt } from './rng';
import { SKYFALL_ARENA, type Platform, type StageDef } from './stage';

export type FighterAction =
  | 'idle' | 'run' | 'air' | 'attack' | 'hitstun' | 'dodge' | 'landing' | 'dead' | 'respawning';

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
  /** Frames left restrained by a web (set from the web's fixed hitstun). */
  webbed: number;
  buffer: { action: BufferedAction; frames: number } | null;
  respawnTimer: number;
  lastHitBy: number | null;
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

export function createFighter(id: number, fighter: FighterId, stage: StageDef, stocks: number): FighterState {
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
    webbed: 0,
    buffer: null,
    respawnTimer: 0,
    lastHitBy: null,
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
    fighters: players.map((p, i) => createFighter(i, p.fighter, stage, rules.stocks)),
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
    if (f.action !== 'hitstun') f.webbed = 0;
    else if (f.webbed > 0 && f.hitstop === 0) f.webbed--;
  }

  m.timeLeft = Math.max(0, m.timeLeft - 1);
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

  switch (f.action) {
    case 'hitstun':
      if (--f.hitstun <= 0) f.action = f.grounded ? 'idle' : 'air';
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
    const airDodgeSpent = !f.grounded && f.airDodgesUsed >= m.rules.dodge.airDodgesPerAirtime;
    if (f.dodgeCooldown <= 0 && !airDodgeSpent) {
      startDodge(m, f, input, dir);
      f.buffer = null;
      return;
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

  // Vertical
  if (!f.grounded) {
    if (flying) {
      f.vy = 0;
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
      if (f.y - top <= m.rules.ledgeSnap && f.action !== 'hitstun' && (towardStage || rising)) {
        // Close enough to the lip: pop up onto the platform (simple ledge recovery).
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
  restrain?: boolean;
}

function hitEffectValues(h: HitEffect): HitValues {
  return {
    damage: h.damage, baseKnockback: h.baseKnockback, knockbackGrowth: h.knockbackGrowth, angle: h.angle,
    hitstunMultiplier: h.hitstunMultiplier ?? 1, stunFrames: h.stunFrames, restrain: h.restrain,
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
    { damage, baseKnockback, knockbackGrowth, angle, hitstunMultiplier, stunFrames: hb.stunFrames, restrain: hb.restrain },
    move,
    f.charge,
  );
}

function applyHit(m: MatchState, h: PendingHit): void {
  const { attacker: att, victim: vic, move, values: v, direction: dir } = h;
  const cb = m.rules.combat;

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
  vic.webbed = v.restrain ? vic.hitstun : 0;
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
  f.stocks = Math.max(0, f.stocks - 1);
  f.action = 'dead';
  f.move = null;
  f.vx = f.vy = f.kbx = f.kby = 0;
  f.hitstun = 0;
  f.hitstop = 0;
  f.lastHitBy = null;
  if (f.stocks <= 0) {
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
  } else if (m.timeLeft <= 0) {
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
