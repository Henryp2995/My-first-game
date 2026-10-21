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
    const labels = ['idle', 'run', 'rise', 'hurt', 'light', 'heavy', 'special', 'aerial', 'victory'];
    labels.forEach((l, i) => bodyText(this, 75 + i * 140, 14, l, 15, '#14112b', '900'));
  }

  update(): void {
    this.t++;
    const g = this.g;
    g.clear();
    FIGHTER_ORDER.forEach((id, row) => {
      const def = FIGHTERS[id];
      const y = 125 + row * 99;
      const cells: { action: FighterAction | 'victory'; slot?: MoveSlot; vy?: number; grounded?: boolean; vx?: number }[] = [
        { action: 'idle' }, { action: 'run', vx: def.stats.runSpeed }, { action: 'air', vy: -500, grounded: false },
        { action: 'hitstun' }, { action: 'attack', slot: 'light' }, { action: 'attack', slot: 'heavy' },
        { action: 'attack', slot: 'special' }, { action: 'attack', slot: 'aerial', grounded: false }, { action: 'victory' },
      ];
      cells.forEach((c, i) => {
        const move = c.slot ? def.moves[c.slot] : null;
        const frame = move ? Math.floor((this.t / 2) % (move.startup + move.active + move.recovery)) : 0;
        const input: AnimInput = {
          fighter: id, action: c.action as AnimInput['action'], move, actionFrame: frame, grounded: c.grounded ?? true,
          vx: c.vx ?? 0, vy: c.vy ?? 0, runSpeed: def.stats.runSpeed, t: this.t, flip: -1, tumble: false,
          charge: 0.5, rocketLaunched: move?.behavior?.type === 'rocket' ? frame >= move.startup : false,
        };
        const pose = computePose(input);
        drawFighter(g, id, { ...pose, alpha: 1 }, 75 + i * 140, y, 1, 1.05);
      });
    });
    g.lineStyle(1, 0x14112b, 0.3);
    for (let r = 0; r < FIGHTER_ORDER.length; r++) g.lineBetween(0, 125 + r * 99, GAME_WIDTH, 125 + r * 99);
  }
}
