import type * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import type { LocationFix } from '../location/types';
import { metersPerPixel } from './geo';

const SOURCE_ID = 'user-location';
const MAX_ZOOM = 24;
const CONE_IMAGE = 'user-heading-cone';
/** Redraw the cone at most this often, and only for turns of at least this many degrees. */
const HEADING_REDRAW_MS = 100;
const HEADING_REDRAW_DEG = 2;

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Draws the "blue dot": the user's position, a translucent circle showing how
 * accurate the GPS reading is, and a cone showing which way the phone points.
 *
 * It's drawn as map layers (not an HTML marker) so it moves in perfect sync
 * with the map while panning and zooming, and so the accuracy circle can be
 * sized in real-world metres.
 */
export class UserLocationLayer {
  private data: GeoJSON.FeatureCollection = EMPTY;
  private fix: LocationFix | null = null;
  private stale = false;
  /** Degrees clockwise from north, or null to hide the cone. */
  private heading: number | null = null;
  private headingDrawnAt = 0;
  private headingDrawn: number | null = null;

  constructor(private readonly map: maplibregl.Map) {
    // 'style.load' fires on first load and again if the map style is ever
    // swapped (e.g. switching to an offline map), which wipes custom layers.
    if (map.isStyleLoaded()) this.addLayers();
    map.on('style.load', () => this.addLayers());
  }

  /** Move the dot. `stale` greys it out when GPS readings have stopped arriving. */
  update(fix: LocationFix, stale = false): void {
    this.fix = fix;
    this.stale = stale;
    this.render();
  }

  /** Point the cone (degrees clockwise from north), or hide it with null. */
  setHeading(heading: number | null): void {
    this.heading = heading;
    // Compasses report many times a second; redrawing that often is wasted work.
    const turned =
      heading === null || this.headingDrawn === null
        ? heading !== this.headingDrawn
        : Math.abs(((heading - this.headingDrawn + 540) % 360) - 180) >= HEADING_REDRAW_DEG;
    if (turned && Date.now() - this.headingDrawnAt >= HEADING_REDRAW_MS) this.render();
  }

  private render(): void {
    const fix = this.fix;
    if (!fix) return;
    // A circle's radius in MapLibre is in screen pixels, but GPS accuracy is in
    // metres. We compute the pixel radius at zoom 0, and the layer doubles it
    // per zoom level (see the 'exponential' interpolation below).
    const accuracyPxAtZoom0 = fix.accuracy / metersPerPixel(fix.lat, 0);
    // No cone on a stale position: pointing from somewhere you may not be is misleading.
    const heading = this.stale ? null : this.heading;

    this.data = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [fix.lon, fix.lat] },
          properties: { accuracyPxAtZoom0, stale: this.stale, heading: heading ?? -1 },
        },
      ],
    };
    this.headingDrawn = heading;
    this.headingDrawnAt = Date.now();
    this.source()?.setData(this.data);
  }

  private source(): GeoJSONSource | undefined {
    return this.map.getSource<GeoJSONSource>(SOURCE_ID);
  }

  private addLayers(): void {
    if (this.source()) return;

    this.map.addSource(SOURCE_ID, { type: 'geojson', data: this.data });

    this.map.addLayer({
      id: 'user-location-accuracy',
      type: 'circle',
      source: SOURCE_ID,
      paint: {
        'circle-radius': [
          'interpolate',
          ['exponential', 2],
          ['zoom'],
          0,
          ['get', 'accuracyPxAtZoom0'],
          MAX_ZOOM,
          ['*', ['get', 'accuracyPxAtZoom0'], 2 ** MAX_ZOOM],
        ],
        'circle-color': '#1a73e8',
        'circle-opacity': 0.12,
        'circle-stroke-color': '#1a73e8',
        'circle-stroke-opacity': 0.35,
        'circle-stroke-width': 1,
        'circle-pitch-alignment': 'map',
      },
    });

    // The direction cone sits under the dot. The map always has north up, so
    // rotating the icon by the heading points it the right way on the ground.
    if (!this.map.hasImage(CONE_IMAGE)) this.map.addImage(CONE_IMAGE, drawCone(), { pixelRatio: 2 });
    this.map.addLayer({
      id: 'user-location-heading',
      type: 'symbol',
      source: SOURCE_ID,
      filter: ['>=', ['get', 'heading'], 0],
      layout: {
        'icon-image': CONE_IMAGE,
        'icon-rotate': ['get', 'heading'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });

    this.map.addLayer({
      id: 'user-location-dot',
      type: 'circle',
      source: SOURCE_ID,
      paint: {
        'circle-radius': 8,
        'circle-color': ['case', ['get', 'stale'], '#8a8f98', '#1a73e8'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 3,
      },
    });
  }
}

/**
 * A soft blue wedge pointing up from the centre of a square image (like the
 * "beam" in Google and Apple Maps), fading out with distance.
 */
function drawCone(): ImageData {
  const size = 200; // Device pixels; shown at half size (pixelRatio 2), so a 50 px beam.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const centre = size / 2;
  const spread = (35 * Math.PI) / 180; // ±35° either side of straight ahead.

  const gradient = ctx.createRadialGradient(centre, centre, 0, centre, centre, centre);
  // Strong near the dot so it reads in bright sunlight, fading towards the tip.
  gradient.addColorStop(0, 'rgba(26, 115, 232, 0.7)');
  gradient.addColorStop(0.6, 'rgba(26, 115, 232, 0.35)');
  gradient.addColorStop(1, 'rgba(26, 115, 232, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(centre, centre);
  // Canvas angles start at "east" and go clockwise; straight up is −90°.
  ctx.arc(centre, centre, centre, -Math.PI / 2 - spread, -Math.PI / 2 + spread);
  ctx.closePath();
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}
