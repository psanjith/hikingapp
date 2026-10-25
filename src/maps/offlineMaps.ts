import { ScreenWakeLock } from '../device/wakeLock';
import { boundsArea, boundsContain } from '../map/geo';
import { formatBytes } from '../ui/format';
import { loadCatalog } from './catalog';
import { MapDownloadError, type MapFileStore } from './mapFileStore';
import type { TileRouter } from './tileRouter';
import type { Bounds, Catalog, RegionInfo, StoredRegion } from './types';

/** Everything the Maps screen needs to draw one region row. */
export type RegionRow = (
  | { state: 'available'; info: RegionInfo; partialBytes: number; error?: string }
  | { state: 'downloading'; info: RegionInfo; receivedBytes: number }
  | { state: 'downloaded'; stored: StoredRegion; update?: RegionInfo; error?: string }
) & {
  /** The region's area includes the hiker's position (by its bounding box, so near a border both sides count). */
  nearby: boolean;
};

type Listener = () => void;

/**
 * Coordinates offline map regions: what's offered (catalog), what's on the
 * phone (store), what's downloading, and keeping the map's tile router in
 * sync whenever that changes.
 */
export class OfflineMaps {
  private catalog: Catalog | null = null;
  private canSave = true;
  private stored = new Map<string, StoredRegion>();
  private partial = new Map<string, number>();
  private downloads = new Map<string, { receivedBytes: number; abort: AbortController }>();
  private errors = new Map<string, string>();
  private readonly listeners = new Set<Listener>();
  private readonly wakeLock = new ScreenWakeLock();

  constructor(
    private readonly store: MapFileStore,
    private readonly router: TileRouter,
    /** Called after the set of downloaded regions changes, to refresh the map. */
    private readonly onRegionsChanged: () => void,
  ) {}

  async init(): Promise<void> {
    this.canSave = await this.store.canSaveFiles();
    await this.reloadStored();
    this.catalog = await loadCatalog();
    this.configureOnlineSource();
    await this.refreshPartials();
    this.emit();
  }

  get catalogAvailable(): boolean {
    return this.catalog !== null;
  }

  /** Whether this browser lets us store map files at all. */
  get canSaveMaps(): boolean {
    return this.canSave;
  }

  get hasDownloadedRegions(): boolean {
    return this.stored.size > 0;
  }

