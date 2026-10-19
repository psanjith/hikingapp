import type { LocationFix, LocationSource } from '../location/types';
import type { LonLat } from '../map/geo';
import type { HikeStore } from './hikeStore';
import { filterFix, type FilterDecision, type FilterPoint } from './trackFilter';
import type { Hike, HikePoint } from './types';

export type RecorderState = 'idle' | 'recording' | 'paused';

type SkipReason = Extract<FilterDecision, { action: 'skip' }>['reason'];

/** What the jitter filter did with this session's GPS readings (for the GPS details screen). */
export type FilterStats = { kept: number } & Record<SkipReason, number>;

const emptyStats = (): FilterStats => ({ kept: 0, inaccurate: 0, 'too-close': 0, 'out-of-order': 0 });

type Listener = () => void;

/**
 * Records a hike: start → (pause ⇄ resume)* → finish.
 *
 * - While recording, each GPS fix goes through the jitter filter; kept points
 *   are saved immediately (crash-safe) and added to the live track.
 * - Pausing only stops adding points. The map and blue dot carry on as normal.
 * - Resuming starts a new track segment, so the pause isn't drawn (or counted)
 *   as a straight line from where you stopped to where you started again.
 * - If the app is killed mid-hike, restore() brings the hike back, paused.
 *
 * It depends only on the LocationSource and HikeStore interfaces, so it runs
 * unchanged in tests (fake GPS, in-memory store) and, later, in a native app.
 */
export class Recorder {
  private hike: Hike | null = null;
  private lines: LonLat[][] = [];
  /** Last kept point of the current segment; null right after start/resume. */
  private lastKept: FilterPoint | null = null;
  private segment = 0;
  private segmentHasPoints = false;
  private stats = emptyStats();
  private stopListening: (() => void) | null = null;
  /** Saves run one after another, in the order points arrived. */
  private writes: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<Listener>();
  private readonly errorListeners = new Set<(error: unknown) => void>();

  constructor(
    private readonly store: HikeStore,
    private readonly location: LocationSource,
    private readonly now: () => number = Date.now,
  ) {}

  get state(): RecorderState {
    if (!this.hike) return 'idle';
    return this.hike.status === 'recording' ? 'recording' : 'paused';
  }

  get current(): Readonly<Hike> | null {
    return this.hike;
  }

  /** The recorded track so far, one line per segment. */
  get track(): readonly LonLat[][] {
    return this.lines;
  }

  /** Whether the current segment is still waiting for its first good GPS reading. */
  get waitingForGps(): boolean {
    return this.state === 'recording' && !this.lastKept;
  }

  get filterStats(): Readonly<FilterStats> {
    return this.stats;
  }

