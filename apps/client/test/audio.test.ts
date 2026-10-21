import { describe, expect, it } from 'vitest';
import { STAGE_ORDER } from '@arena-rush/shared';
import {
  AUDIO_STORAGE_KEY, channelGains, DEFAULT_AUDIO, LEGACY_MUTE_KEY, loadAudioSettings, saveAudioSettings,
} from '../src/audio/settings';
import { chordMidis, midiToHz, noteToMidi, parseMelody, stageTrack, TRACKS } from '../src/audio/tracks';

function memStore(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

describe('audio settings', () => {
  it('defaults to audible, unmuted levels', () => {
    const s = loadAudioSettings(memStore());
    expect(s).toEqual(DEFAULT_AUDIO);
    expect(s.muted).toBe(false);
    const g = channelGains(s);
    expect(g.combat).toBeGreaterThan(0.4);
    expect(g.music).toBeGreaterThan(0.1);
    expect(g.music).toBeLessThan(g.combat);
  });

  it('round-trips through storage', () => {
    const store = memStore();
    saveAudioSettings({ master: 0.3, music: 0, sfx: 1, muted: true }, store);
    expect(loadAudioSettings(store)).toEqual({ master: 0.3, music: 0, sfx: 1, muted: true });
  });

  it('ignores and clears the legacy mute flag that kept audio silent', () => {
    const store = memStore({ [LEGACY_MUTE_KEY]: '1' });
    expect(loadAudioSettings(store).muted).toBe(false);
    expect(store.data.has(LEGACY_MUTE_KEY)).toBe(false);
  });

  it('survives corrupt or out-of-range values', () => {
    expect(loadAudioSettings(memStore({ [AUDIO_STORAGE_KEY]: '{oops' }))).toEqual(DEFAULT_AUDIO);
    const s = loadAudioSettings(memStore({ [AUDIO_STORAGE_KEY]: JSON.stringify({ master: 7, music: -1, sfx: 'x', muted: 'yes' }) }));
    expect(s).toEqual({ master: 1, music: 0, sfx: DEFAULT_AUDIO.sfx, muted: false });
    expect(loadAudioSettings(null)).toEqual(DEFAULT_AUDIO);
  });

  it('mute and zero volumes silence every channel', () => {
    expect(Object.values(channelGains({ ...DEFAULT_AUDIO, muted: true }))).toEqual([0, 0, 0, 0]);
    expect(channelGains({ ...DEFAULT_AUDIO, master: 0 }).combat).toBe(0);
    expect(channelGains({ ...DEFAULT_AUDIO, music: 0 }).music).toBe(0);
    expect(channelGains({ ...DEFAULT_AUDIO, music: 0 }).combat).toBeGreaterThan(0);
  });
});

describe('music tracks', () => {
  it('parses notes', () => {
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('A#2')).toBe(46);
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(chordMidis('A2', 'min')).toEqual([45, 48, 52]);
    expect(() => noteToMidi('H2')).toThrow();
  });

  it('parses melodies with holds and rests', () => {
    const m = parseMelody('E5 - . G5 - -');
    expect(m.length).toBe(6);
    expect(m.notes).toEqual([{ at: 0, len: 2, midi: 76 }, { at: 3, len: 3, midi: 79 }]);
  });

  it('every track is well formed', () => {
    for (const [id, t] of Object.entries(TRACKS)) {
      const m = parseMelody(t.lead);
      expect(m.length, id).toBe(t.chords.length * 8);
      for (const lane of [t.bass, t.kick, t.snare, t.hat]) expect(lane.length, id).toBe(16);
      t.chords.forEach(([root]) => expect(() => noteToMidi(root)).not.toThrow());
      expect(t.bpm).toBeGreaterThan(60);
    }
  });

  it('every stage has its own battle track', () => {
    const titles = new Set<string>();
    for (const stage of STAGE_ORDER) {
      const t = TRACKS[stageTrack(stage)];
      expect(t, stage).toBeDefined();
      titles.add(t.title);
    }
    expect(titles.size).toBe(STAGE_ORDER.length);
    for (const id of ['menu', 'select', 'stageSelect', 'results'] as const) expect(TRACKS[id]).toBeDefined();
  });
});
