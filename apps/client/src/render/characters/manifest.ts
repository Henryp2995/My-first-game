import type { FighterId } from '@arena-rush/shared';
import { ANIM_STATES, type AnimState } from '../../anim/states';
import generated from './sprites.generated.json';

/**
 * Sprite artwork for a fighter: a Phaser texture atlas (PNG + JSON hash) whose frames are named
 * `<state>_<index>` (e.g. `run_0` … `run_7`, `heavy_0` … `heavy_11`). See public/assets/fighters/README.md.
 */
export interface SpriteSheetSpec {
  /** Texture key (also the folder name convention: public/assets/fighters/<id>/). */
  key: string;
  atlasPng: string;
  atlasJson: string;
  /** World scale applied to frames (1 = 1 texture px per world px). */
  scale: number;
  /** Origin within a frame; feet should sit at (anchorX, anchorY), default bottom-center. */
  anchorX: number;
  anchorY: number;
  /** Playback rate per looping state (frames per second); attacks are timed by the move itself. */
  fps: Partial<Record<AnimState, number>>;
  /** Approximate head and front-hand offsets from the feet, in frame px (for effects and tags). */
  head: { x: number; y: number };
  hand: { x: number; y: number };
  /** 'nearest' keeps pixel art crisp when scaled. */
  filter?: 'nearest' | 'linear';
}

/**
 * Illustrated sprite artwork per fighter. A fighter with an entry here (and its loaded atlas) is
 * drawn with sprites; everyone else uses the procedural renderer. No combat-code changes needed.
 */
export const SPRITE_MANIFEST: Partial<Record<FighterId, SpriteSheetSpec>> = {
  // Entries written by `node tools/sprites/pack.mjs <fighter>`.
  ...(generated as Partial<Record<FighterId, SpriteSheetSpec>>),
};

/** Looping states (play continuously) vs one-shot states (hold the last frame). */
export const LOOPING_STATES: AnimState[] = ['idle', 'walk', 'run', 'rise', 'fall', 'knockback', 'victory', 'respawn'];

/** Frame counts we recommend artists provide per state (attacks are stretched over the move's real length). */
export const RECOMMENDED_FRAMES: Record<AnimState, number> = {
  idle: 8, walk: 8, run: 8, jumpStart: 2, rise: 2, fall: 2, land: 3,
  light: 8, heavy: 12, special: 12, aerial: 8, dodge: 4, hit: 2, knockback: 4, ko: 4, respawn: 1, victory: 12,
};

export const DEFAULT_FPS: Partial<Record<AnimState, number>> = {
  idle: 8, walk: 9, run: 14, rise: 8, fall: 8, knockback: 16, victory: 10, respawn: 8,
  jumpStart: 20, land: 18, dodge: 16, hit: 12, ko: 14,
};

export { ANIM_STATES };
