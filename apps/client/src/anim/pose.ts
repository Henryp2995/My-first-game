/**
 * Skeletal pose model shared by every animation and renderer. Pure data + math — no Phaser —
 * so the animation layer can be unit-tested and reused by a sprite baker.
 */

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
  /** Draw mirrored this frame (spinning attacks). */
  flip: boolean;
  /** 0..1 how much a cape flares out. */
  flare: number;
}

export const basePose = (): Pose => ({
  lean: 0.05, bob: 0, dx: 0,
  armF: [0.35, 0.6], armB: [-0.25, 0.5], legF: [0.18, 0.15], legB: [-0.15, 0.1],
  headTilt: 0, spin: 0, expression: 'normal', prop: null, alpha: 1, flip: false, flare: 0,
});

/** A full pose from a partial one (missing fields take neutral values). */
export const P = (over: Partial<Pose>): Pose => ({ ...basePose(), ...over });

/** A pose with some fields overridden. */
export const withPose = (p: Pose, over: Partial<Pose>): Pose => ({ ...p, ...over });

function mixLimb(a: Limb, b: Limb, t: number): Limb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Linear blend between two poses (discrete fields switch at the midpoint). */
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

/** Overlay a partial pose onto a full one with weight t (only the listed fields move). */
export function blendPartial(base: Pose, over: Partial<Pose>, t: number): Pose {
  return mix(base, { ...base, ...over }, t);
}

export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
export const easeIn = (t: number) => t * t;
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
/** Ease that overshoots its target slightly before settling (follow-through). */
export const easeOutBack = (t: number, k = 1.6) => 1 + (k + 1) * Math.pow(t - 1, 3) + k * Math.pow(t - 1, 2);

export function isFinitePose(p: Pose): boolean {
  const nums = [p.lean, p.bob, p.dx, ...p.armF, ...p.armB, ...p.legF, ...p.legB, p.headTilt, p.spin, p.alpha, p.flare];
  return nums.every(Number.isFinite);
}
