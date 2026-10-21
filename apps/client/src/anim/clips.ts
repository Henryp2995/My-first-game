import { FIGHTERS, type FighterId, type MoveDef, type MoveSlot } from '@arena-rush/shared';
import { clamp01, easeIn, easeOut, easeOutBack, mix, P, type Pose } from './pose';

/**
 * A data-driven attack animation. Timing is NOT stored here: the sampler derives it from the
 * move's real startup/active/recovery frames and hitbox group start frames, so animation can
 * never drift from gameplay.
 */
export interface AttackClip {
  /** Anticipation pose reached at the end of startup. */
  windup: Partial<Pose>;
  /** Impact pose on the first active frame. */
  strike: Partial<Pose>;
  /** Follow-through pose early in recovery (defaults to an overshoot of the strike). */
  follow?: Partial<Pose>;
  /** Multi-hit moves: a strike pose per hitbox group (cycled), snapped on each group's first frame. */
  beats?: Partial<Pose>[];
  /** Pose held between beats (defaults to windup). */
  between?: Partial<Pose>;
  /** Keep the strike pose for the whole active window (plunges, beams, held grabs). */
  hold?: boolean;
  /** Alternate the drawn facing every N active frames (spinning attacks). */
  spinFlip?: number;
  /** Fade out during startup and stay invisible until active (Sheik's vanish). */
  vanish?: boolean;
  /** Luigi's rocket: charge crouch with jitter, then horizontal flight. */
  rocket?: boolean;
  /** Visual-only squash/stretch impulse on impact: positive = stretch along the strike. */
  impact?: number;
  /** Prop (weapon) to show; held until 70% of recovery. */
  prop?: Pose['prop'];
}

const PUNCH_STANCE: Partial<Pose> = { lean: 0.25, legF: [0.55, 0.5], legB: [-0.45, 0.3], bob: 4 };
const JAB_STRING: AttackClip = {
  windup: { ...PUNCH_STANCE, armF: [0.6, 1.8], armB: [0.5, 1.8] },
  strike: { ...PUNCH_STANCE, armF: [1.57, 0], armB: [0.5, 1.8], expression: 'focus' },
  beats: [
    { ...PUNCH_STANCE, armF: [1.57, 0], armB: [0.5, 1.8], lean: 0.32, expression: 'focus' },
    { ...PUNCH_STANCE, armB: [1.57, 0], armF: [0.6, 1.8], lean: 0.32, expression: 'focus' },
  ],
  impact: 0.08,
};
const ONE_TWO: AttackClip = {
  windup: { armF: [-0.3, 1.7], armB: [0.2, 1.9], lean: 0.1, legF: [0.45, 0.3], legB: [-0.4, 0.15] },
  strike: { armF: [1.55, 0.05], armB: [0.2, 1.9], lean: 0.22, legF: [0.45, 0.3], legB: [-0.4, 0.15] },
  beats: [
    { armF: [1.55, 0.05], armB: [0.2, 1.9], lean: 0.22, legF: [0.45, 0.3], legB: [-0.4, 0.15] },
    { armB: [1.6, 0.05], armF: [-0.4, 1.5], lean: 0.38, legF: [0.6, 0.4], legB: [-0.4, 0.15] },
  ],
  impact: 0.1,
};
const SPIN_KICK: AttackClip = {
  windup: { legF: [0.6, 1.6], lean: -0.15, armF: [1.6, 1.0], armB: [0.4, 1.2] },
  strike: { legF: [1.62, 0], legB: [-0.1, 0], lean: -0.35, armF: [1.3, 0], armB: [-1.3, 0] },
  follow: { legF: [1.2, 0.4], legB: [-0.1, 0.1], lean: -0.2, armF: [1.0, 0.3], armB: [-1.0, 0.2] },
  spinFlip: 2,
  impact: 0.12,
};
const DIVE_KICK: AttackClip = {
  windup: { legF: [1.2, 2.0], legB: [0.7, 1.8], armF: [1.6, 1.0], armB: [-0.6, 0.6] },
  strike: { legF: [0.5, 0], legB: [-0.3, 1.4], lean: -0.25, armF: [-1.0, 0.4], armB: [-1.3, 0.4], expression: 'focus' },
  impact: 0.15,
};
const SABER_STRING: AttackClip = {
  windup: { lean: 0.18, legF: [0.5, 0.35], legB: [-0.45, 0.15], prop: 'saber', flare: 0.4, armF: [2.6, 0.3] },
  strike: { lean: 0.3, legF: [0.5, 0.35], legB: [-0.45, 0.15], prop: 'saber', flare: 0.6, armF: [0.85, 0.1] },
  beats: [
    { lean: 0.3, legF: [0.55, 0.35], legB: [-0.45, 0.15], prop: 'saber', flare: 0.6, armF: [0.85, 0.1] },
    { lean: 0.1, legF: [0.5, 0.3], legB: [-0.45, 0.15], prop: 'saber', flare: 0.5, armF: [2.2, 0.1], armB: [-0.6, 0.5] },
  ],
  between: { lean: 0.22, legF: [0.5, 0.35], legB: [-0.45, 0.15], prop: 'saber', flare: 0.5, armF: [1.6, 0.2] },
  prop: 'saber',
  impact: 0.06,
};
const OVERHEAD_SABER: AttackClip = {
  windup: { armF: [3.05, 0.1], armB: [2.6, 0.3], lean: -0.22, prop: 'saber', flare: 0.2, legF: [0.4, 0.3], legB: [-0.4, 0.2] },
  strike: { armF: [1.0, 0], armB: [0.7, 0.3], lean: 0.38, prop: 'saber', flare: 1, legF: [0.7, 0.5], legB: [-0.6, 0.2], expression: 'focus' },
  follow: { armF: [0.45, 0.1], armB: [0.5, 0.4], lean: 0.48, prop: 'saber', flare: 1, legF: [0.75, 0.6], legB: [-0.65, 0.2] },
  prop: 'saber',
  impact: 0.18,
};

