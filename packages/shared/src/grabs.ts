/**
 * Grabs, pummels and throws — every per-fighter number lives here (shared timing rules live in
 * RulesConfig.grab). Plain data, used by the deterministic simulation in match.ts.
 *
 * Combat triangle: attacks beat grabs (a grab is slow to start and very punishable on a whiff),
 * shields beat attacks, and grabs beat shields.
 */
import type { FighterId } from './fighters';

export type ThrowDir = 'forward' | 'back' | 'up' | 'down';
export const THROW_DIRS: ThrowDir[] = ['forward', 'back', 'up', 'down'];

export interface ThrowDef {
  damage: number;
  baseKnockback: number;
  knockbackGrowth: number;
  /** Launch angle relative to the throw's direction (forward/up/down: the grabber's facing; back: behind). 90 = up. */
  angle: number;
  /** Frame (from the start of the throw) the opponent is launched. */
  releaseFrame: number;
  /** Total length of the throw for the thrower. */
  totalFrames: number;
  hitstunMultiplier?: number;
}

/** Visual identity for the client (effects/sounds); the sim ignores it. */
export type GrabStyle = 'flat' | 'comedic' | 'ninja' | 'web' | 'martial' | 'clone' | 'ki' | 'mech' | 'force';

export interface GrabDef {
  startup: number;
  active: number;
  /** Lag after a whiffed grab — the window where attacks punish it. */
  recovery: number;
  /** Grab box, relative to the feet for a fighter facing right (like attack hitboxes). */
  box: { x: number; y: number; w: number; h: number };
  pummelDamage: number;
  style: GrabStyle;
  throws: Record<ThrowDir, ThrowDef>;
}

const BASE: GrabDef = {
  startup: 6,
  active: 3,
  recovery: 18,
  box: { x: 34, y: -46, w: 44, h: 52 },
  pummelDamage: 1.5,
  style: 'martial',
  throws: {
    forward: { damage: 8, baseKnockback: 400, knockbackGrowth: 7, angle: 42, releaseFrame: 8, totalFrames: 22 },
    back: { damage: 9, baseKnockback: 450, knockbackGrowth: 8, angle: 40, releaseFrame: 12, totalFrames: 26 },
    up: { damage: 7, baseKnockback: 460, knockbackGrowth: 7.5, angle: 90, releaseFrame: 10, totalFrames: 24 },
    // A slam into the floor: the downward launch bounces off the ground into a low pop-up.
    down: { damage: 6, baseKnockback: 300, knockbackGrowth: 4, angle: -78, releaseFrame: 12, totalFrames: 26, hitstunMultiplier: 1.25 },
  },
};

type GrabOverrides = Partial<Omit<GrabDef, 'throws' | 'box'>> & {
  box?: Partial<GrabDef['box']>;
  throws?: Partial<Record<ThrowDir, Partial<ThrowDef>>>;
};

function grab(over: GrabOverrides): GrabDef {
  const throws = { ...BASE.throws };
  for (const dir of THROW_DIRS) throws[dir] = { ...BASE.throws[dir], ...(over.throws?.[dir] ?? {}) };
  return { ...BASE, ...over, box: { ...BASE.box, ...(over.box ?? {}) }, throws };
}

export const GRABS: Record<FighterId, GrabDef> = {
  // Quick grab, moderate throws, choppy LCD poses.
  gnw: grab({ style: 'flat', startup: 5, recovery: 16, pummelDamage: 1.2 }),
  // Goofy grab with a big up throw.
  luigi: grab({ style: 'comedic', throws: { up: { damage: 9, baseKnockback: 520, knockbackGrowth: 8.5 } } }),
  // Fast grab and snappy throws; down throw leads into combos.
  sheik: grab({
    style: 'ninja', startup: 5, recovery: 16,
    throws: {
      forward: { damage: 7, releaseFrame: 6, totalFrames: 18 },
      back: { damage: 8, releaseFrame: 8, totalFrames: 20 },
      up: { damage: 6, releaseFrame: 7, totalFrames: 19 },
      down: { damage: 5, releaseFrame: 8, totalFrames: 20, hitstunMultiplier: 1.4 },
    },
  }),
  // Web-assisted reach; fast forward and back throws.
  spiderman: grab({
    style: 'web', box: { x: 40, w: 56 },
    throws: { forward: { releaseFrame: 6, totalFrames: 18 }, back: { releaseFrame: 9, totalFrames: 22 } },
  }),
  // Slower grapple, powerful grounded throws.
  batman: grab({
    style: 'martial', startup: 7, recovery: 20,
    throws: {
      forward: { damage: 10, baseKnockback: 440 },
      back: { damage: 11, baseKnockback: 500 },
      down: { damage: 8 },
    },
  }),
  // Quick throws with combo-friendly down throw (shadow clone effects on the client).
  naruto: grab({
    style: 'clone', pummelDamage: 1,
    throws: {
      forward: { releaseFrame: 7, totalFrames: 20 },
      back: { releaseFrame: 9, totalFrames: 22 },
      up: { releaseFrame: 8, totalFrames: 21 },
      down: { releaseFrame: 9, totalFrames: 22, hitstunMultiplier: 1.35 },
    },
  }),
  // Powerful martial-arts throws, strongest up throw.
  goku: grab({
    style: 'ki',
    throws: { forward: { damage: 9 }, up: { damage: 9, baseKnockback: 540, knockbackGrowth: 9 } },
  }),
  // Slow mechanical grab, heavy slams.
  gundam: grab({
    style: 'mech', startup: 8, recovery: 22, pummelDamage: 2,
    throws: {
      forward: { damage: 10, baseKnockback: 420, releaseFrame: 10, totalFrames: 24 },
      back: { releaseFrame: 14, totalFrames: 28 },
      up: { releaseFrame: 12, totalFrames: 26 },
      down: { damage: 9, baseKnockback: 340, releaseFrame: 14, totalFrames: 28 },
    },
  }),
  // Deliberate Force grab with longer reach and strong horizontal launches.
  vader: grab({
    style: 'force', startup: 8, recovery: 22, box: { x: 44, y: -50, w: 60, h: 60 },
    throws: {
      forward: { damage: 10, baseKnockback: 470, knockbackGrowth: 8.5 },
      back: { damage: 11, baseKnockback: 500, knockbackGrowth: 9 },
    },
  }),
};
