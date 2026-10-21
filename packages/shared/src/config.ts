/** Fixed simulation rate. All frame counts in the game data are at this rate. */
export const FPS = 60;
export const DT = 1 / FPS;

/**
 * Global rules and balance knobs. Character-specific values (run speed, gravity, weight, moves)
 * live in `fighters.ts`; everything shared by all fighters lives here.
 */
export interface RulesConfig {
  stocks: number;
  /** Training: KOs never cost a stock, so nobody is ever eliminated. */
  infiniteStocks: boolean;
  /** False = no match clock (training). */
  timed: boolean;
  /** Match length in frames (5 minutes by default). */
  matchFrames: number;
  /** "3, 2, 1, GO!" before fighters can move. */
  countdownFrames: number;
  /** Frames a KO'd fighter stays off-screen before reappearing. */
  respawnDelayFrames: number;
  /** Max frames a fighter may hover on the respawn platform. */
  respawnHoverFrames: number;
  /** Invulnerability granted after leaving the respawn platform. */
  respawnInvulnFrames: number;
  coyoteFrames: number;
  jumpBufferFrames: number;
  attackBufferFrames: number;
  dropThroughFrames: number;
  /** Fighters touching a solid platform's side within this many px of its top pop up onto it. */
  ledgeSnap: number;
  /** Ledge grabbing. Ledges come from stage geometry (see stageLedges). */
  ledge: {
    /** Max horizontal distance (px) between a fighter and the hang position to grab. */
    grabRangeX: number;
    /** How far above / below the hang position (feet) a fighter may be to grab. */
    grabAbove: number;
    grabBelow: number;
    /** A solid corner is grabbable only if this much open space (px) is below the lip, outside. */
    wallClearance: number;
    /** Head pokes this far above the lip while hanging. */
    hangHeadroom: number;
    /** Invulnerability on the first grab of an airtime (no invulnerability on regrabs). */
    invulnFrames: number;
    /** Frames after leaving a ledge before any ledge can be grabbed again. */
    regrabCooldownFrames: number;
    /** Grabs allowed per airtime (reset by landing or being hit) — prevents ledge stalling. */
    maxGrabsPerAirtime: number;
    /** Hanging this long drops the fighter automatically. */
    maxHangFrames: number;
    /** Inputs are ignored for the first frames of a hang (so a held direction doesn't instantly act). */
    actionDelayFrames: number;
    climbFrames: number;
    climbIntangibleFrames: number;
    rollFrames: number;
    rollIntangibleFrames: number;
    rollDistance: number;
    /** Ledge jump = this × the fighter's ground jump. */
    jumpScale: number;
  };
  /** Grabs (per-fighter timing, reach and throws live in grabs.ts). */
  grab: {
    /** Hold time before a grabbed fighter breaks free = base + damage × perDamage, capped at max. */
    holdBaseFrames: number;
    holdPerDamage: number;
    holdMaxFrames: number;
    /** Each fresh button press while grabbed takes this many frames off the hold. */
    mashFrames: number;
    /** Throw/pummel inputs are ignored for the first frames of a hold. */
    holdInputDelay: number;
    pummelCooldownFrames: number;
    /** Each pummel also takes this many frames off the hold (more pummels = sooner escape). */
    pummelTimeCost: number;
    pummelHitstop: number;
    /** After an escape (or a grab clash): lag for each side and the push apart. */
    grabberReleaseFrames: number;
    victimReleaseFrames: number;
    releaseSpeed: number;
    /** A fighter who was just released or thrown can't be grabbed again for this long. */
    regrabImmuneFrames: number;
    /** Gap between the grabber and the held fighter's bodies. */
    holdGap: number;
  };
  /** Shields (hold the dodge button on the ground). */
  shield: {
    /** Default max shield health (fighters may override with stats.shieldMax). */
    maxHealth: number;
    /** Health lost per second while held. */
    drainPerSecond: number;
    /** Health regained per second once released (after regenDelayFrames). */
    regenPerSecond: number;
    regenDelayFrames: number;
    /** Shield damage of a blocked hit = damage × damageMultiplier + damageBase (unless the hit overrides it). */
    damageMultiplier: number;
    damageBase: number;
    /** Shieldstun frames = stunBase + damage × stunPerDamage, capped at stunMax. */
    stunBase: number;
    stunPerDamage: number;
    stunMax: number;
    /** Blocked hits push the shielder back: px/s = pushbackBase + damage × pushbackPerDamage. */
    pushbackBase: number;
    pushbackPerDamage: number;
    /** A tapped shield stays up at least this long. */
    minFrames: number;
    /** Lag after dropping the shield. */
    releaseFrames: number;
    /** Shield break: helpless stun length, upward pop, and health restored afterwards. */
    breakStunFrames: number;
    breakLaunchSpeed: number;
    breakRecoverHealth: number;
  };
  dodge: {
    invulnFrames: number;
    totalFrames: number;
    cooldownFrames: number;
    rollSpeed: number;
    airDodgeSpeed: number;
    /** Air dodges allowed before touching the ground (or being hit) again. */
    airDodgesPerAirtime: number;
  };
  movement: {
    /** Releasing jump while rising multiplies vertical speed by this (short hops). */
    shortHopCut: number;
    /** Fast fall triggers once vertical speed is above this (px/s, negative = rising). */
    fastFallMinVy: number;
    /** Landing clamps horizontal speed to this multiple of run speed. */
    landingSpeedCap: number;
    /** Downward speed given when dropping through a one-way platform. */
    dropThroughSpeed: number;
    /** Feet may hang this far (px) past a platform's edge and still stand on it. */
    edgeTolerance: number;
    /** Ground roll keeps sliding: friction multiplier during the invulnerable part of a roll. */
    rollFriction: number;
    /** Friction multiplier after the invulnerable part of a dodge. */
    dodgeEndFriction: number;
    /** Neutral air dodge keeps this fraction of vertical speed. */
    neutralAirDodgeDamping: number;
  };
  combat: {
    knockback: {
      /** Global multiplier on every launch. Raise to make the whole game more explosive. */
      scale: number;
      /** How much a hit's damage boosts its percent-based knockback: factor = base + damage * perDamage. */
      damageFactorBase: number;
      damageFactorPerDamage: number;
      /** Weight that receives exactly the listed knockback; heavier fighters fly less. */
      referenceWeight: number;
    };
    /** Launch speed (px/s) lost per second while flying from knockback. */
    knockbackDecay: number;
    /** Hitstun frames per px/s of launch speed. */
    hitstunPerSpeed: number;
    minHitstun: number;
    maxHitstun: number;
    /** Each consecutive hit in a combo multiplies hitstun by this (prevents infinite locks)... */
    comboHitstunDecay: number;
    /** ...but never below this fraction of the normal hitstun. */
    comboHitstunFloor: number;
    /** A combo ends once the victim has been free to act for this many frames. */
    comboResetFrames: number;
    /** Landing while stunned caps the remaining hitstun to this many frames. */
    hitstunLandingCap: number;
    /** Air steering while stunned: fraction of normal air speed and acceleration. */
    hitstunDriftSpeed: number;
    hitstunDriftAccel: number;
    /** Hitstop frames = base + damage * perDamage, clamped to [min, max]. */
    hitstopBase: number;
    hitstopPerDamage: number;
    hitstopMin: number;
    hitstopMax: number;
    maxDamage: number;
    /** Launches faster than this bounce off the ground instead of stopping. */
    groundBounceSpeed: number;
    groundBounceRestitution: number;
    /** A downward launch on a grounded fighter is flipped upward and scaled by this. */
    groundedSpikeBounce: number;
    ceilingBounceRestitution: number;
    wallBounceRestitution: number;
    /** Landing from a launch faster than this counts as a hard landing (visual feedback). */
    hardLandingSpeed: number;
    /** Velocity given to an attacker whose `stopOnHit` move connects (e.g. Luigi's rocket). */
    reboundSpeedX: number;
    reboundSpeedY: number;
  };
}