/** Clips keyed by move id. Every move in the roster must appear here (enforced by tests). */
export const ATTACK_CLIPS: Record<string, AttackClip> = {
  // Mr. Game & Watch
  'gnw-flick': {
    windup: { armF: [-0.6, 1.4], lean: -0.1 },
    strike: { armF: [1.57, 0], armB: [-0.6, 0.6], lean: 0.25, legF: [0.5, 0.3], legB: [-0.5, 0.1] },
  },
  'gnw-hammer': {
    windup: { armF: [2.9, 0.1], armB: [2.6, 0.3], lean: -0.25, prop: 'hammer' },
    strike: { armF: [1.25, 0], armB: [0.9, 0.2], lean: 0.35, legF: [0.6, 0.5], legB: [-0.5, 0.2], prop: 'hammer' },
    follow: { armF: [0.7, 0.1], armB: [0.6, 0.3], lean: 0.45, legF: [0.65, 0.6], legB: [-0.55, 0.2], prop: 'hammer' },
    prop: 'hammer',
    impact: 0.2,
  },
  'gnw-judge': {
    windup: { armF: [2.9, 0.1], armB: [2.6, 0.3], lean: -0.25, prop: 'judge' },
    strike: { armF: [1.25, 0], armB: [0.9, 0.2], lean: 0.35, legF: [0.6, 0.5], legB: [-0.5, 0.2], prop: 'judge' },
    prop: 'judge',
    impact: 0.15,
  },
  'gnw-keydrop': {
    windup: { legF: [0.8, 1.6], legB: [0.6, 1.5], armF: [2.2, 0.4], armB: [2.0, 0.4], prop: 'key' },
    strike: { legF: [0.05, 0], legB: [-0.05, 0], armF: [2.8, 0.2], armB: [2.5, 0.2], prop: 'key' },
    hold: true,
    prop: 'key',
  },
  // Luigi
  'luigi-onetwo': ONE_TWO,
  'luigi-uppercut': {
    windup: { bob: 11, armF: [0.3, 2.2], lean: 0.35, legF: [0.7, 1.4], legB: [-0.4, 1.2], expression: 'focus' },
    strike: { armF: [3.05, 0], armB: [-0.8, 0.5], lean: -0.1, bob: -4, legF: [0.1, 0], legB: [-0.3, 0.7], expression: 'focus' },
    impact: 0.3,
  },
  'luigi-rocket': {
    windup: { bob: 10, lean: 0.6, armF: [-1.4, 0.3], armB: [-1.2, 0.3], legF: [0.8, 1.6], legB: [-0.2, 1.3], expression: 'focus' },
    strike: { spin: 1.45, armF: [0.1, 0], armB: [-0.1, 0], legF: [0.05, 0], legB: [-0.05, 0.1], expression: 'focus' },
    hold: true,
    rocket: true,
  },
  'luigi-downkick': {
    windup: { legF: [1.2, 2.0], legB: [0.7, 1.8], armF: [2.0, 0.6], armB: [1.6, 0.6] },
    strike: { legF: [0.15, 0], legB: [0.9, 1.6], armF: [2.6, 0.3], armB: [2.0, 0.2], lean: -0.2, expression: 'focus' },
    impact: 0.15,
  },
  // Sheik
  'sheik-flurry': JAB_STRING,
  'sheik-spinkick': SPIN_KICK,
  'sheik-vanish': {
    windup: { bob: 6, armF: [1.2, 1.9], armB: [1.0, 2.0], legF: [0.4, 0.8], legB: [-0.3, 0.6] },
    strike: { armF: [2.1, 0.2], armB: [1.6, 0.3], legF: [0.5, 0.2], legB: [-0.5, 0.2], lean: -0.1 },
    vanish: true,
    hold: true,
  },
  'sheik-diagkick': {
    windup: { legF: [1.0, 1.8], legB: [0.3, 1.2], armF: [1.4, 1.0], armB: [-0.4, 0.6] },
    strike: { legF: [1.0, 0], legB: [-0.3, 1.4], lean: -0.3, armF: [-1.0, 0.4], armB: [-1.3, 0.4] },
    impact: 0.1,
  },
  // Spider-Man
  'spidey-combo': JAB_STRING,
  'spidey-spinkick': SPIN_KICK,
  'spidey-web': {
    windup: { armF: [1.1, 0.9], armB: [0.3, 1.2], lean: 0.1 },
    strike: { armF: [1.6, 0], armB: [-0.4, 0.6], lean: 0.2, legF: [0.5, 0.4], legB: [-0.4, 0.2], expression: 'focus' },
    hold: true,
  },
  'spidey-webkick': {
    windup: { legF: [1.1, 1.9], legB: [0.6, 1.7], armF: [2.4, 0.4], armB: [2.0, 0.4] },
    strike: { legF: [0.25, 0], legB: [-0.15, 0.4], armF: [2.8, 0.2], armB: [2.5, 0.2], lean: -0.15 },
    hold: true,
    impact: 0.15,
  },
  // Batman
  'bat-combo': ONE_TWO,
  'bat-capestrike': {
    windup: { armF: [-1.0, 1.2], armB: [-0.6, 1.0], lean: -0.2, flare: 0.2 },
    strike: { armF: [1.45, 0], armB: [0.9, 0.3], lean: 0.4, legF: [0.65, 0.5], legB: [-0.55, 0.2], flare: 1, expression: 'focus' },
    follow: { armF: [1.0, 0.1], armB: [0.6, 0.4], lean: 0.5, legF: [0.7, 0.6], legB: [-0.6, 0.2], flare: 1 },
    impact: 0.2,
  },
  'bat-batarang': {
    windup: { armF: [-1.3, 1.6], armB: [0.6, 1.0], lean: -0.1 },
    strike: { armF: [1.45, 0.05], armB: [-0.5, 0.6], lean: 0.25, legF: [0.5, 0.4], legB: [-0.45, 0.2], flare: 0.5 },
    impact: 0.08,
  },
  'bat-capedive': {
    windup: { legF: [1.0, 1.7], legB: [0.6, 1.5], armF: [2.2, 0.4], armB: [1.9, 0.4], flare: 0.6 },
    strike: { legF: [0.45, 0.6], legB: [0.1, 0.8], armF: [2.0, 0.2], armB: [-2.0, 0.2], lean: 0.4, flare: 1 },
    hold: true,
  },
  // Naruto
  'naruto-taijutsu': JAB_STRING,
  'naruto-spinkick': SPIN_KICK,
  'naruto-rasengan': {
    windup: { bob: 8, lean: 0.3, armF: [1.15, 1.1], armB: [1.05, 1.3], legF: [0.7, 1.2], legB: [-0.4, 0.9], expression: 'focus' },
    strike: { lean: 0.55, armF: [1.57, 0], armB: [1.4, 0.3], legF: [0.8, 0.3], legB: [-0.7, 0.1], expression: 'focus' },
    hold: true,
    impact: 0.15,
  },
  'naruto-divestrike': DIVE_KICK,
  // Goku
  'goku-punches': JAB_STRING,
  'goku-chargedstrike': {
    windup: { bob: 6, lean: 0.15, armF: [-0.9, 2.1], armB: [1.2, 1.6], legF: [0.7, 1.0], legB: [-0.5, 0.5], expression: 'focus' },
    strike: { armF: [1.6, 0], armB: [-0.6, 0.8], lean: 0.45, legF: [0.75, 0.4], legB: [-0.65, 0.1], expression: 'focus' },
    impact: 0.25,
  },
  'goku-kamehameha': {
    windup: { bob: 7, lean: -0.15, armF: [-0.9, 2.2], armB: [-1.0, 2.25], legF: [0.6, 0.8], legB: [-0.55, 0.5], expression: 'focus' },
    strike: { lean: 0.25, armF: [1.57, 0], armB: [1.5, 0.05], legF: [0.65, 0.4], legB: [-0.6, 0.2], expression: 'focus' },
    hold: true,
    impact: 0.1,
  },
  'goku-energykick': DIVE_KICK,
  // Gundam RX-78
  'gundam-saber': SABER_STRING,
  'gundam-overhead': OVERHEAD_SABER,
  'gundam-rifle': {
    windup: { armF: [1.2, 0.5], armB: [-0.2, 0.7], lean: 0.05, prop: 'rifle' },
    strike: { armF: [1.57, 0], armB: [-0.3, 0.7], lean: 0.12, prop: 'rifle', legF: [0.45, 0.3], legB: [-0.45, 0.15] },
    follow: { armF: [1.85, 0.15], armB: [-0.3, 0.7], lean: -0.05, prop: 'rifle', legF: [0.45, 0.3], legB: [-0.45, 0.15] },
    prop: 'rifle',
  },
  'gundam-plunge': {
    windup: { armF: [2.6, 0.2], legF: [1.0, 1.6], legB: [0.6, 1.4], prop: 'saber' },
    strike: { armF: [0.05, 0], armB: [-0.6, 0.6], legF: [0.9, 1.5], legB: [0.5, 1.3], lean: 0.15, prop: 'saber' },
    hold: true,
    prop: 'saber',
  },
  // Darth Vader
  'vader-slash': SABER_STRING,
  'vader-cleave': OVERHEAD_SABER,
  'vader-choke': {
    windup: { armF: [0.9, 1.2], armB: [-0.2, 0.4], lean: -0.05, flare: 0.2 },
    strike: { armF: [1.75, 0.25], armB: [-0.25, 0.35], lean: -0.1, flare: 0.5, legF: [0.35, 0.1], legB: [-0.35, 0.1] },
    hold: true,
  },
  'vader-spin': {
    windup: { armF: [2.2, 0.3], legF: [0.9, 1.5], legB: [0.5, 1.3], prop: 'saber', flare: 0.6 },
    strike: { armF: [1.3, 0], armB: [-1.4, 0.2], legF: [0.6, 0.9], legB: [-0.2, 0.8], prop: 'saber', flare: 1, lean: 0.2 },
    spinFlip: 3,
    prop: 'saber',
    impact: 0.1,
  },
};

