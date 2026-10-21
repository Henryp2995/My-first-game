import { describe, expect, it } from 'vitest';
import {
  CpuController, DEFAULT_RULES, FIGHTERS, FIGHTER_ORDER, hitboxWindow, hitstopFrames, hitstunFrames,
  knockbackSpeed, moveTotalFrames, stepMatch,
  type FighterId, type GameEvent, type MatchState, type MoveSlot,
} from '../src';
import { emptyInput, makeInput, run, setupMatch, tap } from './helpers';

/** Put attacker (P1) right next to victim (P2), facing them. */
function faceOff(m: MatchState, gap = 40, attackerX = 0, facing: 1 | -1 = 1) {
  const [a, v] = m.fighters;
  a.x = attackerX;
  v.x = attackerX + gap * facing;
  a.facing = facing;
  v.facing = (-facing) as 1 | -1;
}

/** P1 uses `slot` once; returns the first hit event (or undefined) within `frames`. */
function attackAndGetHit(m: MatchState, slot: MoveSlot, frames = 40): Extract<GameEvent, { type: 'hit' }> | undefined {
  const button = slot === 'aerial' ? 'light' : slot;
  for (let i = 0; i < frames; i++) {
    const ev = stepMatch(m, [makeInput({ [button]: i === 0 }), emptyInput()]);
    const hit = ev.find((e) => e.type === 'hit');
    if (hit && hit.type === 'hit') return hit;
  }
  return undefined;
}

/** Hits from the ledge at `pct`; returns whether the victim was KO'd through a side/top blast zone. */
function launchKOs(att: FighterId, vic: FighterId, slot: MoveSlot, pct: number, x = 380): boolean {
  const m = setupMatch([att, vic]);
  faceOff(m, 40, x);
  m.fighters[1].damage = pct;
  for (let t = 0; t < 400; t++) {
    const ko = stepMatch(m, [makeInput({ [slot]: t === 0 }), emptyInput()]).find((e) => e.type === 'ko');
    if (ko && ko.type === 'ko') return ko.y < m.stage.blastZone.bottom - 1;
  }
  return false;
}

describe('knockback scaling', () => {
  it('increases smoothly with damage — no sudden jumps at any percentage', () => {
    let prev = knockbackSpeed(0, 14, 470, 10.5, 100);
    let prevStep = 0;
    for (let p = 1; p <= 250; p++) {
      const k = knockbackSpeed(p, 14, 470, 10.5, 100);
      const step = k - prev;
      expect(step).toBeGreaterThan(0);
      if (p > 1) expect(Math.abs(step - prevStep)).toBeLessThan(1e-6); // linear in percent
      prev = k;
      prevStep = step;
    }
  });

  it('heavier fighters receive less knockback (G&W > Sheik > Luigi)', () => {
    const distance = (vic: FighterId) => {
      const m = setupMatch(['luigi', vic]);
      faceOff(m);
      m.fighters[1].damage = 80;
      attackAndGetHit(m, 'heavy');
      run(m, 30);
      return Math.hypot(m.fighters[1].x - 40, m.fighters[1].y);
    };
    expect(distance('gnw')).toBeGreaterThan(distance('sheik'));
    expect(distance('sheik')).toBeGreaterThan(distance('luigi'));
  });

  it('follows the damage bands: small early, strong mid, KO-capable late', () => {
    // 0–30%: a heavy only pushes the victim a short distance and never kills.
    const m = setupMatch(['gnw', 'luigi']);
    faceOff(m);
    m.fighters[1].damage = 20;
    attackAndGetHit(m, 'heavy');
    run(m, 60);
    expect(Math.abs(m.fighters[1].x - 40)).toBeLessThan(350);
    expect(m.fighters[1].stocks).toBe(3);

    // 70–120%: the strongest heavies become dangerous near the edge.
    expect(launchKOs('gnw', 'luigi', 'heavy', 100)).toBe(true);
    expect(launchKOs('luigi', 'luigi', 'heavy', 120)).toBe(true);
    // ...but not at low percent.
    expect(launchKOs('gnw', 'luigi', 'heavy', 40)).toBe(false);
    // 120%+: even the weakest heavy (Sheik) kills from the ledge by ~150%.
    expect(launchKOs('sheik', 'luigi', 'heavy', 150)).toBe(true);
    // Light attacks never kill on their own, even at very high damage.
    for (const f of FIGHTER_ORDER) expect(launchKOs(f, 'luigi', 'light', 200, 0)).toBe(false);
  });

  it('exposes knockback tuning in the rules config', () => {
    const base = knockbackSpeed(100, 10, 400, 8, 100);
    const scaled = knockbackSpeed(100, 10, 400, 8, 100, { ...DEFAULT_RULES.combat.knockback, scale: 1.5 });
    expect(scaled).toBeCloseTo(base * 1.5);
  });
});

