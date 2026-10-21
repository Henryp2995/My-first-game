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

/** M toggles mute in every scene (with a toast), and a small badge shows while muted. */
export function installGlobalKeys(scene: Phaser.Scene): void {
  scene.input.keyboard?.on('keydown-M', () => {
    const muted = sound.toggleMute();
    toast(scene, muted ? 'SOUND OFF' : 'SOUND ON');
  });
  const badge = bodyText(scene, GAME_WIDTH - 16, 34, 'SOUND OFF · press M', 13, '#ff8a8a', '900')
    .setOrigin(1, 0).setDepth(1000).setScrollFactor(0);
  scene.events.emit('ui-object', badge);
  const sync = () => {
    if (!badge.active) return;
    badge.setText(sound.muted ? 'SOUND OFF · press M' : 'Press any key or click for sound');
    badge.setColor(sound.muted ? '#ff8a8a' : '#ffd23f');
    badge.setVisible(sound.muted || !sound.unlocked);
  };
  sync();
  sound.whenUnlocked(sync);
  const off = sound.onSettingsChange(sync);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
}

export interface OptionRow {
  label: string;
  /** Right-hand value text, re-read on every render. */
  value?: () => string;
  valueColor?: () => string;
  /** 0..1: draws a slider bar for this row. */
  slider?: () => number;
  /** A/D, arrows, or clicking the left/right half of the row. */
  adjust?: (dir: 1 | -1) => void;
  /** Enter / Space / F, or a click. */
  press?: () => void;
  /** Extra keys while this row is selected (e.g. typing digits). Return true if handled. */
  onKey?: (e: KeyboardEvent) => boolean;
}

export interface OptionsPanel {
  render(): void;
  close(): void;
}

/**
 * Keyboard + mouse options overlay (audio settings, training settings). W/S choose, A/D adjust,
 * Enter activates, Esc closes. Objects are announced with 'ui-object' so a scene with a separate
 * HUD camera (Battle) can adopt them.
 */
export function openOptionsPanel(scene: Phaser.Scene, opts: {
  title: string;
  rows: OptionRow[];
  hint: string;
  status?: () => string;
  width?: number;
  rowH?: number;
  onClose: () => void;
}): OptionsPanel {
  const { rows } = opts;
  const width = opts.width ?? 620;
  const rowH = opts.rowH ?? 64;
  const cx = GAME_WIDTH / 2;
  const cy = GAME_HEIGHT / 2;
  const height = 130 + rows.length * rowH + (opts.status ? 26 : 0);
  const top = cy - height / 2;
  const objs: Phaser.GameObjects.GameObject[] = [];
  const dim = scene.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x0d0b1f, 0.75).setInteractive();
  objs.push(dim, panel(scene, cx, cy, width, height, UI.panel, 0xffffff, 0.97));
  objs.push(displayText(scene, cx, top + 42, opts.title, 34, '#ffd23f'));
  let index = 0;
  const bar = scene.add.graphics();
  objs.push(bar);
  const fontSize = rowH >= 60 ? 20 : 17;
  const texts = rows.map((r, i) => {
    const y = top + 100 + i * rowH;
    const label = scene.add.text(cx - width / 2 + 50, y, r.label, { fontFamily: FONT_BODY, fontSize: `${fontSize}px`, fontStyle: '900', color: '#ffffff' }).setOrigin(0, 0.5);
    const value = bodyText(scene, cx + width / 2 - 50, y, '', fontSize, '#ffffff', '900').setOrigin(1, 0.5);
    objs.push(label, value);
    const zone = scene.add.zone(cx, y, width - 60, rowH - 8).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => select(i));
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      select(i);
      if (r.adjust) adjust(p.x < cx + width / 2 - 170 ? -1 : 1);
      else activate();
    });
    objs.push(zone);
    return { label, value, y };
  });
  const status = opts.status ? bodyText(scene, cx, top + height - 52, '', 13, '#ffd23f', '700') : null;
  if (status) objs.push(status);
  objs.push(bodyText(scene, cx, top + height - 26, opts.hint, 13, UI.muted, '500'));

  const render = () => {
    if (closed) return;
    status?.setText(opts.status?.() ?? '');
    bar.clear();
    rows.forEach((r, i) => {
      const t = texts[i];
      const sel = i === index;
      t.label.setColor(sel ? '#ffd23f' : '#ffffff');
      if (sel) {
        bar.fillStyle(0xffffff, 0.08);
        bar.fillRoundedRect(cx - width / 2 + 30, t.y - rowH / 2 + 4, width - 60, rowH - 8, 12);
      }
      if (r.slider) {
        const v = r.slider();
        const x0 = cx - 60;
        const w = 180;
        bar.fillStyle(0x000000, 0.4);
        bar.fillRoundedRect(x0, t.y - 7, w, 14, 7);
        bar.fillStyle(sound.muted ? 0x8a84bf : UI.accent, 1);
        if (v > 0) bar.fillRoundedRect(x0, t.y - 7, Math.max(14, w * v), 14, 7);
      }
      t.value.setText(r.value?.() ?? '');
      t.value.setColor(r.valueColor?.() ?? (sel && r.adjust ? '#ffd23f' : '#ffffff'));
    });
  };
  const select = (i: number) => {
    if (i === index) return;
    index = i;
    sound.menuMove();
    render();
  };
  const adjust = (d: 1 | -1) => {
    const r = rows[index];
    if (!r.adjust) return;
    r.adjust(d);
    sound.menuMove();
    render();
  };
  const activate = () => {
    const r = rows[index];
    if (r.press) {
      sound.menuSelect();
      r.press();
    } else if (r.adjust) {
      r.adjust(1);
      sound.menuMove();
    }
    render();
  };
  const onKey = (e: KeyboardEvent) => {
    if (rows[index].onKey?.(e)) {
      render();
      return;
    }
    if (e.code === 'ArrowUp' || e.code === 'KeyW') select((index + rows.length - 1) % rows.length);
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') select((index + 1) % rows.length);
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') adjust(-1);
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') adjust(1);
    else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyF') activate();
    else if (e.code === 'Escape') close();
  };
  const offSettings = sound.onSettingsChange(render);
  const statusTimer = opts.status ? scene.time.addEvent({ delay: 250, loop: true, callback: render }) : null;
  let closed = false;
  const teardown = () => {
    scene.input.keyboard?.off('keydown', onKey);
    offSettings();
    statusTimer?.remove();
  };
  const close = () => {
    if (closed) return;
    closed = true;
    sound.menuBack();
    teardown();
    objs.forEach((o) => o.destroy());
    // Let this key press finish before whatever is underneath listens again.
    scene.time.delayedCall(50, opts.onClose);
  };
  // Defer so the key that opened the panel doesn't also trigger a row.
  scene.time.delayedCall(0, () => {
    if (!closed) scene.input.keyboard?.on('keydown', onKey);
  });
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    closed = true;
    teardown();
  });
  objs.forEach((o) => {
    (o as unknown as { setDepth?: (d: number) => void }).setDepth?.(900);
    scene.events.emit('ui-object', o);
  });
  render();
  return { render, close };
}

