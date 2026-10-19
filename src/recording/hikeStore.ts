import { getDb } from '../storage/db';
import type { Hike, HikePoint } from './types';

/**
 * Where recorded hikes live. The recorder only sees this interface, so tests
 * use an in-memory version and a native build could swap in its own.
 */
export interface HikeStore {
  create(hike: Hike): Promise<void>;
  /** Saves one new point and the updated summary together: both or neither. */
  appendPoint(hike: Hike, point: HikePoint): Promise<void>;
  update(hike: Hike): Promise<void>;
  /** A hike that was recording or paused when the app last closed, if any. */
  findUnfinished(): Promise<Hike | null>;
  points(hikeId: string): Promise<HikePoint[]>;
  remove(hikeId: string): Promise<void>;
}

/** Every key for one hike's points: [id, 0] up to [id, +∞]. */
const pointRange = (hikeId: string) => IDBKeyRange.bound([hikeId, 0], [hikeId, Infinity]);

/**
 * IndexedDB implementation.
 *
 * Each GPS point is its own small record, written the moment it's accepted.
 * Appending is then a tiny, constant-size write however long the hike gets,
 * and a crash or dead battery loses at most the point being written. (Storing
 * all points in one array would mean rewriting the whole hike every few
 * seconds.) The point and the hike's running totals are written in one
 * transaction, so they can never disagree after a crash.
 */
export function createIndexedDbHikeStore(): HikeStore {
  return {
    async create(hike) {
      await (await getDb()).put('hikes', hike);
    },

    async appendPoint(hike, point) {
      const tx = (await getDb()).transaction(['hikes', 'points'], 'readwrite');
      await Promise.all([tx.objectStore('points').put(point), tx.objectStore('hikes').put(hike), tx.done]);
    },

    async update(hike) {
      await (await getDb()).put('hikes', hike);
    },

    async findUnfinished() {
      const hikes = await (await getDb()).getAll('hikes');
      return hikes.find((h) => h.status !== 'finished') ?? null;
    },

    async points(hikeId) {
      return (await getDb()).getAll('points', pointRange(hikeId));
    },

    async remove(hikeId) {
      const tx = (await getDb()).transaction(['hikes', 'points'], 'readwrite');
      await Promise.all([
        tx.objectStore('points').delete(pointRange(hikeId)),
        tx.objectStore('hikes').delete(hikeId),
        tx.done,
      ]);
    },
  };
}
