import { describe, expect, it } from 'vitest';
import {
  CpuController, createFighter, createMatch, emptyInput, FIGHTERS, FIGHTER_ORDER, getStage, makeInput, makeRules, SKYFALL_ARENA, STAGE_ORDER,
  stepMatch, type FighterId,
} from '@arena-rush/shared';
import { allMoveIds, ATTACK_CLIPS, beatFrames, clipFor, GENERIC_CLIP, sampleAttack } from '../src/anim/clips';
import { AnimationController, previewFrame } from '../src/anim/controller';
import { isFinitePose, P } from '../src/anim/pose';
import { PROFILES } from '../src/anim/profiles';
import { ANIM_STATES, resolveAnimState, STATE_PRIORITY, type AnimState, type StateInputs } from '../src/anim/states';

const base: StateInputs = {
  action: 'idle', eliminated: false, grounded: true, speedRatio: 0, vy: 0, move: null, tumble: false,
  jumpStartLeft: 0, landLeft: 0, koLeft: 0,
};

describe('animation data', () => {
  it('has a profile for every fighter, with distinct movement', () => {
    for (const id of FIGHTER_ORDER) expect(PROFILES[id], id).toBeDefined();
    const gaits = new Set(FIGHTER_ORDER.map((id) => JSON.stringify(PROFILES[id].run)));
    expect(gaits.size).toBeGreaterThanOrEqual(8);
  });

  it('has a dedicated clip for every move in the roster (no generic fallbacks)', () => {
    for (const { fighter, slot, id } of allMoveIds()) {
      expect(ATTACK_CLIPS[id], `${fighter} ${slot} (${id})`).toBeDefined();
      expect(clipFor(id)).not.toBe(GENERIC_CLIP);
    }
  });
});

describe('attack clips are synced to real hitbox timing', () => {
  for (const { fighter, slot, id } of allMoveIds()) {
    it(`${fighter} ${slot}`, () => {
      const move = FIGHTERS[fighter].moves[slot];
      const clip = clipFor(id);
      const rest = P(PROFILES[fighter].stance);
      expect(sampleAttack(clip, move, move.startup - 1, rest).phase).toBe('startup');
      const first = sampleAttack(clip, move, move.startup, rest);
      expect(first.phase).toBe('active');
      expect(first.impactFrame).toBe(true);
      expect(sampleAttack(clip, move, move.startup + move.active, rest).phase).toBe('recovery');
      // Multi-hit moves: an impact on every hitbox group's first frame, and nowhere else.
      if (clip.beats) {
        const impacts: number[] = [];
        for (let fr = 0; fr < move.startup + move.active; fr++) if (sampleAttack(clip, move, fr, rest).impactFrame) impacts.push(fr);
        expect(impacts).toEqual(beatFrames(move));
      }
      for (let fr = 0; fr < move.startup + move.active + move.recovery; fr++) {
        expect(isFinitePose(sampleAttack(clip, move, fr, rest).pose)).toBe(true);
      }
    });
  }

  it('heavier fighters hold their windup longer before the strike', () => {
    const move = FIGHTERS.vader.moves.heavy;
    const clip = clipFor(move.id);
    const rest = P(PROFILES.vader.stance);
    const target = P({ ...rest, ...clip.windup }).armF[0];
    const heldFrames = (heft: number) => {
      let n = 0;
      for (let fr = 0; fr < move.startup; fr++) if (Math.abs(sampleAttack(clip, move, fr, rest, heft).pose.armF[0] - target) < 0.05) n++;
      return n;
    };
    expect(heldFrames(1.5)).toBeGreaterThan(heldFrames(0.8));
  });

  it('spinning attacks flip the drawn facing during the active frames', () => {
    const move = FIGHTERS.sheik.moves.heavy;
    const clip = clipFor(move.id);
    const rest = P(PROFILES.sheik.stance);
    const flips = new Set<boolean>();
    for (let fr = move.startup; fr < move.startup + move.active; fr++) flips.add(sampleAttack(clip, move, fr, rest).pose.flip);
    expect(flips).toEqual(new Set([true, false]));
  });
});

