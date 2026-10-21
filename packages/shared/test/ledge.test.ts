import { describe, expect, it } from 'vitest';
import {
  CpuController, createMatch, DEFAULT_RULES, emptyInput, FIGHTER_ORDER, FIGHTERS, getStage, hangPosition, isIntangible,
  makeInput, makeRules, STAGE_ORDER, stageLedges, stepMatch,
  type FighterId, type FighterState, type GameEvent, type InputFrame, type Ledge, type MatchState,
} from '../src';

const L = DEFAULT_RULES.ledge;

function match(stage = 'skyfall', fighters: FighterId[] = ['luigi', 'luigi']): MatchState {
  return createMatch(fighters.map((fighter) => ({ fighter })), { rules: makeRules({ countdownFrames: 0 }), stage: getStage(stage), seed: 5 });
}

function run(m: MatchState, frames: number, p0: InputFrame | ((i: number) => InputFrame) = emptyInput(), p1 = emptyInput()): GameEvent[] {
  const ev: GameEvent[] = [];
  for (let i = 0; i < frames; i++) ev.push(...stepMatch(m, [typeof p0 === 'function' ? p0(i) : p0, p1]));
  return ev;
}

/** Put fighter `id` in free fall just beside `l`, slightly above its hang position. */
function dropBeside(m: MatchState, l: Ledge, id = 0, dx = -6, dy = -12, vy = 150): void {
  const f = m.fighters[id];
  const hang = hangPosition(f, l, m.rules);
  f.x = hang.x + dx * l.dir;
  f.y = hang.y + dy;
  f.vx = 0;
  f.vy = vy;
  f.grounded = false;
  f.action = 'air';
  f.jumpsUsed = 2;
}

const leftLedge = (m: MatchState) => stageLedges(m.stage).find((l) => l.dir === 1)!;

/** Grab the ledge and wait out the input delay. */
function hang(m: MatchState, l = leftLedge(m), id = 0): void {
  dropBeside(m, l, id);
  run(m, L.actionDelayFrames + 2);
  expect(m.fighters[id].action).toBe('ledge');
}

describe('ledge geometry', () => {
  it('derives ledges from collision geometry on every stage', () => {
    const summary = (id: string) => stageLedges(getStage(id)).map((l) => `${l.platformId}:${l.x},${l.y},${l.dir}`).sort();
    expect(summary('skyfall')).toEqual(['main:-440,0,1', 'main:440,0,-1']);
    expect(summary('final')).toEqual(['main:-520,0,1', 'main:520,0,-1']);
    // Corneria: only the real outer corners — not the steps between nose/deck/rear.
    expect(summary('corneria')).toEqual(['nose:-720,40,1', 'rear:470,-40,-1']);
  });

  it('never makes one-way platforms grabbable', () => {
    for (const id of STAGE_ORDER) {
      const stage = getStage(id);
      const oneWay = new Set(stage.platforms.filter((p) => p.oneWay).map((p) => p.id));
      expect(stageLedges(stage).some((l) => oneWay.has(l.platformId))).toBe(false);
    }
  });
});

