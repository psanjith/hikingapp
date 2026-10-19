/**
 * One GPS reading, normalised so the rest of the app never touches
 * browser-specific types (GeolocationPosition). A native implementation
 * produces exactly the same shape.
 */
export interface LocationFix {
  lat: number;
  lon: number;
  /** Horizontal accuracy radius in metres (how far off the reading might be). */
  accuracy: number;
  /** Metres above sea level, if the device reports it. */
  altitude: number | null;
  /** Direction of travel in degrees clockwise from north, if moving. */
  heading: number | null;
  /** Metres per second, if moving. */
  speed: number | null;
  /** When the reading was taken, in Unix epoch milliseconds. */
  timestamp: number;
}

export type LocationErrorKind = 'unsupported' | 'permission-denied' | 'unavailable' | 'timeout';

export interface LocationListener {
  onFix(fix: LocationFix): void;
  onError?(error: LocationErrorKind): void;
}

/**
 * Anything that can produce a stream of GPS fixes.
 *
 * The map's blue dot (and later the hike recorder) only depend on this
 * interface. Today it's backed by the browser's Geolocation API; when the app
 * is wrapped with Capacitor, a native background-GPS plugin can implement the
 * same interface without changes anywhere else.
 */
export interface LocationSource {
  /** Start receiving fixes. Returns a function that unsubscribes. */
  subscribe(listener: LocationListener): () => void;
  /** The most recent fix, if any, so late subscribers can draw immediately. */
  readonly lastFix: LocationFix | null;
  /** Ask for a fresh reading now, e.g. if updates seem to have stalled. */
  restart(): void;
}
