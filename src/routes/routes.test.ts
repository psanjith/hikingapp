import { describe, expect, it } from 'vitest';
import type { ParsedGpx } from '../gpx/parseGpx';
import { routeFromGpx } from './routes';

const trail: ParsedGpx = {
  name: null,
  lines: [
    [
      [-123.08, 49.37],
      [-123.08, 49.371],
    ],
    [
      [-123.07, 49.38],
      [-123.07, 49.381],
    ],
  ],
  waypoints: [{ position: [-123.1, 49.39], name: 'Viewpoint' }],
};

describe('routeFromGpx', () => {
  it('adds up the length of every line, but not the gap between them', () => {
    const route = routeFromGpx(trail, 'trail.gpx', 'id', 0);
    expect(route.lengthMeters).toBeCloseTo(222.4, 0);
  });

  it('includes waypoints in the bounds, so zooming to the route shows them', () => {
    expect(routeFromGpx(trail, 'trail.gpx', 'id', 0).bounds).toEqual([-123.1, 49.37, -123.07, 49.39]);
  });

  it('uses the file name when the GPX has no name', () => {
    expect(routeFromGpx(trail, 'Quarry Rock.GPX', 'id', 0).name).toBe('Quarry Rock');
    expect(routeFromGpx(trail, '.gpx', 'id', 0).name).toBe('Imported route');
    expect(routeFromGpx({ ...trail, name: 'Grouse Grind' }, 'x.gpx', 'id', 0).name).toBe('Grouse Grind');
  });
});