describe('launch direction', () => {
  it('launches forward in the attacker facing direction, mirrored when facing left', () => {
    for (const facing of [1, -1] as const) {
      const m = setupMatch(['gnw', 'luigi']);
      faceOff(m, 40, 0, facing);
      const hit = attackAndGetHit(m, 'heavy');
      expect(hit).toBeDefined();
      expect(Math.sign(hit!.launchX)).toBe(facing);
      expect(hit!.launchY).toBeLessThan(0); // upward
    }
  });

  it('Luigi uppercut launches nearly straight up', () => {
    const m = setupMatch(['luigi', 'sheik']);
    faceOff(m, 30);
    const hit = attackAndGetHit(m, 'heavy');
    expect(hit).toBeDefined();
    expect(-hit!.launchY).toBeGreaterThan(Math.abs(hit!.launchX) * 5);
  });

  it('downward aerials spike airborne opponents and pop grounded ones up', () => {
    // Airborne victim below Luigi's down kick → launched downward.
    const m = setupMatch(['luigi', 'gnw']);
    const [a, v] = m.fighters;
    a.x = 0; a.y = -300; a.grounded = false; a.action = 'air';
    v.x = 10; v.y = -230; v.grounded = false; v.action = 'air';
    const hit = attackAndGetHit(m, 'aerial', 15);
    expect(hit).toBeDefined();
    expect(hit!.launchY).toBeGreaterThan(0);

    // Grounded victim: the same spike pops them upward instead of into the floor.
    const g = setupMatch(['luigi', 'gnw']);
    const [ga, gv] = g.fighters;
    ga.x = 0; ga.y = -75; ga.grounded = false; ga.action = 'air'; ga.vy = 0;
    gv.x = 10;
    const ghit = attackAndGetHit(g, 'aerial', 15);
    expect(ghit).toBeDefined();
    expect(ghit!.launchY).toBeLessThan(0);
  });

  it('auto-direction moves (Sheik spin kick) launch away from the attacker on both sides', () => {
    for (const side of [1, -1] as const) {
      const m = setupMatch(['sheik', 'luigi']);
      faceOff(m, 45 * side);
      m.fighters[0].facing = 1;
      const hit = attackAndGetHit(m, 'heavy');
      expect(hit).toBeDefined();
      expect(Math.sign(hit!.launchX)).toBe(side);
    }
  });

  it('knockback momentum decays gradually while gravity keeps acting', () => {
    const m = setupMatch(['gnw', 'luigi']);
    faceOff(m);
    m.fighters[1].damage = 90;
    attackAndGetHit(m, 'heavy');
    const v = m.fighters[1];
    while (v.hitstop > 0) run(m, 1); // momentum is frozen during hitstop
    const speeds: number[] = [];
    const vys: number[] = [];
    for (let i = 0; i < 20; i++) {
      run(m, 1);
      speeds.push(Math.hypot(v.kbx, v.kby));
      vys.push(v.vy);
    }
    for (let i = 1; i < speeds.length; i++) {
      expect(speeds[i]).toBeLessThan(speeds[i - 1]);
      expect(speeds[i - 1] - speeds[i]).toBeLessThan(40); // no sudden stop
      expect(vys[i]).toBeGreaterThanOrEqual(vys[i - 1]); // gravity pulls down
    }
  });
});

