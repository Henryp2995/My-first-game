/** Fixed simulation rate. All frame counts in the game data are at this rate. */
export const FPS = 60;
export const DT = 1 / FPS;

export interface RulesConfig {
  stocks: number;
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
  dodge: {
    invulnFrames: number;
    totalFrames: number;
    cooldownFrames: number;
    rollSpeed: number;
    airDodgeSpeed: number;
  };
  combat: {
    /** Launch speed (px/s) lost per second while flying from knockback. */
    knockbackDecay: number;
    /** Hitstun frames per px/s of launch speed. */
    hitstunPerSpeed: number;
    minHitstun: number;
    maxHitstun: number;
    hitstopBase: number;
    hitstopPerDamage: number;
    hitstopMax: number;
    maxDamage: number;
    /** Launches faster than this bounce off the ground instead of stopping. */
    groundBounceSpeed: number;
  };
}

export const DEFAULT_RULES: RulesConfig = {
  stocks: 3,
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
  dodge: {
    invulnFrames: 15, // 0.25 s
    totalFrames: 24,
    cooldownFrames: 90, // 1.5 s
    rollSpeed: 520,
    airDodgeSpeed: 420,
  },
  combat: {
    knockbackDecay: 1700,
    hitstunPerSpeed: 0.024,
    minHitstun: 6,
    maxHitstun: 80,
    hitstopBase: 3,
    hitstopPerDamage: 0.4,
    hitstopMax: 14,
    maxDamage: 999,
    groundBounceSpeed: 700,
  },
};

export function makeRules(overrides: Partial<RulesConfig> = {}): RulesConfig {
  return {
    ...DEFAULT_RULES,
    ...overrides,
    dodge: { ...DEFAULT_RULES.dodge, ...(overrides.dodge ?? {}) },
    combat: { ...DEFAULT_RULES.combat, ...(overrides.combat ?? {}) },
  };
}