  /** Time spent recording, not counting pauses. */
  elapsedMs(): number {
    if (!this.hike) return 0;
    const running = this.hike.activeSince === null ? 0 : this.now() - this.hike.activeSince;
    return this.hike.activeMs + Math.max(0, running);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Called if saving to the phone fails (e.g. storage full). */
  onSaveError(listener: (error: unknown) => void): void {
    this.errorListeners.add(listener);
  }

  /**
   * Brings back a hike that was still in progress when the app closed (crash,
   * dead battery, iOS killing the app). It comes back paused: we can't know
   * where the hiker went in between, so they choose when to carry on.
   */
  async restore(): Promise<Readonly<Hike> | null> {
    if (this.hike) return null;
    const hike = await this.store.findUnfinished();
    if (!hike) return null;

    const points = await this.store.points(hike.id);
    this.lines = [];
    for (const p of points) (this.lines[p.segment] ??= []).push([p.lon, p.lat]);
    this.lines = this.lines.filter(Boolean); // In case a segment number was skipped.
    this.segment = Math.max(0, this.lines.length - 1);
    this.segmentHasPoints = points.length > 0;
    this.lastKept = null;
    this.stats = emptyStats();

    // Count time up to the last saved point; after that, we don't know.
    if (hike.activeSince !== null) {
      hike.activeMs += Math.max(0, (hike.lastPointAt ?? hike.activeSince) - hike.activeSince);
      hike.activeSince = null;
    }
    hike.status = 'paused';
    this.hike = hike;
    this.save(() => this.store.update({ ...hike }));
    this.emit();
    return hike;
  }

  async start(name: string): Promise<void> {
    if (this.hike) return;
    const now = this.now();
    const hike: Hike = {
      id: crypto.randomUUID(),
      name,
      status: 'recording',
      startedAt: now,
      endedAt: null,
      distanceMeters: 0,
      pointCount: 0,
      segmentCount: 0,
      activeMs: 0,
      activeSince: now,
      lastPointAt: null,
    };
    await this.store.create(hike);
    this.hike = hike;
    this.lines = [];
    this.segment = 0;
    this.segmentHasPoints = false;
    this.lastKept = null;
    this.stats = emptyStats();
    this.listen();
    this.emit();
  }

  pause(): void {
    const hike = this.hike;
    if (!hike || hike.status !== 'recording') return;
    hike.activeMs = this.elapsedMs();
    hike.activeSince = null;
    hike.status = 'paused';
    this.unlisten();
    this.save(() => this.store.update({ ...hike }));
    this.emit();
  }

  resume(): void {
    const hike = this.hike;
    if (!hike || hike.status !== 'paused') return;
    hike.status = 'recording';
    hike.activeSince = this.now();
    this.startNewSegment();
    this.listen();
    this.save(() => this.store.update({ ...hike }));
    this.emit();
  }

  /**
   * Ends the hike and saves it. A hike with fewer than two points has no
   * track to show, so it's deleted instead and null is returned.
   */
  async finish(): Promise<Readonly<Hike> | null> {
    const hike = this.hike;
    if (!hike) return null;
    hike.activeMs = this.elapsedMs();
    hike.activeSince = null;
    hike.status = 'finished';
    hike.endedAt = this.now();
    this.unlisten();

    await this.writes; // Let any pending point saves land first.
    const keep = hike.pointCount >= 2;
    if (keep) await this.store.update({ ...hike });
    else await this.store.remove(hike.id);

    this.hike = null;
    this.lines = [];
    this.lastKept = null;
    this.emit();
    return keep ? hike : null;
  }

  private handleFix(fix: LocationFix): void {
    const hike = this.hike;
    if (!hike || hike.status !== 'recording') return;

    const candidate: FilterPoint = { lat: fix.lat, lon: fix.lon, time: fix.timestamp, accuracy: fix.accuracy };
    const decision = filterFix(this.lastKept, candidate);
    if (decision.action === 'skip') {
      this.stats[decision.reason] += 1;
      return;
    }
    this.stats.kept += 1;
    if (decision.newSegment) this.startNewSegment();

    const point: HikePoint = {
      hikeId: hike.id,
      seq: hike.pointCount,
      segment: this.segment,
      lat: fix.lat,
      lon: fix.lon,
      time: fix.timestamp,
      accuracy: fix.accuracy,
      altitude: fix.altitude,
    };

    (this.lines[this.segment] ??= []).push([fix.lon, fix.lat]);
    this.segmentHasPoints = true;
    this.lastKept = candidate;
    hike.pointCount += 1;
    hike.distanceMeters += decision.distance;
    hike.segmentCount = this.lines.length;
    // Our own clock, like activeSince, so crash recovery compares like with like.
    hike.lastPointAt = this.now();

    // Snapshot now: the hike object keeps changing while the save is queued.
    const snapshot = { ...hike };
    this.save(() => this.store.appendPoint(snapshot, point));
    this.emit();
  }

  private startNewSegment(): void {
    if (this.segmentHasPoints) {
      this.segment += 1;
      this.segmentHasPoints = false;
    }
    this.lastKept = null;
  }

  private listen(): void {
    this.stopListening ??= this.location.subscribe({ onFix: (fix) => this.handleFix(fix) });
  }

  private unlisten(): void {
    this.stopListening?.();
    this.stopListening = null;
  }

  private save(write: () => Promise<void>): void {
    this.writes = this.writes.then(write).catch((error: unknown) => {
      for (const listener of this.errorListeners) listener(error);
    });
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
