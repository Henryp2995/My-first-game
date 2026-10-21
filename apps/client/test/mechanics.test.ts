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

describe('grab & throw client layer', () => {
  it('maps grab actions to animation states and has poses for each throw direction', async () => {
    const { throwPose } = await import('../src/anim/controller');
    expect(simState(inputs('grab', { grounded: true }))).toBe('grab');
    expect(simState(inputs('holding', { grounded: true }))).toBe('hold');
    expect(simState(inputs('grabbed', { grounded: true }))).toBe('grabbed');
    expect(simState(inputs('throw', { grounded: true }))).toBe('throw');
    expect(simState(inputs('grabRelease', { grounded: true }))).toBe('land');
    for (const dir of ['forward', 'back', 'up', 'down'] as const) {
      for (const u of [0, 0.5, 1]) {
        const p = throwPose(dir, u);
        for (const v of [p.lean ?? 0, ...(p.armF ?? [0, 0]), ...(p.armB ?? [0, 0])]) expect(Number.isFinite(v)).toBe(true);
      }
    }
    for (const s of ['grab', 'hold', 'grabbed', 'throw'] as const) {
      expect(ANIM_STATES).toContain(s);
      expect(SPRITE_FALLBACKS[s]?.length).toBeGreaterThan(0);
      expect(sampleStateFrame('vader', s, 10).state).toBe(s);
    }
  });

  it('binds grab to J for player 1 without clashing with other controls', async () => {
    const { P1_KEYS } = await import('../src/input/keyboard');
    expect(P1_KEYS.grab).toEqual(['KeyJ']);
    const all = Object.entries(P1_KEYS).filter(([k]) => k !== 'up' && k !== 'jump').flatMap(([, v]) => v);
    expect(new Set(all).size).toBe(all.length);
  });

  it('records throw damage and launch for the training HUD, and exposes dummy throw/escape settings', () => {
    const s = new TrainingSession(createMatch([{ fighter: 'luigi' }, { fighter: 'luigi' }], { rules: TRAINING_RULES, stage: getStage('final') }), 0, 1);
    const [p, d] = s.match.fighters;
    p.x = d.x - 50;
    p.facing = 1;
    for (let i = 0; i < 20; i++) s.step(makeInput({ grab: i === 0 }));
    expect(d.action).toBe('grabbed');
    for (let i = 0; i < 30; i++) s.step(makeInput({ up: true }));
    expect(s.lastThrow).toMatchObject({ by: 'You', dir: 'up' });
    expect(s.lastThrow!.launch).toBeGreaterThan(0);
    expect(s.recent).toContain('GRAB');
    expect(s.recent).toContain('UP THROW');
    expect(s.dummyThrow).toBe('forward');
    expect(s.cycleDummyThrow(1)).toBe('back');
    expect(s.dummyEscapeMash).toBe(false);
    expect(s.toggleDummyEscape()).toBe(true);
  });
});
