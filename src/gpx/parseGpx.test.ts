// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { GpxError, parseGpx } from './parseGpx';

const gpx11 = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">${body}</gpx>`;

describe('parseGpx', () => {
  it('reads a GPX 1.1 track with its name', () => {
    const result = parseGpx(
      gpx11(`
      <metadata><name>Grouse Grind</name></metadata>
      <trk><name>Track 1</name><trkseg>
        <trkpt lat="49.3712" lon="-123.0987"><ele>290</ele></trkpt>
        <trkpt lat="49.3745" lon="-123.0951"><ele>420</ele></trkpt>
        <trkpt lat="49.3800" lon="-123.0830"><ele>1100</ele></trkpt>
      </trkseg></trk>`),
    );
    expect(result.name).toBe('Grouse Grind');
    expect(result.elevations).toEqual([[290, 420, 1100]]); // Used to estimate hiking time.
    expect(result.lines).toEqual([
      [
        [-123.0987, 49.3712],
        [-123.0951, 49.3745],
        [-123.083, 49.38],
      ],
    ]);
  });

  it('keeps separate track segments as separate lines', () => {
    const result = parseGpx(
      gpx11(`<trk><trkseg>
        <trkpt lat="49.1" lon="-123.1"/><trkpt lat="49.2" lon="-123.2"/>
      </trkseg><trkseg>
        <trkpt lat="49.5" lon="-123.5"/><trkpt lat="49.6" lon="-123.6"/>
      </trkseg></trk>`),
    );
    expect(result.lines).toHaveLength(2);
  });

  it('reads routes and waypoints, falling back to the track or route name', () => {
    const result = parseGpx(
      gpx11(`
      <wpt lat="49.38" lon="-123.08"><name>Summit</name></wpt>
      <wpt lat="49.37" lon="-123.09"/>
      <rte><name>Planned route</name>
        <rtept lat="49.37" lon="-123.09"/><rtept lat="49.38" lon="-123.08"/>
      </rte>`),
    );
    expect(result.name).toBe('Planned route');
    expect(result.lines).toHaveLength(1);
    expect(result.waypoints).toEqual([
      { position: [-123.08, 49.38], name: 'Summit' },
      { position: [-123.09, 49.37], name: null },
    ]);
  });

  it('reads GPX 1.0 files, which use a different namespace and no <metadata>', () => {
    const result = parseGpx(`<?xml version="1.0"?>
      <gpx version="1.0" xmlns="http://www.topografix.com/GPX/1/0">
        <name>Old exporter</name>
        <trk><trkseg><trkpt lat="49.1" lon="-123.1"/><trkpt lat="49.2" lon="-123.2"/></trkseg></trk>
      </gpx>`);
    expect(result.name).toBe('Old exporter');
    expect(result.lines).toHaveLength(1);
  });

  it('works without any namespace at all', () => {
    const result = parseGpx(
      '<gpx><trk><trkseg><trkpt lat="49.1" lon="-123.1"/><trkpt lat="49.2" lon="-123.2"/></trkseg></trk></gpx>',
    );
    expect(result.lines).toHaveLength(1);
    expect(result.name).toBeNull();
  });

  it('skips points with bad coordinates instead of rejecting the file', () => {
    const result = parseGpx(
      gpx11(`<trk><trkseg>
        <trkpt lat="49.1" lon="-123.1"/>
        <trkpt lat="abc" lon="-123.15"/>
        <trkpt lat="95" lon="-123.15"/>
        <trkpt lat="49.2" lon="-123.2"/>
      </trkseg></trk>`),
    );
    expect(result.lines[0]).toHaveLength(2);
    expect(result.elevations[0]).toEqual([null, null]); // No <ele> in this file.
  });

  it('rejects files that are not GPX, with a message a user can understand', () => {
    expect(() => parseGpx('not xml at all <')).toThrow(GpxError);
    expect(() => parseGpx('<kml><Document/></kml>')).toThrow("doesn't look like a GPX file");
  });

  it('rejects a GPX file with nothing to draw', () => {
    expect(() => parseGpx(gpx11('<trk><trkseg><trkpt lat="49.1" lon="-123.1"/></trkseg></trk>'))).toThrow(
      'no trail or points',
    );
  });
});