  get downloadedRegionNames(): string[] {
    return [...this.stored.values()].map((r) => r.name);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * One row per region. With the hiker's position, regions around them come
   * first (smallest first, e.g. Lower Mainland before all of BC), so nobody
   * has to scroll past the whole country to find their area.
   */
  rows(position?: [number, number]): RegionRow[] {
    const rows: RegionRow[] = [];
    const offered = this.catalog?.regions ?? [];
    const near = (bounds: Bounds) => !!position && boundsContain(bounds, [...position, ...position]);

    for (const info of offered) {
      const download = this.downloads.get(info.id);
      const stored = this.stored.get(info.id);
      const error = this.errors.get(info.id);
      const nearby = near(info.bounds);
      if (download) {
        rows.push({ state: 'downloading', info, receivedBytes: download.receivedBytes, nearby });
      } else if (stored) {
        const update = info.version > stored.version ? info : undefined;
        rows.push({ state: 'downloaded', stored, update, error, nearby });
      } else {
        rows.push({ state: 'available', info, partialBytes: this.partial.get(info.id) ?? 0, error, nearby });
      }
    }

    // Regions on the phone that the catalog no longer lists (or the catalog
    // couldn't be loaded offline) must still be shown, so they can be deleted.
    for (const stored of this.stored.values()) {
      if (!offered.some((info) => info.id === stored.id)) {
        rows.push({ state: 'downloaded', stored, nearby: near(stored.bounds) });
      }
    }

    const area = (row: RegionRow) => boundsArea(row.state === 'downloaded' ? row.stored.bounds : row.info.bounds);
    const nearbyFirst = rows.filter((r) => r.nearby).sort((a, b) => area(a) - area(b));
    return [...nearbyFirst, ...rows.filter((r) => !r.nearby)];
  }

  /**
   * Whether an area (e.g. an imported trail) is fully covered by a map on this
   * phone, and if not, the smallest region that would cover it.
   */
  coverageFor(bounds: Bounds): { covered: boolean; suggestion: RegionInfo | null } {
    const covered = [...this.stored.values()].some((r) => boundsContain(r.bounds, bounds));
    const suggestion = covered
      ? null
      : ((this.catalog?.regions ?? [])
          .filter((r) => boundsContain(r.bounds, bounds))
          .sort((a, b) => boundsArea(a.bounds) - boundsArea(b.bounds))[0] ?? null);
    return { covered, suggestion };
  }

  async download(id: string): Promise<void> {
    const info = this.catalog?.regions.find((r) => r.id === id);
    if (!info || this.downloads.has(id)) return;

    const abort = new AbortController();
    this.downloads.set(id, { receivedBytes: this.partial.get(id) ?? 0, abort });
    this.errors.delete(id);
    this.emit();
    await this.wakeLock.acquire();

    try {
      await this.store.download(
        info,
        (receivedBytes) => {
          const entry = this.downloads.get(id);
          if (entry) entry.receivedBytes = receivedBytes;
          this.emit();
        },
        abort.signal,
      );
      await this.reloadStored();
      this.onRegionsChanged();
    } catch (error) {
      const message = describeError(error, info);
      if (message) this.errors.set(id, message);
    } finally {
      this.downloads.delete(id);
      if (this.downloads.size === 0) await this.wakeLock.release();
      await this.refreshPartials();
      this.emit();
    }
  }

  cancel(id: string): void {
    this.downloads.get(id)?.abort.abort();
  }

  async remove(id: string): Promise<void> {
    this.cancel(id);
    await this.store.remove(id);
    this.errors.delete(id);
    await this.reloadStored();
    await this.refreshPartials();
    this.onRegionsChanged();
    this.emit();
  }

  storageSummary() {
    return this.store.storageSummary();
  }

  private async reloadStored(): Promise<void> {
    const regions = await this.store.list();
    this.stored = new Map(regions.map((r) => [r.id, r]));

    const files = await Promise.all(
      regions.map(async (r) => {
        try {
          return { id: r.id, bounds: r.bounds, file: await this.store.openFile(r) };
        } catch {
          return null; // File missing (e.g. storage was cleared); skip it.
        }
      }),
    );
    this.router.setLocalRegions(files.filter((f) => f !== null));
  }

  private async refreshPartials(): Promise<void> {
    const entries = await Promise.all(
      (this.catalog?.regions ?? []).map(async (info) => [info.id, await this.store.partialBytes(info)] as const),
    );
    this.partial = new Map(entries);
  }

  private configureOnlineSource(): void {
    const regions = this.catalog?.regions ?? [];
    this.router.setOnlineSources(
      regions.filter((r) => r.online || r.id === this.catalog?.onlineRegionId), // (older catalogs: one region)
    );
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/** Plain-language explanation for a failed download, or null if nothing to say. */
function describeError(error: unknown, info: RegionInfo): string | null {
  if (!(error instanceof MapDownloadError)) {
    return 'Something went wrong. Please try again.';
  }
  switch (error.kind) {
    case 'cancelled':
      return null;
    case 'insufficient-space': {
      const free = error.space ? formatBytes(Math.max(0, error.space.freeBytes)) : 'not enough';
      return `Not enough space on your phone. This map needs ${formatBytes(info.bytes)}, but only ${free} is available. Free up space (photos, videos, other maps) and try again.`;
    }
    case 'quota':
      return 'Your phone ran out of space during the download. Free up some space and try again.';
    case 'storage':
      return "This browser isn't letting the app save maps. If you're in a Private Browsing tab, open the app in a normal tab (or from your Home Screen) and try again.";
    case 'network':
    case 'incomplete':
      return 'The download was interrupted. Tap Resume to continue from where it stopped.';
  }
}
