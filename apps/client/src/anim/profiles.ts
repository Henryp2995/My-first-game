import type { FighterId } from '@arena-rush/shared';
import type { Pose } from './pose';

/** A locomotion cycle, described by a few numbers instead of hand-placed keyframes. */
export interface GaitDef {
  /** Cycle speed in radians per frame. */
  cadence: number;
  /** Thigh swing amplitude (radians). */
  stride: number;
  /** How high the knee lifts on the forward swing. */
  kneeLift: number;
  armSwing: number;
  /** swing: opposite-arm swing · back: ninja run, arms trailing · guard: fists up · stiff: straight-arm robot swing · saber: weapon held forward */
  armStyle: 'swing' | 'back' | 'guard' | 'stiff' | 'saber';
  lean: number;
  /** Vertical bounce per step (px). */
  bounce: number;
}

/** How a fighter moves and emotes. All visual — gameplay never reads this. */
export interface AnimProfile {
  stance: Partial<Pose>;
  breath: { bob: number; sway: number; period: number };
  walk: GaitDef;
  run: GaitDef;
  rise: Partial<Pose>;
  fall: Partial<Pose>;
  doubleJump: 'flip' | 'tuck' | 'thruster';
  /** Squash & stretch strength: 0 = rigid armor, 1 = normal, >1 = rubbery cartoon. */
  squash: number;
  /** >1 = heavier feel: longer anticipation, bigger impact, slower blends. */
  heft: number;
  /** Quantize animation time to this many frames (LCD look). */
  stepped?: number;
  /** Snap joint angles to small increments (mechanical servo look). */
  rigid?: boolean;
  victory: { keys: Partial<Pose>[]; period: number; hop?: number };
  secondary: { cape?: boolean; hair?: 'braid' | 'headband' | null };
}

const AIR_RISE: Partial<Pose> = { legF: [0.9, 1.4], legB: [0.25, 1.0], armF: [2.5, 0.3], armB: [1.8, 0.4] };
const AIR_FALL: Partial<Pose> = { legF: [0.3, 0.4], legB: [-0.2, 0.6], armF: [1.6, 0.3], armB: [-1.6, 0.3] };

