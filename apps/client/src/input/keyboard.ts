import { emptyInput, type InputFrame } from '@arena-rush/shared';
import type { InputSource } from './source';

/**
 * Tracks held keys by `KeyboardEvent.code`, which (unlike Phaser key codes) distinguishes
 * ShiftLeft from ShiftRight, so P1's dodge is specifically Left Shift.
 */
class KeyboardState {
  private down = new Set<string>();
  /** Keys pressed since they were last polled, so taps shorter than one sim tick still register. */
  private tapped = new Set<string>();
  private installed = false;

  /** Keys whose default browser action (scrolling, find-as-you-type, etc.) we suppress. */
  private static readonly BLOCKED = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft',
    'Tab', 'Slash', 'Quote', 'PageUp', 'PageDown', 'Home', 'End', 'Backspace',
  ]);

  install(): void {
    if (this.installed) return;
    this.installed = true;
    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.tapped.add(e.code);
      this.down.add(e.code);
      if (KeyboardState.BLOCKED.has(e.code)) e.preventDefault();
    }, { capture: true });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    }, { capture: true });
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    });
    // Block wheel/touch scrolling over the game.
    window.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    window.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  /** Forget keys pressed while the game wasn't listening (e.g. in a pause menu). */
  flush(): void {
    this.tapped.clear();
  }

  private reset(): void {
    this.down.clear();
    this.tapped.clear();
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Held now, or tapped since the last poll of this key. Clears the tap latch. */
  poll(code: string): boolean {
    const tapped = this.tapped.delete(code);
    return tapped || this.down.has(code);
  }
}

export const keyboard = new KeyboardState();

export interface KeyBindings {
  left: string[];
  right: string[];
  up: string[];
  down: string[];
  jump: string[];
  light: string[];
  heavy: string[];
  special: string[];
  dodge: string[];
  /** Grab; while holding someone it pummels (so does light attack). */
  grab: string[];
}

/** Player 1's keyboard controls. (Local play is Player vs CPU, so there is only one keyboard player.) */
export const P1_KEYS: KeyBindings = {
  left: ['KeyA'],
  right: ['KeyD'],
  up: ['KeyW'],
  down: ['KeyS'],
  jump: ['KeyW'],
  light: ['KeyF'],
  heavy: ['KeyG'],
  special: ['KeyH'],
  dodge: ['ShiftLeft'],
  grab: ['KeyJ'],
};

export class KeyboardInputSource implements InputSource {
  constructor(private bindings: KeyBindings) {}

  poll(): InputFrame {
    const out = emptyInput();
    // Read each physical key once per poll: a key can be bound to several actions (W = up + jump).
    const keys = new Map<string, boolean>();
    const read = (code: string) => {
      let v = keys.get(code);
      if (v === undefined) {
        v = keyboard.poll(code);
        keys.set(code, v);
      }
      return v;
    };
    for (const action of Object.keys(this.bindings) as (keyof KeyBindings)[]) {
      out[action] = this.bindings[action].map(read).some(Boolean);
    }
    return out;
  }
}
