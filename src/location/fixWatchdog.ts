interface FixWatchdogOptions {
  /** After this long without a fix, quietly ask for a fresh one. */
  recheckAfterMs: number;
  /** After this long without a fix, tell the user the position may be out of date. */
  staleAfterMs: number;
  /** Ask the location source for a fresh reading (e.g. restart the GPS watch). */
  onRecheck(): void;
  onStale(): void;
}

/**
 * Decides when "no new GPS readings" really means GPS has been lost.
 *
 * A gap in readings is often harmless: iOS sends fewer updates while you're
 * standing still, and can leave the location watch stalled after an
 * interruption (a file picker, a notification). So a quiet period first
 * triggers a recheck, and only if that doesn't produce a fix either is the
 * position marked as stale. Time is passed in, so this is easy to test.
 */
export class FixWatchdog {
  private lastFixAt: number | null = null;
  private rechecked = false;
  private stale = false;

  constructor(private readonly options: FixWatchdogOptions) {}

  fixReceived(now: number): void {
    this.lastFixAt = now;
    this.rechecked = false;
    this.stale = false;
  }

  /** Call regularly (every few seconds). */
  tick(now: number): void {
    if (this.lastFixAt === null || this.stale) return; // Nothing to watch yet, or already reported.
    const quietMs = now - this.lastFixAt;

    if (quietMs >= this.options.staleAfterMs) {
      this.stale = true;
      this.options.onStale();
    } else if (quietMs >= this.options.recheckAfterMs && !this.rechecked) {
      this.rechecked = true;
      this.options.onRecheck();
    }
  }
}
