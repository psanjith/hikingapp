import { describe, expect, it } from 'vitest';
import { blendHeading, headingFromOrientation } from './compass';

describe('headingFromOrientation', () => {
  it('uses the iPhone compass heading directly', () => {
    expect(headingFromOrientation({ alpha: 10, absolute: false, webkitCompassHeading: 90 }, 0)).toBe(90);
  });

  it('converts Android absolute alpha (anticlockwise) into a heading (clockwise)', () => {
    expect(headingFromOrientation({ alpha: 90, absolute: true }, 0)).toBe(270); // Facing west.
    expect(headingFromOrientation({ alpha: 0, absolute: true }, 0)).toBe(0); // Facing north.
  });

  it('allows for the screen being turned sideways', () => {
    expect(headingFromOrientation({ alpha: null, absolute: false, webkitCompassHeading: 350 }, 90)).toBe(80);
  });

  it('ignores orientation that is not tied to north', () => {
    expect(headingFromOrientation({ alpha: 45, absolute: false }, 0)).toBeNull();
    expect(headingFromOrientation({ alpha: null, absolute: false, webkitCompassHeading: -1 }, 0)).toBeNull();
  });
});

describe('blendHeading', () => {
  it('starts at the first reading', () => {
    expect(blendHeading(null, 123)).toBe(123);
  });

  it('moves part of the way towards a new reading', () => {
    expect(blendHeading(0, 100, 0.5)).toBe(50);
  });

  it('turns the short way round across north', () => {
    expect(blendHeading(350, 10, 0.5)).toBe(0); // Not 180.
    expect(blendHeading(10, 350, 0.5)).toBe(0);
  });
});
