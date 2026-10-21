/**
 * Tiny synthesized sound system (Web Audio). Every effect is generated at runtime —
 * no audio files, so nothing to license.
 */
type Wave = OscillatorType;

const MUTE_KEY = 'arena-rush:muted';

class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private _muted = false;

  constructor() {
    try {
      this._muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this._muted = false;
    }
  }

  get muted(): boolean {
    return this._muted;
  }

  toggleMute(): boolean {
    this.setMuted(!this._muted);
    return this._muted;
  }

  setMuted(m: boolean): void {
    this._muted = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
  }

  /** Must be called from a user gesture at least once (browser autoplay policy). */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : 0.5;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private ready(): boolean {
    return !!this.ctx && !!this.master && !this._muted && this.ctx.state === 'running';
  }

  private tone(freq: number, freqEnd: number, dur: number, type: Wave = 'square', vol = 0.2, delay = 0): void {
    if (!this.ready()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, filter: BiquadFilterType, f0: number, f1: number, delay = 0): void {
    if (!this.ready() || !this.noiseBuffer) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const biq = ctx.createBiquadFilter();
    biq.type = filter;
    biq.frequency.setValueAtTime(f0, t);
    biq.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    biq.Q.value = filter === 'bandpass' ? 1.5 : 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(biq);
    biq.connect(g);
    g.connect(this.master!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  jump(double = false): void {
    if (double) this.tone(420, 980, 0.14, 'square', 0.08);
    else this.tone(260, 620, 0.12, 'square', 0.08);
  }
  land(): void { this.noise(0.08, 0.12, 'lowpass', 600, 120); }
  light(): void { this.noise(0.07, 0.18, 'highpass', 3000, 1200); }
  heavy(): void {
    this.noise(0.22, 0.22, 'bandpass', 600, 2400);
    this.tone(140, 70, 0.18, 'triangle', 0.12);
  }
  special(kind: 'judge' | 'rocket' | 'vanish' | 'generic' = 'generic'): void {
    if (kind === 'judge') {
      this.tone(1320, 1320, 0.05, 'square', 0.08);
      this.tone(990, 990, 0.05, 'square', 0.08, 0.07);
    } else if (kind === 'rocket') {
      this.tone(180, 900, 0.35, 'sawtooth', 0.09);
      this.noise(0.35, 0.15, 'bandpass', 400, 3000);
    } else if (kind === 'vanish') {
      this.noise(0.25, 0.18, 'highpass', 6000, 800);
      this.tone(1600, 400, 0.2, 'sine', 0.07);
    } else {
      this.tone(500, 1000, 0.15, 'triangle', 0.1);
    }
  }
  judgeNumber(n: number): void {
    for (let i = 0; i < Math.min(n, 9); i++) this.tone(880 + n * 40, 880 + n * 40, 0.035, 'square', 0.05, i * 0.045);
  }
  charge(): void { this.tone(300, 600, 0.06, 'sawtooth', 0.03); }
  dodge(): void { this.noise(0.16, 0.1, 'bandpass', 3000, 800); }
  hit(strength: number): void {
    const s = Math.min(1, strength / 2000);
    this.noise(0.08 + s * 0.2, 0.25 + s * 0.25, 'lowpass', 5000, 300);
    this.tone(220 - s * 120, 50, 0.1 + s * 0.2, 'sine', 0.3 + s * 0.2);
    if (s > 0.6) this.tone(1800, 600, 0.15, 'square', 0.05);
  }
  ko(): void {
    this.noise(1.1, 0.45, 'lowpass', 3000, 60);
    this.tone(400, 40, 0.9, 'sawtooth', 0.15);
    this.tone(90, 30, 1.0, 'sine', 0.4);
  }
  menuMove(): void { this.tone(880, 880, 0.04, 'square', 0.05); }
  menuSelect(): void {
    this.tone(660, 660, 0.06, 'square', 0.07);
    this.tone(990, 990, 0.1, 'square', 0.07, 0.06);
  }
  menuBack(): void { this.tone(520, 300, 0.1, 'square', 0.06); }
  countdown(): void { this.tone(440, 440, 0.18, 'square', 0.1); }
  go(): void {
    this.tone(880, 880, 0.35, 'square', 0.1);
    this.tone(1320, 1320, 0.35, 'triangle', 0.08);
  }
  victory(): void {
    const notes = [523, 659, 784, 1047, 784, 1047];
    const times = [0, 0.12, 0.24, 0.36, 0.56, 0.68];
    notes.forEach((n, i) => this.tone(n, n, i === notes.length - 1 ? 0.6 : 0.14, 'square', 0.08, times[i]));
    notes.forEach((n, i) => this.tone(n / 2, n / 2, 0.14, 'triangle', 0.06, times[i]));
  }
  gameSet(): void {
    this.tone(784, 784, 0.15, 'square', 0.1);
    this.tone(523, 523, 0.5, 'square', 0.1, 0.15);
    this.noise(0.6, 0.2, 'lowpass', 2000, 100);
  }
}

export const sound = new SoundManager();
