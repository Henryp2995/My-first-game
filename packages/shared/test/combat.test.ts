import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES, FIGHTERS, FIGHTER_ORDER, hitboxRect, hurtboxRect, knockbackSpeed, moveTotalFrames,
  rectsOverlap, resolveHitboxValues, type MoveSlot,
} from '../src';
import { emptyInput, makeInput, run, setupMatch, tap } from './helpers';

function face(m: ReturnType<typeof setupMatch>, gap = 40) {
  const [a, b] = m.fighters;
  a.x = -gap / 2;
  b.x = gap / 2;
  a.facing = 1;
  b.facing = -1;
}

describe('character stats', () => {
  it('defines all nine fighters with all four move slots', () => {
    expect(FIGHTER_ORDER).toEqual(['gnw', 'luigi', 'sheik', 'spiderman', 'batman', 'naruto', 'goku', 'gundam', 'vader']);
    for (const id of FIGHTER_ORDER) {
      for (const slot of ['light', 'heavy', 'special', 'aerial'] as MoveSlot[]) {
        const move = FIGHTERS[id].moves[slot];
        // Every move hits with a body hitbox or fires a projectile.
        expect(move.hitboxes.length > 0 || move.behavior?.type === 'projectile', `${id} ${slot}`).toBe(true);
      }
    }
  });

  it('matches the balance table', () => {
    const { gnw, luigi, sheik } = FIGHTERS;
    expect(sheik.stats.runSpeed).toBeGreaterThan(gnw.stats.runSpeed);
    expect(gnw.stats.runSpeed).toBeGreaterThan(luigi.stats.runSpeed);
    expect(luigi.stats.weight).toBeGreaterThan(sheik.stats.weight);
    expect(sheik.stats.weight).toBeGreaterThan(gnw.stats.weight);
    expect(luigi.ratings.power).toBeGreaterThan(gnw.ratings.power);
    expect(gnw.ratings.power).toBeGreaterThan(sheik.ratings.power);
  });

  it('keeps light attacks at 4–7% total and heavies at 10–15%', () => {
    for (const id of FIGHTER_ORDER) {
      const total = (slot: MoveSlot) => FIGHTERS[id].moves[slot].hitboxes.reduce((s, h) => s + h.damage, 0);
      expect(total('light')).toBeGreaterThanOrEqual(4);
      expect(total('light')).toBeLessThanOrEqual(7);
      expect(total('heavy')).toBeGreaterThanOrEqual(10);
      expect(total('heavy')).toBeLessThanOrEqual(15);
    }
  });
});

describe('hit detection', () => {
  it('hitboxes mirror with facing', () => {
    const hb = FIGHTERS.luigi.moves.heavy.hitboxes[0];
    const r = hitboxRect({ x: 0, y: 0, facing: 1 }, hb);
    const l = hitboxRect({ x: 0, y: 0, facing: -1 }, hb);
    expect(r.x + r.w / 2).toBeCloseTo(hb.x);
    expect(l.x + l.w / 2).toBeCloseTo(-hb.x);
  });

  it('a light attack hits an adjacent opponent and deals its damage', () => {
    const m = setupMatch(['gnw', 'luigi']);
    face(m);
    const ev = [...tap(m, 0, { light: true }), ...run(m, 20)];
    const hits = ev.filter((e) => e.type === 'hit');
    expect(hits).toHaveLength(1);
    expect(m.fighters[1].damage).toBe(FIGHTERS.gnw.moves.light.hitboxes[0].damage);
    expect(m.fighters[1].stats.damageTaken).toBe(5);
    expect(m.fighters[0].stats.damageDealt).toBe(5);
  });

  it('misses an opponent who is out of range', () => {
    const m = setupMatch(['gnw', 'luigi']);
    face(m, 400);
    const ev = [...tap(m, 0, { light: true }), ...run(m, 20)];
    expect(ev.some((e) => e.type === 'hit')).toBe(false);
    expect(m.fighters[1].damage).toBe(0);
  });

  it('multi-hit moves hit once per hit group (Sheik flurry = 3 hits)', () => {
    const m = setupMatch(['sheik', 'luigi']);
    face(m);
    const ev = [...tap(m, 0, { light: true }), ...run(m, 30)];
    expect(ev.filter((e) => e.type === 'hit')).toHaveLength(3);
    expect(m.fighters[1].damage).toBe(7);
  });

  it('respects startup frames before the hitbox comes out', () => {
    const m = setupMatch(['gnw', 'luigi']);
    face(m);
    const startup = FIGHTERS.gnw.moves.heavy.startup;
    const ev = [...tap(m, 0, { heavy: true }), ...run(m, startup - 3)];
    expect(ev.some((e) => e.type === 'hit')).toBe(false);
    const later = run(m, 10);
    expect(later.some((e) => e.type === 'hit')).toBe(true);
  });

  it('light attack in the air becomes the aerial', () => {
    const m = setupMatch(['sheik', 'luigi']);
    const f = m.fighters[0];
    tap(m, 0, { jump: true });
    run(m, 5);
    const ev = tap(m, 0, { light: true });
    expect(ev.find((e) => e.type === 'attack')).toMatchObject({ slot: 'aerial', moveId: 'sheik-diagkick' });
    expect(f.action).toBe('attack');
  });
});

