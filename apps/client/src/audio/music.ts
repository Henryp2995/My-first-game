/**
 * Single-track music player for the synthesized tracks in tracks.ts. Shares the SoundManager's
 * AudioContext and plays on its music bus, so the volume settings apply.
 *
 * Guarantees only one track is ever scheduling notes: `play()` stops the current sequencer
 * immediately and fades out what it had already queued while the new one fades in.
 */
import { sound, type AudioHandle } from './sound';
import { chordMidis, midiToHz, noteToMidi, parseMelody, TRACKS, type MelodyNote, type Track, type TrackId } from './tracks';

const LOOKAHEAD = 0.15;
const TICK_MS = 25;
const FADE = 0.6;

interface Playing {
  id: TrackId;
  track: Track;
  melody: { notes: MelodyNote[]; length: number };
  gain: GainNode;
  /** Pause duck: a lowpass + gain stage between track and bus. */
  duck: BiquadFilterNode;
  step: number;
  nextTime: number;
  timer: number;
}

class MusicPlayer {
  private current: Playing | null = null;
  private wanted: TrackId | null = null;
  private ducked = false;

  /** The track that is (or will be, once audio unlocks) playing. */
  get trackId(): TrackId | null {
    return this.wanted;
  }

  /** Start a track, crossfading from the current one. No-op if it is already playing. */
  play(id: TrackId): void {
    if (this.wanted === id && (this.current?.id === id || !sound.unlocked)) return;
    this.wanted = id;
    sound.whenUnlocked(() => {
      if (this.wanted === id && this.current?.id !== id) this.start(id);
    });
  }

  stop(fade = FADE): void {
    this.wanted = null;
    this.release(fade);
  }

  /** Muffle the music (pause menus). */
  duck(on: boolean): void {
    this.ducked = on;
    const p = this.current;
    const a = sound.handle('music');
    if (!p || !a) return;
    const t = a.ctx.currentTime;
    p.duck.frequency.setTargetAtTime(on ? 700 : 20000, t, 0.08);
    p.gain.gain.setTargetAtTime(on ? 0.5 : 1, t, 0.08);
  }

  private release(fade: number): void {
    const p = this.current;
    this.current = null;
    if (!p) return;
    window.clearInterval(p.timer);
    const a = sound.handle('music');
    if (!a) return;
    const t = a.ctx.currentTime;
    p.gain.gain.cancelScheduledValues(t);
    p.gain.gain.setValueAtTime(p.gain.gain.value, t);
    p.gain.gain.linearRampToValueAtTime(0, t + fade);
    window.setTimeout(() => p.gain.disconnect(), (fade + LOOKAHEAD + 0.5) * 1000);
  }

  private start(id: TrackId): void {
    const a = sound.handle('music');
    if (!a) return;
    this.release(FADE);
    const track = TRACKS[id];
    const gain = a.ctx.createGain();
    const duck = a.ctx.createBiquadFilter();
    duck.type = 'lowpass';
    duck.frequency.value = this.ducked ? 700 : 20000;
    gain.connect(duck);
    duck.connect(a.out);
    const t = a.ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(this.ducked ? 0.5 : 1, t + FADE);
    const p: Playing = {
      id, track, melody: parseMelody(track.lead), gain, duck, step: 0, nextTime: t + 0.05, timer: 0,
    };
    p.timer = window.setInterval(() => this.schedule(p, a), TICK_MS);
    this.current = p;
    this.schedule(p, a);
  }

  private schedule(p: Playing, a: AudioHandle): void {
    if (this.current !== p) return;
    const stepDur = 60 / p.track.bpm / 4;
    // After a long stall (suspended tab etc.) skip ahead instead of firing a burst of notes.
    if (p.nextTime < a.ctx.currentTime - 0.1) p.nextTime = a.ctx.currentTime + 0.05;
    while (p.nextTime < a.ctx.currentTime + LOOKAHEAD) {
      this.playStep(p, a, p.step, p.nextTime, stepDur);
      p.step++;
      p.nextTime += stepDur;
    }
  }

  private playStep(p: Playing, a: AudioHandle, step: number, t: number, stepDur: number): void {
    const tr = p.track;
    const bars = tr.chords.length;
    const s = step % 16;
    const bar = Math.floor(step / 16) % bars;
    const [root, quality] = tr.chords[bar];
    const chord = chordMidis(root, quality);

    // Lead (8th-note grid)
    if (s % 2 === 0) {
      const eighth = (step / 2) % p.melody.length;
      const note = p.melody.notes.find((n) => n.at === eighth);
      if (note) this.osc(a, p, tr.leadWave, midiToHz(note.midi), t, note.len * 2 * stepDur * 0.92, tr.leadWave === 'triangle' ? 0.16 : 0.07);
    }
    // Bass
    const b = tr.bass[s];
    if (b && b !== '.') {
      const midi = noteToMidi(root) - 12 + (b === 'o' ? 12 : b === 'f' ? 7 : 0);
      const vol = tr.bassWave === 'sawtooth' ? 0.09 : 0.22;
      this.osc(a, p, tr.bassWave, midiToHz(midi), t, stepDur * 1.6, vol, tr.bassWave === 'sawtooth' ? 900 : undefined);
    }
    // Pad: once per bar, sustained.
    if (tr.pad > 0 && s === 0) {
      for (const m of chord) this.osc(a, p, 'triangle', midiToHz(m + 12), t, stepDur * 15.5, tr.pad, undefined, 0.25);
    }
    // Drums
    if (tr.kick[s] === 'x') this.kick(a, p, t);
    if (tr.snare[s] === 'x') this.hiss(a, p, t, 0.14, 0.28, 'bandpass', 1800);
    if (tr.hat[s] === 'x') this.hiss(a, p, t, 0.035, 0.1, 'highpass', 7000);
  }

  private osc(
    a: AudioHandle, p: Playing, type: OscillatorType, hz: number, t: number, dur: number, vol: number, cutoff?: number, attack = 0.01,
  ): void {
    const o = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    o.type = type;
    o.frequency.value = hz;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (cutoff) {
      const f = a.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      o.connect(f);
      f.connect(g);
    } else {
      o.connect(g);
    }
    g.connect(p.gain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private kick(a: AudioHandle, p: Playing, t: number): void {
    const o = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.45, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g);
    g.connect(p.gain);
    o.start(t);
    o.stop(t + 0.18);
  }

  private hiss(a: AudioHandle, p: Playing, t: number, dur: number, vol: number, type: BiquadFilterType, hz: number): void {
    const src = a.ctx.createBufferSource();
    src.buffer = a.noise;
    const f = a.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = hz;
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(p.gain);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }
}

export const music = new MusicPlayer();