describe('grabbing', () => {
  it('snaps a falling fighter beside a ledge into the hang position and stops its fall', () => {
    const m = match();
    const l = leftLedge(m);
    dropBeside(m, l);
    const ev = run(m, 1);
    const f = m.fighters[0];
    expect(ev.some((e) => e.type === 'ledgeGrab' && e.id === 0)).toBe(true);
    expect(f.action).toBe('ledge');
    const hang = hangPosition(f, l, m.rules);
    expect([f.x, f.y]).toEqual([hang.x, hang.y]);
    expect([f.vx, f.vy, f.kbx, f.kby]).toEqual([0, 0, 0, 0]);
    expect(f.facing).toBe(l.dir);
    expect(f.jumpsUsed).toBe(1); // double jump restored
  });

  it('keeps hanging without falling or drifting', () => {
    const m = match();
    hang(m);
    const f = m.fighters[0];
    const pos = [f.x, f.y];
    run(m, 120);
    expect(f.action).toBe('ledge');
    expect([f.x, f.y]).toEqual(pos);
    expect(f.grounded).toBe(false);
  });

  it('rejects invalid positions and states', () => {
    const tries: [string, (m: MatchState, l: Ledge) => void][] = [
      ['too far out', (m, l) => dropBeside(m, l, 0, -(L.grabRangeX + 20))],
      ['too far below', (m, l) => dropBeside(m, l, 0, -6, L.grabBelow + 30)],
      ['above the stage', (m, l) => { dropBeside(m, l); m.fighters[0].x = l.x + l.dir * 60; m.fighters[0].y = l.y - 30; }],
      ['rising', (m, l) => dropBeside(m, l, 0, -6, -12, -300)],
      ['grounded at the edge', (m, l) => { const f = m.fighters[0]; f.x = l.x + l.dir * 10; f.y = l.y; f.grounded = true; f.action = 'idle'; }],
      ['in hitstun', (m, l) => { dropBeside(m, l); m.fighters[0].action = 'hitstun'; m.fighters[0].hitstun = 30; }],
    ];
    for (const [name, setup] of tries) {
      const m = match();
      setup(m, leftLedge(m));
      const ev = run(m, 3);
      expect(ev.some((e) => e.type === 'ledgeGrab'), name).toBe(false);
    }
    // Holding down never grabs.
    const m = match();
    dropBeside(m, leftLedge(m));
    expect(run(m, 3, makeInput({ down: true })).some((e) => e.type === 'ledgeGrab')).toBe(false);
  });

  it('never snaps farther than the configured grab range', () => {
    const m = match();
    const l = leftLedge(m);
    for (const [dx, dy] of [[-L.grabRangeX + 1, 0], [-1, -L.grabAbove + 1], [-1, L.grabBelow - 1]]) {
      const mm = match();
      dropBeside(mm, l, 0, dx, dy, 0);
      const before = { x: mm.fighters[0].x, y: mm.fighters[0].y };
      run(mm, 1);
      expect(mm.fighters[0].action).toBe('ledge');
      expect(Math.abs(mm.fighters[0].x - before.x)).toBeLessThanOrEqual(L.grabRangeX + 1);
      expect(Math.abs(mm.fighters[0].y - before.y)).toBeLessThanOrEqual(Math.max(L.grabAbove, L.grabBelow) + 5);
    }
    expect(m).toBeTruthy();
  });

  it('lets only one fighter hang on a ledge at a time', () => {
    const m = match();
    const l = leftLedge(m);
    dropBeside(m, l, 0);
    run(m, 1);
    dropBeside(m, l, 1);
    run(m, 1);
    expect(m.fighters[0].action).toBe('ledge');
    expect(m.fighters[1].action).not.toBe('ledge');
  });
});