describe('hitstun', () => {
  it('scales with knockback strength', () => {
    expect(hitstunFrames(300, DEFAULT_RULES)).toBeLessThan(hitstunFrames(1500, DEFAULT_RULES));
    const weak = setupMatch(['gnw', 'luigi']);
    faceOff(weak);
    const strong = setupMatch(['gnw', 'luigi']);
    faceOff(strong);
    strong.fighters[1].damage = 100;
    expect(attackAndGetHit(weak, 'light')!.hitstun).toBeLessThan(attackAndGetHit(strong, 'heavy')!.hitstun);
  });

  it('blocks attacking during hitstun, keeps momentum, then returns control', () => {
    const m = setupMatch(['gnw', 'luigi']);
    faceOff(m);
    faceOff(m, 40, -250); // mid-stage, so the victim doesn't fly to the ledge and grab it
    m.fighters[1].damage = 60;
    const hit = attackAndGetHit(m, 'heavy')!;
    const v = m.fighters[1];
    expect(v.action).toBe('hitstun');
    const x0 = v.x;
    // Mash attack during hitstun: nothing comes out.
    let attacked = false;
    for (let i = 0; i < hit.hitstun - 2; i++) {
      for (const e of stepMatch(m, [emptyInput(), makeInput({ heavy: i % 2 === 0 })])) {
        if (e.type === 'attack' && e.id === 1) attacked = true;
      }
    }
    expect(attacked).toBe(false);
    expect(Math.abs(v.x - x0)).toBeGreaterThan(20); // still flying
    run(m, 20);
    expect(v.action).not.toBe('hitstun');
    const ev = tap(m, 1, { heavy: true });
    expect(ev.some((e) => e.type === 'attack' && e.id === 1)).toBe(true);
  });

  it('landing during a long tumble cuts the remaining hitstun short', () => {
    const m = setupMatch(['gnw', 'luigi']);
    const v = m.fighters[1];
    v.x = 0; v.y = -20; v.grounded = false; v.action = 'hitstun'; v.hitstun = 60; v.vy = 300;
    const ev = run(m, 10);
    expect(ev.some((e) => e.type === 'land' && e.id === 1)).toBe(true);
    run(m, DEFAULT_RULES.combat.hitstunLandingCap + 1);
    expect(v.action).not.toBe('hitstun');
  });

  it('consecutive hits shrink hitstun so jab strings cannot lock a player forever', () => {
    expect(hitstunFrames(300, DEFAULT_RULES, 1, 5)).toBeLessThan(hitstunFrames(300, DEFAULT_RULES, 1, 0));
    for (const f of FIGHTER_ORDER) {
      const m = setupMatch([f, 'luigi'], { stocks: 99 });
      faceOff(m, 40, -30);
      const [a, v] = m.fighters;
      // A perfect-timing human: walk in and mash light every other frame. Victim does nothing.
      let free = 0;
      let lock = 0;
      let worst = 0;
      for (let i = 0; i < 900; i++) {
        const dx = v.x - a.x;
        stepMatch(m, [makeInput({ light: i % 2 === 0 && Math.abs(dx) < 70, right: dx > 30, left: dx < -30 }), emptyInput()]);
        free = v.action === 'hitstun' || v.hitstop > 0 ? 0 : free + 1;
        lock = free >= 5 || v.action === 'dead' ? 0 : lock + 1;
        worst = Math.max(worst, lock);
      }
      // The victim always gets 5+ free frames (enough to jump or dodge) within under a second.
      expect(worst, f).toBeLessThan(50);
    }
  });
});

