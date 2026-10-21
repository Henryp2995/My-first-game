import { describe, expect, it } from 'vitest';
import {
  CpuController, createMatch, DEFAULT_RULES, FIGHTERS, FIGHTER_ORDER, getStage, makeRules, moveTotalFrames,
  solidExtent, STAGE_ORDER, STAGES, stepMatch,
  type FighterId, type GameEvent, type MatchState, type StageId,
} from '../src';
import { emptyInput, makeInput, run, setupMatch } from './helpers';

const NEW: FighterId[] = ['spiderman', 'batman', 'naruto', 'goku', 'gundam', 'vader'];

function onStage(fighters: FighterId[], stage: StageId, seed = 1): MatchState {
  return createMatch(fighters.map((fighter) => ({ fighter })), { rules: makeRules({ countdownFrames: 0 }), stage: getStage(stage), seed });
}

/** Places attacker (P1) at x facing right and the victim `gap` px ahead, both grounded on Skyfall. */
function lineUp(att: FighterId, vic: FighterId, gap: number, x = -300): MatchState {
  const m = setupMatch([att, vic]);
  const [a, v] = m.fighters;
  a.x = x;
  a.facing = 1;
  v.x = x + gap;
  return m;
}

/** P1 presses `button` once (or holds it `hold` frames); collects events for `frames`. */
function use(m: MatchState, button: 'light' | 'heavy' | 'special', frames: number, hold = 1, extra: Partial<Record<string, boolean>> = {}): GameEvent[] {
  const ev: GameEvent[] = [];
  for (let i = 0; i < frames; i++) ev.push(...stepMatch(m, [makeInput({ [button]: i < hold, ...extra }), emptyInput()]));
  return ev;
}

describe('expanded roster', () => {
  it('has nine fighters with distinct stat lines', () => {
    expect(FIGHTER_ORDER).toHaveLength(9);
    const signatures = new Set(FIGHTER_ORDER.map((id) => JSON.stringify(FIGHTERS[id].stats)));
    expect(signatures.size).toBe(9);
  });

  it('matches the requested identities', () => {
    const s = (id: FighterId) => FIGHTERS[id].stats;
    // Gundam is the heaviest, then Batman and Vader; G&W the lightest; Spider-Man has the best air speed and double jump.
    const heavies: FighterId[] = ['gundam', 'batman', 'vader'];
    for (const id of FIGHTER_ORDER) {
      if (id !== 'gundam') expect(s('gundam').weight).toBeGreaterThan(s(id).weight);
      if (!heavies.includes(id)) expect(s('vader').weight).toBeGreaterThan(s(id).weight);
      if (id !== 'gnw') expect(s('gnw').weight).toBeLessThan(s(id).weight);
      if (id !== 'spiderman') {
        expect(s('spiderman').airSpeed).toBeGreaterThan(s(id).airSpeed);
        expect(s('spiderman').doubleJumpVelocity).toBeGreaterThan(s(id).doubleJumpVelocity);
      }
    }
    expect(s('naruto').runSpeed).toBeGreaterThan(s('goku').runSpeed);
    expect(s('goku').weight).toBeGreaterThan(s('naruto').weight);
    expect(FIGHTERS.goku.ratings.power).toBe(5);
    expect(FIGHTERS.batman.ratings.weight).toBe('Heavy');
  });

  it('every new fighter can be selected by both players (any pairing creates a match)', () => {
    for (const a of FIGHTER_ORDER) {
      for (const b of FIGHTER_ORDER) {
        const m = createMatch([{ fighter: a }, { fighter: b }]);
        expect(m.fighters.map((f) => f.fighter)).toEqual([a, b]);
      }
    }
  });

  it('Batman (heavy) is launched less than Spider-Man (light) by the same hit', () => {
    const dist = (vic: FighterId) => {
      const m = lineUp('luigi', vic, 40);
      m.fighters[1].damage = 90;
      use(m, 'heavy', 40);
      return Math.hypot(m.fighters[1].x - (m.fighters[0].x + 40), m.fighters[1].y);
    };
    expect(dist('batman')).toBeLessThan(dist('spiderman') * 0.9);
  });

  it('every new fighter lands its light, heavy and aerial on an adjacent opponent', () => {
    for (const id of NEW) {
      for (const slot of ['light', 'heavy'] as const) {
        const m = lineUp(id, 'luigi', 40);
        const ev = use(m, slot, 50);
        expect(ev.some((e) => e.type === 'hit'), `${id} ${slot}`).toBe(true);
      }
      const m = setupMatch([id, 'luigi']);
      const [a, v] = m.fighters;
      Object.assign(a, { x: 0, y: -150, grounded: false, action: 'air', vy: 200 });
      Object.assign(v, { x: 12, y: -60, grounded: false, action: 'air' });
      const ev = use(m, 'light', 30);
      expect(ev.some((e) => e.type === 'attack' && e.slot === 'aerial'), `${id} aerial`).toBe(true);
      expect(ev.some((e) => e.type === 'hit'), `${id} aerial hit`).toBe(true);
    }
  });
});