describe('attack cooldowns', () => {
  it('cannot reuse a special until its cooldown expires', () => {
    const m = setupMatch(['gnw', 'luigi']);
    face(m, 600);
    const move = FIGHTERS.gnw.moves.special;
    tap(m, 0, { special: true });
    run(m, moveTotalFrames(move));
    expect(m.fighters[0].action).toBe('idle');
    expect(m.fighters[0].cooldowns.special).toBeGreaterThan(0);
    const ev = tap(m, 0, { special: true });
    expect(ev.some((e) => e.type === 'attack')).toBe(false);
    run(m, move.cooldown + 5);
    const ev2 = tap(m, 0, { special: true });
    expect(ev2.some((e) => e.type === 'attack')).toBe(true);
  });

  it('cannot act during attack recovery', () => {
    const m = setupMatch(['luigi', 'luigi']);
    face(m, 600);
    tap(m, 0, { heavy: true });
    const ev = tap(m, 0, { light: true });
    expect(ev.filter((e) => e.type === 'attack')).toHaveLength(0);
  });
});

describe('damage and knockback', () => {
  it('knockback grows with percentage', () => {
    const lo = knockbackSpeed(10, 14, 470, 10.5, 100);
    const hi = knockbackSpeed(120, 14, 470, 10.5, 100);
    expect(hi).toBeGreaterThan(lo * 2);
  });

  it('lighter fighters are launched faster', () => {
    const light = knockbackSpeed(80, 10, 400, 8, FIGHTERS.gnw.stats.weight);
    const heavy = knockbackSpeed(80, 10, 400, 8, FIGHTERS.luigi.stats.weight);
    expect(light).toBeGreaterThan(heavy);
  });

  it('launches the victim in the attack direction and applies hitstun + hitstop', () => {
    const m = setupMatch(['gnw', 'luigi']);
    face(m);
    m.fighters[1].damage = 80;
    const ev = tap(m, 0, { heavy: true });
    ev.push(...run(m, FIGHTERS.gnw.moves.heavy.startup));
    const hit = ev.find((e) => e.type === 'hit');
    expect(hit).toBeDefined();
    const v = m.fighters[1];
    expect(v.kbx).toBeGreaterThan(0);
    expect(v.kby).toBeLessThan(0);
    expect(v.action).toBe('hitstun');
    expect(v.damage).toBe(94);
    run(m, 1);
  });

  it('hitstop freezes both fighters briefly', () => {
    const m = setupMatch(['gnw', 'luigi']);
    face(m);
    tap(m, 0, { heavy: true });
    let hitFrame = false;
    for (let i = 0; i < 30 && !hitFrame; i++) hitFrame = run(m, 1).some((e) => e.type === 'hit');
    expect(m.fighters[0].hitstop).toBeGreaterThan(0);
    expect(m.fighters[1].hitstop).toBe(m.fighters[0].hitstop);
    const x = m.fighters[1].x;
    run(m, 1);
    expect(m.fighters[1].x).toBe(x);
  });

  it('a stronger hit at high percent sends the victim much farther', () => {
    const distance = (pct: number) => {
      const m = setupMatch(['gnw', 'luigi']);
      face(m);
      m.fighters[1].damage = pct;
      tap(m, 0, { heavy: true });
      run(m, 40);
      return m.fighters[1].x;
    };
    expect(distance(100)).toBeGreaterThan(distance(0) + 150);
  });

  it('Judge rolls deterministically from the seed and uses the rolled outcome', () => {
    const roll = (seed: number) => {
      const m = setupMatch(['gnw', 'luigi'], {}, seed);
      const ev = tap(m, 0, { special: true });
      const j = ev.find((e) => e.type === 'judge');
      return j && j.type === 'judge' ? j.value : -1;
    };
    expect(roll(42)).toBe(roll(42));
    const values = new Set(Array.from({ length: 60 }, (_, i) => roll(i + 1)));
    expect(values.size).toBeGreaterThan(5);
    for (const v of values) expect(v).toBeGreaterThanOrEqual(1);

    const m = setupMatch(['gnw', 'luigi']);
    const f = m.fighters[0];
    f.judgeValue = 9;
    const vals = resolveHitboxValues(f, FIGHTERS.gnw.moves.special, FIGHTERS.gnw.moves.special.hitboxes[0]);
    expect(vals.damage).toBe(32);
  });

  it('Luigi rocket goes farther and hits harder when charged', () => {
    const fly = (holdFrames: number, seed: number) => {
      const m = setupMatch(['luigi', 'sheik'], {}, seed);
      const f = m.fighters[0];
      f.x = -400;
      m.fighters[1].x = 400;
      run(m, holdFrames + 1, (i) => [makeInput({ special: i <= holdFrames }), emptyInput()]);
      const startX = f.x;
      run(m, 40);
      return { dist: f.x - startX, misfire: f.misfire, charge: f.charge };
    };
    // Find seeds where neither shot misfires, to compare charge only.
    let seed = 1;
    let quick = fly(0, seed);
    let charged = fly(70, seed);
    while (quick.misfire || charged.misfire) {
      seed++;
      quick = fly(0, seed);
      charged = fly(70, seed);
    }
    expect(charged.charge).toBe(FIGHTERS.luigi.moves.special.behavior!.type === 'rocket' ? 60 : 0);
    expect(charged.dist).toBeGreaterThan(quick.dist);
  });

  it('Sheik vanish teleports in the held direction and is intangible while vanished', () => {
    const m = setupMatch(['sheik', 'luigi']);
    const f = m.fighters[0];
    f.x = -200;
    f.facing = 1;
    tap(m, 0, { special: true });
    expect(f.action).toBe('attack');
    expect(hurtboxRect(f, FIGHTERS.sheik.stats)).toBeDefined();
    const startX = f.x;
    run(m, FIGHTERS.sheik.moves.special.startup + 2, [makeInput({ left: true }), emptyInput()]);
    expect(f.x).toBeLessThan(startX - 150);
  });
});

