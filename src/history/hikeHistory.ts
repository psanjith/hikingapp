import { writeGpx } from '../gpx/writeGpx';
import type { LonLat } from '../map/geo';
import type { HikeStore } from '../recording/hikeStore';
import { groupSegments, trackPreview } from '../recording/trackPreview';
import type { Hike, HikePoint } from '../recording/types';
import type { RouteStore } from '../routes/routeStore';
import type { Routes } from '../routes/routes';
import { decodeBackup, encodeBackup } from './backup';

const LAST_BACKUP_KEY = 'hikingapp:last-backup';

type Listener = () => void;

export interface RestoreResult {
  added: number;
  alreadyHere: number;
  routesAdded: number;
}

/**
 * The saved-hikes record: listing, viewing, renaming and deleting hikes,
 * exporting one as GPX, and backing up / restoring all of them.
 *
 * Hikes live only on this phone (there's no account or server), so the backup
 * file is what makes the record durable: it can be kept in iCloud Drive and
 * restored after the app's data is cleared or on a new phone.
 */
export class HikeHistory {
  private hikes: Hike[] = [];
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly store: HikeStore,
    private readonly routeStore: RouteStore,
    private readonly routes: Routes,
  ) {}

  /** Reloads the list from storage (after a hike finishes, a restore, etc.). */
  async refresh(): Promise<void> {
    const hikes = await this.store.listFinished();
    // Hikes recorded before thumbnails existed get one now, once.
    for (const hike of hikes.filter((h) => !h.preview)) {
      hike.preview = trackPreview(groupSegments(await this.store.points(hike.id)));
      await this.store.update(hike);
    }
    this.hikes = hikes;
    this.emit();
  }

  get all(): readonly Hike[] {
    return this.hikes;
  }

  get totals(): { count: number; distanceMeters: number; activeMs: number } {
    return {
      count: this.hikes.length,
      distanceMeters: this.hikes.reduce((sum, h) => sum + h.distanceMeters, 0),
      activeMs: this.hikes.reduce((sum, h) => sum + h.activeMs, 0),
    };
  }

  find(id: string): Hike | undefined {
    return this.hikes.find((h) => h.id === id);
  }

  async track(id: string): Promise<LonLat[][]> {
    return groupSegments(await this.store.points(id));
  }

  async rename(id: string, name: string): Promise<void> {
    const hike = this.find(id);
    if (!hike || !name.trim()) return;
    hike.name = name.trim();
    await this.store.update(hike);
    this.emit();
  }

  async remove(id: string): Promise<void> {
    await this.store.remove(id);
    this.hikes = this.hikes.filter((h) => h.id !== id);
    this.emit();
  }

  /** One hike as a GPX file, for Strava, Gaia, AllTrails, or safekeeping. */
  async gpxFile(id: string): Promise<File> {
    const hike = this.find(id);
    if (!hike) throw new Error(`No hike ${id}`);
    // A Map keeps segments in the order they were first seen, i.e. recording order.
    const bySegment = new Map<number, HikePoint[]>();
    for (const p of await this.store.points(id)) {
      const segment = bySegment.get(p.segment) ?? [];
      segment.push(p);
      bySegment.set(p.segment, segment);
    }
    const xml = writeGpx({ name: hike.name, time: hike.startedAt, segments: [...bySegment.values()] });
    return new File([xml], `${fileStem(hike)}.gpx`, { type: 'application/gpx+xml' });
  }

  /** Every finished hike and imported route, in one file. */
  async backupFile(): Promise<File> {
    const hikes = await Promise.all(
      this.hikes.map(async (hike) => ({ hike, points: await this.store.points(hike.id) })),
    );
    const now = Date.now();
    const json = encodeBackup({ hikes, routes: [...(await this.routeStore.list())] }, now);
    return new File([json], `hikes-backup-${localDate(now)}.json`, { type: 'application/json' });
  }

  /** Call once the backup file has actually been handed to the user. */
  markBackedUp(): void {
    try {
      localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()));
    } catch {
      // Only affects the "not backed up" reminder.
    }
    this.emit();
  }

  get lastBackupAt(): number | null {
    try {
      const value = Number(localStorage.getItem(LAST_BACKUP_KEY));
      return value > 0 ? value : null;
    } catch {
      return null;
    }
  }

  /** Hikes finished since the last backup: what would be lost if the phone's data were cleared. */
  get notBackedUp(): number {
    const since = this.lastBackupAt ?? 0;
    return this.hikes.filter((h) => (h.endedAt ?? h.startedAt) > since).length;
  }

  /**
   * Adds the hikes and routes from a backup file. Hikes already on this phone
   * are left alone, so restoring the same file twice is harmless.
   * Throws BackupError (with a user-facing message) for a bad file.
   */
  async restore(file: File): Promise<RestoreResult> {
    const contents = decodeBackup(await file.text());
    const existing = new Set((await this.store.listFinished()).map((h) => h.id));
    let added = 0;
    for (const { hike, points } of contents.hikes) {
      if (existing.has(hike.id)) continue;
      await this.store.importHike(hike, points);
      added += 1;
    }
    const routesAdded = await this.routes.restore(contents.routes);
    await this.refresh();
    return { added, alreadyHere: contents.hikes.length - added, routesAdded };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/** "2026-10-18" in the phone's own time zone (toISOString would use UTC). */
function localDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** e.g. "hike-2026-10-18-quarry-rock", or just "hike-2026-10-18" for an unrenamed hike. */
function fileStem(hike: Hike): string {
  // Default names ("Morning hike", or "Hike on Sat, Oct 18" from early versions) add nothing.
  const name = /^(hike on |(morning|afternoon|evening) hike$)/i.test(hike.name) ? '' : hike.name;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `hike-${localDate(hike.startedAt)}${slug ? `-${slug}` : ''}`;
}