describe('Spider-Man', () => {
  it('Web Shot is a projectile that restrains the target', () => {
    const m = lineUp('spiderman', 'luigi', 320);
    const v = m.fighters[1];
    const ev = use(m, 'special', 30);
    expect(ev.some((e) => e.type === 'projectile' && e.kind === 'web')).toBe(true);
    const hit = ev.find((e) => e.type === 'hit');
    expect(hit && hit.type === 'hit' && hit.projectile).toBe('web');
    expect(v.damage).toBe(3);
    expect(v.action).toBe('hitstun');
    expect(v.restrained).toBeGreaterThan(20);
    expect(v.restrainKind).toBe('web');
    // Restrained: barely moves, and can't act until it ends.
    const x0 = v.x;
    let attacked = false;
    for (let i = 0; i < 20; i++) {
      for (const e of stepMatch(m, [emptyInput(), makeInput({ light: i % 2 === 0, left: true })])) {
        if (e.type === 'attack' && e.id === 1) attacked = true;
      }
    }
    expect(attacked).toBe(false);
    expect(Math.abs(v.x - x0)).toBeLessThan(40);
    run(m, 40);
    expect(v.restrained).toBe(0);
  });

  it('Web Shot has a cooldown', () => {
    const m = lineUp('spiderman', 'luigi', 900);
    const move = FIGHTERS.spiderman.moves.special;
    use(m, 'special', moveTotalFrames(move) + 2);
    const again = use(m, 'special', 5);
    expect(again.some((e) => e.type === 'attack' && e.id === 0)).toBe(false);
    run(m, move.cooldown);
    expect(use(m, 'special', 5).some((e) => e.type === 'attack' && e.id === 0)).toBe(true);
  });

  it('special + up in the air web-zips upward instead of shooting (once per airtime)', () => {
    const m = setupMatch(['spiderman', 'luigi']);
    const f = m.fighters[0];
    Object.assign(f, { x: 0, y: -300, grounded: false, action: 'air', vy: 300 });
    const ev = use(m, 'special', 14, 1, { up: true });
    expect(ev.some((e) => e.type === 'webzip')).toBe(true);
    expect(ev.some((e) => e.type === 'projectile')).toBe(false);
    expect(f.vy).toBeLessThan(-700);
    run(m, 40);
    const again = use(m, 'special', 5, 1, { up: true });
    expect(f.grounded).toBe(false);
    expect(again.some((e) => e.type === 'attack' && e.id === 0)).toBe(false);
  });
});

describe('Batman', () => {
  it('Batarang flies out, hits, and the boomerang returns to Batman', () => {
    const m = lineUp('batman', 'luigi', 1000); // victim far away: a clean throw
    let maxX = -Infinity;
    let caught = false;
    for (let i = 0; i < 120; i++) {
      const ev = stepMatch(m, [makeInput({ special: i === 0 }), emptyInput()]);
      for (const p of m.projectiles) maxX = Math.max(maxX, p.x);
      if (ev.some((e) => e.type === 'projectileEnd')) caught = true;
    }
    expect(maxX).toBeGreaterThan(m.fighters[0].x + 250);
    expect(caught).toBe(true);
    expect(m.projectiles).toHaveLength(0);

    const h = lineUp('batman', 'luigi', 220);
    const ev = use(h, 'special', 40);
    expect(ev.some((e) => e.type === 'hit' && e.projectile === 'batarang')).toBe(true);
    expect(h.fighters[1].damage).toBe(6);
  });
});

describe('Naruto', () => {
  it('Rasengan grinds with several small hits, then launches', () => {
    const m = lineUp('naruto', 'luigi', 60);
    const ev = use(m, 'special', 60);
    const hits = ev.filter((e) => e.type === 'hit');
    expect(hits.length).toBe(5);
    expect(m.fighters[1].damage).toBe(14);
    const last = hits[hits.length - 1];
    expect(last.type === 'hit' && last.launchSpeed).toBeGreaterThan(hits[0].type === 'hit' ? hits[0].launchSpeed * 2 : 0);
  });
});

