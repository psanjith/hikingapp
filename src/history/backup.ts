import type { Hike, HikePoint } from '../recording/types';
import type { SavedRoute } from '../routes/types';

const FORMAT = 'hikingapp-backup';
const VERSION = 1;

/** Everything a backup holds: finished hikes with all their points, and imported routes. */
export interface BackupContents {
  hikes: { hike: Hike; points: HikePoint[] }[];
  routes: SavedRoute[];
}

/** A problem with a backup file, with a message that's safe to show users. */
export class BackupError extends Error {}

/** A point in the file: [segment, lat, lon, time, accuracy, altitude]. */
type PackedPoint = [number, number, number, number, number, number | null];

/**
 * Turns all hikes into one JSON file the user can keep anywhere (iCloud Drive,
 * email, a computer) and restore on a new phone.
 *
 * JSON rather than GPX because a backup must restore *exactly*: hike names,
 * active time, segments and imported routes, not just the tracks. Points are
 * packed as small arrays instead of objects, which makes the file about a
 * third of the size: it matters once there are hundreds of hikes.
 */
export function encodeBackup(contents: BackupContents, exportedAt: number): string {
  return JSON.stringify({
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date(exportedAt).toISOString(),
    hikes: contents.hikes.map(({ hike, points }) => ({
      hike,
      points: points.map((p): PackedPoint => [p.segment, p.lat, p.lon, p.time, p.accuracy, p.altitude]),
    })),
    routes: contents.routes,
  });
}

/** Reads a backup file back, checking it really is one before anything is saved. */
export function decodeBackup(text: string): BackupContents {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError("This isn't a Hiking App backup file, or the file is damaged.");
  }
  if (!isRecord(data) || data.format !== FORMAT) {
    throw new BackupError("This isn't a Hiking App backup file. Choose a file named like “hikes-backup-….json”.");
  }
  if (typeof data.version !== 'number' || data.version > VERSION) {
    throw new BackupError('This backup was made by a newer version of the app. Update the app and try again.');
  }
  if (!Array.isArray(data.hikes) || !Array.isArray(data.routes)) {
    throw new BackupError('This backup file is damaged.');
  }

  const hikes = data.hikes.map((entry: unknown) => {
    if (!isRecord(entry) || !isHike(entry.hike) || !Array.isArray(entry.points)) {
      throw new BackupError('This backup file is damaged.');
    }
    const hike = entry.hike;
    const points = (entry.points as unknown[]).map((packed, seq): HikePoint => {
      if (!isPackedPoint(packed)) throw new BackupError('This backup file is damaged.');
      const [segment, lat, lon, time, accuracy, altitude] = packed;
      return { hikeId: hike.id, seq, segment, lat, lon, time, accuracy, altitude };
    });
    return { hike, points };
  });

  const routes = (data.routes as unknown[]).filter(isRoute);
  return { hikes, routes };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isHike(value: unknown): value is Hike {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    value.status === 'finished' &&
    typeof value.startedAt === 'number' &&
    typeof value.distanceMeters === 'number' &&
    typeof value.activeMs === 'number'
  );
}

function isPackedPoint(value: unknown): value is PackedPoint {
  return (
    Array.isArray(value) &&
    value.length === 6 &&
    value.slice(0, 5).every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    (value[5] === null || typeof value[5] === 'number')
  );
}

function isRoute(value: unknown): value is SavedRoute {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string' && Array.isArray(value.lines);
}