describe('hitstop', () => {
  it('is short for lights, longer for heavies and big specials', () => {
    for (const f of FIGHTER_ORDER) {
      const light = FIGHTERS[f].moves.light.hitboxes;
      for (const hb of light) {
        expect(hitstopFrames(hb.damage, DEFAULT_RULES)).toBeGreaterThanOrEqual(2);
        expect(hitstopFrames(hb.damage, DEFAULT_RULES)).toBeLessThanOrEqual(3);
      }
      const heavy = FIGHTERS[f].moves.heavy.hitboxes[0].damage;
      expect(hitstopFrames(heavy, DEFAULT_RULES)).toBeGreaterThanOrEqual(5);
      expect(hitstopFrames(heavy, DEFAULT_RULES)).toBeLessThanOrEqual(7);
    }
    // Judge 9 (32%) and a misfired rocket (25%) hit the 6–9 frame range.
    expect(hitstopFrames(32, DEFAULT_RULES)).toBeLessThanOrEqual(9);
    expect(hitstopFrames(25, DEFAULT_RULES)).toBeGreaterThanOrEqual(6);
  });

  it('pauses only the two fighters involved and delays (not breaks) the attack timer', () => {
    const m = setupMatch(['gnw', 'luigi', 'sheik']);
    faceOff(m);
    const bystander = m.fighters[2];
    bystander.x = 300;
    const move = FIGHTERS.gnw.moves.heavy;
    let frames = 0;
    let stop = 0;
    let bystanderMovedDuringStop = false;
    for (let i = 0; i < 100; i++) {
      const bx = bystander.x;
      const ev = stepMatch(m, [makeInput({ heavy: i === 0 }), emptyInput(), makeInput({ right: true })]);
      const hit = ev.find((e) => e.type === 'hit');
      if (hit && hit.type === 'hit') stop = hit.hitstop;
      if (m.fighters[0].hitstop > 0 && bystander.x !== bx) bystanderMovedDuringStop = true;
      frames++;
      if (m.fighters[0].action !== 'attack') break;
    }
    expect(stop).toBeGreaterThan(0);
    expect(bystanderMovedDuringStop).toBe(true);
    // Move length = press frame + its frame data + the hitstop pause.
    expect(frames).toBe(1 + moveTotalFrames(move) + stop);
  });
});

describe('movement physics', () => {
  it('air control steers toward air speed; Sheik steers fastest, Luigi slowest', () => {
    const steer = (f: FighterId) => {
      const m = setupMatch([f, f]);
      const p = m.fighters[0];
      p.y = -400; p.grounded = false; p.action = 'air'; p.x = 0;
      run(m, 6, [makeInput({ right: true }), emptyInput()]);
      return p.vx / FIGHTERS[f].stats.airSpeed;
    };
    expect(steer('sheik')).toBeGreaterThan(steer('gnw'));
    expect(steer('gnw')).toBeGreaterThan(steer('luigi'));
    expect(steer('sheik')).toBeGreaterThan(0.6);
  });

  it('holding down fast falls once past the peak, not while still rising fast', () => {
    const m = setupMatch(['gnw', 'gnw']);
    const f = m.fighters[0];
    f.x = 0; // clear of the floating platforms
    run(m, 4, [makeInput({ down: true, jump: true }), emptyInput()]);
    expect(f.grounded).toBe(false);
    expect(f.fastFalling).toBe(false);
    for (let i = 0; i < 60 && !f.fastFalling; i++) run(m, 1, [makeInput({ down: true, jump: true }), emptyInput()]);
    expect(f.fastFalling).toBe(true);
    expect(f.vy).toBe(FIGHTERS.gnw.stats.fastFallSpeed);
  });

  it('G&W falls floatier (slower) than Sheik', () => {
    const fallTime = (fighter: FighterId) => {
      const m = setupMatch([fighter, fighter]);
      const f = m.fighters[0];
      f.x = 0; f.y = -400; f.grounded = false; f.action = 'air';
      let t = 0;
      while (!f.grounded && t < 600) { run(m, 1); t++; }
      return t;
    };
    expect(fallTime('gnw')).toBeGreaterThan(fallTime('sheik'));
  });

  it('allows one air dodge per airtime, refreshed on landing', () => {
    const m = setupMatch(['luigi', 'luigi'], { dodge: { cooldownFrames: 1 } });
    const f = m.fighters[0];
    f.x = 0; f.y = -900; f.grounded = false; f.action = 'air';
    let dodges = 0;
    for (let i = 0; i < 400 && !f.grounded; i++) {
      for (const e of stepMatch(m, [makeInput({ dodge: i % 2 === 0 }), emptyInput()])) if (e.type === 'dodge') dodges++;
    }
    expect(f.grounded).toBe(true);
    expect(dodges).toBe(1);
    run(m, 30);
    tap(m, 0, { jump: true });
    expect(tap(m, 0, { dodge: true }).some((e) => e.type === 'dodge')).toBe(true);
  });

  it('touching the side of a platform does not refresh jumps', () => {
    const m = setupMatch(['luigi', 'luigi']);
    const f = m.fighters[0];
    // Below the lip, beside the main platform's left wall, moving away from it.
    f.x = -455; f.y = 60; f.grounded = false; f.action = 'air'; f.jumpsUsed = 2; f.vx = 50;
    // (Holding down so it doesn't grab the ledge, which would legitimately refresh jumps.)
    run(m, 5, [makeInput({ right: true, down: true }), emptyInput()]);
    expect(f.grounded).toBe(false);
    expect(f.jumpsUsed).toBe(2);
  });
});

