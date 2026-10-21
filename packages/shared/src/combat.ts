import { DEFAULT_RULES, type RulesConfig } from './config';
import type { FighterStats, HitboxDef } from './fighters';
import type { Rect } from './geometry';
import { clamp } from './geometry';

/**
 * Launch speed in px/s. Smoothly increasing in the victim's percentage (after the hit is applied)
 * and in the hit's damage, and decreasing in the victim's weight:
 *
 *   speed = (base + growth × percentAfter × (damageFactorBase + damage × damageFactorPerDamage))
 *           × (1 + refWeight/100) / (1 + weight/100) × scale
 *
 * There are no thresholds — every term is linear, so knockback never jumps at a particular percent.
 */
export function knockbackSpeed(
  percentAfter: number,
  damage: number,
  baseKnockback: number,
  knockbackGrowth: number,
  weight: number,
  kb: RulesConfig['combat']['knockback'] = DEFAULT_RULES.combat.knockback,
): number {
  const weightFactor = (1 + kb.referenceWeight / 100) / (1 + weight / 100);
  const damageFactor = kb.damageFactorBase + damage * kb.damageFactorPerDamage;
  return (baseKnockback + knockbackGrowth * percentAfter * damageFactor) * weightFactor * kb.scale;
}

/**
 * Hitstun scales with launch speed. `comboHits` is how many hits in a row landed before the victim
 * got a breather; each one shrinks hitstun a little so no sequence can lock a fighter forever.
 */
export function hitstunFrames(launchSpeed: number, rules: RulesConfig, multiplier = 1, comboHits = 0): number {
  const c = rules.combat;
  const base = clamp(launchSpeed * c.hitstunPerSpeed * multiplier, c.minHitstun, c.maxHitstun);
  // Decay applies after the minimum, so even the weakest jab strings eventually leave a gap.
  const decay = Math.max(c.comboHitstunFloor, Math.pow(c.comboHitstunDecay, comboHits));
  return Math.max(1, Math.round(base * decay));
}

export function hitstopFrames(damage: number, rules: RulesConfig): number {
  const c = rules.combat;
  return Math.round(clamp(c.hitstopBase + damage * c.hitstopPerDamage, c.hitstopMin, c.hitstopMax));
}

/** Converts a launch angle (degrees, 0 = forward, 90 = up, negative = down) into a y-down velocity. */
export function launchVector(angleDeg: number, direction: 1 | -1, speed: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.cos(rad) * speed * direction, y: -Math.sin(rad) * speed };
}

export interface Positioned {
  x: number;
  y: number;
  facing: 1 | -1;
}

export function hurtboxRect(f: { x: number; y: number }, stats: FighterStats): Rect {
  return { x: f.x - stats.width / 2, y: f.y - stats.height, w: stats.width, h: stats.height };
}

/** Hitbox offsets are authored facing right; facing left mirrors the x offset. */
export function hitboxRect(f: Positioned, hb: HitboxDef): Rect {
  const cx = f.x + hb.x * f.facing;
  const cy = f.y + hb.y;
  return { x: cx - hb.w / 2, y: cy - hb.h / 2, w: hb.w, h: hb.h };
}
