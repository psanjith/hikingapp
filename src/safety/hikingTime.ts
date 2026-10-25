import { distanceMeters } from '../map/geo';

/** A point on a path, with elevation in metres if known. */
export interface PathPoint {
  lon: number;
  lat: number;
  ele: number | null;
}

/**
 * Elevation is averaged over this distance each way before slopes are worked
 * out. Phone GPS altitude wobbles by several metres from one reading to the
 * next; over 5 m steps that would look like cliffs.
 */
const SMOOTHING_M = 50;
/** Slopes are measured over steps this long. */
const STEP_M = 25;
/** Steeper than this is a scramble; beyond it, the speed formula isn't meaningful. */
const MAX_SLOPE = 0.6;

/**
 * Walking speed on a slope, by Tobler's hiking function (1993): about
 * 5 km/h on the flat, fastest on a gentle descent, slower going up or down
 * steeply. `slope` is rise over run (0.1 = 10% uphill, −0.1 = downhill).
 */
export function toblerSpeedKmh(slope: number): number {
  return 6 * Math.exp(-3.5 * Math.abs(slope + 0.05));
}

/**
 * How long a path takes at Tobler's standard pace, in ms, using elevation
 * where known (missing elevations are filled in from their neighbours; with
 * none at all, the path is treated as flat). Multiply by a pace factor to
 * personalise it.
 */
export function toblerTimeMs(path: readonly PathPoint[]): number {
  const profile = elevationProfile(path);
  if (profile.length < 2) return 0;
  const total = profile[profile.length - 1].distance;

  let ms = 0;
  for (let from = 0; from < total; from += STEP_M) {
    const to = Math.min(total, from + STEP_M);
    const run = to - from;
    if (run <= 0) continue;
    const rise = elevationAt(profile, to) - elevationAt(profile, from);
    const slope = Math.max(-MAX_SLOPE, Math.min(MAX_SLOPE, rise / run));
    ms += (run / 1000 / toblerSpeedKmh(slope)) * 3_600_000;
  }
  return ms;
}

/** Total length of a path in metres. */
export function pathLength(path: readonly PathPoint[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += distanceMeters([path[i - 1].lon, path[i - 1].lat], [path[i].lon, path[i].lat]);
  return total;
}

interface ProfilePoint {
  /** Metres along the path. */
  distance: number;
  /** Smoothed elevation in metres. */
  ele: number;
}

/** Distance along the path and smoothed elevation at each point. */
function elevationProfile(path: readonly PathPoint[]): ProfilePoint[] {
  const distances: number[] = [];
  let total = 0;
  path.forEach((p, i) => {
    if (i > 0) total += distanceMeters([path[i - 1].lon, path[i - 1].lat], [p.lon, p.lat]);
    distances.push(total);
  });

  const raw = fillMissing(path.map((p) => p.ele), distances);

  // Average each point's elevation with every point within SMOOTHING_M along
  // the path. A sliding window keeps this linear in the number of points.
  const smoothed: number[] = [];
  let start = 0;
  let end = 0;
  let sum = 0;
  for (let i = 0; i < path.length; i++) {
    while (end < path.length && distances[end] - distances[i] <= SMOOTHING_M) sum += raw[end++];
    while (distances[i] - distances[start] > SMOOTHING_M) sum -= raw[start++];
    smoothed.push(sum / (end - start));
  }
  return distances.map((distance, i) => ({ distance, ele: smoothed[i] }));
}

/** Fills gaps in elevation by straight-line interpolation along the path (all missing → flat). */
function fillMissing(values: readonly (number | null)[], distances: readonly number[]): number[] {
  const isKnown = (v: number | null): v is number => v !== null && Number.isFinite(v);
  // Nearest known point before and after each index, found in one pass each way.
  const before: number[] = [];
  const after: number[] = new Array<number>(values.length);
  let last = -1;
  values.forEach((v, i) => {
    if (isKnown(v)) last = i;
    before.push(last);
  });
  last = -1;
  for (let i = values.length - 1; i >= 0; i--) {
    if (isKnown(values[i])) last = i;
    after[i] = last;
  }

  return values.map((value, i) => {
    if (isKnown(value)) return value;
    const [b, a] = [before[i], after[i]];
    if (b < 0 && a < 0) return 0; // No elevation anywhere: treat as flat.
    if (b < 0) return values[a]!;
    if (a < 0) return values[b]!;
    const t = (distances[i] - distances[b]) / Math.max(1e-9, distances[a] - distances[b]);
    return values[b]! + t * (values[a]! - values[b]!);
  });
}

/** Smoothed elevation at a distance along the profile (linear between points). */
function elevationAt(profile: readonly ProfilePoint[], distance: number): number {
  let lo = 0;
  let hi = profile.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (profile[mid].distance <= distance) lo = mid;
    else hi = mid;
  }
  const a = profile[lo];
  const b = profile[hi];
  const t = b.distance === a.distance ? 0 : (distance - a.distance) / (b.distance - a.distance);
  return a.ele + Math.max(0, Math.min(1, t)) * (b.ele - a.ele);
}
