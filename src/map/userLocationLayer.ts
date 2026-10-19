import type * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import type { LocationFix } from '../location/types';
import { metersPerPixel } from './geo';

const SOURCE_ID = 'user-location';
const MAX_ZOOM = 24;

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Draws the "blue dot": the user's position plus a translucent circle showing
 * how accurate the GPS reading is.
 *
 * It's drawn as map layers (not an HTML marker) so it moves in perfect sync
 * with the map while panning and zooming, and so the accuracy circle can be
 * sized in real-world metres.
 */
export class UserLocationLayer {
  private data: GeoJSON.FeatureCollection = EMPTY;

  constructor(private readonly map: maplibregl.Map) {
    // 'style.load' fires on first load and again if the map style is ever
    // swapped (e.g. switching to an offline map), which wipes custom layers.
    if (map.isStyleLoaded()) this.addLayers();
    map.on('style.load', () => this.addLayers());
  }

  /** Move the dot. `stale` greys it out when GPS readings have stopped arriving. */
  update(fix: LocationFix, stale = false): void {
    // A circle's radius in MapLibre is in screen pixels, but GPS accuracy is in
    // metres. We compute the pixel radius at zoom 0, and the layer doubles it
    // per zoom level (see the 'exponential' interpolation below).
    const accuracyPxAtZoom0 = fix.accuracy / metersPerPixel(fix.lat, 0);

    this.data = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [fix.lon, fix.lat] },
          properties: { accuracyPxAtZoom0, stale },
        },
      ],
    };
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
