import Phaser from 'phaser';
import { sound } from '../audio/sound';
import { FONT_BODY, FONT_DISPLAY, GAME_HEIGHT, GAME_WIDTH, UI } from '../theme';

export function displayText(
  scene: Phaser.Scene, x: number, y: number, text: string, size: number, color = '#ffffff', stroke = UI.inkCss, strokeW = 8,
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, {
    fontFamily: FONT_DISPLAY,
    fontSize: `${size}px`,
    color,
    stroke,
    strokeThickness: strokeW,
  }).setOrigin(0.5);
}

export function bodyText(
  scene: Phaser.Scene, x: number, y: number, text: string, size: number, color = '#ffffff', weight = '700',
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, {
    fontFamily: FONT_BODY,
    fontSize: `${size}px`,
    fontStyle: weight,
    color,
  }).setOrigin(0.5);
}

export function panel(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number, fill = UI.panel, border = 0xffffff, alpha = 0.92, radius = 18,
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.25);
  g.fillRoundedRect(x - w / 2 + 6, y - h / 2 + 8, w, h, radius);
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(x - w / 2, y - h / 2, w, h, radius);
  g.lineStyle(3, border, 0.9);
  g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, radius);
  return g;
}

export interface MenuItem {
  label: () => string;
  action: () => void;
  enabled?: () => boolean;
  hint?: string;
}

/** Vertical arcade-style menu driven by keyboard (W/S, arrows, Enter/F/J) and mouse. */
export class Menu {
  private index = 0;
  private rows: { bg: Phaser.GameObjects.Graphics; text: Phaser.GameObjects.Text; hint?: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone }[] = [];
  active = true;

  constructor(
    private scene: Phaser.Scene,
    private x: number,
    private y: number,
    private items: MenuItem[],
    private width = 380,
    private spacing = 78,
  ) {
    items.forEach((item, i) => {
      const cy = y + i * spacing;
      const bg = scene.add.graphics();
      const text = displayText(scene, x, cy - (item.hint ? 7 : 0), item.label(), 28, '#ffffff', UI.inkCss, 6);
      const hint = item.hint ? bodyText(scene, x, cy + 20, item.hint, 13, UI.muted, '500') : undefined;
      const zone = scene.add.zone(x, cy, width, spacing - 12).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => {
        if (!this.active || this.index === i) return;
        this.index = i;
        sound.menuMove();
        this.refresh();
      });
      zone.on('pointerdown', () => {
        if (!this.active) return;
        this.index = i;
        this.activate();
      });
      this.rows.push({ bg, text, hint, zone });
    });

    scene.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (!this.active) return;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') this.move(-1);
      else if (e.code === 'ArrowDown' || e.code === 'KeyS') this.move(1);
      else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyF') this.activate();
    });
    this.refresh();
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return this.rows.flatMap((r) => [r.bg, r.text, ...(r.hint ? [r.hint] : []), r.zone]);
  }

  private enabled(i: number): boolean {
    return this.items[i].enabled?.() ?? true;
  }

  private move(d: number): void {
    this.index = (this.index + d + this.items.length) % this.items.length;
    sound.menuMove();
    this.refresh();
  }

  private activate(): void {
    if (!this.enabled(this.index)) {
      sound.menuBack();
      this.scene.cameras.main.shake(120, 0.004);
      return;
    }
    sound.menuSelect();
    this.items[this.index].action();
    this.refresh();
  }

  refresh(): void {
    this.rows.forEach((row, i) => {
      const selected = i === this.index;
      const enabled = this.enabled(i);
      const cy = this.y + i * this.spacing;
      const h = this.spacing - 14;
      row.text.setText(this.items[i].label());
      row.bg.clear();
      row.bg.fillStyle(0x000000, 0.3);
      row.bg.fillRoundedRect(this.x - this.width / 2 + 5, cy - h / 2 + 6, this.width, h, 14);
      row.bg.fillStyle(selected ? UI.accent : UI.panel, selected ? 1 : 0.88);
      row.bg.fillRoundedRect(this.x - this.width / 2, cy - h / 2, this.width, h, 14);
      row.bg.lineStyle(3, selected ? 0xffffff : 0x5a52a8, 1);
      row.bg.strokeRoundedRect(this.x - this.width / 2, cy - h / 2, this.width, h, 14);
      row.text.setColor(selected ? UI.inkCss : enabled ? '#ffffff' : '#8a84bf');
      row.text.setStroke(selected ? '#ffffff' : UI.inkCss, selected ? 0 : 6);
      row.text.setScale(selected ? 1.06 : 1);
      row.hint?.setColor(selected ? '#3b3470' : UI.muted);
    });
  }
}

/** M toggles mute in every scene; shows a short toast. */
export function installGlobalKeys(scene: Phaser.Scene): void {
  scene.input.keyboard?.on('keydown-M', () => {
    const muted = sound.toggleMute();
    toast(scene, muted ? 'SOUND OFF' : 'SOUND ON');
  });
}

export function toast(scene: Phaser.Scene, msg: string): void {
  const t = displayText(scene, GAME_WIDTH / 2, GAME_HEIGHT - 40, msg, 20, '#ffffff', UI.inkCss, 6).setDepth(1000).setScrollFactor(0);
  scene.tweens.add({ targets: t, alpha: 0, y: GAME_HEIGHT - 70, delay: 700, duration: 400, onComplete: () => t.destroy() });
  scene.events.emit('ui-object', t);
}

export function fadeTo(scene: Phaser.Scene, key: string, data?: object): void {
  scene.cameras.main.fadeOut(220, 13, 11, 31);
  scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => scene.scene.start(key, data));
}
