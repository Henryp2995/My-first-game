/** Deterministic mulberry32 RNG whose whole state is a single uint32 (easy to sync/snapshot). */
export function nextRandom(state: { rngState: number }): number {
  let t = (state.rngState = (state.rngState + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(state: { rngState: number }, min: number, max: number): number {
  return min + Math.floor(nextRandom(state) * (max - min + 1));
}
