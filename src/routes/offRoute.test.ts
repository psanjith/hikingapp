import { describe, expect, it } from 'vitest';
import type { LonLat } from '../map/geo';
import { distanceToRoute, OffRouteMonitor } from './offRoute';

/** A point `east` and `north` metres from a fixed spot near Vancouver. */
function at(east: number, north: number): LonLat {
  return [-123.08 + east / (111_195 * Math.cos((49.37 * Math.PI) / 180)), 49.37 + north / 111_195];
}

// A straight route running 1 km north.
const route: LonLat[][] = [[at(0, 0), at(0, 500), at(0, 1000)]];

describe('distanceToRoute', () => {
  it('is the sideways distance when beside the route', () => {
    expect(distanceToRoute(at(80, 300), route)!.meters).toBeCloseTo(80, 0);
  });

  it('measures to the nearest point between route points, not just to the points', () => {
    // 250 m north is halfway between two route points 500 m apart.
    const result = distanceToRoute(at(20, 250), route)!;
    expect(result.meters).toBeCloseTo(20, 0);
    expect(result.nearest[1]).toBeCloseTo(at(0, 250)[1], 6);
  });

  it('measures to the end of the route when past it', () => {
    expect(distanceToRoute(at(0, 1300), route)!.meters).toBeCloseTo(300, 0);
  });

  it('checks every line of a multi-part route', () => {
    const twoParts: LonLat[][] = [...route, [at(500, 0), at(500, 1000)]];
    expect(distanceToRoute(at(450, 500), twoParts)!.meters).toBeCloseTo(50, 0);
  });

  it('returns null for an empty route', () => {
    expect(distanceToRoute(at(0, 0), [])).toBeNull();
  });
});

describe('OffRouteMonitor', () => {
  it('stays quiet until the hiker has been on the route (e.g. at home)', () => {
    const monitor = new OffRouteMonitor();
    for (let t = 0; t < 120_000; t += 5_000) expect(monitor.update(5_000, 10, t)).toBeNull();
  });

  it('alerts after staying off-route for 15 seconds', () => {
    const monitor = new OffRouteMonitor();
    monitor.update(5, 8, 0); // On the route: armed.
    expect(monitor.update(120, 8, 1_000)).toBeNull();
    expect(monitor.update(120, 8, 10_000)).toBeNull();
    expect(monitor.update(120, 8, 16_000)).toBe('went-off');
    expect(monitor.isOff).toBe(true);
    expect(monitor.update(130, 8, 20_000)).toBeNull(); // Alerts once, not every reading.
  });

  it('ignores a single wild reading', () => {
    const monitor = new OffRouteMonitor();
    monitor.update(5, 8, 0);
    monitor.update(200, 8, 1_000); // GPS glitch...
    monitor.update(10, 8, 2_000); // ...back to normal.
    expect(monitor.update(200, 8, 20_000)).toBeNull(); // The 15 s restarts from here.
  });

  it('allows for GPS error before calling someone off-route', () => {
    const monitor = new OffRouteMonitor();
    monitor.update(5, 8, 0);
    // 70 m away but ±30 m accuracy: could really be 40 m, inside the 50 m limit.
    monitor.update(70, 30, 1_000);
    expect(monitor.update(70, 30, 20_000)).toBeNull();
  });

  it('says when the hiker is back on the route, without flickering at the edge', () => {
    const monitor = new OffRouteMonitor();
    monitor.update(5, 5, 0);
    monitor.update(100, 5, 1_000);
    monitor.update(100, 5, 17_000);
    expect(monitor.update(45, 5, 18_000)).toBeNull(); // Closer, but not convincingly back.
    expect(monitor.update(20, 5, 19_000)).toBe('back-on');
  });

  it('ignores readings too vague to judge', () => {
    const monitor = new OffRouteMonitor();
    monitor.update(5, 8, 0);
    monitor.update(500, 80, 1_000);
    expect(monitor.update(500, 80, 30_000)).toBeNull();
  });
});