describe('hit detection', () => {
  it('every hitbox is only active inside its move\'s active window', () => {
    for (const f of FIGHTER_ORDER) {
      for (const slot of ['light', 'heavy', 'special', 'aerial'] as MoveSlot[]) {
        const move = FIGHTERS[f].moves[slot];
        for (const hb of move.hitboxes) {
          const [s, e] = hitboxWindow(move, hb);
          expect(s, `${f} ${slot}`).toBeGreaterThanOrEqual(move.startup);
          expect(e, `${f} ${slot}`).toBeLessThanOrEqual(move.startup + move.active);
        }
      }
    }
  });

  it('a single-hit move damages a target only once even though it stays overlapped', () => {
    const m = setupMatch(['gnw', 'luigi']);
    faceOff(m);
    const v = m.fighters[1];
    const ev = [...tap(m, 0, { heavy: true })];
    for (let i = 0; i < 40; i++) {
      v.x = 40; v.y = 0; // keep the victim pinned inside the hitbox
      ev.push(...run(m, 1));
    }
    expect(ev.filter((e) => e.type === 'hit')).toHaveLength(1);
    expect(v.damage).toBe(14);
  });

  it('trades: two attacks landing on the same frame both connect', () => {
    const m = setupMatch(['gnw', 'gnw']);
    faceOff(m);
    run(m, 1, [makeInput({ light: true }), makeInput({ light: true })]);
    run(m, 20);
    expect(m.fighters[0].damage).toBe(5);
    expect(m.fighters[1].damage).toBe(5);
  });

  it('does not hit once recovery frames have started', () => {
    const m = setupMatch(['gnw', 'luigi']);
    const [a, v] = m.fighters;
    a.facing = 1;
    v.x = 600; // out of range during the active frames
    const move = FIGHTERS.gnw.moves.heavy;
    tap(m, 0, { heavy: true });
    run(m, move.startup + move.active - 2);
    v.x = a.x + 45; // step into range as recovery begins
    const ev = run(m, move.recovery);
    expect(ev.some((e) => e.type === 'hit')).toBe(false);
  });

  it('does not hit invulnerable opponents (respawn invincibility)', () => {
    const m = setupMatch(['gnw', 'luigi']);
    faceOff(m);
    m.fighters[1].invuln = 60;
    const ev = [...tap(m, 0, { heavy: true }), ...run(m, 30)];
    expect(ev.some((e) => e.type === 'hit')).toBe(false);
  });

  it('aerial hitboxes follow a moving fighter (Key Drop hits a target below)', () => {
    const m = setupMatch(['gnw', 'luigi']);
    const [a, v] = m.fighters;
    a.x = 0; a.y = -260; a.grounded = false; a.action = 'air';
    v.x = 5; // standing on the stage far below the start point
    const hit = attackAndGetHit(m, 'aerial', 40);
    expect(hit).toBeDefined();
    expect(a.y).toBeGreaterThan(-120); // G&W traveled down to reach it
  });
});

