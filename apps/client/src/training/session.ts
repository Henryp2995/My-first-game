/**
 * Client-side Training Mode session: owns the dummy controller, combo tracker and practice
 * settings, and steps the *normal* shared simulation. No Phaser here so it can be unit-tested.
 */
import {
  ComboTracker, DUMMY_BEHAVIORS, hangOnNearestLedge, resetPositions, setFighterDamage, setFighterShield, shieldMax, stepMatch,
  TrainingDummyController, DUMMY_THROWS, type DummyBehavior, type DummyThrow, type GameEvent, type InputFrame, type MatchState,
  type ThrowDir,
} from '@arena-rush/shared';

export const DAMAGE_PRESETS = [0, 25, 50, 75, 100, 150] as const;
/** Dummy shield health presets, as a percentage of its max shield. */
export const SHIELD_PRESETS = [100, 75, 50, 25, 10, 1] as const;

/** How forgiving the combo counter is: frames the dummy may be free before the combo breaks. */
export const COMBO_WINDOWS = [
  { label: 'Strict (true combos)', frames: 0 },
  { label: 'Loose (+12 frames)', frames: 12 },
] as const;

export interface TrainingSettings {
  behavior: DummyBehavior;
  comboCounter: boolean;
  hitboxes: boolean;
  /** Index into COMBO_WINDOWS. */
  comboWindow: number;
}

export const DEFAULT_TRAINING_SETTINGS: TrainingSettings = { behavior: 'stand', comboCounter: true, hitboxes: false, comboWindow: 0 };

/** Next damage preset above (dir 1) or below (dir -1) the current value, for custom values too. */
export function stepDamagePreset(current: number, dir: 1 | -1): number {
  const list = [...DAMAGE_PRESETS];
  if (dir > 0) return list.find((p) => p > current) ?? list[0];
  return [...list].reverse().find((p) => p < current) ?? list[list.length - 1];
}

const ACTION_LABEL: Record<string, string> = { light: 'LIGHT', heavy: 'HEAVY', special: 'SPECIAL', aerial: 'AIR' };

export class TrainingSession {
  readonly dummy: TrainingDummyController;
  readonly combo: ComboTracker;
  settings: TrainingSettings;
  /** True while the training settings panel is open: the simulation does not advance. */
  paused = false;
  /** The player's most recent actions, newest last (input display). */
  recent: string[] = [];
  /** The last throw that landed (throw damage / knockback testing). */
  lastThrow: { by: 'You' | 'Dummy'; dir: ThrowDir; damage: number; launch: number; percent: number } | null = null;

  constructor(
    readonly match: MatchState,
    readonly playerId: number,
    readonly dummyId: number,
    settings: Partial<TrainingSettings> = {},
    seed = 0x7a11,
  ) {
    this.settings = { ...DEFAULT_TRAINING_SETTINGS, ...settings };
    this.dummy = new TrainingDummyController(dummyId, this.settings.behavior, seed);
    this.combo = new ComboTracker(dummyId, COMBO_WINDOWS[this.settings.comboWindow].frames);
  }

  /** Advances one simulation frame (unless paused) and returns its events. */
  step(playerInput: InputFrame): GameEvent[] {
    if (this.paused) return [];
    const inputs: InputFrame[] = [];
    inputs[this.playerId] = playerInput;
    inputs[this.dummyId] = this.dummy.decide(this.match);
    const events = stepMatch(this.match, inputs);
    this.combo.update(this.match, events);
    this.record(events);
    return events;
  }

