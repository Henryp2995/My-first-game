import type Phaser from 'phaser';
import type { FighterId } from '@arena-rush/shared';
import type { Limb, Pose } from './pose';

interface Rig {
  hipH: number;
  thigh: number;
  shin: number;
  torso: number;
  neck: number;
  headR: number;
  upperArm: number;
  foreArm: number;
  limbW: number;
  legW: number;
  torsoW: number;
}

const RIGS: Record<FighterId, Rig> = {
  gnw: { hipH: 30, thigh: 15, shin: 15, torso: 18, neck: 2, headR: 11, upperArm: 13, foreArm: 12, limbW: 4.5, legW: 5, torsoW: 15 },
  luigi: { hipH: 34, thigh: 17, shin: 17, torso: 24, neck: 3, headR: 14, upperArm: 15, foreArm: 13, limbW: 8, legW: 10, torsoW: 25 },
  sheik: { hipH: 40, thigh: 20, shin: 20, torso: 22, neck: 4, headR: 11, upperArm: 15, foreArm: 14, limbW: 6.5, legW: 7.5, torsoW: 17 },
  spiderman: { hipH: 38, thigh: 19, shin: 19, torso: 22, neck: 3, headR: 11, upperArm: 15, foreArm: 14, limbW: 6.5, legW: 7.5, torsoW: 17 },
  batman: { hipH: 40, thigh: 20, shin: 20, torso: 28, neck: 3, headR: 12.5, upperArm: 17, foreArm: 15, limbW: 9, legW: 10.5, torsoW: 26 },
  naruto: { hipH: 35, thigh: 17.5, shin: 17.5, torso: 21, neck: 3, headR: 13, upperArm: 14, foreArm: 13, limbW: 7, legW: 8, torsoW: 19 },
  goku: { hipH: 38, thigh: 19, shin: 19, torso: 25, neck: 3, headR: 12, upperArm: 16, foreArm: 14, limbW: 8.5, legW: 9.5, torsoW: 23 },
};

/** Colors for the four crossover fighters, drawn by the shared "hero" path below. */
export interface HeroColors {
  outline: number;
  suit: number;
  suit2: number;
  upperArm: number;
  foreArm: number;
  hand: number;
  thigh: number;
  shin: number;
  boot: number;
  skin: number;
  hair: number;
  eye: number;
  accent: number;
  accent2: number;
  cape: number;
}

type HeroId = 'spiderman' | 'batman' | 'naruto' | 'goku';

const HERO_COLORS: Record<HeroId, HeroColors> = {
  spiderman: {
    outline: 0x1a0d14, suit: 0xd62828, suit2: 0x2546b8, upperArm: 0xd62828, foreArm: 0xd62828, hand: 0xd62828,
    thigh: 0x2546b8, shin: 0xd62828, boot: 0xd62828, skin: 0xd62828, hair: 0xd62828, eye: 0xffffff,
    accent: 0x1a0d14, accent2: 0x111111, cape: 0,
  },
  batman: {
    outline: 0x0b0b12, suit: 0x5d6273, suit2: 0x5d6273, upperArm: 0x5d6273, foreArm: 0x23232c, hand: 0x23232c,
    thigh: 0x5d6273, shin: 0x23232c, boot: 0x23232c, skin: 0xe8b48f, hair: 0x23232c, eye: 0xffffff,
    accent: 0x16161d, accent2: 0xe6c229, cape: 0x1f1f2a,
  },
  naruto: {
    outline: 0x2a1408, suit: 0xff8c1a, suit2: 0x1f2a44, upperArm: 0xff8c1a, foreArm: 0xff8c1a, hand: 0xf6c79a,
    thigh: 0xff8c1a, shin: 0xff8c1a, boot: 0x2a3b8f, skin: 0xf6c79a, hair: 0xffd23a, eye: 0x2f7fe0,
    accent: 0xb9c2cc, accent2: 0x1f3a8a, cape: 0,
  },
  goku: {
    outline: 0x1d0f08, suit: 0xff7a1a, suit2: 0x1f4fbf, upperArm: 0x1f4fbf, foreArm: 0xf3c79c, hand: 0xf3c79c,
    thigh: 0xff7a1a, shin: 0xff7a1a, boot: 0x1f4fbf, skin: 0xf3c79c, hair: 0x16161c, eye: 0x16161c,
    accent: 0x1f4fbf, accent2: 0xffd23f, cape: 0,
  },
};

