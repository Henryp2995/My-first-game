/**
 * The game's one audio system (Web Audio). Every effect and music note is synthesized at
 * runtime — there are no audio files, so nothing to license. Phaser's own audio is disabled.
 *
 * Signal flow:
 *   voices → combat / ui / ambient / music bus → master (fixed headroom) → limiter → speakers
 * Bus gains come from the persisted settings (see settings.ts).
 *
 * Audio only reacts to GameEvents and render state; it never feeds back into the simulation.
 */
import { channelGains, loadAudioSettings, saveAudioSettings, type AudioSettings } from './settings';

type Wave = OscillatorType;
export type Bus = 'combat' | 'ui' | 'ambient' | 'music';

/** Overall headroom before the limiter. */
const HEADROOM = 0.9;
/** Hard cap on simultaneous SFX voices so a busy moment never turns into mush. */
const MAX_SFX_VOICES = 28;

export interface AudioHandle {
  ctx: AudioContext;
  out: GainNode;
  noise: AudioBuffer;
}

class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Partial<Record<Bus, GainNode>> = {};
  private noiseBuffer: AudioBuffer | null = null;
  private settings: AudioSettings = loadAudioSettings();
  private sfxVoices = new Set<AudioScheduledSourceNode>();
  private lastPlayed = new Map<string, number>();
  private unlockListeners: (() => void)[] = [];
  private settingsListeners: (() => void)[] = [];

  /** Current settings (copy). */
  get state(): AudioSettings {
    return { ...this.settings };
  }

  get muted(): boolean {
    return this.settings.muted;
  }

  /** True once the browser has let audio start (after a key press or click). */
  get unlocked(): boolean {
    return !!this.ctx && this.ctx.state !== 'closed';
  }

  toggleMute(): boolean {
    this.setMuted(!this.settings.muted);
    return this.settings.muted;
  }

  setMuted(m: boolean): void {
    this.update({ muted: m });
  }

  update(patch: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...patch };
    saveAudioSettings(this.settings);
    this.applyGains();
    this.settingsListeners.forEach((fn) => fn());
  }

  onSettingsChange(fn: () => void): () => void {
    this.settingsListeners.push(fn);
    return () => {
      this.settingsListeners = this.settingsListeners.filter((f) => f !== fn);
    };
  }

  /** Runs `fn` once audio is available (immediately if it already is). */
  whenUnlocked(fn: () => void): void {
    if (this.ctx) fn();
    else this.unlockListeners.push(fn);
  }

  /**
   * Call from a real user gesture (key press / click). Browsers only allow audio to start from
   * one, so this is wired to every keydown/pointerdown — it is cheap after the first call and
   * also revives a context that was suspended or interrupted (Safari, tab switches, calls).
   */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      let ctx: AudioContext;
      try {
        ctx = new Ctor();
      } catch {
        return;
      }
      this.ctx = ctx;
      // Limiter: transparent until peaks get close to clipping.
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.knee.value = 6;
      limiter.ratio.value = 10;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.2;
      limiter.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = HEADROOM;
      this.master.connect(limiter);
      for (const bus of ['combat', 'ui', 'ambient', 'music'] as Bus[]) {
        const g = ctx.createGain();
        g.connect(this.master);
        this.buses[bus] = g;
      }
      this.applyGains(true);
      const len = ctx.sampleRate;
      this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      // Don't burn CPU (or drift the music clock) while the tab is hidden.
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) void ctx.suspend().catch(() => undefined);
        else void ctx.resume().catch(() => undefined);
      });
      const listeners = this.unlockListeners;
      this.unlockListeners = [];
      listeners.forEach((fn) => fn());
    }
    const s = this.ctx.state as AudioContextState | 'interrupted';
    if ((s === 'suspended' || s === 'interrupted') && !document.hidden) void this.ctx.resume().catch(() => undefined);
  }

  /** One-line engine status for the AUDIO screen (helps diagnose "no sound" on a given browser). */
  status(): string {
    if (!this.ctx) return 'Audio engine not started yet — press any key or click the game';
    const st = this.ctx.state as string;
    const kHz = Math.round(this.ctx.sampleRate / 1000);
    const clock = this.ctx.currentTime.toFixed(1);
    const mute = this.settings.muted ? ' · MUTED' : '';
    return `Audio engine: ${st} · ${kHz} kHz · clock ${clock}s · ${this.sfxVoices.size} voices${mute}`;
  }

  /** A clear two-second chord for checking speakers, played even if SFX volume is low. */
  test(): void {
    if (!this.ready()) return;
    [523, 659, 784].forEach((f, i) => this.tone(f, f, 1.6, 'triangle', 0.3, i * 0.12, 'ui'));
  }

  /** Low-level access for the music sequencer (same context, its own bus). */
  handle(bus: Bus): AudioHandle | null {
    const out = this.buses[bus];
    if (!this.ctx || !out || !this.noiseBuffer) return null;
    return { ctx: this.ctx, out, noise: this.noiseBuffer };
  }

  private applyGains(immediate = false): void {
    if (!this.ctx) return;
    const gains = channelGains(this.settings);
    for (const [bus, node] of Object.entries(this.buses) as [Bus, GainNode][]) {
      if (immediate) node.gain.value = gains[bus];
      else node.gain.setTargetAtTime(gains[bus], this.ctx.currentTime, 0.03);
    }
  }

  /**
   * Scheduling is allowed while the context is still starting ("suspended" right after the
   * unlock gesture): nodes queue up and play the moment the clock runs, so the very first
   * sound isn't lost.
   */
  private ready(): boolean {
    return !!this.ctx && !!this.master && !this.settings.muted && this.ctx.state !== 'closed';
  }

  /**
   * Start time for a new voice. Right after the context is created its clock hasn't started
   * yet and then jumps ahead, which used to swallow the attack of the first sound — so early
   * sounds are scheduled slightly into the future.
   */
  private now(delay: number): number {
    const ctx = this.ctx!;
    return Math.max(ctx.currentTime, 0) + delay + (ctx.currentTime < 0.2 ? 0.08 : 0);
  }

  /** Per-sound cooldown (ms) so the same effect can't stack on itself in one instant. */
  private gate(key: string, ms: number): boolean {
    const now = performance.now();
    const last = this.lastPlayed.get(key) ?? -Infinity;
    if (now - last < ms) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  private voice(bus: Bus, node: AudioScheduledSourceNode): boolean {
    if (bus === 'music') return true;
    if (this.sfxVoices.size >= MAX_SFX_VOICES) return false;
    this.sfxVoices.add(node);
    node.onended = () => this.sfxVoices.delete(node);
    return true;
  }

  private tone(freq: number, freqEnd: number, dur: number, type: Wave, vol: number, delay = 0, bus: Bus = 'combat'): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = this.now(delay);
    const osc = ctx.createOscillator();
    if (!this.voice(bus, osc)) return;
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.buses[bus]!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, filter: BiquadFilterType, f0: number, f1: number, delay = 0, bus: Bus = 'combat', q?: number): void {
    if (!this.ready() || !this.noiseBuffer) return;
    const ctx = this.ctx!;
    const t = this.now(delay);
    const src = ctx.createBufferSource();
    if (!this.voice(bus, src)) return;
    src.buffer = this.noiseBuffer;
    const biq = ctx.createBiquadFilter();
    biq.type = filter;
    biq.frequency.setValueAtTime(f0, t);
    biq.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    biq.Q.value = q ?? (filter === 'bandpass' ? 1.5 : 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(biq);
    biq.connect(g);
    g.connect(this.buses[bus]!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // ── Movement ────────────────────────────────────────────────────────────

  jump(double = false): void {
    if (double) this.tone(440, 1000, 0.13, 'square', 0.16);
    else this.tone(260, 620, 0.12, 'square', 0.16);
    this.noise(0.08, 0.2, 'highpass', 2500, 1200);
  }
  land(hard = false): void {
    this.noise(hard ? 0.2 : 0.09, hard ? 0.75 : 0.55, 'lowpass', hard ? 900 : 700, 100);
    if (hard) this.tone(110, 45, 0.18, 'sine', 0.6);
  }
  dodge(): void {
    this.noise(0.18, 0.4, 'bandpass', 3200, 700, 0, 'combat', 1.2);
    this.tone(900, 1500, 0.1, 'sine', 0.08);
  }
  respawn(): void {
    [523, 784, 1047].forEach((f, i) => this.tone(f, f, 0.16, 'triangle', 0.22, i * 0.06));
    this.noise(0.35, 0.22, 'highpass', 4000, 9000, 0.05);
  }

  // ── Ledges & shields ────────────────────────────────────────────────────

  ledgeGrab(): void {
    this.noise(0.05, 0.45, 'bandpass', 1800, 900, 0, 'combat', 2);
    this.tone(320, 240, 0.06, 'triangle', 0.2);
  }
  ledgeClimb(): void {
    this.noise(0.14, 0.3, 'bandpass', 900, 2200, 0, 'combat', 1.2);
  }
  shieldUp(): void {
    if (this.gate('shieldUp', 80)) this.tone(520, 880, 0.08, 'sine', 0.14);
  }
  /** Glassy thunk; lower and duller as the shield weakens. */
  shieldHit(healthRatio: number): void {
    const r = Math.max(0, Math.min(1, healthRatio));
    this.tone(700 + r * 700, 300 + r * 300, 0.12, 'triangle', 0.35);
    this.noise(0.08, 0.4, 'highpass', 4000 + r * 3000, 2000, 0, 'combat');
  }
  shieldBreak(): void {
    for (let i = 0; i < 6; i++) this.tone(2400 - i * 260, 900 - i * 90, 0.12, 'triangle', 0.22, i * 0.035);
    this.noise(0.5, 0.8, 'highpass', 6000, 1500);
    this.tone(160, 50, 0.5, 'sine', 0.55);
  }

  // ── Grabs & throws ──────────────────────────────────────────────────────

  grabWhiff(): void {
    this.noise(0.1, 0.25, 'bandpass', 1400, 600, 0, 'combat', 1.4);
  }
  grabConnect(): void {
    this.noise(0.06, 0.5, 'lowpass', 1600, 400);
    this.tone(220, 160, 0.08, 'square', 0.18);
  }
  pummel(): void {
    this.noise(0.05, 0.45, 'lowpass', 2500, 500);
    this.tone(180, 90, 0.06, 'sine', 0.35);
  }
  /** Throw whoosh, flavored per fighter style (impact comes from the normal hit sound). */
  throwSwing(style: string): void {
    this.noise(0.18, 0.45, 'bandpass', 700, 2600, 0, 'combat', 1);
    if (style === 'force') this.tone(70, 55, 0.4, 'sine', 0.45);
    else if (style === 'ki') this.tone(300, 900, 0.25, 'sawtooth', 0.12);
    else if (style === 'mech') { this.tone(90, 45, 0.25, 'square', 0.25); this.noise(0.25, 0.5, 'lowpass', 600, 120, 0.08); }
    else if (style === 'web') { this.noise(0.08, 0.4, 'highpass', 7000, 2500); }
    else if (style === 'clone' || style === 'ninja') this.noise(0.2, 0.3, 'highpass', 5000, 900, 0.03);
    else if (style === 'flat') this.tone(1320, 1320, 0.05, 'square', 0.2);
    else if (style === 'comedic') this.tone(500, 1100, 0.18, 'triangle', 0.2);
  }
  grabEscape(): void {
    this.noise(0.16, 0.4, 'bandpass', 2400, 700, 0, 'combat', 1.2);
    this.tone(600, 900, 0.08, 'triangle', 0.14);
  }

  // ── Attacks ─────────────────────────────────────────────────────────────

  /** Quick, bright swish. */
  light(): void {
    this.noise(0.07, 0.3, 'highpass', 3600, 1500);
    this.tone(700, 450, 0.05, 'triangle', 0.08);
  }
  /** Slower, lower, weightier whoosh with a body thump. */
  heavy(): void {
    this.noise(0.28, 0.85, 'bandpass', 500, 2200, 0, 'combat', 1.1);
    this.tone(150, 55, 0.25, 'triangle', 0.65);
  }
  /** Energy-blade swing (Gundam's beam saber, Vader's lightsaber). */
  saber(heavy = false): void {
    const d = heavy ? 0.34 : 0.22;
    this.tone(heavy ? 95 : 120, heavy ? 150 : 200, d, 'sawtooth', heavy ? 0.5 : 0.4);
    this.tone(heavy ? 190 : 240, heavy ? 300 : 400, d, 'sawtooth', 0.2);
    this.noise(d, heavy ? 0.7 : 0.55, 'bandpass', 600, 1900, 0, 'combat', 3);
  }
  /** Saber ignition hum for Vader's force move / Gundam's saber draw. */
  saberIgnite(): void {
    this.tone(80, 120, 0.5, 'sawtooth', 0.16);
    this.tone(161, 241, 0.5, 'sawtooth', 0.08);
    this.noise(0.12, 0.3, 'bandpass', 2000, 500, 0, 'combat', 2);
  }
  special(kind: 'judge' | 'rocket' | 'vanish' | 'generic' = 'generic'): void {
    if (kind === 'judge') {
      this.tone(1320, 1320, 0.05, 'square', 0.35);
      this.tone(990, 990, 0.05, 'square', 0.35, 0.07);
    } else if (kind === 'rocket') {
      this.tone(180, 900, 0.35, 'sawtooth', 0.2);
      this.noise(0.4, 0.55, 'bandpass', 400, 3000);
    } else if (kind === 'vanish') {
      this.noise(0.25, 0.35, 'highpass', 6000, 800);
      this.tone(1600, 400, 0.2, 'sine', 0.2);
    } else {
      this.tone(500, 1000, 0.15, 'triangle', 0.25);
    }
  }
  /** Luigi's rocket wind-up ticks. */
  charge(): void {
    if (this.gate('charge', 100)) this.tone(300, 600, 0.06, 'sawtooth', 0.08, 0, 'ambient');
  }

  // ── Character specials & projectiles ───────────────────────────────────

  /** Spider-Man: thwip. */
  web(): void {
    this.noise(0.1, 0.4, 'highpass', 7000, 2500);
    this.tone(2000, 900, 0.07, 'triangle', 0.14);
  }
  webzip(): void {
    this.noise(0.16, 0.5, 'bandpass', 5000, 1500);
    this.tone(600, 1400, 0.15, 'triangle', 0.16);
  }
  /** Batman: gadget click + spinning whirr. */
  batarang(): void {
    this.tone(2400, 2400, 0.02, 'square', 0.3);
    this.tone(1800, 1800, 0.02, 'square', 0.25, 0.04);
    for (let i = 0; i < 5; i++) this.noise(0.07, 0.75, 'bandpass', 1300, 2600, 0.05 + i * 0.07, 'combat', 2);
  }
  /** Goku: rising ki charge. */
  beamCharge(): void {
    this.tone(120, 520, 0.9, 'sawtooth', 0.22);
    this.tone(240, 1040, 0.9, 'sine', 0.25);
    this.noise(0.9, 0.35, 'bandpass', 600, 3000, 0, 'combat', 4);
  }
  beamFire(charge: number): void {
    this.noise(0.7 + charge * 0.4, 0.75, 'lowpass', 4000, 300);
    this.tone(520, 140, 0.7 + charge * 0.3, 'sawtooth', 0.2 + charge * 0.1);
    this.tone(70, 40, 0.6 + charge * 0.3, 'sine', 0.5);
  }
  /** Naruto: swirling chakra orb. */
  rasengan(): void {
    this.tone(300, 900, 0.3, 'sawtooth', 0.3);
    for (let i = 0; i < 4; i++) this.noise(0.12, 0.75, 'bandpass', 1200 + i * 700, 3600, i * 0.08, 'combat', 5);
  }
  /** Gundam: beam rifle shot. */
  rifle(): void {
    this.tone(2200, 500, 0.16, 'sawtooth', 0.2);
    this.tone(1100, 250, 0.2, 'square', 0.08);
    this.noise(0.14, 0.5, 'bandpass', 4000, 1500);
  }
  /** Gundam: thruster burst on jumps. */
  thruster(): void {
    this.noise(0.3, 0.5, 'bandpass', 900, 300, 0, 'combat', 0.8);
    this.noise(0.18, 0.25, 'highpass', 5000, 3000);
  }
  /** Gundam: servo + heavy metal footfall while running. */
  mechStep(): void {
    if (!this.gate('mech', 150)) return;
    this.noise(0.06, 0.55, 'lowpass', 500, 120, 0, 'ambient');
    this.tone(1400, 1900, 0.07, 'square', 0.05, 0, 'ambient');
  }
  /** Vader: low force rumble. */
  choke(): void {
    this.tone(70, 55, 0.8, 'sine', 0.55);
    this.noise(0.8, 0.4, 'lowpass', 400, 80);
    this.saberIgnite();
  }
  judgeNumber(n: number): void {
    for (let i = 0; i < Math.min(n, 9); i++) this.tone(880 + n * 40, 880 + n * 40, 0.035, 'square', 0.28, i * 0.045);
  }
  /** A projectile that fizzles out without hitting anyone. */
  fizzle(): void {
    if (this.gate('fizzle', 60)) this.noise(0.12, 0.2, 'highpass', 3000, 1200, 0, 'ambient');
  }

  // ── Impacts ─────────────────────────────────────────────────────────────

  /**
   * Hit, scaled by launch speed. `key` identifies attacker→victim so one attack can't stack
   * several identical hit sounds in the same instant; genuine multi-hits (a few frames apart)
   * still each get one.
   */
  hit(strength: number, key = 'hit'): void {
    if (!this.gate(`hit:${key}`, 45)) return;
    const s = Math.min(1, strength / 2000);
    this.noise(0.08 + s * 0.2, 0.3 + s * 0.45, 'lowpass', 5000, 300);
    this.tone(220 - s * 120, 50, 0.1 + s * 0.2, 'sine', 0.3 + s * 0.35);
    if (s > 0.6) this.tone(1800, 600, 0.15, 'square', 0.1);
  }
  /** Strong knockback: a launch whoosh layered on the hit. */
  launch(strength: number): void {
    const s = Math.min(1, strength / 2000);
    this.noise(0.45 + s * 0.3, 0.3 + s * 0.25, 'bandpass', 2400, 400, 0.04, 'combat', 0.9);
    this.tone(900, 200, 0.4 + s * 0.2, 'sine', 0.1, 0.04);
  }
  ko(): void {
    this.noise(1.1, 0.8, 'lowpass', 3000, 60);
    this.tone(400, 40, 0.9, 'sawtooth', 0.25);
    this.tone(90, 30, 1.0, 'sine', 0.7);
  }

  // ── UI ──────────────────────────────────────────────────────────────────

  menuMove(): void {
    if (this.gate('menuMove', 30)) this.tone(880, 880, 0.05, 'square', 0.3, 0, 'ui');
  }
  menuSelect(): void {
    this.tone(660, 660, 0.07, 'square', 0.3, 0, 'ui');
    this.tone(990, 990, 0.11, 'square', 0.3, 0.06, 'ui');
  }
  menuBack(): void { this.tone(520, 300, 0.1, 'square', 0.3, 0, 'ui'); }
  countdown(): void { this.tone(440, 440, 0.18, 'square', 0.35, 0, 'ui'); }
  go(): void {
    this.tone(880, 880, 0.35, 'square', 0.2, 0, 'ui');
    this.tone(1320, 1320, 0.35, 'triangle', 0.18, 0, 'ui');
  }
  victory(): void {
    const notes = [523, 659, 784, 1047, 784, 1047];
    const times = [0, 0.12, 0.24, 0.36, 0.56, 0.68];
    notes.forEach((n, i) => this.tone(n, n, i === notes.length - 1 ? 0.6 : 0.14, 'square', 0.15, times[i], 'ui'));
    notes.forEach((n, i) => this.tone(n / 2, n / 2, 0.14, 'triangle', 0.15, times[i], 'ui'));
  }
  gameSet(): void {
    this.tone(784, 784, 0.15, 'square', 0.2, 0, 'ui');
    this.tone(523, 523, 0.5, 'square', 0.2, 0.15, 'ui');
    this.noise(0.6, 0.4, 'lowpass', 2000, 100, 0, 'ui');
  }
}

export const sound = new SoundManager();
