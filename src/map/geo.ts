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
