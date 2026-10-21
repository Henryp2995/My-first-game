import { describe, expect, it } from 'vitest';
import {
  ComboTracker, createMatch, DEFAULT_RULES, emptyInput, FIGHTER_ORDER, getStage, hangOnNearestLedge, makeInput, resetPositions,
  setFighterDamage, setFighterShield, STAGE_ORDER, stepMatch, TRAINING_RULES, TrainingDummyController,
  type DummyBehavior, type FighterId, type GameEvent, type InputFrame, type MatchState,
} from '../src';

const DUMMY = 1;

function training(fighters: [FighterId, FighterId] = ['luigi', 'luigi'], stage = 'skyfall'): MatchState {
  return createMatch(fighters.map((fighter) => ({ fighter })), { rules: TRAINING_RULES, stage: getStage(stage), seed: 3 });
}

/** Steps the match with the player's input and the dummy's controller. */
function run(m: MatchState, dummy: TrainingDummyController, frames: number, player: (i: number) => InputFrame = () => emptyInput()): GameEvent[] {
  const all: GameEvent[] = [];
  for (let i = 0; i < frames; i++) all.push(...stepMatch(m, [player(i), dummy.decide(m)]));
  return all;
}

/** Stand the player right next to the dummy, facing it. */
function besideDummy(m: MatchState, gap = 40): void {
  const p = m.fighters[0];
  const d = m.fighters[DUMMY];
  p.x = d.x - gap;
  p.y = d.y;
  p.facing = 1;
}

/** Press one button for a frame, release, then wait for the move to finish. */
function press(button: keyof InputFrame) {
  return (i: number) => (i === 0 ? makeInput({ [button]: true }) : emptyInput());
}

function knockOut(m: MatchState, id: number): void {
  const f = m.fighters[id];
  f.x = m.stage.blastZone.right + 50;
  f.grounded = false;
  f.action = 'air';
}

describe('training rules', () => {
  it('have unlimited stocks, no clock and no countdown', () => {
    expect(TRAINING_RULES.infiniteStocks).toBe(true);
    expect(TRAINING_RULES.timed).toBe(false);
    expect(TRAINING_RULES.countdownFrames).toBe(0);
    expect(training().phase).toBe('playing');
  });

  it('keep every physics and combat value identical to versus', () => {
    expect(TRAINING_RULES.combat).toEqual(DEFAULT_RULES.combat);
    expect(TRAINING_RULES.movement).toEqual(DEFAULT_RULES.movement);
    expect(TRAINING_RULES.dodge).toEqual(DEFAULT_RULES.dodge);
    expect(TRAINING_RULES.respawnDelayFrames).toBe(DEFAULT_RULES.respawnDelayFrames);
  });

  it('never end: no timer, unlimited KOs and respawns for both fighters', () => {
    const m = training();
    const dummy = new TrainingDummyController(DUMMY);
    const startTime = m.timeLeft;
    run(m, dummy, DEFAULT_RULES.matchFrames + 600);
    expect(m.phase).toBe('playing');
    expect(m.timeLeft).toBe(startTime);
    for (let k = 0; k < 6; k++) {
      knockOut(m, DUMMY);
      knockOut(m, 0);
      const ev = run(m, dummy, DEFAULT_RULES.respawnDelayFrames + 2);
      expect(ev.some((e) => e.type === 'respawn' && e.id === DUMMY)).toBe(true);
      expect(ev.some((e) => e.type === 'respawn' && e.id === 0)).toBe(true);
      expect(ev.some((e) => e.type === 'eliminated' || e.type === 'matchEnd')).toBe(false);
    }
    expect(m.fighters.every((f) => !f.eliminated && f.stocks === DEFAULT_RULES.stocks)).toBe(true);
    expect(m.phase).toBe('playing');
  });
});

