import type { MapView } from '../map/createMap';

const KEY = 'hikingapp:last-position';

/**
 * Remembers where the user last was, so the map reopens there instead of at
 * a default location. This is a convenience only, so localStorage is fine;
 * every access is guarded because storage can be unavailable (e.g. private
 * browsing) and that must never stop the app from starting.
 */
export function loadLastView(): MapView | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { lon, lat } = JSON.parse(raw) as { lon: number; lat: number };
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    return { center: [lon, lat], zoom: 13 };
  } catch {
    return null;
  }
}

export function saveLastPosition(lon: number, lat: number): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ lon, lat }));
  } catch {
    // Storage full or blocked; not worth bothering the user about.
  }
}
