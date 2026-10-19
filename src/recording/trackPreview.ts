import type { LonLat } from '../map/geo';
import type { HikePoint } from './types';

/** Enough to show a hike's shape in a small thumbnail. */
const PREVIEW_POINTS = 60;

/**
 * Picks up to `max` evenly spaced points from a track (always keeping the very
 * first and last), so the history list can draw each hike's shape without
 * loading thousands of GPS points per row.
 */
export function trackPreview(segments: readonly LonLat[][], max = PREVIEW_POINTS): LonLat[] {
  const all = segments.flat();
  if (all.length <= max) return all;
  const step = (all.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => all[Math.round(i * step)]);
}

/** Saved points (in recording order) back into one line per segment. */
export function groupSegments(points: readonly HikePoint[]): LonLat[][] {
  const lines: LonLat[][] = [];
  for (const p of points) (lines[p.segment] ??= []).push([p.lon, p.lat]);
  return lines.filter(Boolean); // In case a segment number was ever skipped.
}
