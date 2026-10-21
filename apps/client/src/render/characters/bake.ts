import Phaser from 'phaser';
import { FIGHTERS, type FighterId, type MoveSlot } from '@arena-rush/shared';
import { sampleStateFrame } from '../../anim/controller';
import { ANIM_STATES, type AnimState } from '../../anim/states';
import { drawFighter } from '../art';
import { RECOMMENDED_FRAMES, type SpriteSheetSpec } from './manifest';

const CELL = 192;
const FEET_Y = 160;
const ATTACKS: AnimState[] = ['light', 'heavy', 'special', 'aerial'];

/**
 * Dev tool: renders the procedural animations into an in-memory texture atlas laid out exactly
 * like a real sprite sheet (`<state>_<index>` frames). Used to exercise the sprite pipeline end to
 * end (`?sprites=baked`) before illustrated artwork exists. Baked once per fighter and cached.
 */
export function bakeFighterAtlas(scene: Phaser.Scene, fighter: FighterId, alt = false): SpriteSheetSpec {
  const key = `baked-${fighter}${alt ? '-alt' : ''}`;
  const spec: SpriteSheetSpec = {
    key, atlasPng: '', atlasJson: '', scale: 1, anchorX: 0.5, anchorY: FEET_Y / CELL,
    fps: {}, head: { x: 8, y: -90 }, hand: { x: 30, y: -50 },
  };
  if (scene.textures.exists(key)) return spec;

  const cells: { name: string; state: AnimState; t: number }[] = [];
  for (const state of ANIM_STATES) {
    const n = RECOMMENDED_FRAMES[state];
    for (let i = 0; i < n; i++) {
      // Attacks: spread n frames evenly over the move's real duration. Loops: sample one cycle.
      const t = ATTACKS.includes(state) ? Math.floor((i / n) * moveTotal(fighter, state as MoveSlot)) : i * 6;
      cells.push({ name: `${state}_${i}`, state, t });
    }
  }

  const cols = 16;
  const rows = Math.ceil(cells.length / cols);
  const rt = scene.make.renderTexture({ x: 0, y: 0, width: cols * CELL, height: rows * CELL }, false);
  const g = scene.make.graphics({}, false);
  cells.forEach((cell, i) => {
    const frame = sampleStateFrame(fighter, cell.state, cell.t);
    const cx = (i % cols) * CELL + CELL / 2;
    const cy = Math.floor(i / cols) * CELL + FEET_Y;
    drawFighter(g, fighter, frame.pose, cx, cy, 1, 1, false, alt, frame);
  });
  rt.draw(g);
  rt.saveTexture(key);
  const tex = scene.textures.get(key);
  cells.forEach((cell, i) => tex.add(cell.name, 0, (i % cols) * CELL, Math.floor(i / cols) * CELL, CELL, CELL));
  g.destroy();
  return spec;
}

function moveTotal(fighter: FighterId, slot: MoveSlot): number {
  const m = FIGHTERS[fighter].moves[slot];
  return m.startup + m.active + m.recovery;
}
