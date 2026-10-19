import type * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import type { LonLat } from './geo';

/** Drawn above an imported route but below the blue dot. */
const BELOW_LAYER = 'user-location-accuracy';

/**
 * Draws a hike's track, one line per segment: the hike being recorded (live)
 * or a past hike opened from history. Each use gets its own id and colour.
 */
export class TrackLayer {
  private data: GeoJSON.Feature<GeoJSON.MultiLineString> = toFeature([]);

  constructor(
    private readonly map: maplibregl.Map,
    private readonly id: string,
    private readonly color: string,
  ) {
    if (map.isStyleLoaded()) this.addLayers();
    map.on('style.load', () => this.addLayers());
  }

  show(segments: readonly LonLat[][]): void {
    this.data = toFeature(segments);
    this.map.getSource<GeoJSONSource>(this.id)?.setData(this.data);
  }

  private addLayers(): void {
    if (this.map.getSource(this.id)) return;
    const before = this.map.getLayer(BELOW_LAYER) ? BELOW_LAYER : undefined;

    this.map.addSource(this.id, { type: 'geojson', data: this.data });
    this.map.addLayer(
      {
        id: `${this.id}-casing`,
        type: 'line',
        source: this.id,
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
        id: `${this.id}-line`,
        type: 'line',
        source: this.id,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': this.color,
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
