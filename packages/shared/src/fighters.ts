export type FighterId = 'gnw' | 'luigi' | 'sheik' | 'spiderman' | 'batman' | 'naruto' | 'goku';
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
  /** Fixed hitstun (frames) instead of knockback-based hitstun — used for restraining attacks. */
  stunFrames?: number;
  /** Marks the victim as restrained (webbed) for the duration of the hitstun (visual + CPU awareness). */
  restrain?: boolean;
}

/** The damage/launch part of a hitbox, used by projectiles (which carry their own size and position). */
export type HitEffect = Pick<HitboxDef,
  'damage' | 'baseKnockback' | 'knockbackGrowth' | 'angle' | 'hitstunMultiplier' | 'stunFrames' | 'restrain'>;

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

export type ProjectileKind = 'web' | 'batarang' | 'beam';

/**
 * Fires a projectile when the move reaches its active frames. Projectiles are simulated in the
 * shared match state and use the same hurtbox overlap test, damage, knockback and hitstun rules
 * as melee hitboxes.
 */
export interface ProjectileBehavior {
  type: 'projectile';
  kind: ProjectileKind;
  /** px/s */
  speed: number;
  /** Frames before it disappears. */
  life: number;
  w: number;
  h: number;
  /** Spawn offset from the feet, for a fighter facing right. */
  offsetX: number;
  offsetY: number;
  hit: HitEffect;
  /** Hits every fighter it passes through (once each) instead of vanishing on the first hit. */
  piercing?: boolean;
  /** Boomerang: after this many frames it flies back to its owner. */
  returnAfter?: number;
  /** Fired in the air while holding up: pull the fighter upward instead (Spider-Man's web-zip). */
  airUpZip?: { vx: number; vy: number };
}

export type MoveBehavior = JudgeBehavior | RocketBehavior | VanishBehavior | ProjectileBehavior;

/** Hold the move's button during the last startup frame to charge (Goku's strike and Kamehameha). */
export interface ChargeDef {
  maxFrames: number;
  /** At full charge damage is multiplied by (1 + damageBonus) and base knockback by (1 + knockbackBonus). */
  damageBonus: number;
  knockbackBonus: number;
}

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
  charge?: ChargeDef;
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

const SPIDERMAN: FighterDef = {
  id: 'spiderman',
  name: 'Spider-Man',
  tagline: 'Thwip! Owns the air.',
  description: 'The best air mobility in the game. Webs restrain foes; in the air, special + up web-zips skyward.',
  ratings: { speed: 4, power: 2, jump: 5, weight: 'Light', difficulty: 'Medium' },
  stats: {
    width: 34,
    height: 78,
    weight: 85,
    runSpeed: 560,
    groundAccel: 3800,
    groundFriction: 3000,
    airSpeed: 480,
    airAccel: 3900,
    airFriction: 800,
    gravity: 2000,
    maxFallSpeed: 860,
    fastFallSpeed: 1300,
    jumpVelocity: 960,
    doubleJumpVelocity: 1080,
    maxJumps: 2,
  },
  moves: {
    light: {
      id: 'spidey-combo',
      name: 'Web-Slinger Jabs',
      startup: 3,
      active: 9,
      recovery: 8,
      cooldown: 2,
      hitboxes: [
        { x: 32, y: -48, w: 40, h: 26, damage: 2, baseKnockback: 170, knockbackGrowth: 0.5, angle: 60, start: 3, end: 5, group: 0 },
        { x: 34, y: -46, w: 40, h: 26, damage: 2, baseKnockback: 170, knockbackGrowth: 0.5, angle: 60, start: 6, end: 8, group: 1 },
        { x: 38, y: -48, w: 46, h: 30, damage: 3, baseKnockback: 280, knockbackGrowth: 3.2, angle: 40, start: 9, end: 12, group: 2 },
      ],
    },
    heavy: {
      id: 'spidey-spinkick',
      name: 'Spinning Spider Kick',
      startup: 11,
      active: 6,
      recovery: 23,
      cooldown: 18,
      hitboxes: [{ x: 0, y: -40, w: 100, h: 42, damage: 11, baseKnockback: 410, knockbackGrowth: 8.5, angle: 40, autoDirection: true }],
    },
    special: {
      id: 'spidey-web',
      name: 'Web Shot',
      startup: 10,
      active: 2,
      recovery: 18,
      cooldown: 100,
      oncePerAirtime: true,
      hitboxes: [],
      behavior: {
        type: 'projectile',
        kind: 'web',
        speed: 1100,
        life: 28,
        w: 28,
        h: 20,
        offsetX: 30,
        offsetY: -50,
        hit: { damage: 3, baseKnockback: 60, knockbackGrowth: 0.2, angle: 0, stunFrames: 40, restrain: true },
        airUpZip: { vx: 260, vy: -1000 },
      },
    },
    aerial: {
      id: 'spidey-webkick',
      name: 'Web-Dive Kick',
      startup: 5,
      active: 10,
      recovery: 12,
      cooldown: 4,
      landingLag: 9,
      impulse: { frame: 5, vy: 650 },
      hitboxes: [{ x: 8, y: 6, w: 40, h: 36, damage: 8, baseKnockback: 300, knockbackGrowth: 5, angle: -55 }],
    },
  },
};

