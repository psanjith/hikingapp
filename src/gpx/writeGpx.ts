/** One point of a track to export. */
export interface GpxTrackPoint {
  lat: number;
  lon: number;
  /** Unix epoch milliseconds. */
  time: number;
  altitude: number | null;
}

export interface GpxTrack {
  name: string;
  /** Unix epoch milliseconds: when the hike started. */
  time: number;
  /** One array per segment, in order; pauses and GPS gaps separate segments. */
  segments: GpxTrackPoint[][];
}

/**
 * Writes a recorded hike as a GPX 1.1 file: one <trk>, one <trkseg> per
 * segment, and a time (plus elevation, when the phone reported it) on every
 * point. That's what Strava, Gaia, AllTrails and CalTopo expect, so exported
 * hikes open anywhere, and they're a readable backup that doesn't need this app.
 */
export function writeGpx(track: GpxTrack): string {
  const segments = track.segments
    .filter((segment) => segment.length > 0)
    .map((segment) => `    <trkseg>\n${segment.map(trackPoint).join('\n')}\n    </trkseg>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Hiking App (psanjith.github.io/hikingapp)" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(track.name)}</name>
    <time>${iso(track.time)}</time>
  </metadata>
  <trk>
    <name>${escapeXml(track.name)}</name>
${segments}
  </trk>
</gpx>
`;
}

function trackPoint(p: GpxTrackPoint): string {
  // 7 decimal places is ~1 cm: more than enough, and keeps files small.
  const ele = p.altitude === null ? '' : `<ele>${p.altitude.toFixed(1)}</ele>`;
  return `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">${ele}<time>${iso(p.time)}</time></trkpt>`;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => `&${{ '<': 'lt', '>': 'gt', '&': 'amp', '"': 'quot', "'": 'apos' }[c]};`);
}