describe('versus rules are unchanged (regression)', () => {
  it('a normal match still loses stocks, eliminates and ends', () => {
    const m = createMatch([{ fighter: 'luigi' }, { fighter: 'luigi' }], { rules: { ...DEFAULT_RULES, countdownFrames: 0 } });
    const ev: GameEvent[] = [];
    for (let s = 0; s < DEFAULT_RULES.stocks; s++) {
      knockOut(m, 1);
      for (let i = 0; i < DEFAULT_RULES.respawnDelayFrames + 2; i++) ev.push(...stepMatch(m, []));
    }
    expect(m.fighters[1].eliminated).toBe(true);
    expect(ev.some((e) => e.type === 'matchEnd' && e.winner === 0)).toBe(true);
  });

  it('a normal match still runs out of time', () => {
    const m = createMatch([{ fighter: 'luigi' }, { fighter: 'luigi' }], { rules: { ...DEFAULT_RULES, countdownFrames: 0, matchFrames: 120 } });
    for (let i = 0; i < 121; i++) stepMatch(m, []);
    expect(m.phase).toBe('ended');
    expect(m.endReason).toBe('time');
  });
});

describe('Stand Still dummy', () => {
  it('is the default behaviour', () => {
    expect(new TrainingDummyController(DUMMY).behavior).toBe('stand');
  });

  for (const fighter of FIGHTER_ORDER) {
    it(`${fighter} never moves or attacks, even with the player right beside it`, () => {
      for (const stage of STAGE_ORDER) {
        const m = training(['luigi', fighter], stage);
        const dummy = new TrainingDummyController(DUMMY);
        besideDummy(m);
        const start = { x: m.fighters[DUMMY].x, y: m.fighters[DUMMY].y };
        const ev = run(m, dummy, 400);
        expect(ev.filter((e) => 'id' in e && e.id === DUMMY && ['attack', 'jump', 'dodge', 'projectile'].includes(e.type))).toEqual([]);
        expect(m.fighters[DUMMY].x).toBeCloseTo(start.x, 5);
        expect(m.fighters[DUMMY].y).toBeCloseTo(start.y, 5);
        expect(m.fighters[DUMMY].grounded).toBe(true);
      }
    });
  }

  it('still takes damage, flinches, gets launched and lands naturally', () => {
    const m = training();
    const dummy = new TrainingDummyController(DUMMY);
    besideDummy(m);
    const ev = run(m, dummy, 1, press('heavy'));
    ev.push(...run(m, dummy, 30));
    const d = m.fighters[DUMMY];
    expect(ev.some((e) => e.type === 'hit' && e.victim === DUMMY)).toBe(true);
    expect(d.damage).toBeGreaterThan(0);
    run(m, dummy, 240);
    expect(d.action).toBe('idle');
    expect(d.grounded).toBe(true);
  });

  it('respawns after a KO and goes back to standing still', () => {
    const m = training();
    const dummy = new TrainingDummyController(DUMMY);
    knockOut(m, DUMMY);
    run(m, dummy, DEFAULT_RULES.respawnDelayFrames + DEFAULT_RULES.respawnHoverFrames + 200);
    const d = m.fighters[DUMMY];
    expect(d.eliminated).toBe(false);
    expect(d.grounded).toBe(true);
    const x = d.x;
    const ev = run(m, dummy, 200);
    expect(ev.some((e) => e.type === 'attack' && e.id === DUMMY)).toBe(false);
    expect(d.x).toBeCloseTo(x, 5);
  });
});