export interface AttackSample {
  pose: Pose;
  /** 'startup' | 'active' | 'recovery' plus 0..1 progress within the phase. */
  phase: 'startup' | 'active' | 'recovery';
  progress: number;
  /** True on the first frame of each hit (impact frame) — drives squash & effects. */
  impactFrame: boolean;
}

/** First frame of each hitbox group, in order — the beat times of a multi-hit move. */
export function beatFrames(move: MoveDef): number[] {
  const starts = new Map<number, number>();
  for (const hb of move.hitboxes) {
    const g = hb.group ?? 0;
    const s = hb.start ?? move.startup;
    starts.set(g, Math.min(starts.get(g) ?? Infinity, s));
  }
  const list = [...starts.values()].sort((a, b) => a - b);
  return list.length ? list : [move.startup];
}

/**
 * Samples an attack clip at `frame` of `move`. `rest` is the pose the attack starts from and
 * returns to; `heft` > 1 holds anticipation longer and settles slower (heavier feel).
 */
export function sampleAttack(clip: AttackClip, move: MoveDef, frame: number, rest: Pose, heft = 1): AttackSample {
  const windup = P({ ...rest, ...clip.windup });
  const strike = P({ ...rest, ...clip.strike });
  const activeEnd = move.startup + move.active;
  const beats = beatFrames(move);

  if (frame < move.startup) {
    // Anticipation: ease into the windup, reaching it a little early and holding (heavier = longer hold).
    const reach = Math.max(1, move.startup * (0.85 / heft));
    const t = clamp01(frame / reach);
    const pose = mix(rest, windup, easeOut(t));
    return { pose: withProp(pose, clip), phase: 'startup', progress: frame / Math.max(1, move.startup), impactFrame: false };
  }

  if (frame < activeEnd) {
    let pose = strike;
    let impactFrame = frame === move.startup;
    if (clip.beats && beats.length > 1) {
      // Multi-hit: snap to a strike pose on each hitbox group's first frame, ease back between.
      let i = 0;
      for (let k = 0; k < beats.length; k++) if (frame >= beats[k]) i = k;
      const beatPose = P({ ...rest, ...clip.beats[i % clip.beats.length] });
      const between = P({ ...rest, ...(clip.between ?? clip.windup) });
      const since = frame - beats[i];
      const next = beats[i + 1] ?? activeEnd;
      const span = Math.max(1, next - beats[i]);
      pose = since < 2 ? beatPose : mix(beatPose, between, easeIn(clamp01((since - 1) / span)));
      impactFrame = beats.includes(frame);
    } else if (!clip.hold) {
      // Single hit: snap to the strike on frame one, drift slightly past it while active.
      const t = clamp01((frame - move.startup) / Math.max(1, move.active));
      const follow = P({ ...rest, ...(clip.follow ?? clip.strike) });
      pose = mix(strike, follow, t * 0.35);
    }
    if (clip.spinFlip) pose = { ...pose, flip: Math.floor((frame - move.startup) / clip.spinFlip) % 2 === 1 };
    const progress = (frame - move.startup) / Math.max(1, move.active);
    return { pose: withProp(pose, clip), phase: 'active', progress: clamp01(progress), impactFrame };
  }

  // Recovery: follow-through overshoot, then settle back to rest.
  const r = clamp01((frame - activeEnd) / Math.max(1, move.recovery));
  const from = clip.beats ? P({ ...rest, ...clip.beats[(beats.length - 1) % clip.beats.length] }) : strike;
  const follow = P({ ...rest, ...(clip.follow ?? clip.strike) });
  const split = 0.3;
  let pose: Pose;
  if (r < split) pose = mix(from, follow, easeOutBack(r / split, 0.8));
  else pose = mix(follow, rest, easeOut((r - split) / (1 - split)));
  if (clip.prop && r < 0.7) pose = { ...pose, prop: clip.prop };
  return { pose, phase: 'recovery', progress: r, impactFrame: false };
}

function withProp(pose: Pose, clip: AttackClip): Pose {
  return clip.prop ? { ...pose, prop: clip.prop } : pose;
}

/** All move ids in the roster that need a clip. */
export function allMoveIds(): { fighter: FighterId; slot: MoveSlot; id: string }[] {
  const out: { fighter: FighterId; slot: MoveSlot; id: string }[] = [];
  for (const fighter of Object.keys(FIGHTERS) as FighterId[]) {
    for (const slot of ['light', 'heavy', 'special', 'aerial'] as MoveSlot[]) {
      out.push({ fighter, slot, id: FIGHTERS[fighter].moves[slot].id });
    }
  }
  return out;
}

/** Fallback for a move without a clip (e.g. a new fighter added before its art). */
export const GENERIC_CLIP: AttackClip = {
  windup: { armF: [-0.5, 1.2], lean: -0.05 },
  strike: { armF: [1.57, 0], lean: 0.2 },
};

export function clipFor(moveId: string): AttackClip {
  return ATTACK_CLIPS[moveId] ?? GENERIC_CLIP;
}
