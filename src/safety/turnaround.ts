import { distanceMeters } from '../map/geo';
import { pathLength, toblerTimeMs, type PathPoint } from './hikingTime';

/** Aim to be back this long before sunset: it's darker under trees, and people slow down when tired. */
export const DAYLIGHT_BUFFER_MS = 30 * 60_000;
/** The way back is assumed to take this much longer than the same ground did earlier (tired legs). */
const FATIGUE = 1.15;
/** Before we know this hiker's pace, assume they're a bit slower than Tobler's average hiker. */
const DEFAULT_PACE_FACTOR = 1.3;
/** A pace is only trusted after this much hiking; a few hundred metres can be misleading. */
const CALIBRATION_MIN_M = 500;
const CALIBRATION_MIN_MS = 10 * 60_000;
/** Within this of the loaded route counts as "on it". */
const ON_ROUTE_M = 60;
/** A route whose end is this close to where the hike started brings you back to the start (a loop). */
const FINISHES_AT_START_M = 300;
/** Counts as heading back once you're this far out and have come this much of the way back. */
const RETURNING_MIN_M = 200;
const RETURNING_RATIO = 0.75;

export interface TurnaroundInput {
  now: number;
  /** Today's sunset at the hiker's position (ms). */
  sunset: number;
  /** The hike so far, in order, with elevations where known. */
  hiked: readonly PathPoint[];
  /** Time spent hiking so far (pauses excluded). */
  hikedMs: number;
  /** The route the hiker loaded, if any. */
  route: readonly PathPoint[] | null;
}

export interface TurnaroundPlan {
  /**
   * - out-and-back: no route (or not on it); you'll return the way you came.
   * - returning: you're already on your way back.
   * - loop: following a route that ends where you started.
   * - destination: following a route to somewhere else (e.g. a summit), then back.
   */
  mode: 'out-and-back' | 'returning' | 'loop' | 'destination';
  sunset: number;
  /** When to be back by: sunset minus the safety buffer. */
  deadline: number;
  afterDark: boolean;
  /** The latest time to start heading back (out-and-back and destination). */
  turnAroundBy: number | null;
  /** When you'd be back at the start, following the advice. */
  backAt: number;
  /** Loops: whether finishing the loop or going back is the way to go. */
  via: 'continue' | 'back' | null;
  /** Destination routes: when you'd reach the end, and be back from there. */
  destinationAt: number | null;
  finishAt: number | null;
  /** Whether estimates are tuned to this hiker's own pace yet. */
  calibrated: boolean;
}

/**
 * Works out whether a hiker will get back before dark, and when they need to
 * turn around.
 *
 * Times come from Tobler's hiking function (slope-aware, using elevation)
 * scaled by a "pace factor": how much slower or faster this hiker has
 * actually been than Tobler predicted for the ground they've covered,
 * stops included. So a fit hiker gets tighter estimates and a slow one gets
 * more cautious ones, and the way back uses the real slopes reversed
 * (what was a climb on the way up is a descent on the way down).
 */
export function planTurnaround({ now, sunset, hiked, hikedMs, route }: TurnaroundInput): TurnaroundPlan {
  const deadline = sunset - DAYLIGHT_BUFFER_MS;
  const calibrated = pathLength(hiked) >= CALIBRATION_MIN_M && hikedMs >= CALIBRATION_MIN_MS;
  const paceFactor = calibrated
    ? clamp(hikedMs / Math.max(1, toblerTimeMs(hiked)), 0.7, 3)
    : DEFAULT_PACE_FACTOR;
  const estimate = (path: readonly PathPoint[]) => paceFactor * toblerTimeMs(path) * FATIGUE;

  const base = { sunset, deadline, afterDark: now >= sunset, calibrated };
  const here = hiked.at(-1);
  const start = hiked[0];
  if (!here || !start) {
    return { ...base, mode: 'out-and-back', turnAroundBy: deadline, backAt: now, via: null, destinationAt: null, finishAt: null };
  }

  const backPath = wayBack(hiked);
  const goBackMs = estimate(backPath);
  const onRoute = route && route.length >= 2 ? nearestIndex(route, here) : null;

  // Following a loop: compare finishing it with going back the way you came.
  if (onRoute && onRoute.meters <= ON_ROUTE_M && metres(route!.at(-1)!, start) <= FINISHES_AT_START_M) {
    const continueMs = estimate(route!.slice(onRoute.index));
    const continueFits = now + continueMs <= deadline;
    const via = continueFits || continueMs <= goBackMs ? 'continue' : 'back';
    return {
      ...base,
      mode: 'loop',
      turnAroundBy: null,
      backAt: now + (via === 'continue' ? continueMs : goBackMs),
      via,
      destinationAt: null,
      finishAt: null,
    };
  }

  if (isReturning(hiked)) {
    return { ...base, mode: 'returning', turnAroundBy: null, backAt: now + goBackMs, via: null, destinationAt: null, finishAt: null };
  }

  // Heading out. Every extra minute out also adds to the walk back, so the
  // slack is shared between the two: you can keep going for slack / (1 + r),
  // where r is how long the way back takes compared with the way out.
  const backRatio = calibrated ? clamp(goBackMs / hikedMs, 0.5, 2) : FATIGUE;
  const slack = deadline - now - goBackMs;
  const turnAroundBy = now + slack / (1 + backRatio);

  if (onRoute && onRoute.meters <= ON_ROUTE_M) {
    const destinationAt = now + estimate(route!.slice(onRoute.index));
    const finishAt = destinationAt + estimate([...route!].reverse());
    return { ...base, mode: 'destination', turnAroundBy, backAt: now + goBackMs, via: null, destinationAt, finishAt };
  }
  return { ...base, mode: 'out-and-back', turnAroundBy, backAt: now + goBackMs, via: null, destinationAt: null, finishAt: null };
}

/**
 * The way back to the start along the path already walked: from the point of
 * the outward leg nearest to where you are now, reversed. (Just reversing the
 * whole track would, on the way back, count the return leg twice.)
 */
function wayBack(hiked: readonly PathPoint[]): PathPoint[] {
  const here = hiked[hiked.length - 1];
  const farthest = farthestIndex(hiked);
  let nearest = farthest;
  let best = Infinity;
  for (let i = 0; i <= farthest; i++) {
    const d = metres(hiked[i], here);
    if (d < best) [best, nearest] = [d, i];
  }
  return [here, ...hiked.slice(0, nearest + 1).reverse()];
}

/** Heading back: well out from the start at some point, and now a good way back. */
function isReturning(hiked: readonly PathPoint[]): boolean {
  const start = hiked[0];
  const farthest = metres(hiked[farthestIndex(hiked)], start);
  return farthest >= RETURNING_MIN_M && metres(hiked[hiked.length - 1], start) <= farthest * RETURNING_RATIO;
}

function farthestIndex(hiked: readonly PathPoint[]): number {
  let index = 0;
  let farthest = -1;
  hiked.forEach((p, i) => {
    const d = metres(p, hiked[0]);
    if (d > farthest) [farthest, index] = [d, i];
  });
  return index;
}

function nearestIndex(path: readonly PathPoint[], point: PathPoint): { index: number; meters: number } {
  let index = 0;
  let meters = Infinity;
  path.forEach((p, i) => {
    const d = metres(p, point);
    if (d < meters) [meters, index] = [d, i];
  });
  return { index, meters };
}

function metres(a: PathPoint, b: PathPoint): number {
  return distanceMeters([a.lon, a.lat], [b.lon, b.lat]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
