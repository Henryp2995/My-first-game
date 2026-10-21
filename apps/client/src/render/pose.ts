import type { FighterAction, FighterId, MoveDef } from '@arena-rush/shared';

/** [upper segment angle, bend]. Angles are radians from straight down; positive swings forward. */
export type Limb = [number, number];

export type PropKind = 'hammer' | 'judge' | 'key' | 'saber' | 'rifle' | null;

export interface Pose {
  lean: number;
  bob: number;
  dx: number;
  armF: Limb;
  armB: Limb;
  legF: Limb;
  legB: Limb;
  headTilt: number;
  /** Whole-body rotation (positive pitches forward). */
  spin: number;
  expression: 'normal' | 'hurt' | 'happy' | 'focus';
  prop: PropKind;
  alpha: number;
  /** Draw mirrored this frame (used for the spinning kick). */
  flip: boolean;
  /** 0..1 how much a cape flares out (Batman). */
  flare: number;
}

export interface AnimInput {
  fighter: FighterId;
  action: FighterAction | 'victory' | 'preview';
  move: MoveDef | null;
  actionFrame: number;
  grounded: boolean;
  vx: number;
  vy: number;
  runSpeed: number;
  /** Global animation clock in frames. */
  t: number;
  /** 0..1 progress of a double-jump flip, or -1. */
  flip: number;
  tumble: boolean;
  charge: number;
  rocketLaunched: boolean;
}

const base = (): Pose => ({
  lean: 0.05, bob: 0, dx: 0,
  armF: [0.35, 0.6], armB: [-0.25, 0.5], legF: [0.18, 0.15], legB: [-0.15, 0.1],
  headTilt: 0, spin: 0, expression: 'normal', prop: null, alpha: 1, flip: false, flare: 0,
});

const P = (over: Partial<Pose>): Pose => ({ ...base(), ...over });

function mixLimb(a: Limb, b: Limb, t: number): Limb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function mix(a: Pose, b: Pose, t: number): Pose {
  const l = (x: number, y: number) => x + (y - x) * t;
  return {
    lean: l(a.lean, b.lean),
    bob: l(a.bob, b.bob),
    dx: l(a.dx, b.dx),
    armF: mixLimb(a.armF, b.armF, t),
    armB: mixLimb(a.armB, b.armB, t),
    legF: mixLimb(a.legF, b.legF, t),
    legB: mixLimb(a.legB, b.legB, t),
    headTilt: l(a.headTilt, b.headTilt),
    spin: l(a.spin, b.spin),
    alpha: l(a.alpha, b.alpha),
    flare: l(a.flare, b.flare),
    expression: t < 0.5 ? a.expression : b.expression,
    prop: t < 0.5 ? a.prop : b.prop,
    flip: t < 0.5 ? a.flip : b.flip,
  };
}

