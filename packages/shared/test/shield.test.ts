import { describe, expect, it } from 'vitest';
import {
  CpuController, createMatch, DEFAULT_RULES, DT, emptyInput, FIGHTERS, getStage, makeInput, makeRules, stepMatch,
  type FighterId, type GameEvent, type InputFrame, type MatchState,
} from '../src';

const S = DEFAULT_RULES.shield;
const SHIELD = makeInput({ dodge: true });

function match(fighters: FighterId[] = ['luigi', 'luigi'], stage = 'final'): MatchState {
  return createMatch(fighters.map((fighter) => ({ fighter })), { rules: makeRules({ countdownFrames: 0 }), stage: getStage(stage), seed: 2 });
}

/** P0 attacks, P1 is the defender. */
function run(m: MatchState, frames: number, p0: InputFrame | ((i: number) => InputFrame) = emptyInput(), p1: InputFrame | ((i: number) => InputFrame) = emptyInput()): GameEvent[] {
  const ev: GameEvent[] = [];
  for (let i = 0; i < frames; i++) {
    ev.push(...stepMatch(m, [typeof p0 === 'function' ? p0(i) : p0, typeof p1 === 'function' ? p1(i) : p1]));
  }
  return ev;
}

function faceOff(m: MatchState, gap = 40): void {
  const [a, v] = m.fighters;
  a.x = -100;
  v.x = -100 + gap;
  a.facing = 1;
  v.facing = -1;
}

const once = (button: keyof InputFrame) => (i: number) => (i === 0 ? makeInput({ [button]: true }) : emptyInput());
const blocks = (ev: GameEvent[]) => ev.filter((e): e is Extract<GameEvent, { type: 'shieldHit' }> => e.type === 'shieldHit');

describe('activation', () => {
  it('holding the dodge button on the ground raises the shield; releasing drops it', () => {
    const m = match();
    const f = m.fighters[1];
    const ev = run(m, 10, emptyInput(), SHIELD);
    expect(ev.some((e) => e.type === 'shield' && e.id === 1 && e.up)).toBe(true);
    expect(f.action).toBe('shield');
    const off = run(m, 1);
    expect(off.some((e) => e.type === 'shield' && e.id === 1 && !e.up)).toBe(true);
    expect(f.action).toBe('shieldRelease');
    run(m, S.releaseFrames + 1);
    expect(f.action).toBe('idle');
  });

  it('a quick tap still shows the shield for a few frames', () => {
    const m = match();
    run(m, 1, emptyInput(), SHIELD);
    run(m, S.minFrames - 2);
    expect(m.fighters[1].action).toBe('shield');
  });

  it('keeps dodge + direction as a roll, dodge + down as a spot dodge, and air dodge in the air', () => {
    const roll = match();
    run(roll, 1, emptyInput(), makeInput({ dodge: true, right: true }));
    expect(roll.fighters[1].action).toBe('dodge');
    expect(roll.fighters[1].vx).toBeGreaterThan(0);
    const spot = match();
    run(spot, 1, emptyInput(), makeInput({ dodge: true, down: true }));
    expect(spot.fighters[1].action).toBe('dodge');
    expect(spot.fighters[1].vx).toBe(0);
    const air = match();
    air.fighters[1].y = -200;
    air.fighters[1].grounded = false;
    air.fighters[1].action = 'air';
    run(air, 1, emptyInput(), SHIELD);
    expect(air.fighters[1].action).toBe('dodge');
  });

  it('rolls or spot dodges out of a held shield', () => {
    const m = match();
    run(m, 10, emptyInput(), SHIELD);
    run(m, 1, emptyInput(), makeInput({ dodge: true, left: true }));
    expect(m.fighters[1].action).toBe('dodge');
    expect(m.fighters[1].vx).toBeLessThan(0);
  });

  it('can jump out of shield, but cannot attack out of it', () => {
    const m = match();
    run(m, 10, emptyInput(), SHIELD);
    const atk = run(m, 6, emptyInput(), (i) => makeInput({ dodge: true, light: i === 0, heavy: i === 3 }));
    expect(atk.some((e) => e.type === 'attack')).toBe(false);
    expect(m.fighters[1].action).toBe('shield');
    const jump = run(m, 2, emptyInput(), (i) => makeInput({ dodge: true, jump: i === 0 }));
    expect(jump.some((e) => e.type === 'jump' && e.id === 1)).toBe(true);
  });

  it('roots the fighter in place', () => {
    const m = match();
    run(m, 5, emptyInput(), SHIELD);
    const x = m.fighters[1].x;
    run(m, 30, emptyInput(), makeInput({ dodge: true }));
    expect(m.fighters[1].x).toBeCloseTo(x, 5);
  });
});

