import { describe, expect, it } from 'vitest';
import {
  createMatch, decodeInput, DEFAULT_RULES, encodeInput, makeInput, standings, stepMatch,
} from '../src';
import { run, setupMatch } from './helpers';

function knockOut(m: ReturnType<typeof setupMatch>, idx: number) {
  const f = m.fighters[idx];
  f.x = m.stage.blastZone.right + 50;
  f.grounded = false;
  f.action = 'air';
  return run(m, 1);
}

describe('stocks and respawning', () => {
  it('starts with three stocks', () => {
    const m = setupMatch();
    expect(m.fighters.every((f) => f.stocks === 3)).toBe(true);
  });

  it('loses a stock when leaving the blast zone and credits the attacker', () => {
    const m = setupMatch();
    m.fighters[1].lastHitBy = 0;
    const ev = knockOut(m, 1);
    expect(ev.some((e) => e.type === 'ko' && e.id === 1 && e.by === 0)).toBe(true);
    expect(m.fighters[1].stocks).toBe(2);
    expect(m.fighters[1].action).toBe('dead');
    expect(m.fighters[0].stats.kos).toBe(1);
  });

  it('respawns with 0% on the respawn platform, then gets invulnerability after leaving', () => {
    const m = setupMatch();
    const f = m.fighters[1];
    f.damage = 87;
    knockOut(m, 1);
    const ev = run(m, DEFAULT_RULES.respawnDelayFrames + 1);
    expect(ev.some((e) => e.type === 'respawn' && e.id === 1)).toBe(true);
    expect(f.action).toBe('respawning');
    expect(f.damage).toBe(0);
    const pos = { x: f.x, y: f.y };
    run(m, 30);
    expect({ x: f.x, y: f.y }).toEqual(pos); // hovers
    run(m, 1, [makeInput(), makeInput({ right: true })]);
    expect(f.action).toBe('air');
    expect(f.invuln).toBeGreaterThan(0);
  });

  it('respawn platform times out automatically', () => {
    const m = setupMatch();
    const f = m.fighters[1];
    knockOut(m, 1);
    run(m, DEFAULT_RULES.respawnDelayFrames + DEFAULT_RULES.respawnHoverFrames + 5);
    expect(f.action).not.toBe('respawning');
  });

  it('is eliminated after losing all stocks', () => {
    const m = setupMatch(['luigi', 'luigi', 'sheik']);
    for (let s = 0; s < 3; s++) {
      knockOut(m, 1);
      run(m, DEFAULT_RULES.respawnDelayFrames + 2);
    }
    expect(m.fighters[1].stocks).toBe(0);
    expect(m.fighters[1].eliminated).toBe(true);
    expect(m.phase).toBe('playing'); // two players remain
  });
});

describe('winner detection', () => {
  it('declares the last fighter standing the winner', () => {
    const m = setupMatch();
    let ev: ReturnType<typeof run> = [];
    for (let s = 0; s < 3; s++) {
      ev = knockOut(m, 0);
      run(m, DEFAULT_RULES.respawnDelayFrames + 2);
    }
    expect(m.phase).toBe('ended');
    expect(m.winner).toBe(1);
    expect(m.endReason).toBe('stocks');
    expect(ev.some((e) => e.type === 'matchEnd' && e.winner === 1)).toBe(true);
    expect(standings(m)[0].id).toBe(1);
  });

  it('on time out, more stocks wins', () => {
    const m = setupMatch(['gnw', 'sheik'], { matchFrames: 300 });
    knockOut(m, 0);
    run(m, 400);
    expect(m.phase).toBe('ended');
    expect(m.endReason).toBe('time');
    expect(m.winner).toBe(1);
  });

  it('on time out with equal stocks, lower damage wins; exact tie is a draw', () => {
    const m = setupMatch(['gnw', 'sheik'], { matchFrames: 60 });
    m.fighters[0].damage = 50;
    m.fighters[1].damage = 20;
    run(m, 70);
    expect(m.winner).toBe(1);

    const t = setupMatch(['gnw', 'sheik'], { matchFrames: 60 });
    run(t, 70);
    expect(t.phase).toBe('ended');
    expect(t.winner).toBeNull();
  });

  it('defaults to a five minute match', () => {
    expect(DEFAULT_RULES.matchFrames).toBe(5 * 60 * 60);
  });
});

describe('countdown and determinism', () => {
  it('runs a 3-2-1-GO countdown before play', () => {
    const m = createMatch([{ fighter: 'gnw' }, { fighter: 'luigi' }]);
    const values: number[] = [];
    for (let i = 0; i < DEFAULT_RULES.countdownFrames; i++) {
      for (const e of stepMatch(m, [makeInput({ right: true }), makeInput()])) {
        if (e.type === 'countdown') values.push(e.value);
      }
    }
    expect(values).toEqual([3, 2, 1, 0]);
    expect(m.phase).toBe('playing');
    expect(m.fighters[0].x).toBe(m.stage.spawns[0].x); // frozen during countdown
  });

  it('same seed + same inputs = same result (server-authoritative ready)', () => {
    const play = () => {
      const m = setupMatch(['gnw', 'luigi'], {}, 99);
      run(m, 600, (i) => [
        makeInput({ right: i % 90 < 45, light: i % 13 === 0, special: i % 200 === 0 }),
        makeInput({ left: i % 70 < 35, heavy: i % 31 === 0, jump: i % 50 === 0 }),
      ]);
      return JSON.stringify(m.fighters.map((f) => [f.x, f.y, f.damage, f.stocks]));
    };
    expect(play()).toBe(play());
  });

  it('round-trips inputs through the compact network encoding', () => {
    const input = makeInput({ left: true, heavy: true, dodge: true });
    expect(decodeInput(encodeInput(input))).toEqual(input);
  });
});