describe('dodging', () => {
  it('grants invulnerability for ~0.25s then becomes hittable', () => {
    const m = setupMatch(['gnw', 'luigi']);
    face(m);
    tap(m, 1, { dodge: true });
    const v = m.fighters[1];
    expect(v.action).toBe('dodge');
    expect(DEFAULT_RULES.dodge.invulnFrames).toBe(15);
    // Attack immediately — the dodge should make it whiff.
    const ev = [...tap(m, 0, { light: true }), ...run(m, 8)];
    expect(ev.some((e) => e.type === 'hit')).toBe(false);
    expect(v.damage).toBe(0);
  });

  it('dodge has a 1.5s cooldown', () => {
    const m = setupMatch();
    tap(m, 0, { dodge: true });
    run(m, DEFAULT_RULES.dodge.totalFrames + 2);
    const again = tap(m, 0, { dodge: true });
    expect(again.some((e) => e.type === 'dodge')).toBe(false);
    run(m, DEFAULT_RULES.dodge.cooldownFrames);
    const later = tap(m, 0, { dodge: true });
    expect(later.some((e) => e.type === 'dodge')).toBe(true);
  });

  it('is hittable again after invulnerability ends', () => {
    const m = setupMatch(['gnw', 'luigi']);
    face(m);
    tap(m, 1, { dodge: true });
    run(m, DEFAULT_RULES.dodge.totalFrames + 2);
    const ev = [...tap(m, 0, { light: true }), ...run(m, 10)];
    expect(ev.some((e) => e.type === 'hit')).toBe(true);
  });
});

describe('geometry', () => {
  it('detects overlap', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });
});
