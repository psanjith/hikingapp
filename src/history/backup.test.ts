import { describe, expect, it } from 'vitest';
import type { Hike, HikePoint } from '../recording/types';
import { BackupError, decodeBackup, encodeBackup } from './backup';

const hike: Hike = {
  id: 'h1',
  name: 'Grouse Grind',
  status: 'finished',
  startedAt: 1_000,
  endedAt: 5_000,
  distanceMeters: 2900,
  pointCount: 3,
  segmentCount: 2,
  activeMs: 4_000,
  activeSince: null,
  lastPointAt: 4_000,
  preview: [
    [-123.1, 49.37],
    [-123.08, 49.38],
  ],
};

const points: HikePoint[] = [
  { hikeId: 'h1', seq: 0, segment: 0, lat: 49.37, lon: -123.1, time: 1_000, accuracy: 5, altitude: 290 },
  { hikeId: 'h1', seq: 1, segment: 0, lat: 49.375, lon: -123.09, time: 2_000, accuracy: 7, altitude: null },
  { hikeId: 'h1', seq: 2, segment: 1, lat: 49.38, lon: -123.08, time: 4_000, accuracy: 6, altitude: 1100 },
];

describe('backup', () => {
  it('restores exactly what was backed up', () => {
    const route = { id: 'r1', name: 'Route', lines: [], waypoints: [], bounds: [0, 0, 0, 0], lengthMeters: 0, importedAt: 0 };
    const file = encodeBackup({ hikes: [{ hike, points }], routes: [route as never] }, 0);
    const restored = decodeBackup(file);
    expect(restored.hikes).toEqual([{ hike, points }]);
    expect(restored.routes).toEqual([route]);
  });

  it('packs points compactly', () => {
    const file = encodeBackup({ hikes: [{ hike, points }], routes: [] }, 0);
    expect(file).toContain('[0,49.37,-123.1,1000,5,290]');
  });

  it('rejects files that are not backups, with a helpful message', () => {
    expect(() => decodeBackup('not json')).toThrow(BackupError);
    expect(() => decodeBackup('{"hello":1}')).toThrow("isn't a Hiking App backup");
  });

  it('rejects backups from a newer version of the app', () => {
    expect(() => decodeBackup('{"format":"hikingapp-backup","version":99,"hikes":[],"routes":[]}')).toThrow('newer version');
  });

  it('rejects damaged hikes instead of saving half a record', () => {
    const file = JSON.stringify({
      format: 'hikingapp-backup',
      version: 1,
      hikes: [{ hike, points: [[0, 'oops', -123, 1, 5, null]] }],
      routes: [],
    });
    expect(() => decodeBackup(file)).toThrow('damaged');
  });
});