export const DEFAULT_RULES: RulesConfig = {
  stocks: 3,
  infiniteStocks: false,
  timed: true,
  matchFrames: 5 * 60 * FPS,
  countdownFrames: 3 * FPS,
  respawnDelayFrames: 70,
  respawnHoverFrames: 150,
  respawnInvulnFrames: 120,
  coyoteFrames: 6,
  jumpBufferFrames: 8,
  attackBufferFrames: 6,
  dropThroughFrames: 14,
  ledgeSnap: 40,
  ledge: {
    grabRangeX: 36,
    grabAbove: 36,
    grabBelow: 56,
    wallClearance: 120,
    hangHeadroom: 14,
    invulnFrames: 40,
    regrabCooldownFrames: 30,
    maxGrabsPerAirtime: 4,
    maxHangFrames: 300, // 5 s
    actionDelayFrames: 6,
    climbFrames: 22,
    climbIntangibleFrames: 14,
    rollFrames: 34,
    rollIntangibleFrames: 22,
    rollDistance: 120,
    jumpScale: 1.05,
  },
  grab: {
    holdBaseFrames: 80,
    holdPerDamage: 0.5,
    holdMaxFrames: 160,
    mashFrames: 6,
    holdInputDelay: 6,
    pummelCooldownFrames: 18,
    pummelTimeCost: 14,
    pummelHitstop: 4,
    grabberReleaseFrames: 18,
    victimReleaseFrames: 10,
    releaseSpeed: 280,
    regrabImmuneFrames: 50,
    holdGap: 4,
  },
  shield: {
    maxHealth: 100,
    drainPerSecond: 8,
    regenPerSecond: 14,
    regenDelayFrames: 45,
    // Lights (3–5%) → ~10–12 shield damage, heavies (11–15%) → ~22–28.
    damageMultiplier: 1.5,
    damageBase: 5,
    stunBase: 3,
    stunPerDamage: 0.55,
    stunMax: 18,
    pushbackBase: 90,
    pushbackPerDamage: 22,
    minFrames: 4,
    releaseFrames: 7,
    breakStunFrames: 180, // 3 s
    breakLaunchSpeed: 620,
    breakRecoverHealth: 35,
  },
  dodge: {
    invulnFrames: 15, // 0.25 s
    totalFrames: 24,
    // Was 90 (1.5 s), longer than most moves' total duration: one dodge left you defenceless.
    cooldownFrames: 45, // 0.75 s
    rollSpeed: 520,
    airDodgeSpeed: 420,
    airDodgesPerAirtime: 1,
  },
  movement: {
    shortHopCut: 0.5,
    fastFallMinVy: -150,
    landingSpeedCap: 1.5,
    dropThroughSpeed: 120,
    edgeTolerance: 6,
    rollFriction: 0.3,
    dodgeEndFriction: 2,
    neutralAirDodgeDamping: 0.3,
  },
  combat: {
    knockback: {
      scale: 1,
      damageFactorBase: 0.5,
      damageFactorPerDamage: 0.05,
      referenceWeight: 100,
    },
    knockbackDecay: 1700,
    hitstunPerSpeed: 0.024,
    minHitstun: 6,
    maxHitstun: 80,
    comboHitstunDecay: 0.88,
    comboHitstunFloor: 0.6,
    comboResetFrames: 15,
    hitstunLandingCap: 10,
    hitstunDriftSpeed: 0.5,
    hitstunDriftAccel: 0.25,
    // Lights (3–5%) → 2–3 frames, heavies (11–15%) → 5–6, big specials → up to 9.
    hitstopBase: 1,
    hitstopPerDamage: 0.35,
    hitstopMin: 2,
    hitstopMax: 9,
    maxDamage: 999,
    groundBounceSpeed: 700,
    groundBounceRestitution: 0.6,
    groundedSpikeBounce: 0.8,
    ceilingBounceRestitution: 0.4,
    wallBounceRestitution: 0.3,
    hardLandingSpeed: 900,
    reboundSpeedX: 250,
    reboundSpeedY: 350,
  },
};

