import { describe, expect, it } from 'vitest';
import {
  CpuController, createMatch, DEFAULT_RULES, emptyInput, FIGHTER_ORDER, FIGHTERS, getStage, GRABS, koFighter, makeInput,
  makeRules, resetPositions, stepMatch, THROW_DIRS, TRAINING_RULES, TrainingDummyController,
  type FighterId, type FighterState, type GameEvent, type InputFrame, type MatchState, type ThrowDir,
} from '../src';

const G = DEFAULT_RULES.grab;
type Input = InputFrame | ((i: number) => InputFrame);

function match(fighters: FighterId[] = ['luigi', 'luigi'], stage = 'final'): MatchState {
  return createMatch(fighters.map((fighter) => ({ fighter })), { rules: makeRules({ countdownFrames: 0 }), stage: getStage(stage), seed: 4 });
}

function run(m: MatchState, frames: number, p0: Input = emptyInput(), p1: Input = emptyInput(), p2: Input = emptyInput()): GameEvent[] {
  const ev: GameEvent[] = [];
  const at = (p: Input, i: number) => (typeof p === 'function' ? p(i) : p);
  for (let i = 0; i < frames; i++) ev.push(...stepMatch(m, [at(p0, i), at(p1, i), at(p2, i)]));
  return ev;
}

/** P0 at x, facing right, P1 `gap` px in front facing back. */
function faceOff(m: MatchState, gap = 50, x = -100): void {
  const [a, v] = m.fighters;
  a.x = x;
  v.x = x + gap;
  a.facing = 1;
  v.facing = -1;
}

const tap = (k: keyof InputFrame) => (i: number) => (i === 0 ? makeInput({ [k]: true }) : emptyInput());
const of = <T extends GameEvent['type']>(ev: GameEvent[], t: T) => ev.filter((e): e is Extract<GameEvent, { type: T }> => e.type === t);

/** Grab P1 with P0 and wait out the input delay. */
function grabbed(m: MatchState): void {
  const ev = run(m, GRABS[m.fighters[0].fighter].startup + 2, tap('grab'));
  expect(of(ev, 'grab').length).toBe(1);
  run(m, G.holdInputDelay);
}

function throwOnce(m: MatchState, dir: ThrowDir): Extract<GameEvent, { type: 'hit' }> {
  grabbed(m);
  const g = m.fighters[0];
  const input = dir === 'up' ? { up: true } : dir === 'down' ? { down: true }
    : (dir === 'forward') === (g.facing > 0) ? { right: true } : { left: true };
  const ev = run(m, 40, makeInput(input));
  const hit = of(ev, 'hit').find((e) => e.throwDir === dir);
  expect(hit, dir).toBeDefined();
  return hit!;
}

describe('grab timing', () => {
  it('has startup, an active window and whiff recovery from the central config', () => {
    const m = match();
    faceOff(m, 400);
    const d = GRABS.luigi;
    expect([d.startup, d.active, d.recovery]).toEqual([6, 3, 18]);
    const ev = run(m, 1, makeInput({ grab: true }));
    expect(of(ev, 'grabStart').length).toBe(1);
    expect(m.fighters[0].action).toBe('grab');
    const rest = run(m, d.startup + d.active);
    expect(of(rest, 'grabWhiff').length).toBe(1);
    // Vulnerable during recovery: attacking does nothing until it ends.
    const mash = run(m, d.recovery - 3, (i) => makeInput({ light: i % 2 === 0, jump: i % 3 === 0 }));
    expect(mash.some((e) => (e.type === 'attack' || e.type === 'jump') && e.id === 0)).toBe(false);
    expect(m.fighters[0].action).toBe('grab');
    run(m, 4);
    expect(m.fighters[0].action).not.toBe('grab'); // (a jab buffered at the very end may come out)
  });

  it('cannot be spammed: a second press during recovery does nothing', () => {
    const m = match();
    faceOff(m, 400);
    const ev = run(m, 20, (i) => makeInput({ grab: i % 2 === 0 }));
    expect(of(ev, 'grabStart').length).toBe(1);
  });

  it('only works on the ground', () => {
    const m = match();
    const f = m.fighters[0];
    f.y = -200; f.grounded = false; f.action = 'air';
    expect(of(run(m, 3, tap('grab')), 'grabStart').length).toBe(0);
  });
});

