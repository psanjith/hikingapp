import type * as maplibregl from 'maplibre-gl';
import type { LonLatBounds } from './geo';

/** Zooms the map so a box (a route, a past hike) fills the screen, clear of the on-screen controls. */
export function fitMapTo(map: maplibregl.Map, [west, south, east, north]: LonLatBounds): void {
  const bottomUi = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bottom-ui')) || 0;
  map.fitBounds(
    [
      [west, south],
      [east, north],
    ],
    { padding: { top: 90, bottom: 40 + bottomUi, left: 40, right: 90 }, maxZoom: 15, duration: 800 },
  );
}