const HERO_ALT_COLORS: Record<HeroId, HeroColors> = {
  spiderman: {
    ...HERO_COLORS.spiderman, suit: 0x1b1b24, suit2: 0x1b1b24, upperArm: 0x1b1b24, foreArm: 0x1b1b24, hand: 0x1b1b24,
    thigh: 0x1b1b24, shin: 0x1b1b24, boot: 0x1b1b24, skin: 0x1b1b24, hair: 0x1b1b24, accent: 0x6a6a7a, accent2: 0xf2f2f2,
  },
  batman: { ...HERO_COLORS.batman, foreArm: 0x1f2e6b, hand: 0x1f2e6b, shin: 0x1f2e6b, boot: 0x1f2e6b, hair: 0x1f2e6b, cape: 0x1f2e6b, suit: 0x8b90a0, suit2: 0x8b90a0, upperArm: 0x8b90a0, thigh: 0x8b90a0 },
  naruto: { ...HERO_COLORS.naruto, suit: 0x26262f, upperArm: 0x26262f, foreArm: 0x26262f, thigh: 0x26262f, shin: 0x26262f, suit2: 0xff8c1a },
  goku: { ...HERO_COLORS.goku, suit: 0x2a5ad8, thigh: 0x2a5ad8, shin: 0x2a5ad8, suit2: 0xff8c1a, upperArm: 0xff8c1a, accent: 0xff8c1a, boot: 0xff8c1a },
};

function isHero(id: FighterId): id is HeroId {
  return id in HERO_COLORS;
}

export interface Palette {
  outline: number;
  body: number;
  accent: number;
  accent2: number;
  skin: number;
  detail: number;
  hands: number;
  feet: number;
  eye: number;
  hair: number;
  /** Color of the cap emblem letter (Luigi). */
  emblem: number;
}

type ClassicId = Exclude<FighterId, HeroId>;

export const PALETTES: Record<ClassicId, Palette> = {
  gnw: {
    outline: 0x000000, body: 0x141414, accent: 0x141414, accent2: 0x141414, skin: 0x141414,
    detail: 0xffffff, hands: 0x141414, feet: 0x141414, eye: 0xffffff, hair: 0x141414, emblem: 0x141414,
  },
  luigi: {
    outline: 0x1a1530, body: 0x2fb350, accent: 0x2b4fd6, accent2: 0xffd23f, skin: 0xffcc99,
    detail: 0x3b2416, hands: 0xffffff, feet: 0x6b3d1f, eye: 0x1d4bd1, hair: 0x3b2416, emblem: 0x2fb350,
  },
  sheik: {
    outline: 0x0f1230, body: 0x23317a, accent: 0x3a56c4, accent2: 0xe9e4d4, skin: 0xf3c6a0,
    detail: 0xe0303a, hands: 0xe9e4d4, feet: 0x1a1f45, eye: 0xe0303a, hair: 0xf5d76e, emblem: 0xe0303a,
  },
};

/** Alternate costumes, used when two players pick the same fighter. */
export const ALT_PALETTES: Record<ClassicId, Palette> = {
  gnw: { ...PALETTES.gnw, body: 0x1e2a66, accent: 0x1e2a66, accent2: 0x1e2a66, skin: 0x1e2a66, hands: 0x1e2a66, feet: 0x1e2a66, hair: 0x1e2a66, emblem: 0x1e2a66 },
  luigi: { ...PALETTES.luigi, body: 0xf4f4f4, accent: 0x2fa84f, accent2: 0xffd23f, emblem: 0x2fa84f },
  sheik: { ...PALETTES.sheik, body: 0x5a1630, accent: 0xa8324f, outline: 0x22081a },
};

/** Legacy palette view of the heroes (only `outline` is used by shared code paths). */
function heroPalette(c: HeroColors): Palette {
  return {
    outline: c.outline, body: c.suit, accent: c.suit2, accent2: c.accent2, skin: c.skin, detail: c.accent,
    hands: c.hand, feet: c.boot, eye: c.eye, hair: c.hair, emblem: c.accent,
  };
}

/** Representative color for UI (stock icons, card tints). */
export const FIGHTER_UI_COLOR: Record<FighterId, number> = {
  gnw: 0xc9d4a6,
  luigi: 0x2fb350,
  sheik: 0x3a56c4,
  spiderman: 0xd62828,
  batman: 0x8a93a8,
  naruto: 0xff8c1a,
  goku: 0x2f6fe0,
};

function whitePalette(p: Palette): Palette {
  const w = 0xffffff;
  return { outline: p.outline, body: w, accent: w, accent2: w, skin: w, detail: 0xdddddd, hands: w, feet: w, eye: 0x999999, hair: w, emblem: 0xbbbbbb };
}

type V = { x: number; y: number };

export interface DrawResult {
  head: V;
  top: number;
  propAnchor: V | null;
  /** Front hand position in world space (for held effects like energy orbs). */
  handF: V;
}

/**
 * Draws a fighter with Graphics primitives. (x, y) is the feet position in world space.
 * Rendering is purely a function of the pose — swap this for sprites later without touching gameplay.
 */
