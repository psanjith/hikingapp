import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { StoredRegion } from '../maps/types';
import type { Hike, HikePoint } from '../recording/types';
import type { SavedRoute } from '../routes/types';

/**
 * The app's on-device database (IndexedDB).
 *
 * Small, structured records live here: which map regions are downloaded,
 * imported GPX routes, and recorded hikes with their GPS points. Large binary map files
 * live in OPFS instead (see mapFileStore.ts); this database only tracks them.
 */
interface HikingDB extends DBSchema {
  regions: {
    key: string;
    value: StoredRegion;
  };
  routes: {
    key: string;
    value: SavedRoute;
  };
  hikes: {
    key: string;
    value: Hike;
  };
  /** Keyed by [hikeId, seq], so one hike's points are stored together, in order. */
  points: {
    key: [string, number];
    value: HikePoint;
  };
}

const DB_NAME = 'hikingapp';
/**
 * Bump this when adding stores or indexes, and handle the step in upgrade().
 * Each step runs once per device, in order, so old installs migrate cleanly.
 */
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase<HikingDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<HikingDB>> {
  dbPromise ??= openDB<HikingDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('regions', { keyPath: 'id' });
      }
      if (oldVersion < 2) {
        db.createObjectStore('routes', { keyPath: 'id' });
      }
      if (oldVersion < 3) {
        db.createObjectStore('hikes', { keyPath: 'id' });
        db.createObjectStore('points', { keyPath: ['hikeId', 'seq'] });
      }
    },
  });
  return dbPromise;
}
