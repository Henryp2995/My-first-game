import { describe, expect, it } from 'vitest';
import { FIGHTERS, DEFAULT_RULES } from '../src';
import { emptyInput, makeInput, run, setupMatch, tap } from './helpers';

describe('movement', () => {
  it('fighters start grounded on the main platform', () => {
    const m = setupMatch();
    for (const f of m.fighters) {
      expect(f.grounded).toBe(true);
      expect(f.y).toBe(0);
    }
  });

  it('accelerates toward run speed and decelerates when released', () => {
    const m = setupMatch(['sheik', 'sheik']);
    const f = m.fighters[0];
    run(m, 1, [makeInput({ right: true }), emptyInput()]);
    expect(f.vx).toBeGreaterThan(0);
    expect(f.vx).toBeLessThan(FIGHTERS.sheik.stats.runSpeed);
    run(m, 30, [makeInput({ right: true }), emptyInput()]);
    expect(f.vx).toBeCloseTo(FIGHTERS.sheik.stats.runSpeed);
    expect(f.facing).toBe(1);
    expect(f.action).toBe('run');
    run(m, 60, [emptyInput(), emptyInput()]);
    expect(f.vx).toBe(0);
    expect(f.action).toBe('idle');
  });

  it('Luigi slides further than Sheik when stopping (lower traction)', () => {
    const slide = (id: 'luigi' | 'sheik') => {
      const m = setupMatch([id, id]);
      const f = m.fighters[0];
      f.x = -400;
      run(m, 60, [makeInput({ right: true }), emptyInput()]);
      const x0 = f.x;
      run(m, 60, [emptyInput(), emptyInput()]);
      return f.x - x0;
    };
    expect(slide('luigi')).toBeGreaterThan(slide('sheik') * 2);
  });

  it('applies gravity and lands back on the stage', () => {
    const m = setupMatch();
    const f = m.fighters[0];
    f.x = 0;
    f.y = -300;
    f.grounded = false;
    f.action = 'air';
    const events = run(m, 120, [emptyInput(), emptyInput()]);
    expect(f.grounded).toBe(true);
    expect(f.y).toBe(0);
    expect(events.some((e) => e.type === 'land' && e.id === 0)).toBe(true);
  });

  it('can drop through one-way platforms but not the solid main platform', () => {
    const m = setupMatch();
    const f = m.fighters[0];
    f.x = 240;
    f.y = -175;
    run(m, 2);
    expect(f.grounded).toBe(true);
    expect(f.y).toBe(-175);
    tap(m, 0, { down: true });
    run(m, 60);
    expect(f.y).toBe(0);
    expect(f.grounded).toBe(true);
    tap(m, 0, { down: true });
    run(m, 30);
    expect(f.y).toBe(0);
  });

  it('jumps up through a one-way platform and lands on top', () => {
    const m = setupMatch(['luigi', 'luigi']);
    const f = m.fighters[0];
    f.x = 240;
    run(m, 80, (i) => [makeInput({ jump: i < 30 }), emptyInput()]);
    expect(f.grounded).toBe(true);
    expect(f.y).toBe(-175);
  });
});

describe('jumping', () => {
  it('allows exactly one ground jump plus one double jump', () => {
    const m = setupMatch();
    const f = m.fighters[0];
    const ev1 = tap(m, 0, { jump: true });
    expect(ev1.filter((e) => e.type === 'jump')).toHaveLength(1);
    expect(f.vy).toBeLessThan(0);
    run(m, 5);
    const ev2 = tap(m, 0, { jump: true });
    expect(ev2.some((e) => e.type === 'jump' && e.double)).toBe(true);
    expect(f.jumpsUsed).toBe(2);
    run(m, 5);
    const ev3 = tap(m, 0, { jump: true });
    expect(ev3.some((e) => e.type === 'jump')).toBe(false);
  });

  it('refreshes jumps on landing', () => {
    const m = setupMatch();
    const f = m.fighters[0];
    tap(m, 0, { jump: true });
    tap(m, 0, { jump: true });
    run(m, 120);
    expect(f.grounded).toBe(true);
    expect(f.jumpsUsed).toBe(0);
  });

  it('holding jump goes higher than tapping (short hop)', () => {
    const peak = (hold: number) => {
      const m = setupMatch();
      const f = m.fighters[0];
      let minY = 0;
      run(m, 60, (i) => {
        minY = Math.min(minY, f.y);
        return [makeInput({ jump: i < hold }), emptyInput()];
      });
      return -minY;
    };
    expect(peak(30)).toBeGreaterThan(peak(1) * 1.5);
  });

  it('Luigi jumps highest; jump ordering matches the roster table', () => {
    const height = (id: 'gnw' | 'luigi' | 'sheik') => {
      const s = FIGHTERS[id].stats;
      return (s.jumpVelocity * s.jumpVelocity) / (2 * s.gravity);
    };
    expect(height('luigi')).toBeGreaterThan(height('sheik'));
    expect(height('sheik')).toBeGreaterThan(height('gnw'));
  });

  it('supports coyote time after walking off a ledge', () => {
    const m = setupMatch(['gnw', 'gnw']);
    const f = m.fighters[0];
    f.x = 330;
    f.y = -175; // right one-way platform (ends at x=340)
    run(m, 1);
    let walkedOff = -1;
    for (let i = 0; i < 60 && walkedOff < 0; i++) {
      run(m, 1, [makeInput({ right: true }), emptyInput()]);
      if (!f.grounded) walkedOff = i;
    }
    expect(walkedOff).toBeGreaterThanOrEqual(0);
    run(m, 2, [makeInput({ right: true }), emptyInput()]);
    const ev = tap(m, 0, { jump: true, right: true });
    const jump = ev.find((e) => e.type === 'jump');
    expect(jump).toBeDefined();
    expect(jump && jump.type === 'jump' && jump.double).toBe(false);
  });

  it('buffers a jump pressed shortly before landing', () => {
    const m = setupMatch();
    const f = m.fighters[0];
    f.y = -40;
    f.grounded = false;
    f.action = 'air';
    f.jumpsUsed = 2;
    f.vy = 300;
    const ev = [...tap(m, 0, { jump: true }), ...run(m, DEFAULT_RULES.jumpBufferFrames - 2)];
    expect(ev.some((e) => e.type === 'land')).toBe(true);
    expect(ev.some((e) => e.type === 'jump' && !e.double)).toBe(true);
  });
});
