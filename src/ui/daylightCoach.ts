import type { LocationSource } from '../location/types';
import type { Recorder } from '../recording/recorder';
import type { Routes } from '../routes/routes';
import type { SavedRoute } from '../routes/types';
import type { PathPoint } from '../safety/hikingTime';
import { sunsetTime } from '../safety/sun';
import { planTurnaround } from '../safety/turnaround';
import { describeTurnaround, TurnaroundAlerts, type TurnaroundMessage } from '../safety/turnaroundText';

/** Recalculate at most this often on GPS readings, and at least this often while standing still. */
const MIN_INTERVAL_MS = 5_000;
const TICK_MS = 15_000;

interface DaylightDisplay {
  setDaylight(message: TurnaroundMessage | null): void;
}

/**
 * Keeps the hiker ahead of the dark during a hike: works out the turnaround
 * plan from the hike so far (and the loaded route, if they're on it), shows
 * it in the hike bar, and raises a banner when it's time to think about
 * turning around.
 */
export class DaylightCoach {
  private readonly alerts = new TurnaroundAlerts();
  private readonly bannerText: HTMLElement;
  private lastUpdate = 0;
  private wasIdle = true;

  constructor(
    private readonly recorder: Recorder,
    private readonly routes: Routes,
    private readonly location: LocationSource,
    private readonly display: DaylightDisplay,
    private readonly banner: HTMLElement,
  ) {
    this.bannerText = banner.querySelector('.daylight-banner-text')!;
    banner.querySelector('.daylight-dismiss')!.addEventListener('click', () => (this.banner.hidden = true));

    recorder.subscribe(() => {
      const idle = recorder.state === 'idle';
      if (this.wasIdle && !idle) this.alerts.reset(); // A new (or recovered) hike.
      this.wasIdle = idle;
      this.update(true);
    });
    location.subscribe({ onFix: () => this.update() });
    // Time passes even when the hiker doesn't move.
    window.setInterval(() => this.update(true), TICK_MS);
  }

  private update(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastUpdate < MIN_INTERVAL_MS) return;
    this.lastUpdate = now;

    const fix = this.location.lastFix;
    if (this.recorder.state === 'idle' || !fix) {
      this.display.setDaylight(null);
      this.banner.hidden = true;
      return;
    }
    const sunset = sunsetTime(new Date(now), fix.lat, fix.lon);
    if (sunset === null) {
      this.display.setDaylight(null); // No sunset today (far north in summer).
      return;
    }

    const recorded = this.recorder.path;
    const plan = planTurnaround({
      now,
      sunset,
      // Before the first saved point, the hike is just "here".
      hiked: recorded.length > 0 ? recorded : [{ lon: fix.lon, lat: fix.lat, ele: fix.altitude }],
      hikedMs: this.recorder.elapsedMs(),
      route: routePath(this.routes.active),
    });
    this.display.setDaylight(describeTurnaround(plan, now));

    const alert = this.alerts.check(plan, now);
    if (alert) {
      this.bannerText.textContent = alert;
      this.banner.hidden = false;
      navigator.vibrate?.([300, 150, 300]); // Android only; iPhones don't let websites vibrate.
    }
  }
}

/** A saved route as one path with elevations, for time estimates. */
function routePath(route: SavedRoute | null): PathPoint[] | null {
  if (!route) return null;
  return route.lines.flatMap((line, s) =>
    line.map(([lon, lat], i) => ({ lon, lat, ele: route.elevations?.[s]?.[i] ?? null })),
  );
}
