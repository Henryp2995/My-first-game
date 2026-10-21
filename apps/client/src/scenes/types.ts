import { CPU_PROFILES, type CpuDifficulty, type FighterId, type FighterMatchStats, type StageId } from '@arena-rush/shared';
import { CPU_COLOR, CPU_CSS, PLAYER_COLORS, PLAYER_CSS } from '../theme';

/**
 * Who drives a fighter. Local matches are always one human (keyboard) vs one CPU, but the setup
 * stays a list of slots so online play can later add 'remote' players on other computers.
 */
export type PlayerSlot =
  | { fighter: FighterId; control: 'human' }
  | { fighter: FighterId; control: 'cpu'; difficulty: CpuDifficulty }
  /** Training Mode only: driven by the training dummy controller, not the versus CPU. */
  | { fighter: FighterId; control: 'dummy' };

export type GameMode = 'versus' | 'training';

export interface MatchSetup {
  /** Missing → 'versus' (Player vs CPU). */
  mode?: GameMode;
  players: PlayerSlot[];
  /** Chosen on the stage select screen (missing → Skyfall Arena). */
  stage?: StageId;
}

export interface MatchSummary {
  setup: MatchSetup;
  winner: number | null;
  reason: 'stocks' | 'time';
  durationFrames: number;
  /** Player indices from 1st place to last. */
  ranking: number[];
  results: { fighter: FighterId; stocks: number; damage: number; stats: FighterMatchStats }[];
}

/** Short tag shown above fighters and on cards: "P1", "CPU" (numbered if there are several). */
export function slotLabel(setup: MatchSetup, i: number): string {
  const slot = setup.players[i];
  const same = setup.players.filter((p) => p.control === slot.control);
  const n = setup.players.slice(0, i + 1).filter((p) => p.control === slot.control).length;
  if (slot.control === 'dummy') return 'DUMMY';
  if (slot.control === 'cpu') return same.length > 1 ? `CPU${n}` : 'CPU';
  return `P${n}`;
}

/** Longer description, e.g. "CPU · HARD". */
export function slotDescription(setup: MatchSetup, i: number): string {
  const slot = setup.players[i];
  if (slot.control === 'dummy') return 'TRAINING DUMMY';
  return slot.control === 'cpu' ? `CPU · ${CPU_PROFILES[slot.difficulty].label.toUpperCase()}` : `PLAYER ${slotLabel(setup, i).slice(1)}`;
}

export function slotColor(setup: MatchSetup, i: number): number {
  return setup.players[i].control !== 'human' ? CPU_COLOR : PLAYER_COLORS[i % PLAYER_COLORS.length];
}

export function slotCss(setup: MatchSetup, i: number): string {
  return setup.players[i].control !== 'human' ? CPU_CSS : PLAYER_CSS[i % PLAYER_CSS.length];
}

/** True if an earlier slot has the same fighter, so this one wears the alternate costume. */
export function isAltCostume(setup: MatchSetup, i: number): boolean {
  const fighter = setup.players[i].fighter;
  return setup.players.slice(0, i).some((p) => p.fighter === fighter);
}

export const isTraining = (setup: MatchSetup): boolean => setup.mode === 'training';

/** Training setup: you vs a training dummy on the chosen stage. */
export function trainingSetup(player: FighterId, dummy: FighterId, stage?: StageId): MatchSetup {
  return { mode: 'training', players: [{ fighter: player, control: 'human' }, { fighter: dummy, control: 'dummy' }], stage };
}