const BATMAN: FighterDef = {
  id: 'batman',
  name: 'Batman',
  tagline: 'Heavy armor. Cold tactics.',
  description: 'Hard to launch and hits like a truck up close, but slow in the air with short jumps.',
  ratings: { speed: 3, power: 4, jump: 2, weight: 'Heavy', difficulty: 'Medium' },
  stats: {
    width: 44,
    height: 88,
    weight: 125,
    runSpeed: 460,
    groundAccel: 2400,
    groundFriction: 2600,
    airSpeed: 330,
    airAccel: 1700,
    airFriction: 400,
    gravity: 2300,
    maxFallSpeed: 980,
    fastFallSpeed: 1400,
    jumpVelocity: 960,
    doubleJumpVelocity: 900,
    maxJumps: 2,
  },
  moves: {
    light: {
      id: 'bat-combo',
      name: 'Martial Arts Combo',
      startup: 4,
      active: 9,
      recovery: 10,
      cooldown: 2,
      hitboxes: [
        { x: 36, y: -52, w: 42, h: 30, damage: 3, baseKnockback: 210, knockbackGrowth: 0.8, angle: 65, start: 4, end: 7, group: 0 },
        { x: 42, y: -50, w: 48, h: 32, damage: 4, baseKnockback: 300, knockbackGrowth: 3.5, angle: 38, start: 10, end: 13, group: 1 },
      ],
    },
    heavy: {
      id: 'bat-capestrike',
      name: 'Cape Strike',
      startup: 13,
      active: 5,
      recovery: 24,
      cooldown: 18,
      hitboxes: [{ x: 46, y: -46, w: 70, h: 70, damage: 15, baseKnockback: 470, knockbackGrowth: 10, angle: 42 }],
    },
    special: {
      id: 'bat-batarang',
      name: 'Batarang',
      startup: 12,
      active: 2,
      recovery: 20,
      cooldown: 90,
      hitboxes: [],
      behavior: {
        type: 'projectile',
        kind: 'batarang',
        speed: 900,
        life: 75,
        w: 30,
        h: 18,
        offsetX: 30,
        offsetY: -56,
        returnAfter: 22,
        hit: { damage: 6, baseKnockback: 260, knockbackGrowth: 3, angle: 30 },
      },
    },
    aerial: {
      id: 'bat-capedive',
      name: 'Cape Dive',
      startup: 7,
      active: 10,
      recovery: 14,
      cooldown: 6,
      landingLag: 14,
      hitboxes: [{ x: 10, y: 0, w: 56, h: 40, damage: 11, baseKnockback: 330, knockbackGrowth: 6, angle: -65 }],
    },
  },
};

