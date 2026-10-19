import type { LocationErrorKind, LocationFix } from './types';

/**
 * A running log of what the GPS has been doing this session: how many
 * readings arrived, when the last one was, retries and errors. Shown on the
 * "GPS details" screen, so problems on a real hike can be diagnosed from a
 * screenshot instead of guesswork.
 */
export class GpsDiagnostics {
  fixCount = 0;
  lastFix: { at: number; accuracy: number } | null = null;
  rechecks = 0;
  backgrounded = 0;
  readonly errors = new Map<LocationErrorKind, number>();
  lastError: { kind: LocationErrorKind; at: number } | null = null;

  fix(fix: LocationFix, now: number): void {
    this.fixCount += 1;
    this.lastFix = { at: now, accuracy: fix.accuracy };
  }

  error(kind: LocationErrorKind, now: number): void {
    this.errors.set(kind, (this.errors.get(kind) ?? 0) + 1);
    this.lastError = { kind, at: now };
  }
}