describe('state resolution', () => {
  const cases: [Partial<StateInputs>, AnimState | null][] = [
    [{}, 'idle'],
    [{ speedRatio: 0.4 }, 'walk'],
    [{ speedRatio: 0.9, action: 'run' }, 'run'],
    [{ action: 'air', grounded: false, vy: -400 }, 'rise'],
    [{ action: 'air', grounded: false, vy: 300 }, 'fall'],
    [{ action: 'landing' }, 'land'],
    [{ action: 'dodge' }, 'dodge'],
    [{ action: 'hitstun' }, 'hit'],
    [{ action: 'hitstun', tumble: true }, 'knockback'],
    [{ action: 'attack', move: 'heavy' }, 'heavy'],
    [{ action: 'attack', move: 'aerial', grounded: false }, 'aerial'],
    [{ action: 'respawning' }, 'respawn'],
    [{ action: 'dead' }, null],
    [{ action: 'dead', koLeft: 10 }, 'ko'],
    [{ action: 'air', grounded: false, vy: -800, jumpStartLeft: 3 }, 'jumpStart'],
    [{ landLeft: 4 }, 'land'],
  ];
  for (const [over, want] of cases) {
    it(`${JSON.stringify(over)} → ${want}`, () => {
      expect(resolveAnimState({ ...base, ...over })).toBe(want);
    });
  }

  it('event states never override attacks or hit reactions', () => {
    expect(resolveAnimState({ ...base, action: 'attack', move: 'light', landLeft: 6 })).toBe('light');
    expect(resolveAnimState({ ...base, action: 'hitstun', grounded: false, jumpStartLeft: 3 })).toBe('hit');
    expect(STATE_PRIORITY.hit).toBeGreaterThan(STATE_PRIORITY.light);
    expect(STATE_PRIORITY.light).toBeGreaterThan(STATE_PRIORITY.land);
  });

  it('covers every declared state with a priority', () => {
    for (const s of ANIM_STATES) expect(STATE_PRIORITY[s]).toBeTypeOf('number');
  });
});