describe('Goku', () => {
  it('Kamehameha is a long-range beam: charging adds damage, and it pierces', () => {
    const quick = lineUp('goku', 'luigi', 600);
    use(quick, 'special', 70, 1);
    expect(quick.fighters[1].damage).toBe(10);

    const full = lineUp('goku', 'luigi', 600);
    use(full, 'special', 140, 90); // hold through the full charge
    expect(full.fighters[1].damage).toBe(19);

    const multi = createMatch([{ fighter: 'goku' }, { fighter: 'luigi' }, { fighter: 'sheik' }], { rules: makeRules({ countdownFrames: 0 }) });
    Object.assign(multi.fighters[0], { x: -400, facing: 1 });
    Object.assign(multi.fighters[1], { x: -100 });
    Object.assign(multi.fighters[2], { x: 150 });
    const ev: GameEvent[] = [];
    for (let i = 0; i < 70; i++) ev.push(...stepMatch(multi, [makeInput({ special: i === 0 }), emptyInput(), emptyInput()]));
    const victims = new Set(ev.filter((e) => e.type === 'hit').map((e) => (e.type === 'hit' ? e.victim : -1)));
    expect(victims).toEqual(new Set([1, 2]));
    expect(multi.fighters[0].damage).toBe(0); // never hits its owner
  });

  it('Kamehameha has a long cooldown', () => {
    const m = lineUp('goku', 'luigi', 1000);
    const move = FIGHTERS.goku.moves.special;
    use(m, 'special', moveTotalFrames(move) + 2);
    expect(m.fighters[0].cooldowns.special).toBeGreaterThan(200);
    expect(use(m, 'special', 5).some((e) => e.type === 'attack' && e.id === 0)).toBe(false);
  });

  it('holding heavy charges the strike for extra damage', () => {
    const quick = lineUp('goku', 'luigi', 45);
    use(quick, 'heavy', 50, 1);
    const charged = lineUp('goku', 'luigi', 45);
    use(charged, 'heavy', 110, 60);
    expect(quick.fighters[1].damage).toBe(14);
    expect(charged.fighters[1].damage).toBe(20);
  });
});

describe('Gundam RX-78', () => {
  it('thrusters give it three jumps per airtime', () => {
    const m = setupMatch(['gundam', 'luigi']);
    m.fighters[0].x = 0;
    let jumps = 0;
    let landed = false;
    for (let i = 0; i < 120 && !landed; i++) {
      for (const e of stepMatch(m, [makeInput({ jump: i % 10 === 0 }), emptyInput()])) {
        if (e.type === 'jump' && e.id === 0) jumps++;
        if (e.type === 'land' && e.id === 0) landed = true;
      }
    }
    expect(landed).toBe(true);
    expect(jumps).toBe(3); // ground jump + two thruster boosts, then no more until landing
    expect(FIGHTERS.gundam.stats.maxJumps).toBe(3);
  });

  it('Beam Rifle is a fast projectile with a cooldown', () => {
    const m = lineUp('gundam', 'luigi', 520);
    const ev = use(m, 'special', 40);
    expect(ev.some((e) => e.type === 'projectile' && e.kind === 'rifle')).toBe(true);
    expect(ev.some((e) => e.type === 'hit' && e.projectile === 'rifle')).toBe(true);
    expect(m.fighters[1].damage).toBe(8);
    expect(use(m, 'special', 5).some((e) => e.type === 'attack' && e.id === 0)).toBe(false);
  });
});

describe('Darth Vader', () => {
  it('Force Choke holds the victim suspended in midair, then lets go', () => {
    const m = lineUp('vader', 'luigi', 130);
    const v = m.fighters[1];
    const ev = use(m, 'special', FIGHTERS.vader.moves.special.startup + 2);
    expect(ev.some((e) => e.type === 'hit')).toBe(true);
    expect(v.restrainKind).toBe('force');
    expect(v.damage).toBe(6);
    run(m, 6);
    const y0 = v.y;
    run(m, 25);
    expect(v.grounded).toBe(false);
    expect(v.y).toBeLessThanOrEqual(y0 + 1); // not falling while held
    expect(Math.abs(v.x - (m.fighters[0].x + 130))).toBeLessThan(25);
    run(m, 60);
    expect(v.restrained).toBe(0);
    expect(v.restrainKind).toBeNull();
  });

  it('a choked opponent can be followed up with the saber cleave', () => {
    const m = lineUp('vader', 'luigi', 70);
    const move = FIGHTERS.vader.moves.special;
    use(m, 'special', moveTotalFrames(move) + 3);
    expect(m.fighters[1].restrained).toBeGreaterThan(0);
    m.fighters[0].x = m.fighters[1].x - 55;
    const ev = use(m, 'heavy', 30);
    expect(ev.some((e) => e.type === 'hit' && e.attacker === 0)).toBe(true);
    expect(m.fighters[1].damage).toBe(21);
  });

  it('Force Choke has a long cooldown', () => {
    const m = lineUp('vader', 'luigi', 900);
    const move = FIGHTERS.vader.moves.special;
    use(m, 'special', moveTotalFrames(move) + 2);
    expect(m.fighters[0].cooldowns.special).toBeGreaterThan(100);
  });
});