describe('ledge actions', () => {
  it('climbs onto the stage when pressing toward it', () => {
    const m = match();
    hang(m);
    const l = leftLedge(m);
    const ev = run(m, 1, makeInput({ right: true }));
    expect(ev.some((e) => e.type === 'ledgeAction' && e.kind === 'climb')).toBe(true);
    const f = m.fighters[0];
    expect(f.action).toBe('ledgeClimb');
    expect(isIntangible(f, m.rules)).toBe(true);
    run(m, L.climbFrames + 2);
    expect(f.action).toBe('idle');
    expect(f.grounded).toBe(true);
    expect(f.y).toBe(l.y);
    expect(f.x).toBeGreaterThan(l.x);
    expect(f.x).toBeLessThan(l.x + 40);
  });

  it('climbs with up too', () => {
    const m = match();
    hang(m);
    run(m, 1, makeInput({ up: true }));
    expect(m.fighters[0].action).toBe('ledgeClimb');
  });

  it('ledge-jumps up and back onto the stage', () => {
    const m = match();
    hang(m);
    const ev = run(m, 1, makeInput({ jump: true }));
    const f = m.fighters[0];
    expect(ev.some((e) => e.type === 'ledgeAction' && e.kind === 'jump')).toBe(true);
    expect(f.action).toBe('air');
    expect(f.vy).toBeLessThan(0);
    expect(f.jumpsUsed).toBe(1); // still has the double jump
    run(m, 90, makeInput({ right: true }));
    expect(f.grounded).toBe(true);
    expect(f.y).toBe(0);
  });

  it('rolls onto the stage with the dodge button', () => {
    const m = match();
    hang(m);
    const l = leftLedge(m);
    const ev = run(m, 1, makeInput({ dodge: true }));
    const f = m.fighters[0];
    expect(ev.some((e) => e.type === 'ledgeAction' && e.kind === 'roll')).toBe(true);
    expect(f.action).toBe('ledgeRoll');
    run(m, L.rollFrames + 2);
    expect(f.action).toBe('idle');
    expect(f.grounded).toBe(true);
    expect(f.x - l.x).toBeGreaterThan(L.rollDistance);
  });

  it('a roll never carries a fighter past the end of a short platform', () => {
    const m = match();
    hang(m);
    // Pretend the platform is only 60 px wide.
    const f = m.fighters[0];
    f.ledge = { ...f.ledge!, maxX: f.ledge!.minX + 60 };
    run(m, 1, makeInput({ dodge: true }));
    run(m, L.rollFrames + 2);
    expect(m.fighters[0].x).toBeLessThanOrEqual(-380 - FIGHTERS.luigi.stats.width / 2 + 0.001);
  });

  for (const [name, input] of [['down', { down: true }], ['away', { left: true }]] as const) {
    it(`releases the ledge when pressing ${name}`, () => {
      const m = match();
      hang(m);
      const ev = run(m, 1, makeInput(input));
      expect(ev.some((e) => e.type === 'ledgeAction' && e.kind === 'release')).toBe(true);
      const f = m.fighters[0];
      expect(f.action).toBe('air');
      const y = f.y;
      run(m, 10);
      expect(f.y).toBeGreaterThan(y); // falling
    });
  }

  it('ignores inputs for the first few frames of a hang', () => {
    const m = match();
    dropBeside(m, leftLedge(m));
    run(m, 1);
    run(m, L.actionDelayFrames - 2, makeInput({ right: true }));
    expect(m.fighters[0].action).toBe('ledge');
  });

  it('drops a fighter who hangs too long (no permanent stalling)', () => {
    const m = match();
    dropBeside(m, leftLedge(m));
    run(m, L.maxHangFrames + 2);
    expect(m.fighters[0].action).not.toBe('ledge');
  });
});

describe('invulnerability and regrabs', () => {
  it('grants invulnerability on the first grab only, ended by ledge actions', () => {
    const m = match();
    const l = leftLedge(m);
    dropBeside(m, l);
    run(m, 1);
    const f = m.fighters[0];
    expect(f.invuln).toBe(L.invulnFrames);
    expect(isIntangible(f, m.rules)).toBe(true);
    run(m, L.actionDelayFrames);
    run(m, 1, makeInput({ down: true })); // release
    expect(f.invuln).toBe(0);
    expect(f.ledgeCooldown).toBe(L.regrabCooldownFrames);
    // Regrab the same ledge after the cooldown: no invulnerability this time.
    run(m, L.regrabCooldownFrames);
    dropBeside(m, l);
    run(m, 1);
    expect(f.action).toBe('ledge');
    expect(f.invuln).toBe(0);
  });

  it('cannot regrab during the cooldown', () => {
    const m = match();
    const l = leftLedge(m);
    hang(m, l);
    run(m, 1, makeInput({ down: true }));
    dropBeside(m, l);
    m.fighters[0].ledgeCooldown = 5;
    expect(run(m, 3).some((e) => e.type === 'ledgeGrab')).toBe(false);
  });

  it('limits grabs per airtime and resets them on landing', () => {
    const m = match();
    const l = leftLedge(m);
    let grabs = 0;
    for (let k = 0; k < L.maxGrabsPerAirtime + 3; k++) {
      dropBeside(m, l);
      m.fighters[0].ledgeCooldown = 0;
      grabs += run(m, 2).filter((e) => e.type === 'ledgeGrab').length;
      if (m.fighters[0].action === 'ledge') run(m, L.actionDelayFrames, makeInput({ down: true }));
    }
    expect(grabs).toBe(L.maxGrabsPerAirtime);
    // Landing resets the count.
    const f = m.fighters[0];
    f.x = -200; f.y = -5; f.vy = 100; f.action = 'air'; f.grounded = false;
    run(m, 5);
    expect(f.grounded).toBe(true);
    expect(f.ledgeGrabs).toBe(0);
  });
});

