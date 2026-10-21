import {
  createMatch, emptyInput, makeInput, makeRules, stepMatch,
  type FighterId, type GameEvent, type InputFrame, type MatchState, type RulesConfig,
} from '../src';

export function setupMatch(fighters: FighterId[] = ['luigi', 'luigi'], rules: Partial<RulesConfig> = {}, seed = 1): MatchState {
  return createMatch(fighters.map((fighter) => ({ fighter })), { rules: makeRules({ countdownFrames: 0, ...rules }), seed });
}

/** Steps `frames` frames. `inputs` may be a fixed set or a function of the frame index. */
export function run(
  m: MatchState,
  frames: number,
  inputs: InputFrame[] | ((i: number) => InputFrame[]) = [],
): GameEvent[] {
  const all: GameEvent[] = [];
  for (let i = 0; i < frames; i++) {
    const frameInputs = typeof inputs === 'function' ? inputs(i) : inputs;
    all.push(...stepMatch(m, frameInputs));
  }
  return all;
}

/** Press a button for exactly one frame for player `idx`, then release. */
export function tap(m: MatchState, idx: number, input: Partial<InputFrame>): GameEvent[] {
  const inputs = m.fighters.map((_, i) => (i === idx ? makeInput(input) : emptyInput()));
  const ev = stepMatch(m, inputs);
  return [...ev, ...run(m, 1)];
}

export const idle = (): InputFrame[] => [emptyInput(), emptyInput(), emptyInput(), emptyInput()];
export { makeInput, emptyInput };
