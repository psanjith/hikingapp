import { describe, expect, it } from 'vitest';
import type { PathPoint } from './hikingTime';
import { DAYLIGHT_BUFFER_MS, planTurnaround, type TurnaroundInput } from './turnaround';

const MIN = 60_000;
const NOON = Date.UTC(2026, 9, 24, 19); // Any fixed "now".

/** A point `east`/`north` metres from the trailhead, at `ele` metres. */
function at(east: number, north: number, ele: number | null = null): PathPoint {
  return { lon: -123.08 + east / (111_195 * Math.cos((49.37 * Math.PI) / 180)), lat: 49.37 + north / 111_195, ele };
}

/** A walked path from (east0, north0) to (east1, north1), a point every 10 m. */
function line(from: [number, number], to: [number, number], ele: (t: number) => number | null = () => null): PathPoint[] {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const steps = Math.max(1, Math.round(length / 10));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return at(from[0] + t * (to[0] - from[0]), from[1] + t * (to[1] - from[1]), ele(t));
  });
}

function plan(overrides: Partial<TurnaroundInput>) {
  return planTurnaround({ now: NOON, sunset: NOON + 4 * 60 * MIN, hiked: [at(0, 0)], hikedMs: 0, route: null, ...overrides });
}

describe('planTurnaround: out and back', () => {
  it('at the trailhead, gives you roughly half the daylight left to keep going', () => {
    const result = plan({ hiked: [at(0, 0)] });
    const slack = 4 * 60 * MIN - DAYLIGHT_BUFFER_MS; // 3.5 h before you need to be back.
    // Each minute out costs ~1.15 minutes back, so you can go out for slack / 2.15.
    expect((result.turnAroundBy! - NOON) / MIN).toBeCloseTo(slack / 2.15 / MIN, 0);
    expect(result.mode).toBe('out-and-back');
  });

  it("uses the hiker's own pace once there's enough of it", () => {
    // 2 km on the flat in 40 minutes: slower than Tobler's ~24 minutes.
    const result = plan({ hiked: line([0, 0], [0, 2000]), hikedMs: 40 * MIN });
    expect(result.calibrated).toBe(true);
    // The walk back should take about as long as the walk out, plus tiredness.
    expect((result.backAt - NOON) / MIN).toBeCloseTo(40 * 1.15, 0);
  });

  it('knows coming back down a climb is quicker than going up it', () => {
    // 2 km at a 15% grade, 50 minutes up.
    const result = plan({ hiked: line([0, 0], [0, 2000], (t) => t * 300), hikedMs: 50 * MIN });
    expect((result.backAt - NOON) / MIN).toBeLessThan(50);
  });

  it('says to turn around when the daylight is running out', () => {
    const result = plan({ hiked: line([0, 0], [0, 3000]), hikedMs: 60 * MIN, sunset: NOON + 90 * MIN });
    expect(result.turnAroundBy!).toBeLessThan(NOON); // Already past the turnaround time.
    expect(result.backAt).toBeGreaterThan(result.deadline);
  });

  it('flags when it is already after sunset', () => {
    expect(plan({ sunset: NOON - MIN }).afterDark).toBe(true);
  });
});

describe('planTurnaround: on the way back', () => {
  it('notices the hiker has turned around, and only counts the distance still to go', () => {
    // Out 2 km in 40 min, then 1 km back in 20 min.
    const hiked = [...line([0, 0], [0, 2000]), ...line([0, 2000], [0, 1000]).slice(1)];
    const result = plan({ hiked, hikedMs: 60 * MIN });
    expect(result.mode).toBe('returning');
    expect(result.turnAroundBy).toBeNull();
    // About 1 km left at this hiker's pace (~20 min/km on the flat), plus tiredness.
    expect((result.backAt - NOON) / MIN).toBeCloseTo(20 * 1.15, -1);
  });
});

describe('planTurnaround: following a loaded route', () => {
  // A 4 km square loop starting and ending at the trailhead.
  const loop = [
    ...line([0, 0], [0, 1000]),
    ...line([0, 1000], [1000, 1000]).slice(1),
    ...line([1000, 1000], [1000, 0]).slice(1),
    ...line([1000, 0], [0, 0]).slice(1),
  ];

  it('finishes a loop when that works', () => {
    const hiked = [...line([0, 0], [0, 1000]), ...line([0, 1000], [1000, 1000]).slice(1), ...line([1000, 1000], [1000, 500]).slice(1)];
    const result = plan({ hiked, hikedMs: 50 * MIN, route: loop });
    expect(result.mode).toBe('loop');
    expect(result.via).toBe('continue');
  });

  it('says go back the way you came when finishing the loop would end after dark', () => {
    // Only 1 km into the 4 km loop, and the light is going.
    const hiked = line([0, 0], [0, 1000]);
    const result = plan({ hiked, hikedMs: 20 * MIN, route: loop, sunset: NOON + 70 * MIN });
    expect(result.via).toBe('back');
    expect(result.backAt).toBeLessThan(NOON + 70 * MIN);
  });

  it('estimates reaching the end of a one-way route (e.g. a summit) and getting back', () => {
    const summitTrail = line([0, 0], [0, 3000], (t) => t * 450);
    const result = plan({ hiked: summitTrail.slice(0, 101), hikedMs: 25 * MIN, route: summitTrail });
    expect(result.mode).toBe('destination');
    expect(result.destinationAt!).toBeGreaterThan(NOON);
    expect(result.finishAt!).toBeGreaterThan(result.destinationAt!);
    expect(result.turnAroundBy).not.toBeNull();
  });

  it('ignores a route the hiker is not on', () => {
    const elsewhere = line([5000, 5000], [5000, 8000]);
    expect(plan({ hiked: line([0, 0], [0, 500]), hikedMs: 10 * MIN, route: elsewhere }).mode).toBe('out-and-back');
  });
});
