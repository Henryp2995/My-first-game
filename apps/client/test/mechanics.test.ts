import { describe, expect, it } from 'vitest';
import { createMatch, getStage, makeInput, emptyInput, TRAINING_RULES, type FighterAction } from '@arena-rush/shared';
import { ANIM_STATES, resolveAnimState, simState, type StateInputs } from '../src/anim/states';
import { SPRITE_FALLBACKS } from '../src/render/characters/manifest';
import { sampleStateFrame } from '../src/anim/controller';
import { TrainingSession, SHIELD_PRESETS } from '../src/training/session';

const inputs = (action: FighterAction, extra: Partial<StateInputs> = {}): StateInputs => ({
  action, eliminated: false, grounded: false, speedRatio: 0, vy: 0, move: null, tumble: false,
  jumpStartLeft: 0, landLeft: 0, koLeft: 0, ...extra,
});

describe('ledge & shield animation states', () => {
  it('maps every new simulation action to its own animation state', () => {
    expect(simState(inputs('ledge'))).toBe('ledgeHang');
    expect(simState(inputs('ledgeClimb'))).toBe('ledgeClimb');
    expect(simState(inputs('ledgeRoll'))).toBe('ledgeRoll');
    expect(simState(inputs('shield', { grounded: true }))).toBe('shield');
    expect(simState(inputs('shieldRelease', { grounded: true }))).toBe('shield');
    expect(simState(inputs('shieldBreak'))).toBe('shieldBreak');
  });

  it('a landing flourish never overrides hanging, shielding or a shield-break stun', () => {
    for (const a of ['ledge', 'shield', 'shieldBreak'] as FighterAction[]) {
      expect(resolveAnimState(inputs(a, { grounded: true, landLeft: 5 }))).not.toBe('land');
    }
  });

  it('every new state produces a valid procedural pose for every fighter', () => {
    for (const state of ['ledgeHang', 'ledgeClimb', 'ledgeRoll', 'shield', 'shieldBreak'] as const) {
      expect(ANIM_STATES).toContain(state);
      for (const id of ['luigi', 'goku', 'gundam', 'vader', 'gnw'] as const) {
        const f = sampleStateFrame(id, state, 12);
        expect(f.state).toBe(state);
        for (const v of [f.pose.lean, f.pose.bob, ...f.pose.armF, ...f.pose.armB, ...f.pose.legF, ...f.pose.legB]) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('sprite sheets without the new states fall back to the closest existing art', () => {
    expect(SPRITE_FALLBACKS.ledgeHang).toEqual(['rise', 'fall']);
    expect(SPRITE_FALLBACKS.shieldBreak).toEqual(['hit']);
    for (const s of ['ledgeHang', 'ledgeClimb', 'ledgeRoll', 'shield', 'shieldBreak'] as const) expect(SPRITE_FALLBACKS[s]?.length).toBeGreaterThan(0);
  });
});

describe('training: shield & ledge practice', () => {
  const session = () => new TrainingSession(createMatch([{ fighter: 'luigi' }, { fighter: 'luigi' }], { rules: TRAINING_RULES, stage: getStage('final') }), 0, 1);

  it('sets the dummy shield through the presets', () => {
    const s = session();
    expect(s.dummyShieldPercent).toBe(100);
    for (const p of SHIELD_PRESETS.slice(1)) {
      s.cycleDummyShield(1);
      expect(Math.round(s.dummyShieldPercent)).toBe(p);
    }
    s.cycleDummyShield(1);
    expect(s.dummyShieldPercent).toBe(100);
  });

  it('hangs the dummy or the player on a ledge for recovery practice', () => {
    const s = session();
    expect(s.hangOnLedge('dummy')).toBe(true);
    expect(s.match.fighters[1].action).toBe('ledge');
    expect(s.hangOnLedge('player')).toBe(true);
    expect(s.match.fighters[0].action).toBe('ledge');
    // Different ledges: one per fighter.
    expect(s.match.fighters[0].ledge!.x).not.toBe(s.match.fighters[1].ledge!.x);
    // The player can climb up from it.
    for (let i = 0; i < 10; i++) s.step(emptyInput());
    const toward = s.match.fighters[0].ledge!.dir > 0 ? { right: true } : { left: true };
    for (let i = 0; i < 30; i++) s.step(makeInput(toward));
    expect(s.match.fighters[0].grounded).toBe(true);
  });

  it('Hold Shield dummy shield takes damage that shows in the session', () => {
    const s = session();
    s.setBehavior('shield');
    const [p, d] = s.match.fighters;
    p.x = d.x - 50;
    p.facing = 1;
    for (let i = 0; i < 10; i++) s.step(emptyInput());
    const before = s.dummyShieldPercent;
    for (let i = 0; i < 40; i++) s.step(i === 0 ? makeInput({ heavy: true }) : emptyInput());
    expect(s.dummyShieldPercent).toBeLessThan(before - 15);
    expect(d.damage).toBe(0);
  });
});
