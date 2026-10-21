import { describe, expect, it } from 'vitest';
import {
  CPU_DIFFICULTIES, CPU_PROFILES, CpuController, createMatch, emptyInput, makeRules, stepMatch,
  type CpuDifficulty, type FighterId, type InputFrame, type MatchState,
} from '../src';
import { setupMatch } from './helpers';

/** Runs `frames` frames with P1 driven by `p1` and P2 by a CPU. Returns the CPU's per-frame inputs. */
function runVsCpu(m: MatchState, cpu: CpuController, frames: number, p1: (i: number) => InputFrame = () => emptyInput()) {
  const log: InputFrame[] = [];
  for (let i = 0; i < frames && m.phase !== 'ended'; i++) {
    const cpuInput = cpu.decide(m);
    log.push(cpuInput);
    stepMatch(m, [p1(i), cpuInput]);
  }
  return log;
}

describe('CPU opponent', () => {
  it('only produces InputFrames (same interface as a human player)', () => {
    const m = setupMatch(['luigi', 'sheik']);
    const cpu = new CpuController(1, 'normal');
    const input = cpu.decide(m);
    expect(Object.keys(input).sort()).toEqual(Object.keys(emptyInput()).sort());
  });

  it('walks toward an idle player', () => {
    const m = setupMatch(['luigi', 'sheik']);
    const before = Math.abs(m.fighters[1].x - m.fighters[0].x);
    runVsCpu(m, new CpuController(1, 'hard'), 90);
    expect(Math.abs(m.fighters[1].x - m.fighters[0].x)).toBeLessThan(before - 200);
  });

  it('releases attack buttons between presses (sim needs press edges)', () => {
    const m = setupMatch(['luigi', 'gnw']);
    const log = runVsCpu(m, new CpuController(1, 'expert'), 900);
    let presses = 0;
    for (let i = 1; i < log.length; i++) {
      for (const b of ['light', 'heavy'] as const) {
        expect(log[i][b] && log[i - 1][b]).toBe(false);
        if (log[i][b]) presses++;
      }
    }
    expect(presses).toBeGreaterThan(5);
  });

  for (const difficulty of CPU_DIFFICULTIES) {
    it(`${difficulty} CPU damages an idle player`, () => {
      const m = setupMatch(['luigi', 'sheik']);
      runVsCpu(m, new CpuController(1, difficulty, 3), 60 * 30);
      expect(m.fighters[0].damage + (3 - m.fighters[0].stocks) * 100).toBeGreaterThan(10);
    });
  }

  it('each difficulty beats the one below it in most matchups', () => {
    const fighters: FighterId[] = ['gnw', 'luigi', 'sheik'];
    for (let k = 1; k < CPU_DIFFICULTIES.length; k++) {
      const lower = CPU_DIFFICULTIES[k - 1];
      const higher = CPU_DIFFICULTIES[k];
      let wins = 0;
      let games = 0;
      for (const a of fighters) {
        for (const b of fighters) {
          const m = createMatch([{ fighter: a }, { fighter: b }], { rules: makeRules({ countdownFrames: 0 }), seed: 1 });
          const cpus = [new CpuController(0, lower, 1), new CpuController(1, higher, 51)];
          while (m.phase !== 'ended') stepMatch(m, cpus.map((c) => c.decide(m)));
          games++;
          if (m.winner === 1) wins++;
        }
      }
      expect(wins, `${higher} vs ${lower}`).toBeGreaterThanOrEqual(Math.ceil(games * 0.6));
    }
  });

  for (const fighter of ['gnw', 'luigi', 'sheik'] as FighterId[]) {
    it(`${fighter} CPU recovers to the stage after being knocked off`, () => {
      const m = setupMatch(['luigi', fighter]);
      const f = m.fighters[1];
      f.x = 640;
      f.y = 40;
      f.vx = 300;
      f.grounded = false;
      f.action = 'air';
      f.jumpsUsed = 1;
      m.fighters[0].x = -300;
      const cpu = new CpuController(1, 'hard');
      let landed = false;
      for (let i = 0; i < 240 && !landed; i++) {
        stepMatch(m, [emptyInput(), cpu.decide(m)]);
        landed = f.grounded;
      }
      expect(landed).toBe(true);
      expect(f.stocks).toBe(3);
    });
  }

  it('Easy and Expert both finish full CPU-vs-CPU matches', () => {
    for (const [a, b] of [['easy', 'expert'], ['expert', 'expert']] as CpuDifficulty[][]) {
      const m = createMatch([{ fighter: 'sheik' }, { fighter: 'gnw' }], { rules: makeRules({ countdownFrames: 0 }), seed: 9 });
      const cpus = [new CpuController(0, a, 1), new CpuController(1, b, 2)];
      for (let i = 0; i < 5 * 60 * 60 + 10 && m.phase !== 'ended'; i++) stepMatch(m, cpus.map((c) => c.decide(m)));
      expect(m.phase).toBe('ended');
    }
  });

  it('Expert beats Easy most of the time', () => {
    let expertWins = 0;
    const fighters: FighterId[] = ['gnw', 'luigi', 'sheik'];
    for (const f of fighters) {
      const m = createMatch([{ fighter: f }, { fighter: f }], { rules: makeRules({ countdownFrames: 0 }), seed: 4 });
      const cpus = [new CpuController(0, 'easy', 11), new CpuController(1, 'expert', 12)];
      for (let i = 0; i < 5 * 60 * 60 + 10 && m.phase !== 'ended'; i++) stepMatch(m, cpus.map((c) => c.decide(m)));
      if (m.winner === 1) expertWins++;
    }
    expect(expertWins).toBeGreaterThanOrEqual(2);
  });
});

describe('CPU fairness', () => {
  for (const difficulty of CPU_DIFFICULTIES) {
    it(`${difficulty} CPU caps jab strings so a stunned player gets a breather`, () => {
      const cap = CPU_PROFILES[difficulty].maxJabChain;
      for (const fighter of ['gnw', 'luigi', 'sheik'] as FighterId[]) {
        for (const seed of [1, 2, 3]) {
          const m = setupMatch(['luigi', fighter], { stocks: 99 });
          m.fighters[0].x = -60;
          m.fighters[1].x = 0;
          const cpu = new CpuController(1, difficulty, seed);
          // A "pressure run" lasts until the player gets 15 straight free frames (~human reaction time).
          let free = 0;
          let jabs = 0;
          let worst = 0;
          for (let i = 0; i < 60 * 20; i++) {
            for (const e of stepMatch(m, [emptyInput(), cpu.decide(m)])) {
              if (e.type === 'attack' && e.id === 1 && (e.slot === 'light' || e.slot === 'aerial')) jabs++;
            }
            const p = m.fighters[0];
            free = p.action === 'hitstun' || p.hitstop > 0 ? 0 : free + 1;
            if (free >= 15 || p.action === 'dead') jabs = 0;
            worst = Math.max(worst, jabs);
          }
          expect(worst, `${fighter} @ ${difficulty}, seed ${seed}`).toBeLessThanOrEqual(cap + 1);
        }
      }
    });
  }
});
