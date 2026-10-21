export type FighterId = 'gnw' | 'luigi' | 'sheik';
export type MoveSlot = 'light' | 'heavy' | 'special' | 'aerial';

export interface FighterStats {
  /** Hurtbox size. Fighter position is the bottom-center (feet). */
  width: number;
  height: number;
  /** Heavier fighters take less knockback. 100 = average. */
  weight: number;
  runSpeed: number;
  groundAccel: number;
  /** Deceleration on the ground when not holding a direction. Low = slippery. */
  groundFriction: number;
  airSpeed: number;
  airAccel: number;
  airFriction: number;
  gravity: number;
  maxFallSpeed: number;
  fastFallSpeed: number;
  jumpVelocity: number;
  doubleJumpVelocity: number;
  maxJumps: number;
}

export interface HitboxDef {
  /** Center offset from the fighter's feet, for a fighter facing right (y negative = up). */
  x: number;
  y: number;
  w: number;
  h: number;
  damage: number;
  /** Launch speed (px/s) applied regardless of damage. */
  baseKnockback: number;
  /** How strongly launch speed scales with the victim's percentage. */
  knockbackGrowth: number;
  /** Launch angle in degrees: 0 = forward, 90 = straight up, negative = downward. */
  angle: number;
  /** First active frame (counted from move start). Defaults to the move's startup. */
  start?: number;
  /** Frame after the last active one. Defaults to startup + active. */
  end?: number;
  /** A victim can only be hit once per group per move. Defaults to 0. */
  group?: number;
  /** Launch away from the attacker's center instead of the attacker's facing. */
  autoDirection?: boolean;
  hitstunMultiplier?: number;
}

/** Mr. Game & Watch's numbered special: rolls 1–9, each with its own outcome. */
export interface JudgeBehavior {
  type: 'judge';
  outcomes: {
    value: number;
    damage: number;
    baseKnockback: number;
    knockbackGrowth: number;
    angle: number;
    hitstunMultiplier?: number;
    /** Damage dealt to the user on startup (negative heals). */
    selfDamage?: number;
  }[];
}

/** Luigi's charged rocket: hold special to charge, release to launch forward. */
export interface RocketBehavior {
  type: 'rocket';
  maxChargeFrames: number;
  minSpeed: number;
  maxSpeed: number;
  misfireChance: number;
  misfireSpeed: number;
  minDamage: number;
  maxDamage: number;
  misfireDamage: number;
  minBaseKnockback: number;
  maxBaseKnockback: number;
  misfireBaseKnockback: number;
}

/** Sheik's directional vanish: disappear, reappear in the held direction with a burst. */
export interface VanishBehavior {
  type: 'vanish';
  distance: number;
}

export type MoveBehavior = JudgeBehavior | RocketBehavior | VanishBehavior;

export interface MoveDef {
  id: string;
  name: string;
  startup: number;
  active: number;
  recovery: number;
  /** Extra frames after the move ends before this slot can be used again. */
  cooldown: number;
  hitboxes: HitboxDef[];
  /** Velocity impulse applied when the move reaches `frame`. */
  impulse?: { frame: number; vx?: number; vy?: number; airOnly?: boolean; oncePerAirtime?: boolean };
  /** Aerial moves end when the fighter lands, followed by this much landing lag. */
  landingLag?: number;
  /** Fighter is intangible during [start, end). */
  intangible?: [number, number];
  /** Can only be used once before touching the ground again when started in the air. */
  oncePerAirtime?: boolean;
  /** Attacker rebounds when this move connects (rocket). */
  stopOnHit?: boolean;
  behavior?: MoveBehavior;
}

