import Phaser from 'phaser';
import type { AnimFrame } from '../../anim/controller';
import type { AnimState } from '../../anim/states';
import type { DrawResult } from '../art';
import { DEFAULT_FPS, LOOPING_STATES, SPRITE_FALLBACKS, type SpriteSheetSpec } from './manifest';
import type { CharacterRenderer, DrawOptions } from './types';

/**
 * Draws a fighter from texture-atlas frames named `<state>_<index>`. Looping states play at the
 * manifest fps; attacks map their frames onto the move's real progress so sprites stay in sync
 * with hitboxes. Missing states fall back to the closest available art (SPRITE_FALLBACKS), then `idle`.
 */
export class SpriteCharacter implements CharacterRenderer {
  readonly kind = 'sprite' as const;
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly frameCounts = new Map<AnimState, number>();

  constructor(scene: Phaser.Scene, private readonly spec: SpriteSheetSpec, private readonly alt = false) {
    const tex = scene.textures.get(spec.key);
    for (const name of tex.getFrameNames()) {
      const m = /^([a-zA-Z]+)_(\d+)$/.exec(name);
      if (!m) continue;
      const state = m[1] as AnimState;
      this.frameCounts.set(state, Math.max(this.frameCounts.get(state) ?? 0, Number(m[2]) + 1));
    }
    this.sprite = scene.add.sprite(0, 0, spec.key, this.frameName('idle', 0)).setOrigin(spec.anchorX, spec.anchorY);
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.sprite];
  }

  /** States this atlas actually provides. */
  get states(): AnimState[] {
    return [...this.frameCounts.keys()];
  }

  private frameName(state: AnimState, index: number): string {
    return `${state}_${index}`;
  }

  /** Picks the frame for an AnimFrame (exposed for tests and debugging). */
  pickFrame(frame: AnimFrame): string {
    const state = [frame.state, ...(SPRITE_FALLBACKS[frame.state] ?? [])].find((s) => this.frameCounts.has(s)) ?? 'idle';
    const count = this.frameCounts.get(state) ?? 1;
    let index: number;
    if (frame.attackPhase) {
      index = Math.min(count - 1, Math.floor(frame.clipProgress * count));
    } else {
      const fps = this.spec.fps[state] ?? DEFAULT_FPS[state] ?? 10;
      const raw = Math.floor((frame.stateTime * fps) / 60);
      index = LOOPING_STATES.includes(state) ? raw % count : Math.min(count - 1, raw);
    }
    return this.frameName(state, index);
  }

  draw(frame: AnimFrame, x: number, y: number, facing: 1 | -1, opts: DrawOptions = {}): DrawResult {
    const scale = (opts.scale ?? 1) * this.spec.scale;
    const flipped = frame.pose.flip ? -facing : facing;
    this.sprite
      .setVisible(true)
      .setFrame(this.pickFrame(frame))
      .setPosition(x, y)
      .setFlipX(flipped < 0)
      .setScale(scale * frame.squashX, scale * frame.squashY)
      .setAlpha(opts.alpha ?? frame.pose.alpha);
    // Mirror matches: sprites have no alternate costume yet, so the second copy is tinted.
    if (opts.flash) this.sprite.setTintFill(0xffffff);
    else if (this.alt) this.sprite.setTint(0x9fb8ff);
    else this.sprite.clearTint();
    const head = { x: x + this.spec.head.x * scale * flipped, y: y + this.spec.head.y * scale };
    return {
      head,
      top: y - this.sprite.height * scale * this.spec.anchorY,
      propAnchor: null,
      handF: { x: x + this.spec.hand.x * scale * flipped, y: y + this.spec.hand.y * scale },
      weaponTip: null,
    };
  }

  hide(): void {
    this.sprite.setVisible(false);
  }
}