describe('grab detection', () => {
  it('catches an opponent in range and puts both into synchronized states', () => {
    const m = match();
    faceOff(m, 50);
    const ev = run(m, GRABS.luigi.startup + 1, tap('grab'));
    const g = of(ev, 'grab')[0];
    expect(g).toMatchObject({ grabber: 0, victim: 1, shielded: false });
    const [a, v] = m.fighters;
    expect(a.action).toBe('holding');
    expect(v.action).toBe('grabbed');
    expect([a.grabPartner, v.grabPartner]).toEqual([1, 0]);
    // Held just in front of the grabber, facing it.
    expect(v.x).toBeCloseTo(a.x + FIGHTERS.luigi.stats.width + G.holdGap, 5);
    expect(v.facing).toBe(-a.facing);
  });

  it('misses an opponent outside the grab box', () => {
    const m = match();
    faceOff(m, 140);
    const ev = run(m, 30, tap('grab'));
    expect(of(ev, 'grab').length).toBe(0);
    expect(of(ev, 'grabWhiff').length).toBe(1);
  });

  it('misses an opponent behind the grabber', () => {
    const m = match();
    faceOff(m, -40);
    expect(of(run(m, 30, tap('grab')), 'grab').length).toBe(0);
  });

  it('beats shields: grabs a shielding opponent and cancels the shield', () => {
    const m = match();
    faceOff(m, 50);
    run(m, 5, emptyInput(), makeInput({ dodge: true }));
    expect(m.fighters[1].action).toBe('shield');
    const ev = run(m, 10, tap('grab'), makeInput({ dodge: true }));
    expect(of(ev, 'grab')[0]?.shielded).toBe(true);
    expect(m.fighters[1].action).toBe('grabbed');
    expect(of(ev, 'shieldHit').length).toBe(0);
  });

  it('respects invulnerability (spot dodge, respawn invuln)', () => {
    const m = match();
    faceOff(m, 50);
    run(m, 1, emptyInput(), makeInput({ dodge: true, down: true }));
    expect(of(run(m, 12, tap('grab')), 'grab').length).toBe(0);
    const m2 = match();
    faceOff(m2, 50);
    m2.fighters[1].invuln = 60;
    expect(of(run(m2, 12, tap('grab')), 'grab').length).toBe(0);
  });

  it('cannot grab airborne opponents', () => {
    const m = match();
    faceOff(m, 50);
    const v = m.fighters[1];
    v.y = -30; v.grounded = false; v.action = 'air'; v.vy = -400;
    expect(of(run(m, 10, tap('grab')), 'grab').length).toBe(0);
  });

  it('a stunned fighter cannot grab', () => {
    const m = match();
    faceOff(m, 50);
    m.fighters[0].action = 'hitstun';
    m.fighters[0].hitstun = 30;
    expect(of(run(m, 10, tap('grab')), 'grabStart').length).toBe(0);
  });

  it('attacks beat grabs: an attack landing during grab startup cancels it', () => {
    const m = match(['luigi', 'sheik']);
    faceOff(m, 45);
    // P1's jab connects before P0's grab becomes active.
    const ev = run(m, 20, (i) => makeInput({ grab: i === 2 }), tap('light'));
    expect(of(ev, 'hit').some((e) => e.victim === 0)).toBe(true);
    expect(of(ev, 'grab').length).toBe(0);
  });

  it('two simultaneous grabs clash and push both apart', () => {
    const m = match();
    faceOff(m, 50);
    const ev = run(m, 10, tap('grab'), tap('grab'));
    expect(of(ev, 'grabClash').length).toBe(1);
    expect(m.fighters.every((f) => f.grabPartner === null)).toBe(true);
  });
});

