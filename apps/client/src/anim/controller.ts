import { FIGHTERS, type FighterId, type FighterState, type GameEvent, type MoveSlot } from '@arena-rush/shared';
import { clipFor, sampleAttack } from './clips';
import { clamp01, easeInOut, easeOut, mix, P, type Pose } from './pose';
import { PROFILES, type AnimProfile, type GaitDef } from './profiles';
import { resolveAnimState, TRANSITION_FRAMES, type AnimState } from './states';

/** Spring-driven secondary motion offsets (local space: +x = forward, +y = down), in px. */
export interface Secondary {
  capeX: number;
  capeY: number;
  hairX: number;
  hairY: number;
}

/** Everything a renderer needs for one frame. Pure data — renderers never touch gameplay state. */
export interface AnimFrame {
  fighter: FighterId;
  state: AnimState;
  /** Frames spent in the current state. */
  stateTime: number;
  pose: Pose;
  /** Squash & stretch around the feet (1 = none). */
  squashX: number;
  squashY: number;
  secondary: Secondary;
  /** 0..1 thruster burn (Gundam's jumps). */
  thrust: number;
  /** True on a frame where an attack connects visually (impact) — for smears and flashes. */
  impact: boolean;
  /** Attack phase info when attacking. */
  attackPhase: 'startup' | 'active' | 'recovery' | null;
  /** 0..1 progress through the whole attack (sprite renderers map frames onto this). */
  clipProgress: number;
  /** KO spin: where it happened and how far along (0..1). */
  ko: { x: number; y: number; t: number } | null;
}

const LANDING: Partial<Pose> = { bob: 10, lean: 0.25, legF: [0.7, 1.4], legB: [-0.4, 1.2], armF: [0.7, 0.6], armB: [-0.5, 0.6] };
const DODGE: Partial<Pose> = { bob: 12, lean: 0.5, armF: [0.9, 2.0], armB: [0.5, 2.0], legF: [0.9, 1.8], legB: [0.3, 1.6], alpha: 0.55 };
const JUMP_START: Partial<Pose> = { bob: -4, lean: -0.05, legF: [0.1, 0], legB: [-0.1, 0.05], armF: [2.4, 0.2], armB: [1.9, 0.2] };
const TUCK: Partial<Pose> = { legF: [1.0, 1.8], legB: [0.6, 1.6], armF: [2.8, 0.2], armB: [-2.6, 0.2] };
const THRUSTER: Partial<Pose> = { legF: [0.15, 0.1], legB: [-0.1, 0.1], armF: [0.9, 0.6], armB: [-0.4, 0.6], lean: 0.1 };

function hurtPose(t: number): Partial<Pose> {
  return {
    lean: -0.35,
    armF: [2.3 + Math.sin(t * 0.5) * 0.4, 0.5],
    armB: [2.0 + Math.cos(t * 0.5) * 0.4, 0.6],
    legF: [0.5, 0.8],
    legB: [-0.3, 0.9],
    expression: 'hurt',
  };
}

/** Pose for a locomotion cycle at phase `p`. */
export function gaitPose(profile: AnimProfile, g: GaitDef, p: number, speedRatio: number): Pose {
  const s = Math.sin(p);
  const c = Math.cos(p);
  const stance = profile.stance;
  const pose = P({
    ...stance,
    lean: g.lean * Math.min(1, speedRatio + 0.2),
    bob: (stance.bob ?? 0) * 0.5 + g.bounce * 0.5 - Math.abs(s) * g.bounce,
    legF: [s * g.stride, 0.3 + Math.max(0, c) * g.kneeLift],
    legB: [-s * g.stride, 0.3 + Math.max(0, -c) * g.kneeLift],
  });
  switch (g.armStyle) {
    case 'back':
      pose.armF = [-1.3, 0.25];
      pose.armB = [-1.5, 0.25];
      break;
    case 'guard':
      pose.armF = [(stance.armF?.[0] ?? 1.2) - s * g.armSwing * 0.3, stance.armF?.[1] ?? 1.6];
      pose.armB = [(stance.armB?.[0] ?? 0.6) + s * g.armSwing * 0.3, stance.armB?.[1] ?? 1.6];
      break;
    case 'stiff':
      pose.armF = [-s * g.armSwing, 0.25];
      pose.armB = [s * g.armSwing, 0.25];
      break;
    case 'saber':
      pose.armF = [(stance.armF?.[0] ?? 0.6) - s * 0.15, stance.armF?.[1] ?? 0.5];
      pose.armB = [s * g.armSwing, 0.6];
      pose.flare = 0.3 + speedRatio * 0.5;
      break;
    default:
      pose.armF = [-s * g.armSwing + 0.1, 1.1];
      pose.armB = [s * g.armSwing + 0.1, 1.1];
  }
  return pose;
}