describe('stocks and blast zones', () => {
  it('KOs through every side of the blast zone', () => {
    const bz = setupMatch().stage.blastZone;
    const spots = [
      { x: bz.left - 5, y: -100 }, { x: bz.right + 5, y: -100 },
      { x: 0, y: bz.top - 5 }, { x: 0, y: bz.bottom + 5 },
    ];
    for (const s of spots) {
      const m = setupMatch();
      Object.assign(m.fighters[1], { ...s, grounded: false, action: 'air' });
      const ev = run(m, 1);
      expect(ev.some((e) => e.type === 'ko' && e.id === 1)).toBe(true);
      expect(m.fighters[1].stocks).toBe(2);
    }
  });

  it('respawns above the stage with brief invulnerability after leaving the platform', () => {
    const m = setupMatch();
    const f = m.fighters[1];
    Object.assign(f, { x: 2000, grounded: false, action: 'air' });
    run(m, DEFAULT_RULES.respawnDelayFrames + 2);
    expect(f.action).toBe('respawning');
    expect(Math.abs(f.x)).toBeLessThan(300);
    expect(f.y).toBeLessThan(-300);
    run(m, 1, [emptyInput(), makeInput({ left: true })]);
    expect(f.invuln).toBeGreaterThan(0);
    expect(f.invuln).toBeLessThanOrEqual(DEFAULT_RULES.respawnInvulnFrames);
  });
});

describe('CPU recovery decisions', () => {
  function offstage(fighter: FighterId) {
    const m = setupMatch(['luigi', fighter]);
    const f = m.fighters[1];
    Object.assign(f, { x: 560, y: 120, vx: 0, vy: 200, grounded: false, action: 'air', jumpsUsed: 2 });
    m.fighters[0].x = -300;
    return m;
  }

  it('Sheik CPU with no jumps left uses Vanish upward to recover', () => {
    const m = offstage('sheik');
    const cpu = new CpuController(1, 'hard');
    const ev: GameEvent[] = [];
    for (let i = 0; i < 60; i++) ev.push(...stepMatch(m, [emptyInput(), cpu.decide(m)]));
    expect(ev.some((e) => e.type === 'attack' && e.id === 1 && e.slot === 'special')).toBe(true);
    expect(m.fighters[1].stocks).toBe(3);
  });

  it('Sheik CPU holds its aim through Vanish startup, so the teleport actually goes up', () => {
    const m = offstage('sheik');
    const f = m.fighters[1];
    const cpu = new CpuController(1, 'hard');
    let fromY: number | null = null;
    let afterY: number | null = null;
    for (let i = 0; i < 60 && afterY === null; i++) {
      const ev = stepMatch(m, [emptyInput(), cpu.decide(m)]);
      const vanish = ev.find((e) => e.type === 'vanish');
      if (vanish && vanish.type === 'vanish') {
        fromY = vanish.fromY;
        afterY = f.y;
      }
    }
    expect(fromY).not.toBeNull();
    expect(afterY! - fromY!).toBeLessThan(-150);
  });

  it('Luigi CPU with no jumps left uses the rising uppercut to recover', () => {
    const m = offstage('luigi');
    const cpu = new CpuController(1, 'hard');
    const ev: GameEvent[] = [];
    for (let i = 0; i < 60; i++) ev.push(...stepMatch(m, [emptyInput(), cpu.decide(m)]));
    expect(ev.some((e) => e.type === 'attack' && e.id === 1 && e.slot === 'heavy')).toBe(true);
  });

  it('CPU never presses dodge again once its air dodge is spent', () => {
    const m = offstage('gnw');
    m.fighters[1].airDodgesUsed = 1;
    const cpu = new CpuController(1, 'expert');
    for (let i = 0; i < 40 && !m.fighters[1].grounded; i++) {
      const input = cpu.decide(m);
      if (!m.fighters[1].grounded) expect(input.dodge).toBe(false);
      stepMatch(m, [emptyInput(), input]);
    }
  });

  it('CPU steers toward the stage while in hitstun', () => {
    const m = setupMatch(['luigi', 'sheik']);
    const f = m.fighters[1];
    Object.assign(f, { x: 600, y: -200, grounded: false, action: 'hitstun', hitstun: 30 });
    const cpu = new CpuController(1, 'normal');
    const input = cpu.decide(m);
    expect(input.left).toBe(true);
    expect(input.light || input.heavy || input.special).toBe(false);
  });
});
