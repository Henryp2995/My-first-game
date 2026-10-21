import Phaser from 'phaser';

interface Particle {
  kind: 'spark' | 'ring' | 'puff' | 'flash' | 'beam' | 'star' | 'confetti';
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  angle: number;
  gravity: number;
}

/** Lightweight particle/VFX system drawn with a single Graphics object. */
export class Effects {
  readonly g: Phaser.GameObjects.Graphics;
  private parts: Particle[] = [];

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics();
  }

  private add(p: Partial<Particle> & Pick<Particle, 'kind' | 'x' | 'y'>): void {
    this.parts.push({
      vx: 0, vy: 0, life: 20, maxLife: 20, size: 10, color: 0xffffff, angle: 0, gravity: 0, ...p,
    });
    if (this.parts.length > 600) this.parts.splice(0, this.parts.length - 600);
  }

  hit(x: number, y: number, strength: number, color: number): void {
    const s = Math.min(1, strength / 1800);
    this.add({ kind: 'flash', x, y, size: 26 + s * 50, life: 6, maxLife: 6, color: 0xffffff });
    this.add({ kind: 'ring', x, y, size: 10, life: 14 + s * 8, maxLife: 14 + s * 8, color });
    const n = 6 + Math.round(s * 12);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 250 + Math.random() * (400 + s * 700);
      this.add({
        kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 10 + Math.random() * 10, maxLife: 20, size: 3 + s * 3, color: i % 3 === 0 ? 0xffffff : 0xffe066,
      });
    }
    if (s > 0.55) {
      for (let i = 0; i < 4; i++) {
        this.add({ kind: 'star', x, y, vx: (Math.random() - 0.5) * 500, vy: -200 - Math.random() * 300, gravity: 900, life: 30, maxLife: 30, size: 9, color: 0xffd23f });
      }
    }
  }

  dust(x: number, y: number, amount = 4, dir = 0): void {
    for (let i = 0; i < amount; i++) {
      this.add({
        kind: 'puff', x: x + (Math.random() - 0.5) * 20, y: y - 4,
        vx: (Math.random() - 0.5) * 160 + dir * 80, vy: -30 - Math.random() * 60,
        life: 18 + Math.random() * 10, maxLife: 28, size: 6 + Math.random() * 6, color: 0xf1ecff,
      });
    }
  }

  trail(x: number, y: number, color: number, strong: boolean): void {
    this.add({
      kind: 'puff', x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10,
      life: strong ? 26 : 18, maxLife: strong ? 26 : 18, size: strong ? 14 : 9,
      color: strong ? color : 0xdddddd,
    });
  }

  smoke(x: number, y: number, amount = 10): void {
    for (let i = 0; i < amount; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 160;
      this.add({
        kind: 'puff', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        life: 24 + Math.random() * 12, maxLife: 36, size: 10 + Math.random() * 10, color: 0x9aa4d6,
      });
    }
  }

  burst(x: number, y: number, color: number): void {
    this.add({ kind: 'ring', x, y, size: 20, life: 16, maxLife: 16, color });
    this.add({ kind: 'flash', x, y, size: 50, life: 6, maxLife: 6, color: 0xffffff });
  }

  fire(x: number, y: number): void {
    this.add({
      kind: 'puff', x, y, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 60,
      life: 16, maxLife: 16, size: 10 + Math.random() * 6, color: Math.random() < 0.5 ? 0xff8a1f : 0xffd23f,
    });
  }

  ko(x: number, y: number, color: number, towardX: number, towardY: number): void {
    const angle = Math.atan2(towardY - y, towardX - x);
    this.add({ kind: 'beam', x, y, angle, size: 900, life: 50, maxLife: 50, color });
    this.add({ kind: 'beam', x, y, angle, size: 700, life: 40, maxLife: 40, color: 0xffffff });
    for (let i = 0; i < 40; i++) {
      const a = angle + (Math.random() - 0.5) * 1.4;
      const sp = 400 + Math.random() * 1300;
      this.add({
        kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 24 + Math.random() * 20, maxLife: 44, size: 4 + Math.random() * 4, color: i % 2 ? color : 0xffffff,
      });
    }
    this.add({ kind: 'ring', x, y, size: 40, life: 30, maxLife: 30, color: 0xffffff });
  }

  confetti(x: number, y: number, w: number, colors: number[]): void {
    for (let i = 0; i < 4; i++) {
      this.add({
        kind: 'confetti', x: x + Math.random() * w, y, vx: (Math.random() - 0.5) * 120, vy: 60 + Math.random() * 120,
        life: 260, maxLife: 260, size: 5 + Math.random() * 5, color: colors[Math.floor(Math.random() * colors.length)],
        angle: Math.random() * Math.PI, gravity: 30,
      });
    }
  }

  tick(): void {
    const dt = 1 / 60;
    for (const p of this.parts) {
      p.life--;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'spark') {
        p.vx *= 0.9;
        p.vy *= 0.9;
      } else if (p.kind === 'puff') {
        p.vx *= 0.94;
        p.vy *= 0.94;
      } else if (p.kind === 'confetti') {
        p.angle += 0.15;
        p.vx += Math.sin(p.life * 0.1) * 4;
      }
    }
    this.parts = this.parts.filter((p) => p.life > 0);
  }

  draw(): void {
    const g = this.g;
    g.clear();
    for (const p of this.parts) {
      const t = p.life / p.maxLife;
      switch (p.kind) {
        case 'spark': {
          const len = Math.hypot(p.vx, p.vy) * 0.03 + 2;
          const a = Math.atan2(p.vy, p.vx);
          g.lineStyle(p.size * t + 1, p.color, Math.min(1, t * 1.5));
          g.lineBetween(p.x, p.y, p.x - Math.cos(a) * len, p.y - Math.sin(a) * len);
          break;
        }
        case 'ring':
          g.lineStyle(6 * t + 1, p.color, t);
          g.strokeCircle(p.x, p.y, p.size + (1 - t) * 70);
          break;
        case 'flash':
          g.fillStyle(p.color, t * 0.9);
          g.fillCircle(p.x, p.y, p.size * (1.2 - t * 0.4));
          break;
        case 'puff':
          g.fillStyle(p.color, t * 0.7);
          g.fillCircle(p.x, p.y, p.size * (1.4 - t * 0.6));
          break;
        case 'star': {
          g.fillStyle(p.color, t);
          const r = p.size;
          const pts: Phaser.Types.Math.Vector2Like[] = [];
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + p.life * 0.2;
            const rr = i % 2 === 0 ? r : r * 0.4;
            pts.push({ x: p.x + Math.cos(a) * rr, y: p.y + Math.sin(a) * rr });
          }
          g.fillPoints(pts, true);
          break;
        }
        case 'beam': {
          const w = 60 + (1 - t) * 80;
          const ca = Math.cos(p.angle);
          const sa = Math.sin(p.angle);
          const ex = p.x + ca * p.size;
          const ey = p.y + sa * p.size;
          g.fillStyle(p.color, t * 0.85);
          g.fillTriangle(p.x - sa * w, p.y + ca * w, p.x + sa * w, p.y - ca * w, ex, ey);
          break;
        }
        case 'confetti': {
          g.fillStyle(p.color, Math.min(1, t * 3));
          const w = p.size * Math.abs(Math.cos(p.angle));
          g.fillRect(p.x - w / 2, p.y - p.size / 4, Math.max(1, w), p.size / 2);
          break;
        }
      }
    }
  }
}
