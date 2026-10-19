import type * as maplibregl from 'maplibre-gl';
import { LOCATE_ZOOM } from '../config';
import type { LocationFix } from '../location/types';

/**
 * Keeps the map centred on the user, until they pan away to look around.
 *
 * Following starts on: the first GPS fix, and whenever the user taps the
 * "centre on me" button. It stops as soon as the user drags the map, so the
 * map never fights them while they're exploring.
 */
export class FollowUser {
  private following = true;
  private hasCentredOnce = false;
  private readonly listeners = new Set<(following: boolean) => void>();

  constructor(private readonly map: maplibregl.Map) {
    // 'dragstart' only fires for user gestures, never for our own easeTo().
    map.on('dragstart', () => this.setFollowing(false));
  }

  get isFollowing(): boolean {
    return this.following;
  }

  onChange(listener: (following: boolean) => void): void {
    this.listeners.add(listener);
  }

  /** Called for every GPS fix. */
  handleFix(fix: LocationFix): void {
    if (!this.following) return;

    const center: [number, number] = [fix.lon, fix.lat];
    if (!this.hasCentredOnce) {
      this.hasCentredOnce = true;
      this.map.flyTo({ center, zoom: Math.max(this.map.getZoom(), LOCATE_ZOOM) });
    } else {
      this.map.easeTo({ center, duration: 600 });
    }
  }

  /** "Centre on me": jump to the latest fix (if any) and resume following. */
  recenter(fix: LocationFix | null): void {
    this.setFollowing(true);
    if (!fix) return;
    this.hasCentredOnce = true;
    this.map.easeTo({
      center: [fix.lon, fix.lat],
      zoom: Math.max(this.map.getZoom(), LOCATE_ZOOM),
      duration: 800,
    });
  }

  private setFollowing(following: boolean): void {
    if (following === this.following) return;
    this.following = following;
    for (const listener of this.listeners) listener(following);
  }
}