export function idlePose(profile: AnimProfile, t: number): Pose {
  const b = Math.sin((t / profile.breath.period) * Math.PI * 2);
  const stance = profile.stance;
  const armF = stance.armF ?? [0.35, 0.6];
  return P({
    ...stance,
    bob: (stance.bob ?? 0) + b * profile.breath.bob,
    armF: [armF[0] + b * profile.breath.sway, armF[1]],
    headTilt: (stance.headTilt ?? 0) + b * profile.breath.sway * 0.5,
  });
}

export function victoryPose(profile: AnimProfile, t: number): Pose {
  const { keys, period, hop } = profile.victory;
  const cyc = (t / period) % keys.length;
  const i = Math.floor(cyc);
  const a = P({ ...profile.stance, ...keys[i] });
  const b = P({ ...profile.stance, ...keys[(i + 1) % keys.length] });
  const pose = keys.length > 1 ? mix(a, b, easeInOut(cyc - i)) : a;
  if (hop) pose.bob = (pose.bob ?? 0) - Math.abs(Math.sin((t / period) * Math.PI)) * hop;
  return pose;
}

const quantizeAngles = (p: Pose, step: number): Pose => {
  const q = (v: number) => Math.round(v / step) * step;
  return { ...p, armF: [q(p.armF[0]), q(p.armF[1])], armB: [q(p.armB[0]), q(p.armB[1])], legF: [q(p.legF[0]), q(p.legF[1])], legB: [q(p.legB[0]), q(p.legB[1])], lean: q(p.lean) };
};

/**
 * Turns combat state into animation frames for one fighter. Lives entirely on the client:
 * it reads FighterState and GameEvents and never feeds anything back into the simulation.
 */
export class AnimationController {
  readonly profile: AnimProfile;
  private state: AnimState = 'idle';
  private stateTime = 0;
  private clock = 0;
  private blendFrom: Pose | null = null;
  private blendT = 0;
  private blendDur = 0;
  private last: Pose;
  private gaitPhase = 0;
  private jumpStartLeft = 0;
  private landLeft = 0;
  private landHard = false;
  private koLeft = 0;
  private koPos = { x: 0, y: 0 };
  private flipT = -1;
  private tuckLeft = 0;
  private thrustLeft = 0;
  private tumble = false;
  private tumbleSpin = 0;
  // Squash spring (offset from 1) and secondary springs.
  private sq = 0;
  private sqV = 0;
  private sec: Secondary = { capeX: 0, capeY: 0, hairX: 0, hairY: 0 };
  private secV: Secondary = { capeX: 0, capeY: 0, hairX: 0, hairY: 0 };

  constructor(readonly fighter: FighterId, private readonly id: number) {
    this.profile = PROFILES[fighter];
    this.last = idlePose(this.profile, 0);
  }

