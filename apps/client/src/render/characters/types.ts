import type Phaser from 'phaser';
import type { AnimFrame } from '../../anim/controller';
import type { DrawResult } from '../art';

export interface DrawOptions {
  scale?: number;
  flash?: boolean;
  alpha?: number;
}

/**
 * Draws one fighter from an AnimFrame. Implementations: procedural vector art (default) and
 * sprite/atlas frames (when artwork is supplied). Combat code never sees which one is in use.
 */
export interface CharacterRenderer {
  readonly kind: 'procedural' | 'sprite';
  readonly objects: Phaser.GameObjects.GameObject[];
  draw(frame: AnimFrame, x: number, y: number, facing: 1 | -1, opts?: DrawOptions): DrawResult;
  hide(): void;
}