describe('durability', () => {
  it('drains while held, frame-rate independently (fixed timestep)', () => {
    const m = match();
    run(m, 60, emptyInput(), SHIELD);
    // 60 frames ≈ 1 s held (the first frame raises it).
    expect(m.fighters[1].shieldHp).toBeCloseTo(S.maxHealth - S.drainPerSecond * DT * 59, 5);
  });

  it('does not regenerate while held; regenerates after a delay once released, up to max', () => {
    const m = match();
    run(m, 120, emptyInput(), SHIELD);
    run(m, 1); // release (drains one last frame)
    const low = m.fighters[1].shieldHp;
    run(m, S.regenDelayFrames - 2);
    expect(m.fighters[1].shieldHp).toBeCloseTo(low, 5);
    run(m, 60);
    expect(m.fighters[1].shieldHp).toBeGreaterThan(low + S.regenPerSecond * 0.9);
    run(m, 60 * 10);
    expect(m.fighters[1].shieldHp).toBe(S.maxHealth);
  });

  it('respects a per-fighter max shield override', () => {
    const stats = FIGHTERS.batman.stats;
    stats.shieldMax = 140;
    try {
      const m = match(['luigi', 'batman']);
      expect(m.fighters[1].shieldHp).toBe(140);
    } finally {
      delete stats.shieldMax;
    }
  });
});

describe('blocking', () => {
  it('blocks a light attack: no damage, no hitstun, shield damage + shieldstun + pushback', () => {
    const m = match();
    faceOff(m);
    run(m, 3, emptyInput(), SHIELD);
    const v = m.fighters[1];
    const before = v.shieldHp;
    const x = v.x;
    const ev = run(m, 20, once('light'), SHIELD);
    const b = blocks(ev);
    expect(b.length).toBeGreaterThan(0);
    expect(ev.some((e) => e.type === 'hit')).toBe(false);
    expect(v.damage).toBe(0);
    expect(v.action).toBe('shield');
    const lightDmg = FIGHTERS.luigi.moves.light.hitboxes[0].damage;
    expect(b[0].shieldDamage).toBeCloseTo(lightDmg * S.damageMultiplier + S.damageBase, 5);
    expect(b[0].shieldDamage).toBeGreaterThanOrEqual(8);
    expect(b[0].shieldDamage).toBeLessThanOrEqual(12);
    expect(v.shieldHp).toBeLessThan(before - b[0].shieldDamage + 0.001);
    expect(v.x).toBeGreaterThan(x); // pushed away from the attacker
  });

  it('heavy attacks deal more shield damage than light ones', () => {
    const dmg = (slot: 'light' | 'heavy') => {
      const m = match();
      faceOff(m, slot === 'heavy' ? 50 : 40);
      run(m, 3, emptyInput(), SHIELD);
      return blocks(run(m, 40, once(slot), SHIELD))[0]?.shieldDamage ?? 0;
    };
    const light = dmg('light');
    const heavy = dmg('heavy');
    expect(heavy).toBeGreaterThan(light * 1.6);
    expect(heavy).toBeGreaterThanOrEqual(20);
    expect(heavy).toBeLessThanOrEqual(30);
  });

  it('a single-hit attack only damages the shield once', () => {
    const m = match(['batman', 'luigi']);
    faceOff(m, 50);
    run(m, 3, emptyInput(), SHIELD);
    const heavy = FIGHTERS.batman.moves.heavy;
    const groups = new Set(heavy.hitboxes.map((h) => h.group ?? 0)).size;
    expect(blocks(run(m, 50, once('heavy'), SHIELD)).length).toBe(groups);
  });

  it('blocks projectiles', () => {
    const m = match(['batman', 'luigi']);
    faceOff(m, 250);
    run(m, 3, emptyInput(), SHIELD);
    const ev = run(m, 60, once('special'), SHIELD);
    expect(blocks(ev).length).toBe(1);
    expect(ev.some((e) => e.type === 'hit' && e.victim === 1)).toBe(false);
    expect(m.fighters[1].damage).toBe(0);
  });

  it('does not stop attacks that bypass shields (Force Choke)', () => {
    const m = match(['vader', 'luigi']);
    faceOff(m, 110);
    run(m, 3, emptyInput(), SHIELD);
    const ev = run(m, 60, once('special'), SHIELD);
    expect(ev.some((e) => e.type === 'hit' && e.victim === 1)).toBe(true);
    expect(blocks(ev).length).toBe(0);
  });

  it('shieldstun locks the shield up until it ends', () => {
    const m = match(['gnw', 'luigi']);
    faceOff(m, 50);
    run(m, 3, emptyInput(), SHIELD);
    let stun = 0;
    for (let i = 0; i < 40 && stun === 0; i++) {
      const ev = stepMatch(m, [i === 0 ? makeInput({ heavy: true }) : emptyInput(), SHIELD]);
      if (blocks(ev).length) stun = m.fighters[1].shieldStun;
    }
    expect(stun).toBeGreaterThan(0);
    // Let go of the button during shieldstun: the shield stays up until the stun is over.
    run(m, Math.max(0, stun - 2) + m.fighters[1].hitstop);
    expect(m.fighters[1].action).toBe('shield');
    run(m, 6);
    expect(m.fighters[1].action).not.toBe('shield');
  });
});

