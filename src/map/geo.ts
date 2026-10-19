const EARTH_CIRCUMFERENCE_M = 40_075_016.686;

/** MapLibre renders the world as 512px tiles at zoom 0 (not the classic 256px). */
const TILE_SIZE_PX = 512;

/**
 * How many real-world metres one screen pixel covers at a given latitude and
 * zoom level in a Web Mercator map. The map stretches towards the poles, so a
 * pixel covers less ground at Vancouver (49°N) than at the equator.
 */
export function metersPerPixel(lat: number, zoom: number): number {
  const latRadians = (lat * Math.PI) / 180;
  return (EARTH_CIRCUMFERENCE_M * Math.cos(latRadians)) / (TILE_SIZE_PX * 2 ** zoom);
}

/** [west, south, east, north] in degrees. */
export type LonLatBounds = [number, number, number, number];

/**
 * The geographic area covered by map tile z/x/y (standard "slippy map" tile
 * numbering: x counts east from 180°W, y counts south from ~85°N).
 */
export function tileBounds(z: number, x: number, y: number): LonLatBounds {
  const n = 2 ** z;
  const lon = (tx: number) => (tx / n) * 360 - 180;
  const lat = (ty: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n))) * 180) / Math.PI;
  return [lon(x), lat(y + 1), lon(x + 1), lat(y)];
}

/** Whether two bounding boxes overlap at all. */
export function boundsIntersect(a: LonLatBounds, b: LonLatBounds): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

/** A position as [longitude, latitude] in degrees (GeoJSON order). */
export type LonLat = [number, number];

/** Mean Earth radius used by the haversine formula. */
const EARTH_RADIUS_M = 6_371_008.8;

/**
 * Straight-line ("as the crow flies") distance between two points on the
 * Earth's surface, using the haversine formula. Accurate to well under 1% at
 * hiking distances, which is far better than phone GPS itself.
 */
export function distanceMeters([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Total length of a line: the sum of the distances between consecutive points. */
export function lineLengthMeters(line: LonLat[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) total += distanceMeters(line[i - 1], line[i]);
  return total;
}

/** The smallest box containing every point, or null if there are none. */
export function boundsOfPoints(points: Iterable<LonLat>): LonLatBounds | null {
  let bounds: LonLatBounds | null = null;
  for (const [lon, lat] of points) {
    if (!bounds) bounds = [lon, lat, lon, lat];
    else bounds = [Math.min(bounds[0], lon), Math.min(bounds[1], lat), Math.max(bounds[2], lon), Math.max(bounds[3], lat)];
  }
  return bounds;
}

/** Size of a box in square degrees: only meaningful for comparing boxes ("which is smaller"). */
export function boundsArea([west, south, east, north]: LonLatBounds): number {
  return (east - west) * (north - south);
}

/** Whether `outer` completely contains `inner`. */
export function boundsContain(outer: LonLatBounds, inner: LonLatBounds): boolean {
  return outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];
}
