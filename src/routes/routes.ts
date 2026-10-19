import { GpxError, parseGpx, type ParsedGpx } from '../gpx/parseGpx';
import { boundsOfPoints, lineLengthMeters } from '../map/geo';
import type { RouteStore } from './routeStore';
import type { SavedRoute } from './types';

/** Real trail files are well under 5 MB; anything far bigger is probably not a trail. */
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ACTIVE_KEY = 'hikingapp:active-route';

type Listener = () => void;

/**
 * The user's imported routes, and which one (if any) is shown on the map.
 *
 * Only one route is shown at a time: it keeps the map uncluttered for
 * beginners, and later the off-route alert needs one clear "this is the trail
 * I'm on" to compare against.
 */
export class Routes {
  private routes: SavedRoute[] = [];
  private activeId: string | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly store: RouteStore) {}

  async init(): Promise<void> {
    this.routes = await this.store.list();
    const saved = loadActiveId();
    this.activeId = this.routes.some((r) => r.id === saved) ? saved : null;
    this.emit();
  }

  get all(): readonly SavedRoute[] {
    return this.routes;
  }

  get active(): SavedRoute | null {
    return this.routes.find((r) => r.id === this.activeId) ?? null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Reads, saves and shows a GPX file. Throws GpxError with a user-facing message. */
  async importFile(file: File): Promise<SavedRoute> {
    if (file.size > MAX_FILE_BYTES) {
      throw new GpxError('This file is too big to be a trail. Please choose a GPX file.');
    }
    const route = routeFromGpx(parseGpx(await file.text()), file.name, crypto.randomUUID(), Date.now());
    await this.store.save(route);
    this.routes = [route, ...this.routes];
    this.setActive(route.id);
    return route;
  }

  /** Adds routes from a backup, skipping any already on this phone. Returns how many were added. */
  async restore(saved: readonly SavedRoute[]): Promise<number> {
    const missing = saved.filter((route) => !this.routes.some((r) => r.id === route.id));
    for (const route of missing) await this.store.save(route);
    this.routes = await this.store.list();
    this.emit();
    return missing.length;
  }

  show(id: string): void {
    this.setActive(id);
  }

  hide(): void {
    this.setActive(null);
  }

  async remove(id: string): Promise<void> {
    await this.store.remove(id);
    this.routes = this.routes.filter((r) => r.id !== id);
    if (this.activeId === id) this.setActive(null);
    else this.emit();
  }

  private setActive(id: string | null): void {
    this.activeId = id;
    saveActiveId(id);
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/** Turns a parsed file into a route record. Pure, so it's easy to test. */
export function routeFromGpx(gpx: ParsedGpx, fileName: string, id: string, importedAt: number): SavedRoute {
  const points = [...gpx.lines.flat(), ...gpx.waypoints.map((w) => w.position)];
  return {
    id,
    // Many exporters leave the name blank, so fall back to the file name.
    name: gpx.name ?? (fileName.replace(/\.gpx$/i, '').trim() || 'Imported route'),
    lines: gpx.lines,
    waypoints: gpx.waypoints,
    bounds: boundsOfPoints(points)!, // parseGpx guarantees at least one point.
    lengthMeters: gpx.lines.reduce((sum, line) => sum + lineLengthMeters(line), 0),
    importedAt,
  };
}

// The active route is a small preference, so localStorage is enough; every
// access is guarded because storage can be blocked (e.g. Private Browsing).
function loadActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function saveActiveId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Not critical: the route just won't be re-shown after a restart.
  }
}
