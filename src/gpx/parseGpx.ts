import type { LonLat } from '../map/geo';

export interface GpxWaypoint {
  position: LonLat;
  name: string | null;
}

/** What we take from a GPX file: the trail's shape, plus any named points. */
export interface ParsedGpx {
  name: string | null;
  /**
   * Each line is drawn separately. A track segment (<trkseg>) or a route
   * (<rte>) becomes one line, so gaps in the original (e.g. where a recording
   * was paused) aren't joined up with a misleading straight line.
   */
  lines: LonLat[][];
  /** Elevation (m) of each point in `lines`, where the file has it (most do), else null. */
  elevations: (number | null)[][];
  waypoints: GpxWaypoint[];
}

/** A problem with the file itself, with a message that's safe to show users. */
export class GpxError extends Error {}

/**
 * Reads a GPX file (versions 1.0 and 1.1).
 *
 * GPX can describe a trail in two ways, and files in the wild use both:
 * tracks (<trk>/<trkseg>/<trkpt>: a recorded or detailed path) and routes
 * (<rte>/<rtept>: a planned path, often with fewer points). We draw either.
 * Waypoints (<wpt>) are kept as named markers, e.g. "Viewpoint", "Parking".
 *
 * Elements are matched by local name in any namespace, because GPX 1.0 and
 * 1.1 use different namespaces and some exporters leave it out entirely.
 */
export function parseGpx(xml: string): ParsedGpx {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  if (doc.getElementsByTagName('parsererror').length > 0 || root?.localName !== 'gpx') {
    throw new GpxError("This doesn't look like a GPX file, or the file is damaged.");
  }

  const lines: ReadLine[] = [];
  for (const segment of all(root, 'trkseg')) lines.push(readPoints(segment, 'trkpt'));
  for (const route of all(root, 'rte')) lines.push(readPoints(route, 'rtept'));
  const drawable = lines.filter((line) => line.positions.length >= 2);

  const waypoints: GpxWaypoint[] = [];
  for (const wpt of all(root, 'wpt')) {
    const position = readPosition(wpt);
    if (position) waypoints.push({ position, name: childText(wpt, 'name') });
  }

  if (drawable.length === 0 && waypoints.length === 0) {
    throw new GpxError('This GPX file has no trail or points in it.');
  }

  return {
    name: findName(root),
    lines: drawable.map((line) => line.positions),
    elevations: drawable.map((line) => line.elevations),
    waypoints,
  };
}

/** The trail's name: file metadata first, then the first named track or route. */
function findName(root: Element): string | null {
  const metadata = all(root, 'metadata')[0];
  // GPX 1.0 has no <metadata>; its <name> sits directly under <gpx>.
  const candidates = [
    metadata && childText(metadata, 'name'),
    childText(root, 'name'),
    ...all(root, 'trk').map((trk) => childText(trk, 'name')),
    ...all(root, 'rte').map((rte) => childText(rte, 'name')),
  ];
  return candidates.find((name) => name) ?? null;
}

interface ReadLine {
  positions: LonLat[];
  elevations: (number | null)[];
}

function readPoints(parent: Element, tag: string): ReadLine {
  const line: ReadLine = { positions: [], elevations: [] };
  for (const point of all(parent, tag)) {
    const position = readPosition(point);
    if (!position) continue;
    const ele = Number.parseFloat(childText(point, 'ele') ?? '');
    line.positions.push(position);
    line.elevations.push(Number.isFinite(ele) ? ele : null);
  }
  return line;
}

/** Skips points with missing or impossible coordinates rather than failing the whole file. */
function readPosition(point: Element): LonLat | null {
  const lat = Number.parseFloat(point.getAttribute('lat') ?? '');
  const lon = Number.parseFloat(point.getAttribute('lon') ?? '');
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lon, lat];
}

function all(parent: Element, localName: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS('*', localName));
}

/** Text of a direct child element, trimmed; null if missing or blank. */
function childText(parent: Element, localName: string): string | null {
  for (const child of Array.from(parent.children)) {
    if (child.localName === localName) return child.textContent?.trim() || null;
  }
  return null;
}
