/** App-wide constants, kept in one place so they're easy to find and change. */

/**
 * Online vector map style (OpenStreetMap data, free, no API key).
 * Temporary for Stage 1: Stage 2 switches to a downloaded PMTiles region
 * stored on the device so the map works with no signal at all.
 */
export const ONLINE_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/** Where the map opens before we know the user's location: the North Shore. */
export const DEFAULT_VIEW = { center: [-123.08, 49.37] as [number, number], zoom: 10 };

/** Zoom level used when jumping to the user's location; trail-level detail. */
export const LOCATE_ZOOM = 15;

/** After this long without a new GPS reading, the blue dot turns grey. */
export const STALE_FIX_MS = 30_000;

/** GPS accuracy thresholds (metres) for the plain-language signal indicator. */
export const GPS_GOOD_ACCURACY_M = 20;
export const GPS_FAIR_ACCURACY_M = 50;
