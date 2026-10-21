import Phaser from 'phaser';
import { FIGHTERS, FIGHTER_ORDER, type FighterId } from '@arena-rush/shared';
import { sampleStateFrame } from '../anim/controller';
import { ANIM_STATES, type AnimState } from '../anim/states';
import { drawFighter } from '../render/art';
import { GAME_WIDTH } from '../theme';
import { bodyText } from '../ui/widgets';

const OVERVIEW: AnimState[] = ['idle', 'run', 'rise', 'hit', 'light', 'heavy', 'special', 'aerial', 'victory'];
const ROW_H = Math.min(99, Math.floor(600 / FIGHTER_ORDER.length));
const ROW_SCALE = ROW_H / 94;

/**
 * Dev tool for art and animation review.
 *   ?gallery            every fighter in key states
 *   ?gallery=<fighter>  one fighter, large, in every animation state
 * Attacks loop through their real move timing.
 */
export class GalleryScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private t = 0;
  private single: FighterId | null = null;

  constructor() {
    super('Gallery');
  }

  create(): void {
    const param = new URLSearchParams(location.search).get('gallery');
    this.single = param && param in FIGHTERS ? (param as FighterId) : null;
    this.cameras.main.setBackgroundColor('#b8a8f0');
    this.g = this.add.graphics();
    if (this.single) {
      bodyText(this, GAME_WIDTH / 2, 18, `${FIGHTERS[this.single].name} — every animation state`, 18, '#14112b', '900');
      ANIM_STATES.forEach((state, i) => {
        const { x, y } = this.cell(i);
        bodyText(this, x, y + 18, state, 13, '#14112b', '900');
      });
    } else {
      OVERVIEW.forEach((l, i) => bodyText(this, 75 + i * 140, 14, l, 15, '#14112b', '900'));
    }
  }

  private cell(i: number) {
    const perRow = 9;
    return { x: 72 + (i % perRow) * 142, y: 300 + Math.floor(i / perRow) * 300 };
  }

  update(): void {
    this.t++;
    const g = this.g;
    g.clear();
    if (this.single) {
      const id = this.single;
      ANIM_STATES.forEach((state, i) => {
        const { x, y } = this.cell(i);
        const frame = sampleStateFrame(id, state, this.t / 1.5);
        g.lineStyle(1, 0x14112b, 0.25);
        g.lineBetween(x - 60, y, x + 60, y);
        drawFighter(g, id, { ...frame.pose, alpha: 1 }, x, y, 1, 1.6, false, false, frame);
      });
      return;
    }
    FIGHTER_ORDER.forEach((id, row) => {
      const y = 125 + row * ROW_H;
      OVERVIEW.forEach((state, i) => {
        const frame = sampleStateFrame(id, state, this.t / 1.5);
        drawFighter(g, id, { ...frame.pose, alpha: 1 }, 75 + i * 140, y, 1, ROW_SCALE, false, false, frame);
      });
    });
    g.lineStyle(1, 0x14112b, 0.3);
    for (let r = 0; r < FIGHTER_ORDER.length; r++) g.lineBetween(0, 125 + r * ROW_H, GAME_WIDTH, 125 + r * ROW_H);
  }
}
