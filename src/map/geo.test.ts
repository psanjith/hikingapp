import { describe, expect, it } from 'vitest';
import {
  boundsContain,
  boundsIntersect,
  boundsOfPoints,
  distanceMeters,
  lineLengthMeters,
  metersPerPixel,
  tileBounds,
  type LonLat,
} from './geo';

describe('tileBounds', () => {
  it('covers the whole Web Mercator world at zoom 0', () => {
    const [w, s, e, n] = tileBounds(0, 0, 0);
    expect(w).toBe(-180);
    expect(e).toBe(180);
    expect(n).toBeCloseTo(85.0511, 3);
    expect(s).toBeCloseTo(-85.0511, 3);
  });

  it('contains the Grouse Grind trailhead in its zoom 14 tile', () => {
    const [w, s, e, n] = tileBounds(14, 2589, 5600);
    expect(-123.099).toBeGreaterThan(w);
    expect(-123.099).toBeLessThan(e);
    expect(49.372).toBeGreaterThan(s);
    expect(49.372).toBeLessThan(n);
  });
});

describe('boundsIntersect', () => {
  const lowerMainland: [number, number, number, number] = [-123.55, 48.95, -121.3, 50.45];

  it('detects overlap', () => {
    expect(boundsIntersect(lowerMainland, [-122, 49, -121, 50])).toBe(true);
  });

  it('rejects boxes that only sit side by side', () => {
    expect(boundsIntersect(lowerMainland, [-121.3, 49, -120, 50])).toBe(false);
  });

  it('rejects distant boxes', () => {
    expect(boundsIntersect(lowerMainland, [-80, 43, -79, 44])).toBe(false); // Toronto
  });
});

describe('metersPerPixel', () => {
  it('matches the known Web Mercator scale at the equator', () => {
    expect(metersPerPixel(0, 0)).toBeCloseTo(78_271.517, 2);
  });

  it('halves with every zoom level', () => {
    expect(metersPerPixel(49, 15)).toBeCloseTo(metersPerPixel(49, 14) / 2, 6);
  });

  it('shrinks with latitude (cos(60°) = 0.5)', () => {
    expect(metersPerPixel(60, 10)).toBeCloseTo(metersPerPixel(0, 10) / 2, 6);
  });
});

describe('distanceMeters', () => {
  it('is zero for the same point', () => {
    expect(distanceMeters([-123.08, 49.37], [-123.08, 49.37])).toBe(0);
  });

  it('matches a known distance: one degree of latitude is about 111.2 km', () => {
    expect(distanceMeters([-123, 49], [-123, 50]) / 1000).toBeCloseTo(111.19, 1);
  });

  it('accounts for longitude lines getting closer together away from the equator', () => {
    // One degree of longitude at 49°N is cos(49°) × 111.2 km ≈ 72.9 km.
    expect(distanceMeters([-123, 49], [-122, 49]) / 1000).toBeCloseTo(72.95, 0);
  });

  it('measures a short trail-scale hop to within a metre', () => {
    // 0.001° of latitude ≈ 111.2 m anywhere on Earth.
    expect(distanceMeters([-123.08, 49.37], [-123.08, 49.371])).toBeCloseTo(111.2, 0);
  });
});

describe('lineLengthMeters', () => {
  it('adds up each leg of the line', () => {
    const line: LonLat[] = [
      [-123.08, 49.37],
      [-123.08, 49.371],
      [-123.08, 49.372],
    ];
    expect(lineLengthMeters(line)).toBeCloseTo(222.4, 0);
  });

  it('is zero for an empty or single-point line', () => {
    expect(lineLengthMeters([])).toBe(0);
    expect(lineLengthMeters([[-123, 49]])).toBe(0);
  });
});

describe('boundsOfPoints / boundsContain', () => {
  it('finds the box around a set of points', () => {
    expect(
      boundsOfPoints([
        [-123.1, 49.4],
        [-123.0, 49.3],
        [-123.05, 49.5],
      ]),
    ).toEqual([-123.1, 49.3, -123.0, 49.5]);
    expect(boundsOfPoints([])).toBeNull();
  });

  it('checks whether a trail fits inside a map region', () => {
    const lowerMainland: [number, number, number, number] = [-123.55, 48.95, -121.3, 50.45];
    expect(boundsContain(lowerMainland, [-123.1, 49.3, -123.0, 49.5])).toBe(true);
    // Crosses the region edge (into Vancouver Island).
    expect(boundsContain(lowerMainland, [-123.7, 49.3, -123.0, 49.5])).toBe(false);
  });
});