  /** Feed match events so visual-only states (jump startup, landing, KO) can play. */
  onEvent(e: GameEvent): void {
    const s = this.profile.squash;
    if (e.type === 'jump' && e.id === this.id) {
      this.jumpStartLeft = 5;
      this.sqV += 0.09 * s;
      if (e.double) {
        if (this.profile.doubleJump === 'flip') this.flipT = 0;
        else if (this.profile.doubleJump === 'tuck') this.tuckLeft = 14;
        else this.thrustLeft = 22;
      } else if (this.profile.doubleJump === 'thruster') {
        this.thrustLeft = 10;
      }
    } else if (e.type === 'land' && e.id === this.id) {
      this.landLeft = e.hard ? 10 : 6;
      this.landHard = e.hard;
      this.sqV -= (e.hard ? 0.16 : 0.1) * Math.max(0.2, s);
    } else if (e.type === 'hit' && e.victim === this.id) {
      this.tumble = e.launchSpeed > 1100;
      this.sqV -= 0.06 * Math.max(0.3, s);
    } else if (e.type === 'ko' && e.id === this.id) {
      this.koLeft = 45;
      this.koPos = { x: e.x, y: e.y };
    } else if (e.type === 'respawn' && e.id === this.id) {
      this.tumble = false;
      this.koLeft = 0;
    }
  }