export function drawFighter(
  g: Phaser.GameObjects.Graphics,
  id: FighterId,
  pose: Pose,
  x: number,
  y: number,
  facingIn: 1 | -1,
  scale = 1,
  flash = false,
  alt = false,
): DrawResult {
  const rig = RIGS[id];
  const hero = isHero(id) ? (alt ? HERO_ALT_COLORS[id] : HERO_COLORS[id]) : null;
  const basePal = hero ? heroPalette(hero) : alt ? ALT_PALETTES[id as ClassicId] : PALETTES[id as ClassicId];
  const pal = flash ? whitePalette(basePal) : basePal;
  const facing = (pose.flip ? -facingIn : facingIn) as 1 | -1;
  const s = scale;

  const pivot = { x: 0, y: -rig.hipH * 0.9 };
  const cosS = Math.cos(pose.spin);
  const sinS = Math.sin(pose.spin);
  // Local (x forward, y down) → world.
  const T = (lx: number, ly: number): V => {
    let px = lx - pivot.x;
    let py = ly - pivot.y;
    const rx = px * cosS - py * sinS;
    const ry = px * sinS + py * cosS;
    px = rx + pivot.x + pose.dx;
    py = ry + pivot.y;
    return { x: x + px * facing * s, y: y + py * s };
  };
  const dir = (a: number) => ({ x: Math.sin(a), y: Math.cos(a) });

  const hip = { x: 0, y: -rig.hipH + pose.bob };
  const shoulder = { x: hip.x + Math.sin(pose.lean) * rig.torso, y: hip.y - Math.cos(pose.lean) * rig.torso };
  const headA = pose.lean + pose.headTilt;
  const head = {
    x: shoulder.x + Math.sin(headA) * (rig.neck + rig.headR),
    y: shoulder.y - Math.cos(headA) * (rig.neck + rig.headR),
  };

  const limb = (o: V, l: Limb, l1: number, l2: number, isArm: boolean): [V, V, V] => {
    const d1 = dir(l[0]);
    const j = { x: o.x + d1.x * l1, y: o.y + d1.y * l1 };
    const d2 = dir(isArm ? l[0] + l[1] : l[0] - l[1]);
    const e = { x: j.x + d2.x * l2, y: j.y + d2.y * l2 };
    return [o, j, e];
  };

  const armF = limb(shoulder, pose.armF, rig.upperArm, rig.foreArm, true);
  const armB = limb(shoulder, pose.armB, rig.upperArm, rig.foreArm, true);
  const legF = limb(hip, pose.legF, rig.thigh, rig.shin, false);
  const legB = limb(hip, pose.legB, rig.thigh, rig.shin, false);

  const seg = (a: V, b: V, w: number, color: number) => {
    const A = T(a.x, a.y);
    const B = T(b.x, b.y);
    g.lineStyle(w * s, color, 1);
    g.lineBetween(A.x, A.y, B.x, B.y);
    g.fillStyle(color, 1);
    g.fillCircle(A.x, A.y, (w * s) / 2);
    g.fillCircle(B.x, B.y, (w * s) / 2);
  };
  const dot = (p: V, r: number, color: number) => {
    const P = T(p.x, p.y);
    g.fillStyle(color, 1);
    g.fillCircle(P.x, P.y, r * s);
  };
  // Polygon in head-local space (x forward, y down), rotated with the head.
  const headRot = headA;
  const HP = (hx: number, hy: number): V => {
    const c = Math.cos(headRot);
    const sn = Math.sin(headRot);
    return T(head.x + hx * c - hy * sn, head.y + hx * sn + hy * c);
  };
  const poly = (pts: [number, number][], color: number, outline?: number, ow = 2) => {
    const world = pts.map(([px, py]) => HP(px, py));
    g.fillStyle(color, 1);
    g.fillPoints(world, true);
    if (outline !== undefined) {
      g.lineStyle(ow * s, outline, 1);
      g.strokePoints(world, true);
    }
  };
  const ellipse = (cx: number, cy: number, rx: number, ry: number, a0 = 0, a1 = Math.PI * 2, n = 16): [number, number][] => {
    const out: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    return out;
  };
  const headDot = (hx: number, hy: number, r: number, color: number) => {
    const P = HP(hx, hy);
    g.fillStyle(color, 1);
    g.fillCircle(P.x, P.y, r * s);
  };

  const ol = pal.outline;
  const OW = id === 'gnw' ? 0 : 2.5;
  const outlined = (pts: V[], w: number, color: number) => {
    if (OW > 0) for (let i = 0; i < pts.length - 1; i++) seg(pts[i], pts[i + 1], w + OW * 2, ol);
    for (let i = 0; i < pts.length - 1; i++) seg(pts[i], pts[i + 1], w, color);
  };

  let propAnchor: V | null = null;
  const drawProp = () => {
    if (!pose.prop) return;
    const hand = armF[2];
    const elbow = armF[1];
    const len = Math.hypot(hand.x - elbow.x, hand.y - elbow.y) || 1;
    const ux = (hand.x - elbow.x) / len;
    const uy = (hand.y - elbow.y) / len;
    if (pose.prop === 'hammer' || pose.prop === 'judge') {
      const end = { x: hand.x + ux * 18, y: hand.y + uy * 18 };
      seg(hand, end, 3.5, pal.body);
      const px = -uy;
      const py = ux;
      if (pose.prop === 'hammer') {
        const hw = 13;
        const hh = 8;
        const c = { x: end.x + ux * 4, y: end.y + uy * 4 };
        const pts = [
          T(c.x + px * hw + ux * hh, c.y + py * hw + uy * hh),
          T(c.x - px * hw + ux * hh, c.y - py * hw + uy * hh),
          T(c.x - px * hw - ux * hh, c.y - py * hw - uy * hh),
          T(c.x + px * hw - ux * hh, c.y + py * hw - uy * hh),
        ];
        g.fillStyle(pal.body, 1);
        g.fillPoints(pts, true);
      } else {
        const c = { x: end.x + ux * 13, y: end.y + uy * 13 };
        const C = T(c.x, c.y);
        const half = 14 * s;
        g.fillStyle(0x141414, 1);
        g.fillRect(C.x - half - 2 * s, C.y - half - 2 * s, half * 2 + 4 * s, half * 2 + 4 * s);
        g.fillStyle(0xf4f1d0, 1);
        g.fillRect(C.x - half, C.y - half, half * 2, half * 2);
        propAnchor = C;
      }
    } else if (pose.prop === 'key') {
      const top = { x: hip.x, y: 4 };
      const bottom = { x: hip.x, y: 30 };
      seg(top, bottom, 4, pal.body);
      const ring = T(top.x, top.y);
      g.lineStyle(4 * s, pal.body, 1);
      g.strokeCircle(ring.x, ring.y, 6 * s);
      seg({ x: bottom.x, y: bottom.y - 4 }, { x: bottom.x + 7, y: bottom.y - 4 }, 3, pal.body);
      seg({ x: bottom.x, y: bottom.y - 10 }, { x: bottom.x + 5, y: bottom.y - 10 }, 3, pal.body);
    }
  };

  if (hero) return drawHero(hero);

  // --- Back limbs -----------------------------------------------------------
  const backShade = (c: number) => (flash || id === 'gnw' ? c : shade(c, 0.78));
  if (id === 'luigi') {
    outlined([armB[0], armB[1], armB[2]], rig.limbW, backShade(pal.body));
    dot(armB[2], 5.5, backShade(pal.hands));
    outlined([legB[0], legB[1], legB[2]], rig.legW, backShade(pal.accent));
    drawShoe(legB[2], backShade(pal.feet));
  } else if (id === 'sheik') {
    outlined([legB[0], legB[1], legB[2]], rig.legW, backShade(pal.body));
    seg(lerpV(legB[1], legB[2], 0.15), legB[2], rig.legW - 1.5, backShade(pal.accent2));
    drawShoe(legB[2], backShade(pal.feet));
    outlined([armB[0], armB[1], armB[2]], rig.limbW, backShade(pal.body));
    seg(lerpV(armB[1], armB[2], 0.1), armB[2], rig.limbW - 1, backShade(pal.accent2));
  } else {
    outlined([armB[0], armB[1], armB[2]], rig.limbW, pal.body);
    dot(armB[2], 3.5, pal.body);
    outlined([legB[0], legB[1], legB[2]], rig.legW, pal.body);
    drawShoe(legB[2], pal.body);
  }

  // --- Torso -----------------------------------------------------------------
  if (id === 'luigi') {
    outlined([hip, shoulder], rig.torsoW, pal.body);
    const bibTop = lerpV(hip, shoulder, 0.62);
    seg(hip, bibTop, rig.torsoW, pal.accent);
    seg({ x: hip.x - 5, y: hip.y + 3 }, { x: hip.x + 6, y: hip.y + 3 }, 10, pal.accent);
    dot({ x: bibTop.x + 6, y: bibTop.y + 1 }, 2.6, pal.accent2);
    dot({ x: bibTop.x - 6, y: bibTop.y + 1 }, 2.6, pal.accent2);
  } else if (id === 'sheik') {
    outlined([hip, shoulder], rig.torsoW, pal.body);
    const a = lerpV(hip, shoulder, 0.05);
    const b = lerpV(hip, shoulder, 0.9);
    seg(a, b, rig.torsoW - 7, pal.accent);
    const emblem = lerpV(hip, shoulder, 0.62);
    const E = T(emblem.x + 2, emblem.y);
    g.fillStyle(flash ? 0xffffff : 0xf4f1e6, 1);
    g.fillEllipse(E.x, E.y, 8 * s, 5 * s);
    g.fillStyle(pal.detail, 1);
    g.fillCircle(E.x, E.y, 1.8 * s);
    g.lineStyle(1.5 * s, pal.detail, 1);
    g.lineBetween(E.x, E.y + 2.5 * s, E.x, E.y + 7 * s);
  } else {
    seg(hip, shoulder, rig.torsoW, pal.body);
    seg(lerpV(hip, shoulder, -0.1), lerpV(hip, shoulder, 0.5), rig.torsoW + 2, pal.body);
  }

  // --- Front leg ---------------------------------------------------------------
  if (id === 'luigi') {
    outlined([legF[0], legF[1], legF[2]], rig.legW, pal.accent);
    drawShoe(legF[2], pal.feet);
  } else if (id === 'sheik') {
    outlined([legF[0], legF[1], legF[2]], rig.legW, pal.body);
    seg(lerpV(legF[1], legF[2], 0.15), legF[2], rig.legW - 1.5, pal.accent2);
    stripes(legF[1], legF[2], rig.legW - 1.5);
    drawShoe(legF[2], pal.feet);
  } else {
    outlined([legF[0], legF[1], legF[2]], rig.legW, pal.body);
    drawShoe(legF[2], pal.body);
  }

  // --- Head --------------------------------------------------------------------
  const r = rig.headR;
  if (id === 'gnw') {
    poly(ellipse(0, 0, r, r), pal.body);
    headDot(r * 0.95, 1.5, 4.5, pal.body);
    headDot(4.5, -3, 2.4, pal.eye);
    headDot(5.2, -2.8, 1.1, 0x141414);
    if (pose.expression === 'hurt') {
      headDot(3, 5, 1.6, pal.eye);
    }
  } else if (id === 'luigi') {
    poly(ellipse(-6, 3, 7, 8), pal.hair, ol);
    poly(ellipse(0, 0, r, r * 1.02), pal.skin, ol);
    headDot(-4, 2, 3.4, shade(pal.skin, 0.85));
    // Eye
    if (pose.expression === 'hurt') {
      const a = HP(3, -2);
      const b = HP(9, 4);
      const c = HP(9, -2);
      const d = HP(3, 4);
      g.lineStyle(2 * s, ol, 1);
      g.lineBetween(a.x, a.y, b.x, b.y);
      g.lineBetween(c.x, c.y, d.x, d.y);
    } else if (pose.expression === 'happy') {
      const pts = ellipse(6, 2.5, 4, 3, Math.PI, Math.PI * 2, 8).map(([px, py]) => HP(px, py));
      g.lineStyle(2 * s, ol, 1);
      g.strokePoints(pts, false);
    } else {
      poly(ellipse(5.5, 1.5, 3.4, 5), 0xffffff, ol, 1.5);
      headDot(6.8, pose.expression === 'focus' ? 0.6 : 2, 2.1, pal.eye);
    }
    // Nose + mustache
    poly(ellipse(14, 6, 5.8, 5.2), pal.skin, ol, 2);
    poly([[4, 10], [8, 8.5], [12, 10], [16, 9], [20, 11], [19, 14], [14, 13], [10, 14.5], [5, 13.5]], pal.detail);
    if (pose.expression === 'hurt' || pose.expression === 'happy') {
      poly(ellipse(10, 16, 3.5, 2.2), 0x8a2b2b);
    }
    // Cap
    poly(ellipse(0, -4, r * 1.08, r * 0.95, Math.PI, Math.PI * 2, 16), pal.body, ol);
    poly([[2, -5], [24, -4], [24, -1], [2, -1.5]], shade(pal.body, 0.85), ol, 1.5);
    poly(ellipse(2, -10.5, 5.2, 4.6), 0xffffff);
    const l1 = HP(0.5, -13.5);
    const l2 = HP(0.5, -8);
    const l3 = HP(4.5, -8);
    g.lineStyle(2 * s, pal.emblem, 1);
    g.lineBetween(l1.x, l1.y, l2.x, l2.y);
    g.lineBetween(l2.x, l2.y, l3.x, l3.y);
  } else {
    // Sheik: braid, cowl, eye slit, hair tuft
    const braidTop = { hx: -r * 0.8, hy: 0 };
    const b0 = HP(braidTop.hx, braidTop.hy);
    const b1 = HP(-r * 1.6, r * 1.7);
    g.lineStyle(5 * s, pal.hair, 1);
    g.lineBetween(b0.x, b0.y, b1.x, b1.y);
    g.fillStyle(pal.accent2, 1);
    g.fillCircle(b1.x, b1.y, 3 * s);
    poly(ellipse(0, 0, r, r * 1.05), pal.body, ol);
    poly([[1, -6.5], [r + 0.5, -6.5], [r + 0.8, -0.5], [1, -0.5]], pal.skin);
    headDot(7.5, -3.6, 2.1, pal.eye);
    poly([[-7, -r * 0.8], [-1, -r * 1.12], [6, -r * 1.02], [r * 0.95, -r * 0.5], [r * 0.7, -5.5], [4, -7.5], [-3, -8.5]], pal.hair, ol, 1.5);
    if (pose.expression === 'hurt') headDot(7.5, -3.6, 1.2, 0xffffff);
  }

  // --- Front arm -----------------------------------------------------------------
  if (id === 'luigi') {
    outlined([armF[0], armF[1], armF[2]], rig.limbW, pal.body);
    drawProp();
    const H = T(armF[2].x, armF[2].y);
    g.fillStyle(ol, 1);
    g.fillCircle(H.x, H.y, 7.5 * s);
    g.fillStyle(pal.hands, 1);
    g.fillCircle(H.x, H.y, 5.8 * s);
  } else if (id === 'sheik') {
    outlined([armF[0], armF[1], armF[2]], rig.limbW, pal.body);
    seg(lerpV(armF[1], armF[2], 0.1), armF[2], rig.limbW - 1, pal.accent2);
    stripes(armF[1], armF[2], rig.limbW - 1);
    drawProp();
  } else {
    outlined([armF[0], armF[1], armF[2]], rig.limbW, pal.body);
    dot(armF[2], 3.6, pal.body);
    drawProp();
  }

  const headW = T(head.x, head.y);
  const top = Math.min(headW.y - r * s * 1.6, T(shoulder.x, shoulder.y).y - r * 2 * s);
  return { head: headW, top, propAnchor, handF: T(armF[2].x, armF[2].y) };

  /** The four crossover fighters share one body plan with per-character details. */
  function drawHero(colors: HeroColors): DrawResult {
    const W = 0xffffff;
    const c = (col: number) => (flash ? W : col);
    const dim = (col: number) => (flash ? W : shade(col, 0.78));
    const r = rig.headR;
    const heroId = id as HeroId;

    // Cape (behind everything).
    if (colors.cape) {
      const flare = pose.flare;
      const back = { x: shoulder.x - 6, y: shoulder.y + 2 };
      const pts = [
        T(shoulder.x + 4, shoulder.y - 2),
        T(back.x - 10 - flare * 18, hip.y + 6 - flare * 6),
        T(back.x - 22 - flare * 30, hip.y + rig.thigh + 6 - flare * 14),
        T(hip.x - 8 - flare * 10, hip.y + rig.thigh + 10 - flare * 8),
        T(hip.x + 2, hip.y),
      ];
      g.fillStyle(ol, 1);
      g.fillPoints(pts.map((p, i) => (i === 0 || i === pts.length - 1 ? p : { x: p.x - facing * 2 * s, y: p.y + 2 * s })), true);
      g.fillStyle(c(colors.cape), 1);
      g.fillPoints(pts, true);
    }

    const armBack = () => {
      outlined([armB[0], armB[1]], rig.limbW, dim(colors.upperArm));
      outlined([armB[1], armB[2]], rig.limbW, dim(colors.foreArm));
      dot(armB[2], rig.limbW * 0.62, dim(colors.hand));
    };
    const legBack = () => {
      outlined([legB[0], legB[1]], rig.legW, dim(colors.thigh));
      outlined([legB[1], legB[2]], rig.legW, dim(colors.shin));
      seg(legB[2], { x: legB[2].x + 6, y: legB[2].y + 1 }, rig.legW * 0.8, dim(colors.boot));
    };
    armBack();
    legBack();

    // Torso
    outlined([hip, shoulder], rig.torsoW, c(colors.suit));
    const at = (t: number, dx = 0) => ({ x: hip.x + (shoulder.x - hip.x) * t + dx, y: hip.y + (shoulder.y - hip.y) * t });
    /** A band across the torso at height t (0 = hip, 1 = shoulder). */
    function belt(t: number, thickness: number, color: number) {
      const half = rig.torsoW / 2 - thickness / 2 + 0.5;
      seg(at(t, -half), at(t, half), thickness, color);
    }
    if (heroId === 'spiderman') {
      seg(hip, at(0.38), rig.torsoW, c(colors.suit2));
      // spider emblem + web lines
      const e = at(0.68, 3);
      dot(e, 2.4, c(colors.accent2));
      for (const [ox, oy] of [[-5, -3], [5, -3], [-5, 3], [5, 3]]) seg(e, { x: e.x + ox, y: e.y + oy }, 1.1, c(colors.accent2));
      for (const t of [0.5, 0.82]) seg(at(t, -rig.torsoW * 0.4), at(t, rig.torsoW * 0.4), 0.9, c(colors.accent));
    } else if (heroId === 'batman') {
      const e = at(0.7, 2);
      const bat: [number, number][] = [[-9, 0], [-5, -2.5], [-2.5, -4.5], [0, -2.5], [2.5, -4.5], [5, -2.5], [9, 0], [6, 1.5], [3.5, 3.5], [0, 1.5], [-3.5, 3.5], [-6, 1.5]];
      g.fillStyle(c(colors.accent), 1);
      g.fillPoints(bat.map(([bx, by]) => T(e.x + bx, e.y + by)), true);
      belt(0.08, 5.5, c(colors.accent2));
      for (const dx of [-7, 0, 7]) dot(at(0.08, dx), 2.2, c(shade(colors.accent2, 0.75)));
    } else if (heroId === 'naruto') {
      seg(at(0.72), shoulder, rig.torsoW, c(colors.suit2));
      dot(at(1, 2), rig.torsoW * 0.32, c(W));
      seg(at(0.08, rig.torsoW * 0.3), at(0.7, rig.torsoW * 0.3), 1.2, c(W));
      dot(at(0.0), rig.torsoW * 0.38, c(colors.suit2));
    } else {
      // Goku: undershirt V, belt, chest patch
      seg(at(0.86, 4), shoulder, rig.torsoW * 0.45, c(colors.suit2));
      belt(0.06, 5, c(colors.accent));
      const e = at(0.62, 4);
      dot(e, 4.2, c(W));
      g.lineStyle(1.2 * s, c(colors.outline), 1);
      const E = T(e.x, e.y);
      g.strokeCircle(E.x, E.y, 4.2 * s);
    }

    // Front leg
    outlined([legF[0], legF[1]], rig.legW, c(colors.thigh));
    outlined([legF[1], legF[2]], rig.legW, c(colors.shin));
    if (heroId === 'goku') seg(lerpV(legF[1], legF[2], 0.55), legF[2], rig.legW + 1, c(colors.boot));
    seg(legF[2], { x: legF[2].x + 7, y: legF[2].y + 1 }, rig.legW * 0.85, c(colors.boot));

    // Head
    drawHeroHead(heroId, colors, c, r);

    // Front arm
    outlined([armF[0], armF[1]], rig.limbW, c(colors.upperArm));
    outlined([armF[1], armF[2]], rig.limbW, c(colors.foreArm));
    if (heroId === 'goku') seg(lerpV(armF[1], armF[2], 0.7), lerpV(armF[1], armF[2], 0.95), rig.limbW + 2, c(colors.accent));
    if (heroId === 'batman') {
      // gauntlet fins
      for (const t of [0.35, 0.6]) {
        const p0 = lerpV(armF[1], armF[2], t);
        const p1 = lerpV(armF[1], armF[2], t + 0.15);
        const nx = -(armF[2].y - armF[1].y) * 0.25;
        const ny = (armF[2].x - armF[1].x) * 0.25;
        g.fillStyle(c(colors.foreArm), 1);
        g.fillTriangle(...flat(T(p0.x, p0.y)), ...flat(T(p1.x, p1.y)), ...flat(T(p0.x - nx, p0.y - ny)));
      }
    }
    if (heroId === 'spiderman') stripes2(armF[1], armF[2], rig.limbW, c(colors.accent));
    const H = T(armF[2].x, armF[2].y);
    g.fillStyle(ol, 1);
    g.fillCircle(H.x, H.y, (rig.limbW * 0.62 + 1.6) * s);
    g.fillStyle(c(colors.hand), 1);
    g.fillCircle(H.x, H.y, rig.limbW * 0.62 * s);

    const headW = T(head.x, head.y);
    const top = Math.min(headW.y - r * s * 1.8, T(shoulder.x, shoulder.y).y - r * 2 * s);
    return { head: headW, top, propAnchor: null, handF: T(armF[2].x, armF[2].y) };
  }

  function drawHeroHead(heroId: HeroId, colors: HeroColors, c: (n: number) => number, r: number) {
    const W = 0xffffff;
    if (heroId === 'spiderman') {
      poly(ellipse(0, 0, r, r * 1.08), c(colors.skin), ol);
      // web lines radiating from the face center
      const cx = r * 0.35;
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const p0 = HP(cx, 0);
        const p1 = HP(Math.cos(a) * r * 0.95, Math.sin(a) * r);
        g.lineStyle(0.9 * s, c(colors.accent), 0.85);
        g.lineBetween(p0.x, p0.y, p1.x, p1.y);
      }
      g.lineStyle(0.9 * s, c(colors.accent), 0.85);
      g.strokePoints(ellipse(cx * 0.5, 0, r * 0.55, r * 0.6).map(([px, py]) => HP(px, py)), false);
      poly([[2.5, -7.5], [11, -6], [12.5, 0.5], [6.5, 2.5], [2, -1.5]], c(colors.eye), colors.accent2 === 0xf2f2f2 && !flash ? 0x111111 : c(colors.accent2), 2.2);
      if (pose.expression === 'hurt') poly(ellipse(7, 7, 3, 1.5), c(colors.accent));
    } else if (heroId === 'batman') {
      poly(ellipse(0, 0, r, r * 1.05), c(colors.hair), ol);
      poly([[-7, -r * 0.75], [-4.5, -r * 1.7], [-1, -r * 0.85]], c(colors.hair), ol, 1.5);
      poly([[2, -r * 0.88], [5.5, -r * 1.75], [8.5, -r * 0.7]], c(colors.hair), ol, 1.5);
      poly([[1, 2], [r + 1, 1], [r + 0.5, 7], [7, r * 0.95], [0, r * 0.92]], c(colors.skin), ol, 1.5);
      poly([[3.5, -3.5], [r - 0.5, -3.5], [r - 1.5, -1.2], [4.5, -1.2]], c(colors.eye));
      const m0 = HP(6, 6.5);
      const m1 = HP(r - 1, 6);
      g.lineStyle(1.3 * s, ol, 1);
      g.lineBetween(m0.x, m0.y, m1.x, m1.y);
    } else if (heroId === 'naruto') {
      // back hair spikes, face, headband, bangs
      poly([[-r * 0.6, 7], [-r * 1.55, 1], [-r * 1.0, -5], [-r * 1.6, -11], [-r * 0.65, -r * 0.95], [-r * 0.85, -r * 1.6],
        [-2, -r * 1.12], [1, -r * 1.75], [5, -r * 1.1], [9, -r * 1.55], [r * 0.8, -r * 0.7], [r * 1.35, -r * 0.8], [r * 0.95, -3]], c(colors.hair), ol, 1.8);
      poly(ellipse(0.5, 1, r * 0.98, r), c(colors.skin), ol);
      const tail0 = HP(-r * 0.9, -4);
      const tail1 = HP(-r * 1.7, 4);
      g.lineStyle(3 * s, c(colors.accent2), 1);
      g.lineBetween(tail0.x, tail0.y, tail1.x, tail1.y);
      poly([[-r * 0.98, -7], [r + 0.8, -8], [r + 0.8, -2.5], [-r * 0.98, -1.5]], c(colors.accent2));
      poly([[2, -8.5], [r - 0.5, -9], [r - 0.5, -2], [2, -1.5]], c(colors.accent), ol, 1);
      poly([[-2, -r * 0.62], [1, -r * 1.2], [4, -r * 0.7], [7, -r * 1.25], [9.5, -r * 0.62]], c(colors.hair), ol, 1.2);
      headDot(7, 2, 2.6, c(W));
      headDot(7.8, 2.2, 1.7, c(colors.eye));
      g.lineStyle(1 * s, c(colors.outline), 0.8);
      for (const wy of [5.5, 7.5, 9.5]) {
        const a = HP(3, wy);
        const b = HP(8, wy - 0.5);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
      if (pose.expression === 'happy' || pose.expression === 'focus') poly(ellipse(r * 0.6, 9, 3, 1.6, 0, Math.PI, 8), c(0xffffff), ol, 1);
    } else {
      // Goku
      poly([[-r * 0.7, 7], [-r * 1.75, 1], [-r * 1.05, -5], [-r * 1.85, -11], [-r * 0.75, -r * 0.95], [-r * 1.1, -r * 1.8],
        [-1, -r * 1.12], [3, -r * 1.95], [6, -r * 1.05], [r * 1.05, -r * 1.55], [r * 0.85, -r * 0.6], [r * 1.25, -1.5], [r * 0.6, -2]], c(colors.hair), ol, 1.8);
      poly(ellipse(0.5, 1.5, r * 0.95, r * 0.98), c(colors.skin), ol);
      headDot(-3, 3, 3, c(shade(colors.skin, 0.88)));
      poly([[0, -r * 0.7], [3, -3.5], [5.5, -r * 0.82], [8, -4], [r * 0.95, -r * 0.62], [r * 0.5, -r * 1.05], [1, -r * 1.0]], c(colors.hair), ol, 1.2);
      headDot(7, 1.5, 1.9, c(colors.eye));
      const b0 = HP(4.5, -2);
      const b1 = HP(10, -3);
      g.lineStyle(1.6 * s, c(colors.eye), 1);
      g.lineBetween(b0.x, b0.y, b1.x, b1.y);
      if (pose.expression === 'focus' || pose.expression === 'happy') {
        const m0 = HP(6, 8);
        const m1 = HP(r - 1, 7.5);
        g.lineStyle(1.3 * s, ol, 1);
        g.lineBetween(m0.x, m0.y, m1.x, m1.y);
      }
    }
  }

  function stripes2(a: V, b: V, w: number, color: number) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (w / 2);
    const ny = (dx / len) * (w / 2);
    g.lineStyle(0.9 * s, color, 0.8);
    for (const t of [0.3, 0.55, 0.8]) {
      const p = lerpV(a, b, t);
      const p1 = T(p.x + nx, p.y + ny);
      const p2 = T(p.x - nx, p.y - ny);
      g.lineBetween(p1.x, p1.y, p2.x, p2.y);
    }
  }

  function drawShoe(ankle: V, color: number) {
    if (id === 'luigi') {
      const a = T(ankle.x + 3, ankle.y + 2);
      g.fillStyle(ol, 1);
      g.fillEllipse(a.x, a.y, 18 * s, 11 * s);
      g.fillStyle(color, 1);
      g.fillEllipse(a.x, a.y, 14.5 * s, 8 * s);
    } else if (id === 'sheik') {
      seg(ankle, { x: ankle.x + 6, y: ankle.y + 1 }, 5, color);
    } else {
      seg(ankle, { x: ankle.x + 5, y: ankle.y }, 5, color);
    }
  }

  function stripes(a: V, b: V, w: number) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (w / 2);
    const ny = (dx / len) * (w / 2);
    g.lineStyle(1.2 * s, flash ? 0xcccccc : 0x9a9583, 1);
    for (const t of [0.35, 0.6, 0.85]) {
      const c = lerpV(a, b, t);
      const p1 = T(c.x + nx, c.y + ny - 1.5);
      const p2 = T(c.x - nx, c.y - ny + 1.5);
      g.lineBetween(p1.x, p1.y, p2.x, p2.y);
    }
  }
}

function flat(p: V): [number, number] {
  return [p.x, p.y];
}

function lerpV(a: V, b: V, t: number): V {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function shade(color: number, f: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * f));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * f));
  const b = Math.min(255, Math.round((color & 0xff) * f));
  return (r << 16) | (g << 8) | b;
}
