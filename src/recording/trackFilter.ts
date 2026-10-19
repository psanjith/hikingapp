import {
  RECORD_GAP_M,
  RECORD_GAP_MS,
  RECORD_MAX_ACCURACY_M,
  RECORD_MAX_MOVE_M,
  RECORD_MIN_MOVE_M,
} from '../config';
import { distanceMeters } from '../map/geo';

/** The parts of a GPS reading the filter looks at. */
export interface FilterPoint {
  lat: number;
  lon: number;
  time: number;
  accuracy: number;
}

export type FilterDecision =
  | { action: 'skip'; reason: 'inaccurate' | 'too-close' | 'out-of-order' }
  /** Keep it. `distance` is what it adds to the total (0 when it starts a new segment). */
  | { action: 'add'; newSegment: boolean; distance: number };

/**
 * Decides whether a GPS reading becomes part of the recorded track.
 *
 * Phone GPS wobbles by several metres even when you're standing still. Adding
 * up every wobble makes the distance creep upwards at a lunch stop, so a
 * reading is only kept when it is:
 *
 *   1. accurate enough to trust, and
 *   2. far enough from the last kept point that it's real movement, not
 *      wobble. "Far enough" grows with the reported inaccuracy: half the
 *      accuracy radius, kept between 5 and 15 m.
 *
 * Distance is then the sum of straight lines between kept points, so this
 * slightly undercounts tight switchbacks: the usual tradeoff, and much
 * smaller than the overcounting it prevents.
 *
 * `last` is the last kept point of the current segment, or null at the start
 * of a segment (after Start or Resume).
 */
export function filterFix(last: FilterPoint | null, fix: FilterPoint): FilterDecision {
  if (fix.accuracy > RECORD_MAX_ACCURACY_M) return { action: 'skip', reason: 'inaccurate' };
  if (!last) return { action: 'add', newSegment: false, distance: 0 };
  if (fix.time <= last.time) return { action: 'skip', reason: 'out-of-order' };

  const moved = distanceMeters([last.lon, last.lat], [fix.lon, fix.lat]);
  const threshold = Math.min(RECORD_MAX_MOVE_M, Math.max(RECORD_MIN_MOVE_M, fix.accuracy / 2));
  if (moved < threshold) return { action: 'skip', reason: 'too-close' };

  // A long silence followed by a big jump: we don't know the path in between.
  if (fix.time - last.time > RECORD_GAP_MS && moved > RECORD_GAP_M) {
    return { action: 'add', newSegment: true, distance: 0 };
  }
  return { action: 'add', newSegment: false, distance: moved };
}