describe('holding and being held', () => {
  it('the held fighter cannot move, jump or attack; it follows the grabber', () => {
    const m = match();
    faceOff(m, 50);
    grabbed(m);
    const v = m.fighters[1];
    const x = v.x;
    const ev = run(m, 20, emptyInput(), (i) => makeInput({ left: true, light: i % 4 === 0, special: i % 5 === 0 }));
    expect(ev.some((e) => (e.type === 'attack' || e.type === 'jump') && e.id === 1)).toBe(false);
    expect(v.x).toBeCloseTo(x, 5);
  });

  it('the grabber cannot run or attack while holding (attack button pummels instead)', () => {
    const m = match();
    faceOff(m, 50);
    grabbed(m);
    const a = m.fighters[0];
    const x = a.x;
    const ev = run(m, 3, tap('light'));
    expect(ev.some((e) => e.type === 'attack' && e.id === 0)).toBe(false);
    expect(of(ev, 'pummel').length).toBe(1);
    expect(a.x).toBeCloseTo(x, 5);
  });

  it('a hit from a third fighter breaks the grab', () => {
    const m = createMatch([{ fighter: 'luigi' }, { fighter: 'luigi' }, { fighter: 'sheik' }], { rules: makeRules({ countdownFrames: 0 }), stage: getStage('final') });
    faceOff(m, 50);
    m.fighters[2].x = m.fighters[0].x - 45;
    m.fighters[2].facing = 1;
    grabbed(m);
    const ev = run(m, 20, emptyInput(), emptyInput(), tap('light'));
    expect(of(ev, 'hit').some((e) => e.victim === 0)).toBe(true);
    expect(m.fighters[1].grabPartner).toBeNull();
    expect(m.fighters[1].action).not.toBe('grabbed');
  });
});

describe('throws', () => {
  it('forward launches the way the grabber faces, back launches behind it', () => {
    const f = throwOnce((() => { const m = match(); faceOff(m); return m; })(), 'forward');
    expect(f.launchX).toBeGreaterThan(0);
    const b = throwOnce((() => { const m = match(); faceOff(m); return m; })(), 'back');
    expect(b.launchX).toBeLessThan(0);
    // Facing left mirrors it.
    const m = match();
    const [a, v] = m.fighters;
    a.x = 100; v.x = 50; a.facing = -1; v.facing = 1;
    expect(throwOnce(m, 'forward').launchX).toBeLessThan(0);
  });

  it('up launches mostly upward; down slams into the floor and pops up low, with extra hitstun', () => {
    const up = throwOnce((() => { const m = match(); faceOff(m); return m; })(), 'up');
    expect(up.launchY).toBeLessThan(0);
    expect(Math.abs(up.launchX)).toBeLessThan(Math.abs(up.launchY) * 0.1);
    const mDown = match();
    faceOff(mDown);
    const down = throwOnce(mDown, 'down');
    expect(down.launchY).toBeLessThan(0); // bounced off the ground
    expect(down.launchSpeed).toBeLessThan(up.launchSpeed);
    // The victim never ends up inside the floor.
    for (let i = 0; i < 60; i++) {
      run(mDown, 1);
      expect(mDown.fighters[1].y).toBeLessThanOrEqual(0.001);
    }
  });

  it('uses the per-fighter throw damage and the normal damage/knockback pipeline', () => {
    for (const dir of THROW_DIRS) {
      const m = match(['batman', 'luigi']);
      faceOff(m, 55);
      const hit = throwOnce(m, dir);
      expect(hit.damage).toBe(GRABS.batman.throws[dir].damage);
      expect(m.fighters[1].damage).toBe(GRABS.batman.throws[dir].damage);
      expect(hit.hitstun).toBeGreaterThan(0);
    }
  });

  it('knockback scales with percent and weight', () => {
    const speed = (pct: number, victim: FighterId = 'luigi') => {
      const m = match(['luigi', victim]);
      faceOff(m, 55);
      m.fighters[1].damage = pct;
      return throwOnce(m, 'back').launchSpeed;
    };
    expect(speed(120)).toBeGreaterThan(speed(0) * 1.8);
    expect(speed(100, 'gnw')).toBeGreaterThan(speed(100, 'gundam'));
  });

  it('gives fighters distinct throw identities', () => {
    expect(GRABS.luigi.throws.up.baseKnockback).toBeGreaterThan(GRABS.sheik.throws.up.baseKnockback);
    expect(GRABS.goku.throws.up.baseKnockback).toBeGreaterThan(GRABS.batman.throws.up.baseKnockback);
    expect(GRABS.sheik.startup).toBeLessThan(GRABS.vader.startup);
    expect(GRABS.vader.box.w).toBeGreaterThan(GRABS.luigi.box.w);
    expect(GRABS.spiderman.throws.forward.releaseFrame).toBeLessThan(GRABS.batman.throws.forward.releaseFrame);
    expect(GRABS.gundam.throws.down.damage).toBeGreaterThan(GRABS.sheik.throws.down.damage);
    for (const id of FIGHTER_ORDER) expect(GRABS[id]).toBeDefined();
  });

  it('every fighter can grab and throw every direction on every stage', () => {
    for (const stage of ['skyfall', 'corneria', 'final']) {
      for (const id of FIGHTER_ORDER) {
        for (const dir of THROW_DIRS) {
          const m = match([id, 'luigi'], stage);
          const x = stage === 'corneria' ? -300 : -100;
          faceOff(m, FIGHTERS[id].stats.width / 2 + 30, x);
          m.fighters.forEach((f) => { f.y = stage === 'corneria' ? 0 : 0; });
          throwOnce(m, dir);
          expect(m.fighters.every((f) => f.grabPartner === null)).toBe(true);
        }
      }
    }
  });
});