describe('projectile rules', () => {
  it('cannot hit dodging (intangible) opponents', () => {
    const m = lineUp('spiderman', 'luigi', 200);
    const ev: GameEvent[] = [];
    for (let i = 0; i < 30; i++) {
      // Victim dodges just as the web arrives.
      ev.push(...stepMatch(m, [makeInput({ special: i === 0 }), makeInput({ dodge: i === 10, down: i === 10 })]));
    }
    expect(ev.some((e) => e.type === 'hit')).toBe(false);
  });

  it('hits each fighter at most once and breaks on solid ground', () => {
    const m = lineUp('batman', 'luigi', 1000);
    use(m, 'special', 14);
    expect(m.projectiles).toHaveLength(1);
    const p = m.projectiles[0];
    p.x = 0;
    p.y = 30; // inside the main platform
    run(m, 1);
    expect(m.projectiles).toHaveLength(0);
  });

  it('is removed once it leaves the blast zone', () => {
    const m = lineUp('goku', 'luigi', 2000, 0);
    use(m, 'special', 14 + 8);
    const p = m.projectiles[0];
    p.x = m.stage.blastZone.right - 5;
    run(m, 2);
    expect(m.projectiles).toHaveLength(0);
  });
});

describe('stages', () => {
  it('defines Skyfall Arena, Corneria and Final Destination', () => {
    expect(STAGE_ORDER).toEqual(['skyfall', 'corneria', 'final']);
    expect(getStage('final').name).toBe('Final Destination');
    expect(getStage('nope').id).toBe('skyfall');
  });

  for (const id of STAGE_ORDER) {
    describe(id, () => {
      const stage = STAGES[id];

      it('has sane geometry: platforms inside the blast zone, camera box valid', () => {
        const bz = stage.blastZone;
        for (const p of stage.platforms) {
          expect(p.x1).toBeLessThan(p.x2);
          expect(p.x1).toBeGreaterThan(bz.left);
          expect(p.x2).toBeLessThan(bz.right);
          expect(p.y).toBeGreaterThan(bz.top);
          expect(p.y + p.height).toBeLessThan(bz.bottom);
        }
        expect(stage.camera.minX).toBeLessThan(stage.camera.maxX);
        expect(stage.camera.minY).toBeLessThan(stage.camera.maxY);
        expect(stage.hazards).toEqual([]);
      });

      it('spawns every player standing on a platform', () => {
        const m = onStage(['luigi', 'sheik', 'batman', 'goku'], id);
        run(m, 60, [emptyInput(), emptyInput(), emptyInput(), emptyInput()]);
        m.fighters.forEach((f, i) => {
          expect(f.grounded, `slot ${i}`).toBe(true);
          expect(f.y).toBe(stage.spawns[i].y);
          expect(f.x).toBeCloseTo(stage.spawns[i].x, 0);
        });
      });

      it('respawn points sit above solid ground, inside the blast zone', () => {
        const { x1, x2 } = solidExtent(stage);
        for (const r of stage.respawns) {
          expect(r.x).toBeGreaterThan(x1);
          expect(r.x).toBeLessThan(x2);
          expect(r.y).toBeLessThan(-300);
          expect(r.y).toBeGreaterThan(stage.blastZone.top);
        }
      });

      it('lands fighters on top of every platform', () => {
        for (const p of stage.platforms) {
          const m = onStage(['luigi', 'luigi'], id);
          const f = m.fighters[0];
          Object.assign(f, { x: (p.x1 + p.x2) / 2, y: p.y - 120, grounded: false, action: 'air', vy: 0 });
          m.fighters[1].x = stage.blastZone.left + 50; // out of the way
          m.fighters[1].y = stage.blastZone.top + 50;
          m.fighters[1].grounded = false;
          m.fighters[1].action = 'respawning';
          m.fighters[1].respawnTimer = 999;
          run(m, 90);
          expect(f.grounded, p.id).toBe(true);
          expect(f.y, p.id).toBe(p.y);
        }
      });

      it('KOs through all four blast zone sides', () => {
        const bz = stage.blastZone;
        for (const pos of [{ x: bz.left - 5, y: -100 }, { x: bz.right + 5, y: -100 }, { x: 0, y: bz.top - 5 }, { x: 0, y: bz.bottom + 5 }]) {
          const m = onStage(['luigi', 'luigi'], id);
          Object.assign(m.fighters[1], { ...pos, grounded: false, action: 'air' });
          const ev = run(m, 1);
          expect(ev.some((e) => e.type === 'ko' && e.id === 1)).toBe(true);
        }
      });
    });
  }

  it('Final Destination is one flat, symmetrical, solid platform', () => {
    const fd = STAGES.final;
    expect(fd.platforms).toHaveLength(1);
    expect(fd.platforms[0].oneWay).toBe(false);
    expect(fd.platforms[0].x1).toBe(-fd.platforms[0].x2);
    expect(fd.blastZone.left).toBe(-fd.blastZone.right);
  });

  it('Corneria\'s stepped deck can be walked end to end in both directions', () => {
    // G&W has high traction (Luigi would slide off the end after letting go — that's his identity).
    const m = onStage(['gnw', 'luigi'], 'corneria');
    const f = m.fighters[0];
    Object.assign(f, { x: -690, y: 40 });
    Object.assign(m.fighters[1], { x: 2000, y: -100, grounded: false, action: 'respawning', respawnTimer: 9999 });
    let lowest = -Infinity;
    for (let i = 0; i < 300 && f.x < 400; i++) {
      run(m, 1, [makeInput({ right: true }), emptyInput()]);
      lowest = Math.max(lowest, f.y);
    }
    run(m, 30);
    expect(f.x).toBeGreaterThan(400);
    expect(f.y).toBe(-40); // walked up both steps onto the rear deck
    expect(lowest).toBeLessThanOrEqual(40); // never dropped below the nose deck
    for (let i = 0; i < 300 && f.x > -660; i++) run(m, 1, [makeInput({ left: true }), emptyInput()]);
    run(m, 30);
    expect(f.x).toBeLessThan(-600);
    expect(f.y).toBe(40); // back down both steps onto the nose
    expect(f.stocks).toBe(3);
  });
});