describe('shield break', () => {
  it('breaks when an attack empties it: pop up, helpless stun, vulnerable, then partial recovery', () => {
    const m = match();
    faceOff(m, 50);
    run(m, 3, emptyInput(), SHIELD);
    const v = m.fighters[1];
    v.shieldHp = 5;
    const ev = run(m, 40, once('heavy'), SHIELD);
    expect(ev.some((e) => e.type === 'shieldBreak' && e.id === 1)).toBe(true);
    expect(v.action).toBe('shieldBreak');
    // Mashing does nothing during the stun.
    const mash = run(m, 60, emptyInput(), (i) => makeInput({ light: i % 2 === 0, jump: i % 3 === 0, dodge: i % 5 === 0, right: true }));
    expect(mash.some((e) => 'id' in e && e.id === 1 && ['attack', 'jump', 'dodge', 'shield'].includes(e.type))).toBe(false);
    expect(v.action).toBe('shieldBreak');
    run(m, S.breakStunFrames);
    expect(v.action).toBe('idle');
    expect(v.shieldHp).toBeGreaterThanOrEqual(S.breakRecoverHealth);
  });

  it('pops the fighter upward when it breaks', () => {
    const m = match();
    faceOff(m, 50);
    run(m, 3, emptyInput(), SHIELD);
    m.fighters[1].shieldHp = 5;
    run(m, 40, once('heavy'), SHIELD);
    expect(m.fighters[1].y).toBeLessThan(0);
  });

  it('breaks from holding it until it runs dry', () => {
    const m = match();
    const ev = run(m, Math.ceil((S.maxHealth / S.drainPerSecond) * 60) + 5, emptyInput(), SHIELD);
    expect(ev.some((e) => e.type === 'shieldBreak')).toBe(true);
  });

  it('getting hit ends the stun (no permanent stun loop) and restores enough shield', () => {
    const m = match();
    faceOff(m, 50);
    run(m, 3, emptyInput(), SHIELD);
    m.fighters[1].shieldHp = 5;
    run(m, 40, once('heavy'), SHIELD);
    const v = m.fighters[1];
    expect(v.action).toBe('shieldBreak');
    run(m, 40); // fall back down
    v.x = m.fighters[0].x + 40;
    const ev = run(m, 30, once('light'));
    expect(ev.some((e) => e.type === 'hit' && e.victim === 1)).toBe(true);
    expect(v.action).not.toBe('shieldBreak');
    expect(v.shieldHp).toBeGreaterThanOrEqual(S.breakRecoverHealth);
  });

  it('after recovering, the restored shield lasts several seconds before breaking again', () => {
    const m = match();
    m.fighters[1].shieldHp = 1;
    run(m, 12, emptyInput(), SHIELD);
    expect(m.fighters[1].action).toBe('shieldBreak');
    run(m, S.breakStunFrames + 10);
    const ev = run(m, 240, emptyInput(), SHIELD);
    expect(ev.some((e) => e.type === 'shieldBreak')).toBe(false);
  });
});

describe('CPU shields', () => {
  /** A real CPU-vs-CPU match; returns shield stats for player `id`. */
  function shieldStats(d0: 'easy' | 'normal' | 'hard' | 'expert', d1: 'easy' | 'normal' | 'hard' | 'expert', id: 0 | 1, seed = 1) {
    const m = createMatch([{ fighter: 'luigi' }, { fighter: 'batman' }], { rules: makeRules({ countdownFrames: 0 }), stage: getStage('final'), seed });
    const cpus = [new CpuController(0, d0, seed), new CpuController(1, d1, seed + 1)];
    let raises = 0;
    let breaks = 0;
    let held = 0;
    let longest = 0;
    for (let i = 0; i < 3600 && m.phase === 'playing'; i++) {
      const ev = stepMatch(m, [cpus[0].decide(m), cpus[1].decide(m)]);
      raises += ev.filter((e) => e.type === 'shield' && e.id === id && e.up).length;
      breaks += ev.filter((e) => e.type === 'shieldBreak' && e.id === id).length;
      held = m.fighters[id].action === 'shield' ? held + 1 : 0;
      longest = Math.max(longest, held);
    }
    return { raises, breaks, longest };
  }

  it('shields in real matches, never holds it indefinitely, and lets it regenerate', () => {
    let raises = 0;
    let breaks = 0;
    for (const seed of [1, 2, 3]) {
      const s = shieldStats('normal', 'expert', 1, seed);
      raises += s.raises;
      breaks += s.breaks;
      expect(s.longest).toBeLessThan(60);
    }
    expect(raises).toBeGreaterThan(3);
    expect(breaks).toBeLessThanOrEqual(1);
  });

  it('Easy shields less than Expert (decision quality, same shield)', () => {
    let easy = 0;
    let expert = 0;
    for (const seed of [1, 2, 3]) {
      easy += shieldStats('normal', 'easy', 1, seed).raises;
      expert += shieldStats('normal', 'expert', 1, seed).raises;
    }
    expect(expert).toBeGreaterThan(easy);
  });
});