const ease = (t: number) => 1 - (1 - t) * (1 - t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

// ---------------------------------------------------------------------------
// Stances
// ---------------------------------------------------------------------------

function idle(id: FighterId, t: number): Pose {
  const b = Math.sin(t * 0.07);
  if (id === 'sheik') {
    return P({
      lean: 0.18, bob: 5 + b * 1.2,
      armF: [1.25 + b * 0.05, 1.5], armB: [0.55, 1.7],
      legF: [0.5, 0.6], legB: [-0.45, 0.35],
    });
  }
  if (id === 'spiderman') {
    return P({
      lean: 0.35, bob: 11 + b * 1.5,
      armF: [1.25, 1.0], armB: [0.55, 1.3], legF: [0.85, 1.7], legB: [-0.6, 1.25], headTilt: -0.2,
    });
  }
  if (id === 'batman') {
    return P({
      lean: 0.05, bob: b * 1,
      armF: [0.35, 0.9 + b * 0.05], armB: [-0.25, 0.8], legF: [0.3, 0.15], legB: [-0.32, 0.1], flare: 0.1,
    });
  }
  if (id === 'naruto') {
    return P({
      lean: 0.25, bob: 4 + b * 1.5,
      armF: [0.95, 1.6], armB: [0.4, 1.5], legF: [0.5, 0.7], legB: [-0.45, 0.4],
    });
  }
  if (id === 'gundam') {
    return P({
      lean: 0.04, bob: b * 0.8,
      armF: [0.45, 0.9], armB: [-0.15, 0.7], legF: [0.3, 0.12], legB: [-0.32, 0.1],
    });
  }
  if (id === 'vader') {
    // Upright and menacing, lit saber held low and forward.
    return P({
      lean: 0.02, bob: b * 0.6,
      armF: [0.6, 0.45], armB: [-0.18, 0.35], legF: [0.32, 0.1], legB: [-0.32, 0.08], prop: 'saber', flare: 0.15,
    });
  }
  if (id === 'goku') {
    return P({
      lean: 0.12, bob: 3 + b * 1.2,
      armF: [1.3, 1.9], armB: [0.75, 1.95], legF: [0.55, 0.5], legB: [-0.5, 0.3],
    });
  }
  if (id === 'luigi') {
    return P({
      lean: 0.04, bob: b * 1.5,
      armF: [0.45 + b * 0.06, 0.5], armB: [-0.45, 0.4],
      legF: [0.22, 0.15], legB: [-0.2, 0.1], headTilt: b * 0.03,
    });
  }
  return P({
    lean: 0.02, bob: b > 0.3 ? 1 : 0,
    armF: [0.6, 1.1], armB: [-0.5, 0.8], legF: [0.25, 0.2], legB: [-0.2, 0.15],
  });
}

function run(id: FighterId, t: number, speedRatio: number): Pose {
  const p = t * (id === 'sheik' ? 0.42 : id === 'luigi' ? 0.3 : 0.36);
  const s = Math.sin(p);
  const c = Math.cos(p);
  const pose = P({
    lean: 0.22 * speedRatio,
    bob: 2 - Math.abs(s) * 3,
    legF: [s * 0.95, 0.35 + Math.max(0, c) * 1.3],
    legB: [-s * 0.95, 0.35 + Math.max(0, -c) * 1.3],
    armF: [-s * 0.9, 1.1],
    armB: [s * 0.9, 1.1],
  });
  if (id === 'sheik' || id === 'naruto') {
    pose.lean = 0.55 * speedRatio;
    pose.armF = [-1.3, 0.25];
    pose.armB = [-1.5, 0.25];
  }
  if (id === 'spiderman') {
    pose.lean = 0.45 * speedRatio;
    pose.bob += 4;
  }
  if (id === 'batman') pose.flare = 0.6 * speedRatio;
  if (id === 'vader') {
    pose.flare = 0.5 * speedRatio;
    pose.prop = 'saber';
    pose.armF = [0.5 - Math.sin(p) * 0.3, 0.5];
    pose.lean = 0.1 * speedRatio;
  }
  if (id === 'gundam') pose.lean = 0.12 * speedRatio;
  if (id === 'luigi') {
    pose.armF = [-s * 1.1 + 0.2, 1.4];
    pose.armB = [s * 1.1 + 0.2, 1.4];
  }
  return pose;
}

function air(id: FighterId, vy: number): Pose {
  const rise = P({ legF: [0.9, 1.4], legB: [0.25, 1.0], armF: [2.5, 0.3], armB: [1.8, 0.4] });
  const fall = P({ legF: [0.3, 0.4], legB: [-0.2, 0.6], armF: [1.6, 0.3], armB: [-1.6, 0.3] });
  if (id === 'sheik') {
    rise.armF = [1.6, 1.4];
    rise.armB = [-0.6, 0.5];
    fall.armF = [1.3, 1.2];
    fall.armB = [-1.0, 0.4];
  }
  return mix(rise, fall, clamp01((vy + 300) / 700));
}

const LANDING = P({ bob: 10, lean: 0.25, legF: [0.7, 1.4], legB: [-0.4, 1.2], armF: [0.7, 0.6], armB: [-0.5, 0.6] });
const DODGE = P({ bob: 12, lean: 0.5, armF: [0.9, 2.0], armB: [0.5, 2.0], legF: [0.9, 1.8], legB: [0.3, 1.6] });

function hurt(t: number, tumble: boolean): Pose {
  return P({
    lean: -0.35,
    armF: [2.3 + Math.sin(t * 0.5) * 0.4, 0.5],
    armB: [2.0 + Math.cos(t * 0.5) * 0.4, 0.6],
    legF: [0.5, 0.8],
    legB: [-0.3, 0.9],
    expression: 'hurt',
    spin: tumble ? -t * 0.35 : 0,
  });
}

function victory(id: FighterId, t: number): Pose {
  if (id === 'gnw') {
    const step = Math.floor(t / 20) % 2;
    return step === 0
      ? P({ armF: [2.9, 0.1], armB: [2.4, 0.3], legF: [0.3, 0.1], legB: [-0.3, 0.1], prop: 'hammer', lean: -0.1 })
      : P({ armF: [1.4, 0.1], armB: [-0.8, 0.4], legF: [0.5, 0.6], legB: [-0.4, 0.1], prop: 'hammer', lean: 0.2 });
  }
  if (id === 'luigi') {
    const hop = Math.abs(Math.sin(t * 0.08));
    return P({
      bob: -hop * 18, armF: [3.0, 0.2], armB: [-0.4, 0.8], legF: [0.4 * hop, 0.8 * hop], legB: [-0.2, 0.6 * hop],
      expression: 'happy', lean: -0.1,
    });
  }
  if (id === 'spiderman') {
    return P({ bob: 16, lean: 0.3, armF: [0.15, 0.1], armB: [2.6, 0.3], legF: [0.9, 1.8], legB: [-0.5, 1.4], headTilt: -0.25 });
  }
  if (id === 'naruto') {
    const wave = Math.sin(t * 0.12);
    return P({ armF: [1.7 + wave * 0.1, 1.5], armB: [-0.4, 0.6], legF: [0.3, 0.1], legB: [-0.35, 0.1], expression: 'happy', lean: -0.05 });
  }
  if (id === 'gundam') {
    return P({ armF: [2.95, 0.1], armB: [-0.3, 0.6], legF: [0.35, 0.1], legB: [-0.35, 0.1], prop: 'saber', lean: -0.05 });
  }
  if (id === 'vader') {
    const b2 = Math.sin(t * 0.04);
    return P({ armF: [1.7, 0.25 + b2 * 0.05], armB: [0.3, 0.4], legF: [0.32, 0.1], legB: [-0.32, 0.08], flare: 0.3 + b2 * 0.05 });
  }
  if (id === 'goku') {
    const hop = Math.abs(Math.sin(t * 0.07));
    return P({ bob: -hop * 10, armF: [3.0, 0.2], armB: [0.5, 1.9], legF: [0.35, 0.3 * hop], legB: [-0.3, 0.4 * hop], expression: 'happy' });
  }
  const b = Math.sin(t * 0.05);
  return P({
    armF: [0.85, 2.3], armB: [1.0, 2.35], legF: [0.3, 0.1], legB: [-0.3, 0.1], lean: -0.05, bob: b,
    headTilt: -0.1, flare: id === 'batman' ? 0.35 + b * 0.1 : 0,
  });
}

// ---------------------------------------------------------------------------
// Attacks
// ---------------------------------------------------------------------------

type Phase = { name: 'startup' | 'active' | 'recovery'; p: number };

function phaseOf(frame: number, move: MoveDef): Phase {
  if (frame < move.startup) return { name: 'startup', p: frame / Math.max(1, move.startup) };
  if (frame < move.startup + move.active) {
    return { name: 'active', p: (frame - move.startup) / Math.max(1, move.active) };
  }
  return { name: 'recovery', p: (frame - move.startup - move.active) / Math.max(1, move.recovery) };
}

/** Standard 3-key animation: rest → windup (startup) → strike (active) → rest (recovery). */
function keyed(ph: Phase, rest: Pose, windup: Pose, strike: Pose): Pose {
  if (ph.name === 'startup') return mix(rest, windup, ease(ph.p));
  if (ph.name === 'active') return mix(windup, strike, clamp01(ph.p * 3));
  return mix(strike, rest, ease(ph.p));
}

function attack(a: AnimInput, rest: Pose): Pose {
  const move = a.move!;
  const fr = a.actionFrame;
  let ph = phaseOf(fr, move);
  if (a.fighter === 'gnw') {
    // LCD look: only a few discrete animation frames.
    ph = { name: ph.name, p: Math.round(ph.p * 2) / 2 };
  }

  switch (move.id) {
    case 'gnw-flick':
      return keyed(ph, rest,
        P({ armF: [-0.6, 1.4], lean: -0.1 }),
        P({ armF: [1.57, 0], armB: [-0.6, 0.6], lean: 0.25, legF: [0.5, 0.3], legB: [-0.5, 0.1] }));
    case 'gnw-hammer':
    case 'gnw-judge': {
      const prop = move.id === 'gnw-hammer' ? 'hammer' : 'judge';
      const pose = keyed(ph, rest,
        P({ armF: [2.9, 0.1], armB: [2.6, 0.3], lean: -0.25, prop }),
        P({ armF: [1.25, 0], armB: [0.9, 0.2], lean: 0.35, legF: [0.6, 0.5], legB: [-0.5, 0.2], prop }));
      pose.prop = ph.name === 'recovery' && ph.p > 0.7 ? null : prop;
      return pose;
    }
    case 'gnw-keydrop':
      return keyed(ph, rest,
        P({ legF: [0.8, 1.6], legB: [0.6, 1.5], armF: [2.2, 0.4], armB: [2.0, 0.4], prop: 'key' }),
        P({ legF: [0.05, 0], legB: [-0.05, 0], armF: [2.8, 0.2], armB: [2.5, 0.2], prop: 'key' }));
    case 'luigi-onetwo': {
      const guard = P({ armF: [-0.3, 1.7], armB: [0.2, 1.9], lean: 0.1, legF: [0.45, 0.3], legB: [-0.4, 0.15] });
      if (fr < 3) return mix(rest, guard, fr / 3);
      if (fr < 8) return P({ ...guard, armF: [1.55, 0.05], lean: 0.22 });
      if (fr < 9) return guard;
      if (fr < 14) return P({ ...guard, armB: [1.6, 0.05], armF: [-0.4, 1.5], lean: 0.38, legF: [0.6, 0.4] });
      return mix(P({ ...guard, armB: [1.6, 0.05] }), rest, ease(clamp01((fr - 14) / 7)));
    }
    case 'luigi-uppercut':
      return keyed(ph, rest,
        P({ bob: 11, armF: [0.3, 2.2], lean: 0.35, legF: [0.7, 1.4], legB: [-0.4, 1.2], expression: 'focus' }),
        P({ armF: [3.05, 0], armB: [-0.8, 0.5], lean: -0.1, bob: -4, legF: [0.1, 0], legB: [-0.3, 0.7], expression: 'focus' }));
    case 'luigi-rocket': {
      if (!a.rocketLaunched) {
        const crouch = P({
          bob: 10, lean: 0.6, armF: [-1.4, 0.3], armB: [-1.2, 0.3], legF: [0.8, 1.6], legB: [-0.2, 1.3],
          expression: 'focus',
        });
        const pose = mix(rest, crouch, ease(clamp01(fr / Math.max(1, move.startup - 1))));
        pose.dx = Math.sin(a.t * 2.2) * a.charge * 3;
        return pose;
      }
      const flight = P({ spin: 1.45, armF: [0.1, 0], armB: [-0.1, 0], legF: [0.05, 0], legB: [-0.05, 0.1], expression: 'focus' });
      if (ph.name !== 'recovery') return flight;
      return mix(flight, rest, ease(ph.p));
    }
    case 'luigi-downkick':
      return keyed(ph, rest,
        P({ legF: [1.2, 2.0], legB: [0.7, 1.8], armF: [2.0, 0.6], armB: [1.6, 0.6] }),
        P({ legF: [0.15, 0], legB: [0.9, 1.6], armF: [2.6, 0.3], armB: [2.0, 0.2], lean: -0.2, expression: 'focus' }));
    case 'sheik-flurry': {
      const stance = P({ lean: 0.25, legF: [0.55, 0.5], legB: [-0.45, 0.3], bob: 4 });
      if (fr < 2 || fr >= 12) {
        const t = fr < 2 ? fr / 2 : 1 - clamp01((fr - 12) / 6);
        return mix(rest, P({ ...stance, armF: [0.6, 1.8], armB: [0.5, 1.8] }), t);
      }
      const which = Math.floor((fr - 2) / 3) % 2;
      return P({
        ...stance,
        armF: which === 0 ? [1.57, 0] : [0.6, 1.8],
        armB: which === 1 ? [1.57, 0] : [0.5, 1.8],
      });
    }
    case 'sheik-spinkick': {
      const pose = keyed(ph, rest,
        P({ legF: [0.6, 1.6], lean: -0.15, armF: [1.6, 1.0], armB: [0.4, 1.2] }),
        P({ legF: [1.62, 0], legB: [-0.1, 0], lean: -0.35, armF: [1.3, 0], armB: [-1.3, 0] }));
      if (ph.name === 'active') pose.flip = Math.floor(fr / 2) % 2 === 1;
      return pose;
    }
    case 'sheik-vanish': {
      if (ph.name === 'startup') {
        const pose = mix(rest, P({ bob: 6, armF: [1.2, 1.9], armB: [1.0, 2.0], legF: [0.4, 0.8], legB: [-0.3, 0.6] }), ease(clamp01(fr / 4)));
        pose.alpha = fr < 4 ? 1 - fr / 4 : 0;
        return pose;
      }
      const burst = P({ armF: [2.1, 0.2], armB: [1.6, 0.3], legF: [0.5, 0.2], legB: [-0.5, 0.2], lean: -0.1 });
      return ph.name === 'active' ? burst : mix(burst, rest, ease(ph.p));
    }
    case 'sheik-diagkick':
      return keyed(ph, rest,
        P({ legF: [1.0, 1.8], legB: [0.3, 1.2], armF: [1.4, 1.0], armB: [-0.4, 0.6] }),
        P({ legF: [1.0, 0], legB: [-0.3, 1.4], lean: -0.3, armF: [-1.0, 0.4], armB: [-1.3, 0.4] }));
    // ---- Crossover fighters ----
    case 'spidey-combo':
    case 'naruto-taijutsu':
    case 'goku-punches': {
      const stance = P({ lean: 0.25, legF: [0.55, 0.5], legB: [-0.45, 0.3], bob: 4 });
      const end = move.startup + move.active;
      if (fr < move.startup || fr >= end) {
        const t = fr < move.startup ? fr / Math.max(1, move.startup) : 1 - clamp01((fr - end) / Math.max(1, move.recovery));
        return mix(rest, P({ ...stance, armF: [0.6, 1.8], armB: [0.5, 1.8] }), t);
      }
      const which = Math.floor((fr - move.startup) / 3) % 2;
      return P({
        ...stance,
        armF: which === 0 ? [1.57, 0] : [0.6, 1.8],
        armB: which === 1 ? [1.57, 0] : [0.5, 1.8],
        expression: 'focus',
      });
    }
    case 'spidey-spinkick':
    case 'naruto-spinkick': {
      const pose = keyed(ph, rest,
        P({ legF: [0.6, 1.6], lean: -0.15, armF: [1.6, 1.0], armB: [0.4, 1.2] }),
        P({ legF: [1.62, 0], legB: [-0.1, 0], lean: -0.35, armF: [1.3, 0], armB: [-1.3, 0] }));
      if (ph.name === 'active') pose.flip = Math.floor(fr / 2) % 2 === 1;
      return pose;
    }
    case 'spidey-web':
      return keyed(ph, rest,
        P({ armF: [1.1, 0.9], armB: [0.3, 1.2], lean: 0.1 }),
        P({ armF: [1.6, 0], armB: [-0.4, 0.6], lean: 0.2, legF: [0.5, 0.4], legB: [-0.4, 0.2], expression: 'focus' }));
    case 'spidey-webkick':
      return keyed(ph, rest,
        P({ legF: [1.1, 1.9], legB: [0.6, 1.7], armF: [2.4, 0.4], armB: [2.0, 0.4] }),
        P({ legF: [0.25, 0], legB: [-0.15, 0.4], armF: [2.8, 0.2], armB: [2.5, 0.2], lean: -0.15 }));
    case 'bat-combo': {
      const guard = P({ armF: [-0.3, 1.7], armB: [0.2, 1.9], lean: 0.1, legF: [0.45, 0.3], legB: [-0.4, 0.15] });
      if (fr < 4) return mix(rest, guard, fr / 4);
      if (fr < 8) return P({ ...guard, armF: [1.55, 0.05], lean: 0.22 });
      if (fr < 10) return guard;
      if (fr < 14) return P({ ...guard, armB: [1.6, 0.05], armF: [-0.4, 1.5], lean: 0.38, legF: [0.6, 0.4] });
      return mix(P({ ...guard, armB: [1.6, 0.05] }), rest, ease(clamp01((fr - 14) / 9)));
    }
    case 'bat-capestrike':
      return keyed(ph, rest,
        P({ armF: [-1.0, 1.2], armB: [-0.6, 1.0], lean: -0.2, flare: 0.2 }),
        P({ armF: [1.45, 0], armB: [0.9, 0.3], lean: 0.4, legF: [0.65, 0.5], legB: [-0.55, 0.2], flare: 1, expression: 'focus' }));
    case 'bat-batarang':
      return keyed(ph, rest,
        P({ armF: [-1.3, 1.6], armB: [0.6, 1.0], lean: -0.1 }),
        P({ armF: [1.45, 0.05], armB: [-0.5, 0.6], lean: 0.25, legF: [0.5, 0.4], legB: [-0.45, 0.2], flare: 0.5 }));
    case 'bat-capedive':
      return keyed(ph, rest,
        P({ legF: [1.0, 1.7], legB: [0.6, 1.5], armF: [2.2, 0.4], armB: [1.9, 0.4], flare: 0.6 }),
        P({ legF: [0.45, 0.6], legB: [0.1, 0.8], armF: [2.0, 0.2], armB: [-2.0, 0.2], lean: 0.4, flare: 1 }));
    case 'naruto-rasengan': {
      const charge = P({ bob: 8, lean: 0.3, armF: [1.15, 1.1], armB: [1.05, 1.3], legF: [0.7, 1.2], legB: [-0.4, 0.9], expression: 'focus' });
      const lunge = P({ lean: 0.55, armF: [1.57, 0], armB: [1.4, 0.3], legF: [0.8, 0.3], legB: [-0.7, 0.1], expression: 'focus' });
      if (ph.name === 'startup') return mix(rest, charge, ease(ph.p));
      if (ph.name === 'active') return lunge;
      return mix(lunge, rest, ease(ph.p));
    }
    case 'naruto-divestrike':
    case 'goku-energykick':
      return keyed(ph, rest,
        P({ legF: [1.2, 2.0], legB: [0.7, 1.8], armF: [1.6, 1.0], armB: [-0.6, 0.6] }),
        P({ legF: [0.5, 0], legB: [-0.3, 1.4], lean: -0.25, armF: [-1.0, 0.4], armB: [-1.3, 0.4], expression: 'focus' }));
    case 'goku-chargedstrike':
      return keyed(ph, rest,
        P({ bob: 6, lean: 0.15, armF: [-0.9, 2.1], armB: [1.2, 1.6], legF: [0.7, 1.0], legB: [-0.5, 0.5], expression: 'focus' }),
        P({ armF: [1.6, 0], armB: [-0.6, 0.8], lean: 0.45, legF: [0.75, 0.4], legB: [-0.65, 0.1], expression: 'focus' }));
    case 'goku-kamehameha':
      return keyed(ph, rest,
        P({ bob: 7, lean: -0.15, armF: [-0.9, 2.2], armB: [-1.0, 2.25], legF: [0.6, 0.8], legB: [-0.55, 0.5], expression: 'focus' }),
        P({ lean: 0.25, armF: [1.57, 0], armB: [1.5, 0.05], legF: [0.65, 0.4], legB: [-0.6, 0.2], expression: 'focus' }));
    // ---- Saber fighters ----
    case 'gundam-saber':
    case 'vader-slash': {
      const s1 = move.hitboxes[0].start ?? move.startup;
      const s2 = move.hitboxes[1]?.start ?? s1 + 6;
      const stance = P({ lean: 0.18, legF: [0.5, 0.35], legB: [-0.45, 0.15], prop: 'saber', flare: 0.4 });
      if (fr < s1) return mix(rest, P({ ...stance, armF: [2.6, 0.3] }), ease(clamp01(fr / s1)));
      if (fr < s2 - 1) return P({ ...stance, armF: [0.85, 0.1], lean: 0.3 });
      if (fr < s2 + 4) return P({ ...stance, armF: [2.2, 0.1], armB: [-0.6, 0.5], lean: 0.1 });
      return mix(P({ ...stance, armF: [2.2, 0.1] }), rest, ease(clamp01((fr - s2 - 4) / Math.max(1, move.recovery))));
    }
    case 'gundam-overhead':
    case 'vader-cleave':
      return keyed(ph, rest,
        P({ armF: [3.05, 0.1], armB: [2.6, 0.3], lean: -0.22, prop: 'saber', flare: 0.2, legF: [0.4, 0.3], legB: [-0.4, 0.2] }),
        P({ armF: [1.0, 0], armB: [0.7, 0.3], lean: 0.38, prop: 'saber', flare: 1, legF: [0.7, 0.5], legB: [-0.6, 0.2], expression: 'focus' }));
    case 'gundam-rifle':
      return keyed(ph, rest,
        P({ armF: [1.2, 0.5], armB: [-0.2, 0.7], lean: 0.05, prop: 'rifle' }),
        P({ armF: [1.57, 0], armB: [-0.3, 0.7], lean: 0.12, prop: 'rifle', legF: [0.45, 0.3], legB: [-0.45, 0.15] }));
    case 'gundam-plunge':
      return keyed(ph, rest,
        P({ armF: [2.6, 0.2], legF: [1.0, 1.6], legB: [0.6, 1.4], prop: 'saber' }),
        P({ armF: [0.05, 0], armB: [-0.6, 0.6], legF: [0.9, 1.5], legB: [0.5, 1.3], lean: 0.15, prop: 'saber' }));
    case 'vader-choke':
      return keyed(ph, rest,
        P({ armF: [0.9, 1.2], armB: [-0.2, 0.4], lean: -0.05, flare: 0.2 }),
        P({ armF: [1.75, 0.25], armB: [-0.25, 0.35], lean: -0.1, flare: 0.5, legF: [0.35, 0.1], legB: [-0.35, 0.1] }));
    case 'vader-spin': {
      const pose = keyed(ph, rest,
        P({ armF: [2.2, 0.3], legF: [0.9, 1.5], legB: [0.5, 1.3], prop: 'saber', flare: 0.6 }),
        P({ armF: [1.3, 0], armB: [-1.4, 0.2], legF: [0.6, 0.9], legB: [-0.2, 0.8], prop: 'saber', flare: 1, lean: 0.2 }));
      if (ph.name === 'active') pose.flip = Math.floor(fr / 3) % 2 === 1;
      return pose;
    }
    default:
      return keyed(ph, rest, P({ armF: [-0.5, 1.2] }), P({ armF: [1.57, 0] }));
  }
}

export function computePose(a: AnimInput): Pose {
  const pose = computeBasePose(a);
  // Capes trail behind when moving fast or flying.
  if ((a.fighter === 'batman' || a.fighter === 'vader') && (a.action === 'air' || a.action === 'hitstun')) {
    pose.flare = Math.max(pose.flare, Math.min(1, 0.4 + Math.abs(a.vy) / 1500));
  }
  return pose;
}

function computeBasePose(a: AnimInput): Pose {
  const id = a.fighter;
  const t = id === 'gnw' ? Math.floor(a.t / 5) * 5 : a.t;
  const stance = a.grounded ? idle(id, t) : air(id, a.vy);

  switch (a.action) {
    case 'preview':
      return idle(id, t);
    case 'victory':
      return victory(id, t);
    case 'idle':
    case 'respawning':
      return idle(id, t);
    case 'run': {
      const ratio = Math.min(1, Math.abs(a.vx) / a.runSpeed);
      return ratio < 0.15 ? idle(id, t) : run(id, t, ratio);
    }
    case 'air': {
      const pose = air(id, a.vy);
      if (a.flip >= 0) {
        if (id === 'gnw') {
          return P({ legF: [1.0, 1.8], legB: [0.6, 1.6], armF: [2.8, 0.2], armB: [-2.6, 0.2] });
        }
        pose.spin = a.flip * Math.PI * 2;
        pose.legF = [1.1, 1.9];
        pose.legB = [0.7, 1.7];
      }
      return pose;
    }
    case 'landing':
      return LANDING;
    case 'dodge':
      return { ...DODGE, alpha: 0.55 };
    case 'hitstun':
      return hurt(a.t, a.tumble);
    case 'attack':
      return a.move ? attack(a, stance) : stance;
    default:
      return stance;
  }
}
