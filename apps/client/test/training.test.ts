import { describe, expect, it } from 'vitest';
import {
  createMatch, DEFAULT_RULES, emptyInput, FIGHTER_ORDER, getStage, makeInput, STAGE_ORDER, TRAINING_RULES,
  type FighterId, type MatchState,
} from '@arena-rush/shared';
import { DAMAGE_PRESETS, stepDamagePreset, TrainingSession } from '../src/training/session';
import { isTraining, slotDescription, slotLabel, trainingSetup, type MatchSetup } from '../src/scenes/types';

function session(player: FighterId = 'luigi', dummy: FighterId = 'luigi', stage = 'skyfall'): TrainingSession {
  const setup = trainingSetup(player, dummy, stage as MatchSetup['stage']);
  const m = createMatch(setup.players, { rules: TRAINING_RULES, stage: getStage(stage), seed: 9 });
  return new TrainingSession(m, 0, 1);
}

function stand(m: MatchState, gap = 40) {
  const [p, d] = m.fighters;
  p.x = d.x - gap;
  p.y = d.y;
  p.facing = 1;
}

describe('training mode selection', () => {
  it('builds a training setup: you vs a dummy on the chosen stage', () => {
    const s = trainingSetup('goku', 'vader', 'final');
    expect(isTraining(s)).toBe(true);
    expect(s.stage).toBe('final');
    expect(s.players).toEqual([{ fighter: 'goku', control: 'human' }, { fighter: 'vader', control: 'dummy' }]);
    expect(slotLabel(s, 1)).toBe('DUMMY');
    expect(slotDescription(s, 1)).toBe('TRAINING DUMMY');
  });

  it('leaves Player vs CPU setups as versus', () => {
    const versus: MatchSetup = { players: [{ fighter: 'luigi', control: 'human' }, { fighter: 'sheik', control: 'cpu', difficulty: 'hard' }] };
    expect(isTraining(versus)).toBe(false);
    expect(slotLabel(versus, 1)).toBe('CPU');
  });

  it('works with every fighter (as player or dummy) on every stage', () => {
    for (const stage of STAGE_ORDER) {
      for (const f of FIGHTER_ORDER) {
        const s = session(f, FIGHTER_ORDER[(FIGHTER_ORDER.indexOf(f) + 3) % FIGHTER_ORDER.length], stage);
        for (let i = 0; i < 120; i++) s.step(makeInput({ right: i % 40 < 20, light: i % 30 === 0 }));
        expect(s.match.phase).toBe('playing');
        expect(s.match.fighters.every((x) => !x.eliminated)).toBe(true);
      }
    }
  });
});

describe('TrainingSession', () => {
  it('defaults to a Stand Still dummy that never attacks', () => {
    const s = session();
    expect(s.settings.behavior).toBe('stand');
    stand(s.match);
    const events = Array.from({ length: 300 }, () => s.step(emptyInput())).flat();
    expect(events.some((e) => e.type === 'attack' && e.id === 1)).toBe(false);
  });

  it('pauses the simulation while the settings panel is open', () => {
    const s = session();
    s.step(emptyInput());
    const frame = s.match.frame;
    const before = JSON.stringify(s.match.fighters);
    s.paused = true;
    for (let i = 0; i < 100; i++) expect(s.step(makeInput({ right: true, light: true }))).toEqual([]);
    expect(s.match.frame).toBe(frame);
    expect(JSON.stringify(s.match.fighters)).toBe(before);
    s.paused = false;
    s.step(makeInput({ right: true }));
    expect(s.match.frame).toBe(frame + 1);
  });

  it('can change dummy damage while paused, and it applies immediately', () => {
    const s = session();
    s.paused = true;
    s.setDummyDamage(150);
    expect(s.dummyDamage).toBe(150);
    s.setDummyDamage(999);
    expect(s.dummyDamage).toBe(999);
    s.resetDummyDamage();
    expect(s.dummyDamage).toBe(0);
  });

  it('steps through the damage presets in both directions', () => {
    expect(DAMAGE_PRESETS).toEqual([0, 25, 50, 75, 100, 150]);
    expect(stepDamagePreset(0, 1)).toBe(25);
    expect(stepDamagePreset(100, 1)).toBe(150);
    expect(stepDamagePreset(150, 1)).toBe(0);
    expect(stepDamagePreset(0, -1)).toBe(150);
    expect(stepDamagePreset(60, 1)).toBe(75); // from a custom value
    expect(stepDamagePreset(60, -1)).toBe(50);
  });

  it('cycles dummy behaviours and resets positions', () => {
    const s = session();
    expect(s.cycleBehavior()).toBe('jump');
    expect(s.cycleBehavior(-1)).toBe('stand');
    stand(s.match);
    for (let i = 0; i < 20; i++) s.step(i === 0 ? makeInput({ heavy: true }) : emptyInput());
    s.resetPositions();
    const fresh = createMatch(s.match.fighters.map((f) => ({ fighter: f.fighter })), { rules: TRAINING_RULES, stage: getStage('skyfall') });
    s.match.fighters.forEach((f, i) => {
      expect(f.x).toBe(fresh.fighters[i].x);
      expect(f.action).toBe('idle');
    });
    expect(s.combo.hits).toBe(0);
  });

  it('tracks combos and the player’s recent actions', () => {
    const s = session();
    stand(s.match);
    for (let i = 0; i < 40; i++) s.step(i === 0 ? makeInput({ heavy: true }) : emptyInput());
    expect(s.combo.hits).toBeGreaterThanOrEqual(1);
    expect(s.combo.damage).toBeCloseTo(s.dummyDamage, 5);
    for (let i = 0; i < 60; i++) s.step(emptyInput());
    for (let i = 0; i < 6; i++) s.step(makeInput({ jump: true }));
    expect(s.recent).toContain('HEAVY');
    expect(s.recent[s.recent.length - 1]).toBe('JUMP');
  });

  it('keeps unlimited stocks and no timer through long sessions', () => {
    const s = session();
    for (let i = 0; i < DEFAULT_RULES.matchFrames + 60; i++) s.step(emptyInput());
    expect(s.match.phase).toBe('playing');
    expect(s.match.timeLeft).toBe(TRAINING_RULES.matchFrames);
  });
});