/** Audio settings: master / music / SFX volume, mute and a test sound. Saved automatically. */
export function openAudioSettings(scene: Phaser.Scene, onClose: () => void): void {
  const step = 0.1;
  const slider = (key: 'master' | 'music' | 'sfx', label: string): OptionRow => ({
    label,
    slider: () => sound.state[key],
    value: () => `− ${Math.round(sound.state[key] * 100)}% +`,
    adjust: (d) => sound.update({ [key]: Math.round(Math.min(1, Math.max(0, sound.state[key] + d * step)) * 10) / 10 }),
  });
  const panelRef: { p?: OptionsPanel } = {};
  panelRef.p = openOptionsPanel(scene, {
    title: 'AUDIO',
    rows: [
      slider('master', 'MASTER'),
      slider('music', 'MUSIC'),
      slider('sfx', 'SOUND EFFECTS'),
      {
        label: 'MUTE',
        value: () => (sound.muted ? 'ON (silent)' : 'OFF'),
        valueColor: () => (sound.muted ? '#ff8a8a' : '#ffffff'),
        press: () => sound.toggleMute(),
        adjust: () => sound.toggleMute(),
      },
      {
        label: 'TEST SOUND',
        value: () => (sound.muted ? 'unmute first' : 'Enter / click'),
        valueColor: () => UI.muted,
        press: () => sound.test(),
      },
      { label: 'BACK', press: () => panelRef.p?.close() },
    ],
    status: () => sound.status(),
    hint: 'W/S choose · A/D adjust · Enter toggle · Esc back · click − / +',
    onClose,
  });
}

const lastToast = new WeakMap<Phaser.Scene, Phaser.GameObjects.Text>();

/** Short message; a new one replaces the previous. In matches it sits above the fighter cards. */
export function toast(scene: Phaser.Scene, msg: string): void {
  lastToast.get(scene)?.destroy();
  const y = scene.scene.key === 'Battle' ? 132 : GAME_HEIGHT - 40;
  const t = displayText(scene, GAME_WIDTH / 2, y, msg, 20, '#ffffff', UI.inkCss, 6).setDepth(1000).setScrollFactor(0);
  lastToast.set(scene, t);
  scene.tweens.add({ targets: t, alpha: 0, y: y - 30, delay: 700, duration: 400, onComplete: () => t.destroy() });
  scene.events.emit('ui-object', t);
}

export function fadeTo(scene: Phaser.Scene, key: string, data?: object): void {
  scene.cameras.main.fadeOut(220, 13, 11, 31);
  // Always pass an object: Phaser reuses a scene's previous start data when given none.
  scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => scene.scene.start(key, data ?? {}));
}
