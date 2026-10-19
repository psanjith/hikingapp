import { describe, expect, it } from 'vitest';
import { distanceMeters } from '../map/geo';
import type { LocationFix } from './types';
import { PositionSmoother } from './smoothing';

const ORIGIN = { lat: 49.37, lon: -123.08 };

/** A reading `north` and `east` metres from the origin. */
function reading(north: number, east: number, seconds: number, accuracy: number): LocationFix {
  return {
    lat: ORIGIN.lat + north / 111_195,
    lon: ORIGIN.lon + east / (111_195 * Math.cos((ORIGIN.lat * Math.PI) / 180)),
    accuracy,
    altitude: null,
    heading: null,
    speed: null,
    timestamp: seconds * 1000,
  };
}

const metresFrom = (fix: LocationFix, north: number, east: number) =>
  distanceMeters([fix.lon, fix.lat], [reading(north, east, 0, 1).lon, reading(north, east, 0, 1).lat]);

/** Repeatable pseudo-random noise, so the test gives the same result every run. */
function noise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1; // −1…1
}

describe('PositionSmoother', () => {
  it('uses the first reading as it is', () => {
    const smoother = new PositionSmoother();
    expect(metresFrom(smoother.update(reading(10, 0, 0, 5)), 10, 0)).toBeLessThan(0.01);
  });

  it('barely moves for one wild, vague reading', () => {
    const smoother = new PositionSmoother();
    for (let s = 0; s < 10; s++) smoother.update(reading(0, 0, s, 5));
    const after = smoother.update(reading(100, 0, 10, 65)); // Indoor-style jump: 100 m, ±65 m.
    expect(metresFrom(after, 0, 0)).toBeLessThan(5);
  });

  it('jumps straight to a sharp reading after vague ones (e.g. stepping outside)', () => {
    const smoother = new PositionSmoother();
    for (let s = 0; s < 10; s++) smoother.update(reading(0, 0, s, 65));
    // One good reading covers 95% of the 80 m; each one after roughly halves what's left.
    expect(metresFrom(smoother.update(reading(80, 0, 10, 5)), 80, 0)).toBeLessThan(5);
    expect(metresFrom(smoother.update(reading(80, 0, 11, 5)), 80, 0)).toBeLessThan(2);
    let settled = smoother.update(reading(80, 0, 12, 5));
    for (let s = 13; s <= 15; s++) settled = smoother.update(reading(80, 0, s, 5));
    expect(metresFrom(settled, 80, 0)).toBeLessThan(0.5);
  });

  it('holds much steadier than the raw readings while standing still indoors', () => {
    const smoother = new PositionSmoother();
    let rawSpread = 0;
    let smoothSpread = 0;
    for (let s = 0; s < 60; s++) {
      const raw = reading(noise(s) * 40, noise(s + 100) * 40, s, 50);
      const smoothed = smoother.update(raw);
      if (s >= 10) {
        rawSpread = Math.max(rawSpread, metresFrom(raw, 0, 0));
        smoothSpread = Math.max(smoothSpread, metresFrom(smoothed, 0, 0));
      }
    }
    expect(smoothSpread).toBeLessThan(rawSpread / 3);
  });

  it('keeps up with someone walking, with good GPS', () => {
    const smoother = new PositionSmoother();
    let last = smoother.update(reading(0, 0, 0, 5));
    for (let s = 1; s <= 60; s++) last = smoother.update(reading(s * 1.4, 0, s, 5)); // 1.4 m/s walk.
    expect(metresFrom(last, 60 * 1.4, 0)).toBeLessThan(3);
  });

  it('follows fast, sharp movement straight away (e.g. cycling)', () => {
    const smoother = new PositionSmoother();
    let last = smoother.update(reading(0, 0, 0, 5));
    for (let s = 1; s <= 10; s++) last = smoother.update(reading(s * 25, 0, s, 5)); // 25 m/s.
    expect(metresFrom(last, 250, 0)).toBeLessThan(1);
  });

  it('keeps the GPS accuracy figure, so the app never looks more certain than it is', () => {
    const smoother = new PositionSmoother();
    smoother.update(reading(0, 0, 0, 5));
    expect(smoother.update(reading(0, 0, 1, 40)).accuracy).toBe(40);
  });

  it('starts fresh after a long gap', () => {
    const smoother = new PositionSmoother();
    smoother.update(reading(0, 0, 0, 5));
    expect(metresFrom(smoother.update(reading(2000, 0, 600, 30)), 2000, 0)).toBeLessThan(0.01);
  });
});
