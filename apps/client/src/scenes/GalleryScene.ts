import Phaser from 'phaser';
import { FIGHTERS, FIGHTER_ORDER, type FighterAction, type MoveSlot } from '@arena-rush/shared';
import { drawFighter } from '../render/art';
import { computePose, type AnimInput } from '../render/pose';
import { GAME_WIDTH } from '../theme';
import { bodyText } from '../ui/widgets';

/** Dev tool (open with `?gallery`): every fighter in a range of poses, for art iteration. */
export class GalleryScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private t = 0;

  constructor() {
    super('Gallery');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#b8a8f0');
    this.g = this.add.graphics();
    const labels = ['idle', 'run', 'rise', 'hurt', 'light', 'heavy', 'special', 'aerial'];
    labels.forEach((l, i) => bodyText(this, 90 + i * 155, 20, l, 16, '#14112b', '900'));
  }

  update(): void {
    this.t++;
    const g = this.g;
    g.clear();
    FIGHTER_ORDER.forEach((id, row) => {
      const def = FIGHTERS[id];
      const y = 225 + row * 225;
      const cells: { action: FighterAction; slot?: MoveSlot; vy?: number; grounded?: boolean; vx?: number }[] = [
        { action: 'idle' }, { action: 'run', vx: def.stats.runSpeed }, { action: 'air', vy: -500, grounded: false },
        { action: 'hitstun' }, { action: 'attack', slot: 'light' }, { action: 'attack', slot: 'heavy' },
        { action: 'attack', slot: 'special' }, { action: 'attack', slot: 'aerial', grounded: false },
      ];
      cells.forEach((c, i) => {
        const move = c.slot ? def.moves[c.slot] : null;
        const frame = move ? Math.floor((this.t / 2) % (move.startup + move.active + move.recovery)) : 0;
        const input: AnimInput = {
          fighter: id, action: c.action, move, actionFrame: frame, grounded: c.grounded ?? true,
          vx: c.vx ?? 0, vy: c.vy ?? 0, runSpeed: def.stats.runSpeed, t: this.t, flip: -1, tumble: false,
          charge: 0.5, rocketLaunched: move?.behavior?.type === 'rocket' ? frame >= move.startup : false,
        };
        const pose = computePose(input);
        drawFighter(g, id, { ...pose, alpha: 1 }, 90 + i * 155, y, 1, 2);
      });
    });
    g.lineStyle(1, 0x14112b, 0.3);
    for (let r = 0; r < 3; r++) g.lineBetween(0, 225 + r * 225, GAME_WIDTH, 225 + r * 225);
  }
}
