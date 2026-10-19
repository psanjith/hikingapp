import { describe, expect, it } from 'vitest';
import type { LonLat } from './geo';
import { fitTrack } from './fitTrack';

const box = { width: 100, height: 100, padding: 10 };

describe('fitTrack', () => {
  it('puts north at the top and east on the right', () => {
    const { segments } = fitTrack([[[-123.1, 49.3], [-123.0, 49.4]]], box); // South-west → north-east.
    const [[start, end]] = segments;
    expect(end[0]).toBeGreaterThan(start[0]);
    expect(end[1]).toBeLessThan(start[1]);
  });

  it('keeps the shape inside the padding and centred', () => {
    const route: LonLat[] = [
      [-123.2, 49.3],
      [-123.0, 49.3],
      [-123.0, 49.31],
    ]; // Much wider than tall.
    const { segments, width, height } = fitTrack([route], box);
    expect(width).toBeCloseTo(80, 5);
    expect(height).toBeLessThan(width);
    for (const [x, y] of segments[0]) {
      expect(x).toBeGreaterThanOrEqual(10 - 1e-9);
      expect(x).toBeLessThanOrEqual(90 + 1e-9);
      expect(y).toBeGreaterThan(40); // Vertically centred.
      expect(y).toBeLessThan(60);
    }
  });

  it('keeps real-world proportions (a degree of longitude is shorter than one of latitude here)', () => {
    // 0.01° east and 0.01° north at 49°: the east side is about 0.65× the north side.
    const { width, height } = fitTrack([[[-123, 49], [-122.99, 49], [-122.99, 49.01]]], box);
    expect(width / height).toBeCloseTo(Math.cos((49.005 * Math.PI) / 180), 2);
  });

  it('keeps segments separate and copes with an empty track', () => {
    expect(fitTrack([[[0, 0], [1, 1]], [[2, 2], [3, 3]]], box).segments).toHaveLength(2);
    expect(fitTrack([], box).segments).toEqual([]);
  });
});
