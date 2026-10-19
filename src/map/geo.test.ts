import { describe, expect, it } from 'vitest';
import { boundsIntersect, metersPerPixel, tileBounds } from './geo';

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