describe('pummels', () => {
  it('deal small damage with a cooldown, no launch, and shorten the hold', () => {
    const m = match();
    faceOff(m);
    grabbed(m);
    const v = m.fighters[1];
    const timer = v.grabTimer;
    const ev = run(m, 40, (i) => makeInput({ grab: i % 2 === 0 }));
    const p = of(ev, 'pummel');
    expect(p.length).toBeGreaterThanOrEqual(1);
    expect(p.length).toBeLessThanOrEqual(Math.ceil(40 / G.pummelCooldownFrames) + 1);
    expect(v.damage).toBeCloseTo(p.length * GRABS.luigi.pummelDamage, 5);
    expect(GRABS.luigi.pummelDamage).toBeGreaterThanOrEqual(1);
    expect(GRABS.luigi.pummelDamage).toBeLessThanOrEqual(2);
    expect(v.kbx).toBe(0);
    expect(of(ev, 'hit').length).toBe(0);
    if (v.action === 'grabbed') expect(v.grabTimer).toBeLessThan(timer - p.length * G.pummelTimeCost);
  });

  it('cannot pummel forever: enough pummels free the victim', () => {
    const m = match();
    faceOff(m);
    grabbed(m);
    const ev = run(m, 400, (i) => makeInput({ grab: i % 2 === 0 }));
    expect(of(ev, 'grabEscape').length).toBe(1);
    expect(of(ev, 'pummel').length).toBeLessThan(10);
  });
});

describe('escaping', () => {
  it('breaks free automatically when the hold time runs out', () => {
    const m = match();
    faceOff(m);
    const ev = run(m, GRABS.luigi.startup + 1, tap('grab'));
    expect(of(ev, 'grab').length).toBe(1);
    const esc = run(m, G.holdBaseFrames + 2);
    expect(of(esc, 'grabEscape').length).toBe(1);
    const [a, v] = m.fighters;
    expect(a.action).toBe('grabRelease');
    expect(v.action).toBe('grabRelease');
    expect(v.grabImmune).toBeGreaterThan(0);
    run(m, 6);
    expect(v.x - a.x).toBeGreaterThan(FIGHTERS.luigi.stats.width + G.holdGap); // pushed apart
  });

  it('mashing escapes sooner; held buttons and auto-repeat do not count', () => {
    const frames = (p1: (i: number) => InputFrame) => {
      const m = match();
      faceOff(m);
      // (Held keys are already held before the grab lands.)
      run(m, GRABS.luigi.startup + 1, tap('grab'), p1(-1));
      for (let i = 0; i < 300; i++) {
        if (of(run(m, 1, emptyInput(), p1(i)), 'grabEscape').length) return i;
      }
      return 999;
    };
    const passive = frames(() => emptyInput());
    const held = frames(() => makeInput({ up: true })); // held the whole time (a held key that doesn't move you)
    const mash = frames((i) => makeInput({ jump: i % 2 === 0 }));
    expect(held).toBe(passive);
    expect(mash).toBeLessThan(passive * 0.5);
  });

  it('the hold lasts longer at high percent, but stays bounded', () => {
    const timer = (pct: number) => {
      const m = match();
      faceOff(m);
      m.fighters[1].damage = pct;
      run(m, GRABS.luigi.startup + 1, tap('grab'));
      return m.fighters[1].grabTimer;
    };
    expect(timer(100)).toBeGreaterThan(timer(0));
    expect(timer(999)).toBe(G.holdMaxFrames);
  });

  it('prevents an immediate regrab after an escape', () => {
    const m = match();
    faceOff(m);
    run(m, GRABS.luigi.startup + 1, tap('grab'));
    run(m, G.holdBaseFrames + 2);
    run(m, G.grabberReleaseFrames + 1);
    faceOff(m);
    expect(of(run(m, 12, tap('grab')), 'grab').length).toBe(0);
  });
});

