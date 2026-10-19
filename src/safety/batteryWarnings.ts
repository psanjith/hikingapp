import type { BatteryStatus } from '../device/battery';

/** Warn as the battery drops past each of these levels (while not charging). */
const THRESHOLDS = [0.3, 0.2, 0.1];

/**
 * Decides when to warn about a low battery: once at 30%, 20% and 10%, never
 * twice for the same level, and starting over once the phone is charged.
 * On a hike a dead phone means no map and no location, so this matters.
 */
export class BatteryWarnings {
  private warned = new Set<number>();

  /** Returns the level to warn about (e.g. 0.2), or null. */
  check({ level, charging }: BatteryStatus): number | null {
    if (charging) {
      this.warned.clear();
      return null;
    }
    // Lowest threshold already crossed that we haven't warned about yet.
    const crossed = THRESHOLDS.filter((t) => level <= t && !this.warned.has(t));
    if (crossed.length === 0) return null;
    // If it dropped past several at once (e.g. app opened at 8%), warn once, for the lowest.
    for (const t of crossed) this.warned.add(t);
    return Math.min(...crossed);
  }
}
