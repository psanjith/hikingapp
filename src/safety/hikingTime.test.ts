import { describe, expect, it } from 'vitest';
import { elevationChange, toblerSpeedKmh, toblerTimeMs, type PathPoint } from './hikingTime';

/** A straight path north, one point every 5 m, with elevation from `ele(metres along)`. */
function path(lengthM: number, ele: (along: number) => number | null): PathPoint[] {
  return Array.from({ length: Math.round(lengthM / 5) + 1 }, (_, i) => ({
    lon: -123.08,
    lat: 49.37 + (i * 5) / 111_195,
    ele: ele(i * 5),
  }));
}

const minutes = (ms: number) => ms / 60_000;

describe('toblerSpeedKmh', () => {
  it('is about 5 km/h on the flat, fastest on a gentle descent, slow on steep climbs', () => {
    expect(toblerSpeedKmh(0)).toBeCloseTo(5.04, 2);
    expect(toblerSpeedKmh(-0.05)).toBe(6);
    expect(toblerSpeedKmh(0.2)).toBeCloseTo(2.5, 1);
  });
});

describe('toblerTimeMs', () => {
  it('takes about 12 minutes for a flat kilometre', () => {
    expect(minutes(toblerTimeMs(path(1000, () => 100)))).toBeCloseTo(11.9, 1);
  });

  it('is slower uphill than downhill over the same ground', () => {
    const up = path(1000, (d) => d * 0.15); // 15% grade: Tobler says ~3.0 km/h up, ~4.2 km/h down.
    const down = [...up].reverse();
    expect(minutes(toblerTimeMs(up))).toBeCloseTo(20.1, 0);
    expect(minutes(toblerTimeMs(down))).toBeCloseTo(14.2, 0);
  });

  it('treats a path with no elevation as flat', () => {
    expect(toblerTimeMs(path(1000, () => null))).toBeCloseTo(toblerTimeMs(path(1000, () => 50)), -3);
  });

  it('fills in missing elevations from their neighbours', () => {
    const gappy = path(1000, (d) => (d % 100 === 0 ? d * 0.15 : null));
    expect(toblerTimeMs(gappy)).toBeCloseTo(toblerTimeMs(path(1000, (d) => d * 0.15)), -4);
  });

  it('is not fooled by GPS altitude wobble on flat ground', () => {
    // ±8 m of altitude noise from reading to reading, on flat ground.
    const noisy = path(1000, (d) => 100 + 8 * Math.sin(d * 1.7));
    expect(minutes(toblerTimeMs(noisy))).toBeLessThan(minutes(toblerTimeMs(path(1000, () => 100))) * 1.1);
  });

  it('returns 0 for a path too short to walk', () => {
    expect(toblerTimeMs([])).toBe(0);
    expect(toblerTimeMs(path(0, () => 0))).toBe(0);
  });
});

describe('elevationChange', () => {
  it('adds up a steady climb', () => {
    const result = elevationChange(path(2000, (d) => 100 + d * 0.15))!; // 300 m up.
    expect(result.climb).toBeGreaterThan(285);
    expect(result.climb).toBeLessThan(305);
    expect(result.descent).toBe(0);
  });

  it('counts the way up and the way down separately', () => {
    const upAndDown = path(2000, (d) => 100 + (d <= 1000 ? d : 2000 - d) * 0.2); // Up 200 m, down 200 m.
    const result = elevationChange(upAndDown)!;
    expect(result.climb).toBeCloseTo(200, -1);
    expect(result.descent).toBeCloseTo(200, -1);
  });

  it('does not invent climb from GPS altitude wobble on flat ground', () => {
    // 3 km of flat ground with ±8 m of reading-to-reading noise.
    const noisy = path(3000, (d) => 100 + 8 * Math.sin(d * 1.7) + 5 * Math.cos(d * 0.37));
    expect(elevationChange(noisy)!.climb).toBeLessThan(20);
  });

  it('is unknown (null) when the phone gave no altitude', () => {
    expect(elevationChange(path(1000, () => null))).toBeNull();
  });
});