describe('interruptions and safety', () => {
  it('a KO of either fighter ends the grab safely', () => {
    for (const ko of [0, 1]) {
      const m = match();
      faceOff(m);
      grabbed(m);
      koFighter(m, m.fighters[ko]);
      run(m, 2);
      const other = m.fighters[1 - ko];
      expect(other.grabPartner).toBeNull();
      expect(['holding', 'grabbed']).not.toContain(other.action);
      expect(m.fighters[ko].stocks).toBe(DEFAULT_RULES.stocks - 1);
    }
  });

  it('a training reset during a grab clears it', () => {
    const m = createMatch([{ fighter: 'luigi' }, { fighter: 'luigi' }], { rules: TRAINING_RULES, stage: getStage('final') });
    faceOff(m);
    grabbed(m);
    resetPositions(m);
    expect(m.fighters.every((f) => f.grabPartner === null && f.action === 'idle')).toBe(true);
    run(m, 30);
    expect(m.fighters.every((f) => f.action === 'idle')).toBe(true);
  });

  it('holding someone over a ledge is safe; throwing them off makes them fall naturally', () => {
    const m = match();
    // Grabber at the right edge of Final Destination facing out.
    const [a, v] = m.fighters;
    a.x = 505; v.x = 545; a.facing = 1; v.facing = -1; v.grounded = true; v.y = 0;
    run(m, GRABS.luigi.startup + 1, tap('grab'));
    if (v.action === 'grabbed') {
      run(m, 20);
      expect(v.y).toBe(0);
      run(m, 40, makeInput({ right: true }));
      expect(v.grabPartner).toBeNull();
      expect(v.grounded).toBe(false);
    }
  });

  it('nobody passes through solid ground or walls after a throw on Corneria', () => {
    const m = match(['gundam', 'luigi'], 'corneria');
    faceOff(m, 55, 180); // near the raised rear deck
    throwOnce(m, 'forward');
    const v = m.fighters[1];
    for (let i = 0; i < 90; i++) {
      run(m, 1);
      for (const p of m.stage.platforms) {
        if (p.oneWay) continue;
        const inside = v.x > p.x1 + 1 && v.x < p.x2 - 1 && v.y > p.y + 2 && v.y < p.y + p.height - 2;
        expect(inside, `inside ${p.id} at frame ${i}`).toBe(false);
      }
    }
  });

  it('is deterministic', () => {
    const play = () => {
      const m = match(['naruto', 'vader']);
      faceOff(m, 55);
      run(m, 200, (i) => makeInput({ grab: i === 0, light: i === 20 || i === 40, down: i > 60 }), (i) => makeInput({ jump: i % 3 === 0 }));
      return JSON.stringify(m);
    };
    expect(play()).toBe(play());
  });
});