  private record(events: readonly GameEvent[]): void {
    for (const e of events) {
      if (e.type === 'hit' && e.throwDir) {
        this.lastThrow = {
          by: e.attacker === this.playerId ? 'You' : 'Dummy', dir: e.throwDir, damage: e.damage, launch: e.launchSpeed,
          percent: this.match.fighters[e.victim].damage,
        };
      }
      if (e.type === 'grab' && e.grabber === this.playerId) this.pushRecent(e.shielded ? 'SHIELD GRAB' : 'GRAB');
      else if (e.type === 'pummel' && e.grabber === this.playerId) this.pushRecent('PUMMEL');
      else if (e.type === 'throw' && e.grabber === this.playerId) this.pushRecent(`${e.dir.toUpperCase()} THROW`);
      let label: string | null = null;
      if (e.type === 'attack' && e.id === this.playerId) label = ACTION_LABEL[e.slot] ?? e.slot.toUpperCase();
      else if (e.type === 'jump' && e.id === this.playerId) label = e.double ? 'AIR JUMP' : 'JUMP';
      else if (e.type === 'dodge' && e.id === this.playerId) label = 'DODGE';
      if (label) this.pushRecent(label);
    }
  }

  private pushRecent(label: string): void {
    this.recent.push(label);
    if (this.recent.length > 6) this.recent.shift();
  }

  get dummyThrow(): DummyThrow {
    return this.dummy.throwChoice;
  }

  cycleDummyThrow(dir: 1 | -1): DummyThrow {
    const i = DUMMY_THROWS.indexOf(this.dummy.throwChoice);
    this.dummy.throwChoice = DUMMY_THROWS[(i + dir + DUMMY_THROWS.length) % DUMMY_THROWS.length];
    return this.dummy.throwChoice;
  }

  get dummyEscapeMash(): boolean {
    return this.dummy.escapeMash;
  }

  toggleDummyEscape(): boolean {
    this.dummy.escapeMash = !this.dummy.escapeMash;
    return this.dummy.escapeMash;
  }

  get dummyDamage(): number {
    return this.match.fighters[this.dummyId].damage;
  }

  setBehavior(b: DummyBehavior): void {
    this.settings.behavior = b;
    this.dummy.setBehavior(b);
  }

  cycleBehavior(dir: 1 | -1 = 1): DummyBehavior {
    const i = DUMMY_BEHAVIORS.indexOf(this.settings.behavior);
    const next = DUMMY_BEHAVIORS[(i + dir + DUMMY_BEHAVIORS.length) % DUMMY_BEHAVIORS.length];
    this.setBehavior(next);
    return next;
  }

  setDummyDamage(percent: number): void {
    setFighterDamage(this.match, this.dummyId, percent);
  }

  resetDummyDamage(): void {
    this.setDummyDamage(0);
    this.combo.reset();
  }

  resetPositions(): void {
    resetPositions(this.match);
    this.combo.reset();
    // Drop anything the dummy had queued (e.g. a jump) so it starts the reset standing still.
    this.dummy.setBehavior(this.settings.behavior);
  }

  get dummyShieldPercent(): number {
    const d = this.match.fighters[this.dummyId];
    return (d.shieldHp / shieldMax(this.match.rules, d)) * 100;
  }

  /** Sets the dummy's shield to a percentage of its max (immediately). */
  setDummyShield(percent: number): void {
    const d = this.match.fighters[this.dummyId];
    setFighterShield(this.match, this.dummyId, (shieldMax(this.match.rules, d) * percent) / 100);
  }

  cycleDummyShield(dir: 1 | -1): number {
    const list = [...SHIELD_PRESETS];
    const cur = Math.round(this.dummyShieldPercent);
    const next = dir > 0 ? list.find((p) => p < cur) ?? list[0] : [...list].reverse().find((p) => p > cur) ?? list[list.length - 1];
    this.setDummyShield(next);
    return next;
  }

  /** Ledge practice: hang the dummy (or yourself) on the nearest ledge. */
  hangOnLedge(who: 'dummy' | 'player'): boolean {
    this.combo.reset();
    return hangOnNearestLedge(this.match, who === 'dummy' ? this.dummyId : this.playerId);
  }

  setComboWindow(index: number): void {
    this.settings.comboWindow = (index + COMBO_WINDOWS.length) % COMBO_WINDOWS.length;
    this.combo.graceFrames = COMBO_WINDOWS[this.settings.comboWindow].frames;
  }
}
