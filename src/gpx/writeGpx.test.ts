// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseGpx } from './parseGpx';
import { writeGpx, type GpxTrack } from './writeGpx';

const hike: GpxTrack = {
  name: 'Quarry Rock & back <loop>',
  time: Date.UTC(2026, 9, 18, 17, 0, 0),
  segments: [
    [
      { lat: 49.3296, lon: -122.9489, time: Date.UTC(2026, 9, 18, 17, 0, 0), altitude: 12.34 },
      { lat: 49.3302, lon: -122.947, time: Date.UTC(2026, 9, 18, 17, 1, 0), altitude: null },
    ],
    [],
    [
      { lat: 49.3326, lon: -122.941, time: Date.UTC(2026, 9, 18, 17, 20, 0), altitude: 40 },
      { lat: 49.3337, lon: -122.9362, time: Date.UTC(2026, 9, 18, 17, 25, 0), altitude: 55 },
    ],
  ],
};

describe('writeGpx', () => {
  it('round-trips through our own GPX reader, keeping segments separate', () => {
    const parsed = parseGpx(writeGpx(hike));
    expect(parsed.name).toBe('Quarry Rock & back <loop>');
    expect(parsed.lines).toEqual([
      [
        [-122.9489, 49.3296],
        [-122.947, 49.3302],
      ],
      [
        [-122.941, 49.3326],
        [-122.9362, 49.3337],
      ],
    ]);
  });

  it('includes a timestamp on every point, and elevation when known', () => {
    const xml = writeGpx(hike);
    expect(xml).toContain('<trkpt lat="49.3296000" lon="-122.9489000"><ele>12.3</ele><time>2026-10-18T17:00:00.000Z</time></trkpt>');
    expect(xml).toContain('<trkpt lat="49.3302000" lon="-122.9470000"><time>2026-10-18T17:01:00.000Z</time></trkpt>');
  });

  it('escapes characters that would break the XML', () => {
    expect(writeGpx(hike)).toContain('<name>Quarry Rock &amp; back &lt;loop&gt;</name>');
  });
});
