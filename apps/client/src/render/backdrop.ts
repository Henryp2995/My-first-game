import Phaser from 'phaser';
import type { StageDef, StageTheme } from '@arena-rush/shared';
import { GAME_HEIGHT, GAME_WIDTH } from '../theme';

/** Vertical sky gradients per stage theme (color stops top → bottom). */
export const SKY_GRADIENTS: Record<StageTheme, [number, string][]> = {
  skyfall: [[0, '#2b1f7a'], [0.35, '#6a4cf0'], [0.62, '#ff86c2'], [0.82, '#ffc98f'], [1, '#ffe9b8']],
  corneria: [[0, '#0f3a8c'], [0.4, '#2f7fe0'], [0.7, '#7cc4ff'], [0.9, '#cfeaff'], [1, '#eef8ff']],
  final: [[0, '#04020c'], [0.4, '#140a33'], [0.7, '#2c1259'], [0.88, '#4b1c6e'], [1, '#22103c']],
};

function ensureSkyTexture(scene: Phaser.Scene, theme: StageTheme): string {
  const key = `sky-${theme}`;
  if (scene.textures.exists(key)) return key;
  const w = 16;
  const h = 512;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return key;
  const ctx = tex.getContext();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  for (const [stop, color] of SKY_GRADIENTS[theme]) grad.addColorStop(stop, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  tex.refresh();
  return key;
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
 * Parallax background for a stage theme (sky gradient plus themed layers).
 * Layers are drawn in "screen space at the default camera scroll" (sx0, sy0); scroll factors make them parallax.
 */
export class Backdrop {
  readonly objects: Phaser.GameObjects.GameObject[] = [];
  private clouds: { obj: Phaser.GameObjects.Graphics; speed: number; baseX: number }[] = [];
  private islands: { obj: Phaser.GameObjects.Graphics; baseY: number; phase: number }[] = [];
  private ships: { obj: Phaser.GameObjects.Graphics; speed: number; baseX: number; span: number }[] = [];
  private pulses: { obj: Phaser.GameObjects.Graphics; phase: number }[] = [];
  private t = 0;

  constructor(private scene: Phaser.Scene, private sx0 = 0, private sy0 = 0, theme: StageTheme = 'skyfall') {
    const sky = scene.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, ensureSkyTexture(scene, theme))
      .setDisplaySize(GAME_WIDTH * 2.2, GAME_HEIGHT * 2.3)
      .setScrollFactor(0);
    this.objects.push(sky);
    if (theme === 'corneria') this.buildCorneria();
    else if (theme === 'final') this.buildFinal();
    else this.buildSkyfall();
  }

  private buildSkyfall(): void {
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

  /** Futuristic city skyline under a bright sky, with ships flying past. */
  private buildCorneria(): void {
    const r = rand(11);
    this.addCloudLayer(0.06, 0.6, 5, r, 0xffffff);
    const skyline = (sf: number, baseY: number, color: number, windowColor: number, minH: number, maxH: number) => {
      const g = this.layer(sf);
      let x = -1600;
      while (x < 3000) {
        const w = 40 + r() * 90;
        const h = minH + r() * (maxH - minH);
        g.fillStyle(color, 1);
        g.fillRect(x, baseY - h, w, h + 900);
        if (r() < 0.35) {
          // spire
          g.fillTriangle(x + w * 0.3, baseY - h, x + w * 0.7, baseY - h, x + w * 0.5, baseY - h - 40 - r() * 60);
        }
        g.fillStyle(windowColor, 0.55);
        for (let wy = baseY - h + 12; wy < baseY; wy += 18) {
          for (let wx = x + 8; wx < x + w - 8; wx += 14) if (r() < 0.6) g.fillRect(wx, wy, 6, 8);
        }
        x += w + 6 + r() * 30;
      }
    };
    skyline(0.1, 560, 0x6f9fd8, 0xdff4ff, 120, 260);
    skyline(0.2, 640, 0x3f6fae, 0xffe9a0, 80, 220);
    // Ships cruising across the sky (visual only — no hazards).
    for (let i = 0; i < 4; i++) {
      const g = this.layer(0.3);
      const y = 80 + r() * 220;
      const x = -400 + r() * 2000;
      const s = 0.6 + r() * 0.6;
      g.fillStyle(0xe8eef8, 1);
      g.fillTriangle(x, y, x - 46 * s, y - 10 * s, x - 46 * s, y + 10 * s);
      g.fillStyle(0x2f7fe0, 1);
      g.fillTriangle(x - 20 * s, y, x - 52 * s, y - 26 * s, x - 40 * s, y);
      g.fillTriangle(x - 20 * s, y, x - 52 * s, y + 26 * s, x - 40 * s, y);
      g.fillStyle(0xffb347, 0.9);
      g.fillCircle(x - 48 * s, y, 4 * s);
      this.ships.push({ obj: g, speed: 140 + r() * 120, baseX: g.x, span: 3600 });
    }
    this.addCloudLayer(0.45, 0.8, 3, r, 0xffffff);
  }

  /** Deep space: stars, nebulae, a ringed planet and slow light ribbons. */
  private buildFinal(): void {
    const r = rand(23);
    const stars = this.layer(0.02);
    for (let i = 0; i < 260; i++) {
      stars.fillStyle(0xffffff, 0.2 + r() * 0.8);
      stars.fillCircle(-900 + r() * 3100, -700 + r() * 1700, r() < 0.1 ? 2 : 1);
    }
    const neb = this.layer(0.05);
    for (const [x, y, rad, col] of [[200, 200, 320, 0x6a2bd8], [1050, 120, 280, 0x2b6bd8], [700, 520, 360, 0xd82b9a], [-200, 480, 300, 0x2bd8c8]] as const) {
      for (let k = 0; k < 6; k++) {
        neb.fillStyle(col, 0.05);
        neb.fillCircle(x + (r() - 0.5) * 120, y + (r() - 0.5) * 120, rad * (0.5 + r() * 0.6));
      }
    }
    const planet = this.layer(0.08);
    planet.fillStyle(0x3b1d7a, 1);
    planet.fillCircle(1000, 250, 110);
    planet.fillStyle(0x5a33b0, 1);
    planet.fillCircle(970, 225, 90);
    planet.lineStyle(10, 0xb48cff, 0.6);
    planet.strokeEllipse(1000, 250, 360, 70);
    // Slow light ribbons that pulse.
    for (let i = 0; i < 3; i++) {
      const g = this.layer(0.12);
      const y0 = 420 + i * 70;
      g.lineStyle(26 - i * 6, [0x7ef9ff, 0xb48cff, 0xff8fe0][i], 0.12);
      g.beginPath();
      g.moveTo(-1000, y0);
      for (let x = -1000; x <= 3000; x += 80) g.lineTo(x, y0 + Math.sin(x * 0.004 + i) * 60);
      g.strokePath();
      this.pulses.push({ obj: g, phase: i * 2 });
    }
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
    for (const sh of this.ships) {
      const off = ((this.t * sh.speed) / 60) % sh.span;
      sh.obj.x = sh.baseX + off - sh.span / 2;
    }
    for (const p of this.pulses) p.obj.setAlpha(0.6 + Math.sin(this.t * 0.02 + p.phase) * 0.4);
  }
}

/** Draws a stage's platforms (and optionally its blast-zone markers) in world space. */
export function drawStage(scene: Phaser.Scene, stage: StageDef, options: { blastLines?: boolean } = {}): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  if (options.blastLines !== false) drawBlastLines(g, stage);
  if (stage.theme === 'corneria') drawCorneria(g, stage);
  else if (stage.theme === 'final') drawFinalDestination(g, stage);
  else drawSkyfall(g, stage);
  return g;
}

function drawBlastLines(g: Phaser.GameObjects.Graphics, stage: StageDef): void {
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
}

function drawSkyfall(g: Phaser.GameObjects.Graphics, stage: StageDef): void {
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
}

function softPlatform(g: Phaser.GameObjects.Graphics, x1: number, x2: number, y: number, top: number, body: number, glow: number): void {
  g.fillStyle(glow, 0.12);
  g.fillTriangle(x1 + 10, y + 12, x2 - 10, y + 12, (x1 + x2) / 2, y + 110);
  g.fillStyle(body, 0.95);
  g.fillRoundedRect(x1, y, x2 - x1, 14, 6);
  g.fillStyle(top, 1);
  g.fillRoundedRect(x1 - 2, y - 3, x2 - x1 + 4, 6, 3);
}

/** A long starship. The hull is decoration; the deck tops line up exactly with the collision platforms. */
function drawCorneria(g: Phaser.GameObjects.Graphics, stage: StageDef): void {
  const P = Object.fromEntries(stage.platforms.map((p) => [p.id, p]));
  const nose = P.nose;
  const deck = P.deck;
  const rear = P.rear;
  // Wing (behind the hull)
  g.fillStyle(0x3e4c66, 1);
  g.fillPoints([{ x: -260, y: 70 }, { x: 380, y: 70 }, { x: 640, y: 210 }, { x: 140, y: 175 }], true);
  g.fillStyle(0x2f7fe0, 1);
  g.fillPoints([{ x: 560, y: 168 }, { x: 640, y: 210 }, { x: 590, y: 212 }], true);
  // Tail fin rising behind the rear deck
  const fin = P.fin;
  g.fillStyle(0x4a5a7a, 1);
  g.fillPoints([{ x: rear.x1 + 30, y: rear.y }, { x: fin.x1 + 10, y: fin.y + 8 }, { x: fin.x2, y: fin.y + 8 }, { x: rear.x2, y: rear.y }], true);
  g.fillStyle(0x2f7fe0, 1);
  g.fillPoints([{ x: fin.x1 + 30, y: fin.y + 40 }, { x: fin.x2 - 10, y: fin.y + 40 }, { x: fin.x2 + 10, y: rear.y - 40 }, { x: fin.x1 + 50, y: rear.y - 40 }], true);
  // Hull body
  const hull = [
    { x: nose.x1 - 90, y: nose.y + 30 }, { x: nose.x1, y: nose.y }, { x: nose.x2, y: nose.y }, { x: deck.x1, y: deck.y },
    { x: deck.x2, y: deck.y }, { x: rear.x1, y: rear.y }, { x: rear.x2, y: rear.y }, { x: rear.x2 + 50, y: rear.y + 30 },
    { x: rear.x2 + 70, y: 90 }, { x: rear.x2 + 10, y: 160 }, { x: -200, y: 200 }, { x: -600, y: 160 }, { x: nose.x1 - 70, y: 100 },
  ];
  g.fillStyle(0x7d8ba3, 1);
  g.fillPoints(hull, true);
  g.fillStyle(0x56627a, 1);
  g.fillPoints([{ x: nose.x1 - 70, y: 100 }, { x: rear.x2 + 70, y: 90 }, { x: rear.x2 + 10, y: 160 }, { x: -200, y: 200 }, { x: -600, y: 160 }], true);
  // Panel seams and windows
  g.lineStyle(2, 0x5f6b82, 1);
  for (let x = -520; x < 460; x += 90) g.lineBetween(x, 20, x - 20, 150);
  g.fillStyle(0x9ae8ff, 0.9);
  for (let x = -480; x < 420; x += 34) g.fillRect(x, 54, 16, 8);
  // Engines
  for (const [ey, er] of [[10, 22], [62, 26], [112, 20]] as const) {
    g.fillStyle(0x2a3244, 1);
    g.fillCircle(rear.x2 + 62, ey, er + 6);
    g.fillStyle(0x6fd8ff, 0.5);
    g.fillCircle(rear.x2 + 66, ey, er + 2);
    g.fillStyle(0xe8fbff, 1);
    g.fillCircle(rear.x2 + 66, ey, er * 0.55);
  }
  // Deck surfaces (exactly on the collision tops) with hazard-striped step edges
  for (const p of [nose, deck, rear]) {
    g.fillStyle(0xc9d3e3, 1);
    g.fillRect(p.x1, p.y - 2, p.x2 - p.x1, 8);
    g.fillStyle(0xe8eef8, 1);
    g.fillRect(p.x1 + 4, p.y - 2, p.x2 - p.x1 - 8, 3);
    for (const ex of [p.x1, p.x2 - 18]) {
      for (let k = 0; k < 3; k++) {
        g.fillStyle(k % 2 ? 0x1a1a1a : 0xffc93c, 1);
        g.fillRect(ex + k * 6, p.y + 6, 6, 6);
      }
    }
  }
  // Sensor mast holding the floating cockpit platform
  const cp = P.cockpit;
  g.lineStyle(6, 0x56627a, 1);
  g.lineBetween((cp.x1 + cp.x2) / 2 - 40, cp.y + 10, (cp.x1 + cp.x2) / 2 - 60, deck.y);
  g.lineBetween((cp.x1 + cp.x2) / 2 + 40, cp.y + 10, (cp.x1 + cp.x2) / 2 + 60, deck.y);
  softPlatform(g, cp.x1, cp.x2, cp.y, 0x9ae8ff, 0x3e4c66, 0x9ae8ff);
  softPlatform(g, fin.x1, fin.x2, fin.y, 0xffc93c, 0x3e4c66, 0xffc93c);
}

/** One wide, symmetrical floating slab with glowing edges. */
function drawFinalDestination(g: Phaser.GameObjects.Graphics, stage: StageDef): void {
  const p = stage.platforms[0];
  const cx = (p.x1 + p.x2) / 2;
  const w = p.x2 - p.x1;
  // Underside: stepped, tapering bands down to a glowing core.
  const bands = [
    { inset: 0, y0: p.y + 26, y1: p.y + 60, color: 0x221a44 },
    { inset: 70, y0: p.y + 60, y1: p.y + 110, color: 0x1b1438 },
    { inset: 170, y0: p.y + 110, y1: p.y + 170, color: 0x150f2e },
    { inset: 300, y0: p.y + 170, y1: p.y + 230, color: 0x100b24 },
  ];
  for (const b of bands) {
    g.fillStyle(b.color, 1);
    g.fillPoints([
      { x: p.x1 + b.inset, y: b.y0 }, { x: p.x2 - b.inset, y: b.y0 },
      { x: p.x2 - b.inset - 40, y: b.y1 }, { x: p.x1 + b.inset + 40, y: b.y1 },
    ], true);
    g.lineStyle(2, 0x7ef9ff, 0.35);
    g.lineBetween(p.x1 + b.inset + 40, b.y1, p.x2 - b.inset - 40, b.y1);
  }
  // Circuit lines
  g.lineStyle(2, 0xb48cff, 0.5);
  for (let i = -4; i <= 4; i++) {
    const x = cx + i * 90;
    g.lineBetween(x, p.y + 30, cx + i * 40, p.y + 160);
  }
  g.fillStyle(0x7ef9ff, 0.25);
  g.fillCircle(cx, p.y + 200, 46);
  g.fillStyle(0xe8fbff, 0.9);
  g.fillCircle(cx, p.y + 200, 16);
  // Top slab
  g.fillStyle(0x2c2456, 1);
  g.fillRect(p.x1, p.y, w, 26);
  g.fillStyle(0x3a2f70, 1);
  g.fillRect(p.x1, p.y, w, 8);
  g.lineStyle(3, 0x7ef9ff, 1);
  g.lineBetween(p.x1, p.y, p.x2, p.y);
  g.lineStyle(8, 0x7ef9ff, 0.2);
  g.lineBetween(p.x1, p.y + 2, p.x2, p.y + 2);
  g.fillStyle(0x7ef9ff, 1);
  g.fillCircle(p.x1, p.y + 4, 5);
  g.fillCircle(p.x2, p.y + 4, 5);
}

/**
 * Small, self-contained preview of a stage for the stage-select cards: sky gradient,
 * a few theme details, and the real platform art scaled to fit the box.
 */
export function drawStagePreview(scene: Phaser.Scene, stage: StageDef, cx: number, cy: number, w: number, h: number): Phaser.GameObjects.GameObject[] {
  const bg = scene.add.graphics();
  const stops = SKY_GRADIENTS[stage.theme];
  const n = 24;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let k = 1;
    while (k < stops.length - 1 && stops[k][0] < t) k++;
    const [t0, c0] = stops[k - 1];
    const [t1, c1] = stops[k];
    const u = Math.max(0, Math.min(1, (t - t0) / (t1 - t0 || 1)));
    const a = Phaser.Display.Color.HexStringToColor(c0);
    const b = Phaser.Display.Color.HexStringToColor(c1);
    const col = Phaser.Display.Color.Interpolate.ColorWithColor(a, b, 100, Math.round(u * 100));
    bg.fillStyle(Phaser.Display.Color.GetColor(col.r, col.g, col.b), 1);
    bg.fillRect(cx - w / 2, cy - h / 2 + (i * h) / n, w, h / n + 1);
  }
  const r = rand(stage.id.length * 97);
  if (stage.theme === 'final') {
    for (let i = 0; i < 70; i++) {
      bg.fillStyle(0xffffff, 0.3 + r() * 0.7);
      bg.fillCircle(cx - w / 2 + r() * w, cy - h / 2 + r() * h, r() < 0.15 ? 1.6 : 0.9);
    }
    bg.fillStyle(0x6a2bd8, 0.18);
    bg.fillCircle(cx - w * 0.25, cy - h * 0.15, h * 0.35);
    bg.fillStyle(0x2bd8c8, 0.12);
    bg.fillCircle(cx + w * 0.3, cy + h * 0.1, h * 0.3);
  } else if (stage.theme === 'corneria') {
    let x = cx - w / 2;
    while (x < cx + w / 2 - 10) {
      const bw = 10 + r() * 22;
      const bh = h * (0.15 + r() * 0.3);
      bg.fillStyle(0x4f80c0, 1);
      bg.fillRect(x, cy + h / 2 - bh, bw, bh);
      x += bw + 2;
    }
  } else {
    bg.fillStyle(0x9a7be0, 1);
    for (let i = 0; i < 6; i++) {
      const mx = cx - w / 2 + (i + 0.5) * (w / 6);
      bg.fillTriangle(mx - w / 8, cy + h / 2, mx + w / 8, cy + h / 2, mx, cy + h / 2 - h * (0.25 + r() * 0.2));
    }
  }
  // Platforms: the real stage art, scaled to fit.
  const art = drawStage(scene, stage, { blastLines: false });
  let x1 = Infinity;
  let x2 = -Infinity;
  for (const p of stage.platforms) {
    x1 = Math.min(x1, p.x1);
    x2 = Math.max(x2, p.x2);
  }
  const spanX = x2 - x1 + 260;
  const scale = Math.min((w * 0.95) / spanX, (h * 0.9) / 520);
  const midX = (x1 + x2) / 2;
  art.setScale(scale).setPosition(cx - midX * scale, cy + h * 0.06 - (-110) * scale);
  // Clip to the card's preview box.
  const maskShape = scene.make.graphics({}, false);
  maskShape.fillStyle(0xffffff, 1);
  maskShape.fillRect(cx - w / 2, cy - h / 2, w, h);
  const mask = maskShape.createGeometryMask();
  bg.setMask(mask);
  art.setMask(mask);
  return [bg, art];
}
