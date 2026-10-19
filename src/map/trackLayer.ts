import type * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import type { LonLat } from './geo';

const SOURCE_ID = 'recorded-track';
/** Drawn above an imported route but below the blue dot. */
const BELOW_LAYER = 'user-location-accuracy';
/** Orange: "where I've been", distinct from the purple planned route and red-brown trails. */
const TRACK_COLOR = '#ef6c00';

/** Draws the hike being recorded, one line per segment, updated live. */
export class TrackLayer {
  private data: GeoJSON.Feature<GeoJSON.MultiLineString> = toFeature([]);

  constructor(private readonly map: maplibregl.Map) {
    if (map.isStyleLoaded()) this.addLayers();
    map.on('style.load', () => this.addLayers());
  }

  show(segments: readonly LonLat[][]): void {
    this.data = toFeature(segments);
    this.map.getSource<GeoJSONSource>(SOURCE_ID)?.setData(this.data);
  }

  private addLayers(): void {
    if (this.map.getSource(SOURCE_ID)) return;
    const before = this.map.getLayer(BELOW_LAYER) ? BELOW_LAYER : undefined;

    this.map.addSource(SOURCE_ID, { type: 'geojson', data: this.data });
    this.map.addLayer(
      {
        id: 'track-casing',
        type: 'line',
        source: SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 16, 10],
        },
      },
      before,
    );
    this.map.addLayer(
      {
        id: 'track-line',
        type: 'line',
        source: SOURCE_ID,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': TRACK_COLOR,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 6],
        },
      },
      before,
    );
  }
}

/** Segments stay separate lines in one feature, so gaps aren't joined up. */
function toFeature(segments: readonly LonLat[][]): GeoJSON.Feature<GeoJSON.MultiLineString> {
  return {
    type: 'Feature',
    geometry: { type: 'MultiLineString', coordinates: segments.map((s) => [...s]) },
    properties: {},
  };
}