export interface FighterRatings {
  /** 1–5 */
  speed: number;
  power: number;
  jump: number;
  weight: 'Light' | 'Medium' | 'Heavy';
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

export interface FighterDef {
  id: FighterId;
  name: string;
  tagline: string;
  description: string;
  ratings: FighterRatings;
  stats: FighterStats;
  moves: Record<MoveSlot, MoveDef>;
}

const GNW: FighterDef = {
  id: 'gnw',
  name: 'Mr. Game & Watch',
  tagline: 'Flat. Fast. Unpredictable.',
  description: 'A floaty LCD silhouette whose numbered Judge can do anything from a tickle to a meteor.',
  ratings: { speed: 4, power: 3, jump: 3, weight: 'Light', difficulty: 'Medium' },
  stats: {
    width: 36,
    height: 70,
    weight: 75,
    runSpeed: 540,
    groundAccel: 4200,
    groundFriction: 3200,
    airSpeed: 400,
    airAccel: 2600,
    airFriction: 500,
    gravity: 1650,
    maxFallSpeed: 680,
    fastFallSpeed: 1050,
    jumpVelocity: 790,
    doubleJumpVelocity: 760,
    maxJumps: 2,
  },
  moves: {
    light: {
      id: 'gnw-flick',
      name: 'Pump Jab',
      startup: 3,
      active: 3,
      recovery: 9,
      cooldown: 2,
      hitboxes: [{ x: 36, y: -40, w: 44, h: 28, damage: 5, baseKnockback: 260, knockbackGrowth: 3.2, angle: 35 }],
    },
    heavy: {
      id: 'gnw-hammer',
      name: 'Hammer Swing',
      startup: 15,
      active: 4,
      recovery: 22,
      cooldown: 18,
      hitboxes: [{ x: 48, y: -42, w: 62, h: 64, damage: 14, baseKnockback: 470, knockbackGrowth: 10.5, angle: 40 }],
    },
    special: {
      id: 'gnw-judge',
      name: 'Judge',
      startup: 14,
      active: 4,
      recovery: 20,
      cooldown: 40,
      hitboxes: [{ x: 42, y: -40, w: 54, h: 58, damage: 0, baseKnockback: 0, knockbackGrowth: 0, angle: 45 }],
      behavior: {
        type: 'judge',
        outcomes: [
          { value: 1, damage: 2, baseKnockback: 160, knockbackGrowth: 1, angle: 45, selfDamage: 6 },
          { value: 2, damage: 4, baseKnockback: 260, knockbackGrowth: 3, angle: 60 },
          { value: 3, damage: 6, baseKnockback: 320, knockbackGrowth: 4, angle: 45 },
          { value: 4, damage: 8, baseKnockback: 360, knockbackGrowth: 5, angle: 80 },
          { value: 5, damage: 10, baseKnockback: 400, knockbackGrowth: 6, angle: 30 },
          { value: 6, damage: 12, baseKnockback: 420, knockbackGrowth: 7, angle: 55 },
          { value: 7, damage: 7, baseKnockback: 300, knockbackGrowth: 4, angle: 45, selfDamage: -8 },
          { value: 8, damage: 14, baseKnockback: 420, knockbackGrowth: 8, angle: 25, hitstunMultiplier: 1.6 },
          { value: 9, damage: 32, baseKnockback: 900, knockbackGrowth: 14, angle: 40 },
        ],
      },
    },
    aerial: {
      id: 'gnw-keydrop',
      name: 'Key Drop',
      startup: 6,
      active: 40,
      recovery: 6,
      cooldown: 6,
      landingLag: 14,
      impulse: { frame: 6, vx: 0, vy: 1150 },
      hitboxes: [{ x: 0, y: 6, w: 42, h: 38, damage: 9, baseKnockback: 320, knockbackGrowth: 5, angle: -70 }],
    },
  },
};

const LUIGI: FighterDef = {
  id: 'luigi',
  name: 'Luigi',
  tagline: 'Sky-high jumps, slippery shoes.',
  description: 'Huge jumps and big close-range power, held back by famously poor traction.',
  ratings: { speed: 3, power: 5, jump: 5, weight: 'Medium', difficulty: 'Easy' },
  stats: {
    width: 40,
    height: 84,
    weight: 100,
    runSpeed: 440,
    groundAccel: 1500,
    groundFriction: 800,
    airSpeed: 320,
    airAccel: 1500,
    airFriction: 300,
    gravity: 2050,
    maxFallSpeed: 880,
    fastFallSpeed: 1300,
    jumpVelocity: 1080,
    doubleJumpVelocity: 1020,
    maxJumps: 2,
  },
  moves: {
    light: {
      id: 'luigi-onetwo',
      name: 'One-Two Punch',
      startup: 3,
      active: 9,
      recovery: 9,
      cooldown: 2,
      hitboxes: [
        { x: 34, y: -50, w: 40, h: 28, damage: 3, baseKnockback: 210, knockbackGrowth: 0.8, angle: 70, start: 3, end: 6, group: 0 },
        { x: 40, y: -50, w: 46, h: 30, damage: 4, baseKnockback: 300, knockbackGrowth: 3.6, angle: 40, start: 9, end: 12, group: 1 },
      ],
    },
    heavy: {
      id: 'luigi-uppercut',
      name: 'Power Uppercut',
      startup: 8,
      active: 7,
      recovery: 24,
      cooldown: 16,
      impulse: { frame: 8, vy: -1050, airOnly: true, oncePerAirtime: true },
      hitboxes: [{ x: 22, y: -74, w: 46, h: 76, damage: 15, baseKnockback: 480, knockbackGrowth: 13, angle: 84 }],
    },
    special: {
      id: 'luigi-rocket',
      name: 'Green Rocket',
      startup: 10,
      active: 22,
      recovery: 22,
      cooldown: 30,
      oncePerAirtime: true,
      stopOnHit: true,
      hitboxes: [{ x: 12, y: -40, w: 64, h: 52, damage: 0, baseKnockback: 0, knockbackGrowth: 6, angle: 38 }],
      behavior: {
        type: 'rocket',
        maxChargeFrames: 60,
        minSpeed: 900,
        maxSpeed: 1750,
        misfireChance: 0.125,
        misfireSpeed: 2600,
        minDamage: 6,
        maxDamage: 18,
        misfireDamage: 25,
        minBaseKnockback: 320,
        maxBaseKnockback: 560,
        misfireBaseKnockback: 760,
      },
    },
    aerial: {
      id: 'luigi-downkick',
      name: 'Down Kick',
      startup: 5,
      active: 9,
      recovery: 12,
      cooldown: 4,
      landingLag: 10,
      hitboxes: [{ x: 14, y: 4, w: 44, h: 38, damage: 10, baseKnockback: 320, knockbackGrowth: 6, angle: -60 }],
    },
  },
};

const SHEIK: FighterDef = {
  id: 'sheik',
  name: 'Sheik',
  tagline: 'Blink and you missed it.',
  description: 'The fastest fighter. Weak hits that chain into long combos, plus a vanishing teleport.',
  ratings: { speed: 5, power: 2, jump: 4, weight: 'Light', difficulty: 'Hard' },
  stats: {
    width: 36,
    height: 80,
    weight: 82,
    runSpeed: 640,
    groundAccel: 5200,
    groundFriction: 3600,
    airSpeed: 440,
    airAccel: 3400,
    airFriction: 700,
    gravity: 2300,
    maxFallSpeed: 950,
    fastFallSpeed: 1400,
    jumpVelocity: 1000,
    doubleJumpVelocity: 940,
    maxJumps: 2,
  },
  moves: {
    light: {
      id: 'sheik-flurry',
      name: 'Needle Flurry',
      startup: 2,
      active: 9,
      recovery: 6,
      cooldown: 1,
      hitboxes: [
        { x: 32, y: -48, w: 40, h: 26, damage: 2, baseKnockback: 160, knockbackGrowth: 0.4, angle: 60, start: 2, end: 4, group: 0 },
        { x: 34, y: -44, w: 40, h: 26, damage: 2, baseKnockback: 160, knockbackGrowth: 0.4, angle: 60, start: 5, end: 7, group: 1 },
        { x: 38, y: -46, w: 46, h: 30, damage: 3, baseKnockback: 270, knockbackGrowth: 3, angle: 35, start: 8, end: 11, group: 2 },
      ],
    },
    heavy: {
      id: 'sheik-spinkick',
      name: 'Spinning Kick',
      startup: 7,
      active: 8,
      recovery: 18,
      cooldown: 14,
      hitboxes: [{ x: 0, y: -40, w: 116, h: 42, damage: 11, baseKnockback: 420, knockbackGrowth: 8.5, angle: 35, autoDirection: true }],
    },
    special: {
      id: 'sheik-vanish',
      name: 'Vanish',
      startup: 14,
      active: 6,
      recovery: 14,
      cooldown: 45,
      intangible: [0, 15],
      oncePerAirtime: true,
      hitboxes: [{ x: 0, y: -38, w: 86, h: 86, damage: 8, baseKnockback: 400, knockbackGrowth: 5, angle: 70, autoDirection: true }],
      behavior: { type: 'vanish', distance: 240 },
    },
    aerial: {
      id: 'sheik-diagkick',
      name: 'Diagonal Kick',
      startup: 3,
      active: 7,
      recovery: 10,
      cooldown: 2,
      landingLag: 6,
      hitboxes: [{ x: 34, y: -14, w: 46, h: 36, damage: 6, baseKnockback: 300, knockbackGrowth: 4, angle: 32 }],
    },
  },
};

export const FIGHTERS: Record<FighterId, FighterDef> = { gnw: GNW, luigi: LUIGI, sheik: SHEIK };
export const FIGHTER_ORDER: FighterId[] = ['gnw', 'luigi', 'sheik'];

export function getFighter(id: FighterId): FighterDef {
  const def = FIGHTERS[id];
  if (!def) throw new Error(`Unknown fighter: ${id}`);
  return def;
}

export function moveTotalFrames(move: MoveDef): number {
  return move.startup + move.active + move.recovery;
}

export function hitboxWindow(move: MoveDef, hb: HitboxDef): [number, number] {
  return [hb.start ?? move.startup, hb.end ?? move.startup + move.active];
}
