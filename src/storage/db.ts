import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { StoredRegion } from '../maps/types';

/**
 * The app's on-device database (IndexedDB).
 *
 * Small, structured records live here: which map regions are downloaded and,
 * from Stage 4, recorded hikes and their GPS points. Large binary map files
 * live in OPFS instead (see mapFileStore.ts); this database only tracks them.
 */
interface HikingDB extends DBSchema {
  regions: {
    key: string;
    value: StoredRegion;
  };
}

const DB_NAME = 'hikingapp';
/**
 * Bump this when adding stores or indexes, and handle the step in upgrade().
 * Each step runs once per device, in order, so old installs migrate cleanly.
 */
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<HikingDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<HikingDB>> {
  dbPromise ??= openDB<HikingDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('regions', { keyPath: 'id' });
      }
    },
  });
  return dbPromise;
}
