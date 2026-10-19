import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Recorder } from '../recording/recorder';
import { Routes } from '../routes/routes';
import { FakeLocation, MemoryHikeStore, MemoryRouteStore, MemoryStorage } from '../test/fakes';
import { HikeHistory } from './hikeHistory';

/** Records a finished hike with a pause in the middle (so two segments). */
async function recordHike(store: MemoryHikeStore) {
  const gps = new FakeLocation();
  const recorder = new Recorder(store, gps);
  await recorder.start('Hike on Sat, Oct 18');
  gps.emit(0, 0);
  gps.emit(20, 15);
  recorder.pause();
  recorder.resume();
  gps.emit(100, 200);
  gps.emit(120, 215);
  return (await recorder.finish())!;
}

function historyFor(store: MemoryHikeStore) {
  const routeStore = new MemoryRouteStore();
  return new HikeHistory(store, routeStore, new Routes(routeStore));
}

describe('HikeHistory', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  it('lists finished hikes with their totals', async () => {
    const store = new MemoryHikeStore();
    await recordHike(store);
    const history = historyFor(store);
    await history.refresh();
    expect(history.all).toHaveLength(1);
    expect(history.totals.distanceMeters).toBeCloseTo(40, 0);
  });

  it('exports a hike as GPX with one <trkseg> per segment', async () => {
    const store = new MemoryHikeStore();
    const hike = await recordHike(store);
    const history = historyFor(store);
    await history.refresh();
    const file = await history.gpxFile(hike.id);
    expect(file.name).toMatch(/^hike-\d{4}-\d{2}-\d{2}\.gpx$/);
    expect((await file.text()).match(/<trkseg>/g)).toHaveLength(2);
  });

  it('restores a backup onto an empty phone, and restoring twice adds nothing', async () => {
    const oldPhone = new MemoryHikeStore();
    await recordHike(oldPhone);
    await recordHike(oldPhone);
    const before = historyFor(oldPhone);
    await before.refresh();
    const backup = await before.backupFile();

    const newPhone = historyFor(new MemoryHikeStore());
    expect(await newPhone.restore(backup)).toEqual({ added: 2, alreadyHere: 0, routesAdded: 0 });
    expect(await newPhone.restore(backup)).toEqual({ added: 0, alreadyHere: 2, routesAdded: 0 });
    expect(newPhone.all).toHaveLength(2);
    expect(await newPhone.track(newPhone.all[0].id)).toHaveLength(2);
  });

  it('counts hikes not yet backed up', async () => {
    const store = new MemoryHikeStore();
    await recordHike(store);
    const history = historyFor(store);
    await history.refresh();
    expect(history.notBackedUp).toBe(1);
    history.markBackedUp();
    expect(history.notBackedUp).toBe(0);
  });
});