/** Partial overrides, nested one level deep (e.g. `{ combat: { hitstopMax: 6 } }`). */
export type RulesOverrides = Partial<Omit<RulesConfig, 'dodge' | 'movement' | 'combat' | 'ledge' | 'shield' | 'grab'>> & {
  grab?: Partial<RulesConfig['grab']>;
  dodge?: Partial<RulesConfig['dodge']>;
  ledge?: Partial<RulesConfig['ledge']>;
  shield?: Partial<RulesConfig['shield']>;
  movement?: Partial<RulesConfig['movement']>;
  combat?: Partial<Omit<RulesConfig['combat'], 'knockback'>> & { knockback?: Partial<RulesConfig['combat']['knockback']> };
};

export function makeRules(overrides: RulesOverrides = {}): RulesConfig {
  const combat: RulesConfig['combat'] = {
    ...DEFAULT_RULES.combat,
    ...(overrides.combat ?? {}),
    knockback: { ...DEFAULT_RULES.combat.knockback, ...(overrides.combat?.knockback ?? {}) },
  };
  return {
    ...DEFAULT_RULES,
    ...overrides,
    dodge: { ...DEFAULT_RULES.dodge, ...(overrides.dodge ?? {}) },
    ledge: { ...DEFAULT_RULES.ledge, ...(overrides.ledge ?? {}) },
    shield: { ...DEFAULT_RULES.shield, ...(overrides.shield ?? {}) },
    grab: { ...DEFAULT_RULES.grab, ...(overrides.grab ?? {}) },
    movement: { ...DEFAULT_RULES.movement, ...(overrides.movement ?? {}) },
    combat,
  };
}
