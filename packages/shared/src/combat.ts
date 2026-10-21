import type { RulesConfig } from './config';
import type { FighterStats, HitboxDef } from './fighters';
import type { Rect } from './geometry';
import { clamp } from './geometry';

/**
 * Launch speed in px/s. Grows with the victim's percentage (after the hit is applied)
 * and the hit's damage; lighter fighters fly farther.
 */
export function knockbackSpeed(
  percentAfter: number,
  damage: number,
  baseKnockback: number,
  knockbackGrowth: number,
  weight: number,
): number {
  const weightFactor = 2 / (1 + weight / 100);
  return (baseKnockback + knockbackGrowth * percentAfter * (0.5 + damage / 20)) * weightFactor;
}

export function hitstunFrames(launchSpeed: number, rules: RulesConfig, multiplier = 1): number {
  const c = rules.combat;
  return Math.round(clamp(launchSpeed * c.hitstunPerSpeed * multiplier, c.minHitstun, c.maxHitstun));
}

export function hitstopFrames(damage: number, rules: RulesConfig): number {
  const c = rules.combat;
  return Math.round(Math.min(c.hitstopMax, c.hitstopBase + damage * c.hitstopPerDamage));
}

/** Converts a launch angle (degrees, 0 = forward, 90 = up) into a y-down velocity. */
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

export function hitboxRect(f: Positioned, hb: HitboxDef): Rect {
  const cx = f.x + hb.x * f.facing;
  const cy = f.y + hb.y;
  return { x: cx - hb.w / 2, y: cy - hb.h / 2, w: hb.w, h: hb.h };
}