describe('AnimationController', () => {
  it('blends into new states instead of snapping (except hits)', () => {
    const m = createMatch([{ fighter: 'luigi' }, { fighter: 'sheik' }], { rules: makeRules({ countdownFrames: 0 }) });
    const f = m.fighters[0];
    const anim = new AnimationController('luigi', 0);
    for (let i = 0; i < 30; i++) anim.update(f);
    const idle = anim.update(f)!.pose;
    f.vx = FIGHTERS.luigi.stats.runSpeed;
    f.action = 'run';
    const first = anim.update(f)!;
    expect(first.state).toBe('run');
    // One frame into the transition the pose is still close to idle.
    expect(Math.abs(first.pose.legF[0] - idle.legF[0])).toBeLessThan(0.4);
  });

  it('plays jump startup, rise, and a landing squash from events', () => {
    const m = createMatch([{ fighter: 'luigi' }, { fighter: 'sheik' }], { rules: makeRules({ countdownFrames: 0 }) });
    const f = m.fighters[0];
    f.x = 0;
    const anim = new AnimationController('luigi', 0);
    const seen: AnimState[] = [];
    let minSquash = 1;
    for (let i = 0; i < 120; i++) {
      const ev = stepMatch(m, [makeInput({ jump: i < 20 }), emptyInput()]);
      for (const e of ev) anim.onEvent(e);
      const frame = anim.update(f)!;
      if (!seen.includes(frame.state)) seen.push(frame.state);
      if (frame.state === 'land') minSquash = Math.min(minSquash, frame.squashY);
    }
    expect(seen).toEqual(expect.arrayContaining(['jumpStart', 'rise', 'fall', 'land', 'idle']));
    expect(seen.indexOf('jumpStart')).toBeLessThan(seen.indexOf('rise'));
    expect(minSquash).toBeLessThan(1);
  });

  it('rigid fighters barely squash; cartoon fighters squash a lot', () => {
    expect(PROFILES.gundam.squash).toBeLessThan(0.3);
    expect(PROFILES.luigi.squash).toBeGreaterThan(1);
  });

  for (const stage of STAGE_ORDER) {
    it(`animates every fighter through a CPU match on ${stage} with no invalid frames`, () => {
      for (const id of FIGHTER_ORDER) {
        const m = createMatch([{ fighter: id }, { fighter: FIGHTER_ORDER[(FIGHTER_ORDER.indexOf(id) + 3) % FIGHTER_ORDER.length] }], {
          rules: makeRules({ countdownFrames: 0 }), stage: getStage(stage), seed: 3,
        });
        const cpus = [new CpuController(0, 'expert', 1), new CpuController(1, 'hard', 2)];
        const anims = m.fighters.map((f) => new AnimationController(f.fighter, f.id));
        const states = new Set<AnimState>();
        let jumped = false;
        for (let i = 0; i < 60 * 25 && m.phase !== 'ended'; i++) {
          for (const e of stepMatch(m, cpus.map((c) => c.decide(m)))) {
            anims.forEach((a) => a.onEvent(e));
            if (e.type === 'jump' && e.id === 0) jumped = true;
          }
          m.fighters.forEach((f, k) => {
            const frame = anims[k].update(f);
            const visible = f.action !== 'dead' && !f.eliminated;
            if (visible) {
              expect(frame, `${id}: ${f.action}`).not.toBeNull();
              expect(isFinitePose(frame!.pose)).toBe(true);
              expect(Number.isFinite(frame!.squashX) && Number.isFinite(frame!.squashY)).toBe(true);
              if (k === 0) states.add(frame!.state);
            }
          });
        }
        for (const s of ['idle', 'run', 'fall'] as AnimState[]) expect(states, `${id} on ${stage}`).toContain(s);
        // Some CPUs go straight from jump startup into an aerial, so either counts as "going up".
        if (jumped) expect(states.has('rise') || states.has('jumpStart'), `${id} on ${stage}`).toBe(true);
        expect([...states].some((s) => ['light', 'heavy', 'special', 'aerial'].includes(s)), id).toBe(true);
      }
    });
  }

  it('plays a KO animation after a blast-zone KO, then hides the fighter', () => {
    const m = createMatch([{ fighter: 'batman' }, { fighter: 'goku' }], { rules: makeRules({ countdownFrames: 0 }) });
    const anim = new AnimationController('goku', 1);
    Object.assign(m.fighters[1], { x: 5000, grounded: false, action: 'air' });
    const ev = stepMatch(m, [createFighter(0, 'batman', SKYFALL_ARENA, 3).prevInput, createFighter(1, 'goku', SKYFALL_ARENA, 3).prevInput]);
    ev.forEach((e) => anim.onEvent(e));
    expect(anim.update(m.fighters[1])?.state).toBe('ko');
    for (let i = 0; i < 60; i++) anim.update(m.fighters[1]);
    expect(anim.update(m.fighters[1])).toBeNull();
  });

  it('preview frames work for every fighter and mode', () => {
    for (const id of FIGHTER_ORDER as FighterId[]) {
      for (const mode of ['idle', 'victory', 'hit', 'run'] as const) {
        for (const t of [0, 17, 123]) expect(isFinitePose(previewFrame(id, mode, t).pose)).toBe(true);
      }
    }
  });

  it('never changes gameplay: the sim result is identical with or without animation', () => {
    const play = (withAnim: boolean) => {
      const m = createMatch([{ fighter: 'vader' }, { fighter: 'spiderman' }], { rules: makeRules({ countdownFrames: 0 }), seed: 9 });
      const cpus = [new CpuController(0, 'hard', 1), new CpuController(1, 'hard', 2)];
      const anims = m.fighters.map((f) => new AnimationController(f.fighter, f.id));
      for (let i = 0; i < 1200; i++) {
        const ev = stepMatch(m, cpus.map((c) => c.decide(m)));
        if (withAnim) {
          ev.forEach((e) => anims.forEach((a) => a.onEvent(e)));
          m.fighters.forEach((f, k) => anims[k].update(f));
        }
      }
      return JSON.stringify(m.fighters.map((f) => [f.x, f.y, f.damage, f.stocks]));
    };
    expect(play(true)).toBe(play(false));
  });

});
