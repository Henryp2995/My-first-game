import Phaser from 'phaser';
import type { StageDef } from '@arena-rush/shared';
import { GAME_HEIGHT, GAME_WIDTH } from '../theme';

const SKY_KEY = 'skyfall-sky';

function ensureSkyTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(SKY_KEY)) return;
  const w = 16;
  const h = 512;
  const tex = scene.textures.createCanvas(SKY_KEY, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#2b1f7a');
  grad.addColorStop(0.35, '#6a4cf0');
  grad.addColorStop(0.62, '#ff86c2');
  grad.addColorStop(0.82, '#ffc98f');
  grad.addColorStop(1, '#ffe9b8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  tex.refresh();
}

/** Seeded pseudo-random so the backdrop looks the same every load. */
function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Parallax sky: gradient, stars, distant mountains, floating islands, clouds.
 * Layers are drawn in "screen space at the default camera scroll" (sx0, sy0); scroll factors make them parallax.
 */
export class Backdrop {
  readonly objects: Phaser.GameObjects.GameObject[] = [];
  private clouds: { obj: Phaser.GameObjects.Graphics; speed: number; baseX: number }[] = [];
  private islands: { obj: Phaser.GameObjects.Graphics; baseY: number; phase: number }[] = [];
  private t = 0;

  constructor(private scene: Phaser.Scene, private sx0 = 0, private sy0 = 0) {
    ensureSkyTexture(scene);
    const sky = scene.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, SKY_KEY)
      .setDisplaySize(GAME_WIDTH * 2.2, GAME_HEIGHT * 2.3)
      .setScrollFactor(0);
    this.objects.push(sky);

    const r = rand(7);
    // Stars
    const stars = this.layer(0.02);
    for (let i = 0; i < 90; i++) {
      const x = -800 + r() * 2900;
      const y = -500 + r() * 650;
      stars.fillStyle(0xffffff, 0.3 + r() * 0.6);
      stars.fillCircle(x, y, r() < 0.15 ? 2 : 1.2);
    }
    // Sun glow
    const sun = this.layer(0.05);
    sun.fillStyle(0xfff2c4, 0.18);
    sun.fillCircle(980, 360, 220);
    sun.fillStyle(0xfff2c4, 0.3);
    sun.fillCircle(980, 360, 130);
    sun.fillStyle(0xfffbe8, 0.9);
    sun.fillCircle(980, 360, 70);

    this.addCloudLayer(0.08, 0.55, 5, r, 0xffd9f0);
    this.mountains(0.12, 470, 0x9a7be0, 0xd8c8ff, r, 160, 260);
    this.mountains(0.22, 560, 0x6a4fc4, 0xc0b0f5, r, 120, 200);
    this.addIslands(0.35, r);
    this.addCloudLayer(0.45, 0.85, 4, r, 0xffffff);
  }

  private layer(sf: number): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    g.setScrollFactor(sf);
    g.setPosition(sf * this.sx0, sf * this.sy0);
    this.objects.push(g);
    return g;
  }

  private mountains(sf: number, baseY: number, color: number, cap: number, r: () => number, minH: number, maxH: number): void {
    const g = this.layer(sf);
    const pts: Phaser.Types.Math.Vector2Like[] = [{ x: -1500, y: 1600 }];
    let x = -1500;
    const peaks: { x: number; y: number; w: number }[] = [];
    while (x < 2800) {
      const w = 140 + r() * 200;
      const h = minH + r() * (maxH - minH);
      pts.push({ x, y: baseY });
      pts.push({ x: x + w / 2, y: baseY - h });
      peaks.push({ x: x + w / 2, y: baseY - h, w });
      x += w;
    }
    pts.push({ x, y: baseY }, { x, y: 1600 });
    g.fillStyle(color, 1);
    g.fillPoints(pts, true);
    g.fillStyle(cap, 0.9);
    for (const p of peaks) {
      const s = p.w * 0.16;
      g.fillTriangle(p.x, p.y, p.x - s, p.y + s * 1.1, p.x + s, p.y + s * 1.1);
    }
  }

  private addIslands(sf: number, r: () => number): void {
    const spots = [
      { x: -260, y: 220, s: 0.8 }, { x: 140, y: 120, s: 0.55 }, { x: 1180, y: 160, s: 0.7 },
      { x: 1500, y: 300, s: 0.5 }, { x: -620, y: 340, s: 0.6 }, { x: 1900, y: 120, s: 0.65 },
    ];
    for (const sp of spots) {
      const g = this.layer(sf);
      const w = 200 * sp.s;
      g.fillStyle(0x4b3a9a, 1);
      g.fillTriangle(sp.x - w / 2, sp.y, sp.x + w / 2, sp.y, sp.x + (r() - 0.5) * 30, sp.y + w * 0.9);
      g.fillStyle(0x6c58c8, 1);
      g.fillTriangle(sp.x - w / 2, sp.y, sp.x, sp.y, sp.x - w * 0.1, sp.y + w * 0.6);
      g.fillStyle(0x5ad07a, 1);
      g.fillRoundedRect(sp.x - w / 2 - 4, sp.y - 10, w + 8, 16, 7);
      g.fillStyle(0x8ff0a2, 1);
      g.fillRect(sp.x - w / 2 + 6, sp.y - 10, w - 12, 4);
      // tiny trees
      for (let i = 0; i < 3; i++) {
        const tx = sp.x - w / 3 + (i * w) / 3 + (r() - 0.5) * 10;
        g.fillStyle(0x2f9e5a, 1);
        g.fillCircle(tx, sp.y - 16 * sp.s - 8, 12 * sp.s + 4);
      }
      this.islands.push({ obj: g, baseY: g.y, phase: r() * Math.PI * 2 });
    }
  }

  private addCloudLayer(sf: number, alpha: number, n: number, r: () => number, color: number): void {
    for (let i = 0; i < n; i++) {
      const g = this.layer(sf);
      const cx = -600 + r() * 2600;
      const cy = -100 + r() * 420;
      const s = 0.6 + r() * 0.9;
      g.fillStyle(color, alpha);
      for (let k = 0; k < 5; k++) {
        g.fillEllipse(cx + (k - 2) * 38 * s, cy + Math.abs(k - 2) * 6 * s, 90 * s, 46 * s);
      }
      g.fillEllipse(cx, cy - 18 * s, 90 * s, 50 * s);
      this.clouds.push({ obj: g, speed: 4 + sf * 22, baseX: g.x });
    }
  }

  update(): void {
    this.t++;
    for (const c of this.clouds) {
      c.obj.x = c.baseX + ((this.t * c.speed) / 60) % 3200;
      if (c.obj.x - c.baseX > 1600) c.obj.x -= 3200;
    }
    for (const isl of this.islands) {
      isl.obj.y = isl.baseY + Math.sin(this.t * 0.02 + isl.phase) * 6;
    }
  }
}