describe('every stage and fighter', () => {
  it('can grab and climb every ledge', () => {
    for (const stage of STAGE_ORDER) {
      for (const fighter of FIGHTER_ORDER) {
        for (const l of stageLedges(getStage(stage))) {
          const m = match(stage, [fighter, 'luigi']);
          m.fighters[1].x = 0;
          dropBeside(m, l);
          run(m, L.actionDelayFrames + 2);
          expect(m.fighters[0].action, `${fighter} ${stage} ${l.platformId}`).toBe('ledge');
          run(m, 1, makeInput(l.dir > 0 ? { right: true } : { left: true }));
          run(m, L.climbFrames + 2);
          const f = m.fighters[0];
          expect(f.grounded, `${fighter} ${stage}`).toBe(true);
          expect(f.y).toBe(l.y);
          expect(f.x >= l.minX && f.x <= l.maxX).toBe(true);
        }
      }
    }
  });

  it('still walks up the small steps between Corneria platforms automatically', () => {
    const m = match('corneria');
    const f = m.fighters[0];
    f.x = -620; f.y = 40; f.grounded = true; f.action = 'idle';
    run(m, 40, makeInput({ right: true }));
    expect(f.y).toBe(0);
    expect(f.x).toBeGreaterThan(-560);
  });
});

describe('CPU ledge recovery', () => {
  for (const stage of STAGE_ORDER) {
    it(`recovers via the ledge and gets back on stage (${stage})`, () => {
      for (const fighter of FIGHTER_ORDER) {
        for (const l of stageLedges(getStage(stage))) {
          const m = match(stage, ['luigi', fighter]);
          const cpu = new CpuController(1, 'hard', 11);
          m.fighters[0].x = (l.minX + l.maxX) / 2;
          // Knocked out beside the ledge, slightly below it, with only the double jump left.
          const f = m.fighters[1];
          f.x = l.x - l.dir * 70;
          f.y = l.y + 60;
          f.vy = 0;
          f.grounded = false;
          f.action = 'air' as FighterState['action'];
          f.jumpsUsed = 1;
          let grabbed = false;
          let maxHang = 0;
          for (let i = 0; i < 360 && !(f.grounded && f.action === 'idle'); i++) {
            const ev = stepMatch(m, [emptyInput(), cpu.decide(m)]);
            if (ev.some((e) => e.type === 'ledgeGrab' && e.id === 1)) grabbed = true;
            if (f.action === 'ledge') maxHang = Math.max(maxHang, f.actionFrame);
          }
          const label = `${fighter} on ${stage} (${l.platformId})`;
          expect(f.action === 'dead' ? 'died' : f.grounded ? 'on stage' : f.action, label).toBe('on stage');
          expect(maxHang, label).toBeLessThan(90); // never stuck hanging
          expect(typeof grabbed).toBe('boolean');
        }
      }
    });
  }

  it('gets up from a ledge it is placed on, without dropping off', () => {
    for (const d of ['easy', 'normal', 'hard', 'expert'] as const) {
      const m = match();
      const cpu = new CpuController(1, d, 3);
      const l = leftLedge(m);
      dropBeside(m, l, 1);
      let released = false;
      for (let i = 0; i < 200; i++) {
        const ev = stepMatch(m, [emptyInput(), cpu.decide(m)]);
        if (ev.some((e) => e.type === 'ledgeAction' && e.id === 1 && e.kind === 'release')) released = true;
      }
      expect(released, d).toBe(false);
      expect(m.fighters[1].grounded, d).toBe(true);
    }
  });
});