describe('CPU on every stage', () => {
  for (const id of STAGE_ORDER) {
    it(`${id}: CPU approaches, attacks and stays on stage vs an idle player`, () => {
      for (const cpuFighter of ['spiderman', 'batman', 'naruto', 'goku', 'sheik'] as FighterId[]) {
        const m = onStage(['luigi', cpuFighter], id);
        const cpu = new CpuController(1, 'hard', 7);
        let selfKOs = 0;
        for (let i = 0; i < 60 * 20; i++) {
          for (const e of stepMatch(m, [emptyInput(), cpu.decide(m)])) if (e.type === 'ko' && e.id === 1) selfKOs++;
        }
        expect(m.fighters[1].stats.damageDealt, `${cpuFighter} on ${id}`).toBeGreaterThan(20);
        expect(selfKOs, `${cpuFighter} on ${id}`).toBe(0);
      }
    });

    it(`${id}: every fighter's CPU recovers after being knocked off`, () => {
      const { x2 } = solidExtent(STAGES[id]);
      for (const fighter of FIGHTER_ORDER) {
        const m = onStage(['luigi', fighter], id);
        const f = m.fighters[1];
        Object.assign(f, { x: x2 + 170, y: 30, vx: 250, vy: 0, grounded: false, action: 'air', jumpsUsed: 1 });
        m.fighters[0].x = STAGES[id].spawns[0].x;
        const cpu = new CpuController(1, 'hard', 3);
        let landed = false;
        for (let i = 0; i < 300 && !landed; i++) {
          stepMatch(m, [emptyInput(), cpu.decide(m)]);
          landed = f.grounded;
        }
        expect(landed, `${fighter} on ${id}`).toBe(true);
        expect(f.stocks, `${fighter} on ${id}`).toBe(3);
      }
    });

    it(`${id}: CPU vs CPU matches with the new fighters finish`, () => {
      for (const [a, b] of [['spiderman', 'batman'], ['naruto', 'goku']] as FighterId[][]) {
        const m = onStage([a, b], id, 5);
        const cpus = [new CpuController(0, 'normal', 1), new CpuController(1, 'hard', 2)];
        while (m.phase !== 'ended' && m.frame < DEFAULT_RULES.matchFrames + 10) stepMatch(m, cpus.map((c) => c.decide(m)));
        expect(m.phase).toBe('ended');
        expect(m.projectiles.every((p) => p.life > 0)).toBe(true);
      }
    });
  }
});