describe('other dummy behaviours', () => {
  const eventsFor = (behavior: DummyBehavior, setup?: (m: MatchState) => void, player?: (i: number) => InputFrame, frames = 400) => {
    const m = training();
    const dummy = new TrainingDummyController(DUMMY, behavior);
    setup?.(m);
    return { m, ev: run(m, dummy, frames, player) };
  };

  it('Jump jumps in place periodically', () => {
    const { m, ev } = eventsFor('jump');
    const jumps = ev.filter((e) => e.type === 'jump' && e.id === DUMMY);
    expect(jumps.length).toBeGreaterThanOrEqual(3);
    expect(Math.abs(m.fighters[DUMMY].x - createMatch([{ fighter: 'luigi' }, { fighter: 'luigi' }], { stage: getStage('skyfall') }).fighters[DUMMY].x)).toBeLessThan(1);
    expect(ev.some((e) => e.type === 'attack' && e.id === DUMMY)).toBe(false);
  });

  it('Attack swings at a nearby player at intervals but never walks over', () => {
    const { m, ev } = eventsFor('attack', (mm) => besideDummy(mm, 60));
    const attacks = ev.filter((e) => e.type === 'attack' && e.id === DUMMY);
    expect(attacks.length).toBeGreaterThanOrEqual(3);
    expect(attacks.length).toBeLessThan(10);
    expect(attacks.every((e) => e.type === 'attack' && (e.slot === 'light' || e.slot === 'heavy'))).toBe(true);
    const far = eventsFor('attack', (mm) => { mm.fighters[0].x = mm.fighters[DUMMY].x - 400; });
    expect(far.ev.some((e) => e.type === 'attack' && e.id === DUMMY)).toBe(false);
    expect(Math.abs(m.fighters[DUMMY].x - far.m.fighters[DUMMY].x)).toBeLessThan(30);
  });

  it('Defend shields an incoming attack and never attacks', () => {
    const player = (i: number) => (i % 60 === 10 ? makeInput({ heavy: true }) : emptyInput());
    const { m, ev } = eventsFor('defend', (mm) => besideDummy(mm, 50), player);
    expect(ev.some((e) => e.type === 'shield' && e.id === DUMMY && e.up)).toBe(true);
    expect(ev.some((e) => e.type === 'shieldHit' && e.victim === DUMMY)).toBe(true);
    expect(ev.some((e) => e.type === 'attack' && e.id === DUMMY)).toBe(false);
    expect(m.fighters[DUMMY].damage).toBeLessThan(15);
  });

  it('Hold Shield keeps its shield up and re-raises it after a break', () => {
    const m = training();
    const dummy = new TrainingDummyController(DUMMY, 'shield');
    run(m, dummy, 30);
    expect(m.fighters[DUMMY].action).toBe('shield');
    m.fighters[DUMMY].shieldHp = 1;
    const ev = run(m, dummy, 20);
    expect(ev.some((e) => e.type === 'shieldBreak' && e.id === DUMMY)).toBe(true);
    run(m, dummy, DEFAULT_RULES.shield.breakStunFrames + 20);
    expect(m.fighters[DUMMY].action).toBe('shield');
  });

  it('Recover to Ledge gets back from offstage via the ledge, otherwise stands still', () => {
    const m = training();
    const dummy = new TrainingDummyController(DUMMY, 'recover');
    const x0 = m.fighters[DUMMY].x;
    const idle = run(m, dummy, 120);
    expect(idle.some((e) => 'id' in e && e.id === DUMMY && ['attack', 'jump', 'dodge', 'shield'].includes(e.type))).toBe(false);
    expect(m.fighters[DUMMY].x).toBeCloseTo(x0, 5);
    const d = m.fighters[DUMMY];
    d.x = m.stage.platforms[0].x2 + 80;
    d.y = 60;
    d.grounded = false;
    d.action = 'air' as typeof d.action;
    d.jumpsUsed = 1;
    const ev = run(m, dummy, 300);
    expect(ev.some((e) => e.type === 'ledgeGrab' && e.id === DUMMY) || ev.some((e) => e.type === 'land' && e.id === DUMMY)).toBe(true);
    expect(d.grounded).toBe(true);
    expect(d.eliminated || d.action === 'dead').toBe(false);
  });

  it('Hang helpers put a fighter on the nearest ledge, and shield health can be set', () => {
    const m = training();
    expect(hangOnNearestLedge(m, DUMMY)).toBe(true);
    expect(m.fighters[DUMMY].action).toBe('ledge');
    expect(m.fighters[DUMMY].invuln).toBe(DEFAULT_RULES.ledge.invulnFrames);
    setFighterShield(m, 0, 25);
    expect(m.fighters[0].shieldHp).toBe(25);
    setFighterShield(m, 0, 500);
    expect(m.fighters[0].shieldHp).toBe(DEFAULT_RULES.shield.maxHealth);
  });

  it('Normal CPU uses the regular CPU AI (approaches and attacks)', () => {
    const { m, ev } = eventsFor('cpu', (mm) => { mm.fighters[0].x = mm.fighters[DUMMY].x - 300; }, undefined, 900);
    expect(ev.some((e) => e.type === 'attack' && e.id === DUMMY)).toBe(true);
    expect(m.fighters[0].damage).toBeGreaterThan(0);
  });

  it('switching back to Stand Still stops it immediately', () => {
    const m = training();
    const dummy = new TrainingDummyController(DUMMY, 'cpu');
    run(m, dummy, 200);
    dummy.setBehavior('stand');
    run(m, dummy, 120); // let any move in progress finish and land
    const x = m.fighters[DUMMY].x;
    const ev = run(m, dummy, 300);
    expect(ev.some((e) => 'id' in e && e.id === DUMMY && ['attack', 'jump', 'dodge'].includes(e.type))).toBe(false);
    if (m.fighters[DUMMY].grounded) expect(m.fighters[DUMMY].x).toBeCloseTo(x, 0);
  });
});

