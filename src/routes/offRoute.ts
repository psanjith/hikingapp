import { BACK_ON_ROUTE_M, OFF_ROUTE_CONFIRM_MS, OFF_ROUTE_M } from '../config';
import type { LonLat } from '../map/geo';

const METERS_PER_DEGREE = 111_195;

/**
 * How far a position is from the nearest point on a route, and where that
 * nearest point is (to show the way back).
 *
 * Uses a flat projection centred on the hiker: within a few kilometres this is
 * accurate to well under a metre, and it makes "nearest point on a line
 * segment" simple geometry.
 */
export function distanceToRoute(
  [lon, lat]: LonLat,
  lines: readonly LonLat[][],
): { meters: number; nearest: LonLat } | null {
  const xScale = METERS_PER_DEGREE * Math.cos((lat * Math.PI) / 180);
  const toXY = ([pLon, pLat]: LonLat): [number, number] => [(pLon - lon) * xScale, (pLat - lat) * METERS_PER_DEGREE];

  let best: { meters: number; nearest: LonLat } | null = null;
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const a = toXY(line[i]);
      const b = i + 1 < line.length ? toXY(line[i + 1]) : a;
      // Project the hiker (the origin) onto segment a→b, clamped to its ends.
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const lengthSq = dx * dx + dy * dy;
      const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / lengthSq));
      const [x, y] = [a[0] + t * dx, a[1] + t * dy];
      const meters = Math.hypot(x, y);
      if (!best || meters < best.meters) {
        best = { meters, nearest: [lon + x / xScale, lat + y / METERS_PER_DEGREE] };
      }
    }
  }
  return best;
}

export type OffRouteEvent = 'went-off' | 'back-on' | null;

/**
 * Decides when to tell a hiker they've left the route, without crying wolf.
 *
 * - Only arms once the hiker has actually been on the route, so nobody gets
 *   alerted while still at home or driving to the trailhead.
 * - Gives the GPS the benefit of the doubt (subtracts its error margin).
 * - Must stay off-route for 15 s before alerting, so one wild reading or a
 *   short detour around a fallen tree doesn't trigger it.
 * - Needs to come well back (30 m) before "back on route", so hovering near
 *   the 50 m line doesn't flip the alert on and off.
 */
export class OffRouteMonitor {
  private state: 'unarmed' | 'on' | 'leaving' | 'off' = 'unarmed';
  private leavingSince = 0;

  get isOff(): boolean {
    return this.state === 'off';
  }

  /** Start over, e.g. when a different route is shown. */
  reset(): void {
    this.state = 'unarmed';
  }

  update(meters: number, accuracy: number, now: number): OffRouteEvent {
    if (accuracy > OFF_ROUTE_M) return null; // Too vague to judge either way.
    const distance = Math.max(0, meters - accuracy);

    switch (this.state) {
      case 'unarmed':
        if (distance <= BACK_ON_ROUTE_M) this.state = 'on';
        return null;
      case 'on':
        if (distance > OFF_ROUTE_M) {
          this.state = 'leaving';
          this.leavingSince = now;
        }
        return null;
      case 'leaving':
        if (distance <= OFF_ROUTE_M) this.state = 'on';
        else if (now - this.leavingSince >= OFF_ROUTE_CONFIRM_MS) {
          this.state = 'off';
          return 'went-off';
        }
        return null;
      case 'off':
        if (distance <= BACK_ON_ROUTE_M) {
          this.state = 'on';
          return 'back-on';
        }
        return null;
    }
  }
}