const NARUTO: FighterDef = {
  id: 'naruto',
  name: 'Naruto',
  tagline: 'Believe it — combos never stop.',
  description: 'Quick and aggressive. Shadow clones form a Rasengan that grinds then blasts foes away.',
  ratings: { speed: 4, power: 3, jump: 4, weight: 'Medium', difficulty: 'Easy' },
  stats: {
    width: 36,
    height: 76,
    weight: 95,
    runSpeed: 600,
    groundAccel: 4200,
    groundFriction: 3200,
    airSpeed: 430,
    airAccel: 3000,
    airFriction: 650,
    gravity: 2150,
    maxFallSpeed: 920,
    fastFallSpeed: 1350,
    jumpVelocity: 1000,
    doubleJumpVelocity: 960,
    maxJumps: 2,
  },
  moves: {
    light: {
      id: 'naruto-taijutsu',
      name: 'Taijutsu Barrage',
      startup: 3,
      active: 12,
      recovery: 8,
      cooldown: 2,
      hitboxes: [
        { x: 32, y: -46, w: 40, h: 26, damage: 2, baseKnockback: 160, knockbackGrowth: 0.4, angle: 60, start: 3, end: 5, group: 0 },
        { x: 34, y: -42, w: 40, h: 26, damage: 1, baseKnockback: 160, knockbackGrowth: 0.4, angle: 60, start: 6, end: 8, group: 1 },
        { x: 34, y: -48, w: 40, h: 26, damage: 1, baseKnockback: 160, knockbackGrowth: 0.4, angle: 60, start: 9, end: 11, group: 2 },
        { x: 38, y: -44, w: 46, h: 30, damage: 3, baseKnockback: 280, knockbackGrowth: 3.3, angle: 45, start: 12, end: 15, group: 3 },
      ],
    },
    heavy: {
      id: 'naruto-spinkick',
      name: 'Whirlwind Kick',
      startup: 8,
      active: 8,
      recovery: 19,
      cooldown: 14,
      hitboxes: [{ x: 0, y: -36, w: 112, h: 44, damage: 12, baseKnockback: 440, knockbackGrowth: 10, angle: 35, autoDirection: true }],
    },
    special: {
      id: 'naruto-rasengan',
      name: 'Rasengan',
      startup: 16,
      active: 14,
      recovery: 22,
      cooldown: 75,
      impulse: { frame: 16, vx: 520 },
      hitboxes: [
        { x: 40, y: -42, w: 54, h: 54, damage: 1, baseKnockback: 120, knockbackGrowth: 0, angle: 20, start: 16, end: 18, group: 0 },
        { x: 40, y: -42, w: 54, h: 54, damage: 1, baseKnockback: 120, knockbackGrowth: 0, angle: 20, start: 19, end: 21, group: 1 },
        { x: 40, y: -42, w: 54, h: 54, damage: 1, baseKnockback: 120, knockbackGrowth: 0, angle: 20, start: 22, end: 24, group: 2 },
        { x: 40, y: -42, w: 54, h: 54, damage: 1, baseKnockback: 120, knockbackGrowth: 0, angle: 20, start: 25, end: 27, group: 3 },
        { x: 42, y: -42, w: 60, h: 60, damage: 10, baseKnockback: 540, knockbackGrowth: 10.5, angle: 40, start: 27, end: 30, group: 4 },
      ],
    },
    aerial: {
      id: 'naruto-divestrike',
      name: 'Ninja Dive Strike',
      startup: 5,
      active: 8,
      recovery: 12,
      cooldown: 4,
      landingLag: 10,
      hitboxes: [{ x: 18, y: 0, w: 44, h: 40, damage: 9, baseKnockback: 300, knockbackGrowth: 6, angle: -50 }],
    },
  },
};

