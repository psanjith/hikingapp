/** App-wide constants, kept in one place so they're easy to find and change. */

/**
 * Where offline map regions and their catalog.json are hosted (Cloudflare R2).
 * Override locally with VITE_MAPS_BASE_URL in .env.local, e.g. to test with
 * regions built into public/dev-maps by scripts/build-maps.mjs.
 */
export const MAPS_BASE_URL: string =
  import.meta.env.VITE_MAPS_BASE_URL ?? 'https://maps.example.invalid/';

/** Map data has full detail up to this zoom; MapLibre enlarges it beyond. */
export const MAP_DATA_MAXZOOM = 14;

/** Where the map opens before we know the user's location: the North Shore. */
export const DEFAULT_VIEW = { center: [-123.08, 49.37] as [number, number], zoom: 10 };

/** Zoom level used when jumping to the user's location; trail-level detail. */
export const LOCATE_ZOOM = 15;

/** After this long without a new GPS reading, the blue dot turns grey. */
export const STALE_FIX_MS = 30_000;

/** GPS accuracy thresholds (metres) for the plain-language signal indicator. */
export const GPS_GOOD_ACCURACY_M = 20;
export const GPS_FAIR_ACCURACY_M = 50;