  /** Advance one simulation frame and produce the frame to draw. */
  update(f: FighterState): AnimFrame | null {
    this.clock++;
    const prof = this.profile;
    const def = FIGHTERS[this.fighter];
    if (this.jumpStartLeft > 0) this.jumpStartLeft--;
    if (this.landLeft > 0) this.landLeft--;
    if (this.koLeft > 0) this.koLeft--;
    if (this.tuckLeft > 0) this.tuckLeft--;
    if (this.thrustLeft > 0) this.thrustLeft--;
    if (this.flipT >= 0) {
      this.flipT += 1 / 22;
      if (this.flipT >= 1) this.flipT = -1;
    }
    if (f.action !== 'hitstun') this.tumble = false;

    const speedRatio = Math.min(1.5, Math.abs(f.vx) / def.stats.runSpeed);
    const state = resolveAnimState({
      action: f.action,
      eliminated: f.eliminated,
      grounded: f.grounded,
      speedRatio,
      vy: f.vy + f.kby,
      move: f.move,
      tumble: this.tumble,
      jumpStartLeft: this.jumpStartLeft,
      landLeft: this.landLeft,
      koLeft: this.koLeft,
    });
    if (!state) return null;

    if (state !== this.state) {
      const dur = Math.round(TRANSITION_FRAMES[state] * prof.heft);
      this.blendFrom = dur > 0 ? this.last : null;
      this.blendDur = dur;
      this.blendT = 0;
      this.state = state;
      this.stateTime = 0;
    } else {
      this.stateTime++;
    }

    const t = prof.stepped ? Math.floor(this.clock / prof.stepped) * prof.stepped : this.clock;
    let target: Pose;
    let impact = false;
    let attackPhase: AnimFrame['attackPhase'] = null;
    let clipProgress = 0;

    switch (state) {
      case 'idle':
      case 'respawn':
        target = idlePose(prof, t);
        break;
      case 'walk':
      case 'run': {
        const g = state === 'walk' ? prof.walk : prof.run;
        this.gaitPhase += g.cadence * Math.max(0.5, speedRatio);
        const phase = prof.stepped ? Math.floor(this.gaitPhase / 0.9) * 0.9 : this.gaitPhase;
        target = gaitPose(prof, g, phase, speedRatio);
        break;
      }
      case 'jumpStart':
        target = P({ ...prof.stance, ...JUMP_START });
        break;
      case 'rise':
      case 'fall':
        target = this.airPose(f.vy + f.kby);
        break;
      case 'land':
        target = P({ ...prof.stance, ...LANDING, bob: this.landHard ? 14 : 10 });
        break;
      case 'dodge':
        target = P({ ...prof.stance, ...DODGE, prop: prof.stance.prop ?? null });
        break;
      case 'hit':
        target = P({ ...prof.stance, ...hurtPose(this.clock) });
        break;
      case 'knockback':
        this.tumbleSpin -= 0.35;
        target = P({ ...prof.stance, ...hurtPose(this.clock), spin: this.tumbleSpin });
        break;
      case 'ko':
        this.tumbleSpin -= 0.5;
        target = P({ ...hurtPose(this.clock), spin: this.tumbleSpin, alpha: clamp01(this.koLeft / 20) });
        break;
      case 'victory':
        target = victoryPose(prof, t);
        break;
      default: {
        // Attacks
        const move = def.moves[state as MoveSlot];
        const rest = f.grounded ? idlePose(prof, t) : this.airPose(f.vy + f.kby);
        const clip = clipFor(move.id);
        const frame = prof.stepped && f.actionFrame < move.startup
          ? Math.floor(f.actionFrame / 3) * 3
          : f.actionFrame;
        const sample = sampleAttack(clip, move, frame, rest, prof.heft);
        target = sample.pose;
        attackPhase = sample.phase;
        clipProgress = clamp01(f.actionFrame / (move.startup + move.active + move.recovery));
        impact = sample.impactFrame && f.hitstop === 0;
        if (clip.rocket && !f.rocketLaunched) {
          // Charging: shake harder as charge builds.
          const ratio = move.behavior?.type === 'rocket' ? f.charge / move.behavior.maxChargeFrames : 0;
          target = { ...target, dx: Math.sin(this.clock * 2.2) * ratio * 3 };
        }
        if (clip.vanish && f.actionFrame < move.startup) {
          target = { ...target, alpha: f.actionFrame < 4 ? 1 - f.actionFrame / 4 : 0 };
        }
        if (move.charge && f.charge > 0 && f.actionFrame >= move.startup - 1) {
          target = { ...target, dx: Math.sin(this.clock * 1.7) * Math.min(1, f.charge / move.charge.maxFrames) * 1.5 };
        }
        if (impact) {
          this.sqV += (clip.impact ?? 0.05) * 0.5 * prof.squash * prof.heft;
        }
      }
    }

    // Cross-fade from the previous state's pose.
    let pose = target;
    if (this.blendFrom && this.blendT < this.blendDur) {
      this.blendT++;
      pose = mix(this.blendFrom, target, easeOut(this.blendT / this.blendDur));
    }
    if (prof.rigid) pose = quantizeAngles(pose, 0.06);
    this.last = pose;

    // Squash & stretch spring (stretch > 0 = taller).
    this.sqV += -this.sq * 0.28;
    this.sqV *= 0.72;
    this.sq += this.sqV;
    const sq = Math.max(-0.35, Math.min(0.35, this.sq));
    const squashY = 1 + sq;
    const squashX = 1 - sq * 0.55;

    // Secondary motion: capes and hair trail behind movement (local space).
    const localVx = (f.vx + f.kbx) * f.facing;
    const vy = f.vy + f.kby;
    const spring = (key: keyof Secondary, target2: number, k: number, d: number) => {
      this.secV[key] += (target2 - this.sec[key]) * k;
      this.secV[key] *= d;
      this.sec[key] += this.secV[key];
    };
    spring('capeX', Math.max(-34, Math.min(10, -localVx / 22 - pose.flare * 10)), 0.12, 0.78);
    spring('capeY', Math.max(-26, Math.min(12, -vy / 70)), 0.12, 0.78);
    spring('hairX', Math.max(-16, Math.min(6, -localVx / 45 + Math.sin(this.clock * 0.15) * 1.5)), 0.2, 0.7);
    spring('hairY', Math.max(-12, Math.min(8, -vy / 120)), 0.2, 0.7);

    return {
      fighter: this.fighter,
      state,
      stateTime: this.stateTime,
      pose,
      squashX,
      squashY,
      secondary: { ...this.sec },
      thrust: clamp01(this.thrustLeft / 10),
      impact,
      attackPhase,
      clipProgress,
      ko: state === 'ko' ? { ...this.koPos, t: 1 - this.koLeft / 45 } : null,
    };
  }

