import type Phaser from 'phaser';
import type { FighterId } from '@arena-rush/shared';
import type { AnimFrame } from '../../anim/controller';
import { drawFighter, type DrawResult } from '../art';
import type { CharacterRenderer, DrawOptions } from './types';

/** Vector-art fighter drawn every frame into a Graphics object (placeholder art, no assets needed). */
export class ProceduralCharacter implements CharacterRenderer {
  readonly kind = 'procedural' as const;
  readonly g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, private readonly fighter: FighterId, private readonly alt = false) {
    this.g = scene.add.graphics();
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.g];
  }

  draw(frame: AnimFrame, x: number, y: number, facing: 1 | -1, opts: DrawOptions = {}): DrawResult {
    this.g.clear();
    this.g.setVisible(true);
    this.g.setAlpha(opts.alpha ?? frame.pose.alpha);
    return drawFighter(this.g, this.fighter, frame.pose, x, y, facing, opts.scale ?? 1, opts.flash ?? false, this.alt, frame);
  }

  hide(): void {
    this.g.clear();
    this.g.setVisible(false);
  }
}
