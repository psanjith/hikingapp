import { distanceMeters } from '../map/geo';
import type { LocationFix, LocationListener, LocationSource } from './types';

/**
 * How fast we assume someone could move (m/s). It sets how quickly the
 * smoother "lets go" of the old position: a brisk hike or a jog downhill is
 * well under this, so it never holds a moving hiker back for long.
 */
const ASSUMED_SPEED_MPS = 3;
/** After this long with no readings, start again from the next one. */
const RESET_AFTER_MS = 5 * 60 * 1000;
/**
 * A reading this sharp (±m) that lands far outside what the filter expected
 * is real movement (cycling, a fast descent, GPS back after a tunnel), not
 * noise, so the estimate jumps to it instead of lagging behind.
 */
const SHARP_ACCURACY_M = 20;
/** "Far outside" = more than this many standard deviations of combined uncertainty. */
const SURPRISE_SIGMAS = 3;

/**
 * Smooths GPS positions with a simple Kalman filter.
 *
 * Every reading comes with an accuracy (how far off it might be). Instead of
 * jumping to each new reading, the filter keeps a best estimate plus how
 * unsure it is of that estimate, and blends each reading in according to
 * which is more trustworthy:
 *
 *   - a vague ±65 m reading barely moves the estimate,
 *   - a sharp ±5 m reading moves it almost all the way,
 *   - as time passes without readings, the estimate gets less certain
 *     (the hiker may have walked on), so the next reading counts for more.
 *
 * Result: far less jumping around under trees or indoors, with only a metre
 * or two of lag while walking with good GPS. A sharp reading that's far from
 * the estimate is taken as real movement and followed immediately.
 */
export class PositionSmoother {
  private lat = 0;
  private lon = 0;
  /** Uncertainty of the current estimate, as a variance in m². */
  private variance = -1;
  private time = 0;

  update(fix: LocationFix): LocationFix {
    const measurementVariance = Math.max(1, fix.accuracy) ** 2;
    const elapsedMs = fix.timestamp - this.time;

    if (this.variance >= 0) {
      // Predict: the hiker may have moved since the last reading.
      this.variance += (Math.max(0, elapsedMs) / 1000) * ASSUMED_SPEED_MPS ** 2;
    }
    if (this.variance < 0 || elapsedMs > RESET_AFTER_MS || this.isSurprising(fix, measurementVariance)) {
      // First reading, a long gap, or clearly real movement: start from this reading.
      this.lat = fix.lat;
      this.lon = fix.lon;
      this.variance = measurementVariance;
    } else {
      // Update: move towards the reading by the "Kalman gain", 0 (ignore it) to 1 (trust it fully).
      const gain = this.variance / (this.variance + measurementVariance);
      this.lat += gain * (fix.lat - this.lat);
      this.lon += gain * (fix.lon - this.lon);
      this.variance *= 1 - gain;
    }
    this.time = Math.max(this.time, fix.timestamp);

    // Position is smoothed, but accuracy stays the GPS's own figure: the
    // filter's own estimate assumes errors are independent, which they aren't
    // indoors or near cliffs, and the app must never look more certain than it is.
    return { ...fix, lat: this.lat, lon: this.lon };
  }

  private isSurprising(fix: LocationFix, measurementVariance: number): boolean {
    if (this.variance < 0 || fix.accuracy > SHARP_ACCURACY_M) return false;
    const gap = distanceMeters([this.lon, this.lat], [fix.lon, fix.lat]);
    return gap > SURPRISE_SIGMAS * Math.sqrt(this.variance + measurementVariance);
  }
}

/** Wraps a LocationSource so everything downstream gets smoothed positions. */
export function smoothLocationSource(source: LocationSource): LocationSource {
  const smoother = new PositionSmoother();
  const listeners = new Set<LocationListener>();
  let lastFix: LocationFix | null = null;
  let unsubscribe: (() => void) | null = null;

  const forward: LocationListener = {
    onFix(fix) {
      lastFix = smoother.update(fix);
      for (const listener of listeners) listener.onFix(lastFix);
    },
    onError(error) {
      for (const listener of listeners) listener.onError?.(error);
    },
  };

  return {
    get lastFix() {
      return lastFix;
    },
    restart: () => source.restart(),
    subscribe(listener) {
      listeners.add(listener);
      if (lastFix) listener.onFix(lastFix);
      unsubscribe ??= source.subscribe(forward);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          unsubscribe?.();
          unsubscribe = null;
        }
      };
    },
  };
}
