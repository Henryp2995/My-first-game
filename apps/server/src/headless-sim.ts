/**
 * Placeholder for the multiplayer server.
 *
 * Runs a full CPU-vs-CPU match of the shared simulation in Node. This proves the gameplay code
 * (including the CPU opponent) is renderer-independent; in Phase 3 the same `stepMatch` loop will
 * run inside a Colyseus room at 60 Hz, fed by client InputFrames.
 *
 * Usage: npm run sim [-- <fighter1> <fighter2> <difficulty1> <difficulty2>]
 */
import {
  CPU_DIFFICULTIES, CpuController, createMatch, FIGHTERS, FIGHTER_ORDER, standings, stepMatch,
  type CpuDifficulty, type FighterId,
} from '@arena-rush/shared';

const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
const args = process.argv.slice(2);
const fighters = [args[0] ?? pick(FIGHTER_ORDER), args[1] ?? pick(FIGHTER_ORDER)] as FighterId[];
const levels = [args[2] ?? 'normal', args[3] ?? 'normal'] as CpuDifficulty[];
for (const f of fighters) if (!FIGHTERS[f]) throw new Error(`Unknown fighter "${f}" (use ${FIGHTER_ORDER.join(', ')})`);
for (const d of levels) if (!CPU_DIFFICULTIES.includes(d)) throw new Error(`Unknown difficulty "${d}" (use ${CPU_DIFFICULTIES.join(', ')})`);

const seed = Date.now() >>> 0;
const match = createMatch(fighters.map((fighter) => ({ fighter })), { seed });
const cpus = fighters.map((_, i) => new CpuController(i, levels[i], seed + i));
let hits = 0;
let kos = 0;
const start = performance.now();
while (match.phase !== 'ended') {
  const events = stepMatch(match, cpus.map((c) => c.decide(match)));
  for (const e of events) {
    if (e.type === 'hit') hits++;
    if (e.type === 'ko') kos++;
  }
}
const ms = performance.now() - start;

console.log(`Headless match: ${fighters.map((f, i) => `${FIGHTERS[f].name} (CPU ${levels[i]})`).join(' vs ')}`);
console.log(`Simulated ${match.frame} frames (${(match.frame / 60).toFixed(1)}s of game time) in ${ms.toFixed(0)} ms`);
console.log(`Hits: ${hits}, KOs: ${kos}, ended by: ${match.endReason}`);
standings(match).forEach((f, i) => {
  console.log(`  #${i + 1} CPU${f.id + 1} ${FIGHTERS[f.fighter].name} — stocks ${f.stocks}, ${Math.round(f.damage)}%, KOs ${f.stats.kos}`);
});
