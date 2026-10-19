import { describe, expect, it } from 'vitest';
import { filterFix, type FilterPoint } from './trackFilter';

/** A point `north` metres north of a fixed start, `seconds` after it. */
function at(north: number, seconds: number, accuracy = 8): FilterPoint {
  return { lat: 49.37 + north / 111_195, lon: -123.08, time: seconds * 1000, accuracy };
}

describe('filterFix', () => {
  it('starts a segment with the first accurate reading', () => {
    expect(filterFix(null, at(0, 0))).toEqual({ action: 'add', newSegment: false, distance: 0 });
  });

  it('ignores readings that are too inaccurate to trust', () => {
    expect(filterFix(null, at(0, 0, 65))).toEqual({ action: 'skip', reason: 'inaccurate' });
    expect(filterFix(at(0, 0), at(50, 30, 65))).toEqual({ action: 'skip', reason: 'inaccurate' });
  });

  it('ignores GPS wobble while standing still', () => {
    expect(filterFix(at(0, 0), at(3, 5))).toEqual({ action: 'skip', reason: 'too-close' });
  });

  it('needs more movement when the GPS is less sure', () => {
    // 8 m of movement counts with ±8 m accuracy (threshold 5 m)...
    expect(filterFix(at(0, 0), at(8, 6, 8)).action).toBe('add');
    // ...but not with ±30 m accuracy (threshold 15 m).
    expect(filterFix(at(0, 0), at(8, 6, 30)).action).toBe('skip');
  });

  it('adds the distance walked', () => {
    const decision = filterFix(at(0, 0), at(20, 15));
    expect(decision.action).toBe('add');
    if (decision.action === 'add') expect(decision.distance).toBeCloseTo(20, 1);
  });

  it('does not let a long stop creep the distance upwards', () => {
    let last = at(0, 0);
    let total = 0;
    // 10 minutes at a viewpoint: readings wobble by up to ±4 m around the same spot.
    for (let s = 5; s <= 600; s += 5) {
      const wobble = at(Math.sin(s) * 4, s);
      const decision = filterFix(last, wobble);
      if (decision.action === 'add') {
        total += decision.distance;
        last = wobble;
      }
    }
    expect(total).toBe(0);
  });

  it('skips duplicate or out-of-order readings', () => {
    expect(filterFix(at(0, 10), at(30, 10))).toEqual({ action: 'skip', reason: 'out-of-order' });
  });

  it('starts a new segment after a long gap with a big jump, without counting the jump', () => {
    expect(filterFix(at(0, 0), at(400, 300))).toEqual({ action: 'add', newSegment: true, distance: 0 });
  });

  it('carries on normally after a long rest in the same place', () => {
    const decision = filterFix(at(0, 0), at(20, 300));
    expect(decision).toMatchObject({ action: 'add', newSegment: false });
  });
});
