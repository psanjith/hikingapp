import { describe, expect, it } from 'vitest';
import { metersPerPixel } from './geo';

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
