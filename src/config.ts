/** App-wide constants, kept in one place so they're easy to find and change. */

/**
 * Where offline map regions and their catalog.json are hosted (Cloudflare R2,
 * bucket "hikingapp-maps"). The r2.dev address is rate-limited by Cloudflare;
 * move to a custom domain before usage grows beyond the club.
 * Override locally with VITE_MAPS_BASE_URL in .env.local, e.g. to test with
 * regions built into public/dev-maps by scripts/build-maps.mjs.
 */
export const MAPS_BASE_URL: string =
  import.meta.env.VITE_MAPS_BASE_URL ?? 'https://pub-dc567a3941614600bd02295e927d8c6e.r2.dev/';

/** Map data has full detail up to this zoom; MapLibre enlarges it beyond. */
export const MAP_DATA_MAXZOOM = 14;

/** Where the map opens before we know the user's location: the North Shore. */
export const DEFAULT_VIEW = { center: [-123.08, 49.37] as [number, number], zoom: 10 };

/** Zoom level used when jumping to the user's location; trail-level detail. */
export const LOCATE_ZOOM = 15;

/** After this long without a new GPS reading, quietly ask for a fresh one. */
export const GPS_RECHECK_AFTER_MS = 20_000;
/** If the recheck doesn't help either, the blue dot turns grey ("GPS lost"). */
export const STALE_FIX_MS = 45_000;

/** GPS accuracy thresholds (metres) for the plain-language signal indicator. */
export const GPS_GOOD_ACCURACY_M = 20;
export const GPS_FAIR_ACCURACY_M = 50;

/** Recording: GPS readings less accurate than this are ignored (metres). */
export const RECORD_MAX_ACCURACY_M = 40;
/** Recording: the smallest movement that counts, however good the GPS (metres). */
export const RECORD_MIN_MOVE_M = 5;
/** Recording: the most movement we'll ever demand before counting a step (metres). */
export const RECORD_MAX_MOVE_M = 15;
/**
 * Recording: a jump this far after this long with no readings (GPS lost, or the
 * phone stopped GPS while locked) starts a new segment instead of drawing a
 * straight line across terrain the hiker may not have crossed.
 */
export const RECORD_GAP_MS = 60_000;
export const RECORD_GAP_M = 100;

/** If the app is hidden this long while recording, explain the possible gap in the track. */
export const BACKGROUND_WARNING_MS = 30_000;