describe('CPU', () => {
  it('grabs a shielding opponent (Hard / Expert)', () => {
    for (const d of ['hard', 'expert'] as const) {
      const m = match();
      faceOff(m, 55);
      const cpu = new CpuController(0, d, 7);
      let grabs = 0;
      for (let i = 0; i < 600 && grabs === 0; i++) {
        const ev = stepMatch(m, [cpu.decide(m), makeInput({ dodge: true })]);
        grabs += of(ev, 'grab').filter((e) => e.grabber === 0 && e.shielded).length;
        if (m.fighters[1].action === 'shieldBreak' || m.fighters[1].shieldHp < 20) m.fighters[1].shieldHp = 100;
        if (Math.abs(m.fighters[0].x - m.fighters[1].x) > 140 && m.fighters[0].action === 'idle') faceOff(m, 55);
      }
      expect(grabs, d).toBeGreaterThan(0);
    }
  });

  it('throws once it has someone, toward the edge at kill percent (smart)', () => {
    const m = match();
    const [a, v] = m.fighters;
    a.x = 400; v.x = 350; a.facing = -1; v.facing = 1; // back to the right edge
    v.damage = 130;
    const cpu = new CpuController(0, 'expert', 2);
    const ev: GameEvent[] = [];
    ev.push(...stepMatch(m, [makeInput({ grab: true }), emptyInput()]));
    for (let i = 0; i < 80; i++) ev.push(...stepMatch(m, [cpu.decide(m), emptyInput()]));
    const t = of(ev, 'throw')[0];
    expect(t).toBeDefined();
    expect(t.dir).toBe('back');
  });

  it('mashes out of grabs, faster at higher difficulty', () => {
    const escapeTime = (d: 'easy' | 'expert') => {
      const m = match();
      faceOff(m);
      const cpu = new CpuController(1, d, 3);
      // Land the grab first (the CPU would otherwise jab before it connects), then let it mash.
      run(m, GRABS.luigi.startup + 1, tap('grab'));
      expect(m.fighters[1].action).toBe('grabbed');
      for (let i = 0; i < 300; i++) {
        const ev = stepMatch(m, [emptyInput(), cpu.decide(m)]);
        if (of(ev, 'grabEscape').length) return i;
      }
      return 999;
    };
    const expert = escapeTime('expert');
    const easy = escapeTime('easy');
    expect(expert).toBeLessThan(easy);
    expect(easy).toBeLessThan(G.holdBaseFrames + GRABS.luigi.startup + 2);
  });

  it('full CPU-vs-CPU matches still finish, with grabs and throws happening', () => {
    let grabs = 0;
    let throws = 0;
    for (const seed of [1, 2]) {
      const m = createMatch([{ fighter: 'batman' }, { fighter: 'naruto' }], { rules: makeRules({ countdownFrames: 0 }), stage: getStage('final'), seed });
      const c = [new CpuController(0, 'expert', seed), new CpuController(1, 'hard', seed + 9)];
      while (m.phase !== 'ended' && m.frame < 5 * 3600) {
        const ev = stepMatch(m, [c[0].decide(m), c[1].decide(m)]);
        grabs += of(ev, 'grab').length;
        throws += of(ev, 'throw').length;
        for (const f of m.fighters) if (f.action === 'grabbed') expect(f.actionFrame).toBeLessThan(G.holdMaxFrames + 70);
      }
      expect(m.phase).toBe('ended');
    }
    expect(grabs).toBeGreaterThan(0);
    expect(throws).toBeGreaterThan(0);
  });
});

describe('training dummy', () => {
  it('Attempt Grab grabs a nearby player and uses the chosen throw', () => {
    const m = createMatch([{ fighter: 'luigi' }, { fighter: 'luigi' }], { rules: TRAINING_RULES, stage: getStage('final') });
    const dummy = new TrainingDummyController(1, 'grab');
    dummy.throwChoice = 'up';
    faceOff(m, 50);
    const ev: GameEvent[] = [];
    for (let i = 0; i < 200; i++) ev.push(...stepMatch(m, [emptyInput(), dummy.decide(m)]));
    expect(of(ev, 'grab').some((e) => e.grabber === 1)).toBe(true);
    expect(of(ev, 'throw').some((e) => e.grabber === 1 && e.dir === 'up')).toBe(true);
    expect(ev.some((e) => e.type === 'attack' && e.id === 1)).toBe(false);
  });

  it('Stand Still never mashes (passive); Escape Grab mashes out quickly', () => {
    const hold = (b: 'stand' | 'escape') => {
      const m = createMatch([{ fighter: 'luigi' }, { fighter: 'luigi' }], { rules: TRAINING_RULES, stage: getStage('final') });
      const dummy = new TrainingDummyController(1, b);
      faceOff(m);
      stepMatch(m, [makeInput({ grab: true }), dummy.decide(m)]);
      for (let i = 0; i < 300; i++) {
        if (of(stepMatch(m, [emptyInput(), dummy.decide(m)]), 'grabEscape').length) return i;
      }
      return 999;
    };
    expect(hold('escape')).toBeLessThan(hold('stand') * 0.5);
  });

  it('a shielding dummy can be grabbed without it fighting back', () => {
    const m = createMatch([{ fighter: 'luigi' }, { fighter: 'luigi' }], { rules: TRAINING_RULES, stage: getStage('final') });
    const dummy = new TrainingDummyController(1, 'shield');
    faceOff(m);
    for (let i = 0; i < 10; i++) stepMatch(m, [emptyInput(), dummy.decide(m)]);
    const ev: GameEvent[] = [];
    for (let i = 0; i < 20; i++) ev.push(...stepMatch(m, [makeInput({ grab: i === 0 }), dummy.decide(m)]));
    expect(of(ev, 'grab')[0]?.shielded).toBe(true);
    expect((m.fighters[1] as FighterState).action).toBe('grabbed');
  });
});
