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
