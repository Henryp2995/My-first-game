/** Persisted audio settings. Pure logic (no Web Audio) so it can be unit-tested. */
export interface AudioSettings {
  /** 0..1 */
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}

/** Audible but comfortable defaults. */
export const DEFAULT_AUDIO: AudioSettings = { master: 0.85, music: 0.55, sfx: 0.9, muted: false };

export const AUDIO_STORAGE_KEY = 'arena-rush:audio';
/** The old mute-only key; a stale value here silently muted every later session. */
export const LEGACY_MUTE_KEY = 'arena-rush:muted';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function storage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export const clampVolume = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

export function loadAudioSettings(store: StorageLike | null = storage()): AudioSettings {
  if (!store) return { ...DEFAULT_AUDIO };
  try {
    // Drop the legacy key instead of honoring it: it is how audio "stopped working" for good.
    store.removeItem(LEGACY_MUTE_KEY);
    const raw = store.getItem(AUDIO_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AUDIO };
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      master: clampVolume(parsed.master, DEFAULT_AUDIO.master),
      music: clampVolume(parsed.music, DEFAULT_AUDIO.music),
      sfx: clampVolume(parsed.sfx, DEFAULT_AUDIO.sfx),
      muted: parsed.muted === true,
    };
  } catch {
    return { ...DEFAULT_AUDIO };
  }
}

export function saveAudioSettings(s: AudioSettings, store: StorageLike | null = storage()): void {
  try {
    store?.setItem(AUDIO_STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode etc.) — settings just won't persist */
  }
}

/** Effective linear gains for each channel. Menu, combat and ambient sounds all follow the SFX slider. */
export function channelGains(s: AudioSettings): { music: number; combat: number; ui: number; ambient: number } {
  if (s.muted) return { music: 0, combat: 0, ui: 0, ambient: 0 };
  // Perceptual curve: slider position → gain (squared feels linear to the ear).
  const curve = (v: number) => v * v;
  const m = curve(s.master);
  return {
    music: m * curve(s.music),
    combat: m * curve(s.sfx),
    ui: m * curve(s.sfx),
    ambient: m * curve(s.sfx) * 0.6,
  };
}
