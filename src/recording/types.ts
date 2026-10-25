import type { LonLat } from '../map/geo';

export type HikeStatus = 'recording' | 'paused' | 'finished';

/**
 * A recorded hike's summary. The GPS points are stored separately (see
 * HikePoint), so saving one new point never means rewriting the whole hike.
 */
export interface Hike {
  id: string;
  name: string;
  status: HikeStatus;
  startedAt: number;
  endedAt: number | null;
  distanceMeters: number;
  pointCount: number;
  /** Number of track segments (a new one starts on every resume). */
  segmentCount: number;
  /** Time spent recording, not counting pauses (ms), up to `activeSince`. */
  activeMs: number;
  /** When the current recording stretch began; null while paused or finished. */
  activeSince: number | null;
  /** Time of the newest saved point, used to recover cleanly after a crash. */
  lastPointAt: number | null;
  /**
   * A few dozen points tracing the hike's shape, saved when it finishes, so the
   * history list can draw a thumbnail without loading every GPS point.
   * Missing on hikes recorded before this was added.
   */
  preview?: LonLat[];
  /**
   * Total climb and descent (m), from smoothed GPS altitude. null when the
   * phone gave no altitude; missing (undefined) on hikes from before this
   * was added, until worked out from their points.
   */
  climbMeters?: number | null;
  descentMeters?: number | null;
}

/** One saved GPS reading. */
export interface HikePoint {
  hikeId: string;
  /** 0, 1, 2… in recording order. Together with hikeId, this is the key. */
  seq: number;
  /** Which segment (0-based) this point belongs to. */
  segment: number;
  lat: number;
  lon: number;
  time: number;
  accuracy: number;
  altitude: number | null;
}
