import Phaser from 'phaser';
import type { AnimFrame } from '../../anim/controller';
import type { FighterId } from '@arena-rush/shared';
import { bakeFighterAtlas } from './bake';
import { SPRITE_MANIFEST, type SpriteSheetSpec } from './manifest';
import { ProceduralCharacter } from './procedural';
import { SpriteCharacter } from './sprite';
import type { CharacterRenderer } from './types';

export type { CharacterRenderer, DrawOptions } from './types';
export { SPRITE_MANIFEST } from './manifest';

/** `?sprites=baked` renders every fighter through the sprite pipeline using auto-baked frames. */
export function bakedSpritesRequested(): boolean {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').get('sprites') === 'baked';
  } catch {
    return false;
  }
}

/** Queues real sprite atlases from the manifest for loading (call from a scene's preload). */
export function preloadCharacterArt(scene: Phaser.Scene): void {
  for (const spec of Object.values(SPRITE_MANIFEST) as SpriteSheetSpec[]) {
    if (!scene.textures.exists(spec.key)) scene.load.atlas(spec.key, spec.atlasPng, spec.atlasJson);
  }
  scene.load.once('complete', () => {
    for (const spec of Object.values(SPRITE_MANIFEST) as SpriteSheetSpec[]) {
      if (spec.filter === 'nearest' && scene.textures.exists(spec.key)) {
        scene.textures.get(spec.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }
  });
}

/**
 * Picks the renderer for a fighter: finished sprite art if it was loaded, baked sprites in the
 * `?sprites=baked` dev mode, otherwise the procedural placeholder art.
 */
export function createCharacterRenderer(scene: Phaser.Scene, fighter: FighterId, alt = false): CharacterRenderer {
  const spec = SPRITE_MANIFEST[fighter];
  if (spec && scene.textures.exists(spec.key)) return new SpriteCharacter(scene, spec, alt);
  if (bakedSpritesRequested()) return new SpriteCharacter(scene, bakeFighterAtlas(scene, fighter, alt));
  return new ProceduralCharacter(scene, fighter, alt);
}

/**
 * Lazily creates one renderer per (fighter, costume, slot) for menus and HUDs, so previews use the
 * same art as the match (sprites when available). Call begin() then draw() each frame; anything
 * not drawn this frame is hidden by end().
 */
export class FigureCache {
  private figures = new Map<string, CharacterRenderer>();
  private used = new Set<string>();

  constructor(private scene: Phaser.Scene, private onCreate?: (objects: Phaser.GameObjects.GameObject[]) => void) {}

  begin(): void {
    this.used.clear();
  }

  draw(fighter: FighterId, frame: AnimFrame, x: number, y: number, facing: 1 | -1, scale: number, opts: { alt?: boolean; slot?: string; alpha?: number } = {}) {
    const key = `${fighter}|${opts.alt ? 1 : 0}|${opts.slot ?? ''}`;
    let fig = this.figures.get(key);
    if (!fig) {
      fig = createCharacterRenderer(this.scene, fighter, !!opts.alt);
      this.figures.set(key, fig);
      this.onCreate?.(fig.objects);
    }
    this.used.add(key);
    return fig.draw(frame, x, y, facing, { scale, alpha: opts.alpha });
  }

  end(): void {
    for (const [key, fig] of this.figures) if (!this.used.has(key)) fig.hide();
  }

  /** Objects of every figure created so far (e.g. to add to a container or layer). */
  get objects(): Phaser.GameObjects.GameObject[] {
    return [...this.figures.values()].flatMap((f) => f.objects);
  }
}
