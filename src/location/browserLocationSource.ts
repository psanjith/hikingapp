import type { LocationErrorKind, LocationFix, LocationListener, LocationSource } from './types';

const WATCH_OPTIONS: PositionOptions = {
  // Use the real GPS chip rather than Wi-Fi/cell-tower estimates. Costs more
  // battery but is the only thing that works on a trail with no signal.
  enableHighAccuracy: true,
  // Never accept a cached reading; we want where the user is *now*.
  maximumAge: 0,
  // How long to wait for each reading before reporting a timeout. Under heavy
  // tree cover the first fix can take a while, so this is generous.
  timeout: 30_000,
};

/** A one-off request used to jolt a quiet watch: same accuracy, fresh reading only. */
const RECHECK_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 };

/**
 * LocationSource backed by navigator.geolocation.
 *
 * Multiple parts of the app can subscribe, but only one underlying
 * watchPosition() runs: it starts with the first subscriber and stops when
 * the last one leaves, so we never run duplicate GPS sessions.
 */
export function createBrowserLocationSource(
  geolocation: Geolocation | undefined = navigator.geolocation,
): LocationSource {
  const listeners = new Set<LocationListener>();
  let watchId: number | null = null;
  let lastFix: LocationFix | null = null;

  function handlePosition(position: GeolocationPosition): void {
    // A recheck and the watch can both answer; never step back to an older reading.
    if (lastFix && position.timestamp < lastFix.timestamp) return;
    lastFix = toLocationFix(position);
    for (const listener of listeners) listener.onFix(lastFix);
  }

  function handleError(error: GeolocationPositionError): void {
    const kind = toErrorKind(error);
    for (const listener of listeners) listener.onError?.(kind);
  }

  function startWatching(): void {
    if (!geolocation || watchId !== null) return;
    watchId = geolocation.watchPosition(handlePosition, handleError, WATCH_OPTIONS);
  }

  function stopWatching(): void {
    if (!geolocation || watchId === null) return;
    geolocation.clearWatch(watchId);
    watchId = null;
  }

  // iOS sometimes lets a watch go quiet: after the app has been in the
  // background, after an interruption, and sometimes for no visible reason.
  // Two things together recover it reliably:
  //   - a one-off getCurrentPosition(), which iOS answers with a fresh reading;
  //   - a new watch, started *before* the old one is cleared, so there's never
  //     a moment with no request (which can make the phone power GPS down).
  function restart(): void {
    if (!geolocation || watchId === null) return;
    const previous = watchId;
    watchId = geolocation.watchPosition(handlePosition, handleError, WATCH_OPTIONS);
    geolocation.clearWatch(previous);
    // Errors are ignored here: the watch reports anything that matters (e.g. permission).
    geolocation.getCurrentPosition(handlePosition, () => {}, RECHECK_OPTIONS);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') restart();
  });

  return {
    get lastFix() {
      return lastFix;
    },

    restart,

    subscribe(listener) {
      if (!geolocation) {
        queueMicrotask(() => listener.onError?.('unsupported'));
        return () => {};
      }

      listeners.add(listener);
      if (lastFix) listener.onFix(lastFix);
      startWatching();

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stopWatching();
      };
    },
  };
}

function toLocationFix(position: GeolocationPosition): LocationFix {
  const { coords } = position;
  return {
    lat: coords.latitude,
    lon: coords.longitude,
    accuracy: coords.accuracy,
    altitude: coords.altitude,
    heading: Number.isFinite(coords.heading) ? coords.heading : null,
    speed: coords.speed,
    timestamp: position.timestamp,
  };
}

function toErrorKind(error: GeolocationPositionError): LocationErrorKind {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'permission-denied';
    case error.TIMEOUT:
      return 'timeout';
    default:
      return 'unavailable';
  }
}
