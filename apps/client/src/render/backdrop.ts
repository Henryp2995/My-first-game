import Phaser from 'phaser';
import type { StageDef, StageTheme } from '@arena-rush/shared';
import { GAME_HEIGHT, GAME_WIDTH } from '../theme';

/** Vertical sky gradients per stage theme (color stops top → bottom). */
export const SKY_GRADIENTS: Record<StageTheme, [number, string][]> = {
  skyfall: [[0, '#2b1f7a'], [0.35, '#6a4cf0'], [0.62, '#ff86c2'], [0.82, '#ffc98f'], [1, '#ffe9b8']],
  corneria: [[0, '#000c24'], [0.32, '#06305f'], [0.5, '#164379'], [0.68, '#4288b0'], [0.85, '#9cc4dc'], [1, '#dbe9f3']],
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

/** Painted stage art cropped from concept boards (tools/stages/crop-backdrop.mjs). Loaded at boot if present. */
export const STAGE_ART: Partial<Record<StageTheme, { key: string; url: string }>> = {
  corneria: { key: 'stage-corneria-backdrop', url: 'assets/stages/corneria/backdrop.png' },
};

export function preloadStageArt(scene: Phaser.Scene): void {
  for (const art of Object.values(STAGE_ART)) {
    if (art && !scene.textures.exists(art.key)) scene.load.image(art.key, art.url);
  }
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
  /** Painted bands pinned to the top of the screen regardless of camera zoom. */
  private screenLocked: { obj: Phaser.GameObjects.Image; base: number }[] = [];
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

  /**
   * Corneria (from the stage concept board): the board's painted band — planet, fighters, carrier
   * tower — pinned across the top of the screen, over a deep-space gradient, a cloud bank, a
   * distant fleet and fighter fly-bys drawn in the same palette.
   */
  private buildCorneria(): void {
    const r = rand(11);
    const stars = this.layer(0.02);
    for (let i = 0; i < 160; i++) {
      stars.fillStyle(0xffffff, 0.3 + r() * 0.7);
      stars.fillCircle(-900 + r() * 3100, -700 + r() * 900, r() < 0.12 ? 1.8 : 1);
    }
    const art = STAGE_ART.corneria;
    if (art && this.scene.textures.exists(art.key)) {
      const img = this.scene.add.image(GAME_WIDTH / 2, 0, art.key).setOrigin(0.5, 0).setScrollFactor(0);
      const base = (GAME_WIDTH * 1.04) / img.width;
      img.setScale(base);
      this.objects.push(img);
      this.screenLocked.push({ obj: img, base });
    }
    // Distant capital ships hanging in the haze.
    const fleet = this.layer(0.1);
    for (let i = 0; i < 7; i++) {
      const x = -900 + i * 520 + r() * 200;
      const y = 300 + r() * 50;
      const L = 140 + r() * 160;
      fleet.fillStyle(0x3e5a86, 0.85);
      fleet.fillPoints([{ x, y }, { x: x + L, y: y - 6 }, { x: x + L + 30, y: y + 4 }, { x: x + L, y: y + 16 }, { x: x + 10, y: y + 14 }], true);
      fleet.fillRect(x + L * 0.55, y - 22, 18, 22);
      fleet.fillRect(x + L * 0.6, y - 34, 6, 14);
      fleet.fillStyle(0x54effc, 0.8);
      for (let k = 0; k < 5; k++) fleet.fillRect(x + 20 + k * (L / 6), y + 5, 6, 2);
    }
    // Cloud sea beneath the fortress: lit cloud tops that darken with depth (board palette).
    const bank = (sf: number, baseY: number, top: number, deep: number) => {
      const g = this.layer(sf);
      // Depth gradient under the cloud tops.
      const bands = 56;
      for (let i = 0; i < bands; i++) {
        const t = i / (bands - 1);
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(
          Phaser.Display.Color.ValueToColor(top), Phaser.Display.Color.ValueToColor(deep), 100, Math.round(t * 100));
        g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1);
        g.fillRect(-1600, baseY + 10 + i * 10, 4800, 11);
      }
      g.fillStyle(deep, 1);
      g.fillRect(-1600, baseY + 10 + bands * 10, 4800, 900);
      // Billowing tops with a lit upper edge and soft shadowed undersides.
      for (let x = -1600; x < 3200; x += 60 + r() * 60) {
        const k = 0.7 + r() * 0.9;
        const y = baseY + r() * 24;
        g.fillStyle(deep, 0.35);
        g.fillEllipse(x + 10 * k, y + 18 * k, 190 * k, 60 * k);
        g.fillStyle(top, 1);
        g.fillEllipse(x, y, 180 * k, 70 * k);
        g.fillEllipse(x + 40 * k, y - 22 * k, 120 * k, 60 * k);
        g.fillStyle(0xffffff, 0.55);
        g.fillEllipse(x + 30 * k, y - 34 * k, 70 * k, 22 * k);
      }
    };
    bank(0.14, 400, 0xc7dbee, 0x5d86b4);
    bank(0.24, 480, 0xe9f1f9, 0x7aa0c8);
    // Fighters streaking past (visual only — no hazards).
    for (let i = 0; i < 4; i++) {
      const g = this.layer(0.32);
      const y = 120 + r() * 200;
      const x = -400 + r() * 2000;
      const s = 0.6 + r() * 0.6;
      g.fillStyle(0x54a8ff, 0.35);
      g.fillTriangle(x - 40 * s, y - 4 * s, x - 40 * s, y + 4 * s, x - 150 * s, y);
      g.fillStyle(0xeef2f8, 1);
      g.fillTriangle(x + 26 * s, y, x - 30 * s, y - 7 * s, x - 30 * s, y + 7 * s);
      g.fillStyle(0xc9d2e0, 1);
      g.fillTriangle(x - 4 * s, y, x - 34 * s, y - 26 * s, x - 22 * s, y);
      g.fillTriangle(x - 4 * s, y, x - 34 * s, y + 26 * s, x - 22 * s, y);
      g.fillStyle(0x2c56b8, 1);
      g.fillTriangle(x - 26 * s, y - 20 * s, x - 34 * s, y - 26 * s, x - 22 * s, y - 8 * s);
      g.fillStyle(0xbff4ff, 1);
      g.fillCircle(x - 32 * s, y, 3.5 * s);
      this.ships.push({ obj: g, speed: 160 + r() * 140, baseX: g.x, span: 3600 });
    }
  }

  /** Keep screen-pinned painted bands filling the top of the screen at any camera zoom. */
  setZoom(zoom: number): void {
    for (const { obj, base } of this.screenLocked) {
      obj.setScale(base / zoom);
      obj.y = GAME_HEIGHT / 2 - GAME_HEIGHT / 2 / zoom;
    }
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

/**
 * The Corneria carrier, styled after the stage concept board: white armor plating with panel
 * lines, red accent stripes, cyan running lights and blue engines. The deck tops line up exactly
 * with the collision platforms (the layout is unchanged).
 */
function drawCorneria(g: Phaser.GameObjects.Graphics, stage: StageDef): void {
  const P = Object.fromEntries(stage.platforms.map((p) => [p.id, p]));
  const nose = P.nose;
  const deck = P.deck;
  const rear = P.rear;
  const fin = P.fin;
  const cp = P.cockpit;
  const ARMOR = 0xdfe4ec;
  const ARMOR_MID = 0xb9c1ce;
  const ARMOR_DARK = 0x7f899c;
  const UNDER = 0x4a5268;
  const LINE = 0x9aa3b4;
  const RED = 0xd23a3a;
  const CYAN = 0x54effc;
  const lights = (x1: number, x2: number, y: number, w = 22, gap = 40) => {
    for (let x = x1; x < x2 - w; x += gap) {
      g.fillStyle(CYAN, 0.25);
      g.fillRect(x - 3, y - 3, w + 6, 10);
      g.fillStyle(CYAN, 1);
      g.fillRect(x, y, w, 4);
    }
  };

  // Swept wing behind the hull
  g.fillStyle(ARMOR_DARK, 1);
  g.fillPoints([{ x: -260, y: 70 }, { x: 380, y: 70 }, { x: 660, y: 215 }, { x: 140, y: 180 }], true);
  g.fillStyle(ARMOR_MID, 1);
  g.fillPoints([{ x: -200, y: 70 }, { x: 360, y: 70 }, { x: 560, y: 160 }, { x: 120, y: 140 }], true);
  g.fillStyle(RED, 1);
  g.fillPoints([{ x: 520, y: 140 }, { x: 660, y: 215 }, { x: 610, y: 215 }, { x: 490, y: 150 }], true);

  // Tail fin rising behind the rear deck: white with a red leading edge and emblem.
  g.fillStyle(ARMOR_DARK, 1);
  g.fillPoints([{ x: rear.x1 + 26, y: rear.y }, { x: fin.x1 + 8, y: fin.y + 10 }, { x: fin.x2 + 4, y: fin.y + 10 }, { x: rear.x2 + 4, y: rear.y }], true);
  g.fillStyle(ARMOR, 1);
  g.fillPoints([{ x: rear.x1 + 34, y: rear.y }, { x: fin.x1 + 14, y: fin.y + 14 }, { x: fin.x2 - 2, y: fin.y + 14 }, { x: rear.x2 - 4, y: rear.y }], true);
  g.fillStyle(RED, 1);
  g.fillPoints([{ x: rear.x1 + 34, y: rear.y }, { x: fin.x1 + 14, y: fin.y + 14 }, { x: fin.x1 + 34, y: fin.y + 14 }, { x: rear.x1 + 58, y: rear.y }], true);
  const ex = (fin.x1 + fin.x2) / 2 + 12;
  const ey = (fin.y + rear.y) / 2;
  g.fillStyle(RED, 1);
  g.fillTriangle(ex - 30, ey + 16, ex + 26, ey - 22, ex + 4, ey + 2);
  g.fillTriangle(ex - 10, ey + 22, ex + 34, ey - 6, ex + 8, ey + 10);
  g.lineStyle(2, LINE, 1);
  g.lineBetween(fin.x1 + 30, fin.y + 60, fin.x2 - 6, fin.y + 60);

  // Hull body
  const hull = [
    { x: nose.x1 - 90, y: nose.y + 30 }, { x: nose.x1, y: nose.y }, { x: nose.x2, y: nose.y }, { x: deck.x1, y: deck.y },
    { x: deck.x2, y: deck.y }, { x: rear.x1, y: rear.y }, { x: rear.x2, y: rear.y }, { x: rear.x2 + 50, y: rear.y + 30 },
    { x: rear.x2 + 70, y: 90 }, { x: rear.x2 + 10, y: 160 }, { x: -200, y: 200 }, { x: -600, y: 160 }, { x: nose.x1 - 70, y: 100 },
  ];
  g.fillStyle(ARMOR_MID, 1);
  g.fillPoints(hull, true);
  // Upper armor band, lower hull and dark underside
  g.fillStyle(ARMOR, 1);
  g.fillPoints([{ x: nose.x1 - 90, y: nose.y + 30 }, { x: nose.x1, y: nose.y }, { x: nose.x2, y: nose.y }, { x: deck.x1, y: deck.y },
    { x: deck.x2, y: deck.y }, { x: rear.x1, y: rear.y }, { x: rear.x2, y: rear.y }, { x: rear.x2 + 50, y: rear.y + 30 },
    { x: rear.x2 + 56, y: 48 }, { x: -600, y: 52 }, { x: nose.x1 - 78, y: 70 }], true);
  g.fillStyle(UNDER, 1);
  g.fillPoints([{ x: nose.x1 - 70, y: 100 }, { x: rear.x2 + 70, y: 90 }, { x: rear.x2 + 10, y: 160 }, { x: -200, y: 200 }, { x: -600, y: 160 }], true);
  g.fillStyle(0x363d52, 1);
  g.fillPoints([{ x: -560, y: 150 }, { x: rear.x2 - 20, y: 135 }, { x: rear.x2 + 10, y: 160 }, { x: -200, y: 200 }], true);
  // Armor plate seams
  g.lineStyle(2, LINE, 1);
  for (let x = -520; x < 470; x += 85) g.lineBetween(x, 8, x - 12, 50);
  for (let x = -540; x < 460; x += 120) g.lineBetween(x, 58, x - 18, 98);
  g.lineBetween(-600, 52, rear.x2 + 56, 48);
  // Red accent stripes (bow and stern)
  g.fillStyle(RED, 1);
  g.fillPoints([{ x: nose.x1 - 84, y: nose.y + 34 }, { x: nose.x1 + 40, y: nose.y + 34 }, { x: nose.x1 + 20, y: nose.y + 46 }, { x: nose.x1 - 74, y: nose.y + 50 }], true);
  g.fillPoints([{ x: rear.x1 + 40, y: 56 }, { x: rear.x2 + 54, y: 52 }, { x: rear.x2 + 56, y: 62 }, { x: rear.x1 + 30, y: 66 }], true);
  // Cyan running lights
  lights(-520, 230, 76, 26, 62);
  lights(nose.x1 - 40, nose.x2 - 10, nose.y + 62, 16, 34);
  lights(rear.x1 + 20, rear.x2 + 20, 76, 20, 46);
  // Engines
  for (const [ey2, er] of [[12, 22], [64, 26], [114, 20]] as const) {
    g.fillStyle(0x2a3244, 1);
    g.fillCircle(rear.x2 + 62, ey2, er + 6);
    g.fillStyle(0x3f8cff, 0.45);
    g.fillCircle(rear.x2 + 68, ey2, er + 10);
    g.fillStyle(0x9ae8ff, 0.9);
    g.fillCircle(rear.x2 + 66, ey2, er * 0.75);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(rear.x2 + 66, ey2, er * 0.4);
  }
  // Deck surfaces (exactly on the collision tops): raised armor plates with lit step edges.
  for (const p of [nose, deck, rear]) {
    g.fillStyle(ARMOR_DARK, 1);
    g.fillRect(p.x1, p.y + 6, p.x2 - p.x1, 6);
    g.fillStyle(0xf4f6fa, 1);
    g.fillRect(p.x1, p.y - 2, p.x2 - p.x1, 8);
    g.lineStyle(1.5, LINE, 1);
    for (let x = p.x1 + 60; x < p.x2 - 20; x += 60) g.lineBetween(x, p.y - 2, x, p.y + 6);
    for (const exx of [p.x1, p.x2 - 18]) {
      for (let k = 0; k < 3; k++) {
        g.fillStyle(k % 2 ? 0x1a1a1a : 0xffc93c, 1);
        g.fillRect(exx + k * 6, p.y + 6, 6, 6);
      }
    }
  }
  // Sensor mast and the two hover platforms (gray slabs with cyan underglow, like the board's).
  g.lineStyle(6, ARMOR_DARK, 1);
  g.lineBetween((cp.x1 + cp.x2) / 2 - 40, cp.y + 12, (cp.x1 + cp.x2) / 2 - 60, deck.y);
  g.lineBetween((cp.x1 + cp.x2) / 2 + 40, cp.y + 12, (cp.x1 + cp.x2) / 2 + 60, deck.y);
  for (const p of [cp, fin]) {
    g.fillStyle(CYAN, 0.12);
    g.fillTriangle(p.x1 + 10, p.y + 14, p.x2 - 10, p.y + 14, (p.x1 + p.x2) / 2, p.y + 110);
    g.fillStyle(0x5d6578, 1);
    g.fillRoundedRect(p.x1, p.y + 2, p.x2 - p.x1, 14, 5);
    g.fillStyle(0xeef1f6, 1);
    g.fillRoundedRect(p.x1 - 3, p.y - 3, p.x2 - p.x1 + 6, 7, 3);
    g.fillStyle(CYAN, 1);
    g.fillRect(p.x1 + 12, p.y + 12, p.x2 - p.x1 - 24, 3);
  }
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
    bg.fillStyle(0xf2f6fb, 0.95);
    bg.fillRect(cx - w / 2, cy + h * 0.2, w, h * 0.3);
    for (let x = cx - w / 2; x < cx + w / 2; x += 26) bg.fillEllipse(x, cy + h * 0.2, 46, 20);
  } else {
    bg.fillStyle(0x9a7be0, 1);
    for (let i = 0; i < 6; i++) {
      const mx = cx - w / 2 + (i + 0.5) * (w / 6);
      bg.fillTriangle(mx - w / 8, cy + h / 2, mx + w / 8, cy + h / 2, mx, cy + h / 2 - h * (0.25 + r() * 0.2));
    }
  }
  // Painted concept-board band across the top, when this stage has one.
  const painted = STAGE_ART[stage.theme];
  let band: Phaser.GameObjects.Image | null = null;
  if (painted && scene.textures.exists(painted.key)) {
    band = scene.add.image(cx, cy - h / 2, painted.key).setOrigin(0.5, 0);
    band.setScale(w / band.width);
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
  band?.setMask(mask);
  art.setMask(mask);
  return band ? [bg, band, art] : [bg, art];
}