describe('damage controls', () => {
  it('sets dummy damage immediately, clamped to 0–999%', () => {
    const m = training();
    setFighterDamage(m, DUMMY, 150);
    expect(m.fighters[DUMMY].damage).toBe(150);
    setFighterDamage(m, DUMMY, 5000);
    expect(m.fighters[DUMMY].damage).toBe(999);
    setFighterDamage(m, DUMMY, -20);
    expect(m.fighters[DUMMY].damage).toBe(0);
    setFighterDamage(m, DUMMY, Number.NaN);
    expect(m.fighters[DUMMY].damage).toBe(0);
    setFighterDamage(m, DUMMY, 42.6);
    expect(m.fighters[DUMMY].damage).toBe(43);
  });

  it('uses the real knockback formula: higher damage launches farther', () => {
    const launch = (pct: number) => {
      const m = training();
      const dummy = new TrainingDummyController(DUMMY);
      besideDummy(m);
      setFighterDamage(m, DUMMY, pct);
      const ev = run(m, dummy, 30, press('heavy'));
      const hit = ev.find((e) => e.type === 'hit' && e.victim === DUMMY);
      return hit && hit.type === 'hit' ? hit.launchSpeed : 0;
    };
    const low = launch(0);
    const high = launch(150);
    expect(low).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(low * 1.5);
  });
});

describe('reset positions', () => {
  it('puts both fighters back on their spawns, still and actionable, keeping damage', () => {
    const m = training(['goku', 'luigi']);
    const fresh = training(['goku', 'luigi']);
    const dummy = new TrainingDummyController(DUMMY);
    besideDummy(m);
    setFighterDamage(m, DUMMY, 120);
    run(m, dummy, 12, press('heavy'));
    // Mid-launch, mid-attack, with a projectile in the air.
    m.fighters[0].action = 'attack';
    m.fighters[0].move = 'special';
    m.projectiles.push({ ...({} as MatchState['projectiles'][number]), id: 99, owner: 0, kind: 'beam', x: 0, y: 0, vx: 500, vy: 0 });
    const dmg = m.fighters[DUMMY].damage;
    expect(m.fighters[DUMMY].action).toBe('hitstun');

    resetPositions(m);

    m.fighters.forEach((f, i) => {
      const s = fresh.fighters[i];
      expect([f.x, f.y]).toEqual([s.x, s.y]);
      expect([f.vx, f.vy, f.kbx, f.kby]).toEqual([0, 0, 0, 0]);
      expect(f.action).toBe('idle');
      expect(f.move).toBeNull();
      expect(f.hitstun).toBe(0);
      expect(f.hitstop).toBe(0);
      expect(f.grounded).toBe(true);
    });
    expect(m.fighters[DUMMY].damage).toBe(dmg);
    expect(m.projectiles).toEqual([]);
    // Nobody drifts or flies off after the reset.
    run(m, dummy, 60);
    m.fighters.forEach((f, i) => expect(f.x).toBeCloseTo(fresh.fighters[i].x, 5));
  });
});