/** Draws the stage's platforms and boundary markers in world space. */
export function drawStage(scene: Phaser.Scene, stage: StageDef): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const bz = stage.blastZone;

  // Faint blast-zone boundary so players can see where KOs happen.
  g.lineStyle(3, 0xffffff, 0.16);
  const dash = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.floor(len / 40);
    for (let i = 0; i < n; i += 2) {
      const a = i / n;
      const b = (i + 1) / n;
      g.lineBetween(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a, x1 + (x2 - x1) * b, y1 + (y2 - y1) * b);
    }
  };
  dash(bz.left, bz.top, bz.right, bz.top);
  dash(bz.left, bz.bottom, bz.right, bz.bottom);
  dash(bz.left, bz.top, bz.left, bz.bottom);
  dash(bz.right, bz.top, bz.right, bz.bottom);

  for (const p of stage.platforms) {
    const w = p.x2 - p.x1;
    if (!p.oneWay) {
      const cx = (p.x1 + p.x2) / 2;
      // Rocky underside
      g.fillStyle(0x3b2d85, 1);
      g.fillPoints([
        { x: p.x1, y: p.y + 30 }, { x: p.x2, y: p.y + 30 }, { x: p.x2 - 50, y: p.y + 110 },
        { x: cx + 140, y: p.y + 190 }, { x: cx + 40, y: p.y + 300 }, { x: cx - 60, y: p.y + 230 },
        { x: cx - 180, y: p.y + 170 }, { x: p.x1 + 40, y: p.y + 100 },
      ], true);
      g.fillStyle(0x51409f, 1);
      g.fillPoints([
        { x: p.x1, y: p.y + 30 }, { x: cx - 40, y: p.y + 30 }, { x: cx - 120, y: p.y + 160 },
        { x: cx - 180, y: p.y + 170 }, { x: p.x1 + 40, y: p.y + 100 },
      ], true);
      // Crystals
      const crystals = [[-260, 90, 0x7ef9ff], [120, 120, 0xff8ff0], [260, 70, 0xffe27a], [-60, 170, 0x7ef9ff]];
      for (const [dx, dy, col] of crystals) {
        g.fillStyle(col, 0.95);
        g.fillTriangle(cx + dx - 10, p.y + dy, cx + dx + 10, p.y + dy, cx + dx, p.y + dy + 34);
        g.fillStyle(0xffffff, 0.6);
        g.fillTriangle(cx + dx - 4, p.y + dy, cx + dx + 2, p.y + dy, cx + dx - 1, p.y + dy + 20);
      }
      // Stone band
      g.fillStyle(0x8a74e8, 1);
      g.fillRoundedRect(p.x1, p.y + 6, w, 34, 8);
      g.fillStyle(0x6f5bd0, 1);
      g.fillRect(p.x1 + 6, p.y + 26, w - 12, 10);
      for (let x = p.x1 + 30; x < p.x2 - 20; x += 70) {
        g.lineStyle(2, 0x5c49b8, 1);
        g.lineBetween(x, p.y + 12, x - 8, p.y + 36);
      }
      // Grass top
      g.fillStyle(0x3fbf5f, 1);
      g.fillRoundedRect(p.x1 - 6, p.y - 4, w + 12, 18, 8);
      g.fillStyle(0x7ff08f, 1);
      g.fillRoundedRect(p.x1 + 2, p.y - 4, w - 4, 6, 3);
      // Edge markers
      g.fillStyle(0xfff3b0, 1);
      g.fillCircle(p.x1 - 2, p.y + 4, 5);
      g.fillCircle(p.x2 + 2, p.y + 4, 5);
    } else {
      g.fillStyle(0xfff3b0, 0.12);
      g.fillTriangle(p.x1 + 10, p.y + 12, p.x2 - 10, p.y + 12, (p.x1 + p.x2) / 2, p.y + 120);
      g.fillStyle(0x2a2160, 0.95);
      g.fillRoundedRect(p.x1, p.y, w, 14, 6);
      g.fillStyle(0xfff3b0, 1);
      g.fillRoundedRect(p.x1 - 2, p.y - 3, w + 4, 6, 3);
      g.fillStyle(0x7ef9ff, 1);
      g.fillCircle(p.x1 + 8, p.y + 7, 3);
      g.fillCircle(p.x2 - 8, p.y + 7, 3);
    }
  }
  return g;
}