export const PROFILES: Record<FighterId, AnimProfile> = {
  gnw: {
    stance: { lean: 0.02, armF: [0.6, 1.1], armB: [-0.5, 0.8], legF: [0.25, 0.2], legB: [-0.2, 0.15] },
    breath: { bob: 1, sway: 0, period: 60 },
    walk: { cadence: 0.2, stride: 0.7, kneeLift: 1.0, armSwing: 0.8, armStyle: 'stiff', lean: 0.1, bounce: 2 },
    run: { cadence: 0.36, stride: 0.95, kneeLift: 1.3, armSwing: 0.9, armStyle: 'swing', lean: 0.22, bounce: 3 },
    rise: AIR_RISE,
    fall: AIR_FALL,
    doubleJump: 'tuck',
    squash: 0.5,
    heft: 1,
    stepped: 5,
    victory: {
      keys: [
        { armF: [2.9, 0.1], armB: [2.4, 0.3], legF: [0.3, 0.1], legB: [-0.3, 0.1], prop: 'hammer', lean: -0.1 },
        { armF: [1.4, 0.1], armB: [-0.8, 0.4], legF: [0.5, 0.6], legB: [-0.4, 0.1], prop: 'hammer', lean: 0.2 },
      ],
      period: 40,
    },
    secondary: {},
  },
  luigi: {
    stance: { lean: 0.04, armF: [0.45, 0.5], armB: [-0.45, 0.4], legF: [0.22, 0.15], legB: [-0.2, 0.1] },
    breath: { bob: 1.5, sway: 0.06, period: 90 },
    walk: { cadence: 0.18, stride: 0.75, kneeLift: 1.1, armSwing: 1.0, armStyle: 'swing', lean: 0.08, bounce: 3 },
    run: { cadence: 0.3, stride: 1.05, kneeLift: 1.4, armSwing: 1.2, armStyle: 'swing', lean: 0.22, bounce: 4 },
    rise: { ...AIR_RISE, armF: [2.9, 0.2], armB: [2.4, 0.3] },
    fall: { ...AIR_FALL, armF: [2.2, 0.4], armB: [-2.0, 0.3], expression: 'hurt' },
    doubleJump: 'flip',
    squash: 1.35,
    heft: 1,
    victory: { keys: [{ armF: [3.0, 0.2], armB: [-0.4, 0.8], legF: [0.4, 0.8], legB: [-0.2, 0.6], expression: 'happy', lean: -0.1 }], period: 80, hop: 18 },
    secondary: {},
  },
  sheik: {
    stance: { lean: 0.18, bob: 5, armF: [1.25, 1.5], armB: [0.55, 1.7], legF: [0.5, 0.6], legB: [-0.45, 0.35] },
    breath: { bob: 1.2, sway: 0.05, period: 90 },
    walk: { cadence: 0.22, stride: 0.7, kneeLift: 1.0, armSwing: 0.3, armStyle: 'guard', lean: 0.25, bounce: 2 },
    run: { cadence: 0.42, stride: 0.95, kneeLift: 1.3, armSwing: 0, armStyle: 'back', lean: 0.55, bounce: 3 },
    rise: { ...AIR_RISE, armF: [1.6, 1.4], armB: [-0.6, 0.5] },
    fall: { ...AIR_FALL, armF: [1.3, 1.2], armB: [-1.0, 0.4] },
    doubleJump: 'flip',
    squash: 0.7,
    heft: 0.85,
    victory: { keys: [{ armF: [0.85, 2.3], armB: [1.0, 2.35], legF: [0.3, 0.1], legB: [-0.3, 0.1], lean: -0.05, headTilt: -0.1 }], period: 120 },
    secondary: { hair: 'braid' },
  },
  spiderman: {
    stance: { lean: 0.35, bob: 11, armF: [1.25, 1.0], armB: [0.55, 1.3], legF: [0.85, 1.7], legB: [-0.6, 1.25], headTilt: -0.2 },
    breath: { bob: 1.5, sway: 0.05, period: 80 },
    walk: { cadence: 0.24, stride: 0.8, kneeLift: 1.2, armSwing: 0.6, armStyle: 'swing', lean: 0.3, bounce: 2 },
    run: { cadence: 0.38, stride: 1.0, kneeLift: 1.4, armSwing: 0.9, armStyle: 'swing', lean: 0.45, bounce: 3 },
    rise: { ...AIR_RISE, legF: [1.2, 2.0], legB: [0.5, 1.8], armF: [2.8, 0.2], armB: [2.4, 0.3] },
    fall: { ...AIR_FALL, legF: [0.7, 1.4], legB: [-0.4, 1.2], armF: [2.2, 0.6], armB: [-1.8, 0.5] },
    doubleJump: 'flip',
    squash: 1.1,
    heft: 0.9,
    victory: { keys: [{ bob: 16, lean: 0.3, armF: [0.15, 0.1], armB: [2.6, 0.3], legF: [0.9, 1.8], legB: [-0.5, 1.4], headTilt: -0.25 }], period: 120 },
    secondary: {},
  },
  batman: {
    stance: { lean: 0.05, armF: [0.35, 0.9], armB: [-0.25, 0.8], legF: [0.3, 0.15], legB: [-0.32, 0.1], flare: 0.1 },
    breath: { bob: 1, sway: 0.02, period: 120 },
    walk: { cadence: 0.16, stride: 0.65, kneeLift: 0.8, armSwing: 0.5, armStyle: 'swing', lean: 0.06, bounce: 1.5 },
    run: { cadence: 0.28, stride: 0.9, kneeLift: 1.1, armSwing: 0.8, armStyle: 'swing', lean: 0.2, bounce: 2 },
    rise: { ...AIR_RISE, armF: [2.0, 0.6], armB: [1.4, 0.6] },
    fall: { ...AIR_FALL, armF: [1.9, 0.3], armB: [-1.9, 0.3], flare: 1 },
    doubleJump: 'tuck',
    squash: 0.5,
    heft: 1.3,
    victory: { keys: [{ armF: [0.85, 2.3], armB: [1.0, 2.35], legF: [0.3, 0.1], legB: [-0.3, 0.1], lean: -0.05, flare: 0.35 }], period: 120 },
    secondary: { cape: true },
  },
  naruto: {
    stance: { lean: 0.25, bob: 4, armF: [0.95, 1.6], armB: [0.4, 1.5], legF: [0.5, 0.7], legB: [-0.45, 0.4] },
    breath: { bob: 1.5, sway: 0.06, period: 70 },
    walk: { cadence: 0.24, stride: 0.8, kneeLift: 1.1, armSwing: 0.8, armStyle: 'swing', lean: 0.15, bounce: 3 },
    run: { cadence: 0.42, stride: 1.0, kneeLift: 1.3, armSwing: 0, armStyle: 'back', lean: 0.55, bounce: 3 },
    rise: { ...AIR_RISE, armF: [2.7, 0.2], armB: [-0.8, 0.4] },
    fall: AIR_FALL,
    doubleJump: 'flip',
    squash: 1.1,
    heft: 0.95,
    victory: { keys: [{ armF: [1.7, 1.5], armB: [-0.4, 0.6], legF: [0.3, 0.1], legB: [-0.35, 0.1], expression: 'happy', lean: -0.05 }, { armF: [1.85, 1.4], armB: [-0.4, 0.6], legF: [0.3, 0.1], legB: [-0.35, 0.1], expression: 'happy', lean: -0.05 }], period: 26 },
    secondary: { hair: 'headband' },
  },
  goku: {
    stance: { lean: 0.12, bob: 3, armF: [1.3, 1.9], armB: [0.75, 1.95], legF: [0.55, 0.5], legB: [-0.5, 0.3] },
    breath: { bob: 1.2, sway: 0.04, period: 80 },
    walk: { cadence: 0.2, stride: 0.75, kneeLift: 1.0, armSwing: 0.2, armStyle: 'guard', lean: 0.12, bounce: 2 },
    run: { cadence: 0.34, stride: 1.0, kneeLift: 1.3, armSwing: 1.0, armStyle: 'swing', lean: 0.3, bounce: 3 },
    rise: AIR_RISE,
    fall: AIR_FALL,
    doubleJump: 'flip',
    squash: 0.9,
    heft: 1.15,
    victory: { keys: [{ armF: [3.0, 0.2], armB: [0.5, 1.9], legF: [0.35, 0.3], legB: [-0.3, 0.4], expression: 'happy' }], period: 90, hop: 10 },
    secondary: {},
  },
  gundam: {
    stance: { lean: 0.04, armF: [0.45, 0.9], armB: [-0.15, 0.7], legF: [0.3, 0.12], legB: [-0.32, 0.1] },
    breath: { bob: 0.8, sway: 0, period: 120 },
    walk: { cadence: 0.14, stride: 0.55, kneeLift: 0.7, armSwing: 0.35, armStyle: 'stiff', lean: 0.05, bounce: 2.5 },
    run: { cadence: 0.24, stride: 0.8, kneeLift: 0.9, armSwing: 0.5, armStyle: 'stiff', lean: 0.12, bounce: 3 },
    rise: { legF: [0.5, 0.9], legB: [0.1, 0.7], armF: [1.2, 0.6], armB: [0.6, 0.6] },
    fall: { legF: [0.3, 0.3], legB: [-0.15, 0.3], armF: [1.0, 0.3], armB: [-0.9, 0.3] },
    doubleJump: 'thruster',
    squash: 0.15,
    heft: 1.4,
    rigid: true,
    victory: { keys: [{ armF: [2.95, 0.1], armB: [-0.3, 0.6], legF: [0.35, 0.1], legB: [-0.35, 0.1], prop: 'saber', lean: -0.05 }], period: 120 },
    secondary: {},
  },
  vader: {
    stance: { lean: 0.02, armF: [0.6, 0.45], armB: [-0.18, 0.35], legF: [0.32, 0.1], legB: [-0.32, 0.08], prop: 'saber', flare: 0.15 },
    breath: { bob: 0.6, sway: 0.01, period: 150 },
    walk: { cadence: 0.13, stride: 0.55, kneeLift: 0.6, armSwing: 0.2, armStyle: 'saber', lean: 0.08, bounce: 1 },
    run: { cadence: 0.22, stride: 0.75, kneeLift: 0.8, armSwing: 0.3, armStyle: 'saber', lean: 0.12, bounce: 1.5 },
    rise: { ...AIR_RISE, armF: [1.2, 0.5], armB: [0.8, 0.6], prop: 'saber' },
    fall: { ...AIR_FALL, armF: [1.3, 0.3], armB: [-1.4, 0.3], prop: 'saber', flare: 1 },
    doubleJump: 'tuck',
    squash: 0.25,
    heft: 1.5,
    victory: { keys: [{ armF: [1.7, 0.25], armB: [0.3, 0.4], legF: [0.32, 0.1], legB: [-0.32, 0.08], flare: 0.3 }, { armF: [1.75, 0.3], armB: [0.3, 0.4], legF: [0.32, 0.1], legB: [-0.32, 0.08], flare: 0.35 }], period: 90 },
    secondary: { cape: true },
  },
};