  private airPose(vy: number): Pose {
    const prof = this.profile;
    const rise = P({ ...prof.stance, ...prof.rise });
    const fall = P({ ...prof.stance, ...prof.fall });
    let pose = mix(rise, fall, clamp01((vy + 300) / 700));
    if (this.flipT >= 0) {
      pose = { ...pose, spin: this.flipT * Math.PI * 2, legF: [1.1, 1.9], legB: [0.7, 1.7] };
    } else if (this.tuckLeft > 0) {
      pose = mix(pose, P({ ...prof.stance, ...TUCK }), clamp01(this.tuckLeft / 6));
    } else if (this.thrustLeft > 0) {
      pose = mix(pose, P({ ...prof.stance, ...THRUSTER }), clamp01(this.thrustLeft / 6));
    }
    return pose;
  }
}

/**
 * Samples any animation state at time `t` (frames) with no match running — used by menus, HUD
 * portraits, the dev gallery and the sprite baker. Attack states play the fighter's real move for
 * that slot, so baked frames line up with gameplay timing.
 */
export function sampleStateFrame(fighter: FighterId, state: AnimState, t: number, opts: { grounded?: boolean } = {}): AnimFrame {
  const prof = PROFILES[fighter];
  const tt = prof.stepped ? Math.floor(t / prof.stepped) * prof.stepped : t;
  const stance = prof.stance;
  let pose: Pose;
  let attackPhase: AnimFrame['attackPhase'] = null;
  let clipProgress = 0;
  let squash = 0;
  let thrust = 0;
  switch (state) {
    case 'walk':
    case 'run': {
      const g = state === 'walk' ? prof.walk : prof.run;
      pose = gaitPose(prof, g, tt * g.cadence, state === 'walk' ? 0.45 : 1);
      break;
    }
    case 'jumpStart':
      pose = P({ ...stance, ...JUMP_START });
      squash = 0.12 * prof.squash;
      thrust = prof.doubleJump === 'thruster' ? 1 : 0;
      break;
    case 'rise':
      pose = P({ ...stance, ...prof.rise });
      thrust = prof.doubleJump === 'thruster' ? 0.6 : 0;
      break;
    case 'fall':
      pose = P({ ...stance, ...prof.fall });
      break;
    case 'land':
      pose = P({ ...stance, ...LANDING });
      squash = -0.12 * Math.max(0.2, prof.squash);
      break;
    case 'dodge':
      pose = P({ ...stance, ...DODGE, prop: stance.prop ?? null });
      break;
    case 'hit':
      pose = P({ ...stance, ...hurtPose(tt) });
      break;
    case 'knockback':
    case 'ko':
      pose = P({ ...stance, ...hurtPose(tt), spin: -tt * 0.35 });
      break;
    case 'victory':
      pose = victoryPose(prof, tt);
      break;
    case 'light':
    case 'heavy':
    case 'special':
    case 'aerial': {
      const move = FIGHTERS[fighter].moves[state];
      const total = move.startup + move.active + move.recovery;
      const frame = Math.floor(t) % total;
      const rest = opts.grounded === false || state === 'aerial' ? P({ ...stance, ...prof.fall }) : idlePose(prof, 0);
      const sample = sampleAttack(clipFor(move.id), move, frame, rest, prof.heft);
      pose = sample.pose;
      attackPhase = sample.phase;
      clipProgress = frame / total;
      break;
    }
    default:
      pose = idlePose(prof, tt);
  }
  if (prof.rigid) pose = quantizeAngles(pose, 0.06);
  return {
    fighter, state, stateTime: t, pose,
    squashX: 1 - squash * 0.55, squashY: 1 + squash,
    secondary: { capeX: -4 - pose.flare * 6, capeY: 0, hairX: -3 + Math.sin(t * 0.08) * 2, hairY: 0 },
    thrust, impact: false, attackPhase, clipProgress, ko: null,
  };
}

/** A standalone frame for menus and HUD portraits. */
export function previewFrame(fighter: FighterId, mode: 'idle' | 'victory' | 'hit' | 'run', t: number): AnimFrame {
  return sampleStateFrame(fighter, mode, t);
}
