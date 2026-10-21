/**
 * Original procedural music, written as data for the sequencer in music.ts. Every melody,
 * progression and drum pattern here was composed for Arena Rush — no samples, no covers.
 * Pure data + helpers (no Web Audio) so it can be unit-tested.
 *
 * Timing: 16 steps per bar (16th notes). Melodies use one token per 8th note:
 *   "E5" = note, "." = rest, "-" = hold the previous note.
 */
import type { StageId } from '@arena-rush/shared';

export type TrackId = 'menu' | 'select' | 'stageSelect' | 'results' | `stage:${StageId}`;

export interface Track {
  title: string;
  bpm: number;
  /** One chord per bar: root note name + quality. */
  chords: [root: string, quality: 'maj' | 'min'][];
  /** Melody, 8 tokens per bar, length = chords.length * 8. */
  lead: string;
  leadWave: OscillatorType;
  /** Bass rhythm over one bar (16 chars): r = root, o = octave up, f = fifth, . = rest. */
  bass: string;
  bassWave: OscillatorType;
  /** 16-char drum lanes, x = hit. */
  kick: string;
  snare: string;
  hat: string;
  /** Sustained chord pad under everything (0 = none). */
  pad: number;
}

export const TRACKS: Record<TrackId, Track> = {
  menu: {
    title: 'Rush Hour',
    bpm: 128,
    chords: [['C3', 'maj'], ['A2', 'min'], ['F2', 'maj'], ['G2', 'maj']],
    lead: 'E5 . G5 . C6 - G5 E5  A5 . E5 . C5 - E5 A5  C6 . A5 . F5 - A5 C6  B5 - D6 - G5 . . .',
    leadWave: 'square',
    bass: 'r.r.o.r.r.r.o.f.',
    bassWave: 'triangle',
    kick: 'x...x...x...x...',
    snare: '....x.......x...',
    hat: '..x...x...x...xx',
    pad: 0,
  },
  select: {
    title: 'Choose Wisely',
    bpm: 116,
    chords: [['F2', 'maj'], ['D2', 'min'], ['A#2', 'maj'], ['C3', 'maj']],
    lead: 'F5 . A5 C6 - . A5 .  D5 . F5 A5 - . F5 .  D5 . F5 A#5 - . A5 G5  E5 - G5 - C5 . . .',
    leadWave: 'triangle',
    bass: 'r..r..o.r..r.f..',
    bassWave: 'triangle',
    kick: 'x......xx.......',
    snare: '....x.......x...',
    hat: 'x.x.x.x.x.x.x.x.',
    pad: 0.05,
  },
  stageSelect: {
    title: 'Pick a Battlefield',
    bpm: 108,
    chords: [['G2', 'maj'], ['F2', 'maj'], ['C3', 'maj'], ['G2', 'maj']],
    lead: 'B4 D5 G5 . D5 . B4 .  A4 C5 F5 . C5 . A4 .  G4 C5 E5 . G5 . E5 .  D5 - B4 - G4 . . .',
    leadWave: 'triangle',
    bass: 'r...f...o...f...',
    bassWave: 'triangle',
    kick: 'x.......x.......',
    snare: '....x.......x...',
    hat: '..x...x...x...x.',
    pad: 0.05,
  },
  results: {
    title: 'After the Dust',
    bpm: 96,
    chords: [['C3', 'maj'], ['G2', 'maj'], ['A2', 'min'], ['F2', 'maj']],
    lead: 'E5 - - G5 - - E5 -  D5 - - G5 - - B4 -  C5 - - E5 - - A5 -  A5 - G5 - F5 - - .',
    leadWave: 'triangle',
    bass: 'r.......f.......',
    bassWave: 'sine',
    kick: 'x.......x.......',
    snare: '........x.......',
    hat: '....x.......x...',
    pad: 0.06,
  },
  'stage:skyfall': {
    title: 'Above the Clouds',
    bpm: 150,
    chords: [['D3', 'min'], ['A#2', 'maj'], ['C3', 'maj'], ['A2', 'maj']],
    lead: 'D5 F5 A5 F5 D6 . A5 .  D5 F5 A#5 F5 D6 . A#5 .  E5 G5 C6 G5 E6 . C6 .  C#6 - A5 - E5 - C#5 .',
    leadWave: 'square',
    bass: 'rorororororororo',
    bassWave: 'sawtooth',
    kick: 'x...x...x...x...',
    snare: '....x.......x..x',
    hat: 'xxxxxxxxxxxxxxxx',
    pad: 0,
  },
  'stage:corneria': {
    title: 'Flagship Deck',
    bpm: 140,
    chords: [['E2', 'min'], ['C3', 'maj'], ['D3', 'maj'], ['B2', 'maj']],
    lead: 'E5 - - B4 E5 F#5 G5 -  G5 - E5 - C5 - E5 G5  A5 - F#5 - D5 - A5 -  F#5 - D#5 - B4 - . .',
    leadWave: 'sawtooth',
    bass: 'r.rr.rr.r.rr.ro.',
    bassWave: 'sawtooth',
    kick: 'x..x..x.x..x..x.',
    snare: '....x.......x...',
    hat: 'x.x.x.x.x.x.x.x.',
    pad: 0.04,
  },
  'stage:final': {
    title: 'Last Stand',
    bpm: 132,
    chords: [['A2', 'min'], ['F2', 'maj'], ['G2', 'maj'], ['E2', 'maj']],
    lead: 'A4 . C5 . E5 - D5 C5  A4 . C5 . F5 - E5 D5  B4 . D5 . G5 - F5 D5  G#5 - - - E5 - B4 .',
    leadWave: 'square',
    bass: 'r..r..r.r..r..o.',
    bassWave: 'sawtooth',
    kick: 'x..x..x.x.x...x.',
    snare: '....x.......x...',
    hat: '..x...x...x...x.',
    pad: 0.06,
  },
};

const NOTE_INDEX: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

/** "A4" → 69 (MIDI). */
export function noteToMidi(name: string): number {
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Bad note: ${name}`);
  return NOTE_INDEX[m[1]] + (Number(m[2]) + 1) * 12;
}

export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

export interface MelodyNote {
  /** 8th-note index where it starts. */
  at: number;
  /** Length in 8th notes. */
  len: number;
  midi: number;
}

export function parseMelody(src: string): { notes: MelodyNote[]; length: number } {
  const tokens = src.trim().split(/\s+/);
  const notes: MelodyNote[] = [];
  tokens.forEach((tok, i) => {
    if (tok === '.') return;
    if (tok === '-') {
      const prev = notes[notes.length - 1];
      if (prev && prev.at + prev.len === i) prev.len++;
      return;
    }
    notes.push({ at: i, len: 1, midi: noteToMidi(tok) });
  });
  return { notes, length: tokens.length };
}

export function chordMidis(root: string, quality: 'maj' | 'min'): number[] {
  const r = noteToMidi(root);
  return [r, r + (quality === 'maj' ? 4 : 3), r + 7];
}

/** Which track plays where. Training Mode (if added) should reuse its stage's battle track. */
export function stageTrack(stage: StageId): TrackId {
  return `stage:${stage}`;
}