const GOKU: FighterDef = {
  id: 'goku',
  name: 'Goku',
  tagline: 'Hold it… then let it rip.',
  description: 'Strong, sturdy all-rounder. Charge his heavy or the Kamehameha by holding the button.',
  ratings: { speed: 4, power: 5, jump: 4, weight: 'Medium', difficulty: 'Medium' },
  stats: {
    width: 38,
    height: 82,
    weight: 108,
    runSpeed: 540,
    groundAccel: 3200,
    groundFriction: 2600,
    airSpeed: 410,
    airAccel: 2600,
    airFriction: 600,
    gravity: 2200,
    maxFallSpeed: 940,
    fastFallSpeed: 1380,
    jumpVelocity: 1020,
    doubleJumpVelocity: 980,
    maxJumps: 2,
  },
  moves: {
    light: {
      id: 'goku-punches',
      name: 'Rapid Punches',
      startup: 3,
      active: 9,
      recovery: 8,
      cooldown: 2,
      hitboxes: [
        { x: 34, y: -50, w: 42, h: 28, damage: 2, baseKnockback: 170, knockbackGrowth: 0.5, angle: 60, start: 3, end: 5, group: 0 },
        { x: 36, y: -48, w: 42, h: 28, damage: 2, baseKnockback: 170, knockbackGrowth: 0.5, angle: 60, start: 6, end: 8, group: 1 },
        { x: 40, y: -50, w: 48, h: 30, damage: 3, baseKnockback: 300, knockbackGrowth: 3.6, angle: 40, start: 9, end: 12, group: 2 },
      ],
    },
    heavy: {
      id: 'goku-chargedstrike',
      name: 'Charged Strike',
      startup: 11,
      active: 5,
      recovery: 22,
      cooldown: 18,
      charge: { maxFrames: 45, damageBonus: 0.45, knockbackBonus: 0.3 },
      hitboxes: [{ x: 46, y: -46, w: 64, h: 56, damage: 14, baseKnockback: 460, knockbackGrowth: 11, angle: 38 }],
    },
    special: {
      id: 'goku-kamehameha',
      name: 'Kamehameha',
      startup: 20,
      active: 4,
      recovery: 30,
      cooldown: 240,
      charge: { maxFrames: 60, damageBonus: 0.9, knockbackBonus: 0.45 },
      hitboxes: [],
      behavior: {
        type: 'projectile',
        kind: 'beam',
        speed: 1500,
        life: 34,
        w: 90,
        h: 46,
        offsetX: 40,
        offsetY: -46,
        piercing: true,
        hit: { damage: 10, baseKnockback: 380, knockbackGrowth: 8, angle: 25 },
      },
    },
    aerial: {
      id: 'goku-energykick',
      name: 'Energy Kick',
      startup: 6,
      active: 8,
      recovery: 13,
      cooldown: 4,
      landingLag: 11,
      hitboxes: [{ x: 14, y: 2, w: 46, h: 40, damage: 10, baseKnockback: 320, knockbackGrowth: 6.5, angle: -60 }],
    },
  },
};

export const FIGHTERS: Record<FighterId, FighterDef> = {
  gnw: GNW, luigi: LUIGI, sheik: SHEIK, spiderman: SPIDERMAN, batman: BATMAN, naruto: NARUTO, goku: GOKU,
};
export const FIGHTER_ORDER: FighterId[] = ['gnw', 'luigi', 'sheik', 'spiderman', 'batman', 'naruto', 'goku'];

export function getFighter(id: FighterId): FighterDef {
  const def = FIGHTERS[id];
  if (!def) throw new Error(`Unknown fighter: ${id}`);
  return def;
}

export function moveTotalFrames(move: MoveDef): number {
  return move.startup + move.active + move.recovery;
}

/** Frames the move can be charged for (Luigi's rocket or a ChargeDef), or 0. */
export function chargeFrames(move: MoveDef): number {
  if (move.behavior?.type === 'rocket') return move.behavior.maxChargeFrames;
  return move.charge?.maxFrames ?? 0;
}

/** 1–5 weight bar for UI, derived from the real weight stat. */
export function weightRating(def: FighterDef): number {
  return Math.max(1, Math.min(5, Math.round((def.stats.weight - 55) / 15)));
}

export function hitboxWindow(move: MoveDef, hb: HitboxDef): [number, number] {
  return [hb.start ?? move.startup, hb.end ?? move.startup + move.active];
}