describe('combo counter', () => {
  const hit = (damage: number): GameEvent => ({
    type: 'hit', attacker: 0, victim: DUMMY, damage, x: 0, y: 0, launchSpeed: 500, launchX: 1, launchY: 0, hitstun: 20, hitstop: 4,
  });

  it('chains hits while the dummy is stuck in hitstun and resets once it is free', () => {
    const m = training();
    const combo = new ComboTracker(DUMMY);
    const d = m.fighters[DUMMY];
    d.freeFrames = 0;
    combo.update(m, [hit(5)]);
    combo.update(m, [hit(7)]);
    combo.update(m, [hit(11)]);
    expect([combo.hits, combo.damage, combo.lastDamage, combo.active]).toEqual([3, 23, 11, true]);
    d.freeFrames = 1; // dummy regained control
    combo.update(m, []);
    expect(combo.active).toBe(false);
    expect(combo.hits).toBe(3); // last combo stays on screen
    d.freeFrames = 0;
    combo.update(m, [hit(4)]);
    expect([combo.hits, combo.damage]).toEqual([1, 4]);
    expect(combo.best).toBe(3);
  });

  it('does not merge separate hits into one infinite combo', () => {
    const m = training();
    const dummy = new TrainingDummyController(DUMMY);
    const combo = new ComboTracker(DUMMY);
    besideDummy(m, 30);
    // Jab (Luigi's is a two-hit One-Two), wait for the dummy to fully recover, jab again.
    let total = 0;
    let lastJab = 0;
    for (let k = 0; k < 3; k++) {
      lastJab = 0;
      for (let i = 0; i < 150; i++) {
        const ev = stepMatch(m, [i === 0 ? makeInput({ light: true }) : emptyInput(), dummy.decide(m)]);
        lastJab += ev.filter((e) => e.type === 'hit' && e.victim === DUMMY).length;
        combo.update(m, ev);
      }
      total += lastJab;
      besideDummy(m, 30);
    }
    expect(lastJab).toBeGreaterThan(0);
    expect(total).toBe(lastJab * 3);
    expect(combo.hits).toBe(lastJab);
    expect(combo.active).toBe(false);
  });

  it('honours a configurable grace window and ends on KO', () => {
    const m = training();
    const combo = new ComboTracker(DUMMY, 10);
    const d = m.fighters[DUMMY];
    d.freeFrames = 0;
    combo.update(m, [hit(5)]);
    d.freeFrames = 8;
    combo.update(m, []);
    expect(combo.active).toBe(true);
    combo.update(m, [hit(5)]);
    expect(combo.hits).toBe(2);
    combo.update(m, [{ type: 'ko', id: DUMMY, x: 0, y: 0, by: 0 }]);
    expect(combo.active).toBe(false);
  });

  it('counts real hits and their damage from the simulation', () => {
    const m = training();
    const dummy = new TrainingDummyController(DUMMY);
    const combo = new ComboTracker(DUMMY);
    besideDummy(m);
    for (let i = 0; i < 40; i++) combo.update(m, stepMatch(m, [i === 0 ? makeInput({ heavy: true }) : emptyInput(), dummy.decide(m)]));
    expect(combo.hits).toBeGreaterThanOrEqual(1);
    expect(combo.damage).toBeCloseTo(m.fighters[DUMMY].damage, 5);
  });
});
