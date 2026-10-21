import Phaser from 'phaser';
import type { ProjectileState } from '@arena-rush/shared';

/** Draws live projectiles from match state (rendering only — the sim owns their positions and hits). */
export class ProjectileView {
  readonly g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics();
  }

  draw(projectiles: readonly ProjectileState[], clock: number): void {
    const g = this.g;
    g.clear();
    for (const p of projectiles) {
      if (p.kind === 'beam') this.beam(p, clock);
      else if (p.kind === 'web') this.web(p, clock);
      else this.batarang(p);
    }
  }

  private beam(p: ProjectileState, clock: number): void {
    const g = this.g;
    const wobble = Math.sin(clock * 0.9) * 2;
    const h = p.h + wobble;
    const fade = Math.min(1, p.life / 8);
    // Beam body from the firing point to the head, layered glow → core.
    g.lineStyle(h * 1.15, 0x2f8cff, 0.3 * fade);
    g.lineBetween(p.originX, p.originY, p.x, p.y);
    g.lineStyle(h * 0.75, 0x6fd8ff, 0.7 * fade);
    g.lineBetween(p.originX, p.originY, p.x, p.y);
    g.lineStyle(h * 0.35, 0xffffff, 0.95 * fade);
    g.lineBetween(p.originX, p.originY, p.x, p.y);
    g.fillStyle(0x6fd8ff, 0.5 * fade);
    g.fillCircle(p.x, p.y, h * 0.75);
    g.fillStyle(0xffffff, fade);
    g.fillCircle(p.x, p.y, h * 0.42);
  }

  private web(p: ProjectileState, clock: number): void {
    const g = this.g;
    const dir = Math.sign(p.vx) || 1;
    g.lineStyle(1.5, 0xffffff, 0.7);
    g.lineBetween(p.x - dir * 40, p.y, p.x, p.y);
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(p.x, p.y, 7);
    g.lineStyle(2, 0xffffff, 0.9);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + clock * 0.2;
      g.lineBetween(p.x, p.y, p.x + Math.cos(a) * 13, p.y + Math.sin(a) * 11);
    }
  }

  private batarang(p: ProjectileState): void {
    const g = this.g;
    const spin = p.age * 0.55;
    const pts: [number, number][] = [[-16, 0], [-9, -3], [-5, -6], [-2, -3], [0, -5], [2, -3], [5, -6], [9, -3], [16, 0], [8, 3], [3, 6], [0, 3], [-3, 6], [-8, 3]];
    const sx = Math.cos(spin);
    const world = pts.map(([x, y]) => ({ x: p.x + x * sx, y: p.y + y }));
    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(p.x, p.y, 3);
    g.lineStyle(3.5, 0xe6e9f2, 0.9);
    g.strokePoints(world, true);
    g.fillStyle(0x16161d, 1);
    g.fillPoints(world, true);
  }
}
