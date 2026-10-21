import type { FighterAction, MoveSlot } from '@arena-rush/shared';

/** Every visual animation state a fighter can be in. */
export type AnimState =
  | 'idle' | 'walk' | 'run'
  | 'jumpStart' | 'rise' | 'fall' | 'land'
  | 'light' | 'heavy' | 'special' | 'aerial'
  | 'dodge' | 'hit' | 'knockback' | 'ko' | 'respawn' | 'victory'
  | 'ledgeHang' | 'ledgeClimb' | 'ledgeRoll' | 'shield' | 'shieldBreak';

export const ANIM_STATES: AnimState[] = [
  'idle', 'walk', 'run', 'jumpStart', 'rise', 'fall', 'land', 'light', 'heavy', 'special', 'aerial',
  'dodge', 'hit', 'knockback', 'ko', 'respawn', 'victory',
  'ledgeHang', 'ledgeClimb', 'ledgeRoll', 'shield', 'shieldBreak',
];

/**
 * Higher wins when several states apply at once (e.g. a landing flourish never overrides an
 * attack or a hit reaction). Event-driven states (jumpStart, land, ko) compete with the state
 * the simulation implies.
 */
export const STATE_PRIORITY: Record<AnimState, number> = {
  ko: 100,
  hit: 90,
  shieldBreak: 85,
  ledgeHang: 75,
  ledgeClimb: 75,
  ledgeRoll: 75,
  shield: 72,
  knockback: 90,
  light: 80,
  heavy: 80,
  special: 80,
  aerial: 80,
  dodge: 70,
  land: 50,
  jumpStart: 45,
  rise: 30,
  fall: 30,
  run: 20,
  walk: 15,
  respawn: 12,
  idle: 10,
  victory: 5,
};

/** Frames to cross-fade INTO each state (scaled by the fighter's heft). 0 = snap. */
export const TRANSITION_FRAMES: Record<AnimState, number> = {
  ko: 0, hit: 0, knockback: 0,
  light: 1, heavy: 2, special: 2, aerial: 1,
  dodge: 2, land: 2, jumpStart: 1,
  rise: 4, fall: 7, run: 6, walk: 6, idle: 7, respawn: 0, victory: 6,
  ledgeHang: 2, ledgeClimb: 2, ledgeRoll: 1, shield: 2, shieldBreak: 0,
};

export interface StateInputs {
  action: FighterAction;
  eliminated: boolean;
  grounded: boolean;
  /** Ground speed as a fraction of run speed. */
  speedRatio: number;
  vy: number;
  move: MoveSlot | null;
  tumble: boolean;
  /** Remaining frames of event-driven visual states. */
  jumpStartLeft: number;
  landLeft: number;
  koLeft: number;
}

/** The state implied by the simulation alone (or null when the fighter isn't drawn). */
export function simState(i: StateInputs): AnimState | null {
  switch (i.action) {
    case 'dead':
      return null;
    case 'respawning':
      return 'respawn';
    case 'hitstun':
      return i.tumble ? 'knockback' : 'hit';
    case 'dodge':
      return 'dodge';
    case 'ledge':
      return 'ledgeHang';
    case 'ledgeClimb':
      return 'ledgeClimb';
    case 'ledgeRoll':
      return 'ledgeRoll';
    case 'shield':
    case 'shieldRelease':
      return 'shield';
    case 'shieldBreak':
      return 'shieldBreak';
    case 'attack':
      return i.move ?? 'light';
    case 'landing':
      return 'land';
    case 'air':
      return i.vy < 0 ? 'rise' : 'fall';
    default:
      if (!i.grounded) return i.vy < 0 ? 'rise' : 'fall';
      if (i.speedRatio < 0.12) return 'idle';
      return i.speedRatio < 0.6 ? 'walk' : 'run';
  }
}

/** Resolves the displayed state by priority among the sim state and active event states. */
export function resolveAnimState(i: StateInputs): AnimState | null {
  const candidates: AnimState[] = [];
  const sim = simState(i);
  if (sim) candidates.push(sim);
  if (i.koLeft > 0 && (i.action === 'dead' || i.eliminated)) candidates.push('ko');
  if (sim && i.jumpStartLeft > 0 && !i.grounded) candidates.push('jumpStart');
  if (sim && i.landLeft > 0 && i.grounded) candidates.push('land');
  if (!candidates.length) return null;
  return candidates.reduce((best, s) => (STATE_PRIORITY[s] > STATE_PRIORITY[best] ? s : best));
}
