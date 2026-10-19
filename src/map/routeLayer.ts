import type * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import type { SavedRoute } from '../routes/types';

const SOURCE_ID = 'route';
/** The blue dot's bottom layer; the route is drawn beneath it so "you" stay on top. */
const BELOW_LAYER = 'user-location-accuracy';

/**
 * Purple, so the imported route stands out from the map's own red-brown trails
 * and from the blue location dot. It's drawn slightly see-through, so the
 * mapped trail underneath (and its name) still shows where the two overlap.
 */
const ROUTE_COLOR = '#7b2cbf';
const START_COLOR = '#2e7d32';
const END_COLOR = '#c62828';

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Draws the active imported route: the line itself, a green start dot, a red
 * finish dot, and the file's named waypoints.
 */
export class RouteLayer {
  private data: GeoJSON.FeatureCollection = EMPTY;

  constructor(private readonly map: maplibregl.Map) {
    if (map.isStyleLoaded()) this.addLayers();
    map.on('style.load', () => this.addLayers());
  }

  show(route: SavedRoute | null): void {
    this.data = route ? toGeoJson(route) : EMPTY;
    this.map.getSource<GeoJSONSource>(SOURCE_ID)?.setData(this.data);
  }

  /** Zoom out or in until the whole route is on screen, clear of the buttons. */
  fitTo(route: SavedRoute): void {
    const [west, south, east, north] = route.bounds;
    this.map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: { top: 90, bottom: 110, left: 40, right: 90 }, maxZoom: 15, duration: 800 },
    );
  }

  private addLayers(): void {
    if (this.map.getSource(SOURCE_ID)) return;
    const before = this.map.getLayer(BELOW_LAYER) ? BELOW_LAYER : undefined;

    this.map.addSource(SOURCE_ID, { type: 'geojson', data: this.data });
    const isLine: maplibregl.FilterSpecification = ['==', ['geometry-type'], 'LineString'];

    this.map.addLayer(
      {
        id: 'route-casing',
        type: 'line',
        source: SOURCE_ID,
        filter: isLine,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 16, 11],
          'line-opacity': 0.9,
        },
      },
      before,
    );
    this.map.addLayer(
      {
        id: 'route-line',
        type: 'line',
        source: SOURCE_ID,
        filter: isLine,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ROUTE_COLOR,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 7],
          'line-opacity': 0.8,
        },
      },
      before,
    );
    this.map.addLayer(
      {
        id: 'route-points',
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', isLine],
        paint: {
          'circle-radius': ['match', ['get', 'kind'], 'waypoint', 5, 7],
          'circle-color': [
            'match',
            ['get', 'kind'],
            'start',
            START_COLOR,
            'end',
            END_COLOR,
            ROUTE_COLOR,
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2.5,
        },
      },
      before,
    );
    this.map.addLayer(
      {
        id: 'route-labels',
        type: 'symbol',
        source: SOURCE_ID,
        // Label the start and named waypoints; the finish is just a red dot.
        filter: ['in', ['get', 'kind'], ['literal', ['start', 'waypoint']]],
        minzoom: 12,
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Medium'],
          'text-size': 13,
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
          'text-optional': true,
        },
        paint: {
          'text-color': ROUTE_COLOR,
          'text-halo-color': '#ffffff',
          'text-halo-width': 2,
        },
      },
      before,
    );
  }
}

function toGeoJson(route: SavedRoute): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = route.lines.map((line) => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: line },
    properties: { kind: 'line' },
  }));

  const first = route.lines[0];
  const last = route.lines.at(-1);
  const point = (coordinates: [number, number], kind: string, label: string | null) =>
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates }, properties: { kind, label } });

  if (last) point(last.at(-1)!, 'end', null);
  if (first) point(first[0], 'start', 'Start');
  for (const w of route.waypoints) point(w.position, 'waypoint', w.name);
  return { type: 'FeatureCollection', features };
}
