/** In-memory stand-ins for GPS and storage, shared by the tests. */
import type { LocationFix, LocationListener, LocationSource } from '../location/types';
import type { HikeStore } from '../recording/hikeStore';
import type { Hike, HikePoint } from '../recording/types';
import type { RouteStore } from '../routes/routeStore';
import type { SavedRoute } from '../routes/types';

/** A GPS we control: tests call emit() to "walk". */
export class FakeLocation implements LocationSource {
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
    this.lastFix = fix;
    for (const l of this.listeners) l.onFix(fix);
  }
}

/** Stores hikes in memory, like IndexedDB would (including structured cloning). */
export class MemoryHikeStore implements HikeStore {
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
  async listFinished() {
    return [...this.hikes.values()].filter((h) => h.status === 'finished');
  }
  async importHike(hike: Hike, points: HikePoint[]) {
    this.hikes.set(hike.id, structuredClone(hike));
    this.pointList.push(...structuredClone(points));
  }
}

export class MemoryRouteStore implements RouteStore {
  routes = new Map<string, SavedRoute>();
  async list() {
    return [...this.routes.values()];
  }
  async save(route: SavedRoute) {
    this.routes.set(route.id, structuredClone(route));
  }
  async remove(id: string) {
    this.routes.delete(id);
  }
}

/** A localStorage stand-in (Node's own global localStorage isn't usable in tests). */
export class MemoryStorage implements Storage {
  private items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  clear() {
    this.items.clear();
  }
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
  setItem(key: string, value: string) {
    this.items.set(key, String(value));
  }
}
