/**
 * One frame of player input. Clients only ever send these — never positions or damage —
 * so the same simulation can later run authoritatively on the server.
 */
export interface InputFrame {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  light: boolean;
  heavy: boolean;
  special: boolean;
  dodge: boolean;
  /** Grab (also pummels while holding someone). */
  grab: boolean;
}

export const INPUT_KEYS: readonly (keyof InputFrame)[] = [
  'left', 'right', 'up', 'down', 'jump', 'light', 'heavy', 'special', 'dodge', 'grab',
];

export function emptyInput(): InputFrame {
  return {
    left: false, right: false, up: false, down: false, jump: false,
    light: false, heavy: false, special: false, dodge: false, grab: false,
  };
}

export function makeInput(partial: Partial<InputFrame> = {}): InputFrame {
  return { ...emptyInput(), ...partial };
}

/** Packs an input frame into a 10-bit integer (handy for networking later). */
export function encodeInput(input: InputFrame): number {
  let bits = 0;
  INPUT_KEYS.forEach((k, i) => { if (input[k]) bits |= 1 << i; });
  return bits;
}

export function decodeInput(bits: number): InputFrame {
  const out = emptyInput();
  INPUT_KEYS.forEach((k, i) => { out[k] = (bits & (1 << i)) !== 0; });
  return out;
}
