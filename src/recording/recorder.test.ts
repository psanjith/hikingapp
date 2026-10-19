import { beforeEach, describe, expect, it } from 'vitest';
import type { LocationFix, LocationListener, LocationSource } from '../location/types';
import type { HikeStore } from './hikeStore';
import { Recorder } from './recorder';
import type { Hike, HikePoint } from './types';

/** A GPS we control: tests call emit() to "walk". */
class FakeLocation implements LocationSource {
  lastFix: LocationFix | null = null;
  private listeners = new Set<LocationListener>();
  subscribe(listener: LocationListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  restart() {}
  get listening() {
    return this.listeners.size > 0;
  }
  /** A fix `north` metres north of the start, at `seconds`. */
  emit(north: number, seconds: number, accuracy = 8) {
    const fix: LocationFix = {
      lat: 49.37 + north / 111_195,
      lon: -123.08,
      accuracy,
      altitude: null,
      heading: null,
      speed: null,
      timestamp: seconds * 1000,
    };
    for (const l of this.listeners) l.onFix(fix);
  }
}

/** Stores hikes in memory, like IndexedDB would (including structured cloning). */
class MemoryHikeStore implements HikeStore {
  hikes = new Map<string, Hike>();
  pointList: HikePoint[] = [];
  async create(hike: Hike) {
    this.hikes.set(hike.id, structuredClone(hike));
  }
  async appendPoint(hike: Hike, point: HikePoint) {
    this.hikes.set(hike.id, structuredClone(hike));
    this.pointList.push(structuredClone(point));
  }
  async update(hike: Hike) {
    this.hikes.set(hike.id, structuredClone(hike));
  }
  async findUnfinished() {
    return [...this.hikes.values()].find((h) => h.status !== 'finished') ?? null;
  }
  async points(hikeId: string) {
    return this.pointList.filter((p) => p.hikeId === hikeId).sort((a, b) => a.seq - b.seq);
  }
  async remove(hikeId: string) {
    this.hikes.delete(hikeId);
    this.pointList = this.pointList.filter((p) => p.hikeId !== hikeId);
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Recorder', () => {
  let gps: FakeLocation;
  let store: MemoryHikeStore;
  let clock: number;
  let recorder: Recorder;

  beforeEach(() => {
    gps = new FakeLocation();
    store = new MemoryHikeStore();
    clock = 1_000_000;
    recorder = new Recorder(store, gps, () => clock);
  });

  it('records filtered points and adds up the distance', async () => {
    await recorder.start('Test hike');
    gps.emit(0, 0);
    gps.emit(2, 5); // Wobble: ignored.
    gps.emit(20, 15);
    gps.emit(40, 30);
    expect(recorder.track).toHaveLength(1);
    expect(recorder.track[0]).toHaveLength(3);
    expect(recorder.current!.distanceMeters).toBeCloseTo(40, 0);
  });

  it('saves every kept point as it arrives, not just at the end', async () => {
    await recorder.start('Test hike');
    gps.emit(0, 0);
    gps.emit(20, 15);
    await flush();
    expect(store.pointList).toHaveLength(2);
    expect([...store.hikes.values()][0]).toMatchObject({ status: 'recording', pointCount: 2 });
  });

  it('stops recording while paused, but keeps time and distance', async () => {
    await recorder.start('Test hike');
    gps.emit(0, 0);
    gps.emit(20, 15);
    clock += 60_000;
    recorder.pause();
    expect(gps.listening).toBe(false);

    gps.emit(500, 100); // Ignored: paused.
    clock += 600_000; // A 10-minute break doesn't count as hiking time.
    expect(recorder.track[0]).toHaveLength(2);
    expect(recorder.elapsedMs()).toBe(60_000);
  });

  it('starts a new segment on resume, without counting the gap', async () => {
    await recorder.start('Test hike');
    gps.emit(0, 0);
    gps.emit(20, 15);
    recorder.pause();
    recorder.resume();
    gps.emit(300, 200); // Where they resumed, far from where they paused.
    gps.emit(320, 215);

    expect(recorder.track).toHaveLength(2);
    expect(recorder.current!.segmentCount).toBe(2);
    expect(recorder.current!.distanceMeters).toBeCloseTo(40, 0);
  });

  it('does not create empty segments when pausing before any GPS fix', async () => {
    await recorder.start('Test hike');
    recorder.pause();
    recorder.resume();
    gps.emit(0, 0);
    gps.emit(20, 15);
    expect(recorder.track).toHaveLength(1);
  });

  it('recovers a hike after the app is killed, paused, with time up to the last point', async () => {
    await recorder.start('Test hike');
    gps.emit(0, 0);
    clock += 120_000;
    gps.emit(20, 120);
    await flush();
    // The app dies 5 minutes later; a new app instance starts.
    clock += 300_000;
    const reopened = new Recorder(store, new FakeLocation(), () => clock);
    const recovered = await reopened.restore();

    expect(recovered).toMatchObject({ status: 'paused', pointCount: 2 });
    expect(reopened.state).toBe('paused');
    expect(reopened.track[0]).toHaveLength(2);
    expect(reopened.elapsedMs()).toBe(120_000);
  });

  it('continues a recovered hike in a new segment', async () => {
    await recorder.start('Test hike');
    gps.emit(0, 0);
    gps.emit(20, 15);
    await flush();

    const gps2 = new FakeLocation();
    const reopened = new Recorder(store, gps2, () => clock);
    await reopened.restore();
    reopened.resume();
    gps2.emit(100, 400);
    gps2.emit(120, 415);
    await flush();

    expect(reopened.track).toHaveLength(2);
    expect(store.pointList.map((p) => p.seq)).toEqual([0, 1, 2, 3]);
    expect(store.pointList.map((p) => p.segment)).toEqual([0, 0, 1, 1]);
  });

  it('saves a finished hike', async () => {
    await recorder.start('Test hike');
    gps.emit(0, 0);
    gps.emit(20, 15);
    const hike = await recorder.finish();
    expect(hike).toMatchObject({ status: 'finished', pointCount: 2 });
    expect(store.hikes.get(hike!.id)?.status).toBe('finished');
    expect(recorder.state).toBe('idle');
    expect(await store.findUnfinished()).toBeNull();
  });

  it('discards a "hike" with nothing recorded', async () => {
    await recorder.start('Oops');
    gps.emit(0, 0);
    expect(await recorder.finish()).toBeNull();
    expect(store.hikes.size).toBe(0);
    expect(store.pointList).toHaveLength(0);
  });
});
